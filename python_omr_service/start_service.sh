#!/bin/bash

# Script para iniciar o serviço OMR Python

echo "🚀 Iniciando serviço OMR com baddrow-python..."

# Verificar se poppler está instalado
if ! command -v pdftoppm &> /dev/null; then
    echo "⚠️  AVISO: poppler-utils não encontrado!"
    echo "   Instale com: sudo apt-get install poppler-utils (Linux)"
    echo "   ou: brew install poppler (macOS)"
    echo ""
fi

# Verificar se virtualenv existe
if [ ! -d "venv" ]; then
    echo "📦 Criando ambiente virtual..."
    python3 -m venv venv
fi

# Ativar ambiente virtual
source venv/bin/activate

# Instalar dependências
echo "📥 Instalando dependências..."
pip install -r requirements.txt

# Iniciar serviço
echo "✅ Iniciando servidor Flask..."
echo "   Serviço disponível em: http://localhost:5002"
echo "   (Porta 5002 para evitar conflito com AirPlay no macOS)"
echo ""

python app.py

