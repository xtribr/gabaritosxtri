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
import { gerarAnaliseDetalhada } from "./conteudosLoader.js";

// Configuração dos serviços Python
const PYTHON_OMR_SERVICE_URL = process.env.PYTHON_OMR_URL || "http://localhost:5002";
const PYTHON_TRI_SERVICE_URL = process.env.PYTHON_TRI_URL || "http://localhost:5003";
const USE_PYTHON_OMR = process.env.USE_PYTHON_OMR !== "false"; // Ativado por padrão
const USE_PYTHON_TRI = process.env.USE_PYTHON_TRI !== "false"; // Ativado por padrão

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
        timeout: 15000, // 15 segundos timeout (aumentado para PDFs grandes)
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
 * Verifica se o serviço Python TRI V2 está disponível
 */
async function checkPythonTRIService(): Promise<boolean> {
  try {
    const response = await fetch(`${PYTHON_TRI_SERVICE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000), // 3 segundos timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Chama o serviço Python TRI V2 para calcular TRI com coerência pedagógica
 */
async function callPythonTRI(
  alunos: Array<Record<string, any>>,
  gabarito: Record<string, string>,
  areasConfig?: Record<string, [number, number]>
): Promise<{
  status: string;
  total_alunos?: number;
  prova_analysis?: any;
  resultados?: Array<any>;
  mensagem?: string;
}> {
  try {
    const axios = (await import("axios")).default;
    
    const response = await axios.post(
      `${PYTHON_TRI_SERVICE_URL}/api/calcular-tri`,
      {
        alunos,
        gabarito,
        areas_config: areasConfig || {
          'LC': [1, 45],
          'CH': [46, 90],
          'CN': [1, 45],
          'MT': [46, 90]
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000, // 30s timeout
      }
    );
    
    return response.data;
  } catch (error: any) {
    console.error("[TRI SERVICE] Erro ao chamar serviço Python TRI:", error.message);
    return {
      status: "erro",
      mensagem: error.response?.data?.mensagem || error.message
    };
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

    // Processar páginas em paralelo (máximo 3 por vez para não sobrecarregar)
    const PARALLEL_PAGES = 3;
    const processPage = async (pageIndex: number) => {
      const pageNumber = pageIndex + 1;
      
      try {
        const singlePageDoc = await PDFDocument.create();
        const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [pageIndex]);
        singlePageDoc.addPage(copiedPage);
        const singlePagePdfBytes = await singlePageDoc.save();

        // Convert PDF to image
        // Usar timestamp + pageNumber + jobId para evitar conflitos em processamento paralelo
        const timestamp = Date.now();
        const uniqueId = `${jobId.slice(0, 8)}_${pageNumber}_${timestamp}`;
        const tempPdfPath = `/tmp/page_${uniqueId}.pdf`;
        const tempPngPath = `/tmp/page_${uniqueId}`;
        await fs.writeFile(tempPdfPath, singlePagePdfBytes);

        try {
          // DPI reduzido para 120 para melhor performance (ainda mantém qualidade suficiente)
          await execAsync(`pdftoppm -png -r 120 -singlefile "${tempPdfPath}" "${tempPngPath}"`);
        } catch {
          // Fallback: usar sharp com DPI reduzido
          const sharpImage = await sharp(Buffer.from(singlePagePdfBytes), { density: 120 }).png().toBuffer();
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

        return { student, warnings: omrResult.warnings.slice(0, 5) };
      } catch (pageError) {
        console.error(`[JOB ${jobId}] Erro página ${pageNumber}:`, pageError);
        return { student: null, warnings: [`Erro na página ${pageNumber}`] };
      }
    };

    // Processar páginas em lotes paralelos
    for (let batchStart = 0; batchStart < pageCount; batchStart += PARALLEL_PAGES) {
      const batchEnd = Math.min(batchStart + PARALLEL_PAGES, pageCount);
      const batch = Array.from({ length: batchEnd - batchStart }, (_, i) => batchStart + i);
      
      // Atualizar progresso do lote
      job.currentPage = batchEnd;
      job.progress = Math.round((batchEnd / pageCount) * 100);
      
      console.log(`[JOB ${jobId}] Processando páginas ${batchStart + 1}-${batchEnd}/${pageCount} em paralelo...`);
      
      // Processar lote em paralelo
      const results = await Promise.all(batch.map(processPage));
      
      // Adicionar resultados ao job
      for (const result of results) {
        if (result.student) {
          job.students.push(result.student);
        }
        if (result.warnings.length > 0) {
          job.warnings.push(...result.warnings);
        }
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

  // Endpoint TRI V2 - Status/Info (GET)
  app.get("/api/calculate-tri-v2", async (req: Request, res: Response) => {
    try {
      const triAvailable = await checkPythonTRIService();
      res.json({
        endpoint: "POST /api/calculate-tri-v2",
        description: "Cálculo TRI V2 com Coerência Pedagógica",
        service_status: triAvailable ? "online" : "offline",
        service_url: PYTHON_TRI_SERVICE_URL,
        version: "2.0.0",
        algorithm: "Coerência Pedagógica com Análise Estatística",
        usage: {
          method: "POST",
          body: {
            alunos: "[{nome: string, q1: string, q2: string, ...}]",
            gabarito: "{1: 'A', 2: 'B', ...}",
            areas_config: "{CH: [1, 45], CN: [46, 90], ...} (opcional)"
          },
          example: `curl -X POST ${PYTHON_TRI_SERVICE_URL}/api/calcular-tri -H "Content-Type: application/json" -d '{"alunos": [...], "gabarito": {...}}'`
        },
        features: [
          "Análise de coerência pedagógica",
          "Detecção de padrão inverso (acerta difíceis, erra fáceis)",
          "Ajustes por concordância prova-aluno",
          "Penalidades por inconsistência (-60 pts)",
          "Range TRI: 300-900 pontos"
        ]
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Endpoint TRI V2 - Coerência Pedagógica (Python Service)
  app.post("/api/calculate-tri-v2", async (req: Request, res: Response) => {
    try {
      const { alunos, gabarito, areas_config } = req.body;

      // Validar entrada
      if (!alunos || !Array.isArray(alunos) || alunos.length === 0) {
        res.status(400).json({ error: "Lista de alunos vazia ou inválida" });
        return;
      }

      if (!gabarito || typeof gabarito !== 'object') {
        res.status(400).json({ error: "Gabarito não fornecido ou inválido" });
        return;
      }

      // Verificar se serviço Python TRI está online
      const triAvailable = await checkPythonTRIService();
      if (!triAvailable) {
        res.status(503).json({ 
          error: "Serviço TRI offline",
          details: `O serviço Python TRI não está respondendo em ${PYTHON_TRI_SERVICE_URL}`
        });
        return;
      }

      // Chamar serviço Python TRI V2
      console.log(`[TRI V2] Chamando serviço Python com ${alunos.length} alunos...`);
      const resultado = await callPythonTRI(alunos, gabarito, areas_config);

      console.log(`[TRI V2] Sucesso: ${resultado.total_alunos} alunos processados`);
      res.json(resultado);

    } catch (error: any) {
      console.error("[TRI V2] Erro ao calcular TRI V2:", error);
      res.status(500).json({
        error: "Erro ao calcular TRI V2",
        details: error.message || "Erro desconhecido",
        stack: error.stack
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

  // Análise pedagógica com IA
  app.post("/api/analyze-performance", async (req: Request, res: Response) => {
    try {
      const { students, triScores, triScoresByArea } = req.body;

      if (!students || !triScores) {
        res.status(400).json({ error: "Dados incompletos" });
        return;
      }

      // Calcular estatísticas básicas
      const triValues = Object.values(triScores) as number[];
      const avgTRI = triValues.reduce((a, b) => a + b, 0) / triValues.length;
      
      // Agrupar alunos por desempenho
      const grupos = {
        reforco: triValues.filter(t => t < 400).length,
        direcionado: triValues.filter(t => t >= 400 && t < 550).length,
        aprofundamento: triValues.filter(t => t >= 550).length,
      };

      // Análise por área
      const areaAnalysis: Record<string, any> = {};
      if (triScoresByArea) {
        const areas = ['LC', 'CH', 'CN', 'MT'];
        const areaNames: Record<string, string> = {
          'LC': 'Linguagens e Códigos',
          'CH': 'Ciências Humanas',
          'CN': 'Ciências da Natureza',
          'MT': 'Matemática'
        };

        for (const area of areas) {
          const scoresForArea = Object.values(triScoresByArea)
            .map((scores: any) => scores[area])
            .filter((score): score is number => typeof score === 'number' && score > 0);
          
          if (scoresForArea.length > 0) {
            const areaAvg = scoresForArea.reduce((a, b) => a + b, 0) / scoresForArea.length;
            const diff = areaAvg - avgTRI;
            areaAnalysis[area] = {
              name: areaNames[area],
              average: Math.round(areaAvg),
              diff: Math.round(diff),
              status: diff < -20 ? 'critical' : diff < 0 ? 'warning' : 'good',
              count: scoresForArea.length
            };
          }
        }
      }

      // Identificar alunos por faixa de desempenho para análise detalhada
      const studentsByPerformance = students.map((s: any) => ({
        name: s.studentName || s.studentNumber,
        tri: triScores[s.id],
        areas: triScoresByArea?.[s.id] || {}
      })).sort((a, b) => (a.tri || 0) - (b.tri || 0));

      const top3 = studentsByPerformance.slice(-3).reverse();
      const bottom3 = studentsByPerformance.slice(0, 3);

      // NOVA ANÁLISE GRANULAR: Habilidades no range de TRI da turma
      let analiseHabilidades = '';
      try {
        const { getHabilidadesPorTRI } = await import('./conteudosLoader.js');
        analiseHabilidades = getHabilidadesPorTRI(Math.round(avgTRI), 10);
        console.log('[AI Analysis] Análise de habilidades gerada com sucesso');
      } catch (error) {
        console.error('[AI Analysis] Erro ao gerar análise de habilidades:', error);
        analiseHabilidades = '\n⚠️ Não foi possível carregar dados de conteúdos ENEM.\n';
      }

      // Construir prompt para ChatGPT
      const prompt = `Você é um coordenador pedagógico especialista em ENEM e TRI. Analise esta turma e forneça um relatório EXECUTIVO e ACIONÁVEL:

📊 CONTEXTO DA TURMA:
- Total: ${students.length} alunos
- TRI médio geral: ${Math.round(avgTRI)} (meta ENEM: 500+)
- Distribuição:
  * ${grupos.reforco} alunos em RISCO (TRI < 400) - precisam reforço URGENTE
  * ${grupos.direcionado} alunos em DESENVOLVIMENTO (TRI 400-550) - próximos da meta
  * ${grupos.aprofundamento} alunos ACIMA da meta (TRI > 550) - podem ser monitores

📈 DESEMPENHO POR ÁREA (Comparativo com média da turma):
${Object.entries(areaAnalysis).map(([code, data]: [string, any]) => {
  const status = data.diff < -20 ? '🔴 CRÍTICO' : data.diff < 0 ? '🟡 ATENÇÃO' : '🟢 BOM';
  return `- ${data.name}: ${data.average} pontos (${data.diff >= 0 ? '+' : ''}${data.diff} pts) ${status}`;
}).join('\n')}
${analiseHabilidades}

👥 DESTAQUES INDIVIDUAIS:
Melhores desempenhos:
${top3.map((s, i) => `${i+1}. ${s.name}: ${Math.round(s.tri)} (LC:${Math.round(s.areas.LC||0)} CH:${Math.round(s.areas.CH||0)} CN:${Math.round(s.areas.CN||0)} MT:${Math.round(s.areas.MT||0)})`).join('\n')}

Precisam atenção urgente:
${bottom3.map((s, i) => `${i+1}. ${s.name}: ${Math.round(s.tri)} (LC:${Math.round(s.areas.LC||0)} CH:${Math.round(s.areas.CH||0)} CN:${Math.round(s.areas.CN||0)} MT:${Math.round(s.areas.MT||0)})`).join('\n')}

🎯 FORNEÇA ANÁLISE ESTRUTURADA:

**ATENÇÃO**: Use as habilidades listadas acima (no range de TRI ${Math.round(avgTRI)}) para suas recomendações!
Cada área tem 10 habilidades prioritárias que a turma DEVERIA dominar nesse nível.

## 1. DIAGNÓSTICO (2-3 frases diretas)
- Qual a maior fraqueza da turma?
- Quais áreas comprometem mais o TRI geral?
- O que separa os alunos de risco dos que estão próximos da meta?

## 2. AÇÕES IMEDIATAS (próximas 2 semanas)
Liste 3-4 ações CONCRETAS que podem ser implementadas JÁ:
- **CITE AS HABILIDADES ESPECÍFICAS** (ex: H5, H12) que estão no range de TRI da turma
- Exemplo: "Plantão focado em Linguagens H1 e H10 (interpretação e gêneros textuais) - 2x/semana, terças 14h"
- Seja específico sobre QUEM faz, O QUE faz (qual habilidade), e QUANDO faz

## 3. ESTRATÉGIA POR GRUPO
- **${grupos.reforco} alunos em RISCO**: Quais das habilidades listadas devem ser priorizadas?
- **${grupos.direcionado} alunos em DESENVOLVIMENTO**: Como acelerar usando as habilidades do range?
- **${grupos.aprofundamento} alunos ACIMA da meta**: Como usar esse grupo a favor da turma?

## 4. META REALISTA (6 semanas)
- Quantos alunos podem sair da faixa de RISCO?
- Qual TRI médio esperado por área (LC/CH/CN/MT)?
- Qual o ganho de pontos mais realista considerando o tempo?

IMPORTANTE: 
- **USE AS HABILIDADES LISTADAS** - não invente habilidades genéricas
- SEJA CIRÚRGICO: cite códigos de habilidades (H1, H5, etc), números, áreas específicas
- Mencione pelo menos 3-4 habilidades específicas nas suas recomendações
- PENSE como coordenador que precisa apresentar isso para a direção AMANHÃ
- Máximo 500 palavras, foco em RESULTADOS e AÇÕES`;

      // Chamar OpenAI
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      const CHATGPT_MODEL = process.env.CHATGPT_MODEL || "gpt-4o-mini";

      if (!OPENAI_API_KEY) {
        res.status(500).json({ 
          error: "ChatGPT não configurado. Configure OPENAI_API_KEY nas variáveis de ambiente." 
        });
        return;
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: CHATGPT_MODEL,
          messages: [
            {
              role: "system",
              content: "Você é um coordenador pedagógico com 15 anos de experiência em preparação para ENEM. Você é DIRETO, ESPECÍFICO e focado em RESULTADOS. Evite teoria educacional genérica. Foque em ações que podem ser implementadas HOJE e geram resultados em semanas. Use dados e números. Seja conciso."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.8,
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      const analysis = data.choices[0].message.content;

      res.json({
        success: true,
        analysis,
        statistics: {
          avgTRI: Math.round(avgTRI),
          totalStudents: students.length,
          grupos,
          areaAnalysis,
        },
      });

    } catch (error) {
      console.error("[Análise IA] Erro:", error);
      res.status(500).json({
        error: "Erro ao gerar análise com IA",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  });

  // ============================================================================
  // ENDPOINT DE ANÁLISE ENEM/TRI COM ASSISTANT API
  // ============================================================================
  
  app.post("/api/analise-enem-tri", async (req: Request, res: Response) => {
    try {
      const {
        respostasAluno,
        tri,
        anoProva,
        serie,
        infoExtra,
        nomeAluno,
        matricula,
        turma,
        acertos,
        erros,
        nota,
        triLc,
        triCh,
        triCn,
        triMt,
        triGeral,
      } = req.body;

      // Validar dados obrigatórios (tri pode ser triGeral)
      const triValido = tri || triGeral;
      if (!respostasAluno || !triValido || !anoProva) {
        return res.status(400).json({
          error: "Dados obrigatórios faltando",
          details: "respostasAluno, tri (ou triGeral) e anoProva são obrigatórios.",
          required: ["respostasAluno", "tri (ou triGeral)", "anoProva"],
        });
      }

      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

      if (!OPENAI_API_KEY) {
        return res.status(500).json({
          error: "OPENAI_API_KEY não configurada. Configure nas variáveis de ambiente.",
        });
      }

      if (!ASSISTANT_ID) {
        return res.status(500).json({
          error: "OPENAI_ASSISTANT_ID não configurada. Configure nas variáveis de ambiente.",
          details: "Você precisa configurar o ID do seu Assistant. Exemplo: export OPENAI_ASSISTANT_ID='asst_...'",
        });
      }

      // Preparar mensagem do usuário com dados do aluno
      const dadosAluno: any = {
        nome: nomeAluno || "Aluno",
        matricula: matricula || "N/A",
        turma: turma || "N/A",
        serie: serie || "N/A",
        anoProva: anoProva,
        respostas: respostasAluno,
        acertos: acertos || 0,
        erros: erros || 0,
        nota: nota || 0,
        tri: {
          geral: triGeral || tri || 0,
          lc: triLc || 0,
          ch: triCh || 0,
          cn: triCn || 0,
          mt: triMt || 0,
        },
        infoExtra: infoExtra || {},
      };

      // Se infoExtra contém dados de múltiplos alunos, incluir na mensagem
      if (infoExtra?.totalAlunos) {
        dadosAluno.turmaCompleta = {
          totalAlunos: infoExtra.totalAlunos,
          mediaTRI: infoExtra.mediaTRI,
          mediasPorArea: infoExtra.mediasPorArea,
        };
      }

      // Verificar se é análise de turma completa ou aluno individual
      const isTurmaCompleta = dadosAluno.turmaCompleta && dadosAluno.turmaCompleta.totalAlunos > 1;
      const isAnaliseCoerencia = infoExtra?.coerenciaPedagogica;
      
      let mensagemUsuario = `Você é um especialista em análise de desempenho no ENEM usando a Teoria de Resposta ao Item (TRI). 

${isTurmaCompleta 
  ? `Analise os seguintes dados da TURMA COMPLETA para o ENEM ${anoProva}:`
  : `Analise os seguintes dados do aluno para o ENEM ${anoProva}:`}

**Dados ${isTurmaCompleta ? 'da Turma' : 'do Aluno'}:**
- ${isTurmaCompleta ? 'Turma' : 'Nome'}: ${dadosAluno.nome}
- Matrícula: ${dadosAluno.matricula}
- Turma: ${dadosAluno.turma}
- Série: ${dadosAluno.serie}
${isTurmaCompleta ? `- Total de Alunos: ${dadosAluno.turmaCompleta.totalAlunos}` : ''}

**NOTAS TRI (Teoria de Resposta ao Item) - MÉTRICA PRINCIPAL:**
A TRI é a métrica oficial do ENEM. A escala vai de 0 a 1000, onde:
- Abaixo de 400: Desempenho muito abaixo da média
- 400-500: Desempenho abaixo da média
- 500-600: Desempenho na média
- 600-700: Desempenho acima da média
- 700-800: Desempenho muito acima da média
- Acima de 800: Desempenho excepcional

**Notas TRI ${isTurmaCompleta ? 'Médias da Turma' : 'do Aluno'}:**
- **TRI Geral:** ${dadosAluno.tri.geral.toFixed(2)}
- **Linguagens e Códigos (LC):** ${dadosAluno.tri.lc.toFixed(2)}
- **Ciências Humanas (CH):** ${dadosAluno.tri.ch.toFixed(2)}
- **Ciências da Natureza (CN):** ${dadosAluno.tri.cn.toFixed(2)}
- **Matemática (MT):** ${dadosAluno.tri.mt.toFixed(2)}

${dadosAluno.acertos !== undefined ? `**Informações Complementares:**
- Acertos médios: ${dadosAluno.acertos}
- Erros médios: ${dadosAluno.erros || 'N/A'}
- Nota TCT média: ${dadosAluno.nota ? dadosAluno.nota.toFixed(2) : 'N/A'}` : ''}

${infoExtra && !isTurmaCompleta ? `**Informações Adicionais:**\n${JSON.stringify(infoExtra, null, 2)}` : ""}

**IMPORTANTE:** 
- Foque sua análise PRINCIPALMENTE nas notas TRI, que são a métrica oficial do ENEM
- Compare as notas TRI de cada área com a escala de referência (0-1000)
- Identifique quais áreas estão abaixo, na média ou acima da média baseado nas notas TRI
- Forneça recomendações de estudo baseadas nas notas TRI de cada área
- Se houver pedido específico sobre o que estudar, baseie-se nas notas TRI para priorizar conteúdos
${isTurmaCompleta ? '- Como é uma análise de turma, forneça recomendações pedagógicas para o grupo como um todo, identificando padrões e áreas que precisam de reforço coletivo' : ''}

${isAnaliseCoerencia ? `
**COERÊNCIA PEDAGÓGICA (Análise de Erros por Dificuldade):**
- Erros em questões FÁCEIS (>70% acerto): ${infoExtra.coerenciaPedagogica.errosFacil}
- Erros em questões MÉDIAS (40-70% acerto): ${infoExtra.coerenciaPedagogica.errosMedia}
- Erros em questões DIFÍCEIS (<40% acerto): ${infoExtra.coerenciaPedagogica.errosDificil}

**IMPORTANTE:** Analise as NOTAS TRI deste aluno e forneça sugestões práticas de melhoria baseadas em CONTEÚDOS ENEM. 

Sua resposta DEVE incluir OBRIGATORIAMENTE:

1. **RESUMO DAS 4 NOTAS TRI:**
   - Mostre claramente as notas TRI de cada área: LC, CH, CN e MT
   - Indique qual área está abaixo da média, na média ou acima da média

2. **ANÁLISE POR ÁREA:**
   - Para cada área com TRI abaixo de 500, identifique os pontos fracos
   - Explique o que essas notas TRI indicam sobre o desempenho do aluno

3. **CONTEÚDOS ESPECÍFICOS DO ENEM PARA MELHORAR:**
   - Liste CONTEÚDOS ESPECÍFICOS do ENEM que o aluno deve estudar para cada área com TRI baixa
   - Seja específico: mencione habilidades, competências ou temas do ENEM
   - Priorize conteúdos que terão maior impacto na elevação das notas TRI
   - Exemplos: "H1 - Interpretar textos", "H15 - Funções", "H21 - Análise de gráficos", etc.

4. **PLANO DE AÇÃO:**
   - Sugira uma ordem de prioridade para os estudos
   - Indique quais áreas devem ser priorizadas primeiro

Seja detalhado e específico. Não resuma demais - o aluno precisa ver todas as 4 notas TRI e os conteúdos específicos para melhorar!` : `
Por favor, forneça uma análise detalhada e estratégica ${isTurmaCompleta ? 'do desempenho desta turma' : 'do desempenho deste aluno'} no ENEM baseada nas NOTAS TRI, incluindo:
1. Interpretação das notas TRI de cada área
2. Comparação com a escala de referência TRI
3. Pontos fortes e áreas de melhoria baseados nas notas TRI
4. Recomendações específicas de estudo priorizadas pelas notas TRI mais baixas
${isTurmaCompleta ? '5. Ações pedagógicas coletivas para melhorar o desempenho da turma' : ''}`}`;

      // Criar thread no Assistant API
      const threadResponse = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2",
        },
      });

      if (!threadResponse.ok) {
        const error = await threadResponse.json();
        throw new Error(`Erro ao criar thread: ${JSON.stringify(error)}`);
      }

      const threadData = await threadResponse.json();
      const threadId = threadData.id;

      // Adicionar mensagem do usuário à thread
      const messageResponse = await fetch(
        `https://api.openai.com/v1/threads/${threadId}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v2",
          },
          body: JSON.stringify({
            role: "user",
            content: mensagemUsuario,
          }),
        }
      );

      if (!messageResponse.ok) {
        const error = await messageResponse.json();
        throw new Error(`Erro ao adicionar mensagem: ${JSON.stringify(error)}`);
      }

      // Executar o run do Assistant
      const runResponse = await fetch(
        `https://api.openai.com/v1/threads/${threadId}/runs`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v2",
          },
          body: JSON.stringify({
            assistant_id: ASSISTANT_ID,
          }),
        }
      );

      if (!runResponse.ok) {
        const error = await runResponse.json();
        const errorMsg = error.error?.message || JSON.stringify(error);
        
        // Mensagem mais clara para erro de Assistant não encontrado
        if (errorMsg.includes("No assistant found")) {
          throw new Error(
            `Assistant ID não encontrado: ${ASSISTANT_ID}\n` +
            `Verifique se o ID está correto e se o Assistant existe na sua conta OpenAI.\n` +
            `Acesse: https://platform.openai.com/assistants para verificar.`
          );
        }
        
        throw new Error(`Erro ao executar run: ${errorMsg}`);
      }

      const runData = await runResponse.json();
      let runId = runData.id;
      let runStatus = runData.status;

      // Aguardar conclusão do run (polling)
      const maxAttempts = 60; // 60 tentativas = ~60 segundos
      let attempts = 0;

      while (runStatus === "queued" || runStatus === "in_progress") {
        if (attempts >= maxAttempts) {
          throw new Error("Timeout aguardando resposta do Assistant");
        }

        await new Promise((resolve) => setTimeout(resolve, 1000)); // Aguardar 1 segundo

        const statusResponse = await fetch(
          `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
          {
            headers: {
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
              "OpenAI-Beta": "assistants=v2",
            },
          }
        );

        if (!statusResponse.ok) {
          const error = await statusResponse.json();
          throw new Error(`Erro ao verificar status: ${JSON.stringify(error)}`);
        }

        const statusData = await statusResponse.json();
        runStatus = statusData.status;
        attempts++;

        if (runStatus === "failed" || runStatus === "cancelled") {
          throw new Error(`Run falhou com status: ${runStatus}`);
        }
      }

      // Buscar mensagens da thread
      const messagesResponse = await fetch(
        `https://api.openai.com/v1/threads/${threadId}/messages`,
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "OpenAI-Beta": "assistants=v2",
          },
        }
      );

      if (!messagesResponse.ok) {
        const error = await messagesResponse.json();
        throw new Error(`Erro ao buscar mensagens: ${JSON.stringify(error)}`);
      }

      const messagesData = await messagesResponse.json();
      
      // Encontrar a última mensagem do assistant
      const assistantMessages = messagesData.data
        .filter((msg: any) => msg.role === "assistant")
        .sort((a: any, b: any) => b.created_at - a.created_at);

      if (assistantMessages.length === 0) {
        throw new Error("Nenhuma resposta do Assistant encontrada");
      }

      const lastMessage = assistantMessages[0];
      let analiseTexto = "";

      // Extrair texto da mensagem (pode ser texto ou array de content blocks)
      if (lastMessage.content) {
        if (Array.isArray(lastMessage.content)) {
          analiseTexto = lastMessage.content
            .map((block: any) => {
              if (block.type === "text") {
                // Suportar diferentes estruturas
                if (block.text && typeof block.text.value === "string") {
                  return block.text.value;
                } else if (typeof block.text === "string") {
                  return block.text;
                } else if (typeof block === "string") {
                  return block;
                }
              }
              return "";
            })
            .filter((text: string) => text.trim().length > 0)
            .join("\n\n");
        } else if (typeof lastMessage.content === "string") {
          analiseTexto = lastMessage.content;
        } else if (lastMessage.content.text) {
          analiseTexto = typeof lastMessage.content.text === "string"
            ? lastMessage.content.text
            : lastMessage.content.text.value || "";
        }
      }
      
      // Se ainda não encontrou, tentar outros campos
      if (!analiseTexto && lastMessage.text) {
        analiseTexto = typeof lastMessage.text === "string"
          ? lastMessage.text
          : lastMessage.text.value || "";
      }
      
      // Log para debug se não encontrar
      if (!analiseTexto || analiseTexto.trim().length === 0) {
        console.error("[Analise ENEM TRI] Estrutura da mensagem:", JSON.stringify(lastMessage, null, 2));
      }

      // Retornar análise (usar 'analysis' para compatibilidade com frontend)
      if (!analiseTexto || analiseTexto.trim().length === 0) {
        throw new Error("Resposta da IA não contém análise");
      }
      
      res.json({
        success: true,
        analysis: analiseTexto.trim(), // Frontend espera 'analysis'
        analise: analiseTexto.trim(), // Manter compatibilidade
        threadId: threadId,
        runId: runId,
        dadosProcessados: {
          nomeAluno: dadosAluno.nome,
          anoProva: dadosAluno.anoProva,
          triGeral: dadosAluno.tri.geral,
        },
      });

    } catch (error) {
      console.error("[Análise ENEM/TRI] Erro:", error);
      res.status(500).json({
        error: "Erro ao gerar análise com Assistant",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  });

  // ============================================================================
  // ENDPOINTS DE HISTÓRICO DE AVALIAÇÕES
  // ============================================================================
  
  const AVALIACOES_FILE = path.join(process.cwd(), "data", "avaliacoes.json");
  
  // Garantir que o diretório existe
  async function ensureAvaliacoesFile() {
    const dir = path.dirname(AVALIACOES_FILE);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(AVALIACOES_FILE);
    } catch {
      // Arquivo não existe, criar com array vazio
      await fs.writeFile(AVALIACOES_FILE, JSON.stringify([], null, 2), "utf-8");
    }
  }

  // POST /api/avaliacoes - Salvar avaliação
  app.post("/api/avaliacoes", async (req: Request, res: Response) => {
    try {
      await ensureAvaliacoesFile();
      
      const avaliacao = req.body;
      
      // Validar dados obrigatórios
      if (!avaliacao.id || !avaliacao.data || !avaliacao.titulo) {
        res.status(400).json({ error: "Dados obrigatórios faltando: id, data, titulo" });
        return;
      }

      // Ler avaliações existentes
      const content = await fs.readFile(AVALIACOES_FILE, "utf-8");
      const avaliacoes: any[] = JSON.parse(content);

      // Verificar se já existe (atualizar) ou adicionar nova
      const index = avaliacoes.findIndex(a => a.id === avaliacao.id);
      if (index >= 0) {
        avaliacoes[index] = avaliacao;
      } else {
        avaliacoes.unshift(avaliacao); // Adicionar no início
      }

      // Manter apenas as últimas 100 avaliações
      const avaliacoesLimitadas = avaliacoes.slice(0, 100);

      // Salvar no arquivo
      await fs.writeFile(AVALIACOES_FILE, JSON.stringify(avaliacoesLimitadas, null, 2), "utf-8");

      console.log(`[AVALIACOES] Salva: ${avaliacao.id} - ${avaliacao.totalAlunos} alunos`);
      
      res.json({
        success: true,
        id: avaliacao.id,
        total: avaliacoesLimitadas.length
      });
    } catch (error: any) {
      console.error("[AVALIACOES] Erro ao salvar:", error);
      res.status(500).json({
        error: "Erro ao salvar avaliação",
        details: error.message
      });
    }
  });

  // GET /api/avaliacoes - Listar todas as avaliações
  app.get("/api/avaliacoes", async (req: Request, res: Response) => {
    try {
      await ensureAvaliacoesFile();
      
      const content = await fs.readFile(AVALIACOES_FILE, "utf-8");
      const avaliacoes = JSON.parse(content);

      res.json({
        success: true,
        avaliacoes,
        total: avaliacoes.length
      });
    } catch (error: any) {
      console.error("[AVALIACOES] Erro ao listar:", error);
      res.status(500).json({
        error: "Erro ao listar avaliações",
        details: error.message
      });
    }
  });

  // GET /api/avaliacoes/:id - Buscar avaliação específica
  app.get("/api/avaliacoes/:id", async (req: Request, res: Response) => {
    try {
      await ensureAvaliacoesFile();
      
      const { id } = req.params;
      const content = await fs.readFile(AVALIACOES_FILE, "utf-8");
      const avaliacoes: any[] = JSON.parse(content);
      
      const avaliacao = avaliacoes.find(a => a.id === id);
      
      if (!avaliacao) {
        res.status(404).json({ error: "Avaliação não encontrada" });
        return;
      }

      res.json({
        success: true,
        avaliacao
      });
    } catch (error: any) {
      console.error("[AVALIACOES] Erro ao buscar:", error);
      res.status(500).json({
        error: "Erro ao buscar avaliação",
        details: error.message
      });
    }
  });

  // DELETE /api/avaliacoes/:id - Deletar avaliação
  app.delete("/api/avaliacoes/:id", async (req: Request, res: Response) => {
    try {
      await ensureAvaliacoesFile();
      
      const { id } = req.params;
      const content = await fs.readFile(AVALIACOES_FILE, "utf-8");
      const avaliacoes: any[] = JSON.parse(content);
      
      const index = avaliacoes.findIndex(a => a.id === id);
      if (index < 0) {
        res.status(404).json({ error: "Avaliação não encontrada" });
        return;
      }

      avaliacoes.splice(index, 1);
      await fs.writeFile(AVALIACOES_FILE, JSON.stringify(avaliacoes, null, 2), "utf-8");

      res.json({
        success: true,
        message: "Avaliação deletada com sucesso"
      });
    } catch (error: any) {
      console.error("[AVALIACOES] Erro ao deletar:", error);
      res.status(500).json({
        error: "Erro ao deletar avaliação",
        details: error.message
      });
    }
  });

  return httpServer;
}
