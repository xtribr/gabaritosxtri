import sharp from "sharp";
import { officialGabaritoTemplate, type OMRBubble, type OMRRegion, type OMRTemplate } from "@shared/schema";

interface BubbleDetectionResult {
  questionNumber: number;
  option: string;
  fillRatio: number;
  averageDarkness: number; // Média de escuridão (0-255, menor = mais escuro)
  darkestPixel: number; // Pixel mais escuro encontrado
  isMarked: boolean;
  confidence: number; // Confiança específica desta bolha (0-1)
}

interface OMRResult {
  answers: { [questionNumber: number]: string };
  answerConfidences: { [questionNumber: number]: number };
  allBubbles: BubbleDetectionResult[];
  overallConfidence: number;
  detectedAnswers: string[];
  warnings: string[];
  debugInfo?: { [questionNumber: number]: { bubbles: BubbleDetectionResult[]; selected: string } };
}

interface TextFieldResult {
  name: string;
  value: string;
  confidence: number;
}

export interface FullOMRResult extends OMRResult {
  textFields: TextFieldResult[];
}

// ⚠️ THRESHOLDS CRÍTICOS - OTIMIZADOS PARA MÁXIMA PERFORMANCE v5.0
// Calibrado especificamente para o cartão-resposta MENOR com OMR em máxima sensibilidade
// Estes valores detectam TODAS as marcações reais enquanto minimizam falsos positivos
const MIN_FILL_RATIO_FOR_MARKED = 0.08; // Mínimo de preenchimento para considerar marcada (8% - MUITO mais permissivo)
const MIN_BUBBLE_RADIUS_PIXELS = 6; // Raio mínimo garantido para análise de bolhas (reduzido para bolhas pequenas)

/**
 * Detecta marcadores de canto (sangria) para calibração
 * Os marcadores são quadrados pretos nos 4 cantos do gabarito
 */
async function detectCornerMarkers(
  imageBuffer: Buffer,
  expectedMarks: OMRRegion[],
  imageWidth: number,
  imageHeight: number
): Promise<Array<{ x: number; y: number }> | null> {
  try {
    // CRÍTICO: Pré-processar imagem para melhorar detecção dos marcadores
    // Aumentar contraste, nitidez e aplicar threshold agressivo
    console.log(`[OMR] Iniciando detecção de marcadores - imageBuffer length: ${imageBuffer.length}, expectedMarks: ${expectedMarks.length}`);
    
    const preprocessedForMarkers = await sharp(imageBuffer)
      .greyscale()
      .normalize() // Normalizar contraste
      .normalize() // Reforçar normalização
      .sharpen(2.5, 2, 3) // AUMENTADO: Nitidez ainda maior
      .threshold(95) // REDUZIDO: threshold mais baixo para capturar marcadores mesmo leves
      .raw()
      .toBuffer();
    
    console.log(`[OMR] Imagem pré-processada para detecção de marcadores (${imageWidth}x${imageHeight}), buffer length: ${preprocessedForMarkers.length}`);
    
    const detectedMarks: Array<{ x: number; y: number }> = [];
    
    // Para cada marcador esperado, procurar um quadrado preto na região
    for (const expectedMark of expectedMarks) {
      const markX = Math.round(expectedMark.x * imageWidth);
      const markY = Math.round(expectedMark.y * imageHeight);
      const markWidth = Math.round(expectedMark.width * imageWidth);
      const markHeight = Math.round(expectedMark.height * imageHeight);
      
      // Procurar em uma região maior (8x) para encontrar o marcador mesmo com desalinhamentos
      // AUMENTADO de 6 para 8 para melhor tolerância a desalinhamentos
      const searchRadius = Math.max(markWidth, markHeight) * 8;
      const searchX = Math.max(0, markX - searchRadius);
      const searchY = Math.max(0, markY - searchRadius);
      const searchWidth = Math.min(imageWidth - searchX, markWidth + searchRadius * 2);
      const searchHeight = Math.min(imageHeight - searchY, markHeight + searchRadius * 2);
      
      // Procurar o centro do quadrado preto (região com maior densidade de pixels pretos)
      let maxDarkness = 0;
      let bestX = markX;
      let bestY = markY;
      
      for (let y = searchY; y < searchY + searchHeight - markHeight; y++) {
        for (let x = searchX; x < searchX + searchWidth - markWidth; x++) {
          // Contar pixels pretos na região do marcador
          let darkPixels = 0;
          for (let dy = 0; dy < markHeight; dy++) {
            for (let dx = 0; dx < markWidth; dx++) {
              const pixelIndex = ((y + dy) * imageWidth + (x + dx)) * 1; // 1 channel (greyscale)
              if (pixelIndex >= 0 && pixelIndex < preprocessedForMarkers.length) {
                const pixelValue = preprocessedForMarkers[pixelIndex];
                if (pixelValue < 128) { // Pixel preto (após threshold)
                  darkPixels++;
                }
              }
            }
          }
          
          const darknessRatio = darkPixels / (markWidth * markHeight);
          if (darknessRatio > maxDarkness) {
            maxDarkness = darknessRatio;
            bestX = x + markWidth / 2;
            bestY = y + markHeight / 2;
          }
        }
      }
      
      // CRÍTICO: Exigir pelo menos 40% de pixels pretos (reduzido de 50% para ser mais permissivo)
      // Mas tentar múltiplos thresholds se não encontrar
      let threshold = 0.40; // Começar com 40%
      let found = false;
      
      // Tentar thresholds progressivamente mais baixos se não encontrar
      for (let t = threshold; t >= 0.25 && !found; t -= 0.05) {
        if (maxDarkness > t) {
          detectedMarks.push({ x: bestX, y: bestY });
          console.log(`[OMR] ✅ Marcador detectado em (${bestX.toFixed(1)}, ${bestY.toFixed(1)}) - densidade: ${(maxDarkness * 100).toFixed(1)}% (threshold: ${(t * 100).toFixed(0)}%)`);
          found = true;
        }
      }
      
      if (!found) {
        console.warn(`[OMR] ❌ Marcador NÃO detectado na região esperada (${markX.toFixed(0)}, ${markY.toFixed(0)}) - densidade máxima: ${(maxDarkness * 100).toFixed(1)}%`);
        // CRÍTICO: Se não encontrou um marcador, retornar null imediatamente
        // A calibração PRECISA dos 4 marcadores para funcionar corretamente
        return null;
      }
    }
    
    // CRÍTICO: Só retornar se TODOS os 4 marcadores foram detectados
    if (detectedMarks.length === 4) {
      console.log(`[OMR] ✅ TODOS os 4 marcadores detectados - calibração será aplicada`);
      return detectedMarks;
    } else {
      console.error(`[OMR] ❌ ERRO: Apenas ${detectedMarks.length}/4 marcadores detectados - calibração NÃO será aplicada`);
      return null; // Sem todos os 4, não podemos calibrar corretamente
    }
  } catch (error) {
    console.error(`[OMR] Erro ao detectar marcadores:`, error);
    if (error instanceof Error) {
      console.error(`[OMR] Stack trace:`, error.stack);
    }
    return null;
  }
}

