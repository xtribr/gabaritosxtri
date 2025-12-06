import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Download, Trash2, RefreshCw, CheckCircle, AlertCircle, Loader2, X, FileSpreadsheet, ClipboardList, Calculator, BarChart3, Plus, Minus, Info, HelpCircle, Users, FileUp, Eye, Moon, Sun, TrendingUp, Target, UserCheck, Calendar, History, Save, LogOut, Trophy, Lightbulb, Award, BookOpen, Zap, Brain } from "lucide-react";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, ScatterChart, Scatter, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import type { StudentData, ExamStatistics } from "@shared/schema";
import { predefinedTemplates } from "@shared/schema";

type ProcessingStatus = "idle" | "uploading" | "processing" | "completed" | "error";
type FileStatus = "pending" | "processing" | "completed" | "error";

interface PagePreview {
  pageNumber: number;
  imageUrl: string;
}

interface QueuedFile {
  id: string;
  file: File;
  status: FileStatus;
  pageCount: number;
  processedPages: number;
  studentCount: number;
  error?: string;
}

export default function Home() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    
    // Carregar histórico do backend primeiro, com fallback para localStorage
    const carregarHistorico = async () => {
      try {
        // Tentar buscar do backend
        const response = await fetch('/api/avaliacoes');
        if (response.ok) {
          const result = await response.json();
          if (result.avaliacoes && result.avaliacoes.length > 0) {
            setHistoricoAvaliacoes(result.avaliacoes);
            console.log('[Histórico] Carregado do backend:', result.avaliacoes.length, 'registros');
            
            // Sincronizar com localStorage como backup
            try {
              localStorage.setItem('historicoAvaliacoes', JSON.stringify(result.avaliacoes));
            } catch (e) {
              console.warn('Erro ao salvar no localStorage:', e);
            }
            return;
          }
        }
      } catch (error) {
        console.warn('[Histórico] Erro ao buscar do backend, usando localStorage:', error);
      }
      
      // Fallback: carregar do localStorage
      const historicoSalvo = localStorage.getItem('historicoAvaliacoes');
      if (historicoSalvo) {
        try {
          const historico = JSON.parse(historicoSalvo);
          setHistoricoAvaliacoes(historico);
          console.log('[Histórico] Carregado do localStorage:', historico.length, 'registros');
        } catch (e) {
          console.error('Erro ao carregar histórico:', e);
        }
      } else {
        console.log('[Histórico] Nenhum histórico encontrado');
      }
    };
    
    carregarHistorico();
  }, []);
  
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [pagePreviews, setPagePreviews] = useState<PagePreview[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  
  const [answerKey, setAnswerKey] = useState<string[]>([]);
  const [questionContents, setQuestionContents] = useState<Array<{ questionNumber: number; answer: string; content: string }>>([]);
  const [answerKeyDialogOpen, setAnswerKeyDialogOpen] = useState(false);
  const [numQuestions, setNumQuestions] = useState<number>(45);
  const [triScores, setTriScores] = useState<Map<string, number>>(new Map()); // Map<studentId, triScore> - média geral
  const [triScoresByArea, setTriScoresByArea] = useState<Map<string, Record<string, number>>>(new Map()); // Map<studentId, {LC: number, CH: number, CN: number, MT: number}>
  const [triScoresCount, setTriScoresCount] = useState<number>(0); // Contador para forçar atualização do React
  const [triV2Loading, setTriV2Loading] = useState<boolean>(false); // Loading do cálculo TRI V2
  const [triV2Results, setTriV2Results] = useState<any>(null); // Resultados completos do TRI V2
  const [mainActiveTab, setMainActiveTab] = useState<string>("alunos"); // Aba principal: alunos, gabarito, tri, tct, conteudos
  const [aiAnalysis, setAiAnalysis] = useState<string>(""); // Análise gerada pela IA
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState<boolean>(false); // Loading da análise IA
  const [studentAnalyses, setStudentAnalyses] = useState<Map<string, { loading: boolean; analysis: string | null }>>(new Map()); // Análises individuais por aluno
  
  // Histórico de avaliações
  interface AvaliacaoHistorico {
    id: string;
    data: string; // ISO date string
    titulo: string;
    mediaTRI: number;
    totalAlunos: number;
    template: string;
    local?: string; // Ex: "RN"
    // Dados completos para recarregar a aplicação
    students?: StudentData[];
    answerKey?: string[];
    triScores?: Array<[string, number]>; // Array de [studentId, triScore]
    triScoresByArea?: Array<[string, Record<string, number>]>; // Array de [studentId, {LC, CH, CN, MT}]
    selectedTemplateIndex?: number;
  }
  
  const [historicoAvaliacoes, setHistoricoAvaliacoes] = useState<AvaliacaoHistorico[]>([]);
  const [avaliacaoSelecionada, setAvaliacaoSelecionada] = useState<AvaliacaoHistorico | null>(null);
  const [avaliacaoCarregada, setAvaliacaoCarregada] = useState<string | null>(null); // ID da aplicação carregada
  const [avaliacaoParaDeletar, setAvaliacaoParaDeletar] = useState<AvaliacaoHistorico | null>(null); // Avaliação que será deletada
  
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<number>(6);
  const [customValidAnswers, setCustomValidAnswers] = useState<string>("A,B,C,D,E");
  const [passingScore, setPassingScore] = useState<number>(60);
  const [enableOcr, setEnableOcr] = useState<boolean>(false);
  
  // PDF Generation from CSV
  const [mainTab, setMainTab] = useState<"process" | "generate">("process");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ nome: string; turma: string; matricula: string }[]>([]);
  const [csvTotalStudents, setCsvTotalStudents] = useState<number>(0);
  const [csvLoading, setCsvLoading] = useState<boolean>(false);
  const [pdfGenerating, setPdfGenerating] = useState<boolean>(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  
  const selectedTemplate = predefinedTemplates[selectedTemplateIndex];
  const validAnswers = useMemo(() => {
    if (selectedTemplate.name !== "Personalizado") {
      return selectedTemplate.validAnswers;
    }
    const parsed = customValidAnswers
      .split(",")
      .map(a => a.trim().toUpperCase())
      .filter(a => a.length === 1 && /^[A-Z]$/.test(a));
    const deduplicated = Array.from(new Set(parsed));
    return deduplicated.length > 0 ? deduplicated : ["A", "B", "C", "D", "E"];
  }, [selectedTemplate, customValidAnswers]);

  // Extrair turma do aluno (usa campo turma ou extrai do nome)
  const extractTurmaFromStudent = (student: StudentData): string => {
    if (student.turma && student.turma.trim()) return student.turma.trim();
    // Tentar extrair turma do nome (ex: "João Silva - 3º A")
    const turmaMatch = student.studentName.match(/-?\s*([0-9]+[ºª]?\s*[A-Z])/i);
    return turmaMatch ? turmaMatch[1].trim() : "Sem Turma";
  };

  // Função para detectar áreas baseado no template
  const getAreasByTemplate = useCallback((templateName: string, numQuestions: number): Array<{ area: string; start: number; end: number }> => {
    if (templateName === "ENEM - Dia 1") {
      // Dia 1: questões 1-90, LC (1-45) e CH (46-90)
      return [
        { area: "LC", start: 1, end: 45 },   // Linguagens e Códigos
        { area: "CH", start: 46, end: 90 },  // Ciências Humanas
      ];
    } else if (templateName === "ENEM - Dia 2") {
      // Dia 2: questões 1-90, CN (1-45) e MT (46-90)
      // IMPORTANTE: As questões do Dia 2 são numeradas de 1 a 90, não 91-180
      return [
        { area: "CN", start: 1, end: 45 }, // Ciências da Natureza (primeiras 45 questões)
        { area: "MT", start: 46, end: 90 }, // Matemática (últimas 45 questões)
      ];
    } else if (templateName === "ENEM") {
      // ENEM completo: 180 questões
      return [
        { area: "LC", start: 1, end: 45 },
        { area: "CH", start: 46, end: 90 },
        { area: "CN", start: 91, end: 135 },
        { area: "MT", start: 136, end: 180 },
      ];
    }
    return []; // Outros templates não têm áreas definidas
  }, []);

  const studentsWithScores = useMemo(() => {
    if (answerKey.length === 0) return students;
    
    return students.map((student, index) => {
      // Calcular acertos por área (LC, CH, CN, MT)
      // CRÍTICO: PRESERVAR TODOS os acertos já salvos (vindos do Python TRI)
      // Não recalcular áreas que já têm acertos salvos, mesmo que não estejam no template atual
      const existingAreaCorrectAnswers = student.areaCorrectAnswers || {};
      const areaCorrectAnswers: Record<string, number> = { ...existingAreaCorrectAnswers }; // Copiar TODOS os existentes
      
      const areas = getAreasByTemplate(selectedTemplate.name, numQuestions);
      
      // Debug apenas para o primeiro aluno (usar índice, não studentsWithScores)
      const isFirstStudent = index === 0;
      if (isFirstStudent) {
        console.log("🔍 [DEBUG studentsWithScores] ========================================");
        console.log("🔍 [DEBUG studentsWithScores] Aluno:", student.id);
        console.log("🔍 [DEBUG studentsWithScores] Template:", selectedTemplate.name);
        console.log("🔍 [DEBUG studentsWithScores] Áreas do template:", areas);
        console.log("🔍 [DEBUG studentsWithScores] Acertos EXISTENTES (TODOS):", existingAreaCorrectAnswers);
      }
      
      // Calcular apenas para áreas do template atual que ainda não têm acertos salvos
      // IMPORTANTE: Se uma área já tem acertos salvos, NÃO recalcular (mesmo que esteja no template)
      areas.forEach(({ area, start, end }) => {
        // Se já tem acertos salvos para esta área, preservar (vindos do Python)
        // NÃO recalcular mesmo que esteja no template atual
        if (existingAreaCorrectAnswers[area] !== undefined && existingAreaCorrectAnswers[area] !== null) {
          areaCorrectAnswers[area] = existingAreaCorrectAnswers[area];
          if (isFirstStudent) {
            console.log(`🔍 [DEBUG studentsWithScores] - Área ${area}: PRESERVANDO acertos existentes = ${existingAreaCorrectAnswers[area]}`);
          }
          return; // Preservar, não recalcular
        }
        
        // Só calcular se não tiver acertos salvos
        let areaCorrect = 0;
        let areaWrong = 0;
        for (let i = start - 1; i < end && i < student.answers.length; i++) {
          if (i < answerKey.length && student.answers[i] != null && answerKey[i] != null) {
            const normalizedAnswer = String(student.answers[i]).toUpperCase().trim();
            const normalizedKey = String(answerKey[i]).toUpperCase().trim();
            if (normalizedAnswer === normalizedKey) {
              areaCorrect++;
            } else if (normalizedAnswer !== "") {
              areaWrong++;
            }
          }
        }
        areaCorrectAnswers[area] = areaCorrect;
        if (isFirstStudent) {
          console.log(`🔍 [DEBUG studentsWithScores] - Área ${area}: RECALCULADO = ${areaCorrect}`);
        }
      });
      
      // CORREÇÃO CRÍTICA: correctAnswers total = SOMA dos acertos por área
      // Não contar todas as questões, apenas as áreas que têm acertos calculados
      const correctAnswers = (areaCorrectAnswers.LC || 0) + 
                            (areaCorrectAnswers.CH || 0) + 
                            (areaCorrectAnswers.CN || 0) + 
                            (areaCorrectAnswers.MT || 0);
      
      // wrongAnswers = questões que o aluno ERROU (respondeu mas errou)
      // Contar apenas questões que foram respondidas mas estão erradas
      let wrongAnswers = 0;
      student.answers.forEach((answer, idx) => {
        if (idx < answerKey.length && answer != null && answerKey[idx] != null) {
          const normalizedAnswer = String(answer).toUpperCase().trim();
          const normalizedKey = String(answerKey[idx]).toUpperCase().trim();
          // Se respondeu mas está errado (não é acerto e não está vazio)
          if (normalizedAnswer !== "" && normalizedAnswer !== normalizedKey) {
            wrongAnswers++;
          }
        }
      });
      
      // Score TCT: média das notas por área (0-10)
      const areaScores = student.areaScores || {};
      const areaScoresArray: number[] = [];
      if (areaScores.LC !== undefined) areaScoresArray.push(areaScores.LC);
      if (areaScores.CH !== undefined) areaScoresArray.push(areaScores.CH);
      if (areaScores.CN !== undefined) areaScoresArray.push(areaScores.CN);
      if (areaScores.MT !== undefined) areaScoresArray.push(areaScores.MT);
      
      const score = areaScoresArray.length > 0
        ? areaScoresArray.reduce((a, b) => a + b, 0) / areaScoresArray.length
        : correctAnswers > 0 && answerKey.length > 0
        ? Math.round((correctAnswers / answerKey.length) * 1000) / 10 
        : 0;
      
      if (isFirstStudent) {
        console.log("🔍 [DEBUG studentsWithScores] Acertos FINAIS (TODAS as áreas):", areaCorrectAnswers);
        console.log("🔍 [DEBUG studentsWithScores] correctAnswers TOTAL (soma das áreas):", correctAnswers);
        console.log("🔍 [DEBUG studentsWithScores] ========================================");
      }
      
      return {
        ...student,
        score,
        correctAnswers, // CORRIGIDO: Soma dos acertos por área
        wrongAnswers, // CORRIGIDO: Total respondido - acertos
        areaCorrectAnswers, // Preservar acertos existentes + calcular novos se necessário
        // IMPORTANTE: Preservar explicitamente areaScores (TCT) e triScore (TRI) se existirem
        areaScores: student.areaScores, // Notas TCT por área
        triScore: student.triScore, // Nota TRI geral
      };
    });
  }, [students, answerKey, selectedTemplate.name, numQuestions, getAreasByTemplate]);

  const statistics = useMemo((): ExamStatistics | null => {
    if (studentsWithScores.length === 0 || answerKey.length === 0) return null;
    
    const scores = studentsWithScores.map(s => s.score || 0);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);
    const questionStats = answerKey.map((_, qIndex) => {
      let correctCount = 0;
      let wrongCount = 0;
      
      studentsWithScores.forEach(student => {
        if (student.answers[qIndex]) {
          if (student.answers[qIndex].toUpperCase() === answerKey[qIndex].toUpperCase()) {
            correctCount++;
          } else {
            wrongCount++;
          }
        }
      });
      
      const content = questionContents[qIndex]?.content || "";
      
      return {
        questionNumber: qIndex + 1,
        correctCount,
        wrongCount,
        correctPercentage: studentsWithScores.length > 0 
          ? Math.round((correctCount / studentsWithScores.length) * 100) 
          : 0,
        content: content,
      };
    });
    
    // Estatísticas por conteúdo (erros por conteúdo)
    const contentStatsMap = new Map<string, { totalQuestions: number; totalErrors: number; totalAttempts: number }>();
    
    questionContents.forEach((content, qIndex) => {
      if (content.content.trim() && qIndex < answerKey.length) {
        const contentKey = content.content.trim();
        if (!contentStatsMap.has(contentKey)) {
          contentStatsMap.set(contentKey, { totalQuestions: 0, totalErrors: 0, totalAttempts: 0 });
        }
        
        const stats = contentStatsMap.get(contentKey)!;
        stats.totalQuestions++;
        
        studentsWithScores.forEach(student => {
          if (student.answers[qIndex]) {
            stats.totalAttempts++;
            if (student.answers[qIndex].toUpperCase() !== answerKey[qIndex].toUpperCase()) {
              stats.totalErrors++;
            }
          }
        });
      }
    });
    
    const contentStats = Array.from(contentStatsMap.entries()).map(([content, stats]) => ({
      content,
      totalQuestions: stats.totalQuestions,
      totalErrors: stats.totalErrors,
      totalAttempts: stats.totalAttempts,
      errorPercentage: stats.totalAttempts > 0 
        ? Math.round((stats.totalErrors / stats.totalAttempts) * 100 * 10) / 10 
        : 0,
    })).sort((a, b) => b.errorPercentage - a.errorPercentage);
    
    // Estatísticas por aluno (individual)
    const studentStats = studentsWithScores.map(student => {
      const triScore = triScores.get(student.id);
      // TRI está em escala 0-1000, manter o valor original com 1 casa decimal
      const triScoreFormatted = triScore !== undefined ? parseFloat(triScore.toFixed(1)) : null;
      // Nota TCT: score está em porcentagem (0-100), converter para 0,0 a 10,0
      // Cada área tem nota individual de 0,0 a 10,0, e a nota final é a média (também 0,0 a 10,0)
      const notaTCT = student.score ? parseFloat((student.score / 10).toFixed(1)) : 0;
      // Notas TCT por área (LC, CH, CN, MT)
      const areaScores = student.areaScores || {};
      // Notas TRI por área (LC, CH, CN, MT)
      const triAreaScores = triScoresByArea.get(student.id) || {};
      
      // DEBUG: Log triAreaScores para o primeiro aluno
      if (student.id === studentsWithScores[0]?.id) {
        console.log("[studentStats] student.id:", student.id);
        console.log("[studentStats] triScoresByArea.size:", triScoresByArea.size);
        console.log("[studentStats] triAreaScores:", triAreaScores);
        console.log("[studentStats] areaScores:", areaScores);
        console.log("[studentStats] student.triScore:", student.triScore);
      }
      // Acertos por área
      const areaCorrectAnswers = student.areaCorrectAnswers || {};
      return {
        matricula: student.studentNumber,
        nome: student.studentName,
        turma: extractTurmaFromStudent(student),
        acertos: student.correctAnswers || 0,
        erros: student.wrongAnswers || 0,
        nota: notaTCT, // Nota TCT de 0,0 a 10,0 (média)
        triScore: triScoreFormatted,
        lc: areaScores.LC !== undefined ? parseFloat(areaScores.LC.toFixed(1)) : null, // TCT
        ch: areaScores.CH !== undefined ? parseFloat(areaScores.CH.toFixed(1)) : null, // TCT
        cn: areaScores.CN !== undefined ? parseFloat(areaScores.CN.toFixed(1)) : null, // TCT
        mt: areaScores.MT !== undefined ? parseFloat(areaScores.MT.toFixed(1)) : null, // TCT
        triLc: triAreaScores.LC !== undefined ? parseFloat(triAreaScores.LC.toFixed(2)) : null, // TRI
        triCh: triAreaScores.CH !== undefined ? parseFloat(triAreaScores.CH.toFixed(2)) : null, // TRI
        triCn: triAreaScores.CN !== undefined ? parseFloat(triAreaScores.CN.toFixed(2)) : null, // TRI
        triMt: triAreaScores.MT !== undefined ? parseFloat(triAreaScores.MT.toFixed(2)) : null, // TRI
        lcAcertos: areaCorrectAnswers.LC || 0, // Acertos LC
        chAcertos: areaCorrectAnswers.CH || 0, // Acertos CH
        cnAcertos: areaCorrectAnswers.CN || 0, // Acertos CN
        mtAcertos: areaCorrectAnswers.MT || 0, // Acertos MT
      };
    });
    
    // Estatísticas por turma (agrupado)
    const turmaStatsMap = new Map<string, { alunos: typeof studentStats; totalAcertos: number; totalErros: number }>();
    
    studentStats.forEach(student => {
      const turma = student.turma || "Sem Turma";
      if (!turmaStatsMap.has(turma)) {
        turmaStatsMap.set(turma, { alunos: [], totalAcertos: 0, totalErros: 0 });
      }
      
      const turmaData = turmaStatsMap.get(turma)!;
      turmaData.alunos.push(student);
      turmaData.totalAcertos += student.acertos;
      turmaData.totalErros += student.erros;
    });
    
    const turmaStats = Array.from(turmaStatsMap.entries()).map(([turma, data]) => {
      const totalAlunos = data.alunos.length;
      const mediaNota = data.alunos.length > 0
        ? data.alunos.reduce((sum, s) => sum + s.nota, 0) / data.alunos.length
        : 0;
      return {
        turma,
        totalAlunos,
        mediaNota: Math.round(mediaNota * 10) / 10,
        totalAcertos: data.totalAcertos,
        totalErros: data.totalErros,
      };
    }).sort((a, b) => b.mediaNota - a.mediaNota);
    
    return {
      totalStudents: studentsWithScores.length,
      averageScore: Math.round(averageScore * 10) / 10,
      highestScore,
      lowestScore,
      questionStats,
      contentStats: contentStats.length > 0 ? contentStats : undefined,
      studentStats: studentStats.length > 0 ? studentStats : undefined,
      turmaStats: turmaStats.length > 0 ? turmaStats : undefined,
    };
  }, [studentsWithScores, answerKey, passingScore, questionContents, triScores]);

  const scoreDistribution = useMemo(() => {
    if (studentsWithScores.length === 0 || answerKey.length === 0) return [];
    
    const ranges = [
      { name: "0-20%", min: 0, max: 20, count: 0, color: "#ef4444" },
      { name: "21-40%", min: 21, max: 40, count: 0, color: "#f97316" },
      { name: "41-60%", min: 41, max: 60, count: 0, color: "#eab308" },
      { name: "61-80%", min: 61, max: 80, count: 0, color: "#22c55e" },
      { name: "81-100%", min: 81, max: 100, count: 0, color: "#10b981" },
    ];
    
    studentsWithScores.forEach(student => {
      const score = student.score || 0;
      for (const range of ranges) {
        if (score >= range.min && score <= range.max) {
          range.count++;
          break;
        }
      }
    });
    
    return ranges;
  }, [studentsWithScores, answerKey]);

  const confidenceDistribution = useMemo(() => {
    if (studentsWithScores.length === 0) return [];
    
    let high = 0, medium = 0, low = 0, unknown = 0;
    
    studentsWithScores.forEach(student => {
      if (student.confidence === undefined) {
        unknown++;
      } else if (student.confidence >= 80) {
        high++;
      } else if (student.confidence >= 60) {
        medium++;
      } else {
        low++;
      }
    });
    
    return [
      { name: "Alta (80%+)", value: high, color: "#22c55e" },
      { name: "Média (60-79%)", value: medium, color: "#eab308" },
      { name: "Baixa (<60%)", value: low, color: "#ef4444" },
    ].filter(d => d.value > 0);
  }, [studentsWithScores]);

  // Configurar worker do PDF.js uma vez
  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
  }, []);

  const loadPdfPreview = async (pdfFile: File) => {
    try {
      console.log("[FRONTEND] Iniciando carregamento do PDF:", pdfFile.name, `(${(pdfFile.size / 1024 / 1024).toFixed(2)}MB)`);
      
      if (!pdfFile || pdfFile.size === 0) {
        throw new Error("Arquivo PDF inválido ou vazio");
      }
      
      console.log("[FRONTEND] PDF.js versão:", pdfjsLib.version);

      console.log("[FRONTEND] Lendo arquivo...");
      const arrayBuffer = await pdfFile.arrayBuffer();
      console.log("[FRONTEND] ArrayBuffer criado, tamanho:", arrayBuffer.byteLength);
      
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error("Arquivo PDF está vazio ou corrompido");
      }
      
      console.log("[FRONTEND] Criando documento PDF...");
      const loadingTask = pdfjsLib.getDocument({ 
        data: new Uint8Array(arrayBuffer),
        verbosity: 0 // Reduzir logs
      });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      console.log("[FRONTEND] PDF carregado com", numPages, "páginas");

      if (numPages === 0) {
        throw new Error("PDF não contém páginas válidas");
      }

      const previews: PagePreview[] = [];
      for (let i = 1; i <= Math.min(numPages, 8); i++) {
        try {
          const page = await pdf.getPage(i);
          const scale = 0.3;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          
          if (!context) {
            console.warn(`[FRONTEND] Não foi possível obter contexto do canvas para página ${i}`);
            continue;
          }
          
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({
            canvasContext: context,
            viewport: viewport,
          } as any).promise;
          
          previews.push({
            pageNumber: i,
            imageUrl: canvas.toDataURL("image/jpeg", 0.7),
          });
        } catch (pageError) {
          console.error(`[FRONTEND] Erro ao processar página ${i}:`, pageError);
          // Continua com as outras páginas
        }
      }
      
      return { numPages, previews };
    } catch (error) {
      console.error("[FRONTEND] Erro ao carregar PDF:", error);
      throw error;
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const validPdfs = acceptedFiles.filter(f => f.type === "application/pdf");
    
    if (validPdfs.length === 0) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione arquivos PDF.",
        variant: "destructive",
      });
      return;
    }

    if (validPdfs.length > 1) {
      setIsBatchMode(true);
      const newQueue: QueuedFile[] = [];
      
      for (const pdfFile of validPdfs) {
        try {
          const { numPages } = await loadPdfPreview(pdfFile);
          newQueue.push({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            file: pdfFile,
            status: "pending",
            pageCount: numPages,
            processedPages: 0,
            studentCount: 0,
          });
        } catch (error) {
          newQueue.push({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            file: pdfFile,
            status: "error",
            pageCount: 0,
            processedPages: 0,
            studentCount: 0,
            error: "Erro ao carregar PDF",
          });
        }
      }
      
      setFileQueue(newQueue);
      setFile(null);
      setPagePreviews([]);
      setPageCount(0);
      setStudents([]);
      setStatus("idle");
      
      toast({
        title: "Modo em lote",
        description: `${validPdfs.length} arquivos carregados. Clique em "Processar Todos" para iniciar.`,
      });
    } else {
      setIsBatchMode(false);
      setFileQueue([]);
      const pdfFile = validPdfs[0];
      setFile(pdfFile);
      setStatus("uploading");
      setProgress(0);
      setStudents([]);
      setErrorMessage("");

      try {
        const { numPages, previews } = await loadPdfPreview(pdfFile);
        if (numPages === 0) {
          throw new Error("PDF não contém páginas válidas");
        }
        setPageCount(numPages);
        setPagePreviews(previews);
        setStatus("idle");
        setProgress(100);
        setErrorMessage(""); // Limpar mensagem de erro anterior
      } catch (error) {
        console.error("Error loading PDF:", error);
        setStatus("error");
        const errorMessage = error instanceof Error 
          ? error.message 
          : "Erro ao carregar o PDF. Por favor, tente novamente.";
        setErrorMessage(errorMessage);
        setPageCount(0);
        setPagePreviews([]);
        toast({
          title: "Erro ao carregar PDF",
          description: error instanceof Error ? error.message : "Não foi possível processar o arquivo.",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
    multiple: true,
  });

  const handleProcess = async () => {
    if (!file) return;

    console.log("[PROCESS] Iniciando processamento...");
    setStatus("processing");
    setProgress(0);
    setCurrentPage(0);
    setStudents([]);
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("enableOcr", enableOcr.toString());

      console.log("[PROCESS] Enviando requisição... (OCR:", enableOcr ? "ativado" : "desativado", ")");
      const response = await fetch("/api/process-pdf", {
        method: "POST",
        body: formData,
      });

      console.log("[PROCESS] Resposta recebida, status:", response.status);

      if (!response.ok) {
        throw new Error("Erro ao processar PDF");
      }

      const { jobId } = await response.json();
      console.log("[PROCESS] Job criado:", jobId);

      // Poll for progress
      const pollInterval = 1000; // 1 second
      let lastProgress = 0;

      const poll = async () => {
        try {
          const statusRes = await fetch(`/api/process-pdf/${jobId}/status`);
          if (!statusRes.ok) throw new Error("Erro ao verificar status");
          
          const status = await statusRes.json();
          console.log(`[PROCESS] Status: ${status.status}, progresso: ${status.progress}%, página: ${status.currentPage}/${status.totalPages}`);
          
          if (status.progress !== lastProgress) {
            setProgress(status.progress);
            setCurrentPage(status.currentPage);
            lastProgress = status.progress;
          }

          if (status.status === "completed") {
            // Fetch final results
            const resultsRes = await fetch(`/api/process-pdf/${jobId}/results`);
            if (!resultsRes.ok) throw new Error("Erro ao obter resultados");
            
            const results = await resultsRes.json();
            console.log(`[PROCESS] Concluído! ${results.students.length} alunos`);
            
            setStudents(results.students);
            setStatus("completed");
            setProgress(100);
            toast({
              title: "Processamento concluído",
              description: `${results.students.length} aluno${results.students.length !== 1 ? "s" : ""} encontrado${results.students.length !== 1 ? "s" : ""}.`,
            });
            return;
          }

          if (status.status === "error") {
            throw new Error(status.errorMessage || "Erro no processamento");
          }

          // Continue polling
          setTimeout(poll, pollInterval);
        } catch (pollError) {
          console.error("[PROCESS] Erro no polling:", pollError);
          setStatus("error");
          setErrorMessage(pollError instanceof Error ? pollError.message : "Erro desconhecido");
          toast({
            title: "Erro no processamento",
            description: "Não foi possível processar o gabarito.",
            variant: "destructive",
          });
        }
      };

      // Start polling
      poll();
    } catch (error) {
      console.error("[PROCESS] ERRO:", error);
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Erro desconhecido");
      toast({
        title: "Erro no processamento",
        description: "Não foi possível processar o gabarito.",
        variant: "destructive",
      });
    }
  };

  const handleGenerateAIAnalysis = async () => {
    if (triScoresCount === 0) {
      toast({
        title: "Sem dados TRI",
        description: "Calcule as notas TRI primeiro para gerar análise.",
        variant: "destructive",
      });
      return;
    }

    setAiAnalysisLoading(true);
    try {
      // Calcular médias e estatísticas agregadas da turma
      const triScoresArray = Array.from(triScores.values());
      const triGeral = triScoresArray.length > 0 
        ? triScoresArray.reduce((a, b) => a + b, 0) / triScoresArray.length 
        : 0;

      // Calcular médias por área
      const areas = ['LC', 'CH', 'CN', 'MT'];
      const triByArea: Record<string, number> = {};
      let totalAcertos = 0;
      let totalErros = 0;
      let totalNota = 0;

      areas.forEach(area => {
        const scores = Array.from(triScoresByArea.values())
          .map(scores => scores[area])
          .filter(score => typeof score === 'number' && score > 0);
        
        if (scores.length > 0) {
          triByArea[area] = scores.reduce((a, b) => a + b, 0) / scores.length;
        } else {
          triByArea[area] = 0;
        }
      });

      // Calcular acertos/erros totais
      students.forEach(student => {
        if (answerKey.length > 0 && student.answers) {
          const correct = student.answers.filter((ans, idx) => 
            idx < answerKey.length && ans && answerKey[idx] && 
            String(ans).toUpperCase().trim() === String(answerKey[idx]).toUpperCase().trim()
          ).length;
          totalAcertos += correct;
          totalErros += (answerKey.length - correct);
          totalNota += (correct / answerKey.length) * 1000;
        }
      });

      // Obter ano da prova do template selecionado (assumindo que está no template)
      const anoProva = selectedTemplate?.ano || new Date().getFullYear() - 1; // Default: ano anterior

      // Preparar respostas agregadas (primeiro aluno como exemplo, ou média)
      const respostasAluno = students.length > 0 && students[0].answers 
        ? students[0].answers 
        : [];

      // Preparar dados para enviar à nova rota
      const payload = {
        respostasAluno: respostasAluno,
        tri: triGeral,
        triGeral: triGeral,
        triLc: triByArea['LC'] || 0,
        triCh: triByArea['CH'] || 0,
        triCn: triByArea['CN'] || 0,
        triMt: triByArea['MT'] || 0,
        anoProva: anoProva,
        serie: "Ensino Médio", // Pode ser ajustado
        nomeAluno: `Turma - ${students.length} alunos`,
        matricula: "N/A",
        turma: "Turma Completa",
        acertos: Math.round(totalAcertos / students.length),
        erros: Math.round(totalErros / students.length),
        nota: students.length > 0 ? totalNota / students.length : 0,
        infoExtra: {
          totalAlunos: students.length,
          triScores: Object.fromEntries(Array.from(triScores.entries())),
          triScoresByArea: Object.fromEntries(
            Array.from(triScoresByArea.entries()).map(([studentId, areaScores]) => [
              studentId,
              areaScores
            ])
          ),
          mediaTRI: triGeral,
          mediasPorArea: triByArea,
        }
      };

      const response = await fetch("/api/analise-enem-tri", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(errorData.error || errorData.details || "Erro ao gerar análise");
      }

      const data = await response.json();
      
      if (data.analysis) {
        setAiAnalysis(data.analysis);
        toast({
          title: "Análise gerada!",
          description: "A análise pedagógica foi criada com sucesso pela IA.",
        });
      } else {
        throw new Error("Resposta da IA não contém análise");
      }
    } catch (error) {
      console.error("Error generating AI analysis:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  // Analisar perfil individual do aluno (coerência pedagógica)
  const handleAnalyzeStudentProfile = async (student: StudentData, index: number) => {
    // Verificar se o aluno tem TRI calculado
    const studentTri = triScores.get(student.id);
    const studentTriByArea = triScoresByArea.get(student.id);
    
    if (!studentTri && !studentTriByArea) {
      toast({
        title: "TRI não calculado",
        description: "Calcule a TRI deste aluno primeiro.",
        variant: "destructive",
      });
      return;
    }

    // Atualizar estado de loading
    setStudentAnalyses(prev => {
      const newMap = new Map(prev);
      newMap.set(student.id, { loading: true, analysis: null });
      return newMap;
    });

    try {
      // Calcular coerência pedagógica (fácil, média, difícil)
      const questionStats = statistics?.questionStats || [];
      let errosFacil = 0, errosMedia = 0, errosDificil = 0;
      let totalFacil = 0, totalMedia = 0, totalDificil = 0;

      student.answers.forEach((answer, qIndex) => {
        if (qIndex >= answerKey.length) return;
        
        const questionStat = questionStats[qIndex];
        if (!questionStat) return;

        const correctPercentage = questionStat.correctPercentage;
        const isCorrect = answer && answer.toUpperCase().trim() === answerKey[qIndex].toUpperCase().trim();
        
        // Classificar dificuldade: fácil (>70%), média (40-70%), difícil (<40%)
        if (correctPercentage >= 70) {
          totalFacil++;
          if (!isCorrect) errosFacil++;
        } else if (correctPercentage >= 40) {
          totalMedia++;
          if (!isCorrect) errosMedia++;
        } else {
          totalDificil++;
          if (!isCorrect) errosDificil++;
        }
      });

      const percentErrosFacil = totalFacil > 0 ? Math.round((errosFacil / totalFacil) * 100) : 0;
      const percentErrosMedia = totalMedia > 0 ? Math.round((errosMedia / totalMedia) * 100) : 0;
      const percentErrosDificil = totalDificil > 0 ? Math.round((errosDificil / totalDificil) * 100) : 0;

      // Calcular acertos/erros
      let acertos = 0, erros = 0;
      student.answers.forEach((answer, qIndex) => {
        if (qIndex < answerKey.length && answer) {
          if (answer.toUpperCase().trim() === answerKey[qIndex].toUpperCase().trim()) {
            acertos++;
          } else {
            erros++;
          }
        }
      });

      const nota = answerKey.length > 0 ? (acertos / answerKey.length) * 1000 : 0;
      const anoProva = selectedTemplate?.ano || new Date().getFullYear() - 1;

      // Preparar payload para análise individual
      const payload = {
        respostasAluno: student.answers,
        tri: studentTri || 0,
        triGeral: studentTri || 0,
        triLc: studentTriByArea?.LC || 0,
        triCh: studentTriByArea?.CH || 0,
        triCn: studentTriByArea?.CN || 0,
        triMt: studentTriByArea?.MT || 0,
        anoProva: anoProva,
        serie: "Ensino Médio",
        nomeAluno: student.studentName,
        matricula: student.studentNumber,
        turma: student.turma || "N/A",
        acertos: acertos,
        erros: erros,
        nota: nota,
        infoExtra: {
          coerenciaPedagogica: {
            errosFacil: `${percentErrosFacil}%`,
            errosMedia: `${percentErrosMedia}%`,
            errosDificil: `${percentErrosDificil}%`,
            totalFacil: totalFacil,
            totalMedia: totalMedia,
            totalDificil: totalDificil,
          }
        }
      };

      const response = await fetch("/api/analise-enem-tri", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(errorData.error || errorData.details || "Erro ao gerar análise");
      }

      const data = await response.json();
      
      if (data.analysis) {
        // Mostrar análise completa (sem cortar)
        const analysisText = data.analysis;
        
        setStudentAnalyses(prev => {
          const newMap = new Map(prev);
          newMap.set(student.id, { loading: false, analysis: analysisText });
          return newMap;
        });
      } else {
        throw new Error("Resposta da IA não contém análise");
      }
    } catch (error) {
      console.error("Error analyzing student profile:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
      setStudentAnalyses(prev => {
        const newMap = new Map(prev);
        newMap.set(student.id, { loading: false, analysis: null });
        return newMap;
      });
    }
  };

  // Função para remover emojis e caracteres Unicode não suportados
  const removeUnsupportedChars = (text: string): string => {
    // Remove emojis e caracteres Unicode não suportados pelo WinAnsi
    // Mantém apenas caracteres ASCII e alguns caracteres especiais comuns
    return text
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emojis
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transporte e símbolos
      .replace(/[\u{2600}-\u{26FF}]/gu, '') // Símbolos diversos
      .replace(/[\u{2700}-\u{27BF}]/gu, '') // Dingbats
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Suplemento de emojis
      .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '') // Extensão de emojis
      .replace(/[^\x00-\x7F]/g, (char) => {
        // Substitui caracteres acentuados por versões sem acento quando possível
        const map: Record<string, string> = {
          'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
          'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
          'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
          'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
          'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
          'ç': 'c', 'ñ': 'n',
          'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
          'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
          'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
          'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
          'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
          'Ç': 'C', 'Ñ': 'N',
        };
        return map[char] || '';
      })
      .trim();
  };

  // Gerar PDF da análise individual do aluno
  const handleGenerateAnalysisPDF = async (student: StudentData, analysis: string) => {
    try {
      const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.create();
      
      // Fontes
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Cores
      const orangeColor = rgb(0.9569, 0.6471, 0.3765); // #f4a55e (laranja)
      const darkColor = rgb(0.2, 0.2, 0.2);
      const grayColor = rgb(0.5, 0.5, 0.5);
      
      // Adicionar página
      const page = pdfDoc.addPage([595, 842]); // A4
      const { width, height } = page.getSize();
      
      let yPosition = height - 50;
      const margin = 50;
      const lineHeight = 14;
      const titleSize = 16;
      const subtitleSize = 12;
      const textSize = 10;
      
      // Cabeçalho
      page.drawText("CorrigeAI", {
        x: margin,
        y: yPosition,
        size: titleSize,
        font: fontBold,
        color: orangeColor,
      });
      
      page.drawText("powered by XTRI", {
        x: margin + 80,
        y: yPosition,
        size: 10,
        font: font,
        color: grayColor,
      });
      
      yPosition -= 30;
      
      // Linha separadora
      page.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: width - margin, y: yPosition },
        thickness: 1,
        color: grayColor,
      });
      
      yPosition -= 20;
      
      // Informações do aluno
      page.drawText(`Aluno: ${student.studentName}`, {
        x: margin,
        y: yPosition,
        size: subtitleSize,
        font: fontBold,
        color: darkColor,
      });
      
      yPosition -= lineHeight;
      
      page.drawText(`Matrícula: ${student.studentNumber}`, {
        x: margin,
        y: yPosition,
        size: textSize,
        font: font,
        color: darkColor,
      });
      
      yPosition -= lineHeight;
      
      if (student.turma) {
        page.drawText(`Turma: ${student.turma}`, {
          x: margin,
          y: yPosition,
          size: textSize,
          font: font,
          color: darkColor,
        });
        yPosition -= lineHeight;
      }
      
      // Notas TRI
      const studentTri = triScores.get(student.id);
      const studentTriByArea = triScoresByArea.get(student.id);
      
      if (studentTri || studentTriByArea) {
        yPosition -= 10;
        page.drawText("Notas TRI:", {
          x: margin,
          y: yPosition,
          size: subtitleSize,
          font: fontBold,
          color: darkColor,
        });
        yPosition -= lineHeight;
        
        if (studentTri) {
          page.drawText(`TRI Geral: ${studentTri.toFixed(2)}`, {
            x: margin + 20,
            y: yPosition,
            size: textSize,
            font: font,
            color: darkColor,
          });
          yPosition -= lineHeight;
        }
        
        if (studentTriByArea) {
          const areas = [
            { key: 'LC', name: 'Linguagens e Códigos' },
            { key: 'CH', name: 'Ciências Humanas' },
            { key: 'CN', name: 'Ciências da Natureza' },
            { key: 'MT', name: 'Matemática' },
          ];
          
          areas.forEach(area => {
            const score = studentTriByArea[area.key];
            if (score) {
              page.drawText(`${area.name}: ${score.toFixed(2)}`, {
                x: margin + 20,
                y: yPosition,
                size: textSize,
                font: font,
                color: darkColor,
              });
              yPosition -= lineHeight;
            }
          });
        }
      }
      
      yPosition -= 15;
      
      // Linha separadora
      page.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: width - margin, y: yPosition },
        thickness: 1,
        color: grayColor,
      });
      
      yPosition -= 20;
      
      // Análise formatada
      const analysisLines = analysis.split('\n');
      let currentY = yPosition;
      let currentPage = page;
      
      const drawTextOnPage = (text: string, x: number, y: number, options: { size?: number; font?: any; color?: any; bold?: boolean } = {}) => {
        const finalFont = options.bold ? fontBold : (options.font || font);
        const finalSize = options.size || textSize;
        const finalColor = options.color || darkColor;
        
        // Remover caracteres não suportados antes de desenhar
        const cleanText = removeUnsupportedChars(text);
        
        if (cleanText) {
          currentPage.drawText(cleanText, {
            x,
            y,
            size: finalSize,
            font: finalFont,
            color: finalColor,
          });
        }
      };
      
      for (const line of analysisLines) {
        // Verificar se precisa de nova página
        if (currentY < margin + 50) {
          currentPage = pdfDoc.addPage([595, 842]);
          currentY = height - 50;
        }
        
        // Formatar linha
        if (line.startsWith('## ')) {
          // Título principal
          const titleText = removeUnsupportedChars(line.replace('## ', ''));
          drawTextOnPage(titleText, margin, currentY, {
            size: subtitleSize,
            bold: true,
            color: orangeColor,
          });
          currentY -= lineHeight + 5;
        } else if (line.startsWith('### ')) {
          // Subtítulo
          const subtitleText = removeUnsupportedChars(line.replace('### ', ''));
          drawTextOnPage(subtitleText, margin + 10, currentY, {
            size: textSize + 1,
            bold: true,
          });
          currentY -= lineHeight + 3;
        } else if (line.trim().startsWith('- ')) {
          // Lista - usar bullet simples ASCII
          drawTextOnPage('-', margin + 10, currentY);
          
          // Remover negrito temporariamente para calcular largura
          let text = line.replace(/^\s*-\s*/, '').replace(/\*\*/g, '');
          text = removeUnsupportedChars(text);
          const maxWidth = width - margin * 2 - 20;
          
          // Quebrar texto se necessário
          const words = text.split(' ');
          let currentLine = '';
          let xPos = margin + 20;
          
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const textWidth = font.widthOfTextAtSize(testLine, textSize);
            
            if (textWidth > maxWidth && currentLine) {
              drawTextOnPage(currentLine, xPos, currentY);
              currentY -= lineHeight;
              currentLine = word;
              
              if (currentY < margin + 50) {
                currentPage = pdfDoc.addPage([595, 842]);
                currentY = height - 50;
                xPos = margin + 20;
              }
            } else {
              currentLine = testLine;
            }
          }
          
          if (currentLine) {
            drawTextOnPage(currentLine, xPos, currentY);
            currentY -= lineHeight;
          }
        } else if (line.trim()) {
          // Texto normal
          let text = line.replace(/\*\*/g, '');
          text = removeUnsupportedChars(text);
          const maxWidth = width - margin * 2;
          
          // Quebrar texto longo
          const words = text.split(' ');
          let currentLine = '';
          
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const textWidth = font.widthOfTextAtSize(testLine, textSize);
            
            if (textWidth > maxWidth && currentLine) {
              drawTextOnPage(currentLine, margin, currentY);
              currentY -= lineHeight;
              currentLine = word;
              
              if (currentY < margin + 50) {
                currentPage = pdfDoc.addPage([595, 842]);
                currentY = height - 50;
              }
            } else {
              currentLine = testLine;
            }
          }
          
          if (currentLine) {
            drawTextOnPage(currentLine, margin, currentY);
            currentY -= lineHeight;
          }
        } else {
          // Linha vazia
          currentY -= lineHeight / 2;
        }
        
        if (currentY < margin + 50) {
          currentPage = pdfDoc.addPage([595, 842]);
          currentY = height - 50;
        }
      }
      
      // Rodapé em todas as páginas
      const allPages = pdfDoc.getPages();
      allPages.forEach((pdfPage, index) => {
        pdfPage.drawText(`CorrigeAI - powered by XTRI | Página ${index + 1} de ${allPages.length}`, {
          x: margin,
          y: 30,
          size: 8,
          font: font,
          color: grayColor,
        });
      });
      
      // Salvar PDF
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Analise_${student.studentName.replace(/\s+/g, '_')}_${student.studentNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({
        title: "PDF gerado!",
        description: `Análise de ${student.studentName} salva com sucesso.`,
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Erro ao gerar PDF",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const handleExportExcel = async () => {
    if (studentsWithScores.length === 0) {
      toast({
        title: "Nenhum dado",
        description: "Processe um PDF primeiro para exportar.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Converter Maps para objetos serializáveis
      const triScoresObj = triScores.size > 0 
        ? Object.fromEntries(Array.from(triScores.entries())) 
        : undefined;
      
      const triScoresByAreaObj = triScoresByArea.size > 0
        ? Object.fromEntries(
            Array.from(triScoresByArea.entries()).map(([studentId, areaScores]) => [
              studentId,
              areaScores
            ])
          )
        : undefined;

      console.log("[EXPORT] triScoresObj:", triScoresObj);
      console.log("[EXPORT] triScoresByAreaObj:", triScoresByAreaObj);

      const response = await fetch("/api/export-excel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          students: studentsWithScores,
          answerKey: answerKey.length > 0 ? answerKey : undefined,
          questionContents: questionContents.length > 0 ? questionContents : undefined,
          statistics: statistics || undefined,
          includeTRI: triScores.size > 0,
          triScores: triScoresObj,
          triScoresByArea: triScoresByAreaObj,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Erro desconhecido" }));
        console.error("[EXPORT] Erro do servidor:", errorData);
        throw new Error(errorData.error || errorData.details || "Erro na exportação");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gabarito_enem_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Exportação concluída",
        description: "O arquivo Excel foi baixado com sucesso.",
      });
    } catch (error) {
      console.error("Error exporting Excel:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      toast({
        title: "Erro na exportação",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleExportScannedAnswers = () => {
    if (students.length === 0) {
      toast({
        title: "Nenhum dado",
        description: "Processe um PDF primeiro para exportar as respostas escaneadas.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Criar workbook
      const wb = XLSX.utils.book_new();

      // Obter o número máximo de questões
      const maxQuestions = Math.max(
        ...students.map(s => Object.keys(s.answers || {}).length),
        0
      );

      // Criar headers: #, MATRICULA, NOME, TURMA, Q1, Q2, Q3...
      const headers = ['#', 'MATRICULA', 'NOME', 'TURMA'];

      // Adicionar colunas de questões
      for (let i = 1; i <= maxQuestions; i++) {
        headers.push(`Q${i}`);
      }

      // Criar dados
      const data = [headers];
      
      students.forEach((student, index) => {
        const row: any[] = [
          index + 1,                 // # (número de ordem)
          student.studentNumber || '', // MATRICULA
          student.studentName || '',   // NOME
          student.turma || ''          // TURMA
        ];

        // Adicionar respostas
        for (let i = 1; i <= maxQuestions; i++) {
          const answer = student.answers?.[i.toString()] || '';
          row.push(answer);
        }

        data.push(row);
      });

      // Criar worksheet
      const ws = XLSX.utils.aoa_to_sheet(data);

      // Configurar largura das colunas
      const colWidths = [
        { wch: 5 },  // #
        { wch: 15 }, // MATRICULA
        { wch: 30 }, // NOME
        { wch: 15 }, // TURMA
      ];

      // Questões com largura menor
      for (let i = 0; i < maxQuestions; i++) {
        colWidths.push({ wch: 5 });
      }

      ws['!cols'] = colWidths;

      // Adicionar worksheet ao workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Gabaritos');

      // Gerar e baixar arquivo
      const fileName = `gabaritos_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast({
        title: "Exportação concluída",
        description: `${students.length} aluno(s) exportado(s) com ${maxQuestions} questões.`,
      });
    } catch (error) {
      console.error("Error exporting scanned answers:", error);
      toast({
        title: "Erro na exportação",
        description: "Não foi possível exportar as respostas escaneadas.",
        variant: "destructive",
      });
    }
  };

  // Função para salvar aplicação manualmente
  const handleSalvarAplicacao = () => {
    if (students.length === 0) {
      toast({
        title: "Nenhum dado para salvar",
        description: "Processe um PDF e calcule o TRI antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    if (triScores.size === 0) {
      toast({
        title: "TRI não calculado",
        description: "Calcule o TRI V2 antes de salvar a aplicação.",
        variant: "destructive",
      });
      return;
    }

    salvarAvaliacaoNoHistorico();
    
    toast({
      title: "Aplicação salva!",
      description: "A avaliação foi salva no histórico e aparecerá na tela principal.",
    });
  };

  // Função para sair sem limpar dados (volta para tela inicial)
  const handleSair = () => {
    // Apenas limpa o estado visual, mantém os dados salvos
    setFile(null);
    setFileQueue([]);
    setIsBatchMode(false);
    setPageCount(0);
    setPagePreviews([]);
    setStatus("idle");
    setProgress(0);
    setCurrentPage(0);
    setErrorMessage("");
    // NÃO limpa: students, answerKey, triScores, etc. (mantém para histórico)
    
    toast({
      title: "Voltando para tela inicial",
      description: "Os dados foram mantidos. Use 'Limpar' se quiser remover tudo.",
    });
  };

  const handleClear = () => {
    setFile(null);
    setFileQueue([]);
    setIsBatchMode(false);
    setPageCount(0);
    setPagePreviews([]);
    setStatus("idle");
    setProgress(0);
    setCurrentPage(0);
    setStudents([]);
    setErrorMessage("");
    setAnswerKey([]);
    setQuestionContents([]);
    setTriScores(new Map());
    setTriScoresByArea(new Map());
    setTriScoresCount(0);
    setMainActiveTab("alunos");
  };

  // Monitorar mudanças no triScoresCount para garantir que a aba TRI seja habilitada
  useEffect(() => {
    if (triScoresCount > 0) {
      console.log("[TRI] useEffect: triScoresCount mudou para", triScoresCount, "Map size:", triScores.size);
    }
  }, [triScoresCount, triScores]);

  const processSingleFile = async (queuedFile: QueuedFile): Promise<StudentData[]> => {
    const formData = new FormData();
    formData.append("pdf", queuedFile.file);

    const response = await fetch("/api/process-pdf", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Erro ao processar PDF");
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("Erro na leitura da resposta");
    }

    let buffer = "";
    const processedStudents: StudentData[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim() && line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            
            const data = JSON.parse(jsonStr);
            if (data.type === "progress") {
              setFileQueue(prev => prev.map(f => 
                f.id === queuedFile.id 
                  ? { ...f, processedPages: data.currentPage }
                  : f
              ));
            } else if (data.type === "student") {
              processedStudents.push(data.student);
              setFileQueue(prev => prev.map(f => 
                f.id === queuedFile.id 
                  ? { ...f, studentCount: processedStudents.length }
                  : f
              ));
            } else if (data.type === "error") {
              throw new Error(data.message || "Erro no processamento");
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              continue;
            }
            throw e;
          }
        }
      }
    }

    return processedStudents;
  };

  /**
   * Mescla novos alunos com existentes usando studentNumber como chave única.
   * Preserva scores de áreas já calculadas (TRI/TCT).
   */
  const mergeStudents = (existingStudents: StudentData[], newStudents: StudentData[]): StudentData[] => {
    const studentMap = new Map<string, StudentData>();
    
    // Primeiro, adiciona todos os alunos existentes
    existingStudents.forEach(student => {
      studentMap.set(student.studentNumber, student);
    });
    
    // Depois, mescla ou adiciona novos alunos
    newStudents.forEach(newStudent => {
      const existing = studentMap.get(newStudent.studentNumber);
      
      if (existing) {
        // Merge: preserva dados existentes e adiciona novas respostas
        console.log(`[MERGE] Mesclando aluno ${newStudent.studentNumber}: preservando scores existentes`);
        
        const merged: StudentData = {
          ...existing,
          // Atualiza apenas campos que fazem sentido atualizar
          studentName: newStudent.studentName || existing.studentName,
          turma: newStudent.turma || existing.turma,
          
          // Mescla answers: prioriza novas respostas quando não vazias
          answers: existing.answers.map((existingAnswer, index) => {
            const newAnswer = newStudent.answers[index];
            // Se a nova resposta não está vazia, usa ela; senão mantém a existente
            return (newAnswer && newAnswer.trim() !== '') ? newAnswer : existingAnswer;
          }),
          
          // Preserva scores existentes de áreas já calculadas
          areaScores: {
            ...existing.areaScores,
            ...newStudent.areaScores, // Adiciona novas áreas calculadas
          },
          
          areaCorrectAnswers: {
            ...existing.areaCorrectAnswers,
            ...newStudent.areaCorrectAnswers,
          },
          
          // Preserva scores gerais se existirem
          score: existing.score, // Preserva TCT médio
          triScore: existing.triScore, // Preserva TRI médio
          
          // Atualiza metadados do processamento
          pageNumber: newStudent.pageNumber,
          confidence: newStudent.confidence,
        };
        
        studentMap.set(newStudent.studentNumber, merged);
      } else {
        // Novo aluno
        console.log(`[MERGE] Adicionando novo aluno ${newStudent.studentNumber}`);
        studentMap.set(newStudent.studentNumber, newStudent);
      }
    });
    
    return Array.from(studentMap.values());
  };

  const handleBatchProcess = async () => {
    if (fileQueue.length === 0) return;

    setStatus("processing");
    // NÃO limpa mais os alunos existentes - vai fazer merge
    setErrorMessage("");
    
    let allStudents: StudentData[] = [...students]; // Começa com alunos existentes
    let processedCount = 0;
    let errorCount = 0;

    for (const queuedFile of fileQueue) {
      if (queuedFile.status === "error") {
        errorCount++;
        continue;
      }

      setFileQueue(prev => prev.map(f => 
        f.id === queuedFile.id 
          ? { ...f, status: "processing" }
          : f
      ));

      try {
        const fileStudents = await processSingleFile(queuedFile);
        // Usa mergeStudents para preservar dados de alunos existentes
        allStudents = mergeStudents(allStudents, fileStudents);
        setStudents([...allStudents]);
        processedCount++;
        
        setFileQueue(prev => prev.map(f => 
          f.id === queuedFile.id 
            ? { ...f, status: "completed", studentCount: fileStudents.length }
            : f
        ));
      } catch (error) {
        errorCount++;
        setFileQueue(prev => prev.map(f => 
          f.id === queuedFile.id 
            ? { ...f, status: "error", error: error instanceof Error ? error.message : "Erro desconhecido" }
            : f
        ));
      }
    }

    setStatus("completed");
    
    if (errorCount > 0) {
      toast({
        title: "Processamento com erros",
        description: `${processedCount} arquivo(s) processado(s), ${errorCount} erro(s). Total: ${allStudents.length} aluno(s).`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Processamento em lote concluído",
        description: `${processedCount} arquivo(s) processado(s). Total: ${allStudents.length} aluno(s).`,
      });
    }
  };

  const removeFromQueue = (id: string) => {
    setFileQueue(prev => {
      const newQueue = prev.filter(f => f.id !== id);
      if (newQueue.length === 0) {
        setIsBatchMode(false);
      }
      return newQueue;
    });
  };

  // Função para salvar avaliação no histórico (backend + localStorage)
  const salvarAvaliacaoNoHistorico = useCallback(async () => {
    // Usar os valores atuais do estado
    const alunosAtuais = studentsWithScores;
    const triScoresAtuais = triScores;
    
    if (alunosAtuais.length === 0 || triScoresAtuais.size === 0) {
      console.log('[Histórico] Não há dados para salvar:', { alunos: alunosAtuais.length, tri: triScoresAtuais.size });
      return;
    }
    
    // Calcular média TRI
    const triValues = Array.from(triScoresAtuais.values());
    const mediaTRI = triValues.length > 0 
      ? triValues.reduce((a, b) => a + b, 0) / triValues.length 
      : 0;
    
    // Criar avaliação com dados completos
    const avaliacao: AvaliacaoHistorico = {
      id: `avaliacao-${Date.now()}`,
      data: new Date().toISOString(),
      titulo: `Análise de ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
      mediaTRI: parseFloat(mediaTRI.toFixed(2)),
      totalAlunos: alunosAtuais.length,
      template: predefinedTemplates[selectedTemplateIndex]?.name || 'Personalizado',
      local: 'RN', // Pode ser configurável no futuro
      // Salvar dados completos para recarregar depois
      students: alunosAtuais.map(s => ({
        id: s.id,
        studentNumber: s.studentNumber,
        studentName: s.studentName,
        answers: s.answers,
        pageNumber: s.pageNumber,
        turma: s.turma,
        score: s.score,
        correctAnswers: s.correctAnswers,
        areaScores: s.areaScores
      })),
      answerKey: [...answerKey],
      triScores: Array.from(triScoresAtuais.entries()),
      triScoresByArea: Array.from(triScoresByArea.entries()),
      selectedTemplateIndex: selectedTemplateIndex
    };
    
    console.log('[Histórico] Salvando avaliação:', avaliacao);
    
    // Tentar salvar no backend primeiro
    try {
      const response = await fetch('/api/avaliacoes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(avaliacao),
      });

      if (!response.ok) {
        throw new Error(`Backend retornou ${response.status}`);
      }

      const result = await response.json();
      console.log('[Histórico] Salvo no backend:', result);
    } catch (error) {
      console.warn('[Histórico] Erro ao salvar no backend, usando localStorage:', error);
      // Fallback para localStorage se backend falhar
    }
    
    // Adicionar ao histórico local (manter últimos 50)
    setHistoricoAvaliacoes(prev => {
      // Verificar se já existe avaliação com mesmo ID (evitar duplicatas)
      const existe = prev.some(a => a.id === avaliacao.id);
      if (existe) {
        console.log('[Histórico] Avaliação já existe, ignorando duplicata');
        return prev;
      }
      
      const novoHistorico = [avaliacao, ...prev].slice(0, 50);
      
      // Salvar no localStorage como backup
      try {
        localStorage.setItem('historicoAvaliacoes', JSON.stringify(novoHistorico));
        console.log('[Histórico] Salvo no localStorage:', novoHistorico.length, 'registros');
      } catch (e) {
        console.error('Erro ao salvar histórico:', e);
      }
      
      return novoHistorico;
    });
    
    toast({
      title: "Avaliação salva no histórico",
      description: `Média TRI: ${avaliacao.mediaTRI.toFixed(2)} pontos`,
    });
  }, [studentsWithScores, triScores, triScoresByArea, answerKey, selectedTemplateIndex, toast]);

  // Função para carregar aplicação do histórico
  const carregarAplicacaoDoHistorico = async (avaliacao: AvaliacaoHistorico) => {
    // Se não tem dados completos, tentar buscar do backend
    if (!avaliacao.students || !avaliacao.answerKey) {
      try {
        console.log('[Histórico] Buscando dados completos do backend para:', avaliacao.id);
        const response = await fetch(`/api/avaliacoes/${avaliacao.id}`);
        
        if (response.ok) {
          const result = await response.json();
          if (result.avaliacao && result.avaliacao.students && result.avaliacao.answerKey) {
            // Usar dados do backend
            avaliacao = result.avaliacao;
            console.log('[Histórico] Dados completos carregados do backend');
          } else {
            throw new Error('Dados incompletos no backend');
          }
        } else {
          throw new Error(`Backend retornou ${response.status}`);
        }
      } catch (error) {
        console.warn('[Histórico] Erro ao buscar do backend:', error);
        toast({
          title: "Dados incompletos",
          description: "Esta avaliação não possui dados completos para recarregar. Ela foi salva antes da atualização do sistema.",
          variant: "destructive",
        });
        return;
      }
    }
    
    // Validar novamente após tentar buscar do backend
    if (!avaliacao.students || !avaliacao.answerKey) {
      toast({
        title: "Dados incompletos",
        description: "Esta avaliação não possui dados completos para recarregar.",
        variant: "destructive",
      });
      return;
    }

    // Restaurar dados
    setStudents(avaliacao.students);
    setAnswerKey(avaliacao.answerKey);
    
    // Restaurar TRI scores
    if (avaliacao.triScores) {
      const triMap = new Map<string, number>(avaliacao.triScores);
      setTriScores(triMap);
    }
    
    if (avaliacao.triScoresByArea) {
      const triByAreaMap = new Map<string, Record<string, number>>(avaliacao.triScoresByArea);
      setTriScoresByArea(triByAreaMap);
    }
    
    // Restaurar template
    if (avaliacao.selectedTemplateIndex !== undefined) {
      setSelectedTemplateIndex(avaliacao.selectedTemplateIndex);
    }
    
    // Marcar como carregada
    setAvaliacaoCarregada(avaliacao.id);
    setStatus("completed");
    
    toast({
      title: "Aplicação carregada",
      description: `${avaliacao.totalAlunos} alunos e dados TRI restaurados.`,
    });
  };

  // Função para deletar avaliação do histórico
  const deletarAvaliacao = async (avaliacao: AvaliacaoHistorico) => {
    try {
      // Deletar do backend
      const response = await fetch(`/api/avaliacoes/${avaliacao.id}`, {
        method: 'DELETE',
      });

      if (!response.ok && response.status !== 404) {
        // 404 é ok (já foi deletado ou não existe)
        throw new Error(`Backend retornou ${response.status}`);
      }

      console.log('[Histórico] Deletado do backend:', avaliacao.id);
    } catch (error) {
      console.warn('[Histórico] Erro ao deletar do backend:', error);
      // Continuar mesmo se backend falhar
    }

    // Remover do estado local
    setHistoricoAvaliacoes(prev => {
      const novo = prev.filter(a => a.id !== avaliacao.id);
      
      // Atualizar localStorage
      try {
        localStorage.setItem('historicoAvaliacoes', JSON.stringify(novo));
      } catch (e) {
        console.error('Erro ao atualizar localStorage:', e);
      }
      
      return novo;
    });

    // Se a avaliação deletada estava carregada, limpar
    if (avaliacaoCarregada === avaliacao.id) {
      setAvaliacaoCarregada(null);
      handleClear();
    }

    setAvaliacaoParaDeletar(null);
    
    toast({
      title: "Avaliação deletada",
      description: "A avaliação foi removida do histórico.",
    });
  };

  // Função para calcular TRI V2 (Coerência Pedagógica) via Python Service
  const calculateTRIV2 = async (currentAnswerKey?: string[]): Promise<void> => {
    const answerKeyToUse = currentAnswerKey || answerKey;
    
    if (studentsWithScores.length === 0 || answerKeyToUse.length === 0) {
      toast({
        title: "Erro",
        description: "Necessário ter alunos e gabarito cadastrados",
        variant: "destructive",
      });
      return;
    }

    setTriV2Loading(true);
    console.log("[TRI V2] Iniciando cálculo para", studentsWithScores.length, "alunos");

    try {
      // Preparar dados para o TRI V2
      const alunos = studentsWithScores.map(student => {
        const alunoData: Record<string, string> = {
          nome: student.name || student.id,
        };
        
        // Adicionar respostas (q1, q2, q3, ...)
        student.answers.forEach((answer, idx) => {
          alunoData[`q${idx + 1}`] = answer || "X"; // X para questões não respondidas
        });
        
        return alunoData;
      });

      // Criar gabarito como objeto {"1": "A", "2": "B", ...}
      const gabarito: Record<string, string> = {};
      answerKeyToUse.forEach((answer, idx) => {
        gabarito[String(idx + 1)] = answer;
      });

      // Configuração de áreas baseada EXCLUSIVAMENTE no template selecionado
      // ENEM Dia 1: LC e CH
      // ENEM Dia 2: CN e MT
      // ENEM Completo: todas as 4 áreas
      const areas = getAreasByTemplate(selectedTemplate.name, answerKeyToUse.length);
      const areas_config: Record<string, [number, number]> = {};
      
      // Mapear áreas para nomes completos (como o Python espera)
      const areaNames: Record<string, string> = {
        'LC': 'Linguagens e Códigos',
        'CH': 'Ciências Humanas',
        'CN': 'Ciências da Natureza',
        'MT': 'Matemática'
      };
      
      // Adicionar apenas as áreas retornadas pelo template
      areas.forEach(({ area, start, end }) => {
        const areaName = areaNames[area] || area;
        areas_config[areaName] = [start, end];
      });
      
      // Se não houver áreas definidas pelo template, usar padrão ENEM Dia 1
      if (Object.keys(areas_config).length === 0) {
        areas_config["Linguagens e Códigos"] = [1, 45];
        areas_config["Ciências Humanas"] = [46, 90];
      }

      console.log("[TRI V2] Enviando requisição:", {
        total_alunos: alunos.length,
        total_questoes: answerKeyToUse.length,
        areas: Object.keys(areas_config),
      });

      const response = await fetch("/api/calculate-tri-v2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          alunos,
          gabarito,
          areas_config,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || "Erro ao calcular TRI V2");
      }

      const data = await response.json();
      console.log("🔍 [DEBUG TRI V2] ========================================");
      console.log("🔍 [DEBUG TRI V2] Resultado recebido do Python:");
      console.log("🔍 [DEBUG TRI V2] - Status:", data.status);
      console.log("🔍 [DEBUG TRI V2] - Total resultados:", data.resultados?.length);
      console.log("🔍 [DEBUG TRI V2] - Primeiro resultado:", data.resultados?.[0]);
      console.log("🔍 [DEBUG TRI V2] - areas_config enviado:", areas_config);

      // Processar resultados
      if (data.status === "sucesso" && data.resultados) {
        setTriV2Results(data);

        // Converter resultados para o formato esperado pelo sistema
        // IMPORTANTE: MERGEAR com dados existentes, não substituir completamente
        console.log("🔍 [DEBUG TRI V2] Dados ANTES do merge:");
        console.log("🔍 [DEBUG TRI V2] - triScores existentes:", Array.from(triScores.entries()).slice(0, 2));
        console.log("🔍 [DEBUG TRI V2] - triScoresByArea existentes:", Array.from(triScoresByArea.entries()).slice(0, 2));
        
        const triScoresMap = new Map<string, number>(triScores); // Copiar dados existentes
        const triScoresByAreaMap = new Map<string, Record<string, number>>(triScoresByArea); // Copiar dados existentes
        const studentUpdates = new Map<string, Record<string, number>>(); // Armazenar atualizações de acertos

        data.resultados.forEach((resultado: any, index: number) => {
          const student = studentsWithScores[index];
          if (!student) return;

          console.log(`🔍 [DEBUG TRI V2] Processando aluno ${index + 1}: ${student.id}`);
          console.log(`🔍 [DEBUG TRI V2] - Resultado Python:`, {
            tri_geral: resultado.tri_geral,
            tri_lc: resultado.tri_lc,
            tri_ch: resultado.tri_ch,
            tri_cn: resultado.tri_cn,
            tri_mt: resultado.tri_mt,
            lc_acertos: resultado.lc_acertos,
            ch_acertos: resultado.ch_acertos,
            cn_acertos: resultado.cn_acertos,
            mt_acertos: resultado.mt_acertos,
          });

          // TRI total - Python retorna tri_geral diretamente (não tri_geral.tri_ajustado)
          const triTotal = resultado.tri_geral || 0;
          triScoresMap.set(student.id, triTotal);

          // TRI por área - MERGEAR com dados existentes, não substituir
          const existingAreaScores = triScoresByAreaMap.get(student.id) || {};
          console.log(`🔍 [DEBUG TRI V2] - TRI áreas EXISTENTES antes:`, existingAreaScores);
          
          const newAreaScores: Record<string, number> = { ...existingAreaScores }; // Copiar dados existentes
          
          // Verificar formato novo (direto: tri_lc, tri_ch, etc.)
          if (resultado.tri_lc !== undefined) {
            // Atualizar apenas as áreas que vieram no resultado (não zerar as outras)
            // IMPORTANTE: Atualizar sempre, mesmo se for 0 (pode ser zero acertos)
            if (resultado.tri_lc !== undefined) newAreaScores.LC = resultado.tri_lc;
            if (resultado.tri_ch !== undefined) newAreaScores.CH = resultado.tri_ch;
            if (resultado.tri_cn !== undefined) newAreaScores.CN = resultado.tri_cn;
            if (resultado.tri_mt !== undefined) newAreaScores.MT = resultado.tri_mt;
          }
          // Verificar formato antigo (aninhado: areas.LC.tri.tri_ajustado)
          else if (resultado.areas) {
            Object.entries(resultado.areas).forEach(([areaName, areaData]: [string, any]) => {
              if (areaData.tri?.tri_ajustado) {
                // Mapear nomes para siglas
                const siglas: Record<string, string> = {
                  "Linguagens e Códigos": "LC",
                  "Ciências Humanas": "CH",
                  "Ciências da Natureza": "CN",
                  "Matemática": "MT",
                };
                const sigla = siglas[areaName] || areaName;
                newAreaScores[sigla] = areaData.tri.tri_ajustado;
              }
            });
          }
          
          console.log(`🔍 [DEBUG TRI V2] - TRI áreas DEPOIS do merge:`, newAreaScores);
          triScoresByAreaMap.set(student.id, newAreaScores);
          
          // IMPORTANTE: Salvar acertos retornados pelo Python e MERGEAR com existentes
          // O Python retorna lc_acertos, ch_acertos, cn_acertos, mt_acertos
          const existingAreaCorrectAnswers = student.areaCorrectAnswers || {};
          console.log(`🔍 [DEBUG TRI V2] - Acertos EXISTENTES antes:`, existingAreaCorrectAnswers);
          
          const newAreaCorrectAnswers: Record<string, number> = { ...existingAreaCorrectAnswers };
          
          // Atualizar apenas as áreas que vieram no resultado (preservar as outras)
          if (resultado.lc_acertos !== undefined) newAreaCorrectAnswers.LC = resultado.lc_acertos;
          if (resultado.ch_acertos !== undefined) newAreaCorrectAnswers.CH = resultado.ch_acertos;
          if (resultado.cn_acertos !== undefined) newAreaCorrectAnswers.CN = resultado.cn_acertos;
          if (resultado.mt_acertos !== undefined) newAreaCorrectAnswers.MT = resultado.mt_acertos;
          
          console.log(`🔍 [DEBUG TRI V2] - Acertos DEPOIS do merge:`, newAreaCorrectAnswers);
          
          // Armazenar para atualizar todos de uma vez depois do forEach
          studentUpdates.set(student.id, newAreaCorrectAnswers);
        });
        
        // Atualizar TODOS os alunos de uma vez (evita múltiplas atualizações de estado)
        console.log("🔍 [DEBUG TRI V2] Atualizando estado students com acertos de", studentUpdates.size, "alunos");
        setStudents(prev => {
          const updated = prev.map(s => {
            const newAcertos = studentUpdates.get(s.id);
            if (newAcertos) {
              return { ...s, areaCorrectAnswers: newAcertos };
            }
            return s;
          });
          console.log("🔍 [DEBUG TRI V2] Estado students atualizado. Primeiro aluno:", updated[0]?.areaCorrectAnswers);
          return updated;
        });
        
        console.log("🔍 [DEBUG TRI V2] Dados DEPOIS do merge:");
        console.log("🔍 [DEBUG TRI V2] - triScoresMap final:", Array.from(triScoresMap.entries()).slice(0, 2));
        console.log("🔍 [DEBUG TRI V2] - triScoresByAreaMap final:", Array.from(triScoresByAreaMap.entries()).slice(0, 2));
        console.log("🔍 [DEBUG TRI V2] ========================================");

        setTriScores(triScoresMap);
        setTriScoresByArea(triScoresByAreaMap);
        setTriScoresCount(triScoresMap.size);

        toast({
          title: "TRI V2 Calculado!",
          description: `${triScoresMap.size} alunos processados com sucesso usando Coerência Pedagógica`,
        });
        
        // Salvar no histórico se houver alunos processados
        // Aguardar um pouco para garantir que os estados foram atualizados
        setTimeout(() => {
          if (triScoresMap.size > 0 && studentsWithScores.length > 0) {
            console.log('[TRI V2] Salvando no histórico:', { 
              alunos: studentsWithScores.length, 
              triScores: triScoresMap.size 
            });
            salvarAvaliacaoNoHistorico();
          }
        }, 500);

        console.log("[TRI V2] Scores salvos:", {
          total: triScoresMap.size,
          scores: Array.from(triScoresMap.entries()).slice(0, 3),
          areas: Array.from(triScoresByAreaMap.entries()).slice(0, 3),
        });
      }
    } catch (error: any) {
      console.error("[TRI V2] Erro:", error);
      toast({
        title: "Erro ao calcular TRI V2",
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setTriV2Loading(false);
    }
  };

  // Função para calcular TRI automaticamente para todas as áreas
  const calculateTRIForAllAreas = async (areas: Array<{ area: string; start: number; end: number }>, ano: number = 2023, currentAnswerKey?: string[]): Promise<Map<string, number>> => {
    // IMPORTANTE: Sempre usar o answerKey passado como parâmetro, não o estado
    // O estado pode não estar atualizado ainda devido à natureza assíncrona do React
    const answerKeyToUse = currentAnswerKey || answerKey;
    
    console.log("[TRI] calculateTRIForAllAreas chamado com:");
    console.log("  - answerKeyToUse.length:", answerKeyToUse.length);
    console.log("  - currentAnswerKey?.length:", currentAnswerKey?.length);
    console.log("  - answerKey.length (estado):", answerKey.length);
    
    if (studentsWithScores.length === 0 || answerKeyToUse.length === 0) {
      console.error("[TRI] Erro: studentsWithScores.length =", studentsWithScores.length, "answerKey.length =", answerKeyToUse.length);
      return new Map<string, number>(); // Retornar Map vazio em vez de undefined
    }

    console.log("[TRI] Iniciando cálculo para", studentsWithScores.length, "alunos");

    // Calcular estatísticas das questões manualmente
    const questionStatsForTRI: Array<{ questionNumber: number; correctPercentage: number }> = [];
    for (let qIndex = 0; qIndex < answerKeyToUse.length; qIndex++) {
      let correctCount = 0;
      studentsWithScores.forEach(student => {
        if (student.answers[qIndex] && answerKeyToUse[qIndex] && 
            student.answers[qIndex].toUpperCase() === answerKeyToUse[qIndex].toUpperCase()) {
          correctCount++;
        }
      });
      const correctPercentage = studentsWithScores.length > 0 
        ? (correctCount / studentsWithScores.length) * 100 
        : 0;
      questionStatsForTRI.push({
        questionNumber: qIndex + 1,
        correctPercentage: Math.round(correctPercentage * 10) / 10,
      });
    }

    const triScoresMap = new Map<string, { sum: number; count: number }>();
    // IMPORTANTE: Preservar áreas já calculadas anteriormente
    const triScoresByAreaMap = new Map<string, Record<string, number>>(triScoresByArea); // Começa com o Map existente
    
    console.log("[TRI] ===== INICIANDO CÁLCULO =====");
    console.log("[TRI] triScoresByArea (estado atual).size:", triScoresByArea.size);
    console.log("[TRI] triScoresByArea entries:", Array.from(triScoresByArea.entries()));
    console.log("[TRI] triScoresByAreaMap (inicializado).size:", triScoresByAreaMap.size);
    console.log("[TRI] Áreas a calcular:", areas.map(a => a.area));

    for (const { area, start, end } of areas) {
      try {
        // Filtrar alunos e questões para esta área
        const studentsForArea = studentsWithScores.map(student => {
          const answersForArea = student.answers.slice(start - 1, end);
          const answerKeyForArea = answerKeyToUse.slice(start - 1, end);
          
          let correctCount = 0;
          answersForArea.forEach((answer, idx) => {
            if (answer != null && answerKeyForArea[idx] != null) {
              const normalizedAnswer = String(answer).toUpperCase().trim();
              const normalizedKey = String(answerKeyForArea[idx]).toUpperCase().trim();
              if (normalizedAnswer === normalizedKey) {
                correctCount++;
              }
            }
          });

          const studentForArea = {
            ...student,
            id: student.id, // GARANTIR que o ID está presente
            answers: answersForArea,
            correctAnswers: correctCount,
          };
          
          console.log(`[TRI] Área ${area}: Preparando aluno ID=${student.id}, correctAnswers=${correctCount}, answers.length=${answersForArea.length}`);
          
          return studentForArea;
        });

        console.log(`[TRI] Área ${area}: ${studentsForArea.length} alunos preparados`);
        console.log(`[TRI] Área ${area}: IDs enviados ao backend:`, studentsForArea.map(s => ({ id: s.id, correctAnswers: s.correctAnswers })));

        const questionStatsForArea = questionStatsForTRI.filter(stat => 
          stat.questionNumber >= start && stat.questionNumber <= end
        ).map(stat => ({
          questionNumber: stat.questionNumber - start + 1, // Ajustar para começar em 1
          correctPercentage: stat.correctPercentage,
        }));

        const answerKeyForArea = answerKeyToUse.slice(start - 1, end);

        const response = await fetch("/api/calculate-tri", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            students: studentsForArea,
            area: area,
            ano: ano,
            questionStats: questionStatsForArea,
            answerKey: answerKeyForArea,
          }),
        });

        if (response.ok) {
          const { results, usarCoerencia } = await response.json();
          console.log(`[TRI] Área ${area}: Backend retornou ${results.length} resultados, usarCoerencia=${usarCoerencia}`);
          console.log(`[TRI] Área ${area}: IDs retornados pelo backend:`, results.map((r: any) => ({ studentId: r.studentId, triScore: r.triScore, correctAnswers: r.correctAnswers })));
          
          // Verificar correspondência de IDs
          const idsEnviados = new Set(studentsForArea.map(s => s.id));
          const idsRetornados = new Set(results.map((r: any) => String(r.studentId || "")));
          const idsNaoEncontrados = Array.from(idsEnviados).filter(id => !idsRetornados.has(id));
          const idsExtras = Array.from(idsRetornados).filter(id => !idsEnviados.has(String(id)));
          
          if (idsNaoEncontrados.length > 0) {
            console.error(`[TRI] Área ${area}: IDs enviados mas não retornados:`, idsNaoEncontrados);
          }
          if (idsExtras.length > 0) {
            console.error(`[TRI] Área ${area}: IDs retornados mas não enviados:`, idsExtras);
          }
          
          let validResults = 0;
          let nullResults = 0;
          results.forEach((result: any) => {
            console.log(`[TRI] Área ${area}: Processando resultado - studentId=${result.studentId}, triScore=${result.triScore}, correctAnswers=${result.correctAnswers}`);
            
            if (result.triScore !== null && result.triScore !== undefined) {
              validResults++;
              // Adicionar à média geral
              const currentData = triScoresMap.get(result.studentId) || { sum: 0, count: 0 };
              currentData.sum += result.triScore;
              currentData.count += 1;
              triScoresMap.set(result.studentId, currentData);
              
              // Armazenar nota TRI por área
              const areaData = triScoresByAreaMap.get(result.studentId) || {};
              console.log(`[TRI] Área ${area}: studentId ${result.studentId} - áreas existentes:`, Object.keys(areaData));
              areaData[area] = result.triScore;
              triScoresByAreaMap.set(result.studentId, areaData);
              console.log(`[TRI] Área ${area}: studentId ${result.studentId} - após adicionar ${area}:`, areaData);
              
              console.log(`[TRI] Área ${area}: ✅ studentId ${result.studentId} adicionado ao Map com triScore=${result.triScore.toFixed(1)}`);
              console.log(`[TRI] Área ${area}: Map agora tem ${triScoresMap.size} entradas`);
            } else {
              nullResults++;
              console.warn(`[TRI] Área ${area}: ❌ studentId ${result.studentId} recebeu triScore=null (acertos=${result.correctAnswers})`);
            }
          });
          console.log(`[TRI] Área ${area}: ${validResults} válidos, ${nullResults} nulos de ${results.length} total`);
          console.log(`[TRI] Área ${area}: triScoresMap.size após processar = ${triScoresMap.size}`);
        } else {
          const errorText = await response.text();
          console.error(`[TRI] Erro na resposta do backend para área ${area}:`, response.status, errorText);
        }
      } catch (error) {
        console.error(`[TRI] Erro ao calcular TRI para área ${area}:`, error);
      }
    }

    // Converter para média final (soma/count) e salvar como Map<string, number>
    const finalTriScores = new Map<string, number>();
    triScoresMap.forEach((data, studentId) => {
      if (data.count > 0) {
        finalTriScores.set(studentId, data.sum / data.count);
      }
    });
    
    // CRÍTICO: Salvar acertos por área no estado students
    // Coletar acertos de cada área que foi calculada
    const areaCorrectAnswersUpdates = new Map<string, Record<string, number>>();
    
    // Para cada área calculada, coletar os acertos dos alunos
    for (const { area, start, end } of areas) {
      studentsWithScores.forEach((student) => {
        const existingAcertos = areaCorrectAnswersUpdates.get(student.id) || (student.areaCorrectAnswers ? { ...student.areaCorrectAnswers } : {});
        
        // Calcular acertos para esta área específica
        let areaCorrect = 0;
        for (let i = start - 1; i < end && i < student.answers.length; i++) {
          if (i < answerKeyToUse.length && student.answers[i] != null && answerKeyToUse[i] != null) {
            const normalizedAnswer = String(student.answers[i]).toUpperCase().trim();
            const normalizedKey = String(answerKeyToUse[i]).toUpperCase().trim();
            if (normalizedAnswer === normalizedKey) {
              areaCorrect++;
            }
          }
        }
        existingAcertos[area] = areaCorrect;
        areaCorrectAnswersUpdates.set(student.id, existingAcertos);
      });
    }
    
    // Atualizar estado students com os acertos (MERGEAR com existentes)
    if (areaCorrectAnswersUpdates.size > 0) {
      console.log("[TRI] Salvando acertos por área para", areaCorrectAnswersUpdates.size, "alunos");
      console.log("[TRI] Primeiro aluno acertos:", Array.from(areaCorrectAnswersUpdates.entries())[0]);
      setStudents(prev => prev.map(s => {
        const newAcertos = areaCorrectAnswersUpdates.get(s.id);
        if (newAcertos) {
          // MERGEAR com acertos existentes (preservar outras áreas já calculadas)
          const existingAcertos = s.areaCorrectAnswers || {};
          return { ...s, areaCorrectAnswers: { ...existingAcertos, ...newAcertos } };
        }
        return s;
      }));
    }
    
    // Atualizar o estado do triScores
    // Criar um novo Map para forçar o React a detectar a mudança
    const newTriScoresMap = new Map(finalTriScores);
    setTriScores(newTriScoresMap);
    
    console.log("[TRI] ===== ANTES DE SALVAR triScoresByArea =====");
    console.log("[TRI] triScoresByAreaMap.size:", triScoresByAreaMap.size);
    console.log("[TRI] triScoresByAreaMap entries:", Array.from(triScoresByAreaMap.entries()));
    
    setTriScoresByArea(new Map(triScoresByAreaMap)); // Armazenar notas TRI por área
    setTriScoresCount(newTriScoresMap.size); // Atualizar contador para forçar re-render
    
    console.log("[TRI] Scores calculados:", newTriScoresMap.size, "alunos");
    console.log("[TRI] Detalhes dos scores:", Array.from(newTriScoresMap.entries()));
    
    // Se não há scores, logar detalhes para debug
    if (newTriScoresMap.size === 0) {
      console.error("[TRI] NENHUM SCORE CALCULADO!");
      console.error("  - triScoresMap.size:", triScoresMap.size);
      console.error("  - studentsWithScores.length:", studentsWithScores.length);
      console.error("  - answerKey.length:", answerKey.length);
      console.error("  - areas:", areas);
    }
    
    return newTriScoresMap;
  };

  const handleApplyAnswerKey = async (): Promise<string[] | null> => {
    // Extrair respostas dos conteúdos cadastrados
    const answersFromContents = questionContents
      .slice(0, numQuestions)
      .map(c => c.answer)
      .filter(a => validAnswers.includes(a));
    
    if (answersFromContents.length === 0) {
      toast({
        title: "Gabarito inválido",
        description: `Cadastre pelo menos uma resposta válida (${validAnswers.join(", ")}) nas questões acima.`,
        variant: "destructive",
      });
      return null;
    }
    
    // Garantir que temos respostas para todas as questões
    const finalAnswers: string[] = [];
    const finalContents: Array<{ questionNumber: number; answer: string; content: string }> = [];
    
    for (let i = 0; i < numQuestions; i++) {
      const content = questionContents[i] || { questionNumber: i + 1, answer: "", content: "" };
      const questionNum = content.questionNumber || (i + 1);
      if (validAnswers.includes(content.answer)) {
        finalAnswers[i] = content.answer;
        finalContents[i] = { questionNumber: questionNum, answer: content.answer, content: content.content || "" };
      } else {
        // Se não tem resposta válida, deixa vazio
        finalAnswers[i] = "";
        finalContents[i] = { questionNumber: questionNum, answer: "", content: content.content || "" };
      }
    }
    
    const validAnswersCount = finalAnswers.filter(a => a).length;
    
    if (validAnswersCount === 0) {
      toast({
        title: "Gabarito inválido",
        description: `Nenhuma resposta válida encontrada. Selecione letras válidas (${validAnswers.join(", ")}) nas questões.`,
        variant: "destructive",
      });
      return null;
    }
    
    setAnswerKey(finalAnswers);
    setQuestionContents(finalContents);
    
    const contentsCount = finalContents.filter(c => c.content.trim()).length;
    toast({
      title: "Gabarito aplicado",
      description: `${validAnswersCount} respostas configuradas${contentsCount > 0 ? `, ${contentsCount} com conteúdo cadastrado` : ""}.`,
    });
    
    return finalAnswers; // Retornar o gabarito aplicado
  };

  const handleCalculateTRI = async () => {
    // Validações iniciais antes de aplicar o gabarito
    if (students.length === 0) {
      toast({
        title: "Dados insuficientes",
        description: "Nenhum aluno processado. Processe um PDF primeiro.",
        variant: "destructive",
      });
      return;
    }
    
    if (studentsWithScores.length === 0) {
      toast({
        title: "Dados insuficientes",
        description: "Nenhum aluno válido encontrado. Verifique se os alunos têm respostas.",
        variant: "destructive",
      });
      return;
    }
    
    // CRÍTICO: Garantir que temos um gabarito válido ANTES de calcular
    let finalAnswerKey: string[] = [];
    
    // Primeiro, tentar usar o answerKey do estado se estiver válido
    if (answerKey.length > 0 && answerKey.filter(a => a).length > 0) {
      finalAnswerKey = [...answerKey]; // Criar cópia para evitar mutação
      console.log("[TRI] Usando answerKey do estado:", finalAnswerKey.length, "respostas");
    } else if (questionContents.length > 0) {
      // Se não tem no estado, aplicar do questionContents
      console.log("[TRI] Aplicando gabarito de questionContents...");
      const appliedAnswerKey = await handleApplyAnswerKey();
      
      if (!appliedAnswerKey || appliedAnswerKey.length === 0) {
        toast({
          title: "Gabarito não configurado",
          description: "Não foi possível aplicar o gabarito. Verifique as configurações.",
          variant: "destructive",
        });
        return;
      }
      
      finalAnswerKey = appliedAnswerKey;
      console.log("[TRI] Gabarito aplicado:", finalAnswerKey.length, "respostas");
      
      // Atualizar o estado também para próxima vez
      setAnswerKey(finalAnswerKey);
    } else {
      // Não tem gabarito em lugar nenhum
      toast({
        title: "Gabarito não configurado",
        description: "Configure o gabarito antes de calcular o TRI.",
        variant: "destructive",
      });
      return;
    }
    
    // Validação FINAL crítica
    const validAnswersCount = finalAnswerKey.filter(a => a && a.trim() !== "").length;
    if (validAnswersCount === 0) {
      toast({
        title: "Gabarito inválido",
        description: "O gabarito não contém respostas válidas. Configure pelo menos uma resposta.",
        variant: "destructive",
      });
      return;
    }
    
    // Validações após aplicar o gabarito
    console.log("[TRI] Validação FINAL:");
    console.log("  - finalAnswerKey.length:", finalAnswerKey.length);
    console.log("  - validAnswersCount:", validAnswersCount);
    console.log("  - students.length:", students.length);
    console.log("  - studentsWithScores.length:", studentsWithScores.length);
    console.log("  - answerKey.length (estado):", answerKey.length);
    console.log("  - questionContents.length:", questionContents.length);
    
    // Verificar se os alunos têm IDs válidos
    const alunosSemId = studentsWithScores.filter(s => !s.id || s.id.trim() === "");
    if (alunosSemId.length > 0) {
      console.error("[TRI] Alunos sem ID:", alunosSemId);
      toast({
        title: "Erro nos dados",
        description: `${alunosSemId.length} aluno(s) sem ID válido.`,
        variant: "destructive",
      });
      return;
    }
    
    console.log("[TRI] IDs dos alunos:", studentsWithScores.map(s => s.id));

    // Se for ENEM, calcular TRI automaticamente para todas as áreas
    const areas = getAreasByTemplate(selectedTemplate.name, numQuestions);
    if (areas.length === 0) {
      toast({
        title: "Template não suportado",
        description: "Cálculo TRI automático disponível apenas para templates ENEM.",
        variant: "destructive",
      });
      return;
    }

    setAnswerKeyDialogOpen(false);
    
    // Usar ano 2023 por padrão (último ano disponível no CSV)
    const ano = 2023;
    console.log("[TRI] Calculando TRI para", areas.length, "áreas, ano:", ano);
    console.log("[TRI] Usando finalAnswerKey com", finalAnswerKey.length, "respostas");
    
    toast({
      title: "Calculando TRI",
      description: `Calculando notas TRI para ${areas.length} área(s)...`,
    });

    // CRÍTICO: Passar finalAnswerKey explicitamente, não depender do estado
    const calculatedTriScores = await calculateTRIForAllAreas(areas, ano, finalAnswerKey);

    // Verificar se o cálculo foi bem-sucedido
    console.log("[TRI] Resultado do cálculo:", calculatedTriScores);
    console.log("[TRI] Tamanho do Map:", calculatedTriScores?.size || 0);
    
    if (!calculatedTriScores) {
      console.error("[TRI] calculateTRIForAllAreas retornou null/undefined");
      toast({
        title: "Erro no cálculo",
        description: "A função de cálculo retornou um valor inválido. Verifique o console para mais detalhes.",
        variant: "destructive",
      });
      return;
    }
    
    if (calculatedTriScores.size === 0) {
      console.error("[TRI] Nenhum score TRI calculado. Possíveis causas:");
      console.error("  - Backend não encontrou dados no CSV para as combinações área+acertos+ano");
      console.error("  - Backend retornou triScore: null para todos os alunos");
      console.error("  - Problema na correspondência de IDs entre frontend e backend");
      
      toast({
        title: "Nenhum resultado TRI",
        description: `Nenhuma nota TRI foi calculada. Verifique se há dados no CSV para as combinações área+acertos+ano 2023. Verifique o console para mais detalhes.`,
        variant: "destructive",
      });
      return;
    }

    // Garantir que o triScores foi atualizado
    // O setTriScores já foi chamado dentro de calculateTRIForAllAreas
    // Mas vamos garantir que o estado está atualizado
    console.log("[TRI] Scores retornados:", calculatedTriScores.size, "alunos");
    
    // IMPORTANTE: Atualizar ambos os estados de forma síncrona
    // Criar um novo Map para garantir que o React detecte a mudança
    const newTriScoresMap = new Map(calculatedTriScores);
    
    // Atualizar o contador PRIMEIRO (número primitivo força re-render)
    setTriScoresCount(calculatedTriScores.size);
    
    // Depois atualizar o Map
    setTriScores(newTriScoresMap);
    
    console.log("[TRI] Estados atualizados - Contador:", calculatedTriScores.size, "Map size:", newTriScoresMap.size);

    // Atualizar notas dos alunos com TRI usando o resultado retornado
    if (calculatedTriScores && calculatedTriScores.size > 0) {
      setStudents(prev => prev.map(student => {
        const triScore = calculatedTriScores.get(student.id);
        if (triScore !== undefined) {
          console.log(`[TRI] Atualizando student ${student.id} - preservando areaScores:`, student.areaScores);
          // NÃO sobrescrever score (TCT) - apenas adicionar triScore
          return {
            ...student,
            triScore: triScore, // Armazenar TRI score (0-1000)
            // Explicitamente preservar dados TCT
            score: student.score, // Manter nota TCT
            areaScores: student.areaScores, // Manter notas TCT por área
            areaCorrectAnswers: student.areaCorrectAnswers, // Manter acertos por área
          };
        }
        return student;
      }));

      // O setTriScores já foi chamado dentro de calculateTRIForAllAreas
      // O React vai re-renderizar automaticamente e habilitar a aba
      toast({
        title: "Notas TRI calculadas",
        description: `Notas TRI calculadas para ${calculatedTriScores.size} aluno(s). A aba "Estatísticas TRI" está disponível.`,
      });
      
      // Mudar para a aba TRI automaticamente após o cálculo
      // IMPORTANTE: Usar o valor calculado diretamente, não depender do estado
      const finalCount = calculatedTriScores.size;
      console.log("[TRI] Navegando para aba TRI. Contador:", finalCount);
      
      // Garantir que o contador está atualizado
      if (triScoresCount !== finalCount) {
        setTriScoresCount(finalCount);
      }
      
      // Navegar após um pequeno delay para garantir renderização
      setTimeout(() => {
        setMainActiveTab("tri");
      }, 150);
    }
  };

  const handleCalculateTCT = async () => {
    // Primeiro aplicar o gabarito se ainda não foi aplicado
    if (answerKey.length === 0 || answerKey.filter(a => a).length === 0) {
      const applied = await handleApplyAnswerKey();
      if (!applied) {
        return; // handleApplyAnswerKey já mostra o toast de erro
      }
    }
    
    if (studentsWithScores.length === 0) {
      toast({
        title: "Dados insuficientes",
        description: "Processe um PDF primeiro.",
        variant: "destructive",
      });
      return;
    }

    setAnswerKeyDialogOpen(false);

    // TCT: calcular por área (cada área de 45 questões vale 10,0)
    const areas = getAreasByTemplate(selectedTemplate.name, numQuestions);
    
    if (areas.length > 0) {
      // ENEM: calcular cada área separadamente (0,0 a 10,0) e fazer MÉDIA
      setStudents(prev => prev.map(student => {
        // IMPORTANTE: Preservar áreas já calculadas anteriormente
        const areaScoresMap: Record<string, number> = { ...(student.areaScores || {}) };
        const areaCorrectAnswersMap: Record<string, number> = { ...(student.areaCorrectAnswers || {}) };
        const areaScores: number[] = [];
        
        console.log(`[TCT] Student ${student.id} - Áreas existentes antes do cálculo:`, Object.keys(areaScoresMap));
        
        areas.forEach(({ area, start, end }) => {
          const answersForArea = student.answers.slice(start - 1, end);
          const answerKeyForArea = answerKey.slice(start - 1, end);
          
          let correctCount = 0;
          answersForArea.forEach((answer, idx) => {
            if (answer != null && answerKeyForArea[idx] != null) {
              const normalizedAnswer = String(answer).toUpperCase().trim();
              const normalizedKey = String(answerKeyForArea[idx]).toUpperCase().trim();
              if (normalizedAnswer === normalizedKey) {
                correctCount++;
              }
            }
          });
          
          // Armazenar acertos por área
          areaCorrectAnswersMap[area] = correctCount;
          
          // Cada acerto vale 0,222 pontos (10,0 / 45 = 0,2222...)
          const areaScore = correctCount * 0.222;
          areaScoresMap[area] = parseFloat(areaScore.toFixed(1));
          areaScores.push(areaScore);
        });
        
        console.log(`[TCT] Student ${student.id} - Áreas calculadas agora:`, areas.map(a => a.area));
        console.log(`[TCT] Student ${student.id} - Todas as áreas após cálculo:`, Object.keys(areaScoresMap));
        
        // Nota final TCT: MÉDIA de TODAS as áreas (existentes + novas)
        // Pegar scores de todas as áreas no mapa (LC, CH, CN, MT)
        const allAreaScores = Object.values(areaScoresMap);
        
        // Cada área tem nota individual de 0,0 a 10,0
        // A nota final é a média das áreas
        const averageTCT = allAreaScores.length > 0 
          ? allAreaScores.reduce((sum, score) => sum + score, 0) / allAreaScores.length 
          : 0;
        
        // Armazenar como porcentagem para compatibilidade (0-100), será convertido na exibição
        const tctPercentage = averageTCT * 10; // Multiplicar por 10 para converter 0-10 em 0-100
        
        console.log(`[TCT] Student ${student.id} - Média TCT final: ${averageTCT.toFixed(1)}/10.0 (${allAreaScores.length} áreas)`);
        console.log(`[TCT] Student ${student.id} - Preservando triScore:`, student.triScore);
        
        return {
          ...student, // Manter TUDO do aluno (incluindo triScore se existir)
          score: tctPercentage,
          areaScores: areaScoresMap, // Armazenar notas TCT por área
          areaCorrectAnswers: areaCorrectAnswersMap, // Armazenar acertos por área
          // Explicitamente preservar triScore se existir
          triScore: student.triScore,
        };
      }));
    } else {
      // Outros templates: calcular proporcionalmente (0,0 a 10,0)
      setStudents(prev => prev.map(student => {
        const correctAnswers = student.correctAnswers || 0;
        const totalQuestions = answerKey.length;
        // Calcular nota de 0,0 a 10,0
        const tctScore = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 10 : 0;
        // Armazenar como porcentagem para compatibilidade, mas será convertido na exibição
        const tctPercentage = parseFloat((tctScore * 10).toFixed(3)); // Multiplicar por 10 para converter 0-10 em 0-100
        
        return {
          ...student, // Manter TUDO (incluindo triScore)
          score: tctPercentage,
          // NÃO sobrescrever triScore se já existir
        };
      }));
    }

    // Não limpar TRI scores - manter ambas as notas calculadas
    // setTriScores(new Map());
    // setTriScoresCount(0);

    toast({
      title: "Notas TCT calculadas",
      description: `Notas calculadas na escala de 0,0 a 10,0 para ${studentsWithScores.length} alunos.`,
    });
    
    // Mudar para a aba TCT automaticamente após o cálculo
    setTimeout(() => {
      setMainActiveTab("tct");
    }, 500);
  };

  const handleGenerateEmptyAnswerKey = () => {
    // Inicializar conteúdos vazios com primeira opção como resposta padrão
    const firstOption = validAnswers.length > 0 ? validAnswers[0] : "A";
    const emptyContents = Array.from({ length: numQuestions }).map((_, i) => ({
      questionNumber: i + 1,
      answer: firstOption,
      content: "",
    }));
    setQuestionContents(emptyContents);
    toast({
      title: "Modelo gerado",
      description: `${numQuestions} questões inicializadas. Preencha os números, respostas e conteúdos.`,
    });
  };


  const handleImportAnswerKey = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input
    if (event.target) {
      event.target.value = "";
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      
      // Pegar a primeira planilha
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

      if (data.length < 2) {
        throw new Error("O arquivo deve ter pelo menos um cabeçalho e uma linha de dados");
      }

      // Encontrar o cabeçalho (pode estar em qualquer linha)
      let headerRowIndex = -1;
      let questionNumberCol = -1;
      let answerCol = -1;
      let contentCol = -1;

      for (let i = 0; i < Math.min(5, data.length); i++) {
        const row = data[i];
        if (!Array.isArray(row)) continue;

        // Procurar pelos nomes das colunas (case insensitive, com variações)
        for (let j = 0; j < row.length; j++) {
          const cellValue = String(row[j] || "").trim().toUpperCase();
          
          if (cellValue.includes("QUESTÃO") || cellValue.includes("QUESTAO") || cellValue.includes("NR") || cellValue.includes("NÚMERO") || cellValue === "Q" || cellValue === "N") {
            questionNumberCol = j;
          }
          if (cellValue.includes("GABARITO") || cellValue.includes("RESPOSTA") || cellValue === "LETRA" || cellValue === "A") {
            answerCol = j;
          }
          if (cellValue.includes("CONTEÚDO") || cellValue.includes("CONTEUDO") || cellValue.includes("CONTENT") || cellValue === "C") {
            contentCol = j;
          }
        }

        if (questionNumberCol >= 0 && answerCol >= 0 && contentCol >= 0) {
          headerRowIndex = i;
          break;
        }
      }

      if (questionNumberCol < 0 || answerCol < 0 || contentCol < 0) {
        throw new Error("Não foi possível encontrar as colunas: NR QUESTÃO, GABARITO e CONTEÚDO. Verifique o formato do arquivo.");
      }

      // Processar dados
      const importedContents: Array<{ questionNumber: number; answer: string; content: string }> = [];
      
      for (let i = headerRowIndex + 1; i < data.length; i++) {
        const row = data[i];
        if (!Array.isArray(row)) continue;

        const questionNum = parseInt(String(row[questionNumberCol] || "").trim());
        const answer = String(row[answerCol] || "").trim().toUpperCase();
        const content = String(row[contentCol] || "").trim();

        // Pular linhas vazias
        if (!questionNum && !answer && !content) continue;

        if (questionNum && questionNum > 0) {
          importedContents.push({
            questionNumber: questionNum,
            answer: answer || "",
            content: content || "",
          });
        }
      }

      if (importedContents.length === 0) {
        throw new Error("Nenhum dado válido encontrado no arquivo");
      }

      // Ordenar por número da questão
      importedContents.sort((a, b) => a.questionNumber - b.questionNumber);

      // Atualizar o número de questões se necessário
      const maxQuestionNum = Math.max(...importedContents.map(c => c.questionNumber));
      if (maxQuestionNum > numQuestions) {
        setNumQuestions(maxQuestionNum);
      }

      // Preencher questionContents
      const newContents: Array<{ questionNumber: number; answer: string; content: string }> = [];
      for (let i = 0; i < Math.max(numQuestions, maxQuestionNum); i++) {
        const imported = importedContents.find(c => c.questionNumber === i + 1);
        if (imported) {
          newContents[i] = imported;
        } else {
          newContents[i] = { questionNumber: i + 1, answer: "", content: "" };
        }
      }

      setQuestionContents(newContents);

      toast({
        title: "Gabarito importado",
        description: `${importedContents.length} questões importadas com sucesso. Você pode editar os dados abaixo.`,
      });
    } catch (error) {
      console.error("Error importing answer key:", error);
      toast({
        title: "Erro ao importar gabarito",
        description: error instanceof Error ? error.message : "Verifique o formato do arquivo Excel/CSV.",
        variant: "destructive",
      });
    }
  };

  const updateStudentField = (index: number, field: keyof StudentData, value: string) => {
    setStudents((prev) =>
      prev.map((student, i) =>
        i === index ? { ...student, [field]: value } : student
      )
    );
  };

  const updateStudentAnswer = (studentIndex: number, answerIndex: number, value: string) => {
    setStudents((prev) =>
      prev.map((student, i) =>
        i === studentIndex
          ? {
              ...student,
              answers: student.answers.map((ans, j) =>
                j === answerIndex ? value.toUpperCase() : ans
              ),
            }
          : student
      )
    );
  };

  const updateAnswerKeyValue = (index: number, value: string) => {
    const newKey = [...answerKey];
    newKey[index] = value.toUpperCase();
    setAnswerKey(newKey);
  };

  // CSV/PDF Generation functions
  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setCsvLoading(true);
    setCsvFile(file);
    
    try {
      const formData = new FormData();
      formData.append("csv", file);
      
      const response = await fetch("/api/preview-csv", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || "Erro ao processar CSV");
      }
      
      const data = await response.json();
      setCsvPreview(data.preview || []);
      setCsvTotalStudents(data.totalStudents || 0);
      
      toast({
        title: "CSV carregado",
        description: `${data.totalStudents} alunos encontrados.`,
      });
    } catch (error) {
      console.error("Error loading CSV:", error);
      setCsvFile(null);
      setCsvPreview([]);
      setCsvTotalStudents(0);
      toast({
        title: "Erro ao carregar CSV",
        description: error instanceof Error ? error.message : "Verifique o formato do arquivo.",
        variant: "destructive",
      });
    } finally {
      setCsvLoading(false);
    }
  };
  
  // State for download links when generating large batches
  const [downloadLinks, setDownloadLinks] = useState<{ name: string; downloadUrl: string; pages: number }[]>([]);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  
  const handleGeneratePdfs = async () => {
    if (!csvFile) return;
    
    setPdfGenerating(true);
    setDownloadLinks([]);
    
    try {
      const formData = new FormData();
      formData.append("csv", csvFile);
      
      // Use AbortController with 5-minute timeout for large files
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes
      
      const response = await fetch("/api/generate-pdfs", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || "Erro ao gerar PDFs");
      }
      
      // Always JSON response with server URLs
      const data = await response.json();
      setDownloadLinks(data.files);
      setShowDownloadDialog(true);
      
      toast({
        title: "PDFs gerados com sucesso!",
        description: `${data.totalStudents} gabaritos foram criados. Clique para baixar.`,
      });
    } catch (error) {
      console.error("Error generating PDFs:", error);
      toast({
        title: "Erro ao gerar PDFs",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setPdfGenerating(false);
    }
  };
  
  const handleDownloadFile = async (url: string, filename: string) => {
    try {
      let blobUrl = url;
      
      // If it's not already a blob URL, fetch and create one
      if (!url.startsWith("blob:")) {
        const response = await fetch(url);
        const blob = await response.blob();
        blobUrl = window.URL.createObjectURL(blob);
      }
      
      // Create download link
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(a);
        // Only revoke if we created the blob URL
        if (!url.startsWith("blob:")) {
          window.URL.revokeObjectURL(blobUrl);
        }
      }, 100);
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Erro no download",
        description: "Não foi possível baixar o arquivo.",
        variant: "destructive",
      });
    }
  };
  
  const handleClearCsv = () => {
    setCsvFile(null);
    setCsvPreview([]);
    setCsvTotalStudents(0);
    if (csvInputRef.current) {
      csvInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col fixed left-0 top-0 h-screen z-40">
        {/* Logo */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-purple-600 to-indigo-600 rounded-lg blur-sm opacity-75"></div>
              <div className="relative p-2 rounded-lg bg-gradient-to-br from-purple-500 via-purple-600 to-indigo-600 shadow-lg shadow-purple-500/30">
                <FileSpreadsheet className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="flex flex-col">
              <h2 className="text-lg font-extrabold bg-gradient-to-r from-slate-900 via-purple-800 to-slate-900 dark:from-slate-50 dark:via-purple-300 dark:to-slate-50 bg-clip-text text-transparent tracking-tight">
                GabaritAI
              </h2>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Powered by X-TRI</p>
            </div>
          </div>
        </div>

        {/* Menu de Ações */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-2 flex flex-col">
          <div className="space-y-2">
            {status === "completed" && students.length > 0 && (
              <>
                <Dialog open={answerKeyDialogOpen} onOpenChange={setAnswerKeyDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full h-auto py-3 px-4 font-semibold border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-600 transition-all hover:shadow-md rounded-xl justify-start"
                      data-testid="button-answer-key"
                    >
                      <ClipboardList className="h-5 w-5 mr-3 flex-shrink-0" />
                      <span>Cadastrar Gabarito</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-slate-800 dark:text-slate-100">Configuração da Prova</DialogTitle>
                      <DialogDescription className="text-slate-600 dark:text-slate-400">
                        Selecione o tipo de prova e insira as respostas corretas.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Tipo de Prova</Label>
                          <Select
                            value={selectedTemplateIndex.toString()}
                            onValueChange={(value) => {
                              const idx = parseInt(value);
                              setSelectedTemplateIndex(idx);
                              const template = predefinedTemplates[idx];
                              const newNumQuestions = template.totalQuestions;
                              setNumQuestions(newNumQuestions);
                              setPassingScore(template.passingScore);
                              
                              // Ajustar conteúdos para o novo número de questões
                              if (questionContents.length !== newNumQuestions) {
                                const adjustedContents = Array.from({ length: newNumQuestions }).map((_, i) => {
                                  const existing = questionContents[i];
                                  return existing 
                                    ? { ...existing, questionNumber: existing.questionNumber || (i + 1) }
                                    : { questionNumber: i + 1, answer: "", content: "" };
                                });
                                setQuestionContents(adjustedContents);
                              }
                            }}
                          >
                            <SelectTrigger data-testid="select-template">
                              <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                            <SelectContent>
                              {predefinedTemplates.map((template, index) => (
                                <SelectItem key={index} value={index.toString()}>
                                  {template.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedTemplate.description && (
                            <p className="text-xs text-muted-foreground">
                              {selectedTemplate.description}
                            </p>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          <Label>Nota Mínima para Aprovação (%)</Label>
                          <Input
                            type="number"
                            value={passingScore}
                            onChange={(e) => setPassingScore(Math.min(100, Math.max(0, parseInt(e.target.value) || 60)))}
                            className="h-9"
                            min={0}
                            max={100}
                            data-testid="input-passing-score"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Label>Questões:</Label>
                          <div className="flex items-center">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setNumQuestions(Math.max(1, numQuestions - 5))}
                              data-testid="button-decrease-questions"
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              value={numQuestions}
                              onChange={(e) => {
                                const newNum = parseInt(e.target.value) || 45;
                                setNumQuestions(newNum);
                                
                                // Ajustar conteúdos para o novo número de questões
                                if (questionContents.length !== newNum) {
                                  const adjustedContents = Array.from({ length: newNum }).map((_, i) => {
                                    const existing = questionContents[i];
                                    return existing 
                                      ? { ...existing, questionNumber: existing.questionNumber || (i + 1) }
                                      : { questionNumber: i + 1, answer: "", content: "" };
                                  });
                                  setQuestionContents(adjustedContents);
                                }
                              }}
                              className="w-16 h-8 text-center mx-1"
                              data-testid="input-num-questions"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setNumQuestions(numQuestions + 5)}
                              data-testid="button-increase-questions"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        
                        {selectedTemplate.name === "Personalizado" && (
                          <div className="flex items-center gap-2">
                            <Label>Opções:</Label>
                            <Input
                              value={customValidAnswers}
                              onChange={(e) => setCustomValidAnswers(e.target.value.toUpperCase())}
                              placeholder="A,B,C,D,E"
                              className="w-28 h-8 text-center font-mono"
                              data-testid="input-valid-answers"
                            />
                          </div>
                        )}
                        
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleGenerateEmptyAnswerKey}
                          data-testid="button-generate-template"
                        >
                          Gerar Modelo
                        </Button>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Respostas válidas:</span>
                        {validAnswers.map((answer, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {answer}
                          </Badge>
                        ))}
                      </div>
                      <div className="border-t pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-base font-semibold block">
                            Gabarito Oficial - Respostas e Conteúdos
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="file"
                              accept=".xlsx,.xls,.csv"
                              onChange={handleImportAnswerKey}
                              className="hidden"
                              id="import-answer-key"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => document.getElementById("import-answer-key")?.click()}
                              className="text-xs"
                            >
                              <FileSpreadsheet className="h-3 w-3 mr-1" />
                              Importar Excel/CSV
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                          Importe um arquivo Excel/CSV com as colunas: <strong>NR QUESTÃO</strong>, <strong>GABARITO</strong> e <strong>CONTEÚDO</strong>. 
                          Ou cadastre manualmente a letra da resposta correta e o conteúdo de cada questão. Exemplo: Letra "B" - Conteúdo "mat - geometria"
                        </p>
                        <div className="max-h-96 overflow-y-auto space-y-2 border rounded-md p-3">
                          {Array.from({ length: numQuestions }).map((_, index) => {
                            const currentContent = questionContents[index] || { questionNumber: index + 1, answer: "", content: "" };
                            return (
                              <div key={index} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                                <Label className="text-xs font-mono text-muted-foreground w-8 shrink-0">
                                  Q:
                                </Label>
                                <Input
                                  type="number"
                                  value={currentContent.questionNumber || index + 1}
                                  onChange={(e) => {
                                    const newContents = [...questionContents];
                                    const questionNum = parseInt(e.target.value) || (index + 1);
                                    if (!newContents[index]) {
                                      newContents[index] = { questionNumber: questionNum, answer: "", content: "" };
                                    } else {
                                      newContents[index] = { ...newContents[index], questionNumber: questionNum };
                                    }
                                    setQuestionContents(newContents);
                                  }}
                                  className="w-16 h-8 text-center text-sm font-mono"
                                  min={1}
                                  data-testid={`input-question-number-${index}`}
                                />
                                <Select
                                  value={currentContent.answer}
                                  onValueChange={(value) => {
                                    const newContents = [...questionContents];
                                    if (!newContents[index]) {
                                      newContents[index] = { questionNumber: index + 1, answer: "", content: "" };
                                    }
                                    newContents[index] = { ...newContents[index], answer: value };
                                    setQuestionContents(newContents);
                                  }}
                                >
                                  <SelectTrigger className="w-20 h-8">
                                    <SelectValue placeholder="Letra" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {validAnswers.map((ans) => (
                                      <SelectItem key={ans} value={ans}>
                                        {ans}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  value={currentContent.content}
                                  onChange={(e) => {
                                    const newContents = [...questionContents];
                                    if (!newContents[index]) {
                                      newContents[index] = { questionNumber: index + 1, answer: "", content: "" };
                                    }
                                    newContents[index] = { ...newContents[index], content: e.target.value };
                                    setQuestionContents(newContents);
                                  }}
                                  placeholder={`Ex: mat - geometria`}
                                  className="flex-1 h-8 text-sm"
                                  data-testid={`input-question-content-${index}`}
                                />
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {questionContents.filter(c => c.answer && validAnswers.includes(c.answer)).length} questões com resposta cadastrada
                          {questionContents.filter(c => c.content.trim()).length > 0 && 
                            ` • ${questionContents.filter(c => c.content.trim()).length} com conteúdo cadastrado`
                          }
                        </p>
                      </div>
                    </div>
                    <DialogFooter className="flex-col gap-2 sm:flex-row">
                      <Button variant="outline" onClick={() => setAnswerKeyDialogOpen(false)} data-testid="button-cancel-answer-key" className="w-full sm:w-auto">
                        Cancelar
                      </Button>
                      <Button 
                        onClick={handleCalculateTRI} 
                        variant="default"
                        className="w-full sm:w-auto"
                        data-testid="button-calculate-tri"
                      >
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Calcular por TRI Média
                      </Button>
                      <Button 
                        onClick={handleCalculateTCT} 
                        variant="default"
                        className="w-full sm:w-auto"
                        data-testid="button-calculate-tct"
                      >
                        <Calculator className="h-4 w-4 mr-2" />
                        Calcular por TCT
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button 
                  onClick={handleExportExcel} 
                  className="w-full h-auto py-3 px-4 font-semibold bg-gradient-to-r from-purple-600 via-purple-600 to-indigo-600 hover:from-purple-700 hover:via-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/30 hover:shadow-xl hover:shadow-purple-500/40 transition-all hover:scale-[1.02] rounded-xl justify-start border-0"
                  data-testid="button-export-excel"
                >
                  <Download className="h-5 w-5 mr-3 flex-shrink-0" />
                  <span>Exportar para Excel</span>
                </Button>
                <Button 
                  onClick={handleExportScannedAnswers} 
                  variant="outline" 
                  className="w-full h-auto py-3 px-4 font-semibold border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-600 transition-all hover:shadow-md rounded-xl justify-start"
                  data-testid="button-export-scanned"
                >
                  <FileSpreadsheet className="h-5 w-5 mr-3 flex-shrink-0" />
                  <span>Exportar Gabaritos</span>
                </Button>
              </>
            )}
            {(file || isBatchMode || students.length > 0) && (
              <>
                <Button 
                  onClick={handleSalvarAplicacao} 
                  variant="default"
                  className="w-full h-auto py-3 px-4 font-semibold bg-gradient-to-r from-green-600 via-emerald-600 to-green-600 hover:from-green-700 hover:via-emerald-700 hover:to-green-700 text-white shadow-lg shadow-green-500/30 hover:shadow-xl hover:shadow-green-500/40 transition-all hover:scale-[1.02] rounded-xl justify-start border-0"
                  data-testid="button-save-application"
                >
                  <Save className="h-5 w-5 mr-3 flex-shrink-0" />
                  <span>Salvar Aplicação</span>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full h-auto py-3 px-4 font-semibold border-2 border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-400 dark:hover:border-red-800 text-red-600 dark:text-red-400 transition-all hover:shadow-md hover:shadow-red-200/50 dark:hover:shadow-red-900/20 hover:scale-[1.02] rounded-xl justify-start"
                      data-testid="button-clear-trigger"
                    >
                      <Trash2 className="h-5 w-5 mr-3 flex-shrink-0" />
                      <span>Limpar</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Limpar todos os dados?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação irá remover o PDF carregado, gabarito e todos os dados processados.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-clear">Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClear} data-testid="button-confirm-clear">
                        Confirmar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
          
          {/* Botão Sair sempre no final */}
          <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button 
              onClick={handleSair} 
              variant="outline"
              className="w-full h-auto py-3 px-4 font-semibold border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-600 transition-all hover:shadow-md rounded-xl justify-start"
              data-testid="button-exit"
            >
              <LogOut className="h-5 w-5 mr-3 flex-shrink-0" />
              <span>Sair</span>
            </Button>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-64 flex flex-col">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 dark:border-slate-800/80 bg-gradient-to-r from-white via-white to-slate-50/50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/50 backdrop-blur-xl supports-[backdrop-filter]:bg-white/90 dark:supports-[backdrop-filter]:bg-slate-950/90 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
        <div className="max-w-full mx-auto px-8 py-4 flex items-center justify-end gap-4">
          {mounted && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="h-11 w-11 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 transition-all hover:scale-105 hover:shadow-md"
                  data-testid="button-theme-toggle"
                >
                  {theme === "dark" ? (
                    <Sun className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  ) : (
                    <Moon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {theme === "dark" ? "Modo claro" : "Modo escuro"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-full mx-auto px-6 py-8">
        {!file && !isBatchMode && status === "idle" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna Esquerda: Tabs de Processar/Gerar */}
            <div className="lg:col-span-2 space-y-6">
              <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "process" | "generate")} className="w-full">
              <TabsList className="grid w-full max-w-lg mx-auto grid-cols-2 bg-slate-100 dark:bg-slate-800">
                <TabsTrigger value="process" data-testid="tab-process" className="data-[state=active]:bg-white data-[state=active]:text-primary dark:data-[state=active]:bg-slate-700">
                  <Upload className="h-4 w-4 mr-2" />
                  Processar Gabaritos
                </TabsTrigger>
                <TabsTrigger value="generate" data-testid="tab-generate" className="data-[state=active]:bg-white data-[state=active]:text-primary dark:data-[state=active]:bg-slate-700">
                  <Users className="h-4 w-4 mr-2" />
                  Gerar Gabaritos
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="process" className="mt-6">
                <Card className="border-dashed border-2 border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-900 h-full">
                  <CardContent className="p-0 h-full">
                    <div
                      {...getRootProps()}
                      className={`min-h-64 h-full flex flex-col items-center justify-center p-12 cursor-pointer transition-colors ${
                        isDragActive ? "bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20" : "hover:bg-gradient-to-br hover:from-purple-50/50 hover:to-blue-50/50 dark:hover:from-purple-900/10 dark:hover:to-blue-900/10"
                      }`}
                      data-testid="dropzone-upload"
                    >
                      <input {...getInputProps()} data-testid="input-file-upload" />
                      <div className={`p-4 rounded-full mb-4 ${isDragActive ? "bg-purple-100 dark:bg-purple-900/30" : "bg-slate-100 dark:bg-slate-800"}`}>
                        <Upload className={`h-10 w-10 ${isDragActive ? "text-purple-600 dark:text-purple-400" : "text-slate-500 dark:text-slate-400"}`} />
                      </div>
                      <p className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-2">
                        {isDragActive ? "Solte os arquivos aqui" : "Arraste PDFs de gabarito aqui"}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        ou clique para selecionar arquivos
                      </p>
                      <div className="flex gap-2 flex-wrap justify-center">
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
                          Aceita múltiplos PDFs
                        </Badge>
                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700">
                          Processamento em lote
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="generate" className="mt-6">
                <Card>
                  <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center gap-2 text-slate-800 dark:text-slate-100">
                      <FileSpreadsheet className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      Gerar Gabaritos Personalizados
                    </CardTitle>
                    <CardDescription className="text-slate-600 dark:text-slate-400">
                      Faça upload de um CSV com os dados dos alunos para gerar gabaritos com nome, turma e matrícula já preenchidos
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {!csvFile ? (
                      <div className="border-2 border-dashed rounded-lg p-8 text-center">
                        <input
                          ref={csvInputRef}
                          type="file"
                          accept=".csv,text/csv,application/vnd.ms-excel"
                          onChange={handleCsvUpload}
                          className="hidden"
                          id="csv-upload"
                          data-testid="input-csv-upload"
                        />
                        <label
                          htmlFor="csv-upload"
                          className="cursor-pointer flex flex-col items-center"
                        >
                          <div className="p-4 rounded-full bg-muted mb-4">
                            {csvLoading ? (
                              <Loader2 className="h-10 w-10 text-primary animate-spin" />
                            ) : (
                              <FileUp className="h-10 w-10 text-muted-foreground" />
                            )}
                          </div>
                          <p className="text-lg font-medium mb-2">
                            {csvLoading ? "Processando..." : "Clique para selecionar o arquivo CSV"}
                          </p>
                          <p className="text-sm text-muted-foreground mb-4">
                            Formato esperado: NOME;TURMA;MATRICULA
                          </p>
                          <div className="flex gap-2 flex-wrap justify-center">
                            <Badge variant="outline" className="text-xs">
                              Separador: ; ou ,
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              Codificação UTF-8
                            </Badge>
                          </div>
                        </label>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-md bg-primary/10">
                              <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{csvFile.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {csvTotalStudents} alunos encontrados
                              </p>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={handleClearCsv} data-testid="button-clear-csv">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {csvPreview.length > 0 && (
                          <div>
                            <p className="text-sm font-medium mb-2 flex items-center gap-2">
                              <Eye className="h-4 w-4" />
                              Preview (primeiros {Math.min(10, csvPreview.length)} alunos)
                            </p>
                            <div className="border rounded-lg overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50">
                                    <TableHead className="text-xs font-semibold">#</TableHead>
                                    <TableHead className="text-xs font-semibold">Nome</TableHead>
                                    <TableHead className="text-xs font-semibold">Turma</TableHead>
                                    <TableHead className="text-xs font-semibold">Matrícula</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {csvPreview.map((student, idx) => (
                                    <TableRow key={idx} data-testid={`row-csv-preview-${idx}`}>
                                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                                      <TableCell className="font-medium">{student.nome}</TableCell>
                                      <TableCell>{student.turma || "-"}</TableCell>
                                      <TableCell className="font-mono">{student.matricula || "-"}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                            {csvTotalStudents > 10 && (
                              <p className="text-xs text-muted-foreground mt-2 text-center">
                                ... e mais {csvTotalStudents - 10} alunos
                              </p>
                            )}
                          </div>
                        )}
                        
                        <div className="bg-muted/30 p-4 rounded-lg space-y-2">
                          <p className="text-sm font-medium">Os gabaritos serão gerados com:</p>
                          <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                            <li className="flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              Nome do aluno no campo "NOME"
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              Turma no campo "TURMA"
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              Matrícula no campo "NÚMERO"
                            </li>
                          </ul>
                        </div>
                        
                        <Button
                          className="w-full"
                          size="lg"
                          onClick={handleGeneratePdfs}
                          disabled={pdfGenerating}
                          data-testid="button-generate-pdfs"
                        >
                          {pdfGenerating ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Gerando {csvTotalStudents} gabaritos...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Gerar e Baixar PDF ({csvTotalStudents} páginas)
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            </div>
            
            {/* Coluna Direita: Histórico de Avaliações */}
            <div className="lg:col-span-1 flex items-start pt-[72px]">
              <Card className="bg-white dark:bg-slate-900 shadow-sm w-full border-2 border-purple-200 dark:border-purple-800 flex flex-col h-full min-h-[256px]">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 pt-4 px-4 border-b-2 border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50 via-blue-50 to-purple-50 dark:from-purple-950/40 dark:via-blue-950/40 dark:to-purple-950/40 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          try {
                            // Buscar do backend primeiro
                            const response = await fetch('/api/avaliacoes');
                            if (response.ok) {
                              const result = await response.json();
                              if (result.avaliacoes) {
                                setHistoricoAvaliacoes(result.avaliacoes);
                                toast({
                                  title: "Histórico atualizado",
                                  description: `${result.avaliacoes.length} registros carregados do backend`,
                                });
                                return;
                              }
                            }
                          } catch (error) {
                            console.warn('Erro ao buscar do backend:', error);
                          }
                          
                          // Fallback: localStorage
                          const historicoSalvo = localStorage.getItem('historicoAvaliacoes');
                          if (historicoSalvo) {
                            try {
                              setHistoricoAvaliacoes(JSON.parse(historicoSalvo));
                              toast({
                                title: "Histórico atualizado",
                                description: "Histórico recarregado do cache local",
                              });
                            } catch (e) {
                              console.error('Erro ao recarregar histórico:', e);
                            }
                          }
                        }}
                        className="h-7 w-7 text-purple-600 hover:text-purple-700 hover:bg-purple-100 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-900/30"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <CardTitle className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <History className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        Histórico de Avaliações
                      </CardTitle>
                    </div>
                    <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-700 px-1.5 py-0.5">
                      {historicoAvaliacoes.length} {historicoAvaliacoes.length === 1 ? 'registro' : 'registros'}
                    </Badge>
                  </CardHeader>
                  <CardContent className="pt-3 px-4 pb-4 flex-1 overflow-hidden">
                    {historicoAvaliacoes.length > 0 ? (
                      <div className="space-y-2 h-full overflow-y-auto pr-1">
                      {historicoAvaliacoes.map((avaliacao, index) => {
                        const dataFormatada = new Date(avaliacao.data).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        });
                        const tituloCompleto = `${index + 1} - ${avaliacao.titulo}${avaliacao.local ? ` (${avaliacao.local})` : ''}`;
                        
                        return (
                          <div
                            key={avaliacao.id}
                            className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                              avaliacaoCarregada === avaliacao.id
                                ? "bg-purple-100 border-purple-400 dark:bg-purple-900/40 dark:border-purple-600 shadow-sm"
                                : "bg-white dark:bg-slate-900 hover:bg-purple-50 dark:hover:bg-purple-950/30 border-purple-200 dark:border-purple-800 hover:border-purple-300 dark:hover:border-purple-700"
                            }`}
                          >
                            <div 
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => {
                                carregarAplicacaoDoHistorico(avaliacao);
                              }}
                            >
                              <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100 mb-1 truncate">{tituloCompleto}</h3>
                              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                                <Calendar className="h-3 w-3 flex-shrink-0 text-purple-600 dark:text-purple-400" />
                                <span>{dataFormatada}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 ml-3">
                              <div className="flex flex-col items-end flex-shrink-0">
                                <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                                  {avaliacao.mediaTRI.toFixed(1)}
                                </div>
                                <div className="text-[10px] text-purple-600 dark:text-purple-400 uppercase mt-0.5 font-semibold">MÉDIA</div>
                              </div>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAvaliacaoParaDeletar(avaliacao);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Deletar avaliação?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação não pode ser desfeita. A avaliação "{avaliacao.titulo}" será permanentemente removida do histórico.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel onClick={(e) => {
                                      e.stopPropagation();
                                      setAvaliacaoParaDeletar(null);
                                    }}>
                                      Cancelar
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (avaliacaoParaDeletar) {
                                          deletarAvaliacao(avaliacaoParaDeletar);
                                        }
                                      }}
                                      className="bg-red-600 hover:bg-red-700"
                                    >
                                      Deletar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-6 h-full flex flex-col items-center justify-center">
                      <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30 w-12 h-12 mx-auto mb-3 flex items-center justify-center">
                        <History className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">Nenhuma avaliação salva ainda.</p>
                      <p className="text-[10px] mt-1.5 text-slate-500 dark:text-slate-400 px-2">Processe um PDF e calcule o TRI V2 para criar o primeiro registro.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}


        {/* Dialog for multiple PDF downloads */}
        <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                PDFs Gerados
              </DialogTitle>
              <DialogDescription>
                Os gabaritos foram divididos em {downloadLinks.length} arquivos para facilitar o download.
                Clique em cada um para baixar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {downloadLinks.map((file, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  className="w-full justify-between"
                  onClick={async () => {
                    try {
                      toast({
                        title: "Baixando...",
                        description: "Aguarde o download do arquivo.",
                      });
                      
                      // Fetch the PDF as blob (works in sandbox)
                      const response = await fetch(file.downloadUrl, {
                        credentials: "same-origin",
                      });
                      
                      if (!response.ok) {
                        throw new Error("Falha ao baixar arquivo");
                      }
                      
                      const blob = await response.blob();
                      const blobUrl = URL.createObjectURL(blob);
                      
                      // Create and click download link (no navigation)
                      const link = document.createElement("a");
                      link.href = blobUrl;
                      link.download = file.name;
                      link.style.display = "none";
                      document.body.appendChild(link);
                      link.click();
                      
                      // Cleanup
                      setTimeout(() => {
                        document.body.removeChild(link);
                        URL.revokeObjectURL(blobUrl);
                      }, 100);
                      
                      toast({
                        title: "Download concluído!",
                        description: file.name,
                      });
                    } catch (error) {
                      console.error("Download error:", error);
                      toast({
                        title: "Erro no download",
                        description: "Tente gerar o PDF novamente.",
                        variant: "destructive",
                      });
                    }
                  }}
                  data-testid={`button-download-part-${idx}`}
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {file.name}
                  </span>
                  <Badge variant="secondary">{file.pages} págs</Badge>
                </Button>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setShowDownloadDialog(false)}>
                Fechar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {isBatchMode && status !== "processing" && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Processamento em Lote</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {fileQueue.length} arquivo{fileQueue.length !== 1 ? "s" : ""} na fila
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button onClick={handleBatchProcess} data-testid="button-batch-process">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Processar Todos
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClear}
                    data-testid="button-clear-queue"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {fileQueue.map((qf) => (
                    <div
                      key={qf.id}
                      className="flex items-center justify-between p-3 rounded-md border bg-muted/30"
                      data-testid={`queue-item-${qf.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{qf.file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {qf.pageCount} página{qf.pageCount !== 1 ? "s" : ""}
                            {qf.studentCount > 0 && ` • ${qf.studentCount} aluno${qf.studentCount !== 1 ? "s" : ""}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            qf.status === "completed" ? "default" :
                            qf.status === "error" ? "destructive" :
                            qf.status === "processing" ? "secondary" :
                            "outline"
                          }
                          data-testid={`badge-status-${qf.id}`}
                        >
                          {qf.status === "pending" && "Pendente"}
                          {qf.status === "processing" && "Processando..."}
                          {qf.status === "completed" && "Concluído"}
                          {qf.status === "error" && "Erro"}
                        </Badge>
                        {qf.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFromQueue(qf.id)}
                            data-testid={`button-remove-queue-${qf.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {file && status !== "processing" && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base" data-testid="text-filename">{file.name}</CardTitle>
                    <p className="text-sm text-muted-foreground" data-testid="text-page-count">
                      {pageCount} página{pageCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {status === "idle" && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2">
                            <Switch
                              id="enable-ocr"
                              checked={enableOcr}
                              onCheckedChange={setEnableOcr}
                              data-testid="switch-ocr"
                            />
                            <Label htmlFor="enable-ocr" className="text-sm cursor-pointer flex items-center gap-1">
                              OCR Nomes
                              <Badge variant="outline" className="text-[10px] px-1 py-0">Beta</Badge>
                            </Label>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-medium">Extrai nomes via OCR (experimental)</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Baixa precisão para texto manuscrito. Os nomes podem ser editados manualmente na tabela de resultados.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                      <Button onClick={handleProcess} data-testid="button-process">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Processar Gabarito
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClear}
                    data-testid="button-remove-file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              {pagePreviews.length > 0 && (
                <CardContent className="pt-0">
                  {/* Grid de previews das páginas */}
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                    {pagePreviews.map((preview) => (
                      <div
                        key={preview.pageNumber}
                        className="relative aspect-[3/4] rounded-md overflow-hidden border bg-muted"
                        data-testid={`preview-page-${preview.pageNumber}`}
                      >
                        <img
                          src={preview.imageUrl}
                          alt={`Página ${preview.pageNumber}`}
                          className="w-full h-full object-cover"
                        />
                        <Badge
                          variant="secondary"
                          className="absolute bottom-1 right-1 text-xs px-1.5 py-0.5"
                        >
                          {preview.pageNumber}
                        </Badge>
                      </div>
                    ))}
                    {pageCount > 8 && (
                      <div className="aspect-[3/4] rounded-md border bg-muted flex items-center justify-center">
                        <span className="text-sm text-muted-foreground">
                          +{pageCount - 8}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        )}

        {(status === "uploading" || status === "processing") && (
          <Card className="border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50/50 to-blue-50/50 dark:from-purple-950/20 dark:to-blue-950/20">
            <CardContent className="py-16">
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 border-4 border-purple-200 dark:border-purple-800 rounded-full"></div>
                  </div>
                  <Loader2 className="h-12 w-12 text-purple-600 dark:text-purple-400 animate-spin relative z-10" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-xl font-semibold text-purple-900 dark:text-purple-100" data-testid="text-processing-status">
                    {status === "uploading" ? "Carregando PDF..." : `Processando página ${currentPage} de ${pageCount}...`}
                  </p>
                  <p className="text-sm text-purple-700 dark:text-purple-300">
                    {status === "uploading" ? "Aguarde enquanto o arquivo é carregado" : "Extraindo dados dos alunos com OMR"}
                  </p>
                  {status === "processing" && currentPage > 0 && (
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                      Isso pode levar alguns segundos por página...
                    </p>
                  )}
                </div>
                <div className="w-full max-w-md space-y-2">
                  <Progress 
                    value={progress} 
                    className="h-3 bg-purple-100 dark:bg-purple-900/30" 
                    data-testid="progress-processing"
                  />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-purple-700 dark:text-purple-300 font-medium">
                      {Math.round(progress)}% concluído
                    </span>
                    {status === "processing" && currentPage > 0 && pageCount > 0 && (
                      <span className="text-purple-600 dark:text-purple-400">
                        {pageCount - currentPage} página{pageCount - currentPage !== 1 ? 's' : ''} restante{pageCount - currentPage !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                {status === "processing" && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Processamento OMR otimizado em execução...</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {status === "error" && (
          <Card className="border-destructive/50">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4">
                <div className="p-3 rounded-full bg-destructive/10">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium mb-2">Erro no processamento</p>
                  <p className="text-sm text-muted-foreground" data-testid="text-error-message">
                    {errorMessage || "Ocorreu um erro ao processar o gabarito."}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClear} data-testid="button-try-again">
                    Tentar Novamente
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {status === "completed" && students.length === 0 && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4">
                <div className="p-3 rounded-full bg-muted">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium mb-2">Nenhum aluno encontrado</p>
                  <p className="text-sm text-muted-foreground">
                    Não foi possível identificar dados de alunos no PDF.
                  </p>
                </div>
                <Button variant="outline" onClick={handleClear} data-testid="button-upload-another">
                  Carregar outro PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {students.length > 0 && (
          <div className="space-y-4 mt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium text-slate-800 dark:text-slate-100" data-testid="text-success-message">
                  {students.length} aluno{students.length !== 1 ? "s" : ""} processado{students.length !== 1 ? "s" : ""}
                  {answerKey.length > 0 && statistics && (
                    <span className="text-slate-600 dark:text-slate-400">
                      {" "}| Média: {statistics.averageScore}%
                    </span>
                  )}
                </span>
              </div>
            </div>

            <Tabs value={mainActiveTab} onValueChange={setMainActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-6 bg-slate-100 dark:bg-slate-800">
                <TabsTrigger value="alunos" data-testid="tab-alunos" className="data-[state=active]:bg-white data-[state=active]:text-primary dark:data-[state=active]:bg-slate-700">
                  <Users className="h-4 w-4 mr-2" />
                  Alunos
                </TabsTrigger>
                <TabsTrigger value="scores" data-testid="tab-scores" className="data-[state=active]:bg-white data-[state=active]:text-primary dark:data-[state=active]:bg-slate-700">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Scores
                </TabsTrigger>
                <TabsTrigger 
                  value="tri" 
                  data-testid="tab-tri"
                  className="data-[state=active]:bg-white data-[state=active]:text-primary dark:data-[state=active]:bg-slate-700"
                >
                  <Calculator className="h-4 w-4 mr-2" />
                  Estatísticas TRI {triScoresCount > 0 && `(${triScoresCount})`}
                </TabsTrigger>
                <TabsTrigger value="tct" data-testid="tab-tct" disabled={!statistics} className="data-[state=active]:bg-white data-[state=active]:text-primary dark:data-[state=active]:bg-slate-700">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Estatísticas TCT
                </TabsTrigger>
                <TabsTrigger value="conteudos" data-testid="tab-conteudos" disabled={!statistics} className="data-[state=active]:bg-white data-[state=active]:text-primary dark:data-[state=active]:bg-slate-700">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Conteúdos
                </TabsTrigger>
                <TabsTrigger 
                  value="relatorio-xtri" 
                  data-testid="tab-relatorio-xtri"
                  disabled={triScoresCount === 0}
                  className="data-[state=active]:bg-white data-[state=active]:text-primary dark:data-[state=active]:bg-slate-700"
                >
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Relatório XTRI
                </TabsTrigger>
              </TabsList>

              {/* ABA 1: ALUNOS */}
              <TabsContent value="alunos" className="mt-4">
                <div className="mb-3 flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    <span>Indicadores de confiança:</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded bg-green-500" />
                    <span>Alta (80%+)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded bg-yellow-500" />
                    <span>Média (60-79%)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded bg-red-500" />
                    <span>Baixa (&lt;60%)</span>
                  </div>
                </div>
                <Card>
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow className="bg-muted/50 border-b">
                          <TableHead className="w-16 text-center font-semibold text-xs uppercase tracking-wide">#</TableHead>
                          <TableHead className="min-w-[300px] font-semibold text-xs uppercase tracking-wide">Matrícula</TableHead>
                          <TableHead className="min-w-[180px] font-semibold text-xs uppercase tracking-wide">Nome</TableHead>
                          <TableHead className="min-w-[100px] font-semibold text-xs uppercase tracking-wide">Turma</TableHead>
                          <TableHead className="w-28 text-center font-semibold text-xs uppercase tracking-wide">Ação</TableHead>
                          <TableHead className="min-w-[350px] font-semibold text-xs uppercase tracking-wide">Respostas</TableHead>
                          {answerKey.length > 0 && (
                            <TableHead className="w-24 text-center font-semibold text-xs uppercase tracking-wide">Acertos</TableHead>
                          )}
                          <TableHead className="w-20 text-center font-semibold text-xs uppercase tracking-wide">Pág</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {studentsWithScores.map((student, index) => {
                          const isLowConfidence = student.confidence !== undefined && student.confidence < 60;
                          const isMediumConfidence = student.confidence !== undefined && student.confidence >= 60 && student.confidence < 80;
                          
                          return (
                          <TableRow 
                            key={student.id} 
                            data-testid={`row-student-${index}`}
                            className={`${index % 2 === 0 ? "bg-background" : "bg-muted/30"} ${
                              isLowConfidence ? "border-l-4 border-l-destructive" : 
                              isMediumConfidence ? "border-l-4 border-l-yellow-500" : ""
                            }`}
                          >
                            <TableCell className="text-center font-medium text-muted-foreground align-top pt-2">
                              {index + 1}
                            </TableCell>
                            <TableCell className="align-top pt-2" style={{ width: 'auto', minWidth: '300px', maxWidth: '650px' }}>
                              <div className="space-y-2">
                                <Input
                                  value={student.studentNumber}
                                  onChange={(e) => updateStudentField(index, "studentNumber", e.target.value)}
                                  className="h-7 text-xs"
                                  data-testid={`input-student-number-${index}`}
                                />
                                {studentAnalyses.get(student.id)?.analysis && (
                                  <div className="space-y-2">
                                    <div className="flex justify-end">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-xs bg-white hover:bg-orange-50 border-orange-300 text-orange-700 dark:bg-slate-800 dark:hover:bg-orange-900 dark:border-orange-700 dark:text-orange-300"
                                        onClick={() => {
                                          const analysis = studentAnalyses.get(student.id)?.analysis;
                                          if (analysis) {
                                            handleGenerateAnalysisPDF(student, analysis);
                                          }
                                        }}
                                        data-testid={`button-pdf-analysis-${index}`}
                                      >
                                        <FileText className="h-3 w-3 mr-1" />
                                        Gerar PDF
                                      </Button>
                                    </div>
                                    <div className="p-4 bg-orange-50 dark:bg-orange-950 border-2 border-orange-300 dark:border-orange-700 rounded-lg shadow-sm w-full max-w-[600px] max-h-[400px] overflow-y-auto overflow-x-hidden">
                                      <div className="text-sm text-orange-900 dark:text-orange-100 leading-relaxed break-words pr-2">
                                        <div className="whitespace-pre-wrap font-mono text-xs" style={{ 
                                          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
                                        }}>
                                          {(studentAnalyses.get(student.id)?.analysis || '').split('\n').map((line, idx) => {
                                            // Formatar títulos
                                            if (line.startsWith('## ')) {
                                              return <div key={idx} className="font-bold text-base mt-3 mb-2 text-orange-900 dark:text-orange-100">{line.replace('## ', '')}</div>;
                                            }
                                            if (line.startsWith('### ')) {
                                              return <div key={idx} className="font-semibold text-sm mt-2 mb-1 text-orange-900 dark:text-orange-100">{line.replace('### ', '')}</div>;
                                            }
                                            // Formatar negrito
                                            if (line.includes('**')) {
                                              const parts = line.split(/(\*\*[^*]+\*\*)/g);
                                              return (
                                                <div key={idx} className="mb-1">
                                                  {parts.map((part, pIdx) => 
                                                    part.startsWith('**') && part.endsWith('**') 
                                                      ? <strong key={pIdx} className="font-bold">{part.replace(/\*\*/g, '')}</strong>
                                                      : <span key={pIdx}>{part}</span>
                                                  )}
                                                </div>
                                              );
                                            }
                                            // Linha normal
                                            return <div key={idx} className="mb-1">{line || '\u00A0'}</div>;
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="align-top pt-2">
                              <Input
                                value={student.studentName}
                                onChange={(e) => updateStudentField(index, "studentName", e.target.value)}
                                className="h-7 text-xs"
                                data-testid={`input-student-name-${index}`}
                              />
                            </TableCell>
                            <TableCell className="align-top pt-2">
                              <Input
                                value={student.turma || ""}
                                onChange={(e) => updateStudentField(index, "turma", e.target.value)}
                                className="h-7 text-xs"
                                placeholder="Ex: 3º A"
                                data-testid={`input-student-turma-${index}`}
                              />
                            </TableCell>
                            <TableCell className="text-center align-top pt-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs bg-orange-50 hover:bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-950 dark:hover:bg-orange-900 dark:border-orange-800 dark:text-orange-300"
                                    onClick={() => handleAnalyzeStudentProfile(student, index)}
                                    disabled={!triScores.has(student.id) && !triScoresByArea.has(student.id)}
                                    data-testid={`button-analyze-student-${index}`}
                                  >
                                    {studentAnalyses.get(student.id)?.loading ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Brain className="h-3 w-3" />
                                    )}
                                    <span className="ml-1 hidden sm:inline">Analisar</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Analisar o perfil do aluno</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="align-top pt-2">
                              {/* Layout em 6 colunas - leitura VERTICAL (igual gabarito físico) */}
                              <div className="grid grid-cols-6 gap-1.5">
                                {[0, 1, 2, 3, 4, 5].map((colIndex) => {
                                  const questionsPerColumn = Math.ceil(student.answers.length / 6);
                                  
                                  return (
                                    <div key={colIndex} className="flex flex-col gap-1">
                                      {Array.from({ length: questionsPerColumn }).map((_, rowIndex) => {
                                        const ansIndex = colIndex + (rowIndex * 6);
                                        if (ansIndex >= student.answers.length) return null;
                                        
                                        const answer = student.answers[ansIndex];
                                        const answerStr = answer != null ? String(answer) : "";
                                        const keyStr = answerKey.length > 0 && ansIndex < answerKey.length && answerKey[ansIndex] != null 
                                          ? String(answerKey[ansIndex]) : "";
                                        
                                        const isCorrect = keyStr !== "" && 
                                          answerStr.toUpperCase().trim() === keyStr.toUpperCase().trim();
                                        const isWrong = keyStr !== "" && 
                                          answerStr.trim() !== "" && answerStr.toUpperCase().trim() !== keyStr.toUpperCase().trim();
                                        
                                        return (
                                          <div key={ansIndex} className="flex items-center gap-1">
                                            <span className="text-xs text-muted-foreground w-5 text-right font-mono">
                                              {(ansIndex + 1).toString().padStart(2, '0')}
                                            </span>
                                            <Input
                                              value={answerStr || ""}
                                              onChange={(e) => updateStudentAnswer(index, ansIndex, e.target.value)}
                                              className={`h-6 w-7 text-center text-xs font-mono p-0 ${
                                                isCorrect ? "border-green-500 bg-green-50 dark:bg-green-950" : 
                                                isWrong ? "border-red-500 bg-red-50 dark:bg-red-950" : ""
                                              }`}
                                              maxLength={1}
                                              data-testid={`input-answer-${index}-${ansIndex}`}
                                            />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            </TableCell>
                            {answerKey.length > 0 && (
                              <TableCell className="text-center align-top pt-2">
                                <Badge variant={student.correctAnswers && student.correctAnswers >= answerKey.length * 0.6 ? "default" : "secondary"}>
                                  {student.correctAnswers || 0}/{answerKey.length}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell className="text-center align-top pt-2">
                              <Badge variant="outline" className="text-xs">
                                {student.pageNumber}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </TabsContent>

              {/* ABA 2: SCORES */}
              <TabsContent value="scores" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2 text-slate-800 dark:text-slate-100">
                      <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      Notas e Scores dos Alunos
                    </CardTitle>
                    <CardDescription className="text-slate-600 dark:text-slate-400">
                      Visualização completa das notas TCT (0,0 a 10,0) e TRI (0-1000) por aluno e por área (LC, CH, CN, MT).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow className="bg-muted/50 border-b">
                            <TableHead className="w-16 text-center font-semibold text-xs uppercase tracking-wide">#</TableHead>
                            <TableHead className="min-w-[120px] font-semibold text-xs uppercase tracking-wide">Matrícula</TableHead>
                            <TableHead className="min-w-[180px] font-semibold text-xs uppercase tracking-wide">Nome</TableHead>
                            <TableHead className="min-w-[100px] font-semibold text-xs uppercase tracking-wide">Turma</TableHead>
                            <TableHead className="w-24 text-center font-semibold text-xs uppercase tracking-wide">Acertos</TableHead>
                            {selectedTemplate.name.includes("ENEM") && (
                              <>
                                {/* TCT: Todas as 4 áreas */}
                                <TableHead className="w-32 text-center font-semibold text-xs uppercase tracking-wide bg-blue-50 dark:bg-blue-950">LC (TCT)</TableHead>
                                <TableHead className="w-32 text-center font-semibold text-xs uppercase tracking-wide bg-blue-50 dark:bg-blue-950">CH (TCT)</TableHead>
                                <TableHead className="w-32 text-center font-semibold text-xs uppercase tracking-wide bg-blue-50 dark:bg-blue-950">CN (TCT)</TableHead>
                                <TableHead className="w-32 text-center font-semibold text-xs uppercase tracking-wide bg-blue-50 dark:bg-blue-950">MT (TCT)</TableHead>
                                {/* TRI: Todas as 4 áreas */}
                                <TableHead className="w-32 text-center font-semibold text-xs uppercase tracking-wide bg-purple-50 dark:bg-purple-950">LC (TRI)</TableHead>
                                <TableHead className="w-32 text-center font-semibold text-xs uppercase tracking-wide bg-purple-50 dark:bg-purple-950">CH (TRI)</TableHead>
                                <TableHead className="w-32 text-center font-semibold text-xs uppercase tracking-wide bg-purple-50 dark:bg-purple-950">CN (TRI)</TableHead>
                                <TableHead className="w-32 text-center font-semibold text-xs uppercase tracking-wide bg-purple-50 dark:bg-purple-950">MT (TRI)</TableHead>
                              </>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {statistics?.studentStats?.map((student, index) => {
                            const notaTCT = student.nota || 0;
                            const triScore = student.triScore || null;
                            
                            return (
                              <TableRow 
                                key={`${student.matricula}-${index}`}
                                className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}
                              >
                                <TableCell className="text-center font-medium text-muted-foreground">
                                  {index + 1}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {student.matricula}
                                </TableCell>
                                <TableCell>
                                  {student.nome}
                                </TableCell>
                                <TableCell>
                                  {student.turma || "-"}
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="font-semibold">{student.acertos}</span>
                                </TableCell>
                                {selectedTemplate.name.includes("ENEM") && (
                                  <>
                                    {/* TCT: Todas as 4 áreas sempre visíveis */}
                                    <TableCell className="text-center bg-blue-50/50 dark:bg-blue-950/50">
                                      {student.lc !== null && student.lc !== undefined ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                                            {student.lc.toFixed(1)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">{student.lcAcertos || 0} acertos</span>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground text-sm">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center bg-blue-50/50 dark:bg-blue-950/50">
                                      {student.ch !== null && student.ch !== undefined ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                                            {student.ch.toFixed(1)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">{student.chAcertos || 0} acertos</span>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground text-sm">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center bg-blue-50/50 dark:bg-blue-950/50">
                                      {student.cn !== null && student.cn !== undefined ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                                            {student.cn.toFixed(1)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">{student.cnAcertos || 0} acertos</span>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground text-sm">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center bg-blue-50/50 dark:bg-blue-950/50">
                                      {student.mt !== null && student.mt !== undefined ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                                            {student.mt.toFixed(1)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">{student.mtAcertos || 0} acertos</span>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground text-sm">-</span>
                                      )}
                                    </TableCell>
                                    
                                    {/* TRI: Todas as 4 áreas sempre visíveis */}
                                    <TableCell className="text-center bg-purple-50/50 dark:bg-purple-950/50">
                                      {student.triLc !== null && student.triLc !== undefined ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="font-semibold text-purple-600 dark:text-purple-400">
                                            {student.triLc.toFixed(2)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">{student.lcAcertos || 0} acertos</span>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground text-sm">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center bg-purple-50/50 dark:bg-purple-950/50">
                                      {student.triCh !== null && student.triCh !== undefined ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="font-semibold text-purple-600 dark:text-purple-400">
                                            {student.triCh.toFixed(2)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">{student.chAcertos || 0} acertos</span>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground text-sm">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center bg-purple-50/50 dark:bg-purple-950/50">
                                      {student.triCn !== null && student.triCn !== undefined ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="font-semibold text-purple-600 dark:text-purple-400">
                                            {student.triCn.toFixed(2)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">{student.cnAcertos || 0} acertos</span>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground text-sm">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center bg-purple-50/50 dark:bg-purple-950/50">
                                      {student.triMt !== null && student.triMt !== undefined ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="font-semibold text-purple-600 dark:text-purple-400">
                                            {student.triMt.toFixed(2)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">{student.mtAcertos || 0} acertos</span>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground text-sm">-</span>
                                      )}
                                    </TableCell>
                                  </>
                                )}
                              </TableRow>
                            );
                          }) || (
                            <TableRow>
                              <TableCell colSpan={selectedTemplate.name.includes("ENEM") ? 13 : 7} className="text-center py-8 text-muted-foreground">
                                Nenhum dado disponível. Processe um PDF e configure o gabarito primeiro.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ABA 3: ESTATISTICAS TRI */}
              <TabsContent value="tri" className="mt-4">
                {triScoresCount > 0 && triScores.size > 0 && (
                  <div className="space-y-4" data-testid="statistics-tri-grid">
                    {/* Cards por Área - TRI */}
                    {(() => {
                      if (triScoresByArea.size > 0) {
                        const areas = [
                          { code: 'LC', name: 'Linguagens', color: 'blue' },
                          { code: 'CH', name: 'Humanas', color: 'green' },
                          { code: 'CN', name: 'Natureza', color: 'purple' },
                          { code: 'MT', name: 'Matemática', color: 'orange' }
                        ];
                        
                        const areaCards = areas.map(({ code, name, color }) => {
                          // Calcular estatísticas da área
                          const areaScores = Array.from(triScoresByArea.values())
                            .map(areaScores => areaScores[code])
                            .filter((score): score is number => score !== undefined && score > 0);
                          
                          if (areaScores.length === 0) return null;
                          
                          const triMedio = areaScores.reduce((a, b) => a + b, 0) / areaScores.length;
                          const triMin = Math.min(...areaScores);
                          const triMax = Math.max(...areaScores);
                          
                          // Calcular posição na barra (0-100%)
                          const range = triMax - triMin;
                          const position = range > 0 ? ((triMedio - triMin) / range) * 100 : 50;
                          
                          const colorClasses = {
                            blue: {
                              bg: 'from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900',
                              border: 'border-blue-200 dark:border-blue-800',
                              text: 'text-blue-700 dark:text-blue-300',
                              bar: 'bg-blue-500',
                              marker: 'bg-blue-600'
                            },
                            green: {
                              bg: 'from-green-50 to-green-100 dark:from-green-950 dark:to-green-900',
                              border: 'border-green-200 dark:border-green-800',
                              text: 'text-green-700 dark:text-green-300',
                              bar: 'bg-green-500',
                              marker: 'bg-green-600'
                            },
                            purple: {
                              bg: 'from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900',
                              border: 'border-purple-200 dark:border-purple-800',
                              text: 'text-purple-700 dark:text-purple-300',
                              bar: 'bg-purple-500',
                              marker: 'bg-purple-600'
                            },
                            orange: {
                              bg: 'from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900',
                              border: 'border-orange-200 dark:border-orange-800',
                              text: 'text-orange-700 dark:text-orange-300',
                              bar: 'bg-orange-500',
                              marker: 'bg-orange-600'
                            }
                          };
                          
                          const colors = colorClasses[color as keyof typeof colorClasses];
                          
                          return (
                            <Card key={code} className={`border-2 ${colors.border}`}>
                              <CardContent className="p-6">
                                <div className="space-y-4">
                                  <div>
                                    <h3 className="text-lg font-bold mb-1">{name}</h3>
                                    <p className={`text-4xl font-bold ${colors.text}`}>{triMedio.toFixed(1)}</p>
                                    <p className="text-sm text-muted-foreground mt-1">TRI</p>
                                  </div>
                                  
                                  {/* Barra de Progresso */}
                                  <div className="space-y-2">
                                    <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                      <div className={`absolute top-0 left-0 h-full ${colors.bar} opacity-30 w-full`}></div>
                                      <div 
                                        className={`absolute top-0 left-0 h-full w-1 ${colors.marker} shadow-lg`}
                                        style={{ left: `${Math.max(0, Math.min(100, position))}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                  
                                  {/* Estatísticas de Referência */}
                                  <div className="pt-2 border-t border-border">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Estatísticas da Turma</p>
                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                      <div>
                                        <p className="text-muted-foreground">Mínimo</p>
                                        <p className="font-bold">{triMin.toFixed(1)}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">Média</p>
                                        <p className="font-bold">{triMedio.toFixed(1)}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">Máximo</p>
                                        <p className="font-bold">{triMax.toFixed(1)}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        }).filter(Boolean);
                        
                        if (areaCards.length > 0) {
                          return (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                              {areaCards}
                            </div>
                          );
                        }
                      }
                      return null;
                    })()}

                    {/* Gráfico de Dispersão: Acertos vs TRI */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Dispersão: Acertos vs TRI</CardTitle>
                        <CardDescription>
                          Relação entre número de acertos e nota TRI
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={400}>
                          <ScatterChart>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              type="number" 
                              dataKey="acertos" 
                              name="Acertos" 
                              label={{ value: "Número de Acertos", position: "insideBottom", offset: -5 }}
                              tick={{ fontSize: 12 }}
                            />
                            <YAxis 
                              type="number" 
                              dataKey="tri" 
                              name="TRI" 
                              label={{ value: "Nota TRI", angle: -90, position: "insideLeft" }}
                              tick={{ fontSize: 12 }}
                            />
                            <RechartsTooltip 
                              cursor={{ strokeDasharray: '3 3' }}
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                                      <p className="font-semibold">{data.nome}</p>
                                      <p className="text-sm text-muted-foreground">Acertos: {data.acertos}</p>
                                      <p className="text-sm text-blue-600 font-medium">TRI: {data.tri.toFixed(1)}</p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Scatter 
                              name="Alunos" 
                              data={(() => {
                                return studentsWithScores.map(student => {
                                  const triScore = triScores.get(student.id);
                                  return {
                                    nome: student.studentName,
                                    acertos: student.correctAnswers || 0,
                                    tri: triScore || 0,
                                  };
                                }).filter(d => d.tri > 0);
                              })()} 
                              fill="#3b82f6" 
                            />
                          </ScatterChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Gráfico de Barras: Performance por Área */}
                    {(() => {
                      // Usar triScoresByArea para ter dados reais por área
                      if (triScoresByArea.size > 0) {
                        const areas = ['LC', 'CH', 'CN', 'MT'];
                        const areaTriData = areas.map(area => {
                          const studentsForArea = Array.from(triScoresByArea.values())
                            .map(areaScores => areaScores[area])
                            .filter((score): score is number => score !== undefined && score > 0);
                          
                          const avg = studentsForArea.length > 0 
                            ? studentsForArea.reduce((a, b) => a + b, 0) / studentsForArea.length 
                            : 0;
                          
                          // Calcular acertos médios por área (se disponível)
                          let avgAcertos = 0;
                          try {
                            const acertosMedios = studentsWithScores
                              .map(s => s.areaCorrectAnswers?.[area] || 0)
                              .filter(a => a > 0);
                            avgAcertos = acertosMedios.length > 0
                              ? acertosMedios.reduce((a, b) => a + b, 0) / acertosMedios.length
                              : 0;
                          } catch (e) {
                            // Se areaCorrectAnswers não estiver disponível, usar 0
                            avgAcertos = 0;
                          }
                          
                          return { 
                            area, 
                            tri: avg, 
                            acertos: avgAcertos,
                            count: studentsForArea.length 
                          };
                        });

                        // Mostrar apenas áreas que têm dados
                        const areaTriDataFiltered = areaTriData.filter(d => d.tri > 0);

                        if (areaTriDataFiltered.length > 0) {
                          return (
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-base">Performance por Área</CardTitle>
                                <CardDescription>
                                  Média TRI e acertos por área de conhecimento ({areaTriDataFiltered.length} área(s) calculada(s))
                                </CardDescription>
                              </CardHeader>
                              <CardContent>
                                <ResponsiveContainer width="100%" height={400}>
                                  <BarChart data={areaTriDataFiltered} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis 
                                      type="number" 
                                      domain={[0, 1000]}
                                      tick={{ fontSize: 12 }}
                                      label={{ value: "Nota TRI", position: "insideBottom", offset: -5 }}
                                    />
                                    <YAxis 
                                      dataKey="area" 
                                      type="category" 
                                      tick={{ fontSize: 12 }}
                                      width={60}
                                    />
                                    <RechartsTooltip 
                                      formatter={(value: number, name: string, props: any) => {
                                        if (name === "tri") {
                                          return [`${value.toFixed(1)} (${props.payload.count} aluno(s))`, "TRI Médio"];
                                        }
                                        return [`${value.toFixed(1)}`, "Acertos Médios"];
                                      }}
                                      contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                                    />
                                    <Legend />
                                    <Bar 
                                      dataKey="tri" 
                                      name="TRI Médio" 
                                      radius={[0, 4, 4, 0]}
                                    >
                                      {areaTriDataFiltered.map((entry, index) => (
                                        <Cell 
                                          key={`cell-${index}`} 
                                          fill={
                                            entry.tri >= 600 ? "#10b981" : // Verde para TRI alto
                                            entry.tri >= 400 ? "#eab308" : // Amarelo para TRI médio
                                            "#ef4444" // Vermelho para TRI baixo
                                          } 
                                        />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              </CardContent>
                            </Card>
                          );
                        }
                      }
                      return null;
                    })()}

                    {/* Gráfico Radar por Área (se ENEM) - Mantido para comparação */}
                    {(() => {
                      // Usar triScoresByArea para ter dados reais por área
                      if (triScoresByArea.size > 0) {
                        const areas = ['LC', 'CH', 'CN', 'MT'];
                        const areaTriData = areas.map(area => {
                          const studentsForArea = Array.from(triScoresByArea.values())
                            .map(areaScores => areaScores[area])
                            .filter((score): score is number => score !== undefined && score > 0);
                          
                          const avg = studentsForArea.length > 0 
                            ? studentsForArea.reduce((a, b) => a + b, 0) / studentsForArea.length 
                            : 0;
                          
                          return { area, value: avg, count: studentsForArea.length };
                        });

                        // Mostrar apenas áreas que têm dados
                        const areaTriDataFiltered = areaTriData.filter(d => d.value > 0);

                        if (areaTriDataFiltered.length > 0) {
                          return (
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-base">Radar: TRI por Área</CardTitle>
                                <CardDescription>
                                  Média TRI por área de conhecimento ({areaTriDataFiltered.length} área(s) calculada(s))
                                </CardDescription>
                              </CardHeader>
                              <CardContent>
                                <ResponsiveContainer width="100%" height={400}>
                                  <RadarChart data={areaTriDataFiltered}>
                                    <PolarGrid />
                                    <PolarAngleAxis dataKey="area" tick={{ fontSize: 12 }} />
                                    <PolarRadiusAxis angle={90} domain={[0, 1000]} tick={{ fontSize: 10 }} />
                                    <Radar 
                                      name="TRI" 
                                      dataKey="value" 
                                      stroke="#3b82f6" 
                                      fill="#3b82f6" 
                                      fillOpacity={0.6} 
                                    />
                                    <RechartsTooltip 
                                      formatter={(value: number, name, props) => [
                                        `${value.toFixed(1)} (${props.payload.count} aluno(s))`, 
                                        "TRI Médio"
                                      ]}
                                    />
                                  </RadarChart>
                                </ResponsiveContainer>
                              </CardContent>
                            </Card>
                          );
                        }
                      }
                      return null;
                    })()}

                    {/* Gráfico de Barras: Distribuição de Notas TRI */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Distribuição de Notas TRI</CardTitle>
                        <CardDescription>
                          Quantidade de alunos por faixa de nota TRI (escala 0-1000)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={(() => {
                            // Criar distribuição por faixas TRI
                            const triRanges = [
                              { name: "0-300", min: 0, max: 300, count: 0, color: "#ef4444" },
                              { name: "300-500", min: 300, max: 500, count: 0, color: "#f97316" },
                              { name: "500-700", min: 500, max: 700, count: 0, color: "#eab308" },
                              { name: "700-900", min: 700, max: 900, count: 0, color: "#22c55e" },
                              { name: "900-1000", min: 900, max: 1000, count: 0, color: "#10b981" },
                            ];
                            
                            Array.from(triScores.values()).forEach(triScore => {
                              for (const range of triRanges) {
                                if (triScore >= range.min && triScore < range.max) {
                                  range.count++;
                                  break;
                                }
                              }
                              // Caso especial: 1000 exato
                              if (triScore === 1000) {
                                triRanges[4].count++;
                              }
                            });
                            
                            return triRanges;
                          })()}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                            <RechartsTooltip 
                              formatter={(value: number) => [`${value} aluno(s)`, "Quantidade"]}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                              {(() => {
                                const triRanges = [
                                  { name: "0-300", min: 0, max: 300, count: 0, color: "#ef4444" },
                                  { name: "300-500", min: 300, max: 500, count: 0, color: "#f97316" },
                                  { name: "500-700", min: 500, max: 700, count: 0, color: "#eab308" },
                                  { name: "700-900", min: 700, max: 900, count: 0, color: "#22c55e" },
                                  { name: "900-1000", min: 900, max: 1000, count: 0, color: "#10b981" },
                                ];
                                
                                Array.from(triScores.values()).forEach(triScore => {
                                  for (const range of triRanges) {
                                    if (triScore >= range.min && triScore < range.max) {
                                      range.count++;
                                      break;
                                    }
                                  }
                                  if (triScore === 1000) {
                                    triRanges[4].count++;
                                  }
                                });
                                
                                return triRanges;
                              })().map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Gráfico: Conteúdos com Mais Erros */}
                    {statistics?.contentStats && statistics.contentStats.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Conteúdos com Mais Erros</CardTitle>
                          <CardDescription>
                            Principais conteúdos onde os alunos apresentaram mais dificuldades
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={400}>
                            <BarChart 
                              data={(() => {
                                // Ordenar por porcentagem de erro (maior primeiro) e pegar top 10
                                const sorted = [...statistics.contentStats]
                                  .sort((a, b) => b.errorPercentage - a.errorPercentage)
                                  .slice(0, 10)
                                  .map(item => ({
                                    conteudo: item.content.length > 40 
                                      ? item.content.substring(0, 40) + "..." 
                                      : item.content,
                                    conteudoCompleto: item.content,
                                    erroPercentual: item.errorPercentage,
                                    totalErros: item.totalErrors,
                                    totalQuestoes: item.totalQuestions,
                                    totalTentativas: item.totalAttempts
                                  }));
                                return sorted;
                              })()}
                              layout="vertical"
                            >
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis 
                                type="number" 
                                domain={[0, 100]}
                                tick={{ fontSize: 12 }}
                                label={{ value: "% de Erros", position: "insideBottom", offset: -5 }}
                              />
                              <YAxis 
                                dataKey="conteudo" 
                                type="category" 
                                tick={{ fontSize: 11 }}
                                width={200}
                              />
                              <RechartsTooltip 
                                formatter={(value: number, name: string, props: any) => {
                                  if (name === "erroPercentual") {
                                    return [
                                      `${value.toFixed(1)}% (${props.payload.totalErros} erros de ${props.payload.totalTentativas} tentativas)`,
                                      "% de Erros"
                                    ];
                                  }
                                  return [value, name];
                                }}
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                                        <p className="font-semibold text-sm mb-2">{data.conteudoCompleto}</p>
                                        <p className="text-xs text-muted-foreground">
                                          <span className="font-medium">Erros:</span> {data.totalErros} de {data.totalTentativas} tentativas
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          <span className="font-medium">% de Erros:</span> {data.erroPercentual.toFixed(1)}%
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          <span className="font-medium">Questões:</span> {data.totalQuestoes}
                                        </p>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Bar 
                                dataKey="erroPercentual" 
                                name="% de Erros"
                                radius={[0, 4, 4, 0]}
                              >
                                {(() => {
                                  const sorted = [...(statistics.contentStats || [])]
                                    .sort((a, b) => b.errorPercentage - a.errorPercentage)
                                    .slice(0, 10);
                                  
                                  return sorted.map((entry, index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={
                                        entry.errorPercentage >= 70 ? "#ef4444" : // Vermelho: muitos erros
                                        entry.errorPercentage >= 50 ? "#f97316" : // Laranja: erros moderados
                                        entry.errorPercentage >= 30 ? "#eab308" : // Amarelo: alguns erros
                                        "#22c55e" // Verde: poucos erros
                                      } 
                                    />
                                  ));
                                })()}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
                {triScoresCount === 0 && (
                  <Card>
                    <CardContent className="py-12">
                      <div className="text-center text-muted-foreground">
                        <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">Nenhum dado TRI disponível</p>
                        <p className="text-sm">Calcule as notas TRI primeiro usando o botão "Calcular por TRI Média" na aba Gabarito.</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ABA 4: ESTATISTICAS TCT */}
              <TabsContent value="tct" className="mt-4">
                {statistics && (
                  <div className="space-y-4" data-testid="statistics-tct-grid">
                    {/* Cards por Área - TCT */}
                    {(() => {
                      // SEMPRE mostrar as 4 áreas (LC, CH, CN, MT), independente do template
                      const allAreas = [
                        { area: 'LC', name: 'Linguagens', color: 'blue' },
                        { area: 'CH', name: 'Humanas', color: 'green' },
                        { area: 'CN', name: 'Natureza', color: 'purple' },
                        { area: 'MT', name: 'Matemática', color: 'orange' }
                      ];
                      
                      // Debug
                      console.log('[TCT Cards] statistics.studentStats:', statistics.studentStats?.length);
                      if (statistics.studentStats && statistics.studentStats.length > 0) {
                        console.log('[TCT Cards] Primeiro aluno:', statistics.studentStats[0]);
                        console.log('[TCT Cards] Primeiro aluno - LC:', statistics.studentStats[0].lc, 'CH:', statistics.studentStats[0].ch, 'CN:', statistics.studentStats[0].cn, 'MT:', statistics.studentStats[0].mt);
                      }
                      
                      // SEMPRE renderizar os 4 cards, mesmo sem statistics.studentStats
                      const areaCards = allAreas.map(({ area, name, color }) => {
                          // Calcular notas TCT por área (escala 0-10)
                          let areaScores: number[] = [];
                          
                          if (statistics.studentStats && statistics.studentStats.length > 0) {
                            areaScores = statistics.studentStats
                              .map(s => {
                                const score = area === "LC" ? s.lc : area === "CH" ? s.ch : area === "CN" ? s.cn : area === "MT" ? s.mt : null;
                                // s.lc, s.ch, etc. já estão em escala 0-100 (porcentagem), converter para 0-10
                                return score !== null && score !== undefined ? score / 10 : null;
                              })
                              .filter((s): s is number => s !== null && s !== undefined);
                            
                            console.log(`[TCT Cards] Área ${area}: ${areaScores.length} alunos com dados`);
                          }
                          
                          // Se não houver dados para esta área, ainda mostrar o card com 0
                          if (areaScores.length === 0) {
                            // Retornar card com valores zerados
                            const colorClasses = {
                              blue: {
                                bg: 'from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900',
                                border: 'border-blue-200 dark:border-blue-800',
                                text: 'text-blue-700 dark:text-blue-300',
                                bar: 'bg-blue-500',
                                marker: 'bg-blue-600'
                              },
                              green: {
                                bg: 'from-green-50 to-green-100 dark:from-green-950 dark:to-green-900',
                                border: 'border-green-200 dark:border-green-800',
                                text: 'text-green-700 dark:text-green-300',
                                bar: 'bg-green-500',
                                marker: 'bg-green-600'
                              },
                              purple: {
                                bg: 'from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900',
                                border: 'border-purple-200 dark:border-purple-800',
                                text: 'text-purple-700 dark:text-purple-300',
                                bar: 'bg-purple-500',
                                marker: 'bg-purple-600'
                              },
                              orange: {
                                bg: 'from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900',
                                border: 'border-orange-200 dark:border-orange-800',
                                text: 'text-orange-700 dark:text-orange-300',
                                bar: 'bg-orange-500',
                                marker: 'bg-orange-600'
                              }
                            };
                            
                            const colors = colorClasses[color as keyof typeof colorClasses];
                            
                            return (
                              <Card key={area} className={`border-2 ${colors.border} opacity-50`}>
                                <CardContent className="p-6">
                                  <div className="space-y-4">
                                    <div>
                                      <h3 className="text-lg font-bold mb-1">{name}</h3>
                                      <p className={`text-4xl font-bold ${colors.text}`}>0.0</p>
                                      <p className="text-sm text-muted-foreground mt-1">TCT</p>
                                    </div>
                                    <div className="space-y-2">
                                      <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div className={`absolute top-0 left-0 h-full ${colors.bar} opacity-30 w-full`}></div>
                                      </div>
                                    </div>
                                    <div className="pt-2 border-t border-border">
                                      <p className="text-xs font-medium text-muted-foreground mb-2">Estatísticas da Turma</p>
                                      <div className="grid grid-cols-3 gap-2 text-xs">
                                        <div>
                                          <p className="text-muted-foreground">Mínimo</p>
                                          <p className="font-bold">0.0</p>
                                        </div>
                                        <div>
                                          <p className="text-muted-foreground">Média</p>
                                          <p className="font-bold">0.0</p>
                                        </div>
                                        <div>
                                          <p className="text-muted-foreground">Máximo</p>
                                          <p className="font-bold">0.0</p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          }
                          
                          const tctMedio = areaScores.reduce((a, b) => a + b, 0) / areaScores.length;
                          const tctMin = Math.min(...areaScores);
                          const tctMax = Math.max(...areaScores);
                          
                          // Calcular posição na barra (0-100%)
                          const range = tctMax - tctMin;
                          const position = range > 0 ? ((tctMedio - tctMin) / range) * 100 : 50;
                          
                          const colorClasses = {
                            blue: {
                              bg: 'from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900',
                              border: 'border-blue-200 dark:border-blue-800',
                              text: 'text-blue-700 dark:text-blue-300',
                              bar: 'bg-blue-500',
                              marker: 'bg-blue-600'
                            },
                            green: {
                              bg: 'from-green-50 to-green-100 dark:from-green-950 dark:to-green-900',
                              border: 'border-green-200 dark:border-green-800',
                              text: 'text-green-700 dark:text-green-300',
                              bar: 'bg-green-500',
                              marker: 'bg-green-600'
                            },
                            purple: {
                              bg: 'from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900',
                              border: 'border-purple-200 dark:border-purple-800',
                              text: 'text-purple-700 dark:text-purple-300',
                              bar: 'bg-purple-500',
                              marker: 'bg-purple-600'
                            },
                            orange: {
                              bg: 'from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900',
                              border: 'border-orange-200 dark:border-orange-800',
                              text: 'text-orange-700 dark:text-orange-300',
                              bar: 'bg-orange-500',
                              marker: 'bg-orange-600'
                            }
                          };
                          
                          const colors = colorClasses[color as keyof typeof colorClasses];
                          
                          return (
                            <Card key={area} className={`border-2 ${colors.border}`}>
                              <CardContent className="p-6">
                                <div className="space-y-4">
                                  <div>
                                    <h3 className="text-lg font-bold mb-1">{name}</h3>
                                    <p className={`text-4xl font-bold ${colors.text}`}>{tctMedio.toFixed(1)}</p>
                                    <p className="text-sm text-muted-foreground mt-1">TCT</p>
                                  </div>
                                  
                                  {/* Barra de Progresso */}
                                  <div className="space-y-2">
                                    <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                      <div className={`absolute top-0 left-0 h-full ${colors.bar} opacity-30 w-full`}></div>
                                      <div 
                                        className={`absolute top-0 left-0 h-full w-1 ${colors.marker} shadow-lg`}
                                        style={{ left: `${Math.max(0, Math.min(100, position))}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                  
                                  {/* Estatísticas de Referência */}
                                  <div className="pt-2 border-t border-border">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Estatísticas da Turma</p>
                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                      <div>
                                        <p className="text-muted-foreground">Mínimo</p>
                                        <p className="font-bold">{tctMin.toFixed(1)}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">Média</p>
                                        <p className="font-bold">{tctMedio.toFixed(1)}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">Máximo</p>
                                        <p className="font-bold">{tctMax.toFixed(1)}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        });
                        
                        console.log('[TCT Cards] Total de cards gerados:', areaCards.length);
                        
                        // SEMPRE retornar os 4 cards, mesmo sem dados
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {areaCards}
                          </div>
                        );
                    })()}

                    {/* Gráfico Min/Med/Max por Área */}
                    {(() => {
                      const areas = getAreasByTemplate(selectedTemplate.name, numQuestions);
                      if (areas.length > 0 && statistics.studentStats) {
                        const areaStats = areas.map(({ area }) => {
                          const areaScores = statistics.studentStats!
                            .map(s => {
                              const score = area === "LC" ? s.lc : area === "CH" ? s.ch : area === "CN" ? s.cn : area === "MT" ? s.mt : null;
                              return score !== null && score !== undefined ? score : null;
                            })
                            .filter((s): s is number => s !== null);
                          
                          if (areaScores.length === 0) return null;
                          
                          return {
                            area,
                            min: Math.min(...areaScores),
                            med: areaScores.reduce((a, b) => a + b, 0) / areaScores.length,
                            max: Math.max(...areaScores),
                          };
                        }).filter((s): s is { area: string; min: number; med: number; max: number } => s !== null);

                        return (
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base">Notas TCT: Min, Média e Max por Área</CardTitle>
                              <CardDescription>
                                Distribuição de notas TCT por área de conhecimento
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <ResponsiveContainer width="100%" height={400}>
                                <BarChart data={areaStats}>
                                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                  <XAxis dataKey="area" tick={{ fontSize: 12 }} />
                                  <YAxis tick={{ fontSize: 12 }} domain={[0, 10]} />
                                  <RechartsTooltip 
                                    formatter={(value: number) => [value.toFixed(1), ""]}
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                                  />
                                  <Legend />
                                  <Bar dataKey="min" fill="#ef4444" name="Mínima" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="med" fill="#3b82f6" name="Média" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="max" fill="#10b981" name="Máxima" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </CardContent>
                          </Card>
                        );
                      }
                      return null;
                    })()}

                    {/* Distribuição de Notas TCT */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Distribuição de Notas TCT</CardTitle>
                        <CardDescription>
                          Quantidade de alunos por faixa de nota (escala 0,0 a 10,0)
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={(() => {
                            // Criar distribuição específica para TCT (0,0 a 10,0)
                            const tctRanges = [
                              { name: "0,0-2,0", min: 0, max: 2.0, count: 0, color: "#ef4444" },
                              { name: "2,1-4,0", min: 2.1, max: 4.0, count: 0, color: "#f97316" },
                              { name: "4,1-6,0", min: 4.1, max: 6.0, count: 0, color: "#eab308" },
                              { name: "6,1-8,0", min: 6.1, max: 8.0, count: 0, color: "#22c55e" },
                              { name: "8,1-10,0", min: 8.1, max: 10.0, count: 0, color: "#10b981" },
                            ];
                            
                            studentsWithScores.forEach(student => {
                              // Converter score de porcentagem (0-100) para TCT (0,0-10,0)
                              const tctScore = (student.score || 0) / 10;
                              for (const range of tctRanges) {
                                if (tctScore >= range.min && tctScore <= range.max) {
                                  range.count++;
                                  break;
                                }
                              }
                            });
                            
                            return tctRanges;
                          })()}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                            <RechartsTooltip 
                              formatter={(value: number) => [`${value} aluno(s)`, "Quantidade"]}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                            />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                              {(() => {
                                const tctRanges = [
                                  { name: "0,0-2,0", min: 0, max: 2.0, count: 0, color: "#ef4444" },
                                  { name: "2,1-4,0", min: 2.1, max: 4.0, count: 0, color: "#f97316" },
                                  { name: "4,1-6,0", min: 4.1, max: 6.0, count: 0, color: "#eab308" },
                                  { name: "6,1-8,0", min: 6.1, max: 8.0, count: 0, color: "#22c55e" },
                                  { name: "8,1-10,0", min: 8.1, max: 10.0, count: 0, color: "#10b981" },
                                ];
                                
                                studentsWithScores.forEach(student => {
                                  const tctScore = (student.score || 0) / 10;
                                  for (const range of tctRanges) {
                                    if (tctScore >= range.min && tctScore <= range.max) {
                                      range.count++;
                                      break;
                                    }
                                  }
                                });
                                
                                return tctRanges;
                              })().map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>

              {/* ABA 5: CONTEÚDOS */}
              <TabsContent value="conteudos" className="mt-4">
                {statistics && (
                  <div className="space-y-4" data-testid="statistics-conteudos-grid">
                    {/* Card de Análise por Questão com Conteúdo */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Análise por Questão</CardTitle>
                        <CardDescription>
                          Porcentagem de acertos e conteúdo de cada questão
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-5 sm:grid-cols-9 md:grid-cols-15 gap-2">
                          {statistics.questionStats.map((stat) => (
                            <Tooltip key={stat.questionNumber}>
                              <TooltipTrigger asChild>
                                <div 
                                  className="flex flex-col items-center gap-1 cursor-help min-w-[60px]"
                                  data-testid={`stat-question-${stat.questionNumber}`}
                                >
                                  <span className="text-xs font-medium text-muted-foreground">Q{stat.questionNumber}</span>
                                  <div 
                                    className={`h-8 w-10 rounded flex items-center justify-center text-xs font-medium ${
                                      stat.correctPercentage >= 71 ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                                      stat.correctPercentage >= 50 ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" :
                                      "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                                    }`}
                                  >
                                    {stat.correctPercentage}%
                                  </div>
                                  {stat.content && (
                                    <span className="text-[8px] text-muted-foreground text-center leading-tight max-w-[60px] px-1 line-clamp-2" title={stat.content}>
                                      {stat.content}
                                    </span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="font-medium">Questão {stat.questionNumber}</p>
                                {stat.content && (
                                  <p className="text-sm mt-1">{stat.content}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  Acertos: {stat.correctPercentage}% ({stat.correctCount}/{statistics.totalStudents})
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Erros: {stat.wrongCount} ({Math.round((stat.wrongCount / statistics.totalStudents) * 100)}%)
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Estatísticas por Conteúdo */}
                    {statistics.contentStats && statistics.contentStats.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Análise por Conteúdo</CardTitle>
                          <CardDescription>
                            Porcentagem de erros por conteúdo/assunto
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3 max-h-96 overflow-y-auto">
                            {statistics.contentStats.map((stat, idx) => (
                              <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{stat.content}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {stat.totalQuestions} questão(ões) • {stat.totalAttempts} tentativa(s)
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className={`text-lg font-bold ${
                                    stat.errorPercentage >= 50 ? "text-red-600" :
                                    stat.errorPercentage >= 30 ? "text-yellow-600" :
                                    "text-green-600"
                                  }`}>
                                    {stat.errorPercentage}%
                                  </p>
                                  <p className="text-xs text-muted-foreground">erros</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ABA 7: RELATÓRIO XTRI */}
              <TabsContent value="relatorio-xtri" className="mt-4">
                {triScoresCount > 0 && (
                  <div className="space-y-6">
                    {/* Header com informações gerais */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          Relatório de Performance XTRI
                        </CardTitle>
                        <CardDescription>
                          Análise diagnóstica para coordenação pedagógica
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                          <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                            <Users className="h-8 w-8 text-blue-600" />
                            <div>
                              <p className="text-sm text-muted-foreground">Total de Alunos</p>
                              <p className="text-2xl font-bold">{students.length}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                            <BarChart3 className="h-8 w-8 text-green-600" />
                            <div>
                              <p className="text-sm text-muted-foreground">TRI Médio da Turma</p>
                              <p className="text-2xl font-bold">
                                {triScoresCount > 0 
                                  ? Math.round(Array.from(triScores.values()).reduce((a, b) => a + b, 0) / triScoresCount)
                                  : 0
                                }
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                            <Target className="h-8 w-8 text-purple-600" />
                            <div>
                              <p className="text-sm text-muted-foreground">Avaliações TRI</p>
                              <p className="text-2xl font-bold">{triScoresCount}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <Button 
                            className="flex-1" 
                            variant="default"
                            onClick={handleGenerateAIAnalysis}
                            disabled={aiAnalysisLoading}
                          >
                            {aiAnalysisLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Gerando análise...
                              </>
                            ) : (
                              <>
                                <Target className="h-4 w-4 mr-2" />
                                Gerar Análise Detalhada com IA
                              </>
                            )}
                          </Button>
                          <Button variant="outline">
                            <Download className="h-4 w-4 mr-2" />
                            Exportar PDF
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 italic">
                          💡 A IA não gosta de TRI e leva um tempo pra acordar
                        </p>
                      </CardContent>
                    </Card>

                    {/* Análise da IA */}
                    {aiAnalysis && (
                      <Card className="border-blue-200 dark:border-blue-800">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Target className="h-5 w-5 text-blue-600" />
                            Análise Pedagógica Detalhada
                          </CardTitle>
                          <CardDescription>
                            Insights gerados por Inteligência Artificial
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="prose dark:prose-invert max-w-none">
                            <div className="whitespace-pre-wrap text-sm leading-relaxed">
                              {aiAnalysis}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Seção de Prioridades */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">🚨 Prioridades de Intervenção</CardTitle>
                        <CardDescription>
                          Áreas que necessitam atenção imediata baseadas no desempenho TRI
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="p-4 border-l-4 border-red-500 bg-red-50 dark:bg-red-950/20 rounded-r-lg">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="destructive">CRÍTICO</Badge>
                                <h4 className="font-semibold">Análise em desenvolvimento</h4>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">
                              O sistema está sendo desenvolvido para identificar automaticamente as áreas prioritárias
                              com base no desempenho TRI dos alunos e no banco de conteúdos ENEM.
                            </p>
                            <div className="flex items-center gap-2 text-sm">
                              <Info className="h-4 w-4" />
                              <span>Use o botão "Gerar Análise Detalhada com IA" para obter insights personalizados</span>
                            </div>
                          </div>

                          <div className="p-4 border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 rounded-r-lg">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-400">
                                  EM BREVE
                                </Badge>
                                <h4 className="font-semibold">Análise por Habilidade</h4>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Sistema identificará automaticamente quais habilidades (H1-H30) necessitam reforço,
                              com sugestões de conteúdos específicos do banco ENEM.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Desempenho por Área */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">📊 Desempenho por Área do Conhecimento</CardTitle>
                        <CardDescription>
                          Comparativo de TRI médio por área
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {(() => {
                            const areas = ['LC', 'CH', 'CN', 'MT'];
                            const areaNames = {
                              'LC': 'Linguagens e Códigos',
                              'CH': 'Ciências Humanas',
                              'CN': 'Ciências da Natureza',
                              'MT': 'Matemática'
                            };
                            const triMedio = triScoresCount > 0 
                              ? Array.from(triScores.values()).reduce((a, b) => a + b, 0) / triScoresCount
                              : 0;

                            return areas.map(area => {
                              const studentsForArea = Array.from(triScoresByArea.values())
                                .map(areaScores => areaScores[area])
                                .filter((score): score is number => score !== undefined && score > 0);
                              
                              if (studentsForArea.length === 0) return null;

                              const areaAvg = studentsForArea.reduce((a, b) => a + b, 0) / studentsForArea.length;
                              const diff = areaAvg - triMedio;
                              const status = diff < -20 ? 'critical' : diff < 0 ? 'warning' : 'good';

                              return (
                                <div key={area} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-semibold">{areaNames[area as keyof typeof areaNames]}</h4>
                                      {status === 'critical' && <Badge variant="destructive">⚠️ Atenção</Badge>}
                                      {status === 'warning' && <Badge variant="outline">Abaixo da média</Badge>}
                                      {status === 'good' && <Badge variant="default" className="bg-green-600">✓ Bom</Badge>}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {studentsForArea.length} aluno(s) avaliado(s)
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-2xl font-bold">{Math.round(areaAvg)}</p>
                                    <p className={`text-sm ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {diff >= 0 ? '+' : ''}{Math.round(diff)} da média
                                    </p>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Grupos de Intervenção */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">👥 Grupos de Intervenção Sugeridos</CardTitle>
                        <CardDescription>
                          Estratificação dos alunos por nível de desempenho TRI
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {(() => {
                            const triValues = Array.from(triScores.values());
                            const grupoReforco = triValues.filter(t => t < 400).length;
                            const grupoDirecionado = triValues.filter(t => t >= 400 && t < 550).length;
                            const grupoAprofundamento = triValues.filter(t => t >= 550).length;

                            return (
                              <>
                                <div className="flex items-center gap-4 p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border-l-4 border-red-500">
                                  <div className="flex-shrink-0">
                                    <div className="w-12 h-12 bg-red-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                                      {grupoReforco}
                                    </div>
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-semibold mb-1">🔴 Reforço Intensivo</h4>
                                    <p className="text-sm text-muted-foreground">
                                      TRI &lt; 400 • Necessita acompanhamento especial
                                    </p>
                                  </div>
                                  <UserCheck className="h-5 w-5 text-red-600" />
                                </div>

                                <div className="flex items-center gap-4 p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border-l-4 border-yellow-500">
                                  <div className="flex-shrink-0">
                                    <div className="w-12 h-12 bg-yellow-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                                      {grupoDirecionado}
                                    </div>
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-semibold mb-1">🟡 Reforço Direcionado</h4>
                                    <p className="text-sm text-muted-foreground">
                                      TRI 400-550 • Maior potencial de crescimento
                                    </p>
                                  </div>
                                  <UserCheck className="h-5 w-5 text-yellow-600" />
                                </div>

                                <div className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border-l-4 border-green-500">
                                  <div className="flex-shrink-0">
                                    <div className="w-12 h-12 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                                      {grupoAprofundamento}
                                    </div>
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-semibold mb-1">🟢 Aprofundamento</h4>
                                    <p className="text-sm text-muted-foreground">
                                      TRI &gt; 550 • Desafios avançados
                                    </p>
                                  </div>
                                  <UserCheck className="h-5 w-5 text-green-600" />
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
