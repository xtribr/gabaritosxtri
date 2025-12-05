import type { StudentData } from "@shared/schema";
import { TRICalculator, type TRICalculationResult } from "../calculations/triCalculator";
import { QuestionStatsProcessor } from "./questionStatsProcessor";

/**
 * Interface para definição de área
 */
export interface AreaDefinition {
  area: string;
  start: number; // Questão inicial (1-indexed)
  end: number; // Questão final (1-indexed)
}

/**
 * Processador TRI com algoritmo Two-Pass
 * Orquestra o cálculo TRI seguindo o algoritmo de dois passos:
 * 
 * PASSO 1: Calcular estatísticas da prova (porcentagem de acerto de cada questão)
 * PASSO 2: Calcular TRI individual para cada aluno usando as estatísticas
 */
export class TRIProcessor {
  /**
   * Processa cálculo TRI para uma área específica usando Two-Pass Algorithm
   * 
   * @param students Lista de TODOS os alunos
   * @param area Área do conhecimento (CH, CN, MT, LC)
   * @param ano Ano da prova
   * @param answerKey Gabarito oficial
   * @param startQuestion Questão inicial da área (1-indexed)
   * @param endQuestion Questão final da área (1-indexed)
   * @returns Resultados do cálculo TRI
   */
  static async processArea(
    students: StudentData[],
    area: string,
    ano: number,
    answerKey: string[],
    startQuestion: number,
    endQuestion: number
  ): Promise<{ results: TRICalculationResult[]; usarCoerencia: boolean }> {
    console.log(`[TRIProcessor] === Iniciando processamento TRI para área ${area} ===`);
    console.log(`[TRIProcessor] Questões: ${startQuestion} a ${endQuestion}`);
    console.log(`[TRIProcessor] Total de alunos: ${students.length}`);

    // PASSO 1: Calcular estatísticas da prova
    console.log(`[TRIProcessor] PASSO 1: Calculando estatísticas da prova...`);
    const questionStats = QuestionStatsProcessor.calculateQuestionStatsForRange(
      students,
      answerKey,
      startQuestion,
      endQuestion
    );

    // Extrair apenas as respostas e gabarito para a área específica
    const answerKeyForArea = answerKey.slice(startQuestion - 1, endQuestion);
    const studentsForArea = students.map(student => ({
      ...student,
      answers: student.answers.slice(startQuestion - 1, endQuestion),
    }));

    // PASSO 2: Calcular TRI individual para cada aluno
    console.log(`[TRIProcessor] PASSO 2: Calculando TRI individual para cada aluno...`);
    const { results, usarCoerencia } = await TRICalculator.calculate(
      studentsForArea,
      area,
      ano,
      questionStats,
      answerKeyForArea
    );

    // Ajustar studentId para corresponder aos IDs originais
    const adjustedResults = results.map((result, index) => ({
      ...result,
      studentId: students[index].id,
    }));

    console.log(`[TRIProcessor] === Processamento concluído para área ${area} ===`);
    console.log(`[TRIProcessor] Resultados válidos: ${adjustedResults.filter(r => r.triScore !== null).length}/${adjustedResults.length}`);

    return { results: adjustedResults, usarCoerencia };
  }

  /**
   * Processa cálculo TRI para múltiplas áreas (ex: ENEM com LC, CH, CN, MT)
   * 
   * @param students Lista de TODOS os alunos
   * @param areas Array com definições de áreas
   * @param ano Ano da prova
   * @param answerKey Gabarito oficial completo
   * @returns Map com resultados por área: Map<area, {results, usarCoerencia}>
   */
  static async processMultipleAreas(
    students: StudentData[],
    areas: AreaDefinition[],
    ano: number,
    answerKey: string[]
  ): Promise<Map<string, { results: TRICalculationResult[]; usarCoerencia: boolean }>> {
    console.log(`[TRIProcessor] === Processando ${areas.length} área(s) ===`);

    const resultsByArea = new Map<string, { results: TRICalculationResult[]; usarCoerencia: boolean }>();

    for (const { area, start, end } of areas) {
      const areaResults = await this.processArea(students, area, ano, answerKey, start, end);
      resultsByArea.set(area, areaResults);
    }

    console.log(`[TRIProcessor] === Processamento de todas as áreas concluído ===`);
    return resultsByArea;
  }
}

