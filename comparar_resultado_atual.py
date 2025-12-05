#!/usr/bin/env python3
"""
Compara gabaritos usando template v5.0 (300 DPI)
Processa gabarito_pintado.png e compara com gabarito esperado
"""

import requests
import sys

# Gabarito REAL pintado em gabarito_pintado.png (300 DPI)
# Extraído via análise de intensidade de pixels (OpenCV)
gabarito_real = {
    "1": "A", "2": "E", "3": "A", "4": "E", "5": "A",
    "6": "E", "7": "A", "8": "E", "9": "A", "10": "E",
    "11": "A", "12": "E", "13": "A", "14": "E", "15": "A",
    
    "16": "C", "17": "C", "18": "C", "19": "E", "20": "A",
    "21": "E", "22": "A", "23": "E", "24": "A", "25": "E",
    "26": "A", "27": "E", "28": "A", "29": "E", "30": "A",
    
    "31": "E", "32": "A", "33": "E", "34": "A", "35": "E",
    "36": "A", "37": "E", "38": "A", "39": "E", "40": "A",
    "41": "E", "42": "A", "43": "E", "44": "A", "45": "E",
    
    "46": "A", "47": "E", "48": "A", "49": "E", "50": "A",
    "51": "A", "52": "E", "53": "A", "54": "E", "55": "A",
    "56": "E", "57": "A", "58": "E", "59": "A", "60": "E",
    
    "61": "A", "62": "E", "63": "A", "64": "E", "65": "A",
    "66": "E", "67": "A", "68": "E", "69": "A", "70": "E",
    "71": "A", "72": "E", "73": "A", "74": "E", "75": "A",
    
    "76": "A", "77": "E", "78": "A", "79": "E", "80": "A",
    "81": "E", "82": "A", "83": "E", "84": "A", "85": "E",
    "86": "A", "87": "E", "88": "A", "89": "E", "90": "A"
}

# Processar gabarito via API (usa template v5.0 por padrão)
try:
    with open('attached_assets/gabarito_pintado.png', 'rb') as f:
        response = requests.post(
            'http://localhost:5002/api/process-image',
            files={'image': ('gabarito.png', f, 'image/png')},
            timeout=30
        )
    
    if response.status_code != 200:
        print(f"❌ Erro na API: {response.status_code}")
        sys.exit(1)
    
    data = response.json()
    gabarito_detectado = data['pagina']['resultado']['questoes']
    template_usado = data['pagina']['template']
    metodo = data['pagina'].get('detection_method', 'OpenCV')
    
except Exception as e:
    print(f"❌ Erro ao processar: {e}")
    sys.exit(1)

print("=" * 80)
print(f"ANÁLISE DE ACURÁCIA - {template_usado.upper()} (300 DPI)")
print(f"Método: {metodo}")
print("=" * 80)
print()

# Comparação detalhada
acertos = 0
erros = 0
erros_detalhados = []

for q in range(1, 91):
    q_str = str(q)
    real = gabarito_real[q_str]
    detectado = gabarito_detectado[q_str]
    
    if real == detectado:
        acertos += 1
    else:
        erros += 1
        erros_detalhados.append({
            "questao": q,
            "real": real,
            "detectado": detectado,
            "erro": f"{real}→{detectado}"
        })

acuracia = (acertos / 90) * 100
print(f"📊 RESULTADO GERAL:")
print(f"   Template: {template_usado}")
print(f"   Método: {metodo}")
print(f"   Acertos: {acertos}/90")
print(f"   Erros: {erros}/90")
print(f"   Acurácia: {acuracia:.1f}%")
print()

if acuracia >= 95:
    print("🎉 EXCELENTE! Sistema funcionando perfeitamente!")
elif acuracia >= 80:
    print("✅ BOM! Pequenos ajustes podem melhorar")
elif acuracia >= 50:
    print("⚠️  MÉDIO. Necessita calibração adicional")
else:
    print("❌ BAIXO. Verificar template ou resolução da imagem")
print()

if erros > 0:
    print(f"❌ ERROS DETALHADOS ({erros} questões):")
    print()
    
    # Agrupar por coluna
    for col in range(6):
        col_errors = [e for e in erros_detalhados if (e["questao"]-1) // 15 == col]
        if col_errors:
            inicio = col * 15 + 1
            fim = (col + 1) * 15
            print(f"   Coluna {col+1} (Q{inicio:02d}-Q{fim:02d}):")
            for e in col_errors:
                print(f"      Q{e['questao']:02d}: Real={e['real']} | Detectado={e['detectado']} | Erro: {e['erro']}")
            print()
    
    # Análise de padrões de erro
    print("📈 PADRÕES DE ERRO:")
    from collections import Counter
    padroes = Counter([e["erro"] for e in erros_detalhados])
    for padrao, count in padroes.most_common(10):
        print(f"   {padrao}: {count}x")
    print()
    
    # Análise de deslocamento
    deslocamentos = []
    opcoes = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4}
    for e in erros_detalhados:
        if e["real"] in opcoes and e["detectado"] in opcoes:
            desl = opcoes[e["detectado"]] - opcoes[e["real"]]
            deslocamentos.append(desl)
    
    if deslocamentos:
        desl_medio = sum(deslocamentos) / len(deslocamentos)
        print(f"📏 DESLOCAMENTO MÉDIO: {desl_medio:.2f} posições")
        print(f"   (positivo = lendo à direita, negativo = lendo à esquerda)")
        
        # Contar deslocamentos
        from collections import Counter
        desl_counter = Counter(deslocamentos)
        print(f"   Distribuição:")
        for desl, count in sorted(desl_counter.items()):
            sinal = "+" if desl > 0 else ""
            print(f"      {sinal}{desl}: {count}x")

print()
print("=" * 80)
