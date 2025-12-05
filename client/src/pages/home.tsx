import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Download, Trash2, RefreshCw, CheckCircle, AlertCircle, Loader2, X, FileSpreadsheet, ClipboardList, Calculator, BarChart3, Plus, Minus, Info, HelpCircle, Users, FileUp, Eye, Moon, Sun } from "lucide-react";
import * as XLSX from "xlsx";
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
  const [mainActiveTab, setMainActiveTab] = useState<string>("alunos"); // Aba principal: alunos, gabarito, tri, tct, conteudos
  
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
    
    return students.map(student => {
      let correctAnswers = 0;
      let wrongAnswers = 0;
      
      student.answers.forEach((answer, index) => {
        if (index < answerKey.length && answer != null && answerKey[index] != null) {
          const normalizedAnswer = String(answer).toUpperCase().trim();
          const normalizedKey = String(answerKey[index]).toUpperCase().trim();
          
          if (normalizedAnswer === normalizedKey) {
            correctAnswers++;
          } else if (normalizedAnswer !== "") {
            wrongAnswers++;
          }
        }
      });
      
      const score = answerKey.length > 0 
        ? Math.round((correctAnswers / answerKey.length) * 1000) / 10 
        : 0;
      
      // Calcular acertos por área (LC, CH, CN, MT)
      const areaCorrectAnswers: Record<string, number> = {};
      const areas = getAreasByTemplate(selectedTemplate.name, numQuestions);
      
      areas.forEach(({ area, start, end }) => {
        let areaCorrect = 0;
        for (let i = start - 1; i < end && i < student.answers.length; i++) {
          if (i < answerKey.length && student.answers[i] != null && answerKey[i] != null) {
            const normalizedAnswer = String(student.answers[i]).toUpperCase().trim();
            const normalizedKey = String(answerKey[i]).toUpperCase().trim();
            if (normalizedAnswer === normalizedKey) {
              areaCorrect++;
            }
          }
        }
        areaCorrectAnswers[area] = areaCorrect;
      });
      
      return {
        ...student,
        score,
        correctAnswers,
        wrongAnswers,
        areaCorrectAnswers, // Adicionar acertos por área
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
        console.log("[studentStats] triAreaScores:", triAreaScores);
        console.log("[studentStats] areaScores:", areaScores);
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
        triLc: triAreaScores.LC !== undefined ? parseFloat(triAreaScores.LC.toFixed(1)) : null, // TRI
        triCh: triAreaScores.CH !== undefined ? parseFloat(triAreaScores.CH.toFixed(1)) : null, // TRI
        triCn: triAreaScores.CN !== undefined ? parseFloat(triAreaScores.CN.toFixed(1)) : null, // TRI
        triMt: triAreaScores.MT !== undefined ? parseFloat(triAreaScores.MT.toFixed(1)) : null, // TRI
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

  const loadPdfPreview = async (pdfFile: File) => {
    console.log("[FRONTEND] Iniciando carregamento do PDF:", pdfFile.name, `(${(pdfFile.size / 1024 / 1024).toFixed(2)}MB)`);
    
    console.log("[FRONTEND] Importando PDF.js...");
    const pdfjsLib = await import("pdfjs-dist");
    console.log("[FRONTEND] PDF.js versão:", pdfjsLib.version);
    
    console.log("[FRONTEND] Importando worker...");
    const pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    console.log("[FRONTEND] Worker URL:", pdfjsWorker.default);
    
    // Configure worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

    console.log("[FRONTEND] Lendo arquivo...");
    const arrayBuffer = await pdfFile.arrayBuffer();
    console.log("[FRONTEND] ArrayBuffer criado, tamanho:", arrayBuffer.byteLength);
    
    console.log("[FRONTEND] Criando documento PDF...");
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    console.log("[FRONTEND] PDF carregado com", numPages, "páginas");

    const previews: PagePreview[] = [];
    for (let i = 1; i <= Math.min(numPages, 8); i++) {
      const page = await pdf.getPage(i);
      const scale = 0.3;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (context) {
        await page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        } as any).promise;
        previews.push({
          pageNumber: i,
          imageUrl: canvas.toDataURL("image/jpeg", 0.7),
        });
      }
    }
    return { numPages, previews };
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
        setPageCount(numPages);
        setPagePreviews(previews);
        setStatus("idle");
        setProgress(100);
      } catch (error) {
        console.error("Error loading PDF:", error);
        setStatus("error");
        setErrorMessage("Erro ao carregar o PDF. Por favor, tente novamente.");
        toast({
          title: "Erro ao carregar PDF",
          description: "Não foi possível processar o arquivo.",
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
          triScores: triScores.size > 0 ? Object.fromEntries(triScores) : undefined,
          triScoresByArea: triScoresByArea.size > 0 ? Object.fromEntries(triScoresByArea) : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Erro na exportação");
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
      toast({
        title: "Erro na exportação",
        description: "Não foi possível gerar o arquivo Excel.",
        variant: "destructive",
      });
    }
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

  const handleBatchProcess = async () => {
    if (fileQueue.length === 0) return;

    setStatus("processing");
    setStudents([]);
    setErrorMessage("");
    
    let allStudents: StudentData[] = [];
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
        allStudents = [...allStudents, ...fileStudents];
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
    const triScoresByAreaMap = new Map<string, Record<string, number>>(); // Map<studentId, {LC: number, CH: number, CN: number, MT: number}>

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
              areaData[area] = result.triScore;
              triScoresByAreaMap.set(result.studentId, areaData);
              
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
    
    // Atualizar o estado do triScores
    // Criar um novo Map para forçar o React a detectar a mudança
    const newTriScoresMap = new Map(finalTriScores);
    setTriScores(newTriScoresMap);
    setTriScoresByArea(new Map(triScoresByAreaMap)); // Armazenar notas TRI por área
    setTriScoresCount(newTriScoresMap.size); // Atualizar contador para forçar re-render
    
    console.log("[TRI] Scores calculados:", newTriScoresMap.size, "alunos");
    console.log("[TRI] Detalhes dos scores:", Array.from(newTriScoresMap.entries()));
    console.log("[TRI] triScoresByAreaMap size:", triScoresByAreaMap.size);
    console.log("[TRI] triScoresByAreaMap detalhes:", Array.from(triScoresByAreaMap.entries()));
    
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
          // NÃO sobrescrever score (TCT) - apenas adicionar triScore
          return {
            ...student,
            triScore: triScore, // Armazenar TRI score (0-1000)
            // Manter score (TCT) existente, areaScores, areaCorrectAnswers
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
        const areaScoresMap: Record<string, number> = {};
        const areaCorrectAnswersMap: Record<string, number> = {};
        const areaScores: number[] = [];
        
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
        
        // Nota final TCT: MÉDIA das áreas (0,0 a 10,0)
        // Cada área tem nota individual de 0,0 a 10,0
        // A nota final é a média das áreas
        const averageTCT = areaScores.length > 0 
          ? areaScores.reduce((sum, score) => sum + score, 0) / areaScores.length 
          : 0;
        
        // Armazenar como porcentagem para compatibilidade (0-100), será convertido na exibição
        const tctPercentage = averageTCT * 10; // Multiplicar por 10 para converter 0-10 em 0-100
        
        return {
          ...student,
          score: tctPercentage,
          areaScores: areaScoresMap, // Armazenar notas por área
          areaCorrectAnswers: areaCorrectAnswersMap, // Armazenar acertos por área
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
          ...student,
          score: tctPercentage,
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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-semibold" data-testid="text-app-title">
              GabaritAI
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {mounted && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="h-9 w-9"
                    data-testid="button-theme-toggle"
                  >
                    {theme === "dark" ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {theme === "dark" ? "Modo claro" : "Modo escuro"}
                </TooltipContent>
              </Tooltip>
            )}
            {students.length > 0 && (
              <Badge variant="secondary" className="text-sm" data-testid="badge-student-count">
                {students.length} aluno{students.length !== 1 ? "s" : ""}
              </Badge>
            )}
            {answerKey.length > 0 && (
              <Badge variant="outline" className="text-sm" data-testid="badge-answer-key">
                Gabarito: {answerKey.length} questões
              </Badge>
            )}
            {status === "completed" && students.length > 0 && (
              <>
                <Dialog open={answerKeyDialogOpen} onOpenChange={setAnswerKeyDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" data-testid="button-answer-key">
                      <ClipboardList className="h-4 w-4 mr-2" />
                      {answerKey.length > 0 ? "Editar Gabarito" : "Inserir Gabarito"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Configuração da Prova</DialogTitle>
                      <DialogDescription>
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
                <Button onClick={handleExportExcel} data-testid="button-export-excel">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar para Excel
                </Button>
              </>
            )}
            {(file || isBatchMode || students.length > 0) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" data-testid="button-clear-trigger">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Limpar
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
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {!file && !isBatchMode && status === "idle" && (
          <div className="space-y-6">
            <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "process" | "generate")} className="w-full">
              <TabsList className="grid w-full max-w-lg mx-auto grid-cols-2">
                <TabsTrigger value="process" data-testid="tab-process">
                  <Upload className="h-4 w-4 mr-2" />
                  Processar Gabaritos
                </TabsTrigger>
                <TabsTrigger value="generate" data-testid="tab-generate">
                  <Users className="h-4 w-4 mr-2" />
                  Gerar Gabaritos
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="process" className="mt-6">
                <Card className="border-dashed border-2">
                  <CardContent className="p-0">
                    <div
                      {...getRootProps()}
                      className={`min-h-64 flex flex-col items-center justify-center p-12 cursor-pointer transition-colors ${
                        isDragActive ? "bg-primary/5" : "hover:bg-muted/50"
                      }`}
                      data-testid="dropzone-upload"
                    >
                      <input {...getInputProps()} data-testid="input-file-upload" />
                      <div className={`p-4 rounded-full mb-4 ${isDragActive ? "bg-primary/20" : "bg-muted"}`}>
                        <Upload className={`h-10 w-10 ${isDragActive ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <p className="text-lg font-medium text-foreground mb-2">
                        {isDragActive ? "Solte os arquivos aqui" : "Arraste PDFs de gabarito aqui"}
                      </p>
                      <p className="text-sm text-muted-foreground mb-4">
                        ou clique para selecionar arquivos
                      </p>
                      <div className="flex gap-2 flex-wrap justify-center">
                        <Badge variant="outline" className="text-xs">
                          Aceita múltiplos PDFs
                        </Badge>
                        <Badge variant="outline" className="text-xs">
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
                    <CardTitle className="flex items-center justify-center gap-2">
                      <FileSpreadsheet className="h-5 w-5 text-primary" />
                      Gerar Gabaritos Personalizados
                    </CardTitle>
                    <CardDescription>
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

        {status === "processing" && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium mb-2" data-testid="text-processing-status">
                    Processando página {currentPage} de {pageCount}...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Extraindo dados dos alunos
                  </p>
                </div>
                <div className="w-full max-w-md">
                  <Progress value={progress} className="h-2" data-testid="progress-processing" />
                  <p className="text-sm text-muted-foreground text-center mt-2">
                    {Math.round(progress)}% concluído
                  </p>
                </div>
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
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium" data-testid="text-success-message">
                  {students.length} aluno{students.length !== 1 ? "s" : ""} processado{students.length !== 1 ? "s" : ""}
                  {answerKey.length > 0 && statistics && (
                    <span className="text-muted-foreground">
                      {" "}| Média: {statistics.averageScore}%
                    </span>
                  )}
                </span>
              </div>
            </div>

            <Tabs value={mainActiveTab} onValueChange={setMainActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="alunos" data-testid="tab-alunos">
                  <Users className="h-4 w-4 mr-2" />
                  Alunos
                </TabsTrigger>
                <TabsTrigger value="scores" data-testid="tab-scores">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Scores
                </TabsTrigger>
                <TabsTrigger value="gabarito" data-testid="tab-gabarito">
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Gabarito
                </TabsTrigger>
                <TabsTrigger 
                  value="tri" 
                  data-testid="tab-tri" 
                  disabled={triScoresCount === 0}
                  className={triScoresCount === 0 ? "opacity-50 cursor-not-allowed" : ""}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Estatísticas TRI {triScoresCount > 0 && `(${triScoresCount})`}
                </TabsTrigger>
                <TabsTrigger value="tct" data-testid="tab-tct" disabled={!statistics}>
                  <Calculator className="h-4 w-4 mr-2" />
                  Estatísticas TCT
                </TabsTrigger>
                <TabsTrigger value="conteudos" data-testid="tab-conteudos" disabled={!statistics}>
                  <FileText className="h-4 w-4 mr-2" />
                  Conteúdos
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
                          <TableHead className="min-w-[120px] font-semibold text-xs uppercase tracking-wide">Matrícula</TableHead>
                          <TableHead className="min-w-[180px] font-semibold text-xs uppercase tracking-wide">Nome</TableHead>
                          <TableHead className="min-w-[100px] font-semibold text-xs uppercase tracking-wide">Turma</TableHead>
                          <TableHead className="min-w-[350px] font-semibold text-xs uppercase tracking-wide">Respostas</TableHead>
                          {answerKey.length > 0 && (
                            <>
                              <TableHead className="w-24 text-center font-semibold text-xs uppercase tracking-wide">Acertos</TableHead>
                              <TableHead className="w-24 text-center font-semibold text-xs uppercase tracking-wide">Nota</TableHead>
                            </>
                          )}
                          <TableHead className="w-24 text-center font-semibold text-xs uppercase tracking-wide">Confiança</TableHead>
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
                            <TableCell className="text-center font-medium text-muted-foreground h-12">
                              {index + 1}
                            </TableCell>
                            <TableCell className="h-12">
                              <Input
                                value={student.studentNumber}
                                onChange={(e) => updateStudentField(index, "studentNumber", e.target.value)}
                                className="h-8 text-sm"
                                data-testid={`input-student-number-${index}`}
                              />
                            </TableCell>
                            <TableCell className="h-12">
                              <Input
                                value={student.studentName}
                                onChange={(e) => updateStudentField(index, "studentName", e.target.value)}
                                className="h-8 text-sm"
                                data-testid={`input-student-name-${index}`}
                              />
                            </TableCell>
                            <TableCell className="h-12">
                              <Input
                                value={student.turma || ""}
                                onChange={(e) => updateStudentField(index, "turma", e.target.value)}
                                className="h-8 text-sm"
                                placeholder="Ex: 3º A"
                                data-testid={`input-student-turma-${index}`}
                              />
                            </TableCell>
                            <TableCell className="h-12">
                              <div className="flex flex-wrap gap-1">
                                {student.answers.map((answer, ansIndex) => {
                                  const answerStr = answer != null ? String(answer) : "";
                                  const keyStr = answerKey.length > 0 && ansIndex < answerKey.length && answerKey[ansIndex] != null 
                                    ? String(answerKey[ansIndex]) : "";
                                  
                                  const isCorrect = keyStr !== "" && 
                                    answerStr.toUpperCase().trim() === keyStr.toUpperCase().trim();
                                  const isWrong = keyStr !== "" && 
                                    answerStr.trim() !== "" && answerStr.toUpperCase().trim() !== keyStr.toUpperCase().trim();
                                  
                                  return (
                                    <Input
                                      key={ansIndex}
                                      value={answerStr || ""}
                                      onChange={(e) => updateStudentAnswer(index, ansIndex, e.target.value)}
                                      className={`h-7 w-8 text-center text-xs font-mono p-0 ${
                                        isCorrect ? "border-green-500 bg-green-50 dark:bg-green-950" : 
                                        isWrong ? "border-red-500 bg-red-50 dark:bg-red-950" : ""
                                      }`}
                                      maxLength={1}
                                      data-testid={`input-answer-${index}-${ansIndex}`}
                                    />
                                  );
                                })}
                              </div>
                            </TableCell>
                            {answerKey.length > 0 && (
                              <>
                                <TableCell className="text-center h-12">
                                  <Badge variant={student.correctAnswers && student.correctAnswers >= answerKey.length * 0.6 ? "default" : "secondary"}>
                                    {student.correctAnswers || 0}/{answerKey.length}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-center h-12">
                                  <span className={`font-semibold ${
                                    (student.score || 0) >= 60 ? "text-green-600" : "text-red-600"
                                  }`}>
                                    {student.score?.toFixed(1) || 0}%
                                  </span>
                                </TableCell>
                              </>
                            )}
                            <TableCell className="text-center h-12">
                              {student.confidence !== undefined ? (
                                <Badge 
                                  variant={student.confidence >= 80 ? "default" : student.confidence >= 60 ? "secondary" : "destructive"}
                                  className="text-xs"
                                  data-testid={`badge-confidence-${index}`}
                                >
                                  {Math.round(student.confidence)}%
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">N/A</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center h-12">
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
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-blue-600" />
                      Notas e Scores dos Alunos
                    </CardTitle>
                    <CardDescription>
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
                                            {student.triLc.toFixed(1)}
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
                                            {student.triCh.toFixed(1)}
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
                                            {student.triCn.toFixed(1)}
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
                                            {student.triMt.toFixed(1)}
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

              {/* ABA 3: GABARITO */}
              <TabsContent value="gabarito" className="mt-4">
                {answerKey.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Gabarito Oficial</CardTitle>
                      <CardDescription>
                        Clique em uma resposta para editá-la. Os conteúdos são exibidos abaixo de cada questão.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="grid grid-cols-5 sm:grid-cols-9 md:grid-cols-15 gap-2">
                          {answerKey.map((answer, index) => (
                            <div key={index} className="flex flex-col items-center gap-1">
                              <span className="text-xs text-muted-foreground">{index + 1}</span>
                              <Input
                                value={answer != null ? String(answer) : ""}
                                onChange={(e) => updateAnswerKeyValue(index, e.target.value)}
                                className="h-8 w-10 text-center font-mono text-sm p-0"
                                maxLength={1}
                                data-testid={`input-key-${index}`}
                              />
                            </div>
                          ))}
                        </div>
                        
                        {questionContents.length > 0 && questionContents.some(c => c.content.trim()) && (
                          <div className="border-t pt-4 mt-4">
                            <CardTitle className="text-sm mb-3">Conteúdos das Questões</CardTitle>
                            <div className="grid gap-2 max-h-96 overflow-y-auto">
                              {questionContents.map((content, index) => {
                                if (!content.content.trim()) return null;
                                return (
                                  <div key={index} className="flex items-center gap-3 p-2 bg-muted/30 rounded-md text-sm">
                                    <span className="font-mono text-muted-foreground w-12">Q{content.questionNumber || index + 1}:</span>
                                    <Badge variant="outline" className="w-8 text-center">{content.answer}</Badge>
                                    <span className="flex-1">{content.content}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ABA 3: ESTATISTICAS TRI */}
              <TabsContent value="tri" className="mt-4">
                {statistics && triScoresCount > 0 && triScores.size > 0 && (
                  <div className="space-y-4" data-testid="statistics-tri-grid">
                    {/* Card de Resumo TRI */}
                    <Card className="border-blue-200 dark:border-blue-800">
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <BarChart3 className="h-5 w-5 text-blue-600" />
                          Notas TRI Calculadas
                        </CardTitle>
                        <CardDescription>
                          Notas calculadas usando Teoria de Resposta ao Item (TRI) com base na coerência das respostas
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Média TRI</p>
                            <p className="text-2xl font-bold text-blue-600">
                              {(() => {
                                const scores = Array.from(triScores.values());
                                const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
                                return avg.toFixed(1);
                              })()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Maior TRI</p>
                            <p className="text-2xl font-bold text-green-600">
                              {(() => {
                                const scores = Array.from(triScores.values());
                                const max = scores.length > 0 ? Math.max(...scores) : 0;
                                return max.toFixed(1);
                              })()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Menor TRI</p>
                            <p className="text-2xl font-bold text-red-600">
                              {(() => {
                                const scores = Array.from(triScores.values());
                                const min = scores.length > 0 ? Math.min(...scores) : 0;
                                return min.toFixed(1);
                              })()}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Alunos com TRI</p>
                            <p className="text-2xl font-bold">
                              {triScoresCount}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

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

                    {/* Gráfico Radar por Área (se ENEM) */}
                    {(() => {
                      const areas = getAreasByTemplate(selectedTemplate.name, numQuestions);
                      if (areas.length > 0) {
                        const areaTriData = areas.map(({ area }) => {
                          const studentsForArea = studentsWithScores
                            .map(student => {
                              const triScore = triScores.get(student.id);
                              return triScore || 0;
                            })
                            .filter(s => s > 0);
                          const avg = studentsForArea.length > 0 
                            ? studentsForArea.reduce((a, b) => a + b, 0) / studentsForArea.length 
                            : 0;
                          return { area, value: avg };
                        });

                        if (areaTriData.some(d => d.value > 0)) {
                          return (
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-base">Radar: TRI por Área</CardTitle>
                                <CardDescription>
                                  Média TRI por área de conhecimento
                                </CardDescription>
                              </CardHeader>
                              <CardContent>
                                <ResponsiveContainer width="100%" height={400}>
                                  <RadarChart data={areaTriData}>
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
                                      formatter={(value: number) => [value.toFixed(1), "TRI"]}
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
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                      <Card data-testid="card-total-students">
                        <CardHeader className="pb-2">
                          <CardDescription>Total de Alunos</CardDescription>
                          <CardTitle className="text-3xl" data-testid="text-total-students">{statistics.totalStudents}</CardTitle>
                        </CardHeader>
                      </Card>
                      <Card data-testid="card-average-score">
                        <CardHeader className="pb-2">
                          <CardDescription>Média Geral</CardDescription>
                          <CardTitle className="text-3xl" data-testid="text-average-score">
                            {(() => {
                              // Converter de porcentagem (0-100) para escala 0,0 a 10,0
                              const tctScore = statistics.averageScore / 10;
                              return tctScore.toFixed(1);
                            })()}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card data-testid="card-highest-score">
                        <CardHeader className="pb-2">
                          <CardDescription>Maior Nota</CardDescription>
                          <CardTitle className="text-3xl text-green-600" data-testid="text-highest-score">
                            {(() => {
                              // Converter de porcentagem (0-100) para escala 0,0 a 10,0
                              const tctScore = statistics.highestScore / 10;
                              return tctScore.toFixed(1);
                            })()}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                      <Card data-testid="card-lowest-score">
                        <CardHeader className="pb-2">
                          <CardDescription>Menor Nota</CardDescription>
                          <CardTitle className="text-3xl text-red-600" data-testid="text-lowest-score">
                            {(() => {
                              // Converter de porcentagem (0-100) para escala 0,0 a 10,0
                              const tctScore = statistics.lowestScore / 10;
                              return tctScore.toFixed(1);
                            })()}
                          </CardTitle>
                        </CardHeader>
                      </Card>
                    </div>

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
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
}