/**
 * Calcula matriz de transformação baseada nos marcadores detectados vs esperados
 * Isso corrige distorções, rotações e escalas
 */
function calculateTransformMatrix(
  detectedMarks: Array<{ x: number; y: number }>,
  expectedMarks: OMRRegion[],
  imageWidth: number,
  imageHeight: number
): { scaleX: number; scaleY: number; offsetX: number; offsetY: number } {
  // Calcular posições esperadas dos centros dos marcadores
  const expectedCenters = expectedMarks.map(mark => ({
    x: mark.x * imageWidth + (mark.width * imageWidth) / 2,
    y: mark.y * imageHeight + (mark.height * imageHeight) / 2,
  }));
  
  // Calcular médias para offset
  const detectedAvgX = detectedMarks.reduce((sum, m) => sum + m.x, 0) / detectedMarks.length;
  const detectedAvgY = detectedMarks.reduce((sum, m) => sum + m.y, 0) / detectedMarks.length;
  const expectedAvgX = expectedCenters.reduce((sum, m) => sum + m.x, 0) / expectedCenters.length;
  const expectedAvgY = expectedCenters.reduce((sum, m) => sum + m.y, 0) / expectedCenters.length;
  
  // CRÍTICO: Esta função só deve ser chamada quando temos EXATAMENTE 4 marcadores
  // Usar marcadores opostos para calcular escala:
  // [0]=left-top, [1]=right-top, [2]=left-bottom, [3]=right-bottom
  if (detectedMarks.length !== 4) {
    throw new Error(`calculateTransformMatrix requer exatamente 4 marcadores, recebidos: ${detectedMarks.length}`);
  }
  
  // Calcular escala baseada na distância entre marcadores opostos
  const detectedWidth = Math.abs(detectedMarks[1].x - detectedMarks[0].x); // Right - Left
  const detectedHeight = Math.abs(detectedMarks[2].y - detectedMarks[0].y); // Bottom - Top
  const expectedWidth = Math.abs(expectedCenters[1].x - expectedCenters[0].x);
  const expectedHeight = Math.abs(expectedCenters[2].y - expectedCenters[0].y);
  
  const scaleX = expectedWidth > 0 ? detectedWidth / expectedWidth : 1.0;
  const scaleY = expectedHeight > 0 ? detectedHeight / expectedHeight : 1.0;
  
  // Calcular offset
  const offsetX = detectedAvgX - expectedAvgX;
  const offsetY = detectedAvgY - expectedAvgY;
  
  return { scaleX, scaleY, offsetX, offsetY };
}

