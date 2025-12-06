#!/bin/bash

echo "=========================================="
echo "🚀 INICIANDO TODOS OS SERVIÇOS LOCALHOST"
echo "=========================================="

# Diretório base
BASE_DIR="/Users/xandao/Desktop/OCR XTRI GABARITO/gabaritosxtri"
cd "$BASE_DIR"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para verificar se porta está em uso
check_port() {
    lsof -i :$1 >/dev/null 2>&1
}

# Função para matar processo na porta
kill_port() {
    if check_port $1; then
        echo -e "${YELLOW}⚠️  Porta $1 ocupada, matando processo...${NC}"
        lsof -ti :$1 | xargs kill -9 2>/dev/null
        sleep 1
    fi
}

echo ""
echo "📌 PASSO 1: Limpando processos antigos..."
echo "=========================================="

# Matar processos TypeScript/Node
pkill -9 -f "tsx.*server/index.ts" 2>/dev/null
pkill -9 -f "node.*vite" 2>/dev/null

# Matar processos Python (mantendo apenas os que queremos reiniciar)
pkill -9 -f "python.*python_omr_service.*app.py" 2>/dev/null
pkill -9 -f "python.*python_tri_service.*app.py" 2>/dev/null

# Garantir que portas estão livres
kill_port 8080
kill_port 5173
kill_port 5002
kill_port 5003

echo -e "${GREEN}✅ Processos antigos limpos${NC}"
sleep 2

echo ""
echo "📌 PASSO 2: Iniciando Python OMR Service (porta 5002)..."
echo "=========================================="

cd "$BASE_DIR/python_omr_service"

# Criar venv se não existir
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Criando ambiente virtual Python OMR...${NC}"
    python3 -m venv venv
fi

# Ativar venv e instalar dependências
source venv/bin/activate
pip install -q -r requirements.txt

# Iniciar serviço OMR em background
nohup python app.py > /tmp/omr_service.log 2>&1 &
OMR_PID=$!

echo -e "${BLUE}PID OMR: $OMR_PID${NC}"
sleep 3

# Verificar se iniciou
if check_port 5002; then
    echo -e "${GREEN}✅ OMR Service rodando na porta 5002${NC}"
else
    echo -e "${RED}❌ ERRO: OMR Service não iniciou!${NC}"
    echo "Verifique logs: tail -f /tmp/omr_service.log"
    exit 1
fi

deactivate

echo ""
echo "📌 PASSO 3: Iniciando Python TRI V2 Service (porta 5003)..."
echo "=========================================="

cd "$BASE_DIR/python_tri_service"

# Criar venv se não existir
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Criando ambiente virtual Python TRI...${NC}"
    python3 -m venv venv
fi

# Ativar venv e instalar dependências
source venv/bin/activate
pip install -q -r requirements.txt

# Iniciar serviço TRI em background
nohup python app.py > /tmp/tri_service.log 2>&1 &
TRI_PID=$!

echo -e "${BLUE}PID TRI: $TRI_PID${NC}"
sleep 3

# Verificar se iniciou
if check_port 5003; then
    echo -e "${GREEN}✅ TRI V2 Service rodando na porta 5003${NC}"
else
    echo -e "${RED}❌ ERRO: TRI V2 Service não iniciou!${NC}"
    echo "Verifique logs: tail -f /tmp/tri_service.log"
    exit 1
fi

deactivate

echo ""
echo "📌 PASSO 4: Iniciando Express Backend + Frontend (porta 8080 + 5173)..."
echo "=========================================="

cd "$BASE_DIR"

# Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Instalando dependências npm...${NC}"
    npm install
fi

# Iniciar servidor em foreground (para ver logs)
echo -e "${GREEN}Iniciando npm run dev...${NC}"
echo ""
npm run dev

echo ""
echo "=========================================="
echo -e "${RED}⚠️  Serviços foram interrompidos${NC}"
echo "=========================================="
echo ""
echo "🛑 Matando processos Python em background..."
kill -9 $OMR_PID $TRI_PID 2>/dev/null

echo ""
echo "Para reiniciar, execute novamente: ./start_all_services.sh"
echo ""
