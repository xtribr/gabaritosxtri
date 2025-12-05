#!/bin/bash

# 🎯 Teste com o gabarito "brilhante" anexado pelo usuário
# Este script testa tanto OMR quanto ChatGPT validation

IMAGEM="$1"
API_KEY="YOUR_OPENAI_API_KEY_HERE"

# Validar se imagem foi fornecida
if [ -z "$IMAGEM" ]; then
    echo "❌ Uso: $0 <caminho_imagem.png>"
    echo ""
    echo "📂 Imagens disponíveis:"
    ls -lh *.png 2>/dev/null | awk '{print "   - " $9 " (" $5 ")"}'
    find attached_assets/ -name "*.png" 2>/dev/null | head -5 | awk '{print "   - " $0}'
    exit 1
fi

# Validar se arquivo existe
if [ ! -f "$IMAGEM" ]; then
    echo "❌ Arquivo não encontrado: $IMAGEM"
    exit 1
fi

echo "================================================================================"
echo "🎯 TESTE COMPLETO - Gabarito Brilhante"
echo "================================================================================"
echo "📁 Imagem: $IMAGEM"
echo "📊 Template: ENEM 90 questões"
echo ""

# Gabarito real (baseado na imagem anexada - todas as bolhas PRETAS)
GABARITO_REAL='{
    "1":"A","2":"E","3":"A","4":"E","5":"A","6":"E","7":"A","8":"E","9":"A","10":"E",
    "11":"A","12":"E","13":"A","14":"E","15":"A","16":"C","17":"C","18":"C","19":"D","20":"A",
    "21":"D","22":"A","23":"D","24":"A","25":"D","26":"A","27":"D","28":"A","29":"D","30":"A",
    "31":"A","32":"A","33":"D","34":"A","35":"D","36":"A","37":"D","38":"A","39":"D","40":"A",
    "41":"D","42":"A","43":"D","44":"A","45":"D","46":"A","47":"E","48":"A","49":"E","50":"A",
    "51":"E","52":"E","53":"A","54":"E","55":"A","56":"E","57":"A","58":"E","59":"A","60":"D",
    "61":"A","62":"E","63":"A","64":"E","65":"A","66":"E","67":"E","68":"E","69":"A","70":"E",
    "71":"A","72":"E","73":"E","74":"E","75":"A","76":"A","77":"E","78":"A","79":"E","80":"A",
    "81":"E","82":"E","83":"E","84":"E","85":"E","86":"E","87":"E","88":"E","89":"E","90":"E"
}'

echo "================================================================================
📊 TESTE 1: OMR Puro (sem ChatGPT)
================================================================================"

RESPONSE_OMR=$(curl -s -X POST http://localhost:5002/api/process-image \
    -F "image=@$IMAGEM" \
    -F "template=enem90")

if [ $? -ne 0 ]; then
    echo "❌ Erro ao chamar API OMR"
    exit 1
fi

# Extrair e calcular acurácia OMR
echo "$RESPONSE_OMR" | python3 << 'PYTHON_END'
import sys, json

try:
    data = json.load(sys.stdin)
    questoes_omr = data["pagina"]["resultado"]["questoes"]
    
    gabarito_real = {
        "1":"A","2":"E","3":"A","4":"E","5":"A","6":"E","7":"A","8":"E","9":"A","10":"E",
        "11":"A","12":"E","13":"A","14":"E","15":"A","16":"C","17":"C","18":"C","19":"D","20":"A",
        "21":"D","22":"A","23":"D","24":"A","25":"D","26":"A","27":"D","28":"A","29":"D","30":"A",
        "31":"A","32":"A","33":"D","34":"A","35":"D","36":"A","37":"D","38":"A","39":"D","40":"A",
        "41":"D","42":"A","43":"D","44":"A","45":"D","46":"A","47":"E","48":"A","49":"E","50":"A",
        "51":"E","52":"E","53":"A","54":"E","55":"A","56":"E","57":"A","58":"E","59":"A","60":"D",
        "61":"A","62":"E","63":"A","64":"E","65":"A","66":"E","67":"E","68":"E","69":"A","70":"E",
        "71":"A","72":"E","73":"E","74":"E","75":"A","76":"A","77":"E","78":"A","79":"E","80":"A",
        "81":"E","82":"E","83":"E","84":"E","85":"E","86":"E","87":"E","88":"E","89":"E","90":"E"
    }
    
    acertos = sum(1 for i in range(1, 91) if questoes_omr[str(i)] == gabarito_real[str(i)])
    
    print(f"   📈 Acurácia OMR: {acertos}/90 ({acertos/90*100:.1f}%)")
    print(f"   ❌ Erros: {90-acertos}")
    
    # Mostrar primeiros 5 erros
    erros = [(i, gabarito_real[str(i)], questoes_omr[str(i)]) 
             for i in range(1, 91) 
             if questoes_omr[str(i)] != gabarito_real[str(i)]]
    
    if erros:
        print(f"\n   🔍 Primeiros erros:")
        for q, real, detectado in erros[:5]:
            print(f"      Q{q}: Real={real}, OMR detectou={detectado}")
    
