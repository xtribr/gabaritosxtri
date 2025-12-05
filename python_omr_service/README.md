# Serviço OMR com baddrow-python

Serviço Python para processamento de gabaritos ENEM usando técnicas de visão computacional (OpenCV) inspiradas em baddrow-python.

## Características

- ✅ **Resistente a desalinhamentos**: Detecta automaticamente a estrutura do gabarito
- ✅ **Suporta rotação e inclinação**: Usa HoughCircles e detecção de linhas
- ✅ **Processa PDFs**: Converte automaticamente PDF para imagens
- ✅ **90 questões ENEM**: Template configurado para gabarito oficial
- ✅ **Compatível com frontend HTML**: Formato de resposta padronizado

## Instalação

### 1. Dependências do Sistema

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install poppler-utils
```

**macOS:**
```bash
brew install poppler
```

**Windows:**
- Baixar poppler de: https://github.com/oschwartz10612/poppler-windows/releases
- Extrair e adicionar `bin/` ao PATH

### 2. Dependências Python

```bash
cd python_omr_service
pip install -r requirements.txt
```

### 3. Executar Serviço

```bash
python app.py
```

O serviço estará disponível em `http://localhost:5002` (porta 5002 para evitar conflito com AirPlay no macOS)

## Endpoints

### GET `/health`
Health check do serviço.

**Resposta:**
```json
{
  "status": "ok",
  "service": "baddrow-omr-service",
  "template": { ... }
}
```

### GET `/api/process-pdf?url=<URL_DO_PDF>`
Processa um PDF a partir de uma URL (ex: Cloudinary).

**Parâmetros:**
- `url` (query string): URL do PDF no Cloudinary ou outro serviço

**Resposta:**
```json
{
  "status": "sucesso",
  "paginas": [
    {
      "pagina": 1,
      "resultado": {
        "questoes": {
          "1": "A",
          "2": "B",
          "3": "Não respondeu",
          ...
        }
      }
    }
  ],
  "total_paginas": 1
}
```

### POST `/api/process-image`
Processa uma imagem diretamente.

**Body:** `multipart/form-data`
- `image`: arquivo de imagem (PNG, JPEG)
- `page` (opcional): número da página (padrão: 1)

**Resposta:**
```json
{
  "status": "sucesso",
  "pagina": {
    "pagina": 1,
    "resultado": {
      "questoes": { ... }
    }
  }
}
```

## Integração com Frontend HTML

O serviço é compatível com o frontend HTML fornecido. A URL da API deve ser configurada como:

```javascript
const PYTHON_API_URL = "http://localhost:5002/api/process-pdf";
// ou
const PYTHON_API_URL = "https://seu-servidor.onrender.com/api/process-pdf";
```

## Deploy

### Render.com

1. Criar novo Web Service
2. Conectar repositório GitHub
3. Configurar:
   - **Build Command:** `pip install -r python_omr_service/requirements.txt`
   - **Start Command:** `cd python_omr_service && python app.py`
   - **Environment:** Python 3

### Outros Serviços

O serviço é compatível com qualquer plataforma que suporte Python/Flask:
- Heroku
- Railway
- Fly.io
- AWS Lambda (com adaptações)

## Melhorias Futuras

- [ ] Calibração automática usando marcadores de canto
- [ ] Suporte a múltiplos templates de gabarito
- [ ] Cache de resultados
- [ ] Processamento em lote otimizado
- [ ] Métricas de confiança por resposta

## Troubleshooting

### Erro: "pdf2image não está instalado"
Instale poppler-utils (veja seção de instalação).

### Erro: "Não foi possível detectar estrutura da grade"
- Verifique a qualidade da imagem (DPI mínimo: 150)
- Garanta que o gabarito está bem alinhado na imagem
- Tente aumentar o contraste da imagem

### Performance lenta
- Reduza o DPI de conversão (padrão: 150)
- Processe páginas em paralelo (requer adaptação do código)

