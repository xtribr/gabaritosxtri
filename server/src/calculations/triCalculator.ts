import { TRIDataLoader, TRIDataEntry } from "../data/triDataLoader";
import type { StudentData } from "@shared/schema";

/**
 * Interface para resultado do cálculo TRI
 */
export interface TRICalculationResult {
  studentId: string;
  correctAnswers: number;
  triScore: number | null;
  triMin: number | null;
  triMax: number | null;
  indiceCoerencia?: number;
}

/**
 * Interface para estatísticas de questões
 */
export interface QuestionStats {
  questionNumber: number;
  correctPercentage: number;
}

/**
 * Calculadora TRI com fator de coerência
 * Responsável por calcular notas TRI baseadas em dados históricos e coerência das respostas
 */
export class TRICalculator {
  /**
   * Obtém o peso de coerência baseado na porcentagem de acerto da questão
   * @param porcentagem Porcentagem de acerto (0.0 a 1.0)
   * @returns Peso de coerência (1 a 5)
   */
  private static getCategoriaPeso(porcentagem: number): number {
    const p = porcentagem * 100; // converter 0.2 para 20
    if (p >= 80) return 5; // Muito Fácil
    if (p >= 60) return 4; // Fácil
    if (p >= 40) return 3; // Média
    if (p >= 20) return 2; // Difícil
    return 1; // Muito Difícil (0 a 19%)
  }

  /**
   * Calcula o desvio padrão de um array de valores
   * Usa fórmula otimizada para melhor performance
   * @param valores Array de números
   * @returns Desvio padrão
   */
  private static calcularDesvioPadrao(valores: number[]): number {
    if (valores.length === 0) return 0;
    if (valores.length === 1) return 0;
    
    // Calcular média
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    
    // Calcular variância (usando reduce otimizado)
    const variancia = valores.reduce((sum, val) => {
      const diff = val - media;
      return sum + (diff * diff);
    }, 0) / valores.length;
    
    return Math.sqrt(variancia);
  }

  /**
   * Busca dados históricos TRI para uma área, acertos e ano específicos
   * @param triData Dados TRI carregados
   * @param area Área do conhecimento (CH, CN, MT, LC)
   * @param acertos Número de acertos
   * @param ano Ano da prova
   * @returns Entrada TRI encontrada ou null
   */
  private static findTRIEntry(
    triData: TRIDataEntry[],
    area: string,
    acertos: number,
    ano: number
  ): TRIDataEntry | null {
    // Buscar para o ano específico
    let triEntry = triData.find(
      entry => entry.area === area && entry.acertos === acertos && entry.ano === ano
    );

    // Se não encontrou, tentar o ano mais recente disponível
    if (!triEntry) {
      const anosDisponiveis = [...new Set(triData.filter(e => e.area === area).map(e => e.ano))].sort((a, b) => b - a);
      console.log(`[TRICalculator] Não encontrado para ano ${ano}, tentando anos disponíveis:`, anosDisponiveis);

      for (const anoAlternativo of anosDisponiveis) {
        triEntry = triData.find(
          entry => entry.area === area && entry.acertos === acertos && entry.ano === anoAlternativo
        );
        if (triEntry) {
          console.log(`[TRICalculator] Usando dados do ano ${anoAlternativo} para área ${area}, acertos ${acertos}`);
          break;
        }
      }
    }

    return triEntry || null;
  }

  /**
   * Calcula o número de acertos de um aluno baseado nas respostas e gabarito
   * @param student Dados do aluno
   * @param answerKey Gabarito oficial
   * @returns Número de acertos
   */
  private static calculateCorrectAnswers(student: StudentData, answerKey?: string[]): number {
    if (student.correctAnswers !== undefined && student.correctAnswers !== null) {
      return student.correctAnswers;
    }

    if (answerKey && student.answers) {
      return student.answers.reduce((count: number, answer: string | undefined, idx: number) => {
        if (answer && answerKey[idx] && answer.toUpperCase() === answerKey[idx].toUpperCase()) {
          return count + 1;
        }
        return count;
      }, 0);
    }

    return 0;
  }

