#!/usr/bin/env python3
"""
Calibra coordenadas detectando bolhas reais na imagem e comparando com template
"""

import cv2
import numpy as np
from PIL import Image
import requests
import json

print("=" * 80)
print("🎯 CALIBRAÇÃO POR DETECÇÃO REAL DE BOLHAS")
print("=" * 80)
print()

# Carregar gabarito real
with open('/tmp/gabarito_imagem_aluno1.json', 'r') as f:
    gabarito_real = json.load(f)

print("💡 Estratégia:")
print("  1. Converter primeira página do PDF para imagem")
print("  2. Usar OpenCV para detectar TODAS as bolhas (HoughCircles)")
print("  3. Para questões conhecidas (Q1=B, Q2=A, etc), encontrar onde está a bolha B de Q1")
print("  4. Calcular offset entre posição detectada vs posição esperada")
print("  5. Ajustar template")
print()

# Por enquanto, vamos usar uma abordagem mais simples:
# Analisar os erros sistemáticos e tentar um ajuste baseado na moda dos deslocamentos

print("📊 Análise Estatística dos Erros:")
print()

# Carregar respostas do OMR
with open('/tmp/respostas_teste3.json', 'r') as f:
    omr_detectado = json.load(f)

opcoes = ["A", "B", "C", "D", "E"]
deslocamentos = []

for q in range(1, 91):
    q_key = str(q)
    real = gabarito_real.get(q_key, "").upper()
    omr = omr_detectado.get(q_key, "").upper()
    
    if real and omr and real != omr:
        try:
            idx_real = opcoes.index(real)
            idx_omr = opcoes.index(omr)
            deslocamento = idx_omr - idx_real
            deslocamentos.append(deslocamento)
        except:
            pass

if deslocamentos:
    from collections import Counter
    contador = Counter(deslocamentos)
    moda = contador.most_common(1)[0]
    
    print(f"  Moda dos deslocamentos: {moda[0]} opções ({moda[1]} ocorrências, {moda[1]/len(deslocamentos)*100:.1f}%)")
    print()
    
    # Calcular ajuste baseado na moda
    ajuste_pixels = moda[0] * 24
    print(f"💡 Ajuste sugerido: {ajuste_pixels:.0f} pixels ({'direita' if ajuste_pixels > 0 else 'esquerda'})")
    print()
    
    base_x_atual = [23, 198, 373, 548, 723, 898]
    base_x_ajustado = [x - ajuste_pixels for x in base_x_atual]
    
    print(f"🔧 Coordenadas Ajustadas:")
    for i, (atual, ajustado) in enumerate(zip(base_x_atual, base_x_ajustado)):
        print(f"  Coluna {i+1}: {atual:.0f} → {ajustado:.0f}")
    
    # Salvar
    ajustes = {
        "base_x_original": [47, 222, 397, 572, 747, 922],
        "base_x_atual": base_x_atual,
        "base_x_ajustado": [round(x, 1) for x in base_x_ajustado],
        "ajuste_pixels": round(ajuste_pixels, 1),
        "moda_deslocamento": moda[0],
        "confianca": moda[1]/len(deslocamentos)
    }
    
    with open('/tmp/ajustes_finais.json', 'w') as f:
        json.dump(ajustes, f, indent=2)
    
    print()
    print(f"✅ Ajustes salvos. Confiança: {ajustes['confianca']*100:.1f}%")

