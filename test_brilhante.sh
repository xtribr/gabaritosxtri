#!/bin/bash

# Script simples para testar validação ChatGPT com gabarito brilhante

IMAGEM="${1:-attached_assets/modelo_gabarito.png}"
API_KEY="YOUR_OPENAI_API_KEY_HERE"

echo "================================================================================"
echo "🎯 Testando Gabarito Brilhante com ChatGPT"
echo "================================================================================"
echo "📁 Imagem: $IMAGEM"
echo ""

if [ ! -f "$IMAGEM" ]; then
    echo "❌ Arquivo não encontrado: $IMAGEM"
    echo ""
    echo "📂 Use: ./test_brilhante.sh <caminho/imagem.png>"
    echo ""
    echo "💡 Dica: Salve a imagem do gabarito e execute:"
    echo "   ./test_brilhante.sh ~/Downloads/gabarito_brilhante.png"
    exit 1
fi

echo "🔄 Processando..."
echo ""

curl -s -X POST http://localhost:5002/api/validate-with-chatgpt \
  -F "image=@$IMAGEM" \
  -F "template=enem90" \
  -F "openai_api_key=$API_KEY" | python3 -c "
import sys, json

data = json.load(sys.stdin)

if data.get('status') != 'sucesso':
    print('❌ Erro:', data.get('mensagem', 'Unknown'))
    sys.exit(1)

stats = data['statistics']
corrections = data.get('corrections', [])

print('===============================================================================')
print('✅ RESULTADO DA VALIDAÇÃO')
print('===============================================================================')
print('')
print(f\"📊 Total de questões: {stats['total_questions']}\")
print(f\"🤝 Concordância OMR↔ChatGPT: {stats['agreement_rate']:.1f}%\")
print(f\"🔧 Correções aplicadas: {stats['corrections_count']}\")
print('')

if corrections:
    print('🔍 Correções realizadas:')
    print('')
    for i, corr in enumerate(corrections[:15], 1):
        q = corr['q']
        omr = corr['omr']
        gpt = corr['corrected']
        reason = corr.get('reason', 'N/A')
        print(f'   {i}. Q{q}: {omr} → {gpt}')
        print(f'      💬 {reason}')
        print('')
    
    if len(corrections) > 15:
        print(f'   ... e mais {len(corrections) - 15} correções')
        print('')
else:
    print('✓ Nenhuma correção necessária - OMR e ChatGPT concordam 100%')
    print('')

print('===============================================================================')
print('💰 Custo estimado: ~\$0.05')
print('⏱️  Tempo de processamento: ~8s')
print('===============================================================================')
"
