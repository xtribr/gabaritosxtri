import type { StudentData } from "@shared/schema";

/**
 * Interface para resultado do cálculo TCT
 */
export interface TCTCalculationResult {
  studentId: string;
  areaScores: Record<string, number>; // Notas por área (LC, CH, CN, MT)
  averageScore: number; // Nota média (0.0 a 10.0)
}

/**
 * Interface para definição de área
 */
export interface AreaDefinition {
  area: string;
  start: number; // Questão inicial (1-indexed)
  end: number; // Questão final (1-indexed)
}

/**
 * Calculadora TCT (Teoria Clássica dos Testes)
 * Responsável por calcular notas TCT baseadas em acertos simples
 */
export class TCTCalculator {
  /**
   * Calcula notas TCT para uma lista de alunos
   * @param students Lista de alunos
   * @param answerKey Gabarito oficial
   * @param areas Definições de áreas (opcional, para ENEM)
   * @param pointsPerCorrect Pontos por acerto (padrão: 0.222 para 45 questões = 10.0)
   * @returns Array com resultados do cálculo TCT
   */
  static calculate(
    students: StudentData[],
    answerKey: string[],
    areas?: AreaDefinition[],
    pointsPerCorrect: number = 0.222
  ): TCTCalculationResult[] {
    if (!students || students.length === 0) {
      throw new Error("Lista de alunos vazia");
    }

    if (!answerKey || answerKey.length === 0) {
      throw new Error("Gabarito não fornecido");
    }

    // Se há áreas definidas (ENEM), calcular por área
    if (areas && areas.length > 0) {
      return students.map(student => {
        const areaScores: Record<string, number> = {};
        const areaScoresArray: number[] = [];

        areas.forEach(({ area, start, end }) => {
          const answersForArea = student.answers.slice(start - 1, end);
          const answerKeyForArea = answerKey.slice(start - 1, end);

          let correctCount = 0;
          answersForArea.forEach((answer: string | undefined, idx: number) => {
            if (answer && answerKeyForArea[idx] && answer.toUpperCase() === answerKeyForArea[idx].toUpperCase()) {
              correctCount++;
            }
          });

          // Cada acerto vale pointsPerCorrect pontos (padrão: 0.222 para 45 questões = 10.0)
          const areaScore = correctCount * pointsPerCorrect;
          areaScores[area] = parseFloat(areaScore.toFixed(1));
          areaScoresArray.push(areaScore);
        });

        // Nota final TCT: MÉDIA das áreas (0,0 a 10,0)
        const averageScore = areaScoresArray.length > 0
          ? areaScoresArray.reduce((sum, score) => sum + score, 0) / areaScoresArray.length
          : 0;

        return {
          studentId: student.id,
          areaScores,
          averageScore: parseFloat(averageScore.toFixed(1)),
        };
      });
    }

    // Caso contrário, calcular proporcionalmente para todo o gabarito
    return students.map(student => {
      let correctCount = 0;
      student.answers.forEach((answer: string | undefined, idx: number) => {
        if (answer && answerKey[idx] && answer.toUpperCase() === answerKey[idx].toUpperCase()) {
          correctCount++;
        }
      });

      // Calcular nota proporcional (0.0 a 10.0)
      const totalQuestions = answerKey.length;
      const score = totalQuestions > 0 ? (correctCount / totalQuestions) * 10.0 : 0;

      return {
        studentId: student.id,
        areaScores: {},
        averageScore: parseFloat(score.toFixed(1)),
      };
    });
  }
}