/**
 * Aplica transformação de calibração a uma coordenada de bolha
 */
function applyCalibrationTransform(
  bubble: OMRBubble,
  transform: { scaleX: number; scaleY: number; offsetX: number; offsetY: number },
  imageWidth: number,
  imageHeight: number
): OMRBubble {
  const calibratedX = (bubble.x * imageWidth * transform.scaleX + transform.offsetX) / imageWidth;
  const calibratedY = (bubble.y * imageHeight * transform.scaleY + transform.offsetY) / imageHeight;
  
  return {
    ...bubble,
    x: calibratedX,
    y: calibratedY,
  };
}

/**
 * Pré-processa imagem para máxima precisão OMR - v5.0
 * Otimizado para cartão-resposta MENOR com máxima sensibilidade
 * - Normalização agressiva de contraste
 * - Aumentar nitidez com valores maiores
 * - Binarização com threshold mais baixo para capturar marcações leves
 * - Remoção de ruído com dilation/erosion
 */
async function preprocessImageForOMR(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .greyscale() // Converter para escala de cinza
    .normalize() // Normalizar brilho/contraste (aplicar 2x para máximo contraste)
    .normalize() // Reforçar normalização para máximo contraste
    .sharpen(2.0, 2, 3) // AUMENTADO: Aumentar nitidez agressivamente
    .modulate({ brightness: 1.05, saturation: 0 }) // Aumentar brilho para melhor diferenciação
    .threshold(100) // REDUZIDO: Binarização com threshold MAIS BAIXO (100 em vez de 110) para capturar marcações leves
    .toBuffer();
}

/**
 * Analisa uma bolha individual com múltiplas métricas
 * Retorna análise detalhada para decisão precisa
 */
function analyzeBubbleAdvanced(
  binaryBuffer: Buffer,
  grayscaleBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  bubble: OMRBubble
): BubbleDetectionResult {
  // Converter coordenadas normalizadas para pixels
  const centerX = Math.round(bubble.x * imageWidth);
  const centerY = Math.round(bubble.y * imageHeight);
  const radiusX = Math.round(bubble.radius * imageWidth);
  const radiusY = Math.round(bubble.radius * imageHeight);
  const calculatedRadius = Math.max(radiusX, radiusY);
  // CRÍTICO: Garantir raio mínimo para análise precisa (evita bolhas muito pequenas)
  const radius = Math.max(calculatedRadius, MIN_BUBBLE_RADIUS_PIXELS);
  
  // Métricas de análise
  let darkPixels = 0;
  let totalPixels = 0;
  let sumDarkness = 0;
  let darkestPixel = 255; // Inicializar com valor mais claro possível
  
  // Analisar região circular da bolha
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // Verificar se está dentro da região circular
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= radius * radius) {
        const x = centerX + dx;
        const y = centerY + dy;
        
        // Verificar limites da imagem
        if (x >= 0 && x < imageWidth && y >= 0 && y < imageHeight) {
          const pixelIndex = y * imageWidth + x;
          const binaryValue = binaryBuffer[pixelIndex]; // Para detectar preenchimento
          const grayscaleValue = grayscaleBuffer[pixelIndex]; // Para calcular escuridão real
          
          totalPixels++;
          
          // Em imagem binária (threshold 110), pixel < 128 = preto (marcado)
          // Usar binário para detectar preenchimento
          if (binaryValue < 128) {
            darkPixels++;
            // CRÍTICO: Usar valor da imagem em escala de cinza (não binária) para calcular escuridão
            // A imagem binária tem apenas 0 ou 255, perdendo informação de escuridão
            sumDarkness += grayscaleValue;
            if (grayscaleValue < darkestPixel) {
              darkestPixel = grayscaleValue;
            }
          }
        }
      }
    }
  }
  
  // Calcular métricas
  const fillRatio = totalPixels > 0 ? darkPixels / totalPixels : 0;
  // Se não há pixels escuros, usar média de todos os pixels da região para escuridão
  const averageDarkness = darkPixels > 0 
    ? sumDarkness / darkPixels 
    : (() => {
        // Calcular média de escuridão de todos os pixels se não há marcação
        let totalDarkness = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared <= radius * radius) {
              const x = centerX + dx;
              const y = centerY + dy;
              if (x >= 0 && x < imageWidth && y >= 0 && y < imageHeight) {
                const pixelIndex = y * imageWidth + x;
                totalDarkness += grayscaleBuffer[pixelIndex];
              }
            }
          }
        }
        return totalPixels > 0 ? totalDarkness / totalPixels : 255;
      })();
  
  // CRÍTICO: Se não há pixels escuros suficientes, considerar como vazio
  // Isso evita falsos positivos por ruído
  // Reduzido para 5 pixels para não bloquear marcações leves mas válidas
  const isMarked = fillRatio >= MIN_FILL_RATIO_FOR_MARKED && darkPixels >= 5; // Mínimo 5 pixels escuros
  
  return {
    questionNumber: bubble.questionNumber,
    option: bubble.option,
    fillRatio,
    averageDarkness,
    darkestPixel,
    isMarked,
    confidence: 0, // Será calculado depois
  };
}

