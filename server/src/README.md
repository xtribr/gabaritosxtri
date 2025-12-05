# Estrutura Organizada do Backend

Esta pasta contém o código fonte organizado do backend, separado por responsabilidades.

## 📁 Estrutura de Pastas

```
server/src/
├── calculations/     # Lógica de cálculos (TRI, TCT)
├── data/            # Carregamento de dados (CSV, etc)
├── processors/      # Processamento e orquestração (Two-Pass Algorithm)
└── reports/         # Geração de relatórios (Excel, PDF)
```

## 📦 Módulos Criados

### `calculations/`

#### `triCalculator.ts`
- **Responsabilidade**: Calcular notas TRI (Teoria de Resposta ao Item)
- **Funcionalidades**:
  - Cálculo de notas TRI baseado em dados históricos
  - Aplicação de fator de coerência
  - Classificação de questões por dificuldade
  - Interpolação entre min/max baseada na coerência

#### `tctCalculator.ts`
- **Responsabilidade**: Calcular notas TCT (Teoria Clássica dos Testes)
- **Funcionalidades**:
  - Cálculo de notas por área (LC, CH, CN, MT)
  - Cálculo de média geral
  - Suporte a diferentes templates de prova

### `data/`

#### `triDataLoader.ts`
- **Responsabilidade**: Carregar e cachear dados TRI do CSV
- **Funcionalidades**:
  - Leitura do arquivo CSV histórico (não hardcoded)
  - Processamento otimizado com `csv-parse` (equivalente ao Pandas em Python)
  - Cache em memória para performance
  - Parsing e validação de dados
  - Conversão automática de tipos (números, datas)
  - Estatísticas do CSV carregado
  - Métodos para recarregar e limpar cache

### `processors/`

#### `questionStatsProcessor.ts`
- **Responsabilidade**: Calcular estatísticas da prova (PASSO 1 do Two-Pass Algorithm)
- **Funcionalidades**:
  - Calcula porcentagem de acerto de cada questão baseado em TODOS os alunos
  - Gera o dicionário `stats_prova` necessário para o cálculo TRI
  - Suporta cálculo para intervalos específicos (áreas ENEM)

#### `triProcessor.ts`
- **Responsabilidade**: Orquestrar o cálculo TRI usando Two-Pass Algorithm
- **Funcionalidades**:
  - Implementa o algoritmo de dois passos completo
  - Processa múltiplas áreas (ENEM: LC, CH, CN, MT)
  - Coordena cálculo de estatísticas e TRI individual

## 🔄 Como Usar

### Exemplo: Calcular TRI com Two-Pass Algorithm (Recomendado)

```typescript
import { TRIProcessor } from "./src/processors/triProcessor";

// Processar uma área específica
const { results, usarCoerencia } = await TRIProcessor.processArea(
  students,      // TODOS os alunos
  "CH",          // área
  2023,          // ano
  answerKey,     // gabarito completo
  1,             // questão inicial (1-indexed)
  45             // questão final (1-indexed)
);

// Processar múltiplas áreas (ENEM)
const areas = [
  { area: "LC", start: 1, end: 45 },
  { area: "CH", start: 46, end: 90 },
  { area: "CN", start: 91, end: 135 },
  { area: "MT", start: 136, end: 180 }
];

const resultsByArea = await TRIProcessor.processMultipleAreas(
  students,
  areas,
  2023,
  answerKey
);
```

### Exemplo: Calcular Estatísticas da Prova (PASSO 1)

```typescript
import { QuestionStatsProcessor } from "./src/processors/questionStatsProcessor";

// Calcular estatísticas de todas as questões
const questionStats = QuestionStatsProcessor.calculateQuestionStats(
  students,      // TODOS os alunos
  answerKey,     // gabarito completo
  1,             // questão inicial (opcional)
  180            // questão final (opcional)
);

// Calcular estatísticas para um intervalo específico
const areaStats = QuestionStatsProcessor.calculateQuestionStatsForRange(
  students,
  answerKey,
  1,    // início da área
  45    // fim da área
);
```

### Exemplo: Calcular TRI Diretamente (Avançado)

```typescript
import { TRICalculator } from "./src/calculations/triCalculator";

// Se você já tem as estatísticas calculadas
const { results, usarCoerencia } = await TRICalculator.calculate(
  students,
  "CH",          // área
  2023,          // ano
  questionStats,  // estatísticas já calculadas
  answerKey       // gabarito
);
```

### Exemplo: Calcular TCT

```typescript
import { TCTCalculator } from "./src/calculations/tctCalculator";

const results = TCTCalculator.calculate(
  students,
  answerKey,
  areas, // opcional, para ENEM
  0.222 // pontos por acerto
);
```

## ✅ Benefícios da Organização

1. **Separação de Responsabilidades**: Cada módulo tem uma função clara
2. **Facilidade de Manutenção**: Mudanças em cálculos não afetam processamento
3. **Reutilização**: Módulos podem ser usados em diferentes contextos
4. **Testabilidade**: Cada módulo pode ser testado independentemente
5. **Legibilidade**: Código mais fácil de entender e navegar
6. **Performance**: Uso de bibliotecas otimizadas (`csv-parse`) em vez de loops manuais
7. **Dados Externos**: CSV lido de arquivo, não hardcoded no código

## 🎯 Two-Pass Algorithm (Algoritmo de Dois Passos)

O cálculo TRI com coerência requer um algoritmo de dois passos:

### PASSO 1: Estatística da Prova
1. Ler as respostas de **TODOS** os alunos
2. Calcular a porcentagem de acerto de cada questão
3. Gerar o dicionário `stats_prova` necessário para o cálculo

### PASSO 2: Cálculo Individual
1. Para cada aluno, calcular TRI usando:
   - Respostas do aluno
   - Estatísticas calculadas no PASSO 1
   - Dados históricos do CSV

### Por que é necessário?

A TRI com fator de coerência precisa saber quais questões são "fáceis" (alta porcentagem de acerto) e quais são "difíceis" (baixa porcentagem). Isso só pode ser determinado analisando **todos** os alunos primeiro.

## 🚀 Próximos Passos

- [x] Implementar Two-Pass Algorithm
- [ ] Extrair processamento de PDF/OMR para `processors/`
- [ ] Extrair geração de relatórios para `reports/`
- [ ] Adicionar testes unitários para cada módulo
- [ ] Documentar interfaces e tipos

