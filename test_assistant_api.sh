#!/bin/bash

# Script de teste para a rota /api/analise-enem-tri
# Testa a integração com Assistant API da OpenAI

echo "🧪 Testando rota /api/analise-enem-tri"
echo ""

# Verificar se o servidor está rodando
if ! curl -s http://localhost:8080 > /dev/null; then
    echo "❌ Servidor não está rodando em http://localhost:8080"
    echo "   Execute: npm run dev"
    exit 1
fi

echo "✅ Servidor está rodando"
echo ""

# Verificar se OPENAI_API_KEY está configurada
if [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  OPENAI_API_KEY não está configurada"
    echo "   Configure: export OPENAI_API_KEY='sua-chave-aqui'"
    echo ""
    echo "📝 Continuando o teste mesmo assim (pode falhar)..."
    echo ""
fi

# Dados de exemplo do aluno
echo "📊 Enviando dados de teste..."
echo ""

RESPONSE=$(curl -s -X POST http://localhost:8080/api/analise-enem-tri \
  -H "Content-Type: application/json" \
  -d '{
    "nomeAluno": "João Silva",
    "matricula": "2024001",
    "turma": "3º A",
    "serie": "3º Ano",
    "anoProva": 2023,
    "respostasAluno": ["A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B", "C", "D", "A", "B"],
    "acertos": 35,
    "erros": 10,
    "nota": 650.5,
    "triGeral": 650.5,
    "triLc": 620.3,
    "triCh": 640.2,
    "triCn": 660.1,
    "triMt": 680.9,
    "infoExtra": {
      "contexto": "Aluno do ensino médio público",
      "objetivo": "Medicina"
    }
  }')

# Verificar status HTTP
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/analise-enem-tri \
  -H "Content-Type: application/json" \
  -d '{
    "nomeAluno": "João Silva",
    "anoProva": 2023,
    "respostasAluno": ["A", "B", "C"],
    "tri": 650.5
  }')

echo "📥 Resposta recebida (HTTP $HTTP_CODE):"
echo ""

# Formatar JSON se possível
if command -v jq &> /dev/null; then
    echo "$RESPONSE" | jq .
else
    echo "$RESPONSE"
fi

echo ""
echo ""

# Verificar se foi sucesso
if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ Teste bem-sucedido!"
    
    # Extrair análise se possível
    if command -v jq &> /dev/null; then
        ANALISE=$(echo "$RESPONSE" | jq -r '.analise // empty')
        if [ -n "$ANALISE" ]; then
            echo ""
            echo "📝 Análise recebida:"
            echo "$ANALISE" | head -20
            echo "..."
        fi
    fi
else
    echo "❌ Teste falhou com código HTTP $HTTP_CODE"
    echo ""
    echo "💡 Verifique:"
    echo "   - Servidor está rodando?"
    echo "   - OPENAI_API_KEY está configurada?"
    echo "   - OPENAI_ASSISTANT_ID está correto?"
fi

