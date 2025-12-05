#!/bin/bash
# Script para iniciar o serviço DeepSeek-OCR

echo "🚀 Iniciando serviço DeepSeek-OCR..."

# Verificar se Python 3 está instalado
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 não encontrado. Por favor, instale Python 3.8 ou superior."
    exit 1
fi

# Verificar se o ambiente virtual existe
if [ ! -d "venv" ]; then
    echo "📦 Criando ambiente virtual..."
    python3 -m venv venv
fi

# Ativar ambiente virtual
source venv/bin/activate

# Instalar dependências
echo "📥 Instalando dependências..."
pip install --upgrade pip
pip install -r requirements.txt

# Verificar se flash-attn precisa ser instalado (opcional, para GPU)
if [ "$1" == "--gpu" ]; then
    echo "⚡ Instalando flash-attn para GPU..."
    pip install flash-attn==2.7.3 --no-build-isolation || echo "⚠️  flash-attn falhou, continuando sem ele..."
fi

# Iniciar servidor
echo "✅ Iniciando servidor DeepSeek-OCR na porta 5001..."
python3 deepseek_ocr_api.py


