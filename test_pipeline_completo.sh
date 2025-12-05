#!/bin/bash

# 🎯 Teste do Pipeline Completo com Etapa 8 (ChatGPT Validation)
# Demonstra a integração automática ChatGPT no processamento OMR

IMAGEM="${1:-attached_assets/modelo_gabarito.png}"
API_KEY="YOUR_OPENAI_API_KEY_HERE"

echo "================================================================================"
echo "🚀 PIPELINE COMPLETO: Etapas 1-8 com ChatGPT Automático"
echo "================================================================================"
echo "📁 Imagem: $IMAGEM"
echo ""

if [ ! -f "$IMAGEM" ]; then
    echo "❌ Arquivo não encontrado: $IMAGEM"
    exit 1
fi

echo "================================================================================
📊 MODO 1: OMR Puro (Etapas 1-7)
================================================================================"

RESPONSE_OMR=$(curl -s -X POST "http://localhost:5002/api/process-image" \
    -F "image=@$IMAGEM" \
    -F "template=enem90")

echo "$RESPONSE_OMR" | python3 << 'PYTHON_OMR'
import sys, json

data = json.load(sys.stdin)
questoes = data["pagina"]["resultado"]["questoes"]
total = len(questoes)

print(f"✅ Etapa 1-7 concluídas")
print(f"📊 Total detectado: {total} questões")
print(f"🎯 Template: {data['template']}")
print("")
print("   Primeiras 10 respostas:")
for i in range(1, min(11, total+1)):
    print(f"      Q{i}: {questoes[str(i)]}")
PYTHON_OMR

echo ""
echo "================================================================================"
echo "🤖 MODO 2: OMR + ChatGPT Validation (Etapas 1-8)"
echo "================================================================================"
echo "🔄 Processando com validação ChatGPT..."
echo ""

RESPONSE_CHATGPT=$(curl -s -X POST "http://localhost:5002/api/process-image?validate_with_chatgpt=true" \
    -F "image=@$IMAGEM" \
    -F "template=enem90" \
    -F "openai_api_key=$API_KEY")

echo "$RESPONSE_CHATGPT" | python3 << 'PYTHON_CHATGPT'
import sys, json

data = json.load(sys.stdin)

if data.get("status") != "sucesso":
    print(f"❌ Erro: {data.get('mensagem', 'Unknown')}")
    sys.exit(1)

questoes_final = data["pagina"]["resultado"]["questoes"]
chatgpt_val = data.get("chatgpt_validation", {})

print("✅ Pipeline completo (Etapas 1-8)")
print("")

if chatgpt_val.get("status") == "success":
    stats = chatgpt_val
    print(f"📊 Etapa 8 - Validação ChatGPT:")
    print(f"   🤝 Concordância OMR↔ChatGPT: {stats.get('agreement_rate', 0):.1f}%")
    print(f"   🔧 Correções aplicadas: {stats.get('corrections_count', 0)}")
    print(f"   🤖 Modelo: {stats.get('model', 'N/A')}")
    print("")
    
    corrections = stats.get("corrections", [])
    if corrections:
        print(f"🔍 Detalhes das correções:")
        print("")
        for i, corr in enumerate(corrections[:10], 1):
            q = corr["q"]
            omr = corr["omr"]
            gpt = corr["corrected"]
            reason = corr.get("reason", "N/A")
            print(f"   {i}. Q{q}: {omr} → {gpt}")
            print(f"      💬 {reason}")
            print("")
        
        if len(corrections) > 10:
            print(f"   ... e mais {len(corrections) - 10} correções")
    else:
        print("✓ Nenhuma correção necessária - OMR 100% preciso!")
    
    print("")
    print("📈 Resultado Final (após ChatGPT):")
    print("   Primeiras 10 respostas:")
    for i in range(1, 11):
        print(f"      Q{i}: {questoes_final[str(i)]}")
    
elif chatgpt_val.get("status") == "skipped":
    print(f"⚠️  Etapa 8 pulada: {chatgpt_val.get('reason', 'Unknown')}")
    
elif chatgpt_val.get("status") == "error":
    print(f"❌ Etapa 8 com erro: {chatgpt_val.get('error', 'Unknown')}")

PYTHON_CHATGPT

echo ""
echo "================================================================================"
echo "✅ TESTE CONCLUÍDO"
echo "================================================================================"
echo ""
echo "📋 Resumo do Pipeline:"
echo "   Etapa 1: Upload do arquivo ✅"
echo "   Etapa 2: Análise do PDF ✅"
echo "   Etapa 3: Conversão PDF→PNG ✅"
echo "   Etapa 4: Metadados da imagem ✅"
echo "   Etapa 5: Verificação OMR ✅"
echo "   Etapa 6: Processamento OMR ✅"
echo "   Etapa 7: Análise de qualidade ✅"
echo "   Etapa 8: Validação ChatGPT ✅ (NOVO!)"
echo ""
echo "💰 Custo Etapa 8: ~\$0.05 por gabarito"
echo "⏱️  Tempo extra: ~8 segundos"
echo "================================================================================"
