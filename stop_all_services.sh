#!/bin/bash

echo "🛑 Parando todos os serviços..."

# Matar processos TypeScript/Node
pkill -9 -f "tsx.*server/index.ts" 2>/dev/null
pkill -9 -f "node.*vite" 2>/dev/null

# Matar processos Python
pkill -9 -f "python.*omr.*app.py" 2>/dev/null
pkill -9 -f "python.*tri.*app.py" 2>/dev/null

# Matar processos nas portas
for port in 8080 5173 5002 5003; do
    if lsof -i :$port >/dev/null 2>&1; then
        echo "  Liberando porta $port..."
        lsof -ti :$port | xargs kill -9 2>/dev/null
    fi
done

echo "✅ Todos os serviços foram parados"
