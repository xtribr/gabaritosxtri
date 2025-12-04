import sharp from "sharp";
import { officialGabaritoTemplate, type OMRBubble, type OMRRegion, type OMRTemplate } from "@shared/schema";

interface BubbleDetectionResult {
  questionNumber: number;
  option: string;
  fillRatio: number;
  isMarked: boolean;
  isAmbiguous: boolean;
}

interface OMRResult {
  answers: { [questionNumber: number]: string };
  answerConfidences: { [questionNumber: number]: number };
  allBubbles: BubbleDetectionResult[];
  overallConfidence: number;
  detectedAnswers: string[];
  warnings: string[];
}

interface TextFieldResult {
  name: string;
  value: string;
  confidence: number;
}

export interface FullOMRResult extends OMRResult {
  textFields: TextFieldResult[];
}

// Detection thresholds
// For this template, bubbles are outlined circles - when marked, the fill ratio increases significantly
// Empty bubble outline: ~0.15-0.20, Marked bubble: ~0.45-0.70
const FILL_THRESHOLD_LOW = 0.35;   // Minimum fill ratio to consider marked
const FILL_THRESHOLD_HIGH = 0.50;  // High confidence marked
const EMPTY_BUBBLE_BASELINE = 0.18; // Expected fill ratio for empty bubble outline
const AMBIGUOUS_THRESHOLD_LOW = 0.25; // Below this is definitely empty
const AMBIGUOUS_THRESHOLD_HIGH = 0.35; // Above this is definitely marked

export async function processOMRPage(
  imageBuffer: Buffer,
  template: OMRTemplate = officialGabaritoTemplate
): Promise<OMRResult> {
  const warnings: string[] = [];
  
  // Get image metadata
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;
  
  if (!width || !height) {
    throw new Error("Could not get image dimensions");
  }
  
  // Convert to grayscale for analysis
  const grayBuffer = await sharp(imageBuffer)
    .greyscale()
    .raw()
    .toBuffer();
  
  const allBubbles: BubbleDetectionResult[] = [];
  const answers: { [questionNumber: number]: string } = {};
  const answerConfidences: { [questionNumber: number]: number } = {};
  
  // Analyze each bubble
  for (const bubble of template.bubbles) {
    const result = analyzeBubble(grayBuffer, width, height, bubble);
    allBubbles.push(result);
  }
  
  // Group bubbles by question and determine marked answer
  const questionGroups: { [key: number]: BubbleDetectionResult[] } = {};
  for (const bubble of allBubbles) {
    if (!questionGroups[bubble.questionNumber]) {
      questionGroups[bubble.questionNumber] = [];
    }
    questionGroups[bubble.questionNumber].push(bubble);
  }
  
  // Determine answer for each question
  for (const questionNumber of Object.keys(questionGroups)) {
    const qNum = parseInt(questionNumber, 10);
    const bubbles = questionGroups[qNum];
    const markedBubbles = bubbles.filter((b: BubbleDetectionResult) => b.isMarked);
    const ambiguousBubbles = bubbles.filter((b: BubbleDetectionResult) => b.isAmbiguous);
    
    if (markedBubbles.length === 0) {
      // Check for ambiguous marks
      if (ambiguousBubbles.length > 0) {
        // Ambiguous detection - still likely correct, just lighter marking
        const bestAmbiguous = ambiguousBubbles.sort((a, b) => b.fillRatio - a.fillRatio)[0];
        answers[qNum] = bestAmbiguous.option;
        // Higher confidence for ambiguous - likely the correct answer, just lightly marked
        answerConfidences[qNum] = 0.75;
      } else {
        // No answer marked - blank (not an error, just unanswered)
        answers[qNum] = "";
        answerConfidences[qNum] = 1.0; // High confidence that it's blank
      }
    } else if (markedBubbles.length === 1) {
      // Single answer - clear detection = HIGH confidence
      const marked = markedBubbles[0];
      answers[qNum] = marked.option;
      // If we detected exactly one marked bubble, that's high confidence
      answerConfidences[qNum] = marked.fillRatio >= FILL_THRESHOLD_HIGH ? 1.0 : 0.90;
    } else {
      // Multiple marks - take highest fill ratio
      markedBubbles.sort((a: BubbleDetectionResult, b: BubbleDetectionResult) => b.fillRatio - a.fillRatio);
      const best = markedBubbles[0];
      const secondBest = markedBubbles[1];
      answers[qNum] = best.option;
      // If there's a clear winner (much darker than second), still good confidence
      if (best.fillRatio - secondBest.fillRatio > 0.15) {
        answerConfidences[qNum] = 0.85;
      } else {
        answerConfidences[qNum] = 0.60; // True ambiguity
        warnings.push(`Questão ${qNum}: múltiplas marcações (${markedBubbles.map((b: BubbleDetectionResult) => b.option).join(", ")})`);
      }
    }
  }
  
  // Generate ordered answers array
  const detectedAnswers: string[] = [];
  for (let q = 1; q <= template.totalQuestions; q++) {
    detectedAnswers.push(answers[q] || "");
  }
  
  // Calculate overall confidence - only for answered questions
  const answeredConfidences = Object.entries(answerConfidences)
    .filter(([q]) => answers[parseInt(q, 10)] !== "") // Only answered questions
    .map(([, c]) => c);
  
  const overallConfidence = answeredConfidences.length > 0
    ? answeredConfidences.reduce((sum, c) => sum + c, 0) / answeredConfidences.length
    : 1.0; // If no answers, confidence is 1.0 (correctly detected as empty)
  
  return {
    answers,
    answerConfidences,
    allBubbles,
    overallConfidence,
    detectedAnswers,
    warnings,
  };
}

