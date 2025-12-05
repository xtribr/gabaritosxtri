# DeepSeek-OCR Service

Serviço Python para processamento de OCR usando DeepSeek-OCR do Hugging Face.

## 🚀 Instalação Rápida

### 1. Instalar Dependências

```bash
cd ocr_service
./start_ocr_service.sh
```

Ou manualmente:

```bash
cd ocr_service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Para GPU (opcional, mas recomendado):
pip install flash-attn==2.7.3 --no-build-isolation
```

### 2. Iniciar Serviço

```bash
python3 deepseek_ocr_api.py
```

O serviço estará disponível em `http://localhost:5001`

## 📋 Endpoints

### GET `/health`
Verifica se o serviço está rodando e se o modelo está carregado.

**Resposta:**
```json
{
  "status": "ok",
  "model_loaded": true,
  "device": "cuda"
}
```

### POST `/ocr`
Processa uma única imagem.

**Body:**
```json
{
  "image": "base64_encoded_image",
  "prompt": "<image>\nFree OCR." // opcional
}
```

**Resposta:**
```json
{
  "text": "Texto extraído...",
  "confidence": 0.95,
  "words": []
}
```

### POST `/ocr/batch`
Processa múltiplas imagens em batch.

**Body:**
```json
{
  "images": ["base64_1", "base64_2", ...],
  "prompt": "<image>\nFree OCR." // opcional
}
```

**Resposta:**
```json
{
  "results": [
    {
      "text": "Texto 1...",
      "confidence": 0.95
    },
    {
      "text": "Texto 2...",
      "confidence": 0.95
    }
  ]
}
```

## ⚙️ Configuração

### Variáveis de Ambiente

- `OCR_PORT`: Porta do serviço (padrão: 5001)
- `CUDA_VISIBLE_DEVICES`: GPU a usar (padrão: 0)

### Exemplo

```bash
export OCR_PORT=5001
export CUDA_VISIBLE_DEVICES=0
python3 deepseek_ocr_api.py
```

## 🔧 Requisitos

- Python 3.8+
- CUDA (opcional, mas recomendado para GPU)
- ~3GB de espaço para o modelo
- RAM: Mínimo 8GB (16GB recomendado)

## 📝 Notas

- O modelo será baixado automaticamente na primeira execução
- Primeira execução pode demorar alguns minutos (download do modelo)
- GPU acelera significativamente o processamento


