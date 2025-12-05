import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

// Obter __dirname equivalente para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Interface para dados históricos TRI do CSV
 */
export interface TRIDataEntry {
  area: string;
  acertos: number;
  min: number;
  max: number;
  media: number;
  ano: number;
}

/**
 * Carregador de dados TRI do CSV histórico
 * Responsável por ler e cachear os dados do arquivo CSV usando processamento otimizado
 * 
 * NOTA: O CSV é lido de arquivo externo (tri/TRI ENEM DE 2009 A 2023 MIN MED E MAX.csv)
 * NÃO deve estar hardcoded no código para melhor manutenibilidade e performance
 */
export class TRIDataLoader {
  private static cache: TRIDataEntry[] | null = null;
  private static readonly CSV_FILE_NAME = "TRI ENEM DE 2009 A 2023 MIN MED E MAX.csv";

  /**
   * Obtém o caminho completo do arquivo CSV
   * @returns Caminho absoluto do arquivo CSV
   */
  private static getCSVFilePath(): string {
    // __dirname aponta para server/src/data (em dev com tsx)
    // Precisamos subir 3 níveis para chegar à raiz do projeto (gabaritosxtri)
    // .. -> server/src
    // .. -> server  
    // .. -> gabaritosxtri (raiz)
    const rootPath = join(__dirname, "..", "..", "..");
    const csvPath = join(rootPath, "tri", this.CSV_FILE_NAME);
    
    console.log(`[TRIDataLoader] __dirname: ${__dirname}`);
    console.log(`[TRIDataLoader] rootPath: ${rootPath}`);
    console.log(`[TRIDataLoader] csvPath: ${csvPath}`);
    
    return csvPath;
  }

  /**
   * Carrega os dados TRI do CSV usando processamento otimizado com csv-parse
   * @returns Array com todos os registros TRI do CSV
   */
  static async load(): Promise<TRIDataEntry[]> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const triFilePath = this.getCSVFilePath();
      console.log(`[TRIDataLoader] Carregando CSV de: ${triFilePath}`);
      
      // Verificar se o arquivo existe
      if (!existsSync(triFilePath)) {
        throw new Error(`Arquivo CSV não encontrado em: ${triFilePath}`);
      }
      console.log(`[TRIDataLoader] Arquivo encontrado!`);

      // Ler arquivo completo (otimizado para arquivos de tamanho médio)
      // Para arquivos muito grandes (>100MB), considerar usar streams
      let csvContent = readFileSync(triFilePath, "utf-8");
      
      // Remover BOM (Byte Order Mark) se presente
      if (csvContent.charCodeAt(0) === 0xFEFF) {
        csvContent = csvContent.slice(1);
      }

      // Usar csv-parse para processamento otimizado
      // Configuração: delimitador ';', skip_empty_lines, trim
      const records = parse(csvContent, {
        delimiter: ";",
        columns: true, // Usar primeira linha como headers
        skip_empty_lines: true,
        trim: true,
        cast: false, // Desabilitar cast automático, vamos fazer manualmente
      }) as Array<Record<string, string>>;
      
      console.log(`[TRIDataLoader] CSV parseado: ${records.length} registros encontrados`);
      
