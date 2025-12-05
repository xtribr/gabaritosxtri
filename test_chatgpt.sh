#!/bin/bash
# Script de teste para validação ChatGPT
# Uso: ./test_chatgpt.sh [caminho_imagem]

IMAGE_PATH="${1:-attached_assets/modelo_gabarito.png}"
OPENAI_KEY="YOUR_OPENAI_API_KEY_HERE"

echo "🚀 Testando validação ChatGPT..."
echo "📁 Imagem: $IMAGE_PATH"
echo ""

curl -X POST http://localhost:5002/api/validate-with-chatgpt \
  -F "image=@$IMAGE_PATH" \
  -F "template=enem90" \
  -F "openai_api_key=$OPENAI_KEY" \
  | python3 -c "
import sys, json

try:
    data = json.load(sys.stdin)
    
    if data.get('status') == 'erro':
        print('❌ Erro:', data.get('mensagem'))
        sys.exit(1)
    
    stats = data.get('statistics', {})
    corrections = data.get('corrections', [])
    
    print('='*80)
    print('✅ VALIDAÇÃO CHATGPT CONCLUÍDA')
    print('='*80)
    print('')
    print('📊 ESTATÍSTICAS:')
    print(f\"   Total de questões: {stats.get('total_questions')}\")
    print(f\"   Concordância OMR↔ChatGPT: {stats.get('agreement_rate')}%\")
    print(f\"   Correções aplicadas: {stats.get('corrections_count')}\")
    print('')
    
    if corrections:
        print(f'🔧 CORREÇÕES ({len(corrections)}):')
        for c in corrections[:10]:
            q = c['q']
            omr = c['omr']
            corrected = c['corrected']
            print(f'   Q{q}: {omr} → {corrected}')
            if c.get('reason'):
                print(f\"      └─ {c['reason']}\")
    else:
        print('✓ Nenhuma correção necessária - OMR e ChatGPT concordam 100%')
    
    print('='*80)
    
except json.JSONDecodeError as e:
    print('❌ Erro ao decodificar JSON:', e)
    sys.exit(1)
except Exception as e:
    print('❌ Erro:', e)
    sys.exit(1)
"
