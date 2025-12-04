# Leitor de Gabarito ENEM

Sistema para leitura automática de gabaritos do ENEM a partir de arquivos PDF, com extração de dados dos alunos via OMR (Optical Mark Recognition), correção automática e exportação para Excel.

## Visão Geral

Aplicação web fullstack que permite:
- **Gerar Gabaritos**: Upload de CSV com dados dos alunos para gerar PDFs personalizados
- **Processar Gabaritos**: Upload de PDFs escaneados para leitura OMR das respostas
- Preview visual das páginas do PDF
- Detecção automática de bolhas (A-E) com indicadores de confiança
- Configuração de gabarito oficial com cálculo automático de notas
- Templates pré-configurados para diferentes tipos de prova
- Relatórios estatísticos com gráficos de distribuição
- Exibição dos resultados em tabela editável
- Exportação dos dados para arquivo Excel

## Arquitetura

### Frontend (React + TypeScript)
- **Framework**: React 18 com Vite
- **UI**: Shadcn/UI components + Tailwind CSS
- **Gráficos**: Recharts para visualização de dados
- **Roteamento**: Wouter
- **Estado**: React Query para cache/mutations
- **Upload**: react-dropzone para drag-and-drop
- **PDF Preview**: PDF.js para renderização de páginas

### Backend (Express + Node.js)
- **Framework**: Express.js com TypeScript
- **Upload**: Multer para processamento de arquivos
- **OCR**: Tesseract.js para reconhecimento de texto
- **PDF**: pdf-lib para manipulação de PDFs
- **Imagens**: Sharp para conversão PDF→imagem
- **Excel**: SheetJS (xlsx) para geração de planilhas

## Estrutura de Arquivos

```
├── client/
│   ├── src/
│   │   ├── components/ui/    # Componentes Shadcn/UI
│   │   ├── pages/
│   │   │   └── home.tsx      # Página principal
│   │   ├── lib/
│   │   │   └── queryClient.ts
│   │   └── App.tsx
│   └── index.html
├── server/
│   ├── routes.ts             # API endpoints
│   ├── storage.ts            # Interface de armazenamento
│   └── index.ts
├── shared/
│   └── schema.ts             # Tipos, schemas e templates
└── design_guidelines.md      # Diretrizes de design
```

## Funcionalidades

### 1. Upload e Processamento
- Drag-and-drop para PDFs
- Preview de até 8 páginas
- Processamento OCR com Tesseract.js
- Progresso em tempo real via SSE

### 2. Modo de Lote
- Upload de múltiplos PDFs simultaneamente
- Fila de processamento com status individual
- Agregação de resultados de todos os arquivos

### 3. Gabarito e Notas
- Inserção do gabarito oficial
- Cálculo automático de pontuação
- Nota mínima configurável
- Indicadores visuais de aprovação/reprovação

### 4. Templates de Prova
- ENEM Completo (180 questões, A-E)
- ENEM Dia 1/Dia 2 (90 questões cada)
- Vestibular FUVEST (90 questões)
- Vestibular UNICAMP (72 questões)
- Prova Bimestral (20 questões, A-D)
- Simulado (45 questões)
- Personalizado (configurável)

### 5. Indicadores de Confiança OMR
- Verde: Alta confiança (≥80%)
- Amarelo: Média confiança (60-79%)
- Vermelho: Baixa confiança (<60%)
- Bordas coloridas nas linhas da tabela

### 6. OCR de Nomes (Beta)
- **Funcionalidade opcional** - desativada por padrão
- Extrai nomes manuscritos usando Tesseract.js
- **Limitação conhecida**: Tesseract foi projetado para texto impresso, não manuscrito
- Resultados podem ser imprecisos para caligrafia manual
- Os nomes podem ser editados manualmente na tabela de resultados
- Use o switch "OCR Nomes (Beta)" para ativar quando necessário

### 7. Estatísticas e Relatórios
- Média, mediana, mínimo/máximo de notas
- Gráfico de distribuição de notas
- Gráfico de distribuição de confiança OCR
- Taxa de aprovação configurável

