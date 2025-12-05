/**
 * DeepSeek-OCR Integration
 * Cliente para o serviço DeepSeek-OCR em Python
 */

import sharp from "sharp";

interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox?: { x0: number; y0: number; x1: number; y1: number };
  }>;
  error?: string;
}

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || "http://localhost:5001";

/**
 * Verifica se o serviço DeepSeek-OCR está disponível
 */
export async function checkOCRService(): Promise<boolean> {
  try {
    const response = await fetch(`${OCR_SERVICE_URL}/health`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000), // 5 segundos timeout
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data.status === "ok" && data.model_loaded === true;
  } catch (error) {
    console.warn(`[DeepSeek-OCR] Serviço não disponível em ${OCR_SERVICE_URL}:`, error);
    return false;
  }
}

/**
 * Converte Buffer de imagem para base64
 */
function imageBufferToBase64(imageBuffer: Buffer): string {
  return imageBuffer.toString("base64");
}

/**
 * Processa OCR usando DeepSeek-OCR
 * 
 * @param imageBuffer Buffer da imagem
 * @param prompt Prompt customizado (opcional)
 * @returns Resultado do OCR
 */
export async function extractTextFromImageDeepSeek(
  imageBuffer: Buffer,
  prompt?: string
): Promise<OCRResult> {
  try {
    // Verificar se o serviço está disponível
    const isAvailable = await checkOCRService();
    if (!isAvailable) {
      console.warn("[DeepSeek-OCR] Serviço não disponível, retornando resultado vazio");
      return {
        text: "",
        confidence: 0,
        words: [],
        error: "OCR service not available",
      };
    }
    
    // Converter imagem para base64
    const imageBase64 = imageBufferToBase64(imageBuffer);
    
    // Fazer requisição para o serviço DeepSeek-OCR
    const response = await fetch(`${OCR_SERVICE_URL}/ocr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: imageBase64,
        prompt: prompt || "<image>\nFree OCR.",
      }),
      signal: AbortSignal.timeout(30000), // 30 segundos timeout
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCR service error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    // Converter resultado para formato esperado
    const words = result.text
      ? result.text.split(/\s+/).map((word: string, index: number) => ({
          text: word,
          confidence: result.confidence || 0.95,
          bbox: undefined, // DeepSeek não retorna bbox por padrão
        }))
      : [];
    
    return {
      text: result.text || "",
      confidence: result.confidence || 0.95,
      words,
      error: result.error,
    };
  } catch (error) {
    console.error("[DeepSeek-OCR] Erro ao processar OCR:", error);
    return {
      text: "",
      confidence: 0,
      words: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Processa múltiplas imagens em batch
 */
export async function extractTextFromImagesBatch(
  imageBuffers: Buffer[],
  prompt?: string
): Promise<OCRResult[]> {
  try {
    const isAvailable = await checkOCRService();
    if (!isAvailable) {
      console.warn("[DeepSeek-OCR] Serviço não disponível, retornando resultados vazios");
      return imageBuffers.map(() => ({
        text: "",
        confidence: 0,
        words: [],
        error: "OCR service not available",
      }));
    }
    
    // Converter todas as imagens para base64
    const imagesBase64 = imageBuffers.map(imageBufferToBase64);
    
    // Fazer requisição batch
    const response = await fetch(`${OCR_SERVICE_URL}/ocr/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        images: imagesBase64,
        prompt: prompt || "<image>\nFree OCR.",
      }),
      signal: AbortSignal.timeout(60000), // 60 segundos timeout para batch
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCR service error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    // Converter resultados
    return result.results.map((r: any) => ({
      text: r.text || "",
      confidence: r.confidence || 0.95,
      words: r.text
        ? r.text.split(/\s+/).map((word: string) => ({
            text: word,
            confidence: r.confidence || 0.95,
            bbox: undefined,
          }))
        : [],
      error: r.error,
    }));
  } catch (error) {
    console.error("[DeepSeek-OCR] Erro ao processar OCR batch:", error);
    return imageBuffers.map(() => ({
      text: "",
      confidence: 0,
      words: [],
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}