  /**
   * Calcula notas TRI para uma lista de alunos
   * @param students Lista de alunos
   * @param area Área do conhecimento (CH, CN, MT, LC)
   * @param ano Ano da prova
   * @param questionStats Estatísticas de acerto por questão (opcional)
   * @param answerKey Gabarito oficial (opcional)
   * @returns Array com resultados do cálculo TRI
   */
  static async calculate(
    students: StudentData[],
    area: string,
    ano: number,
    questionStats?: QuestionStats[],
    answerKey?: string[]
  ): Promise<{ results: TRICalculationResult[]; usarCoerencia: boolean }> {
    if (!students || students.length === 0) {
      throw new Error("Lista de alunos vazia");
    }

    if (!area || !ano) {
      throw new Error("Área e ano são obrigatórios");
    }

    const triData = await TRIDataLoader.load();

    // Criar mapa de estatísticas das questões (porcentagem de acerto)
    const statsMap = new Map<number, number>();
    if (questionStats && questionStats.length > 0) {
      questionStats.forEach(stat => {
        statsMap.set(stat.questionNumber, stat.correctPercentage / 100); // Converter para 0.0-1.0
      });
    }

    // Verificar se há variação suficiente nas questões
    const porcentagens = Array.from(statsMap.values());
    const desvioPadrao = this.calcularDesvioPadrao(porcentagens);
    const usarCoerencia = desvioPadrao >= 0.03 && statsMap.size > 0;

    console.log(`[TRICalculator] Processando ${students.length} alunos para área ${area}, ano ${ano}`);
    console.log(`[TRICalculator] Total de entradas no CSV: ${triData.length}`);
    console.log(`[TRICalculator] Usando coerência: ${usarCoerencia}`);

    const results: TRICalculationResult[] = students.map(student => {
      // Calcular acertos
      const correctAnswers = this.calculateCorrectAnswers(student, answerKey);

      // Buscar dados históricos
      const triEntry = this.findTRIEntry(triData, area, correctAnswers, ano);

      if (!triEntry) {
        console.log(`[TRICalculator] Dados não encontrados para: área=${area}, acertos=${correctAnswers}, ano=${ano}, studentId=${student.id}`);
        return {
          studentId: student.id,
          correctAnswers,
          triScore: null,
          triMin: null,
          triMax: null,
        };
      }

      console.log(`[TRICalculator] Dados encontrados para studentId=${student.id}, acertos=${correctAnswers}: min=${triEntry.min}, max=${triEntry.max}, media=${triEntry.media}`);

      // Se não há variação suficiente ou não há estatísticas, usar média
      if (!usarCoerencia || correctAnswers === 0 || correctAnswers === 45) {
        return {
          studentId: student.id,
          correctAnswers,
          triScore: triEntry.media,
          triMin: triEntry.min,
          triMax: triEntry.max,
        };
      }

      // Calcular coerência
      const questoesDetalhadas: Array<{
        id: number;
        pct: number;
        peso: number;
        acertou: boolean;
      }> = [];

      for (let i = 0; i < student.answers.length; i++) {
        const questionNum = i + 1;
        const pct = statsMap.get(questionNum) || 0;
        const peso = this.getCategoriaPeso(pct);
        const studentAnswer = student.answers[i]?.toUpperCase() || "";
        const correctAnswer = (answerKey?.[i] || "").toUpperCase();
        const acertou = studentAnswer !== "" && studentAnswer === correctAnswer;

        questoesDetalhadas.push({
          id: questionNum,
          pct,
          peso,
          acertou,
        });
      }

      // Ordenar da mais fácil (maior pct) para mais difícil
      const questoesOrdenadas = [...questoesDetalhadas].sort((a, b) => b.pct - a.pct);

      // Score ideal: soma dos pesos das N questões mais fáceis
      const scoreIdeal = questoesOrdenadas
        .slice(0, correctAnswers)
        .reduce((sum, q) => sum + q.peso, 0);

      // Score real: soma dos pesos das questões que o aluno realmente acertou
      const scoreReal = questoesDetalhadas
        .filter(q => q.acertou)
        .reduce((sum, q) => sum + q.peso, 0);

      // Calcular índice de coerência (0.0 a 1.0)
      const indiceCoerencia = scoreIdeal > 0 ? scoreReal / scoreIdeal : 0;
      const indiceCoerenciaLimitado = Math.max(0.0, Math.min(1.0, indiceCoerencia));

      // Interpolar entre min e max baseado na coerência
      const rangeNota = triEntry.max - triEntry.min;
      const notaFinal = triEntry.min + (rangeNota * indiceCoerenciaLimitado);

      return {
        studentId: student.id,
        correctAnswers,
        triScore: notaFinal,
        triMin: triEntry.min,
        triMax: triEntry.max,
        indiceCoerencia: indiceCoerenciaLimitado,
      };
    });

    const validResults = results.filter(r => r.triScore !== null && r.triScore !== undefined);
    console.log(`[TRICalculator] Resultados finais: ${validResults.length} válidos de ${results.length} total`);

    return { results, usarCoerencia };
  }
}

