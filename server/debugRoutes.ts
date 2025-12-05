import type { Express, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

// Configuração do serviço Python OMR
const PYTHON_OMR_SERVICE_URL = process.env.PYTHON_OMR_URL || "http://localhost:5002";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

interface DebugStep {
  step: number;
  name: string;
  status: "success" | "error" | "warning";
  message: string;
  data?: any;
  imageUrl?: string;
  duration?: number;
}

/**
 * Registra rotas de debug para análise passo a passo do OMR
 */
export function registerDebugRoutes(app: Express) {
  
  /**
   * POST /api/debug/omr - Testa OMR passo a passo
   * 
   * Mostra cada etapa do processamento:
   * 1. Upload do PDF
   * 2. Conversão PDF → Imagem
   * 3. Pré-processamento da imagem
   * 4. Chamada ao serviço OMR Python
   * 5. Resultado final
   */
  app.post("/api/debug/omr", upload.single("file"), async (req: Request, res: Response) => {
    const steps: DebugStep[] = [];
    const startTime = Date.now();
    
    try {
      // ETAPA 1: Validar upload
      const step1Start = Date.now();
      if (!req.file) {
        throw new Error("Nenhum arquivo enviado");
      }
      
      steps.push({
        step: 1,
        name: "Upload do arquivo",
        status: "success",
        message: `Arquivo recebido: ${req.file.originalname} (${(req.file.size / 1024).toFixed(2)} KB)`,
        data: {
          filename: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype
        },
        duration: Date.now() - step1Start
      });
      
      // ETAPA 2: Converter PDF → Imagem
      const step2Start = Date.now();
      let imageBuffer: Buffer;
      
      if (req.file.mimetype === "application/pdf") {
        try {
          const pdfDoc = await PDFDocument.load(req.file.buffer);
          const pageCount = pdfDoc.getPageCount();
          
          steps.push({
            step: 2,
            name: "Análise do PDF",
            status: "success",
            message: `PDF carregado com ${pageCount} página(s)`,
            data: { pageCount },
            duration: Date.now() - step2Start
          });
          
          // ETAPA 3: Converter primeira página do PDF para PNG
          const step2bStart = Date.now();
          try {
            // Extrair primeira página
            const singlePageDoc = await PDFDocument.create();
            const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [0]);
            singlePageDoc.addPage(copiedPage);
            const singlePagePdfBytes = await singlePageDoc.save();
            
            // Método 1: Tentar usar pdftoppm (se disponível no sistema)
            let conversionMethod = "unknown";
            const fs = await import("fs/promises");
            const { exec } = await import("child_process");
            const { promisify } = await import("util");
            const execAsync = promisify(exec);
            
            const timestamp = Date.now();
            const tempPdfPath = `/tmp/debug_page_${timestamp}.pdf`;
            const tempPngPath = `/tmp/debug_page_${timestamp}`;
            
            await fs.writeFile(tempPdfPath, singlePagePdfBytes);
            
            try {
              // Tentar pdftoppm (melhor qualidade)
              await execAsync(`pdftoppm -png -r 200 -singlefile "${tempPdfPath}" "${tempPngPath}"`);
              imageBuffer = await fs.readFile(`${tempPngPath}.png`);
              conversionMethod = "pdftoppm (200 DPI)";
            } catch {
              // Fallback: usar sharp com density
              imageBuffer = await sharp(Buffer.from(singlePagePdfBytes), { density: 200 }).png().toBuffer();
              await fs.writeFile(`${tempPngPath}.png`, imageBuffer);
              conversionMethod = "sharp (200 DPI)";
            }
            
            // Cleanup
            await fs.unlink(tempPdfPath).catch(() => {});
            await fs.unlink(`${tempPngPath}.png`).catch(() => {});
            
            // Obter dimensões da imagem
            const metadata = await sharp(imageBuffer).metadata();
            
            steps.push({
              step: 3,
              name: "Conversão PDF → PNG",
              status: "success",
              message: `Primeira página convertida (${conversionMethod}) - ${metadata.width}x${metadata.height}px, ${(imageBuffer.length / 1024).toFixed(2)} KB`,
              data: {
                originalPageCount: pageCount,
                convertedPage: 1,
                method: conversionMethod,
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                outputSize: imageBuffer.length
              },
              duration: Date.now() - step2bStart
            });
          } catch (convError: any) {
            steps.push({
              step: 3,
              name: "Conversão PDF → Imagem",
              status: "error",
              message: `Erro ao converter PDF: ${convError.message}`,
              duration: Date.now() - step2bStart
            });
            throw convError;
          }
          
        } catch (error: any) {
          steps.push({
            step: 2,
            name: "Análise do PDF",
            status: "error",
            message: `Erro ao processar PDF: ${error.message}`,
            duration: Date.now() - step2Start
          });
          throw error;
        }
      } else {
        // Arquivo já é imagem (PNG, JPEG, etc.)
        imageBuffer = req.file.buffer;
        steps.push({
          step: 2,
          name: "Análise de imagem",
          status: "success",
          message: `Imagem carregada diretamente (${req.file.mimetype})`,
          duration: Date.now() - step2Start
        });
        
        // Adicionar etapa 3 como "não necessária" para manter sequência
        steps.push({
          step: 3,
          name: "Conversão PDF → PNG",
          status: "success",
          message: "Conversão não necessária - arquivo já é imagem",
          data: {
            skipReason: "Arquivo enviado já está em formato de imagem"
          },
          duration: 0
        });
      }
      
      // ETAPA 4: Pré-visualização da imagem
      const step4Start = Date.now();
      try {
        const metadata = await sharp(imageBuffer).metadata();
        steps.push({
          step: 4,
          name: "Metadados da imagem",
          status: "success",
          message: `Dimensões: ${metadata.width}x${metadata.height}, Formato: ${metadata.format}`,
          data: {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            channels: metadata.channels
          },
          duration: Date.now() - step4Start
        });
      } catch (error: any) {
        steps.push({
          step: 4,
          name: "Metadados da imagem",
          status: "warning",
          message: `Não foi possível ler metadados: ${error.message}`,
          duration: Date.now() - step4Start
        });
      }
      
      // ETAPA 5: Verificar serviço Python OMR
      const step5Start = Date.now();
      try {
        const healthCheck = await fetch(`${PYTHON_OMR_SERVICE_URL}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(3000)
        });
        
        if (healthCheck.ok) {
          const healthData = await healthCheck.json();
          steps.push({
            step: 5,
            name: "Verificação do serviço OMR Python",
            status: "success",
            message: `Serviço OMR ativo em ${PYTHON_OMR_SERVICE_URL}`,
            data: healthData,
            duration: Date.now() - step5Start
          });
        } else {
          throw new Error(`Serviço retornou status ${healthCheck.status}`);
        }
      } catch (error: any) {
        steps.push({
          step: 5,
          name: "Verificação do serviço OMR Python",
          status: "error",
          message: `Serviço OMR não está disponível: ${error.message}`,
          duration: Date.now() - step5Start
        });
        throw new Error("Serviço OMR Python não está rodando. Inicie com: cd python_omr_service && ./start_service.sh");
      }
      
      // ETAPA 6: Chamar serviço OMR
      const step6Start = Date.now();
      try {
        const axios = (await import("axios")).default;
        const FormData = (await import("form-data")).default;
        const formData = new FormData();
        
        formData.append("image", imageBuffer, {
          filename: req.file.originalname,
          contentType: req.file.mimetype || "application/pdf",
        });
        formData.append("page", "1");
        
        const response = await axios.post(
          `${PYTHON_OMR_SERVICE_URL}/api/process-image`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 30000, // 30 segundos
          }
        );
        
        const omrResult = response.data;
        
        // Verificar se o OMR detectou alguma coisa
        const omrStatus = omrResult.status || "unknown";
        const omrMensagem = omrResult.mensagem || "";
        
        // DEBUG: Log completo da resposta do Python
        console.log(`[DEBUG OMR] Status recebido do Python: "${omrStatus}"`);
        console.log(`[DEBUG OMR] Mensagem: "${omrMensagem}"`);
        console.log(`[DEBUG OMR] Resposta completa:`, JSON.stringify(omrResult, null, 2).substring(0, 500));
        
        // Contar questões detectadas
        const questoes = omrResult.pagina?.resultado?.questoes || {};
        const numQuestoes = Object.keys(questoes).length;
        const numRespondidas = Object.values(questoes).filter(v => v && v !== '' && v !== 'Não respondeu').length;
        
        console.log(`[DEBUG OMR] Questões recebidas: ${numQuestoes}, Respondidas: ${numRespondidas}`);
        
        // Verificar se houve erro no OMR
        let omrDetectionStatus: "success" | "warning" | "error" = "success";
        let omrMessage = `OMR detectou ${numRespondidas}/${numQuestoes} questões respondidas`;
        
        // Python OMR retorna "sucesso" ou "ok" quando funciona
        // CORRIGIDO: Aceitar também status vazio ou undefined se houver questões detectadas
        const omrFalhou = omrStatus !== "ok" && omrStatus !== "sucesso" && omrStatus !== "unknown";
        
        // Se detectou questões, considerar sucesso mesmo se status não for perfeito
        if (numRespondidas > 0 && numRespondidas >= numQuestoes * 0.9) {
          // Se detectou 90%+ das questões, é sucesso
          omrDetectionStatus = "success";
          omrMessage = `✅ OMR detectou ${numRespondidas}/${numQuestoes} questões respondidas (${((numRespondidas/numQuestoes)*100).toFixed(1)}%)`;
        } else if (omrFalhou && omrMensagem) {
          omrDetectionStatus = "error";
          omrMessage = `OMR falhou: ${omrMensagem}`;
        } else if (numRespondidas === 0) {
          omrDetectionStatus = "error";
          omrMessage = "⚠️ OMR NÃO DETECTOU NENHUMA QUESTÃO! Possíveis causas: PDF mal escaneado, template incorreto, ou coordenadas descalibradas";
        } else if (numRespondidas < numQuestoes * 0.5) {
          omrDetectionStatus = "warning";
          omrMessage = `⚠️ OMR detectou apenas ${numRespondidas} de ${numQuestoes} questões (${((numRespondidas/numQuestoes)*100).toFixed(1)}%). Isso é muito baixo!`;
        }
        
        steps.push({
          step: 6,
          name: "Processamento OMR Python",
          status: omrDetectionStatus,
          message: omrMessage,
          data: {
            service: "Python OMR (baddrow)",
            status: omrResult.status,
            totalQuestoes: numQuestoes,
            questoesRespondidas: numRespondidas,
            taxaDeteccao: numQuestoes > 0 ? `${((numRespondidas/numQuestoes)*100).toFixed(1)}%` : "0%",
            questoes: questoes,
            mensagemOriginal: omrMensagem
          },
          duration: Date.now() - step6Start
        });
        
        // ETAPA 7: Análise de confiança
        const step7Start = Date.now();
        const taxaResposta = numQuestoes > 0 ? (numRespondidas / numQuestoes) * 100 : 0;
        
        let analiseStatus: "success" | "warning" | "error" = "success";
        let analiseMensagem = "";
        let recomendacao = "";
        
        if (numRespondidas === 0) {
          analiseStatus = "error";
          analiseMensagem = "🚨 CRÍTICO: OMR Python NÃO ESTÁ FUNCIONANDO!";
          recomendacao = "O serviço OMR Python está ativo MAS não conseguiu detectar NENHUMA questão. Isso indica:\n" +
            "1. Template errado (45 vs 90 questões)\n" +
            "2. Coordenadas descalibradas\n" +
            "3. PDF com qualidade muito baixa\n" +
            "4. Rotação/escala incorreta da imagem\n\n" +
            "⚠️ Se o ChatGPT Vision estiver ativado, ele fará TODO o trabalho sozinho!";
        } else if (taxaResposta >= 95) {
          analiseStatus = "success";
          analiseMensagem = `✅ Excelente! ${taxaResposta.toFixed(1)}% das questões foram detectadas`;
          recomendacao = "Configuração OK - OMR Python está funcionando corretamente";
        } else if (taxaResposta >= 80) {
          analiseStatus = "warning";
          analiseMensagem = `⚠️ Boa detecção: ${taxaResposta.toFixed(1)}%, mas pode melhorar`;
          recomendacao = "Ajuste os thresholds em python_omr_service/app.py";
        } else {
          analiseStatus = "error";
          analiseMensagem = `🚨 Taxa muito baixa: ${taxaResposta.toFixed(1)}%. OMR Python com problemas!`;
          recomendacao = "Verifique:\n" +
            "1. Template correto? (45 ou 90 questões)\n" +
            "2. Qualidade do scan\n" +
            "3. Coordenadas do template em app.py";
        }
        
        steps.push({
          step: 7,
          name: "Análise de qualidade OMR",
          status: analiseStatus,
          message: analiseMensagem,
          data: {
            taxaResposta: taxaResposta.toFixed(1) + "%",
            qualidadeEsperada: "≥98%",
            recomendacao: recomendacao,
            alerta: numRespondidas === 0 
              ? "⚠️ ATENÇÃO: Se você ativou ChatGPT Vision, ele está fazendo TODO o trabalho do OMR!" 
              : null
          },
          duration: Date.now() - step7Start
        });
        
        // Resposta final
        res.json({
          success: true,
          totalDuration: Date.now() - startTime,
          steps,
          resultado: {
            questoes: questoes,
            totalQuestoes: numQuestoes,
            questoesRespondidas: numRespondidas,
            taxaDeteccao: taxaResposta.toFixed(1) + "%"
          }
        });
        
      } catch (error: any) {
        steps.push({
          step: 6,
          name: "Processamento OMR",
          status: "error",
          message: `Erro ao processar OMR: ${error.message}`,
          data: error.response?.data,
          duration: Date.now() - step6Start
        });
        throw error;
      }
      
    } catch (error: any) {
      console.error("[DEBUG OMR] Erro:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        totalDuration: Date.now() - startTime,
        steps
      });
    }
  });
  
  /**
   * GET /api/debug/status - Verifica status dos serviços
   */
  app.get("/api/debug/status", async (req: Request, res: Response) => {
    const services = [];
    
    // Verificar Python OMR
    try {
      const omrHealth = await fetch(`${PYTHON_OMR_SERVICE_URL}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000)
      });
      services.push({
        name: "Python OMR Service",
        url: PYTHON_OMR_SERVICE_URL,
        status: omrHealth.ok ? "online" : "offline",
        details: omrHealth.ok ? await omrHealth.json() : null
      });
    } catch {
      services.push({
        name: "Python OMR Service",
        url: PYTHON_OMR_SERVICE_URL,
        status: "offline",
        details: null
      });
    }
    
    // Verificar OCR Service
    const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || "http://localhost:5001";
    try {
      const ocrHealth = await fetch(`${OCR_SERVICE_URL}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000)
      });
      services.push({
        name: "DeepSeek OCR Service",
        url: OCR_SERVICE_URL,
        status: ocrHealth.ok ? "online" : "offline",
        details: ocrHealth.ok ? await ocrHealth.json() : null
      });
    } catch {
      services.push({
        name: "DeepSeek OCR Service",
        url: OCR_SERVICE_URL,
        status: "offline",
        details: null
      });
    }
    
    res.json({
      timestamp: new Date().toISOString(),
      services
    });
  });
}
