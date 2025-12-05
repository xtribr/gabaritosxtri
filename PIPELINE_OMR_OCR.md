# 📊 Pipeline OMR + OCR Completo

## 🎯 Visão Geral

O sistema processa cartões-resposta escaneados em um pipeline de 4 etapas:

```
┌─────────────────┐
│ PDF Escaneado   │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────────────┐
│ ETAPA 1: Converter PDF → Imagem              │
│ (usando pdftoppm)                           │
└────────┬────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────┐
│ ETAPA 2: Pré-processar Imagem                │
│ • Converter para escala de cinza             │
│ • Aumentar contraste (autocontrast)          │
│ • Aplicar sharpen (aumenta bordas)           │
│ • Threshold (preto/branco)                   │
└────────┬────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────┐
│ ETAPA 3: OMR - Detectar Bolhas (Respostas)  │
│ • Para cada questão (Q1-45)                  │
│ • Para cada opção (A-E)                      │
│ • Medir "escuridão" da bolha                 │
│ • Identificar qual opção foi preenchida      │
└────────┬────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────┐
│ ETAPA 4: OCR - Extrair Dados (Nome, etc)    │
│ • Detectar campos de texto                   │
│ • Usar Tesseract para ler caracteres         │
│ • Validar formato (matrícula, data)          │
└────────┬────────────────────────────────────┘
         │
         ↓
┌─────────────────┐
│ JSON com Result │
├─────────────────┤
│ answers: {...}  │
│ student: {...}  │
│ confidence: ... │
└─────────────────┘
```

---

## 📋 Arquivo: `omr_ocr_pipeline.py`

### Localização
```
/projeto/omr_ocr_pipeline.py
```

### Dependências
```bash
pip install pillow numpy
# Também requer:
#   - pdftoppm (parte do poppler-utils)
#   - tesseract (opcional, para OCR melhorado)
```

### Uso

**Processar um PDF:**
```bash
python3 omr_ocr_pipeline.py cartao.pdf
```

**Processar uma imagem:**
```bash
python3 omr_ocr_pipeline.py cartao.jpg
```

**Com caminho completo:**
```bash
python3 omr_ocr_pipeline.py /Users/xandao/Desktop/cartao_preenchido.pdf
```

---

## 🔧 Detalhes de Cada Etapa

### ETAPA 1: PDF → Imagem

**Função:** `pdf_to_image(pdf_path: str) -> Image.Image`

**O que faz:**
- Usa `pdftoppm` (ferramente do Poppler) para converter PDF → PNG
- Extrai apenas a primeira página
- Retorna objeto PIL Image

**Comando executado:**
```bash
pdftoppm -png -singlefile cartao.pdf cartao.png
```

**Saída:**
- Imagem em PNG com mesma qualidade do PDF
- Dimensão típica: 1241 × 1755 pixels

---

### ETAPA 2: Pré-processar Imagem

**Função:** `preprocess_image(image: Image.Image) -> Image.Image`

**O que faz:**

1. **Converter para escala de cinza**
   - Remove cores (RGB → Grayscale)
   - Reduz tamanho de dados

2. **Auto-contraste** (Normalize)
   - Estica histograma de cores
   - Deixa preto mais preto, branco mais branco
   - Função: `ImageOps.autocontrast(cutoff=5)`

3. **Sharpen (2x)**
   - Aumenta arestas e bordas
   - Deixa bolhas mais definidas
   - Função: `ImageFilter.SHARPEN`

4. **Threshold**
   - Converte para preto/branco puro (0 ou 255)
   - Valor: 100 (pixels < 100 = preto, ≥ 100 = branco)
   - Resultado: bolhas ficam **preta sólida**, fundo **branco puro**

**Visualização:**

```
Imagem Original        Pré-processada
┌──────────────┐      ┌──────────────┐
│ ◎●◎●◎●◎●◎   │      │ ●●●●●●●●●●  │
│ ○●○●○●○●○   │  →   │ ●●●●●●●●●●  │
│ ◎●◎●◎●◎●◎   │      │ ●●●●●●●●●●  │
└──────────────┘      └──────────────┘
(cores, gradientes)   (preto/branco)
```

---

### ETAPA 3: OMR - Detectar Bolhas

**Função:** `detect_bubbles(image: Image.Image) -> Dict[int, str]`

**O que faz:**

Para cada questão (Q01-Q45):
1. Usa coordenadas Y REAIS da calibração anterior
2. Para cada opção (A, B, C, D, E):
   - Usa coordenadas X pré-medidas
   - Extrai região circular ao redor (raio = 0.6% da largura)
   - Calcula "escuridão" (média de pixels pretos)
   - Se escuridão > 150 → bolha está marcada

3. Seleciona a opção com maior escuridão

**Pseudocódigo:**

```python
answers = {}

for questao in 1..45:
    y_pixel = coordenada_y[questao]
    
    option_darkness = {}
    for option in ['A', 'B', 'C', 'D', 'E']:
        x_pixel = coordenada_x[option]
        
        # Extrair região circular
        regiao = imagem[y-raio : y+raio, x-raio : x+raio]
        
        # Medir escuridão (preto = alto, branco = baixo)
        escuridade = media(regiao)
        option_darkness[option] = escuridade
    
    # Qual opção está mais escura?
    marcada = max(option_darkness)
    
    if option_darkness[marcada] > threshold:
        answers[questao] = marcada

return answers  # {1: 'A', 2: 'C', 3: 'B', ...}
```