      // Normalizar nomes de colunas (remover BOM e espaços)
      const normalizedRecords = records.map(record => {
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(record)) {
          // Remover BOM e espaços do nome da coluna
          const cleanKey = key.replace(/^\uFEFF/, '').trim();
          normalized[cleanKey] = value;
        }
        return normalized;
      });

      // Validar estrutura
      if (normalizedRecords.length === 0) {
        throw new Error("CSV TRI vazio ou inválido");
      }

      // Validar colunas obrigatórias
      const firstRecord = normalizedRecords[0];
      const requiredColumns = ["area", "acertos", "min", "max", "media", "ano"];
      const missingColumns = requiredColumns.filter(col => !(col in firstRecord));
      
      if (missingColumns.length > 0) {
        console.error(`[TRIDataLoader] Colunas encontradas:`, Object.keys(firstRecord));
        throw new Error(`Colunas obrigatórias não encontradas no CSV TRI: ${missingColumns.join(", ")}`);
      }

      // Determinar os últimos 5 anos disponíveis no CSV
      const anosDisponiveis = [...new Set(normalizedRecords
        .map(r => parseInt(String(r.ano || "0").trim(), 10))
        .filter(ano => !isNaN(ano))
      )].sort((a, b) => b - a); // Ordenar decrescente
      
      const ultimos5Anos = anosDisponiveis.slice(0, 5);
      console.log(`[TRIDataLoader] Anos disponíveis no CSV:`, anosDisponiveis);
      console.log(`[TRIDataLoader] Usando últimos 5 anos:`, ultimos5Anos);
      
      // Converter para formato tipado e filtrar registros inválidos
      this.cache = normalizedRecords
        .map(record => {
          // Converter valores manualmente (garantir conversão correta)
          const area = String(record.area || "").trim().toUpperCase();
          const acertosStr = String(record.acertos || "0").trim();
          const minStr = String(record.min || "0").trim().replace(",", ".");
          const maxStr = String(record.max || "0").trim().replace(",", ".");
          const mediaStr = String(record.media || "0").trim().replace(",", ".");
          const anoStr = String(record.ano || "0").trim();
          
          const acertos = parseInt(acertosStr, 10);
          const min = parseFloat(minStr);
          const max = parseFloat(maxStr);
          const media = parseFloat(mediaStr);
          const ano = parseInt(anoStr, 10);

          // Validar registro (área deve ser CH, CN, MT ou LC)
          if (!area || !["CH", "CN", "MT", "LC"].includes(area)) {
            return null;
          }
          
          // FILTRO: Usar apenas os últimos 5 anos
          if (!ultimos5Anos.includes(ano)) {
            return null; // Descartar registros de anos fora dos últimos 5
          }
          
          // Validar valores numéricos
          // CRÍTICO: Para acertos=0, min/max/media podem ser vazios ou iguais (ex: MT;0;;;;2023)
          // Nesses casos, usar valores padrão ou o próprio valor se presente
          if (isNaN(acertos) || isNaN(ano)) {
            console.warn(`[TRIDataLoader] Registro com valores inválidos ignorado: area=${area}, acertos=${acertosStr}->${acertos}, ano=${anoStr}->${ano}`);
            return null;
          }
          
          // Se min/max/media são NaN mas acertos=0, usar valores padrão (comum em 2023)
          const finalMin = isNaN(min) && acertos === 0 ? (area === "LC" ? 270.6 : area === "CH" ? 305.1 : area === "CN" ? 300 : area === "MT" ? 300 : 300) : min;
          const finalMax = isNaN(max) && acertos === 0 ? finalMin : max;
          const finalMedia = isNaN(media) && acertos === 0 ? finalMin : media;
          
          // Se ainda assim está NaN, usar valores padrão baseados na área
          if (isNaN(finalMin) || isNaN(finalMax) || isNaN(finalMedia)) {
            console.warn(`[TRIDataLoader] Registro com valores numéricos inválidos: area=${area}, acertos=${acertos}, ano=${ano}, usando valores padrão`);
            // Usar valores padrão baseados na área (valores típicos de acertos=0)
            const defaultValues: Record<string, { min: number; max: number; media: number }> = {
              "LC": { min: 270.6, max: 280.7, media: 275.44 },
              "CH": { min: 305.1, max: 305.1, media: 305.1 },
              "CN": { min: 300, max: 300, media: 300 },
              "MT": { min: 300, max: 300, media: 300 },
            };
            const defaults = defaultValues[area] || { min: 300, max: 300, media: 300 };
            return { area, acertos, min: defaults.min, max: defaults.max, media: defaults.media, ano };
          }

          return { area, acertos, min: finalMin, max: finalMax, media: finalMedia, ano };
        })
        .filter((entry): entry is TRIDataEntry => entry !== null);

      console.log(`[TRIDataLoader] Carregados ${this.cache.length} registros TRI do CSV (últimos 5 anos)`);
      console.log(`[TRIDataLoader] Exemplo de registros:`, this.cache.slice(0, 3));

      // Estatísticas do CSV carregado
      const areas = [...new Set(this.cache.map(e => e.area))];
      const anos = [...new Set(this.cache.map(e => e.ano))].sort((a, b) => a - b);
      console.log(`[TRIDataLoader] Áreas encontradas: ${areas.join(", ")}`);
      console.log(`[TRIDataLoader] Anos disponíveis: ${anos[0]} a ${anos[anos.length - 1]}`);
      
      // Verificar dados de 2023 especificamente
      const dados2023 = this.cache.filter(e => e.ano === 2023);
      console.log(`[TRIDataLoader] Registros de 2023: ${dados2023.length}`);
      if (dados2023.length > 0) {
        const areas2023 = [...new Set(dados2023.map(e => e.area))];
        console.log(`[TRIDataLoader] Áreas disponíveis em 2023: ${areas2023.join(", ")}`);
        const exemploCH = dados2023.find(e => e.area === "CH" && e.acertos === 10);
        if (exemploCH) {
          console.log(`[TRIDataLoader] Exemplo 2023 (CH, acertos=10):`, exemploCH);
        }
      } else {
        console.warn(`[TRIDataLoader] ATENÇÃO: Nenhum registro de 2023 encontrado!`);
      }

      return this.cache;
    } catch (error) {
      console.error("[TRIDataLoader] Erro ao carregar dados TRI:", error);
      
      if (error instanceof Error) {
        if (error.message.includes("ENOENT")) {
          throw new Error(`Arquivo CSV não encontrado: ${this.getCSVFilePath()}`);
        }
        throw error;
      }
      
      throw new Error("Erro desconhecido ao carregar dados TRI");
    }
  }

  /**
   * Limpa o cache (útil para testes ou recarregamento)
   */
  static clearCache(): void {
    this.cache = null;
    console.log("[TRIDataLoader] Cache limpo");
  }

  /**
   * Recarrega os dados do CSV (força nova leitura)
   * @returns Array com todos os registros TRI do CSV
   */
  static async reload(): Promise<TRIDataEntry[]> {
    this.clearCache();
    return this.load();
  }

  /**
   * Obtém estatísticas do CSV carregado
   * @returns Estatísticas sobre os dados carregados
   */
  static getStats(): {
    totalRecords: number;
    areas: string[];
    anos: number[];
    recordsByArea: Record<string, number>;
  } {
    if (!this.cache) {
      throw new Error("Dados não carregados. Chame load() primeiro.");
    }

    const areas = [...new Set(this.cache.map(e => e.area))];
    const anos = [...new Set(this.cache.map(e => e.ano))].sort((a, b) => a - b);
    const recordsByArea: Record<string, number> = {};

    areas.forEach(area => {
      recordsByArea[area] = this.cache!.filter(e => e.area === area).length;
    });

    return {
      totalRecords: this.cache.length,
      areas,
      anos,
      recordsByArea,
    };
  }
}