/**
 * Determina resposta para uma questão usando análise adaptativa
 * Compara todas as bolhas da questão para encontrar a mais escura
 */
function determineAnswerForQuestion(
  bubbles: BubbleDetectionResult[],
  questionNumber: number
): { answer: string; confidence: number; debugInfo: BubbleDetectionResult[] } {
  // Ordenar bolhas por "escuridão" (menor averageDarkness = mais escuro)
  // Se empate, usar fillRatio
  const sortedBubbles = [...bubbles].sort((a, b) => {
    // Priorizar averageDarkness (mais confiável)
    if (Math.abs(a.averageDarkness - b.averageDarkness) > 5) {
      return a.averageDarkness - b.averageDarkness; // Menor = mais escuro
    }
    // Se empate, usar fillRatio
    return b.fillRatio - a.fillRatio;
  });
  
  const darkest = sortedBubbles[0];
  const secondDarkest = sortedBubbles[1];
  
  // Calcular threshold adaptativo baseado na média das bolhas vazias
  const emptyBubbles = sortedBubbles.slice(1); // Todas exceto a mais escura
  const avgEmptyDarkness = emptyBubbles.length > 0
    ? emptyBubbles.reduce((sum, b) => sum + b.averageDarkness, 0) / emptyBubbles.length
    : 200; // Fallback
  
  const avgEmptyFillRatio = emptyBubbles.length > 0
    ? emptyBubbles.reduce((sum, b) => sum + b.fillRatio, 0) / emptyBubbles.length
    : 0.15; // Fallback
  
  // VALIDAÇÃO CRÍTICA: A bolha mais escura deve ser SIGNIFICATIVAMENTE mais escura
  const darknessDifference = avgEmptyDarkness - darkest.averageDarkness;
  const fillRatioDifference = darkest.fillRatio - avgEmptyFillRatio;
  
  // Critérios para considerar marcada - v5.0 AGRESSIVO:
  // Detectar TODAS as marcações reais, mesmo que leves
  // 1. Deve ser mais escura que a média das vazias (mínimo)
  // 2. Deve ter fillRatio significativo OU diferença de escuridão
  // 3. darkestPixel deve indicar presença de pixels pretos (< 250)
  // 4. Minimizar falsos negativos (não deixar passar marcações reais)
  const darknessDiff = avgEmptyDarkness - darkest.averageDarkness;
  const isDefinitelyMarked = 
    darknessDiff > 1 && // Pelo menos 1 nível mais escuro (REDUZIDO de 3 para 1)
    darkest.darkestPixel < 250 && // Tem pixels escuros (< 250, mantido)
    darkest.fillRatio > 0.02 && // Mínimo absoluto de preenchimento (2%, reduzido de 4%)
    (
      fillRatioDifference > 0.005 || // OU pelo menos 0.5% mais preenchida (REDUZIDO de 1%)
      darknessDiff > 5 || // OU diferença de escuridão > 5 (reduzido de 10)
      (darknessDiff > 2 && darkest.fillRatio > 0.03) // OU diferença pequena + preenchimento mínimo
    );
  
  let answer = "";
  let confidence = 0;
  
  if (isDefinitelyMarked) {
    answer = darkest.option;
    
    // Calcular confiança baseada na diferença com a segunda bolha
    if (secondDarkest) {
      const darknessGap = secondDarkest.averageDarkness - darkest.averageDarkness;
      const fillGap = darkest.fillRatio - secondDarkest.fillRatio;
      
      // Confiança alta se diferença significativa
      if (darknessGap > 20 && fillGap > 0.15) {
        confidence = 1.0; // 100% de confiança
      } else if (darknessGap > 10 && fillGap > 0.08) {
        confidence = 0.95; // 95% de confiança
      } else {
        confidence = 0.80; // 80% de confiança (ainda confiável, mas menor gap)
      }
    } else {
      confidence = 1.0; // Apenas uma bolha, 100% confiança
    }
    
    // Atualizar confiança na bolha
    darkest.confidence = confidence;
    darkest.isMarked = true;
  } else {
    // Nenhuma bolha claramente marcada
    // Verificar se há alguma com preenchimento mínimo mas válido (fallback para marcações leves)
    // CRÍTICO: Ser ULTRA AGRESSIVO aqui para não perder marcações reais (v5.0)
    const darknessDiff = avgEmptyDarkness - darkest.averageDarkness;
    const hasMinimalMark = 
      darkest.fillRatio > 0.015 && // Mínimo 1.5% de preenchimento (reduzido de 2% - MAIS agressivo)
      darknessDiff > 0.1 && // Deve ser pelo menos 0.1 níveis mais escura (REDUZIDO de 0.5 - MUITO mais agressivo)
      darkest.darkestPixel < 250; // Deve ter pixels escuros
    
    if (hasMinimalMark) {
      // Aceitar marcação leve mas válida
      answer = darkest.option;
      // Aumentar confiança baseado na diferença de escuridão
      if (darknessDiff > 20) {
        confidence = 0.85; // Alta confiança se diferença muito grande
      } else if (darknessDiff > 10) {
        confidence = 0.80; // Boa confiança se diferença grande
      } else if (darknessDiff > 5) {
        confidence = 0.75; // Confiança média-alta
      } else {
        confidence = 0.65; // Confiança média para marcações muito leves
      }
      darkest.isMarked = true;
      darkest.confidence = confidence;
      
      console.log(`[OMR] Questão ${questionNumber}: Marcação leve detectada (${darkest.option}) - confiança ${(confidence * 100).toFixed(0)}%`);
    } else {
      // Última tentativa: se a mais escura é diferente das outras (MUITO agressivo), aceitar - v5.0
      // Reduzido threshold de diferença e fillRatio para máxima sensibilidade
      if (secondDarkest && darkest.averageDarkness < secondDarkest.averageDarkness - 0.1 && darkest.fillRatio > 0.01) {
        // REDUZIDO: threshold de 0.5 para 0.1 e fillRatio de 0.015 para 0.01
        answer = darkest.option;
        confidence = 0.60; // Confiança baixa mas aceitável
        darkest.isMarked = true;
        darkest.confidence = 0.60;
        console.log(`[OMR] Questão ${questionNumber}: Marcação aceita por ser mais escura (${darkest.option}) - confiança ${(confidence * 100).toFixed(0)}%`);
      } else if (darkest.fillRatio > 0.06 && darkest.averageDarkness < 215) {
        // REDUZIDO: fillRatio de 0.08 para 0.06 e darkness de 210 para 215 (ainda mais permissivo)
        answer = darkest.option;
        confidence = 0.55; // Confiança muito baixa mas melhor que nada
        darkest.isMarked = true;
        darkest.confidence = 0.55;
        console.log(`[OMR] Questão ${questionNumber}: Marcação aceita por preenchimento (${darkest.option}) - confiança ${(confidence * 100).toFixed(0)}%`);
      } else if (fillRatioDifference > 0.08 && darkest.fillRatio > 0.12) {
        // CRÍTICO: Se há diferença MUITO significativa de fillRatio (>10%) e fillRatio alto (>15%),
        // aceitar mesmo sem diferença de escuridão (pode ser marcação leve ou ruído na imagem)
        answer = darkest.option;
        confidence = 0.65; // Confiança média-alta baseada apenas em fillRatio
        darkest.isMarked = true;
        darkest.confidence = 0.65;
        console.log(`[OMR] Questão ${questionNumber}: Marcação aceita por diferença significativa de preenchimento (${darkest.option}) - fillRatio diff=${(fillRatioDifference * 100).toFixed(1)}%, confiança ${(confidence * 100).toFixed(0)}%`);
      } else {
        // Nenhuma marcação válida
        answer = ""; // Sem resposta
        confidence = 1.0; // 100% confiança que está vazio
        
        // Log apenas para debug (questões com algum preenchimento mas não suficiente)
        if (darkest.fillRatio > 0.08) {
          console.log(`[OMR] Questão ${questionNumber}: Nenhuma marcação válida`);
          console.log(`  Mais escura: ${darkest.option}, fill=${(darkest.fillRatio * 100).toFixed(1)}%, darkness=${darkest.averageDarkness.toFixed(1)}, darkest=${darkest.darkestPixel}`);
          console.log(`  Média vazias: darkness=${avgEmptyDarkness.toFixed(1)}, fill=${(avgEmptyFillRatio * 100).toFixed(1)}%`);
          console.log(`  Diferenças: darkness=${(avgEmptyDarkness - darkest.averageDarkness).toFixed(1)}, fill=${(fillRatioDifference * 100).toFixed(1)}%`);
        }
      }
    }
  }
  
  // Atualizar todas as bolhas com informações finais
  sortedBubbles.forEach(b => {
    if (b.option === answer && answer !== "") {
      b.isMarked = true;
      b.confidence = confidence;
    }
  });
  
  return {
    answer,
    confidence,
    debugInfo: sortedBubbles,
  };
}

