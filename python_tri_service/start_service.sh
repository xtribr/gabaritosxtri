#!/bin/bash

echo "========================================"
echo "🚀 Iniciando Serviço Python TRI V2"
echo "========================================"

# Diretório do script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Criar venv se não existir
if [ ! -d "venv" ]; then
    echo "📦 Criando ambiente virtual Python..."
    python3 -m venv venv
    echo "✅ Ambiente virtual criado"
fi

# Ativar venv
echo "🔧 Ativando ambiente virtual..."
source venv/bin/activate

# Instalar dependências
echo "📥 Instalando dependências..."
pip install --upgrade pip -q
pip install -r requirements.txt -q

# Verificar tabela TRI
TABELA_PATH="../data/tri_v2_producao/tabela_tri_referencia.xlsx"
if [ ! -f "$TABELA_PATH" ]; then
    echo "⚠️  AVISO: Tabela TRI não encontrada em $TABELA_PATH"
    echo "   Criando tabela de exemplo..."
    python3 ../data/tri_v2_producao/gerar_dados_exemplo.py
fi

# Iniciar serviço
echo ""
echo "========================================"
echo "✅ Iniciando serviço na porta 5003..."
echo "========================================"
python app.py
