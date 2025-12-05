import { z } from "zod";

export const studentDataSchema = z.object({
  id: z.string(),
  studentNumber: z.string(), // Matrícula (ID único)
  studentName: z.string(),
  turma: z.string().optional(), // Turma do aluno
  answers: z.array(z.string()),
  rawText: z.string().optional(),
  pageNumber: z.number(),
  confidence: z.number().optional(),
  score: z.number().optional(),
  correctAnswers: z.number().optional(),
  wrongAnswers: z.number().optional(),
});

export const questionContentSchema = z.object({
  questionNumber: z.number(), // Número da questão: 1, 2, 3, 4...
  answer: z.string(), // A, B, C, D, E
  content: z.string(), // Ex: "mat - geometria", "port - interpretação"
});

export const answerKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  answers: z.array(z.string()),
  contents: z.array(questionContentSchema).optional(), // Conteúdos por questão
  createdAt: z.string(),
});

export type QuestionContent = z.infer<typeof questionContentSchema>;

export const examTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  totalQuestions: z.number(),
  validAnswers: z.array(z.string()),
  passingScore: z.number(),
  createdAt: z.string(),
});

export const predefinedTemplates: Array<Omit<z.infer<typeof examTemplateSchema>, "id" | "createdAt">> = [
  {
    name: "ENEM",
    description: "Exame Nacional do Ensino Médio - 180 questões",
    totalQuestions: 180,
    validAnswers: ["A", "B", "C", "D", "E"],
    passingScore: 60,
  },
  {
    name: "ENEM - Dia 1",
    description: "ENEM Dia 1 - Linguagens e Ciências Humanas (90 questões)",
    totalQuestions: 90,
    validAnswers: ["A", "B", "C", "D", "E"],
    passingScore: 60,
  },
  {
    name: "ENEM - Dia 2",
    description: "ENEM Dia 2 - Matemática e Ciências da Natureza (90 questões)",
    totalQuestions: 90,
    validAnswers: ["A", "B", "C", "D", "E"],
    passingScore: 60,
  },
  {
    name: "Vestibular FUVEST",
    description: "Vestibular FUVEST - 90 questões",
    totalQuestions: 90,
    validAnswers: ["A", "B", "C", "D", "E"],
    passingScore: 60,
  },
  {
    name: "Vestibular UNICAMP",
    description: "Vestibular UNICAMP - 72 questões",
    totalQuestions: 72,
    validAnswers: ["A", "B", "C", "D", "E"],
    passingScore: 60,
  },
  {
    name: "Prova Bimestral",
    description: "Prova escolar padrão - 20 questões",
    totalQuestions: 20,
    validAnswers: ["A", "B", "C", "D"],
    passingScore: 60,
  },
  {
    name: "Simulado",
    description: "Simulado preparatório - 45 questões",
    totalQuestions: 45,
    validAnswers: ["A", "B", "C", "D", "E"],
    passingScore: 60,
  },
  {
    name: "Personalizado",
    description: "Configure manualmente as opções",
    totalQuestions: 45,
    validAnswers: ["A", "B", "C", "D", "E"],
    passingScore: 60,
  },
];

export const processedPageSchema = z.object({
  pageNumber: z.number(),
  imageUrl: z.string().optional(),
  status: z.enum(["pending", "processing", "completed", "error"]),
  error: z.string().optional(),
  students: z.array(studentDataSchema),
});

export const processingSessionSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  totalPages: z.number(),
  processedPages: z.number(),
  status: z.enum(["uploading", "processing", "completed", "error"]),
  pages: z.array(processedPageSchema),
  createdAt: z.string(),
});

export const examStatisticsSchema = z.object({
  totalStudents: z.number(),
  averageScore: z.number(),
  highestScore: z.number(),
  lowestScore: z.number(),
  passingRate: z.number(),
  questionStats: z.array(z.object({
    questionNumber: z.number(),
    correctCount: z.number(),
    wrongCount: z.number(),
    correctPercentage: z.number(),
    content: z.string().optional(),
  })),
  contentStats: z.array(z.object({
    content: z.string(),
    totalQuestions: z.number(),
    totalErrors: z.number(),
    totalAttempts: z.number(),
    errorPercentage: z.number(),
  })).optional(),
  studentStats: z.array(z.object({
    matricula: z.string(),
    nome: z.string(),
    turma: z.string().optional(),
    acertos: z.number(),
    erros: z.number(),
    nota: z.number(),
  })).optional(),
  turmaStats: z.array(z.object({
    turma: z.string(),
    totalAlunos: z.number(),
    mediaNota: z.number(),
    taxaAprovacao: z.number(),
    totalAcertos: z.number(),
    totalErros: z.number(),
  })).optional(),
});

export type StudentData = z.infer<typeof studentDataSchema>;
export type AnswerKey = z.infer<typeof answerKeySchema>;
export type ExamTemplate = z.infer<typeof examTemplateSchema>;
export type ProcessedPage = z.infer<typeof processedPageSchema>;
export type ProcessingSession = z.infer<typeof processingSessionSchema>;
export type ExamStatistics = z.infer<typeof examStatisticsSchema>;