/**
 * Processa uma página OMR com rigor máximo
 */
export async function processOMRPage(
  imageBuffer: Buffer,
  template: OMRTemplate = officialGabaritoTemplate
): Promise<OMRResult> {
  const warnings: string[] = [];
  const debugInfo: { [questionNumber: number]: { bubbles: BubbleDetectionResult[]; selected: string } } = {};
  
  console.log(`[OMR] Iniciando processamento com rigor máximo...`);
  
  // Obter metadados da imagem
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;
  
  if (!width || !height) {
    throw new Error("Não foi possível obter dimensões da imagem");
  }
  
  console.log(`[OMR] Dimensões da imagem: ${width}x${height}`);
  
  // ============================================================================
  // 🔧 LÓGICA DE CALIBRAÇÃO COM MARCADORES DE CANTO
  // ============================================================================
  // CRÍTICO: SOMENTE tenta detectar marcadores se o template tiver EXATAMENTE 4 marcadores definidos
  // Se anchorMarks estiver vazio ou não tiver 4 marcadores, PULA a calibração completamente
  // ============================================================================
  
  let transformMatrix: { scaleX: number; scaleY: number; offsetX: number; offsetY: number } | null = null;
  let finalBubblesToAnalyze: OMRBubble[] = template.bubbles; // Por padrão, usa coordenadas diretas do template
  let calibrationPerformed = false;
  
  // Verificação robusta: EXATAMENTE 4 marcadores (não >= 4)
  if (template.anchorMarks && template.anchorMarks.length === 4) {
    console.log(`[OMR] Tentando detectar marcadores de canto para calibração...`);
    try {
      const detectedMarks = await detectCornerMarkers(imageBuffer, template.anchorMarks, width, height);
      
      if (detectedMarks && detectedMarks.length === 4) {
        console.log(`[OMR] ✅ 4/4 marcadores detectados com sucesso. Calculando transformação...`);
        transformMatrix = calculateTransformMatrix(detectedMarks, template.anchorMarks, width, height);
        
        // Aplicar transformação a todas as bolhas
        finalBubblesToAnalyze = template.bubbles.map(bubble => 
          transformMatrix 
            ? applyCalibrationTransform(bubble, transformMatrix, width, height)
            : bubble
        );
        
        calibrationPerformed = true;
        console.log(`[OMR] ✅ Transformação aplicada: scaleX=${transformMatrix.scaleX.toFixed(3)}, scaleY=${transformMatrix.scaleY.toFixed(3)}, offsetX=${transformMatrix.offsetX.toFixed(1)}, offsetY=${transformMatrix.offsetY.toFixed(1)}`);
      } else {
        console.warn(`[OMR] ⚠️ Aviso: Não foi possível detectar TODOS os 4 marcadores (encontrados: ${detectedMarks?.length || 0}/4), continuando SEM calibração.`);
        // Usa coordenadas originais do template
        finalBubblesToAnalyze = template.bubbles;
      }
    } catch (error) {
      console.error(`[OMR] ❌ ERRO na detecção de marcadores:`, error);
      console.warn(`[OMR] Continuando SEM calibração devido ao erro.`);
      // Usa coordenadas originais do template em caso de erro
      finalBubblesToAnalyze = template.bubbles;
    }
  } else {
    // Se anchorMarks não estiver definido ou não tiver 4 marcas, PULA A CALIBRAÇÃO
    const anchorCount = template.anchorMarks?.length || 0;
    console.log(`[OMR] ℹ️ Nenhum marcador de calibração especificado ou número incorreto (${anchorCount} marcadores). Processando sem calibração.`);
    // Usa coordenadas diretas do template
    finalBubblesToAnalyze = template.bubbles;
  }
  
  // Pré-processar imagem para máxima precisão
  console.log(`[OMR] Pré-processando imagem (binarização, contraste, nitidez)...`);
  const preprocessedBuffer = await preprocessImageForOMR(imageBuffer);
  
  // Converter para buffer binário para análise de preenchimento
  const binaryBuffer = await sharp(preprocessedBuffer)
    .raw()
    .toBuffer();
  
  // CRÍTICO: Também precisamos da imagem em escala de cinza (não binária) para calcular escuridão
  // A binarização converte tudo para 0 ou 255, perdendo informação de escuridão
  const grayscaleBuffer = await sharp(imageBuffer)
    .greyscale()
    .normalize() // Normalizar para máximo contraste
    .normalize() // Reforçar normalização para máximo contraste
    .sharpen(1.5, 1, 2) // Aumentar nitidez da escala de cinza
    .modulate({ brightness: 1.02 }) // Aumentar brilho ligeiramente
    .raw()
    .toBuffer();
  
  // Analisar todas as bolhas usando finalBubblesToAnalyze (coordenadas transformadas ou diretas)
  console.log(`[OMR] Analisando ${finalBubblesToAnalyze.length} bolhas... (Calibração: ${calibrationPerformed ? 'Sim' : 'Não'})`);
  console.log(`[OMR DEBUG] Primeira bolha (Q1A): x=${finalBubblesToAnalyze[0]?.x.toFixed(4)}, y=${finalBubblesToAnalyze[0]?.y.toFixed(4)}, radius=${finalBubblesToAnalyze[0]?.radius.toFixed(4)}`);
  console.log(`[OMR DEBUG] Última bolha (Q90E): x=${finalBubblesToAnalyze[finalBubblesToAnalyze.length - 1]?.x.toFixed(4)}, y=${finalBubblesToAnalyze[finalBubblesToAnalyze.length - 1]?.y.toFixed(4)}`);
  const allBubbles: BubbleDetectionResult[] = [];
  
  // CRÍTICO: Usa finalBubblesToAnalyze que já contém as coordenadas corretas
  // (transformadas se calibração foi aplicada, ou originais se não)
  for (const bubble of finalBubblesToAnalyze) {
    const result = analyzeBubbleAdvanced(binaryBuffer, grayscaleBuffer, width, height, bubble);
    allBubbles.push(result);
  }
  
  // Agrupar bolhas por questão
  const questionGroups: { [key: number]: BubbleDetectionResult[] } = {};
  for (const bubble of allBubbles) {
    if (!questionGroups[bubble.questionNumber]) {
      questionGroups[bubble.questionNumber] = [];
    }
    questionGroups[bubble.questionNumber].push(bubble);
  }
  
  // Determinar resposta para cada questão
  const answers: { [questionNumber: number]: string } = {};
  const answerConfidences: { [questionNumber: number]: number } = {};
  
  console.log(`[OMR] Determinando respostas para ${Object.keys(questionGroups).length} questões...`);
  
  let detectedCount = 0;
  let ambiguousCount = 0;
  let emptyCount = 0;
  
  for (const questionNumber of Object.keys(questionGroups)) {
    const qNum = parseInt(questionNumber, 10);
    const bubbles = questionGroups[qNum];
    
    const { answer, confidence, debugInfo: bubbleDebug } = determineAnswerForQuestion(bubbles, qNum);
    
    answers[qNum] = answer;
    answerConfidences[qNum] = confidence;
    debugInfo[qNum] = {
      bubbles: bubbleDebug,
      selected: answer,
    };
    
    // Contar estatísticas
    if (answer !== "") {
      detectedCount++;
      if (confidence < 0.90) {
        ambiguousCount++;
      }
    } else {
      emptyCount++;
    }
    
    // Log detalhado para questões com baixa confiança OU quando detecta algo
    if (answer !== "" && (confidence < 0.90 || qNum <= 5)) {
      const selectedBubble = bubbleDebug[0];
      const secondBubble = bubbleDebug[1];
      console.log(`[OMR] Questão ${qNum}: ${answer} (confiança ${(confidence * 100).toFixed(1)}%)`);
      console.log(`  Selecionada: ${selectedBubble.option} (darkness=${selectedBubble.averageDarkness.toFixed(1)}, fill=${(selectedBubble.fillRatio * 100).toFixed(1)}%, darkest=${selectedBubble.darkestPixel})`);
      if (secondBubble) {
        console.log(`  Segunda: ${secondBubble.option} (darkness=${secondBubble.averageDarkness.toFixed(1)}, fill=${(secondBubble.fillRatio * 100).toFixed(1)}%)`);
      }
    }
    
    // Adicionar warning se múltiplas bolhas parecem marcadas (mas só se realmente houver múltiplas)
    // Se não há resposta mas há múltiplas bolhas com preenchimento, pode ser um problema de threshold
    if (answer === "" && bubbleDebug.length > 1) {
      const bubblesWithFill = bubbleDebug.filter(b => b.fillRatio > 0.10);
      if (bubblesWithFill.length > 1) {
        warnings.push(`Questão ${qNum}: Múltiplas bolhas com preenchimento detectadas mas nenhuma selecionada (${bubblesWithFill.map(b => `${b.option}:${(b.fillRatio * 100).toFixed(0)}%`).join(", ")})`);
      }
    } else if (answer !== "") {
      const markedBubbles = bubbleDebug.filter(b => b.isMarked && b.option !== answer);
      if (markedBubbles.length > 0) {
        warnings.push(`Questão ${qNum}: Múltiplas marcações detectadas, selecionada: ${answer} (outras: ${markedBubbles.map(b => b.option).join(", ")})`);
      }
    }
  }
  
  // Log resumo
  console.log(`[OMR] Resumo da detecção:`);
  console.log(`  - Respostas detectadas: ${detectedCount}`);
  console.log(`  - Respostas ambíguas: ${ambiguousCount}`);
  console.log(`  - Questões vazias: ${emptyCount}`);
  console.log(`  - Total de questões: ${Object.keys(questionGroups).length}`);
  
  // Gerar array ordenado de respostas
  const detectedAnswers: string[] = [];
  for (let q = 1; q <= template.totalQuestions; q++) {
    detectedAnswers.push(answers[q] || "");
  }
  
  // Calcular confiança geral (apenas questões respondidas)
  const answeredConfidences = Object.entries(answerConfidences)
    .filter(([q]) => answers[parseInt(q, 10)] !== "")
    .map(([, c]) => c);
  
  const overallConfidence = answeredConfidences.length > 0
    ? answeredConfidences.reduce((sum, c) => sum + c, 0) / answeredConfidences.length
    : 1.0;
  
  const answeredCount = Object.values(answers).filter(a => a !== "").length;
  console.log(`[OMR] ========================================`);
  console.log(`[OMR] Processamento concluído:`);
  console.log(`[OMR]   Questões respondidas: ${answeredCount}/${template.totalQuestions} (${((answeredCount/template.totalQuestions)*100).toFixed(1)}%)`);
  console.log(`[OMR]   Confiança média: ${(overallConfidence * 100).toFixed(1)}%`);
  console.log(`[OMR]   Warnings: ${warnings.length}`);
  console.log(`[OMR]   Calibração aplicada: ${calibrationPerformed ? 'Sim' : 'Não'}`);
  console.log(`[OMR]   Dimensões imagem: ${width}x${height}`);
  console.log(`[OMR]   Total de bolhas analisadas: ${allBubbles.length}`);
  console.log(`[OMR] ========================================`);
  
  return {
    answers,
    answerConfidences,
    allBubbles,
    overallConfidence,
    detectedAnswers,
    warnings,
    debugInfo,
  };
}

