import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { ExcelExporter } from "./src/reports/excelExporter.js";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import archiver from "archiver";
import type { StudentData, ExamStatistics } from "@shared/schema";
import { officialGabaritoTemplate } from "@shared/schema";
import { processOMRPage, extractTextRegion, preprocessForOCR } from "./omr";
import { extractTextFromImageDeepSeek, checkOCRService } from "./deepseekOCR.js";
import { callChatGPTVisionOMR } from "./chatgptOMR.js";
import { registerDebugRoutes } from "./debugRoutes.js";

// Configuração do serviço Python OMR
const PYTHON_OMR_SERVICE_URL = process.env.PYTHON_OMR_URL || "http://localhost:5002";
const USE_PYTHON_OMR = process.env.USE_PYTHON_OMR !== "false"; // Ativado por padrão

/**
 * Chama o serviço Python OMR para processar uma imagem
 * @param imageBuffer Buffer da imagem PNG
 * @param pageNumber Número da página
 * @returns Resposta do OMR no formato do serviço Python
 */
async function callPythonOMR(imageBuffer: Buffer, pageNumber: number): Promise<{
  status: string;
  pagina?: {
    pagina: number;
    resultado: {
      questoes: Record<string, string>;
    };
  };
  mensagem?: string;
}> {
  try {
    // Usar axios que tem melhor suporte para multipart/form-data
    const axios = (await import("axios")).default;
    const FormData = (await import("form-data")).default;
    const formData = new FormData();
    
    // Adicionar imagem como buffer
    formData.append("image", imageBuffer, {
      filename: `page_${pageNumber}.png`,
      contentType: "image/png",
    });
    
    // Adicionar número da página como campo de formulário
    formData.append("page", pageNumber.toString());

    console.log(`[Python OMR] Enviando imagem de ${imageBuffer.length} bytes para página ${pageNumber}...`);
    
    // Usar axios que trata form-data corretamente
    const response = await axios.post(
      `${PYTHON_OMR_SERVICE_URL}/api/process-image`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return response.data;
  } catch (error: any) {
    console.error(`[Python OMR] Erro ao chamar serviço:`, error);
    if (error.response) {
      throw new Error(`Serviço Python OMR retornou erro ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Verifica se o serviço Python OMR está disponível
 */
async function checkPythonOMRService(): Promise<boolean> {
  try {
    const response = await fetch(`${PYTHON_OMR_SERVICE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000), // 3 segundos timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Converte resposta do Python OMR para formato interno
 */
function convertPythonOMRToInternal(
  pythonResult: { 
    status: string;
    pagina?: { resultado: { questoes: Record<string, string> } };
    mensagem?: string;
  },
  totalQuestions: number = 90
): { detectedAnswers: (string | null)[]; overallConfidence: number; warnings: string[] } {
  if (!pythonResult.pagina) {
    return {
      detectedAnswers: Array(totalQuestions).fill(null),
      overallConfidence: 0,
      warnings: [pythonResult.mensagem || "Erro ao processar com Python OMR"],
    };
  }
  
  const questoes = pythonResult.pagina.resultado.questoes;
  const detectedAnswers: (string | null)[] = [];
  const warnings: string[] = [];
  let answeredCount = 0;
  
  // DEBUG: Log primeiras 10 questões recebidas do Python
  console.log(`[DEBUG CONVERSION] Total de questões recebidas do Python: ${Object.keys(questoes).length}`);
  const sampleKeys = Object.keys(questoes).slice(0, 10);
  console.log(`[DEBUG CONVERSION] Primeiras 10 questões:`, sampleKeys.map(k => `${k}: "${questoes[k]}"`).join(", "));

  for (let i = 1; i <= totalQuestions; i++) {
    const answer = questoes[String(i)];
    // Normalizar resposta: trim, uppercase, remover espaços
    const normalizedAnswer = answer ? String(answer).trim().toUpperCase() : null;
    
    if (normalizedAnswer && normalizedAnswer !== "NÃO RESPONDEU" && /^[A-E]$/.test(normalizedAnswer)) {
      detectedAnswers.push(normalizedAnswer);
      answeredCount++;
    } else {
      detectedAnswers.push(null);
      if (normalizedAnswer === "NÃO RESPONDEU" || answer === "Não respondeu") {
        warnings.push(`Questão ${i}: Não respondida`);
      } else if (answer && normalizedAnswer && !/^[A-E]$/.test(normalizedAnswer)) {
        // DEBUG: Log respostas inválidas
        if (i <= 10) {
          console.log(`[DEBUG CONVERSION] Questão ${i}: Resposta inválida "${answer}" (normalizada: "${normalizedAnswer}")`);
        }
      }
    }
  }
  
  // DEBUG: Log estatísticas finais
  console.log(`[DEBUG CONVERSION] Respostas válidas detectadas: ${answeredCount}/${totalQuestions}`);

  const overallConfidence = answeredCount > 0 ? Math.min(0.95, 0.5 + (answeredCount / totalQuestions) * 0.45) : 0.3;

  return {
    detectedAnswers,
    overallConfidence,
    warnings: warnings.slice(0, 10), // Limitar warnings
  };
}
import { fileURLToPath } from "url";
import { dirname, join } from "path";
// Módulos organizados
import { TRICalculator } from "./src/calculations/triCalculator.js";
import { TCTCalculator } from "./src/calculations/tctCalculator.js";
import { TRIProcessor } from "./src/processors/triProcessor.js";
import { QuestionStatsProcessor } from "./src/processors/questionStatsProcessor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Job storage for async PDF processing
interface ProcessingJob {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  progress: number;
  currentPage: number;
  totalPages: number;
  students: StudentData[];
  warnings: string[];
  errorMessage?: string;
  createdAt: Date;
}

const jobs = new Map<string, ProcessingJob>();

// Cleanup old jobs after 1 hour
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  Array.from(jobs.entries()).forEach(([id, job]) => {
    if (job.createdAt < oneHourAgo) {
      jobs.delete(id);
    }
  });
}, 60 * 1000);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log(`[UPLOAD] Recebendo arquivo: ${file.originalname}, tipo: ${file.mimetype}`);
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos PDF são aceitos"));
    }
  },
});