### 8. Exportação Excel
- Dados completos dos alunos
- Notas e contagem de acertos
- Coluna de confiança OCR
- Estatísticas gerais

### 9. Geração de Gabaritos (CSV → PDF)
- Upload de CSV com dados dos alunos (Nome, Turma, Matrícula)
- Aceita delimitadores ; ou ,
- Preview dos primeiros 10 alunos antes de gerar
- Gera PDF com múltiplas páginas (uma por aluno)
- Cada página é o template do gabarito com dados pré-preenchidos
- Para lotes grandes (>50 alunos): divide em múltiplos PDFs com links individuais
- **IMPORTANTE**: A matrícula é o identificador único do aluno - será usada para conectar o gabarito preenchido ao nome do aluno na correção

## API Endpoints

### POST /api/process-pdf
Inicia processamento de um PDF de gabarito.
- **Body**: multipart/form-data com campo `pdf`
- **Response**: `{ jobId, message }`

### GET /api/process-pdf/:jobId/status
Retorna status do processamento para polling.
- **Response**: `{ status, progress, currentPage, totalPages, studentCount, errorMessage }`
- **Status**: `queued`, `processing`, `completed`, `error`

### GET /api/process-pdf/:jobId/results
Retorna resultados após processamento completo.
- **Response**: `{ status, students, totalPages, warnings }`

### POST /api/export-excel
Exporta dados dos alunos para Excel.
- **Body**: { students: StudentData[], answerKey?, statistics? }
- **Response**: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

### GET /api/health
Health check do servidor.

### POST /api/generate-pdfs
Gera PDF com gabaritos personalizados a partir de CSV.
- **Body**: multipart/form-data com campo `csv`
- **Response**: `{ success, pdfCount, files, message }` com links para download
- **Template**: Usa o template em `attached_assets/Modelo_de_cartão_-_2_1764877638588.pdf`

### POST /api/preview-csv
Valida e retorna preview do CSV antes de gerar PDFs.
- **Body**: multipart/form-data com campo `csv`
- **Response**: `{ success, totalStudents, preview, columns }`

## Tipos de Dados

```typescript
interface StudentData {
  id: string;
  studentNumber: string;
  studentName: string;
  answers: string[];
  pageNumber: number;
  rawText?: string;
  confidence?: number;
  score?: number;
  correctAnswers?: number;
  wrongAnswers?: number;
}

interface ExamTemplate {
  name: string;
  questionCount: number;
  validAnswers: string[];
  description: string;
  passingScore: number;
}
```

## Fluxo de Uso

1. Usuário arrasta PDF(s) para a zona de upload
2. Sistema renderiza preview ou lista arquivos em lote
3. Usuário clica "Processar Gabarito" ou "Processar Todos"
4. Backend converte páginas em imagens e aplica OCR
5. Dados extraídos aparecem na tabela em tempo real
6. Usuário configura gabarito oficial (opcional)
7. Sistema calcula notas e exibe estatísticas
8. Usuário pode editar dados incorretos
9. Clica "Exportar para Excel" para download

## Preferências do Usuário

- Interface em Português (Brasil)
- Design clean e profissional
- Foco em usabilidade para professores/administradores

## Mudanças Recentes

- 2024-12-04: Migração SSE → Polling
  - Substituído streaming SSE por sistema de jobs assíncrono
  - Novos endpoints: /status e /results para polling
  - Frontend faz polling a cada 1s para atualização de progresso
  - OCR de campos de texto temporariamente desabilitado para performance
  - Processamento OMR funcional com ~3-5s por página

- 2024-12-04: Funcionalidades avançadas
  - Sistema de templates para diferentes provas
  - Processamento em lote de múltiplos PDFs
  - Indicadores de confiança OCR com cores
  - Gráficos de distribuição de notas e confiança
  - Nota mínima configurável por template
  - Validação robusta de respostas personalizadas

- 2024-12-04: Implementação inicial do MVP
  - Upload de PDF com drag-and-drop
  - Preview de páginas do PDF
  - Processamento OCR com Tesseract.js
  - Tabela editável de resultados
  - Exportação para Excel