function analyzeBubble(
  grayBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  bubble: OMRBubble
): BubbleDetectionResult {
  // Convert normalized coordinates to pixels
  const centerX = Math.round(bubble.x * imageWidth);
  const centerY = Math.round(bubble.y * imageHeight);
  const radiusX = Math.round(bubble.radius * imageWidth);
  const radiusY = Math.round(bubble.radius * imageHeight);
  const radius = Math.max(radiusX, radiusY);
  
  // Count dark pixels within the bubble region
  let darkPixels = 0;
  let totalPixels = 0;
  
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // Check if within circular region
      if (dx * dx + dy * dy <= radius * radius) {
        const x = centerX + dx;
        const y = centerY + dy;
        
        // Bounds check
        if (x >= 0 && x < imageWidth && y >= 0 && y < imageHeight) {
          const pixelIndex = y * imageWidth + x;
          const grayValue = grayBuffer[pixelIndex];
          
          totalPixels++;
          // Consider pixel "dark" if below threshold (0=black, 255=white)
          if (grayValue < 128) {
            darkPixels++;
          }
        }
      }
    }
  }
  
  const fillRatio = totalPixels > 0 ? darkPixels / totalPixels : 0;
  
  // Determine mark status with ambiguity detection
  const isMarked = fillRatio >= FILL_THRESHOLD_LOW;
  const isAmbiguous = fillRatio >= AMBIGUOUS_THRESHOLD_LOW && fillRatio < AMBIGUOUS_THRESHOLD_HIGH;
  
  return {
    questionNumber: bubble.questionNumber,
    option: bubble.option,
    fillRatio,
    isMarked,
    isAmbiguous,
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
  
  // Create SVG overlay
  const circles = omrResult.allBubbles.map(bubble => {
    const originalBubble = template.bubbles.find(
      b => b.questionNumber === bubble.questionNumber && b.option === bubble.option
    );
    if (!originalBubble) return "";
    
    const cx = Math.round(originalBubble.x * width);
    const cy = Math.round(originalBubble.y * height);
    const r = Math.round(originalBubble.radius * Math.max(width, height));
    
    const color = bubble.isMarked
      ? (bubble.fillRatio > FILL_THRESHOLD_HIGH ? "green" : "yellow")
      : "red";
    
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="2"/>`;
  }).join("\n");
  
  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}">
      ${circles}
    </svg>
  `);
  
  return sharp(imageBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .toBuffer();
}
