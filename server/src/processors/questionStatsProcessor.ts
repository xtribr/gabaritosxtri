import type { StudentData } from "@shared/schema";
import type { QuestionStats } from "../calculations/triCalculator";

/**
 * Processador de Estatísticas de Questões
 * Responsável pelo PASSO 1 do algoritmo Two-Pass: calcular estatísticas da prova
 */
export class QuestionStatsProcessor {
  /**
   * Calcula a porcentagem de acerto de cada questão baseado em TODOS os alunos
   * Este é o PASSO 1 do algoritmo Two-Pass para TRI
   * 
   * @param students Lista de TODOS os alunos
   * @param answerKey Gabarito oficial
   * @param startQuestion Número da primeira questão (1-indexed, padrão: 1)
   * @param endQuestion Número da última questão (1-indexed, padrão: answerKey.length)
   * @returns Array com estatísticas de cada questão (porcentagem de acerto)
   */
  static calculateQuestionStats(
    students: StudentData[],
    answerKey: string[],
    startQuestion: number = 1,
    endQuestion?: number
  ): QuestionStats[] {
    if (!students || students.length === 0) {
      throw new Error("Lista de alunos vazia - necessário para calcular estatísticas");
    }

    if (!answerKey || answerKey.length === 0) {
      throw new Error("Gabarito não fornecido");
    }

    const end = endQuestion || answerKey.length;
    const questionStats: QuestionStats[] = [];

    console.log(`[QuestionStatsProcessor] Calculando estatísticas para questões ${startQuestion} a ${end}`);
    console.log(`[QuestionStatsProcessor] Total de alunos: ${students.length}`);

    // Para cada questão no intervalo
    for (let qIndex = startQuestion - 1; qIndex < end && qIndex < answerKey.length; qIndex++) {
      let correctCount = 0;
      let totalAttempts = 0;

      // Contar acertos de TODOS os alunos para esta questão
      students.forEach(student => {
        const studentAnswer = student.answers[qIndex]?.toUpperCase() || "";
        const correctAnswer = answerKey[qIndex]?.toUpperCase() || "";

        if (studentAnswer !== "") {
          totalAttempts++;
          if (studentAnswer === correctAnswer) {
            correctCount++;
          }
        }
      });

      // Calcular porcentagem de acerto
      const correctPercentage = totalAttempts > 0
        ? (correctCount / totalAttempts) * 100
        : 0;

      const questionNumber = qIndex + 1;
      questionStats.push({
        questionNumber,
        correctPercentage: Math.round(correctPercentage * 10) / 10, // 1 casa decimal
      });

      // Log para questões com porcentagens extremas (debug)
      if (correctPercentage === 0 || correctPercentage === 100) {
        console.log(`[QuestionStatsProcessor] Q${questionNumber}: ${correctPercentage.toFixed(1)}% (${correctCount}/${totalAttempts})`);
      }
    }

    // Log resumo
    const avgPercentage = questionStats.reduce((sum, q) => sum + q.correctPercentage, 0) / questionStats.length;
    const minPercentage = Math.min(...questionStats.map(q => q.correctPercentage));
    const maxPercentage = Math.max(...questionStats.map(q => q.correctPercentage));

    console.log(`[QuestionStatsProcessor] Estatísticas calculadas:`);
    console.log(`  - Média: ${avgPercentage.toFixed(1)}%`);
    console.log(`  - Mínima: ${minPercentage.toFixed(1)}%`);
    console.log(`  - Máxima: ${maxPercentage.toFixed(1)}%`);

    return questionStats;
  }

  /**
   * Calcula estatísticas para um intervalo específico de questões (útil para áreas ENEM)
   * @param students Lista de alunos
   * @param answerKey Gabarito oficial
   * @param startQuestion Questão inicial (1-indexed)
   * @param endQuestion Questão final (1-indexed)
   * @returns Array com estatísticas ajustadas (questionNumber relativo ao início)
   */
  static calculateQuestionStatsForRange(
    students: StudentData[],
    answerKey: string[],
    startQuestion: number,
    endQuestion: number
  ): QuestionStats[] {
    const allStats = this.calculateQuestionStats(students, answerKey, startQuestion, endQuestion);
    
    // Ajustar questionNumber para ser relativo ao início (começar em 1)
    return allStats.map(stat => ({
      questionNumber: stat.questionNumber - startQuestion + 1,
      correctPercentage: stat.correctPercentage,
    }));
  }
}

