# 📝 GabaritAI - XTRI

Sistema completo para leitura automática de gabaritos do ENEM e outras provas, com extração de dados via OMR (Optical Mark Recognition), correção automática e exportação para Excel.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)

## 🎯 Visão Geral

Aplicação web fullstack desenvolvida para professores e administradores educacionais, permitindo:

- ✅ **Processar Gabaritos**: Upload de PDFs escaneados para leitura OMR automática das respostas
- ✅ **Gerar Gabaritos**: Criação de PDFs personalizados a partir de CSV com dados dos alunos
- ✅ **Correção Automática**: Cálculo de notas com base em gabarito oficial configurável
- ✅ **Análise Estatística**: Relatórios completos com gráficos de distribuição e análise por questão
- ✅ **Exportação Excel**: Dados completos exportados para planilhas Excel

## 🚀 Funcionalidades Principais

### 1. Processamento de Gabaritos
- Upload de PDFs via drag-and-drop
- Preview visual das páginas (até 8 páginas)
- Detecção automática de bolhas marcadas (A-E)
- Indicadores de confiança por resposta
- OCR opcional para extração de nomes e matrículas (Beta)
- Processamento em lote de múltiplos PDFs

### 2. Geração de Gabaritos Personalizados
- Upload de CSV com dados dos alunos (Nome, Turma, Matrícula)
- Preview antes de gerar
- Geração automática de PDFs com dados pré-preenchidos
- Suporte a lotes grandes (divide automaticamente em múltiplos PDFs)

### 3. Correção e Análise
- Configuração de gabarito oficial
- Cálculo automático de notas e acertos
- Templates pré-configurados para diferentes tipos de prova:
  - ENEM Completo (180 questões)
  - ENEM Dia 1/Dia 2 (90 questões cada)
  - Vestibular FUVEST (90 questões)
  - Vestibular UNICAMP (72 questões)
  - Prova Bimestral (20 questões)
  - Simulado (45 questões)
  - Personalizado (configurável)

### 4. Estatísticas e Relatórios
- Média, maior e menor nota
- Taxa de aprovação configurável
- Gráfico de distribuição de notas
- Gráfico de distribuição de confiança OCR
- Análise detalhada por questão

### 5. Exportação
- Exportação completa para Excel
- Múltiplas planilhas (Alunos, Gabarito, Estatísticas, Análise por Questão)
- Dados editáveis e formatados

## 🛠️ Tecnologias

### Frontend
- **React 18** - Framework UI
- **TypeScript** - Tipagem estática
- **Vite** - Build tool e dev server
- **Tailwind CSS** - Estilização
- **Shadcn/UI** - Componentes UI
- **Recharts** - Gráficos e visualizações
- **PDF.js** - Preview de PDFs
- **React Dropzone** - Upload de arquivos
- **TanStack Query** - Gerenciamento de estado

### Backend
- **Express.js** - Framework web
- **TypeScript** - Tipagem estática
- **Tesseract.js** - OCR (reconhecimento de texto)
- **pdf-lib** - Manipulação de PDFs
- **Sharp** - Processamento de imagens
- **Multer** - Upload de arquivos
- **SheetJS (xlsx)** - Geração de Excel
- **Zod** - Validação de schemas

## 📁 Estrutura do Projeto

```
gabaritosxtri/
├── client/                 # Frontend React
│   ├── src/
│   │   ├── components/ui/  # Componentes Shadcn/UI
│   │   ├── pages/         # Páginas da aplicação
│   │   ├── hooks/         # React hooks customizados
│   │   └── lib/           # Utilitários
│   └── index.html
├── server/                 # Backend Express
│   ├── index.ts           # Servidor principal
│   ├── routes.ts          # API endpoints
│   ├── omr.ts             # Processamento OMR
│   ├── storage.ts         # Armazenamento em memória
│   ├── static.ts          # Servir arquivos estáticos
│   └── vite.ts            # Configuração Vite dev
├── shared/                # Código compartilhado
│   └── schema.ts         # Schemas Zod e tipos TypeScript
├── script/                # Scripts de build
│   └── build.ts          # Build para produção
└── attached_assets/      # Assets (PDFs, imagens, templates)
```

## 🚀 Instalação e Uso

### Pré-requisitos
- Node.js 18+ 
- npm ou yarn
- (Opcional) `pdftoppm` para conversão de PDF (ou usa Sharp como fallback)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/xtribr/gabaritosxtri.git
cd gabaritosxtri

# Instale as dependências
npm install
```

**Nota:** O arquivo `package.json` contém todas as dependências necessárias. O Node.js usa `package.json` em vez de `requirements.txt` (Python). Para instalar todas as dependências, basta executar `npm install`.

### Desenvolvimento

```bash
# Inicia servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:5000`

### Produção

```bash
# Build para produção
npm run build

# Inicia servidor de produção
npm start
```

## 📡 API Endpoints

### Processamento de PDF
- `POST /api/process-pdf` - Inicia processamento de PDF
- `GET /api/process-pdf/:jobId/status` - Status do processamento
- `GET /api/process-pdf/:jobId/results` - Resultados do processamento

### Geração de PDFs
- `POST /api/generate-pdfs` - Gera PDFs personalizados a partir de CSV
- `GET /api/download-pdf/:batchId/:fileIndex` - Download de PDF gerado
- `POST /api/preview-csv` - Preview e validação de CSV

### Exportação
- `POST /api/export-excel` - Exporta dados para Excel

### Utilitários
- `GET /api/health` - Health check do servidor