const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for CSV
  },
  fileFilter: (req, file, cb) => {
    console.log(`[UPLOAD CSV] Recebendo arquivo: ${file.originalname}, tipo: ${file.mimetype}`);
    const isCSV = file.mimetype === "text/csv" || 
                  file.mimetype === "application/vnd.ms-excel" ||
                  file.originalname.toLowerCase().endsWith(".csv");
    if (isCSV) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos CSV são aceitos"));
    }
  },
});

interface StudentFromCSV {
  nome: string;
  turma: string;
  matricula: string;
}

function parseCSV(buffer: Buffer): StudentFromCSV[] {
  const content = buffer.toString("utf-8");
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error("CSV deve ter pelo menos o cabeçalho e uma linha de dados");
  }
  
  // Detect separator (semicolon or comma)
  const headerLine = lines[0];
  const separator = headerLine.includes(";") ? ";" : ",";
  
  const headers = headerLine.split(separator).map(h => h.trim().toLowerCase().replace(/^\uFEFF/, ""));
  
  // Find column indices
  const nomeIdx = headers.findIndex(h => h.includes("nome"));
  const turmaIdx = headers.findIndex(h => h.includes("turma") || h.includes("classe") || h.includes("sala"));
  const matriculaIdx = headers.findIndex(h => h.includes("matricula") || h.includes("matrícula") || h.includes("inscricao") || h.includes("inscrição") || h.includes("id"));
  
  if (nomeIdx === -1) {
    throw new Error("Coluna 'NOME' não encontrada no CSV");
  }
  
  const students: StudentFromCSV[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(separator).map(v => v.trim());
    
    const nome = values[nomeIdx] || "";
    const turma = turmaIdx !== -1 ? values[turmaIdx] || "" : "";
    const matricula = matriculaIdx !== -1 ? values[matriculaIdx] || "" : "";
    
    if (nome) {
      students.push({ nome, turma, matricula });
    }
  }
  
  return students;
}

interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox?: { x0: number; y0: number; x1: number; y1: number };
  }>;
}

async function extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
  try {
    console.log("[OCR] Usando DeepSeek-OCR para extrair texto...");
    const result = await extractTextFromImageDeepSeek(imageBuffer, "<image>\nFree OCR.");
    
    return {
      text: result.text,
      confidence: result.confidence,
      words: (result.words || []).map(w => ({
        text: w.text,
        confidence: w.confidence,
        bbox: w.bbox,
      })),
    };
  } catch (error) {
    console.error("[OCR] Erro ao processar com DeepSeek-OCR:", error);
    return { text: "", confidence: 0, words: [] };
  }
}

function parseStudentData(ocrResult: OCRResult, pageNumber: number): StudentData[] {
  const students: StudentData[] = [];
  const text = ocrResult.text;
  const lines = text.split("\n").filter((line) => line.trim());
  const overallConfidence = ocrResult.confidence;

  let currentStudent: Partial<StudentData> | null = null;

  for (const line of lines) {
    const numberMatch = line.match(/(?:N[úu]mero|Inscri[çc][ãa]o|Matr[íi]cula)[\s:]*(\d+)/i);
    const nameMatch = line.match(/(?:Nome|Aluno|Candidato)[\s:]*([A-Za-zÀ-ÿ\s]+)/i);
    const answerMatch = line.match(/^[A-E\s,.-]+$/i);
    const numberedAnswerMatch = line.match(/^\d+[\s.)-]+([A-E])/i);
    const multipleAnswersMatch = line.match(/([A-E][\s,.-]*)+/gi);

    if (numberMatch) {
      if (currentStudent && currentStudent.studentNumber) {
        students.push({
          id: randomUUID(),
          studentNumber: currentStudent.studentNumber,
          studentName: currentStudent.studentName || "Não identificado",
          answers: currentStudent.answers || [],
          pageNumber,
          rawText: currentStudent.rawText,
          confidence: overallConfidence,
        });
      }
      currentStudent = {
        studentNumber: numberMatch[1],
        studentName: "",
        answers: [],
        rawText: line,
        confidence: overallConfidence,
      };
    }

    if (nameMatch && currentStudent) {
      currentStudent.studentName = nameMatch[1].trim();
    }

    if (currentStudent) {
      if (numberedAnswerMatch) {
        currentStudent.answers = currentStudent.answers || [];
        currentStudent.answers.push(numberedAnswerMatch[1].toUpperCase());
      } else if (multipleAnswersMatch) {
        const answers = line
          .toUpperCase()
          .split(/[\s,.-]+/)
          .filter((a) => /^[A-E]$/.test(a));
        if (answers.length > 0) {
          currentStudent.answers = currentStudent.answers || [];
          currentStudent.answers.push(...answers);
        }
      }
    }
  }

  if (currentStudent && currentStudent.studentNumber) {
    students.push({
      id: randomUUID(),
      studentNumber: currentStudent.studentNumber,
      studentName: currentStudent.studentName || "Não identificado",
      answers: currentStudent.answers || [],
      pageNumber,
      rawText: currentStudent.rawText,
      confidence: overallConfidence,
    });
  }

  if (students.length === 0) {
    const allAnswers = text
      .toUpperCase()
      .match(/[A-E]/g) || [];
    
    if (allAnswers.length >= 5) {
      students.push({
        id: randomUUID(),
        studentNumber: `P${pageNumber.toString().padStart(3, "0")}`,
        studentName: `Aluno Página ${pageNumber}`,
        answers: allAnswers.slice(0, officialGabaritoTemplate.totalQuestions),
        pageNumber,
        rawText: text.substring(0, 200),
        confidence: overallConfidence,
      });
    }
  }

  return students;
}

