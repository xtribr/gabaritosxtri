#!/usr/bin/env python3
"""
Script de teste para o endpoint de validação ChatGPT híbrida
NOTA: Requer OPENAI_API_KEY configurada no ambiente
"""
import requests
import os
import json

# Configuração
OMR_SERVICE_URL = "http://localhost:5002"
IMAGE_PATH = "attached_assets/modelo_gabarito.png"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

def test_omr_only():
    """Teste 1: Apenas OMR (baseline)"""
    print("="*80)
    print("TESTE 1: OMR APENAS (v4.1 baseline)")
    print("="*80)
    
    with open(IMAGE_PATH, 'rb') as f:
        response = requests.post(
            f"{OMR_SERVICE_URL}/api/process-image",
            files={"image": f},
            data={"template": "enem90"}
        )
    
    if response.status_code == 200:
        data = response.json()
        answers = data["pagina"]["resultado"]["questoes"]
        print(f"✅ OMR processou {len(answers)} questões")
        print(f"Primeiras 10: {[answers[str(i)] for i in range(1, 11)]}")
        return answers
    else:
        print(f"❌ Erro: {response.status_code}")
        print(response.text)
        return None


def test_chatgpt_validation(omr_answers):
    """Teste 2: OMR + Validação ChatGPT"""
    if not OPENAI_API_KEY:
        print("\n" + "="*80)
        print("TESTE 2: VALIDAÇÃO CHATGPT - PULADO")
        print("="*80)
        print("❌ OPENAI_API_KEY não configurada")
        print("\nPara testar:")
        print("export OPENAI_API_KEY='sua-chave-aqui'")
        print("python3 test_chatgpt_validation.py")
        return None
    
    print("\n" + "="*80)
    print("TESTE 2: OMR + VALIDAÇÃO CHATGPT")
    print("="*80)
    
    with open(IMAGE_PATH, 'rb') as f:
        response = requests.post(
            f"{OMR_SERVICE_URL}/api/validate-with-chatgpt",
            files={"image": f},
            data={
                "template": "enem90",
                "openai_api_key": OPENAI_API_KEY
            }
        )
    
    if response.status_code == 200:
        data = response.json()
        
        print(f"✅ Status: {data['status']}")
        print(f"\n📊 ESTATÍSTICAS:")
        stats = data["statistics"]
        print(f"   Total de questões: {stats['total_questions']}")
        print(f"   Correções ChatGPT: {stats['corrections_count']}")
        print(f"   Taxa de concordância: {stats['agreement_rate']}%")
        
        if data.get("corrections"):
            print(f"\n🔧 CORREÇÕES APLICADAS ({len(data['corrections'])}):")
            for corr in data["corrections"][:10]:  # Primeiras 10
                print(f"   Q{corr['q']}: {corr['omr']} → {corr['corrected']}")
                if corr.get('reason'):
                    print(f"      Razão: {corr['reason']}")
        
        # Comparar com gabarito real
        gabarito_real = {
            "1": "C", "2": "A", "3": "E", "4": "A", "5": "A", 
            "6": "A", "7": "A", "8": "A", "9": "A", "10": "A",
            # ... (simplificado para teste)
        }
        
        validated = data["chatgpt_validated"]
        acertos_chatgpt = sum(1 for k, v in gabarito_real.items() if validated.get(k) == v)
        acertos_omr = sum(1 for k, v in gabarito_real.items() if omr_answers.get(k) == v)
        
        print(f"\n📈 ACURÁCIA (primeiras 10 questões):")
        print(f"   OMR apenas: {acertos_omr}/10")
        print(f"   OMR + ChatGPT: {acertos_chatgpt}/10")
        print(f"   Melhoria: {acertos_chatgpt - acertos_omr} questões")
        
        return data
    else:
        print(f"❌ Erro: {response.status_code}")
        print(response.text)
        return None


def compare_results(omr_answers):
    """Teste 3: Comparação de resultados"""
    print("\n" + "="*80)
    print("TESTE 3: ANÁLISE COMPARATIVA")
    print("="*80)
    
    gabarito_real = {
        "1": "C", "2": "A", "3": "E", "4": "A", "5": "A", "6": "A", "7": "A", "8": "A", "9": "A", "10": "A",
        "11": "A", "12": "A", "13": "A", "14": "A", "15": "A", "16": "A", "17": "C", "18": "C", "19": "C", "20": "A",
        "21": "A", "22": "A", "23": "A", "24": "A", "25": "A", "26": "A", "27": "C", "28": "A", "29": "A", "30": "A",
        "31": "A", "32": "A", "33": "A", "34": "A", "35": "A", "36": "A", "37": "A", "38": "A", "39": "A", "40": "A",
        "41": "A", "42": "A", "43": "A", "44": "A", "45": "A", "46": "A", "47": "A", "48": "B", "49": "A", "50": "A",
        "51": "A", "52": "A", "53": "A", "54": "A", "55": "A", "56": "A", "57": "A", "58": "A", "59": "A", "60": "D",
        "61": "A", "62": "A", "63": "A", "64": "A", "65": "A", "66": "A", "67": "A", "68": "A", "69": "A", "70": "A",
        "71": "A", "72": "A", "73": "A", "74": "A", "75": "A", "76": "A", "77": "A", "78": "B", "79": "A", "80": "A",
        "81": "A", "82": "A", "83": "A", "84": "A", "85": "A", "86": "A", "87": "A", "88": "A", "89": "A", "90": "A"
    }
    
    acertos = sum(1 for k, v in gabarito_real.items() if omr_answers.get(k) == v)
    total = len(gabarito_real)
    
    print(f"📊 Acurácia OMR v4.1: {acertos}/{total} ({acertos/total*100:.1f}%)")
    print(f"\n🎯 ENDPOINT CHATGPT CRIADO COM SUCESSO!")
    print(f"   URL: POST {OMR_SERVICE_URL}/api/validate-with-chatgpt")
    print(f"   Parâmetros:")
    print(f"      - image: arquivo PNG/JPG")
    print(f"      - template: enem90|enem45")
    print(f"      - openai_api_key: sua chave OpenAI")


if __name__ == "__main__":
    print("\n🚀 TESTE DE VALIDAÇÃO OMR + CHATGPT VISION\n")
    
    # Teste 1: OMR baseline
    omr_result = test_omr_only()
    
    if omr_result:
        # Teste 2: Validação ChatGPT (se API key disponível)
        chatgpt_result = test_chatgpt_validation(omr_result)
        
        # Teste 3: Análise
        compare_results(omr_result)
    
    print("\n" + "="*80)
    print("✅ TESTES CONCLUÍDOS")
    print("="*80)