## 🎨 Interface

A interface foi desenvolvida seguindo princípios de Material Design adaptados para workflows educacionais:

- Design limpo e profissional
- Foco em usabilidade para professores
- Feedback visual claro para todas as ações
- Indicadores de confiança coloridos
- Tabelas editáveis inline
- Gráficos interativos

## 📊 Processamento OMR

O sistema utiliza análise de imagem avançada para detectar bolhas marcadas:

- **Thresholds configuráveis** para detecção
- **Suporte a detecção ambígua** para marcas leves
- **Cálculo de confiança** por resposta
- **Template oficial** do gabarito ENEM (90 questões)
- **Coordenadas normalizadas** para diferentes resoluções

## 🔧 Configuração

### Variáveis de Ambiente

```env
PORT=5000                    # Porta do servidor (padrão: 5000)
NODE_ENV=development         # Ambiente (development/production)
DATABASE_URL=                # URL do banco (opcional, para Drizzle)
```

### Templates de Prova

Os templates podem ser configurados em `shared/schema.ts`. O sistema inclui templates pré-configurados para:

- ENEM (completo e por dia)
- Vestibulares (FUVEST, UNICAMP)
- Provas escolares (bimestral, simulado)
- Personalizado (configurável)

## 📝 Formato dos Arquivos de Entrada

### CSV para Geração de Gabaritos Personalizados

Para gerar gabaritos personalizados, o CSV deve ter o formato:

```csv
NOME;TURMA;MATRICULA
João Silva;3º A;12345
Maria Santos;3º B;12346
```

**Colunas Obrigatórias:**
- `NOME` (ou `NOME DO ALUNO`, `NOME_COMPLETO`): Nome completo do aluno
- `TURMA` (ou `SALA`, `CLASSE`): Turma/sala do aluno
- `MATRICULA` (ou `MATRÍCULA`, `ID`, `CODIGO`): Matrícula ou código único do aluno

**Observações:**
- O sistema detecta automaticamente o separador (`;` ou `,`)
- A primeira linha pode ser cabeçalho ou dados (o sistema detecta automaticamente)
- Linhas vazias são ignoradas
- O sistema aceita variações nos nomes das colunas (case-insensitive)

### CSV para Importação de Gabarito Oficial

Para importar o gabarito oficial via Excel/CSV, o arquivo deve ter as seguintes colunas:

```csv
NR QUESTÃO;GABARITO;CONTEÚDO
1;A;Matemática - Álgebra
2;B;Matemática - Geometria
3;C;Linguagens - Literatura
```

**Colunas Obrigatórias:**
- `NR QUESTÃO` (ou `QUESTÃO`, `Q`, `NUMERO`, `NÚMERO`): Número da questão (1, 2, 3...)
- `GABARITO` (ou `RESPOSTA`, `LETRA`, `GABARITO OFICIAL`): Letra da resposta correta (A, B, C, D, E)
- `CONTEÚDO` (ou `CONTEUDO`, `ASSUNTO`, `MATÉRIA`): Conteúdo/assunto da questão (opcional mas recomendado)

**Observações:**
- O sistema detecta automaticamente o separador (`;` ou `,`)
- A primeira linha deve conter os cabeçalhos
- As questões devem estar numeradas sequencialmente
- O conteúdo é opcional, mas recomendado para análises estatísticas

### CSV de Dados TRI Históricos

O sistema utiliza um arquivo CSV com dados históricos de TRI do ENEM (2009-2023) localizado em `tri/TRI ENEM DE 2009 A 2023 MIN MED E MAX.csv`.

**Formato:**
```csv
area;acertos;min;max;media;ano
CH;0;300,0;300;300;2009
CH;1;300,1;337,3;313,25;2009
```

**Colunas:**
- `area`: Área do conhecimento (CH, CN, MT, LC)
- `acertos`: Número de acertos (0-45)
- `min`: Nota TRI mínima histórica
- `max`: Nota TRI máxima histórica
- `media`: Nota TRI média histórica
- `ano`: Ano da prova (2009-2023)

**⚠️ IMPORTANTE - Segurança e LGPD:**
- **NUNCA** commite arquivos CSV ou Excel com dados reais de alunos no repositório
- O arquivo `.gitignore` está configurado para ignorar `*.csv` e `*.xlsx`
- Dados de alunos são informações sensíveis protegidas pela LGPD
- Use apenas dados de exemplo ou anonimizados para testes
- **Exceção**: O arquivo `tri/TRI ENEM DE 2009 A 2023 MIN MED E MAX.csv` contém apenas dados históricos públicos do ENEM (não dados de alunos) e é necessário para o funcionamento do sistema

## 🐛 Troubleshooting

### OCR não funciona
- Certifique-se de que o arquivo `por.traineddata` está presente
- O OCR de nomes é experimental e funciona melhor com texto impresso

### PDF não processa
- Verifique se o PDF não está protegido ou criptografado
- Tente converter o PDF para imagens manualmente

### Erro de memória
- Para lotes muito grandes, o sistema divide automaticamente em múltiplos PDFs
- Considere processar PDFs menores separadamente

## 📄 Licença

Este projeto está sob a licença MIT.

## 👨‍💻 Desenvolvido por

**XTRI - EdTech em Natal/RN**

Especialista em ENEM e TRI, desenvolvendo soluções educacionais com dados reais.

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📞 Suporte

Para questões e suporte, abra uma issue no GitHub.

---

⭐ Se este projeto foi útil, considere dar uma estrela!