// Async PDF processor function
async function processPdfJob(jobId: string, pdfBuffer: Buffer, enableOcr: boolean = false, enableChatGPT: boolean = false) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    console.log(`[JOB ${jobId}] Iniciando processamento... (OCR: ${enableOcr ? 'ativado (DeepSeek-OCR)' : 'desativado'}) | ChatGPT: ${enableChatGPT ? 'ativado' : 'desativado'}`);
    
    const chatgptEnabled = enableChatGPT && !!process.env.OPENAI_API_KEY;
    if (enableChatGPT && !process.env.OPENAI_API_KEY) {
      console.warn(`[JOB ${jobId}] ⚠️  ChatGPT habilitado, mas OPENAI_API_KEY não está definida. Assistente será ignorado.`);
    }
    
    // Verificar se serviço Python OMR está disponível
    let usePythonOMR = USE_PYTHON_OMR;
    if (usePythonOMR) {
      const pythonOMRAvailable = await checkPythonOMRService();
      if (!pythonOMRAvailable) {
        console.warn(`[JOB ${jobId}] ⚠️  Serviço Python OMR não está disponível em ${PYTHON_OMR_SERVICE_URL}`);
        console.warn(`[JOB ${jobId}] Execute: cd python_omr_service && source venv/bin/activate && python app.py`);
        console.warn(`[JOB ${jobId}] Usando OMR TypeScript como fallback...`);
        usePythonOMR = false;
      } else {
        console.log(`[JOB ${jobId}] ✅ Serviço Python OMR disponível e pronto!`);
      }
    }
    
    // Verificar se DeepSeek-OCR está disponível
    if (enableOcr) {
      const ocrAvailable = await checkOCRService();
      if (!ocrAvailable) {
        console.warn(`[JOB ${jobId}] ⚠️  DeepSeek-OCR não está disponível. Verifique se o serviço está rodando na porta 5001.`);
        console.warn(`[JOB ${jobId}] Execute: cd ocr_service && ./start_ocr_service.sh`);
        enableOcr = false; // Desabilitar OCR se serviço não disponível
      } else {
        console.log(`[JOB ${jobId}] ✅ DeepSeek-OCR disponível e pronto!`);
      }
    }
    
    // Carregar PDF (já foi validado no endpoint, mas recarregamos para processar)
    let pdfDoc: PDFDocument;
    let pageCount: number;
    
    try {
      pdfDoc = await PDFDocument.load(pdfBuffer);
      pageCount = pdfDoc.getPageCount();
      
      if (pageCount === 0) {
        throw new Error("PDF não contém páginas ou está corrompido");
      }
      
      // Garantir que totalPages está definido (já deveria estar, mas garantir)
      if (job.totalPages === 0) {
        job.totalPages = pageCount;
      }
      
      job.status = "processing";
      console.log(`[JOB ${jobId}] PDF carregado com ${pageCount} página(s)`);
    } catch (pdfError) {
      console.error(`[JOB ${jobId}] Erro ao carregar PDF:`, pdfError);
      job.status = "error";
      job.errorMessage = pdfError instanceof Error ? pdfError.message : "Erro ao carregar o PDF. Por favor, tente novamente.";
      return;
    }

    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    for (let i = 0; i < pageCount; i++) {
      const pageNumber = i + 1;
      job.currentPage = pageNumber;
      job.progress = Math.round((pageNumber / pageCount) * 100);
      
      console.log(`[JOB ${jobId}] Processando página ${pageNumber}/${pageCount}...`);
      
      try {
        const singlePageDoc = await PDFDocument.create();
        const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i]);
        singlePageDoc.addPage(copiedPage);
        const singlePagePdfBytes = await singlePageDoc.save();

        // Convert PDF to image
        const timestamp = Date.now();
        const tempPdfPath = `/tmp/page_${timestamp}_${pageNumber}.pdf`;
        const tempPngPath = `/tmp/page_${timestamp}_${pageNumber}`;
        await fs.writeFile(tempPdfPath, singlePagePdfBytes);

        try {
          await execAsync(`pdftoppm -png -r 150 -singlefile "${tempPdfPath}" "${tempPngPath}"`);
        } catch {
          const sharpImage = await sharp(Buffer.from(singlePagePdfBytes), { density: 150 }).png().toBuffer();
          await fs.writeFile(`${tempPngPath}.png`, sharpImage);
        }

        const imageBuffer = await fs.readFile(`${tempPngPath}.png`);
        
        // Cleanup temp files
        await fs.unlink(tempPdfPath).catch(() => {});
        await fs.unlink(`${tempPngPath}.png`).catch(() => {});

        // Process OMR - usar Python OMR se disponível, senão usar TypeScript
        let omrResult;
        if (usePythonOMR) {
          try {
            console.log(`[JOB ${jobId}] Chamando serviço Python OMR para página ${pageNumber}...`);
            const pythonResult = await callPythonOMR(imageBuffer, pageNumber);
            
            omrResult = convertPythonOMRToInternal(pythonResult, officialGabaritoTemplate.totalQuestions);
            
            if (pythonResult.status === "sucesso" && pythonResult.pagina) {
              console.log(`[JOB ${jobId}] Página ${pageNumber} (Python OMR): ${omrResult.detectedAnswers.filter(a => a).length} respostas detectadas`);
            } else {
              throw new Error(pythonResult.mensagem || "Erro desconhecido no serviço Python OMR");
            }
          } catch (pythonError) {
            console.error(`[JOB ${jobId}] Erro no Python OMR, usando fallback TypeScript:`, pythonError);
            // Fallback para OMR TypeScript
            omrResult = await processOMRPage(imageBuffer, officialGabaritoTemplate);
            console.log(`[JOB ${jobId}] Página ${pageNumber} (TypeScript OMR fallback): ${omrResult.detectedAnswers.filter(a => a).length} respostas detectadas`);
          }
        } else {
          // Usar OMR TypeScript diretamente
          omrResult = await processOMRPage(imageBuffer, officialGabaritoTemplate);
          console.log(`[JOB ${jobId}] Página ${pageNumber} (TypeScript OMR): ${omrResult.detectedAnswers.filter(a => a).length} respostas detectadas`);
        }

        // ChatGPT vision assist (opcional) - VALIDA E CORRIGE OMR
        let aiAssist: { answers: Array<string | null>; corrections?: any[]; rawText: string; model: string } | null = null;
        let mergedAnswers: Array<string | null> = [...omrResult.detectedAnswers];
        let correctionLog: string[] = [];
        
        if (chatgptEnabled) {
          try {
            // Passar respostas do OMR para o ChatGPT validar e corrigir
            aiAssist = await callChatGPTVisionOMR(
              imageBuffer, 
              officialGabaritoTemplate.totalQuestions,
              omrResult.detectedAnswers
            );
            
            console.log(`[JOB ${jobId}] ChatGPT (${aiAssist.model}) analisou e corrigiu.`);
            
            // Aplicar correções do ChatGPT
            if (aiAssist.answers.length === mergedAnswers.length) {
              let corrected = 0;
              mergedAnswers = aiAssist.answers.map((aiAns, idx) => {
                const omrAns = omrResult.detectedAnswers[idx];
                // Se ChatGPT discorda do OMR, usar a correção do ChatGPT
                if (aiAns !== omrAns) {
                  corrected++;
                  const logEntry = `Q${idx + 1}: OMR="${omrAns || 'vazio'}" → ChatGPT="${aiAns || 'vazio'}"`;
                  correctionLog.push(logEntry);
                  console.log(`[JOB ${jobId}] ${logEntry}`);
                }
                return aiAns; // Usar sempre a resposta do ChatGPT (validada/corrigida)
              });
              
              if (corrected > 0) {
                console.log(`[JOB ${jobId}] ChatGPT corrigiu ${corrected} respostas do OMR.`);
              } else {
                console.log(`[JOB ${jobId}] ChatGPT confirmou todas as ${mergedAnswers.filter(a => a).length} respostas do OMR.`);
              }
              
              if (aiAssist.corrections && aiAssist.corrections.length > 0) {
                console.log(`[JOB ${jobId}] Detalhes das correções:`, JSON.stringify(aiAssist.corrections, null, 2));
              }
            }
          } catch (aiError) {
            console.warn(`[JOB ${jobId}] ChatGPT validação falhou, mantendo OMR original:`, aiError);
          }
        }

        // Extract text fields using DeepSeek-OCR
        let studentName = `Aluno ${pageNumber}`;
        let studentNumber = `P${pageNumber.toString().padStart(3, "0")}`;
        
        if (enableOcr) {
          try {
            const nameField = officialGabaritoTemplate.textFields.find(f => f.name === "nomeCompleto");
            const numberField = officialGabaritoTemplate.textFields.find(f => f.name === "numero");
            
            // Prepare both regions in parallel
            const [nameRegion, numberRegion] = await Promise.all([
              nameField ? extractTextRegion(imageBuffer, nameField.region).then(preprocessForOCR) : null,
              numberField ? extractTextRegion(imageBuffer, numberField.region).then(preprocessForOCR) : null,
            ]);
            
            // Run DeepSeek-OCR on both regions
            const ocrPromises: Promise<OCRResult>[] = [];
            if (nameRegion) {
              ocrPromises.push(extractTextFromImageDeepSeek(nameRegion, "<image>\nExtract the student name clearly."));
            }
            if (numberRegion) {
              ocrPromises.push(extractTextFromImageDeepSeek(numberRegion, "<image>\nExtract the student number or ID clearly."));
            }
            
            const ocrResults = await Promise.all(ocrPromises);
            
            // Extract name (first result if nameRegion was processed)
            if (nameRegion && ocrResults.length > 0) {
              const rawName = ocrResults[0].text.trim().replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim();
              // Validate: must be 3+ chars, have at least one word with 2+ letters, not be form text
              const words = rawName.split(/\s+/).filter(w => w.length >= 2);
              const isValidName = rawName.length >= 3 && 
                                  words.length >= 1 && 
                                  !rawName.toLowerCase().includes('resposta') &&
                                  !rawName.toLowerCase().includes('exame') &&
                                  !rawName.toLowerCase().includes('simulado') &&
                                  !rawName.toLowerCase().includes('nacional') &&
                                  !rawName.toLowerCase().includes('unidade');
              if (isValidName) {
                studentName = rawName.substring(0, 100);
                console.log(`[JOB ${jobId}] Nome (DeepSeek-OCR): "${studentName}" (confiança: ${(ocrResults[0].confidence * 100).toFixed(1)}%)`);
              }
            }
            
            // Extract number (second result if both were processed, or first if only number)
            const numIdx = nameRegion ? 1 : 0;
            if (numberRegion && ocrResults.length > numIdx) {
              const extractedNumber = ocrResults[numIdx].text.trim().replace(/\D/g, '');
              if (extractedNumber.length >= 1) {
                studentNumber = extractedNumber.substring(0, 20);
                console.log(`[JOB ${jobId}] Número (DeepSeek-OCR): "${studentNumber}" (confiança: ${(ocrResults[numIdx].confidence * 100).toFixed(1)}%)`);
              }
            }
          } catch (ocrError) {
            console.log(`[JOB ${jobId}] OCR (DeepSeek): erro, usando valores padrão:`, ocrError);
          }
        }

        const finalAnswers = mergedAnswers.map(ans => (ans ?? ""));

        const student: StudentData = {
          id: randomUUID(),
          studentNumber,
          studentName,
          answers: finalAnswers,
          aiAnswers: aiAssist?.answers.map(a => (a ?? "")),
          aiModel: aiAssist?.model,
          aiRaw: aiAssist?.rawText,
          pageNumber,
          confidence: Math.round(omrResult.overallConfidence * 100),
          rawText: correctionLog.length > 0 
            ? `Correções ChatGPT: ${correctionLog.join("; ")}` 
            : (omrResult.warnings.length > 0 ? omrResult.warnings.join("; ") : undefined),
        };

        job.students.push(student);
        if (omrResult.warnings.length > 0) {
          job.warnings.push(...omrResult.warnings.slice(0, 5));
        }
      } catch (pageError) {
        console.error(`[JOB ${jobId}] Erro página ${pageNumber}:`, pageError);
        job.warnings.push(`Erro na página ${pageNumber}`);
      }
    }

    job.status = "completed";
    job.progress = 100;
    console.log(`[JOB ${jobId}] Concluído! ${job.students.length} alunos processados.`);
  } catch (error) {
    console.error(`[JOB ${jobId}] Erro:`, error);
    job.status = "error";
    job.errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
  } finally {
    // DeepSeek-OCR não precisa de cleanup (é um serviço externo)
    console.log(`[JOB ${jobId}] Processamento finalizado`);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Registrar rotas de debug
  registerDebugRoutes(app);
  
  // Start PDF processing - returns jobId immediately
  app.post("/api/process-pdf", upload.single("pdf"), async (req: Request, res: Response) => {
    try {
      console.log("[PDF] Recebendo upload...");
      
      if (!req.file) {
        res.status(400).json({ error: "Nenhum arquivo enviado" });
        return;
      }

      console.log(`[PDF] Arquivo: ${req.file.originalname}, ${(req.file.size / 1024 / 1024).toFixed(2)}MB`);

      // Check if OCR is enabled (from form field)
      const enableOcr = req.body?.enableOcr === 'true' || req.body?.enableOcr === true;
      // Optional ChatGPT vision assist
      const enableChatGPT = req.body?.enableChatGPT === 'true' || req.body?.enableChatGPT === true;

      // Create job
      const jobId = randomUUID();
      
      // Tentar carregar PDF para obter pageCount imediatamente
      let initialPageCount = 0;
      try {
        const pdfDoc = await PDFDocument.load(req.file.buffer);
        initialPageCount = pdfDoc.getPageCount();
        if (initialPageCount === 0) {
          res.status(400).json({ error: "PDF não contém páginas ou está corrompido" });
          return;
        }
      } catch (pdfError) {
        console.error("[PDF] Erro ao carregar PDF:", pdfError);
        res.status(400).json({ 
          error: pdfError instanceof Error ? pdfError.message : "Erro ao carregar o PDF. Por favor, tente novamente." 
        });
        return;
      }
      
      const job: ProcessingJob = {
        id: jobId,
        status: "queued",
        progress: 0,
        currentPage: 0,
        totalPages: initialPageCount,
        students: [],
        warnings: [],
        createdAt: new Date(),
      };
      jobs.set(jobId, job);

      // Start processing in background
      const pdfBuffer = req.file.buffer;
      setImmediate(() => processPdfJob(jobId, pdfBuffer, enableOcr, enableChatGPT));

      // Return immediately
      res.json({ jobId, message: "Processamento iniciado" });
    } catch (error) {
      console.error("Upload Error:", error);
      res.status(500).json({ error: "Erro ao iniciar processamento" });
    }
  });

  // Get job status for polling
  app.get("/api/process-pdf/:jobId/status", (req: Request, res: Response) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      res.status(404).json({ error: "Job não encontrado" });
      return;
    }

    res.json({
      status: job.status,
      progress: job.progress,
      currentPage: job.currentPage,
      totalPages: job.totalPages,
      studentCount: job.students.length,
      errorMessage: job.errorMessage,
    });
  });

  // Get job results
  app.get("/api/process-pdf/:jobId/results", (req: Request, res: Response) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      res.status(404).json({ error: "Job não encontrado" });
      return;
    }

    res.json({
      status: job.status,
      students: job.students,
      totalPages: job.totalPages,
      warnings: job.warnings,
    });
  });

  app.post("/api/export-excel", async (req: Request, res: Response) => {
    try {
      const { students, answerKey, questionContents, statistics, includeTRI, triScores, triScoresByArea } = req.body as {
        students: StudentData[];
        answerKey?: string[];
        questionContents?: Array<{ questionNumber: number; answer: string; content: string }>;
        statistics?: ExamStatistics;
        includeTRI?: boolean;
        triScores?: Record<string, number>; // Convertido de Map para objeto
        triScoresByArea?: Record<string, Record<string, number>>; // Convertido de Map para objeto
      };

      if (!students || !Array.isArray(students)) {
        res.status(400).json({ error: "Nenhum dado de aluno fornecido" });
        return;
      }

      // Converter objetos de volta para Maps se necessário
      const triScoresMap = triScores ? new Map(Object.entries(triScores)) : undefined;
      const triScoresByAreaMap = triScoresByArea ? new Map(Object.entries(triScoresByArea)) : undefined;

      // Usar ExcelExporter com formatação rica
      const excelBuffer = await ExcelExporter.generateExcel({
        students,
        answerKey,
        questionContents,
        statistics,
        includeTRI,
        triScores: triScoresMap,
        triScoresByArea: triScoresByAreaMap,
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="gabarito_enem_${new Date().toISOString().split("T")[0]}.xlsx"`
      );
      res.send(excelBuffer);
    } catch (error) {
      console.error("Excel Export Error:", error);
      res.status(500).json({
        error: "Erro ao exportar Excel",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  });

  // Store for generated PDF files (in-memory for now)
  const generatedPdfs = new Map<string, { files: { name: string; data: Buffer }[]; createdAt: number }>();
  
  // Cleanup old generated PDFs (older than 30 minutes)
  setInterval(() => {
    const now = Date.now();
    Array.from(generatedPdfs.entries()).forEach(([id, entry]) => {
      if (now - entry.createdAt > 30 * 60 * 1000) {
        generatedPdfs.delete(id);
        console.log(`[GENERATE-PDF] Cleaned up old PDF batch: ${id}`);
      }
    });
  }, 5 * 60 * 1000);

  // Generate personalized PDFs from CSV
  // For large files (>50 students), generates multiple smaller PDFs with download links
  app.post("/api/generate-pdfs", uploadCsv.single("csv"), async (req: Request, res: Response) => {
    try {
      console.log("[GENERATE-PDF] Iniciando geração de PDFs personalizados...");
      const startTime = Date.now();
      
      if (!req.file) {
        return res.status(400).json({ error: "Arquivo CSV não enviado" });
      }
      
      // Parse CSV
      const students = parseCSV(req.file.buffer);
      console.log(`[GENERATE-PDF] ${students.length} alunos encontrados no CSV`);
      
      if (students.length === 0) {
        return res.status(400).json({ error: "Nenhum aluno encontrado no CSV" });
      }
      
      // Load template PDF (updated version without "RESULTADO FINAL" label)
      const templatePath = path.join(process.cwd(), "attached_assets", "template_gabarito_v2.pdf");
      let templateBytes: Buffer;
      
      try {
        templateBytes = await fs.readFile(templatePath);
      } catch (err) {
        console.error("[GENERATE-PDF] Erro ao carregar template:", err);
        return res.status(500).json({ error: "Template de gabarito não encontrado" });
      }
      
      // Load libraries once
      const { StandardFonts, rgb } = await import("pdf-lib");
      
      // Load template once and get dimensions
      const templatePdf = await PDFDocument.load(templateBytes);
      const templatePage = templatePdf.getPage(0);
      const pageWidth = templatePage.getWidth();
      const pageHeight = templatePage.getHeight();
      
      // Pre-calculate coordinates (same for all pages)
      // Nome completo: centered in the name field squares
      const nomeX = 0.025 * pageWidth + 8;
      const nomeY = pageHeight - (0.145 * pageHeight) - 20; // Middle of name squares
      // Turma e Matrícula: centered in RESULTADO FINAL box area
      const turmaX = 0.695 * pageWidth + 10;
      const turmaY = pageHeight - (0.145 * pageHeight) - 20; // Middle of RESULTADO FINAL box
      const matriculaX = 0.800 * pageWidth + 10;
      const matriculaY = pageHeight - (0.145 * pageHeight) - 20; // Same level
      
      // For large batches, limit pages per PDF to avoid memory issues
      const maxPagesPerPdf = 50;
      const totalPdfs = Math.ceil(students.length / maxPagesPerPdf);
      
      // Always save PDF to server and return download URL (works in Replit sandbox)
      console.log(`[GENERATE-PDF] Gerando ${totalPdfs} arquivo(s) PDF`);
      
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const files: { name: string; data: Buffer }[] = [];
      
      // Generate single PDF
      if (totalPdfs === 1) {
        const outputPdf = await PDFDocument.create();
        const font = await outputPdf.embedFont(StandardFonts.Helvetica);
        const fontBold = await outputPdf.embedFont(StandardFonts.HelveticaBold);
        const textColor = rgb(0, 0, 0.5);
        
        for (const student of students) {
          const [copiedPage] = await outputPdf.copyPages(templatePdf, [0]);
          outputPdf.addPage(copiedPage);
          
          copiedPage.drawText(student.nome.toUpperCase(), {
            x: nomeX, y: nomeY, size: 11, font: fontBold, color: textColor,
          });
          
          if (student.turma) {
            copiedPage.drawText(student.turma, {
              x: turmaX, y: turmaY, size: 10, font: font, color: textColor,
            });
          }
          
          if (student.matricula) {
            copiedPage.drawText(student.matricula, {
              x: matriculaX, y: matriculaY, size: 10, font: font, color: textColor,
            });
          }
        }
        
        const pdfBytes = await outputPdf.save();
        const fileName = `gabaritos_personalizados_${new Date().toISOString().split("T")[0]}.pdf`;
        files.push({ name: fileName, data: Buffer.from(pdfBytes) });
        
        // Store and return URL
        generatedPdfs.set(batchId, { files, createdAt: Date.now() });
        
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[GENERATE-PDF] PDF gerado com ${students.length} páginas em ${elapsedTime}s`);
        
        return res.json({
          success: true,
          message: `${students.length} gabaritos gerados`,
          batchId,
          files: [{
            name: fileName,
            downloadUrl: `/api/download-pdf/${batchId}/0`,
            pages: students.length
          }],
          totalStudents: students.length,
          elapsedTime: parseFloat(elapsedTime),
        });
      }
      
      // For multiple PDFs, generate all and return links
      console.log(`[GENERATE-PDF] Gerando ${totalPdfs} arquivos PDF (máximo ${maxPagesPerPdf} páginas cada)`);
      
      for (let pdfIndex = 0; pdfIndex < totalPdfs; pdfIndex++) {
        const startIdx = pdfIndex * maxPagesPerPdf;
        const endIdx = Math.min(startIdx + maxPagesPerPdf, students.length);
        const batchStudents = students.slice(startIdx, endIdx);
        
        console.log(`[GENERATE-PDF] Gerando PDF ${pdfIndex + 1}/${totalPdfs} (alunos ${startIdx + 1}-${endIdx})`);
        
        const outputPdf = await PDFDocument.create();
        const font = await outputPdf.embedFont(StandardFonts.Helvetica);
        const fontBold = await outputPdf.embedFont(StandardFonts.HelveticaBold);
        const textColor = rgb(0, 0, 0.5);
        
        for (const student of batchStudents) {
          const [copiedPage] = await outputPdf.copyPages(templatePdf, [0]);
          outputPdf.addPage(copiedPage);
          
          copiedPage.drawText(student.nome.toUpperCase(), {
            x: nomeX, y: nomeY, size: 11, font: fontBold, color: textColor,
          });
          
          if (student.turma) {
            copiedPage.drawText(student.turma, {
              x: turmaX, y: turmaY, size: 10, font: font, color: textColor,
            });
          }
          
          if (student.matricula) {
            copiedPage.drawText(student.matricula, {
              x: matriculaX, y: matriculaY, size: 10, font: font, color: textColor,
            });
          }
        }
        
        const pdfBytes = await outputPdf.save();
        const fileName = `gabaritos_parte_${(pdfIndex + 1).toString().padStart(2, "0")}_de_${totalPdfs.toString().padStart(2, "0")}.pdf`;
        files.push({ name: fileName, data: Buffer.from(pdfBytes) });
      }
      
      // Store the files for download
      generatedPdfs.set(batchId, { files, createdAt: Date.now() });
      
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[GENERATE-PDF] ${totalPdfs} PDFs gerados (${students.length} páginas total) em ${elapsedTime}s`);
      
      // Return JSON with download links
      res.json({
        success: true,
        message: `${students.length} gabaritos gerados em ${totalPdfs} arquivos`,
        batchId,
        files: files.map((f, idx) => ({
          name: f.name,
          downloadUrl: `/api/download-pdf/${batchId}/${idx}`,
          pages: idx === files.length - 1 
            ? students.length - (idx * maxPagesPerPdf) 
            : maxPagesPerPdf
        })),
        totalStudents: students.length,
        elapsedTime: parseFloat(elapsedTime),
      });
      
    } catch (error) {
      console.error("[GENERATE-PDF] Erro:", error);
      res.status(500).json({
        error: "Erro ao gerar PDFs",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  });
  
  // Download individual PDF file
  app.get("/api/download-pdf/:batchId/:fileIndex", (req: Request, res: Response) => {
    const { batchId, fileIndex } = req.params;
    const idx = parseInt(fileIndex, 10);
    
    const batch = generatedPdfs.get(batchId);
    if (!batch) {
      return res.status(404).json({ error: "Lote não encontrado ou expirado" });
    }
    
    if (isNaN(idx) || idx < 0 || idx >= batch.files.length) {
      return res.status(404).json({ error: "Arquivo não encontrado" });
    }
    
    const file = batch.files[idx];
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
    res.setHeader("Content-Length", file.data.length.toString());
    res.send(file.data);
  });
  
  // Save temporary PDF for download (workaround for Replit sandbox)
  app.post("/api/save-temp-pdf", upload.single("pdf"), (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo não enviado" });
    }
    
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fileName = req.file.originalname || "gabaritos.pdf";
    
    generatedPdfs.set(tempId, { 
      files: [{ name: fileName, data: req.file.buffer }], 
      createdAt: Date.now() 
    });
    
    res.json({
      success: true,
      downloadUrl: `/api/download-pdf/${tempId}/0`,
    });
  });

  // Preview CSV data (for validation before generating PDFs)
  app.post("/api/preview-csv", uploadCsv.single("csv"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Arquivo CSV não enviado" });
      }
      
      const students = parseCSV(req.file.buffer);
      
      res.json({
        success: true,
        totalStudents: students.length,
        preview: students.slice(0, 10), // First 10 students for preview
        columns: {
          hasNome: true,
          hasTurma: students.some(s => s.turma),
          hasMatricula: students.some(s => s.matricula),
        },
      });
    } catch (error) {
      console.error("[PREVIEW-CSV] Erro:", error);
      res.status(400).json({
        error: "Erro ao processar CSV",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  });

  // Download project as ZIP
  app.get("/api/download-project-zip", async (req: Request, res: Response) => {
    try {
      console.log("[DOWNLOAD-ZIP] Iniciando criação do ZIP do projeto...");
      
      const projectRoot = process.cwd();
      const zipFileName = `gabaritosxtri_${new Date().toISOString().split("T")[0]}.zip`;
      
      // Set headers for file download
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${zipFileName}"`
      );
      
      // Create archiver
      const archive = archiver("zip", {
        zlib: { level: 9 }, // Maximum compression
      });
      
      // Pipe archive data to response
      archive.pipe(res);
      
      // Files and directories to include
      const includePaths = [
        "client",
        "server",
        "shared",
        "script",
        "attached_assets",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "vite.config.ts",
        "tailwind.config.ts",
        "drizzle.config.ts",
        "postcss.config.js",
        "components.json",
        "README.md",
        "design_guidelines.md",
        "replit.md",
        ".gitignore",
      ];
      
      // Files and directories to exclude
      const excludePatterns = [
        "node_modules",
        ".git",
        "dist",
        ".DS_Store",
        "*.log",
        ".local",
        "*.zip",
      ];
      
      // Helper function to check if path should be excluded
      const shouldExclude = (filePath: string): boolean => {
        return excludePatterns.some((pattern) => {
          if (pattern.includes("*")) {
            const regex = new RegExp(pattern.replace("*", ".*"));
            return regex.test(filePath);
          }
          return filePath.includes(pattern);
        });
      };
      
      // Helper function to add directory recursively
      const addDirectory = async (dirPath: string, zipPath: string) => {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.relative(projectRoot, fullPath);
            const zipEntryPath = path.join(zipPath, entry.name);
            
            // Skip excluded paths
            if (shouldExclude(relativePath)) {
              continue;
            }
            
            if (entry.isDirectory()) {
              await addDirectory(fullPath, zipEntryPath);
            } else if (entry.isFile()) {
              archive.file(fullPath, { name: zipEntryPath });
            }
          }
        } catch (error) {
          console.warn(`[DOWNLOAD-ZIP] Erro ao adicionar diretório ${dirPath}:`, error);
        }
      };
      
      // Add files and directories
      for (const includePath of includePaths) {
        const fullPath = path.join(projectRoot, includePath);
        
        try {
          const stat = await fs.stat(fullPath);
          
          if (stat.isDirectory()) {
            await addDirectory(fullPath, includePath);
          } else if (stat.isFile()) {
            archive.file(fullPath, { name: includePath });
          }
        } catch (error) {
          console.warn(`[DOWNLOAD-ZIP] Arquivo/diretório não encontrado: ${includePath}`);
        }
      }
      
      // Finalize the archive
      await archive.finalize();
      
      console.log(`[DOWNLOAD-ZIP] ZIP criado com sucesso: ${zipFileName}`);
    } catch (error) {
      console.error("[DOWNLOAD-ZIP] Erro ao criar ZIP:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Erro ao criar arquivo ZIP",
          details: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }
  });

  app.get("/api/health", (req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Debug endpoint: Visualizar onde as bolhas estão sendo procuradas
  app.post("/api/debug-omr-overlay", upload.single("image"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Nenhuma imagem enviada" });
        return;
      }

      const imageBuffer = req.file.buffer;
      const { createDebugImage } = await import("./omr.js");
      const { officialGabaritoTemplate } = await import("@shared/schema");
      
      // Processar OMR para obter resultados
      const { processOMRPage } = await import("./omr.js");
      const omrResult = await processOMRPage(imageBuffer, officialGabaritoTemplate);
      
      // Criar imagem de debug com overlay
      const debugImage = await createDebugImage(imageBuffer, omrResult, officialGabaritoTemplate);
      
      res.setHeader("Content-Type", "image/png");
      res.send(debugImage);
    } catch (error) {
      console.error("[DEBUG-OMR] Erro:", error);
      res.status(500).json({ 
        error: "Erro ao gerar overlay de debug",
        details: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  });

  // Endpoint to get TRI estimate with coherence (Two-Pass Algorithm)
  app.post("/api/calculate-tri", async (req: Request, res: Response) => {
    try {
      const { students, area, ano, questionStats, answerKey, startQuestion, endQuestion } = req.body as {
        students: StudentData[];
        area: string; // CH, CN, MT, LC, etc
        ano: number; // Ano da prova
        questionStats?: Array<{ questionNumber: number; correctPercentage: number }>; // Estatísticas das questões (opcional, será calculado se não fornecido)
        answerKey?: string[]; // Gabarito para verificar acertos
        startQuestion?: number; // Questão inicial (1-indexed, para áreas específicas)
        endQuestion?: number; // Questão final (1-indexed, para áreas específicas)
      };

      if (!students || !Array.isArray(students) || students.length === 0) {
        res.status(400).json({ error: "Lista de alunos vazia" });
        return;
      }

      if (!area || !ano) {
        res.status(400).json({ error: "Área e ano são obrigatórios" });
        return;
      }

      if (!answerKey || answerKey.length === 0) {
        res.status(400).json({ error: "Gabarito não fornecido" });
        return;
      }

      // Two-Pass Algorithm:
      // PASSO 1: Se questionStats não foi fornecido, calcular estatísticas da prova
      let finalQuestionStats = questionStats;
      if (!finalQuestionStats || finalQuestionStats.length === 0) {
        console.log("[TRI BACKEND] PASSO 1: Calculando estatísticas da prova...");
        
        const start = startQuestion || 1;
        const end = endQuestion || answerKey.length;
        
        finalQuestionStats = QuestionStatsProcessor.calculateQuestionStats(
          students,
          answerKey,
          start,
          end
        );

        // Se foi especificado um range, ajustar questionNumber para ser relativo
        if (startQuestion && endQuestion) {
          finalQuestionStats = finalQuestionStats.map(stat => ({
            questionNumber: stat.questionNumber - startQuestion + 1,
            correctPercentage: stat.correctPercentage,
          }));
        }
      }

      // PASSO 2: Calcular TRI individual usando as estatísticas
      console.log("[TRI BACKEND] PASSO 2: Calculando TRI individual para cada aluno...");
      
      // Se foi especificado um range, usar apenas as respostas e gabarito daquela área
      let studentsForCalculation = students;
      let answerKeyForCalculation = answerKey;
      
      if (startQuestion && endQuestion) {
        studentsForCalculation = students.map(student => ({
          ...student,
          answers: student.answers.slice(startQuestion - 1, endQuestion),
        }));
        answerKeyForCalculation = answerKey.slice(startQuestion - 1, endQuestion);
      }

      const { results, usarCoerencia } = await TRICalculator.calculate(
        studentsForCalculation,
        area,
        ano,
        finalQuestionStats,
        answerKeyForCalculation
      );

      // Ajustar studentId para corresponder aos IDs originais
      const adjustedResults = results.map((result, index) => ({
        ...result,
        studentId: students[index].id,
      }));

      const validResults = adjustedResults.filter(r => r.triScore !== null && r.triScore !== undefined);
      console.log(`[TRI BACKEND] Resultados finais: ${validResults.length} válidos de ${adjustedResults.length} total`);
      if (validResults.length === 0) {
        console.error(`[TRI BACKEND] NENHUM RESULTADO VÁLIDO! Verifique se o CSV tem dados para área ${area}`);
      }
      
      res.json({ results: adjustedResults, usarCoerencia });
    } catch (error) {
      console.error("[TRI BACKEND] Erro ao calcular TRI:", error);
      res.status(500).json({
        error: "Erro ao calcular notas TRI",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  });

  return httpServer;
}