except Exception as e:
    print(f"❌ Erro ao processar OMR: {e}")
    sys.exit(1)
PYTHON_END

echo ""
echo "================================================================================"
echo "🤖 TESTE 2: OMR + ChatGPT Validation"
echo "================================================================================"

RESPONSE_GPT=$(curl -s -X POST http://localhost:5002/api/validate-with-chatgpt \
    -F "image=@$IMAGEM" \
    -F "template=enem90" \
    -F "openai_api_key=$API_KEY")

if [ $? -ne 0 ]; then
    echo "❌ Erro ao chamar API ChatGPT"
    exit 1
fi

# Analisar resultado ChatGPT
echo "$RESPONSE_GPT" | python3 << 'PYTHON_END'
import sys, json

try:
    data = json.load(sys.stdin)
    
    if data.get("status") != "sucesso":
        print(f"❌ ChatGPT retornou erro: {data.get('mensagem', 'Unknown')}")
        sys.exit(1)
    
    omr_original = data["omr_original"]
    chatgpt_validated = data["chatgpt_validated"]
    corrections = data["corrections"]
    stats = data["statistics"]
    
    gabarito_real = {
        "1":"A","2":"E","3":"A","4":"E","5":"A","6":"E","7":"A","8":"E","9":"A","10":"E",
        "11":"A","12":"E","13":"A","14":"E","15":"A","16":"C","17":"C","18":"C","19":"D","20":"A",
        "21":"D","22":"A","23":"D","24":"A","25":"D","26":"A","27":"D","28":"A","29":"D","30":"A",
        "31":"A","32":"A","33":"D","34":"A","35":"D","36":"A","37":"D","38":"A","39":"D","40":"A",
        "41":"D","42":"A","43":"D","44":"A","45":"D","46":"A","47":"E","48":"A","49":"E","50":"A",
        "51":"E","52":"E","53":"A","54":"E","55":"A","56":"E","57":"A","58":"E","59":"A","60":"D",
        "61":"A","62":"E","63":"A","64":"E","65":"A","66":"E","67":"E","68":"E","69":"A","70":"E",
        "71":"A","72":"E","73":"E","74":"E","75":"A","76":"A","77":"E","78":"A","79":"E","80":"A",
        "81":"E","82":"E","83":"E","84":"E","85":"E","86":"E","87":"E","88":"E","89":"E","90":"E"
    }
    
    # Calcular acurácia pós-ChatGPT
    acertos_gpt = sum(1 for i in range(1, 91) if chatgpt_validated[str(i)] == gabarito_real[str(i)])
    acertos_omr = sum(1 for i in range(1, 91) if omr_original[str(i)] == gabarito_real[str(i)])
    
    print(f"   📊 Concordância OMR↔ChatGPT: {stats['agreement_rate']:.1f}%")
    print(f"   🔧 Correções aplicadas: {stats['corrections_count']}")
    print(f"   📈 Acurácia OMR original: {acertos_omr}/90 ({acertos_omr/90*100:.1f}%)")
    print(f"   ✨ Acurácia pós-ChatGPT: {acertos_gpt}/90 ({acertos_gpt/90*100:.1f}%)")
    
    if acertos_gpt > acertos_omr:
        print(f"   🎯 Melhoria: +{acertos_gpt - acertos_omr} questões ({(acertos_gpt-acertos_omr)/90*100:.1f}%)")
    elif acertos_gpt < acertos_omr:
        print(f"   ⚠️  ChatGPT piorou: -{acertos_omr - acertos_gpt} questões")
    else:
        print(f"   ✓ Nenhuma melhoria (ambos com mesma acurácia)")
    
    # Mostrar correções úteis vs prejudiciais
    if corrections:
        print(f"\n   🔍 Análise das {len(corrections)} correções:")
        
        correcoes_uteis = 0
        correcoes_ruins = 0
        
        for corr in corrections[:10]:  # Primeiras 10
            q = str(corr["q"])
            omr_val = corr["omr"]
            gpt_val = corr["corrected"]
            real_val = gabarito_real[q]
            
            if gpt_val == real_val and omr_val != real_val:
                correcoes_uteis += 1
                print(f"      ✅ Q{q}: {omr_val}→{gpt_val} (correto!)")
            elif gpt_val != real_val and omr_val == real_val:
                correcoes_ruins += 1
                print(f"      ❌ Q{q}: {omr_val}→{gpt_val} (piorou! real={real_val})")
            else:
                print(f"      ⚪ Q{q}: {omr_val}→{gpt_val} (ambos errados, real={real_val})")
        
        print(f"\n   📈 Correções úteis: {correcoes_uteis}")
        print(f"   📉 Correções ruins: {correcoes_ruins}")

except json.JSONDecodeError as e:
    print(f"❌ Erro ao decodificar JSON: {e}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Erro ao processar ChatGPT: {e}")
    sys.exit(1)
PYTHON_END

echo ""
echo "================================================================================"
echo "✅ TESTE CONCLUÍDO"
echo "================================================================================"
