#!/bin/bash

# Script de teste para debug OMR
# Usa arquivos reais do projeto

PYTHON_OMR_URL="http://localhost:5002"
TEST_IMAGE="attached_assets/modelo_gabarito.png"

echo "🔍 TESTE DE DEBUG OMR"
echo "===================="
echo ""

# 1. Verificar se serviço está rodando
echo "1️⃣ Verificando saúde do serviço..."
curl -s "$PYTHON_OMR_URL/health" | jq .
echo ""

# 2. Verificar se arquivo existe
if [ ! -f "$TEST_IMAGE" ]; then
    echo "❌ Arquivo de teste não encontrado: $TEST_IMAGE"
    echo "📋 Arquivos disponíveis:"
    ls -1 attached_assets/*.png attached_assets/*.pdf 2>/dev/null | head -5
    exit 1
fi

echo "2️⃣ Testando debug visual com: $TEST_IMAGE"
echo ""

# 3. Testar endpoint de debug visual
RESPONSE=$(curl -s -X POST "$PYTHON_OMR_URL/api/debug/visual?template=enem90" \
  -F "image=@$TEST_IMAGE")

# Verificar se houve erro
if echo "$RESPONSE" | jq -e '.status == "erro"' > /dev/null 2>&1; then
    echo "❌ ERRO no processamento:"
    echo "$RESPONSE" | jq .
    exit 1
fi

# Extrair informações
STATUS=$(echo "$RESPONSE" | jq -r '.status')
TEMPLATE=$(echo "$RESPONSE" | jq -r '.template')
ANSWERS_COUNT=$(echo "$RESPONSE" | jq '.answers | length')
MARKED_COUNT=$(echo "$RESPONSE" | jq '[.answers[] | select(. != "Não respondeu")] | length')
HAS_DEBUG_IMAGE=$(echo "$RESPONSE" | jq -r '.debug_image != null')

echo "✅ Status: $STATUS"
echo "📋 Template: $TEMPLATE"
echo "📊 Total de questões: $ANSWERS_COUNT"
echo "✅ Respostas marcadas: $MARKED_COUNT"
echo "🖼️  Imagem de debug: $([ "$HAS_DEBUG_IMAGE" = "true" ] && echo "Sim" || echo "Não")"
echo ""

# 4. Salvar imagem de debug se disponível
if [ "$HAS_DEBUG_IMAGE" = "true" ]; then
    DEBUG_IMAGE_FILE="debug_output_$(date +%s).png"
    echo "$RESPONSE" | jq -r '.debug_image' | base64 -d > "$DEBUG_IMAGE_FILE"
    echo "💾 Imagem de debug salva em: $DEBUG_IMAGE_FILE"
    echo ""
fi

# 5. Mostrar primeiras 10 respostas
echo "📝 Primeiras 10 respostas detectadas:"
echo "$RESPONSE" | jq '.answers | to_entries | .[0:10] | from_entries'
echo ""

# 6. Estatísticas
echo "📈 Estatísticas:"
TOTAL=$(echo "$RESPONSE" | jq '.answers | length')
MARKED=$(echo "$RESPONSE" | jq '[.answers[] | select(. != "Não respondeu")] | length')
PERCENTAGE=$(echo "scale=1; $MARKED * 100 / $TOTAL" | bc)
echo "  - Total: $TOTAL questões"
echo "  - Marcadas: $MARKED questões"
echo "  - Taxa de detecção: ${PERCENTAGE}%"
echo ""

echo "✅ Teste concluído!"
echo ""
echo "📋 Para ver logs detalhados:"
echo "   tail -f /tmp/python_omr_service.log | grep '\[DEBUG\]'"

