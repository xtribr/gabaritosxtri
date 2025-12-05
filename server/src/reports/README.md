# Módulo de Relatórios

Este módulo é responsável por gerar relatórios e exportações, especialmente Excel com formatação rica.

## 📁 Arquivos

### `excelExporter.ts`

Exportador de Excel com formatação condicional rica, equivalente ao XlsxWriter + Pandas em Python.

#### Características

- ✅ **Formatação Condicional**: Cores verde/vermelho para acertos/erros
- ✅ **Múltiplas Abas**: Alunos, Gabarito, Estatísticas, Análise por Questão
- ✅ **Estilos Profissionais**: Cabeçalhos formatados, bordas, cores
- ✅ **Suporte TRI**: Inclui notas TRI e TRI por área quando disponível
- ✅ **Congelamento de Linhas/Colunas**: Facilita navegação em planilhas grandes

#### Formatação Condicional

##### Aba "Alunos"
- **Questões**: 
  - 🟢 Verde pastel: Resposta correta
  - 🔴 Vermelho pastel: Resposta errada
- **Nota TCT**:
  - 🟢 Verde: ≥ 6.0 (aprovado)
  - 🔴 Vermelho: < 6.0 (reprovado)

##### Aba "Análise por Questão"
- **% Acertos**:
  - 🟢 Verde pastel: 0-49%
  - 🟠 Laranja pastel: 50-70%
  - 🟢 Verde: 71%+

#### Uso

```typescript
import { ExcelExporter } from "./reports/excelExporter";

const buffer = await ExcelExporter.generateExcel({
  students: studentsData,
  answerKey: ["A", "B", "C", ...],
  questionContents: [...],
  statistics: examStats,
  includeTRI: true,
  triScores: triScoresMap,
  triScoresByArea: triScoresByAreaMap,
});
```

#### Estrutura do Excel Gerado

1. **Aba "Alunos"**
   - Colunas: #, Matrícula, Nome, Turma, Acertos, Erros, Nota TCT, Nota TRI (opcional), LC TRI, CH TRI, CN TRI, MT TRI (opcional), Confiança, Página, Q1-QN
   - Formatação condicional nas questões e nota

2. **Aba "Gabarito"**
   - Colunas: Questão, Resposta Correta, Conteúdo

3. **Aba "Estatísticas"**
   - Total de Alunos, Média Geral, Maior Nota, Menor Nota

4. **Aba "Análise por Questão"**
   - Questão, Acertos, Erros, % Acertos (com formatação condicional), Conteúdo

## 🔧 Dependências

- `exceljs`: Biblioteca para gerar Excel com formatação rica (equivalente ao XlsxWriter em Python)

## 📝 Comparação com Python

| Python (Pandas + XlsxWriter) | Node.js (ExcelJS) |
|------------------------------|-------------------|
| `df.to_excel()` | `ExcelExporter.generateExcel()` |
| `worksheet.conditional_format()` | `cell.fill` + `cell.font` |
| `workbook.add_worksheet()` | `workbook.addWorksheet()` |
| `worksheet.set_column()` | `sheet.getColumn().width` |

## ✅ Benefícios

- **Visual Profissional**: Planilhas prontas para apresentação
- **Formatação Automática**: Cores e estilos aplicados automaticamente
- **Navegação Fácil**: Linhas/colunas congeladas
- **Compatibilidade**: Excel 2007+ (.xlsx)