export async function extractTextRegion(
  imageBuffer: Buffer,
  region: OMRRegion
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;
  
  if (!width || !height) {
    throw new Error("Could not get image dimensions");
  }
  
  const left = Math.round(region.x * width);
  const top = Math.round(region.y * height);
  const regionWidth = Math.round(region.width * width);
  const regionHeight = Math.round(region.height * height);
  
  return sharp(imageBuffer)
    .extract({
      left: Math.max(0, left),
      top: Math.max(0, top),
      width: Math.min(regionWidth, width - left),
      height: Math.min(regionHeight, height - top),
    })
    .toBuffer();
}

export async function preprocessForOCR(imageBuffer: Buffer): Promise<Buffer> {
  // Minimal preprocessing - just upscale without distorting the handwriting
  return sharp(imageBuffer)
    .resize({ width: 500 })
    .toBuffer();
}

// Debug function to visualize bubble detection
export async function createDebugImage(
  imageBuffer: Buffer,
  omrResult: OMRResult,
  template: OMRTemplate = officialGabaritoTemplate
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;
  
  if (!width || !height) {
    throw new Error("Could not get image dimensions");
  }
  
  // Create SVG overlay com TODAS as bolhas do template (não apenas as detectadas)
  // Isso mostra exatamente onde o sistema está procurando
  const circles: string[] = [];
  const labels: string[] = [];
  
  // Desenhar TODAS as bolhas do template
  for (const bubble of template.bubbles) {
    const cx = Math.round(bubble.x * width);
    const cy = Math.round(bubble.y * height);
    const r = Math.round(bubble.radius * Math.max(width, height));
    
    // Encontrar resultado de detecção para esta bolha
    const detection = omrResult.allBubbles.find(
      b => b.questionNumber === bubble.questionNumber && b.option === bubble.option
    );
    
    // Cores baseadas em detecção
    let color = "rgba(255,0,0,0.3)"; // Vermelho transparente = não marcada
    let strokeColor = "red";
    let strokeWidth = 1;
    
    if (detection?.isMarked) {
      if (detection.confidence >= 0.8) {
        color = "rgba(0,255,0,0.5)"; // Verde = marcada com alta confiança
        strokeColor = "green";
        strokeWidth = 2;
      } else if (detection.confidence >= 0.6) {
        color = "rgba(255,255,0,0.4)"; // Amarelo = marcada com confiança média
        strokeColor = "orange";
        strokeWidth = 2;
      } else {
        color = "rgba(255,165,0,0.3)"; // Laranja = marcada com baixa confiança
        strokeColor = "orange";
        strokeWidth = 1;
      }
    }
    
    circles.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.8"/>`
    );
    
    // Adicionar label com número da questão e opção (apenas para algumas para não poluir)
    if (bubble.questionNumber <= 5 || bubble.questionNumber % 15 === 0) {
      labels.push(
        `<text x="${cx}" y="${cy - r - 5}" font-size="10" fill="blue" text-anchor="middle">Q${bubble.questionNumber}${bubble.option}</text>`
      );
    }
  }
  
  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${circles.join("\n")}
      ${labels.join("\n")}
    </svg>
  `);
  
  return sharp(imageBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

