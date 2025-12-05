import ExcelJS from "exceljs";
import type { StudentData, ExamStatistics } from "@shared/schema";

/**
 * Interface para opções de exportação Excel
 */
export interface ExcelExportOptions {
  students: StudentData[];
  answerKey?: string[];
  questionContents?: Array<{ questionNumber: number; answer: string; content: string }>;
  statistics?: ExamStatistics;
  includeTRI?: boolean;
  triScores?: Map<string, number>;
  triScoresByArea?: Map<string, Record<string, number>>;
}

/**
 * Exportador de Excel com formatação rica
 * Equivalente ao XlsxWriter + Pandas em Python
 * Permite formatação condicional, cores, estilos, etc.
 */
export class ExcelExporter {
  /**
   * Gera arquivo Excel com formatação rica
   * @param options Opções de exportação
   * @returns Buffer do arquivo Excel
   */
  static async generateExcel(options: ExcelExportOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GabaritAI";
    workbook.created = new Date();
    workbook.modified = new Date();

    const { students, answerKey, questionContents, statistics, includeTRI, triScores, triScoresByArea } = options;

    // Validar alunos
    const validatedStudents = students.filter(
      s => s.id && s.studentNumber && s.studentName && Array.isArray(s.answers)
    );

    if (validatedStudents.length === 0) {
      throw new Error("Nenhum dado de aluno válido fornecido");
    }

    const maxAnswers = Math.max(...validatedStudents.map(s => s.answers?.length || 0));
    const hasGrading = !!(answerKey && answerKey.length > 0);

    // ===== ABA 1: ALUNOS =====
    const shouldIncludeTRI = !!(includeTRI && triScores);
    await this.createStudentsSheet(workbook, validatedStudents, answerKey || [], maxAnswers, hasGrading, shouldIncludeTRI, triScores, triScoresByArea);

    // ===== ABA 2: GABARITO =====
    if (hasGrading && answerKey) {
      await this.createAnswerKeySheet(workbook, answerKey, questionContents);
    }

    // ===== ABA 3: ESTATÍSTICAS =====
    if (statistics) {
      await this.createStatisticsSheet(workbook, statistics);
    }

    // ===== ABA 4: ANÁLISE POR QUESTÃO =====
    if (statistics?.questionStats && statistics.questionStats.length > 0) {
      await this.createQuestionAnalysisSheet(workbook, statistics.questionStats);
    }

    // Gerar buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Cria aba de alunos com formatação condicional
   */
  private static async createStudentsSheet(
    workbook: ExcelJS.Workbook,
    students: StudentData[],
    answerKey: string[],
    maxAnswers: number,
    hasGrading: boolean,
    includeTRI: boolean,
    triScores?: Map<string, number>,
    triScoresByArea?: Map<string, Record<string, number>>
  ): Promise<void> {
    const sheet = workbook.addWorksheet("Alunos");

    // Definir cabeçalhos
    const headers = ["#", "Matrícula", "Nome", "Turma"];
    if (hasGrading) {
      headers.push("Acertos", "Erros", "Nota TCT");
      if (includeTRI && triScores) {
        headers.push("Nota TRI");
      }
      // Adicionar colunas TRI por área se disponível
      if (includeTRI && triScoresByArea) {
        headers.push("LC TRI", "CH TRI", "CN TRI", "MT TRI");
      }
    }
    headers.push("Confiança (%)", "Página");
    
    // Adicionar colunas de questões
    for (let i = 1; i <= maxAnswers; i++) {
      headers.push(`Q${i}`);
    }

    // Adicionar cabeçalhos
    sheet.addRow(headers);

    // Formatar cabeçalho
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" }, // Azul
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    // Adicionar dados dos alunos
    students.forEach((student, index) => {
      const row: (string | number)[] = [
        index + 1,
        student.studentNumber || "",
        student.studentName || "",
        this.extractTurmaFromStudent(student) || "",
      ];

      if (hasGrading) {
        row.push(
          student.correctAnswers || 0,
          student.wrongAnswers || 0,
          student.score ? parseFloat((student.score / 10).toFixed(1)) : 0
        );
        
        if (includeTRI && triScores) {
          const triScore = triScores.get(student.id);
          row.push(triScore !== undefined ? parseFloat(triScore.toFixed(1)) : 0);
        }
        
        // Adicionar TRI por área
        if (includeTRI && triScoresByArea) {
          const areaScores = triScoresByArea.get(student.id) || {};
          row.push(
            areaScores.LC !== undefined ? parseFloat(areaScores.LC.toFixed(1)) : 0,
            areaScores.CH !== undefined ? parseFloat(areaScores.CH.toFixed(1)) : 0,
            areaScores.CN !== undefined ? parseFloat(areaScores.CN.toFixed(1)) : 0,
            areaScores.MT !== undefined ? parseFloat(areaScores.MT.toFixed(1)) : 0
          );
        }
      }

      row.push(
        student.confidence !== undefined ? Math.round(student.confidence) : "N/A",
        student.pageNumber || 1
      );

      // Adicionar respostas
      for (let i = 0; i < maxAnswers; i++) {
        const answer = student.answers?.[i] || "";
        row.push(answer);
      }

      const excelRow = sheet.addRow(row);

      // Formatação condicional para questões
      if (hasGrading && answerKey) {
        const answerStartCol = headers.length - maxAnswers;
        for (let i = 0; i < maxAnswers; i++) {
          const colIndex = answerStartCol + i + 1; // +1 porque Excel é 1-indexed
          const cell = excelRow.getCell(colIndex);
          const studentAnswer = student.answers?.[i]?.toUpperCase() || "";
          const correctAnswer = answerKey[i]?.toUpperCase() || "";

          if (studentAnswer && correctAnswer) {
            if (studentAnswer === correctAnswer) {
              // VERDE: Resposta correta
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFC6EFCE" }, // Verde pastel
              };
              cell.font = { color: { argb: "FF006100" }, bold: true };
            } else {
              // VERMELHO: Resposta errada
              cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFFFC7CE" }, // Vermelho pastel
              };
              cell.font = { color: { argb: "FF9C0006" }, bold: true };
            }
          }
        }

        // Formatação condicional para nota TCT
        if (hasGrading) {
          const notaCol = 7; // Coluna "Nota TCT"
          const notaCell = excelRow.getCell(notaCol);
          const nota = student.score ? student.score / 10 : 0;
          
          if (nota >= 6.0) {
            // Verde: Aprovado
            notaCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFC6EFCE" },
            };
            notaCell.font = { color: { argb: "FF006100" }, bold: true };
          } else {
            // Vermelho: Reprovado
            notaCell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFFC7CE" },
            };
            notaCell.font = { color: { argb: "FF9C0006" }, bold: true };
          }
        }
      }
    });

    // Ajustar larguras das colunas
    sheet.getColumn(1).width = 5; // #
    sheet.getColumn(2).width = 18; // Matrícula
    sheet.getColumn(3).width = 30; // Nome
    sheet.getColumn(4).width = 12; // Turma
    
    if (hasGrading) {
      sheet.getColumn(5).width = 10; // Acertos
      sheet.getColumn(6).width = 10; // Erros
      sheet.getColumn(7).width = 12; // Nota TCT
      if (includeTRI) {
        let colOffset = 8;
        if (triScores) {
          sheet.getColumn(colOffset).width = 12; // Nota TRI
          colOffset++;
        }
        if (triScoresByArea) {
          sheet.getColumn(colOffset).width = 10; // LC TRI
          sheet.getColumn(colOffset + 1).width = 10; // CH TRI
          sheet.getColumn(colOffset + 2).width = 10; // CN TRI
          sheet.getColumn(colOffset + 3).width = 10; // MT TRI
        }
      }
    }

    // Congelar primeira linha e primeiras colunas
    sheet.views = [
      {
        state: "frozen",
        ySplit: 1,
        xSplit: hasGrading ? 4 : 3,
      },
    ];
  }

  /**
   * Cria aba de gabarito
   */
  private static async createAnswerKeySheet(
    workbook: ExcelJS.Workbook,
    answerKey: string[],
    questionContents?: Array<{ questionNumber: number; answer: string; content: string }>
  ): Promise<void> {
    const sheet = workbook.addWorksheet("Gabarito");

    // Cabeçalhos
    const headers = ["Questão", "Resposta Correta", "Conteúdo"];
    sheet.addRow(headers);

    // Formatar cabeçalho
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Dados
    if (questionContents && questionContents.length > 0) {
      questionContents.forEach(qc => {
        sheet.addRow([qc.questionNumber || 0, qc.answer, qc.content || ""]);
      });
    } else {
      answerKey.forEach((answer, index) => {
        sheet.addRow([index + 1, answer, ""]);
      });
    }

    // Ajustar larguras
    sheet.getColumn(1).width = 10;
    sheet.getColumn(2).width = 18;
    sheet.getColumn(3).width = 40;
  }

  /**
   * Cria aba de estatísticas
   */
  private static async createStatisticsSheet(
    workbook: ExcelJS.Workbook,
    statistics: ExamStatistics
  ): Promise<void> {
    const sheet = workbook.addWorksheet("Estatísticas");

    // Cabeçalhos
    sheet.addRow(["Estatística", "Valor"]);

    // Formatar cabeçalho
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };

    // Dados
    sheet.addRow(["Total de Alunos", statistics.totalStudents]);
    sheet.addRow(["Média Geral", statistics.averageScore.toFixed(1)]);
    sheet.addRow(["Maior Nota", statistics.highestScore.toFixed(1)]);
    sheet.addRow(["Menor Nota", statistics.lowestScore.toFixed(1)]);

    // Ajustar larguras
    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 15;
  }

  /**
   * Cria aba de análise por questão com formatação condicional
   */
  private static async createQuestionAnalysisSheet(
    workbook: ExcelJS.Workbook,
    questionStats: Array<{
      questionNumber: number;
      correctCount: number;
      wrongCount: number;
      correctPercentage: number;
      content?: string;
    }>
  ): Promise<void> {
    const sheet = workbook.addWorksheet("Análise por Questão");

    // Cabeçalhos
    const headers = ["Questão", "Acertos", "Erros", "% Acertos", "Conteúdo"];
    sheet.addRow(headers);

    // Formatar cabeçalho
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Dados com formatação condicional
    questionStats.forEach(stat => {
      const row = sheet.addRow([
        stat.questionNumber,
        stat.correctCount,
        stat.wrongCount,
        stat.correctPercentage.toFixed(1),
        stat.content || "",
      ]);

      // Formatação condicional baseada na porcentagem
      const percentageCell = row.getCell(4); // Coluna "% Acertos"
      const percentage = stat.correctPercentage;

      if (percentage >= 0 && percentage < 50) {
        // VERDE PASTEL: 0-49%
        percentageCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFC6EFCE" }, // Verde pastel
        };
        percentageCell.font = { color: { argb: "FF006100" }, bold: true };
      } else if (percentage >= 50 && percentage <= 70) {
        // LARANJA PASTEL: 50-70%
        percentageCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFE699" }, // Laranja pastel
        };
        percentageCell.font = { color: { argb: "FF9C5700" }, bold: true };
      } else if (percentage > 70) {
        // VERDE: 71%+
        percentageCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFC6EFCE" }, // Verde
        };
        percentageCell.font = { color: { argb: "FF006100" }, bold: true };
      }
    });

    // Ajustar larguras
    sheet.getColumn(1).width = 10;
    sheet.getColumn(2).width = 10;
    sheet.getColumn(3).width = 10;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(5).width = 40;
  }

  /**
   * Extrai turma do objeto student (helper)
   */
  private static extractTurmaFromStudent(student: StudentData): string | null {
    // Tentar extrair de studentNumber ou studentName
    const turmaMatch = student.studentNumber?.match(/(\d{2,3})/);
    return turmaMatch ? turmaMatch[1] : null;
  }
}