**Resultado:**
```python
{
    1: 'A',    # Q01: marcada opção A
    2: 'B',    # Q02: marcada opção B
    3: 'C',    # Q03: marcada opção C
    4: 'A',    # Q04: marcada opção A
    # ...
    44: 'E',   # Q44: marcada opção E
}
```

---

### ETAPA 4: OCR - Extrair Dados

**Função:** `extract_student_data(image: Image.Image) -> Dict[str, Any]`

**O que faz (implementado):**
- Estrutura básica para extrair: nome, matrícula, data de nascimento

**O que falta (TODO):**
- Integrar Tesseract para OCR real
- Detectar campos de texto no cartão
- Validar formatos

**Dependência:**
```bash
# macOS
brew install tesseract

# Linux
sudo apt-get install tesseract-ocr

# Depois usar em Python
import pytesseract
```

**Exemplo (quando implementado):**
```python
# Extrair nome da região superior
nome_region = image.crop((x1, y1, x2, y2))
nome = pytesseract.image_to_string(nome_region, lang='por')

# Extrair matrícula
matricula_region = image.crop((x1, y1, x2, y2))
matricula = pytesseract.image_to_string(matricula_region)
```

---

## 📊 Saída JSON

Resultado do processamento:

```json
{
  "status": "success",
  "file": "cartao.pdf",
  "image_size": [1241, 1755],
  "student": {
    "name": "Letícia Valência",
    "student_number": "12345678",
    "birth_date": "01/01/2007",
    "institution": "ESCOLA TESTE"
  },
  "answers": {
    "1": "A",
    "2": "B",
    "3": "C",
    "4": "A",
    "5": "B",
    "6": "C",
    "7": "D",
    "8": "E",
    "9": "A",
    "10": "B",
    ...
    "44": "E"
  },
  "total_marked": 44,
  "total_questions": 45
}
```

---

## 🔄 Integração com Backend (server/omr.ts)

### Chamada do Pipeline Python

```typescript
// server/omr.ts
import { exec } from 'child_process';

async function processCartaoWithPipeline(imagePath: string) {
  return new Promise((resolve, reject) => {
    exec(
      `python3 omr_ocr_pipeline.py "${imagePath}"`,
      (error, stdout, stderr) => {
        if (error) reject(error);
        
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error('Invalid JSON output from pipeline'));
        }
      }
    );
  });
}
```

---

## ⚙️ Parâmetros Ajustáveis

### Em `detect_bubbles()`:

```python
# Raio da região de análise (% da largura)
bubble_radius_px = int(width * 0.006)  # 0.6% da largura

# Threshold de escuridão para considerar marcada
if darkness_value > 150:  # Valores: 0-255
    answers[q_num] = marked_option
```

### Em `preprocess_image()`:

```python
# Threshold binário
threshold = 100  # Pixels < 100 = preto, ≥ 100 = branco

# Número de passes de sharpen
gray = gray.filter(ImageFilter.SHARPEN)  # 2x
```

---

## 🐛 Troubleshooting

**Erro: "pdftoppm: command not found"**
```bash
# macOS
brew install poppler

# Linux
sudo apt-get install poppler-utils
```

**Bolhas não são detectadas (todos 0 marked)**
- Aumentar `bubble_radius_px`
- Diminuir threshold de escuridão (ex: 100 em vez de 150)
- Verificar se pré-processamento está bom

**Detecção muito sensível (falsos positivos)**
- Aumentar threshold de escuridão (ex: 180 em vez de 150)
- Reduzir `bubble_radius_px`

**OCR não lê nomes**
- Instalar Tesseract
- Usar `pytesseract.image_to_string()`
- Ajustar região de extração

---

## 📈 Fluxo Completo no Frontend

```
Usuario faz upload PDF
         ↓
[Express] POST /api/upload
         ↓
Salvar arquivo temp
         ↓
Chamar: python3 omr_ocr_pipeline.py cartao.pdf
         ↓
Parse JSON retornado
         ↓
[Frontend] Exibir respostas detectadas
           Mostrar confiança por questão
           Comparar com gabarito
         ↓
Salvar em banco de dados
         ↓
Gerar relatório de performance
```

---

## ✅ Checklist de Implementação

- [x] Criar `omr_ocr_pipeline.py` com pipeline completo
- [ ] Testar com imagem de cartão preenchido
- [ ] Validar detecção (comparar com manual)
- [ ] Integrar chamada Python no backend
- [ ] Implementar OCR com Tesseract
- [ ] Adicionar validação de campos
- [ ] Criar UI para visualizar detecção
- [ ] Adicionar ajuste de thresholds dinâmico
- [ ] Otimizar performance (paralelizar Q1-45)

---

## 📚 Referências

- **OMR Concepts:** https://en.wikipedia.org/wiki/Optical_mark_recognition
- **PIL/Pillow:** https://pillow.readthedocs.io/
- **Tesseract OCR:** https://github.com/UB-Mannheim/tesseract/wiki
- **NumPy:** https://numpy.org/doc/stable/