export const insertStudentDataSchema = studentDataSchema.omit({ id: true });
export type InsertStudentData = z.infer<typeof insertStudentDataSchema>;

export const users = {
  id: "",
  username: "",
  password: "",
};

export type User = typeof users;
export type InsertUser = Omit<User, "id">;

// OMR Template Definitions
export interface OMRRegion {
  x: number;      // normalized 0-1
  y: number;      // normalized 0-1
  width: number;  // normalized 0-1
  height: number; // normalized 0-1
}

export interface OMRBubble {
  questionNumber: number;
  option: string;
  x: number;      // normalized center x 0-1
  y: number;      // normalized center y 0-1
  radius: number; // normalized radius
}

export interface OMRTextField {
  name: string;
  region: OMRRegion;
  type: "text" | "number" | "date";
}

export interface OMRTemplate {
  name: string;
  description: string;
  pageSize: { width: number; height: number }; // in points (A4 = 595 x 842)
  dpi: number;
  totalQuestions: number;
  optionsPerQuestion: string[];
  textFields: OMRTextField[];
  bubbles: OMRBubble[];
  anchorMarks?: OMRRegion[]; // fiducial marks for alignment
}

// Gabarito Oficial Template - Simulado ENEM 90 questões
// Based on analyzed PDF: 1240x1754 pixels at 150 DPI
// Page structure: 6 columns of 15 questions each
export const officialGabaritoTemplate: OMRTemplate = {
  name: "Gabarito Oficial - Simulado ENEM",
  description: "Cartão-resposta oficial do simulado ENEM com 90 questões",
  pageSize: { width: 595.28, height: 841.93 }, // A4 in points
  dpi: 150,
  totalQuestions: 90,
  optionsPerQuestion: ["A", "B", "C", "D", "E"],
  textFields: [
    { name: "nomeCompleto", region: { x: 0.025, y: 0.055, width: 0.46, height: 0.025 }, type: "text" },
    { name: "unidade", region: { x: 0.025, y: 0.088, width: 0.46, height: 0.020 }, type: "text" },
    { name: "dataNascimento", region: { x: 0.025, y: 0.115, width: 0.12, height: 0.018 }, type: "date" },
    { name: "serie", region: { x: 0.595, y: 0.070, width: 0.07, height: 0.018 }, type: "text" },
    { name: "turma", region: { x: 0.695, y: 0.070, width: 0.07, height: 0.018 }, type: "text" },
    { name: "numero", region: { x: 0.795, y: 0.070, width: 0.12, height: 0.018 }, type: "number" },
  ],
  bubbles: generateBubbleCoordinates(),
  anchorMarks: [
    { x: 0.020, y: 0.555, width: 0.025, height: 0.025 }, // left top anchor
    { x: 0.955, y: 0.555, width: 0.025, height: 0.025 }, // right top anchor
    { x: 0.020, y: 0.955, width: 0.025, height: 0.025 }, // left bottom anchor
    { x: 0.955, y: 0.955, width: 0.025, height: 0.025 }, // right bottom anchor
  ],
};

function generateBubbleCoordinates(): OMRBubble[] {
  const bubbles: OMRBubble[] = [];
  const options = ["A", "B", "C", "D", "E"];
  
  // Layout: 6 columns of 15 questions each
  // Questions: 01-15, 16-30, 31-45, 46-60, 61-75, 76-90
  // Calibrated from analyzed image: 1241 x 1755 pixels at 150 DPI
  const columns = [
    { startQuestion: 1, x: 0.0645 },   // Column 1: questions 01-15
    { startQuestion: 16, x: 0.2192 },  // Column 2: questions 16-30
    { startQuestion: 31, x: 0.3731 },  // Column 3: questions 31-45
    { startQuestion: 46, x: 0.5278 },  // Column 4: questions 46-60
    { startQuestion: 61, x: 0.6825 },  // Column 5: questions 61-75
    { startQuestion: 76, x: 0.8372 },  // Column 6: questions 76-90
  ];
  
  const startY = 0.6934;      // Top of answer bubbles area (row 1, question 01)
  const rowHeight = 0.01709;  // Height between rows (~30 pixels)
  const bubbleSpacing = 0.00806; // Horizontal spacing between option bubbles (~10 pixels)
  const bubbleRadius = 0.0046;   // Bubble radius (~8 pixels)
  
  for (const col of columns) {
    for (let row = 0; row < 15; row++) {
      const questionNumber = col.startQuestion + row;
      const y = startY + (row * rowHeight);
      
      for (let optIdx = 0; optIdx < options.length; optIdx++) {
        bubbles.push({
          questionNumber,
          option: options[optIdx],
          x: col.x + (optIdx * bubbleSpacing),
          y,
          radius: bubbleRadius,
        });
      }
    }
  }
  
  return bubbles;
}
