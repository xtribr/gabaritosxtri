#!/usr/bin/env python3
"""
Calibração visual - usa o gabarito real para encontrar coordenadas corretas
"""

import json
import cv2
import numpy as np
from PIL import Image

# Carregar gabarito real
with open('/tmp/gabarito_imagem_aluno1.json', 'r') as f:
    gabarito_real = json.load(f)

print("=" * 80)
print("🎯 CALIBRAÇÃO VISUAL - USANDO GABARITO REAL")
print("=" * 80)
print()

print("💡 Estratégia:")
print("  1. Sabemos que Q1=B, Q2=A, Q3=C, etc (gabarito real)")
print("  2. Na imagem, a bolha B de Q1 está em uma posição específica")
print("  3. O template atual espera que A de Q1 esteja em x=47")
print("  4. Se B real está em x=71, então A deveria estar em x=47 (71-24)")
print("  5. Mas se o OMR detecta E quando deveria ser B, há um deslocamento")
print()

# Análise: Para Q1, sabemos que a resposta real é B
# Se o OMR detecta E, significa que está lendo 3 posições à direita
# Isso sugere que base_x está 3*24=72 pixels à esquerda do correto

print("📊 Análise de Questões Conhecidas:")
print()

# Questões com respostas conhecidas para análise
questoes_analise = [
    (1, "B"), (2, "A"), (3, "C"), (4, "B"), (5, "D"),
    (10, "B"), (15, "B"), (20, "E"), (25, "D"), (30, "D")
]

# Carregar OMR detectado
try:
    with open('/tmp/respostas_final.json', 'r') as f:
        omr_detectado = json.load(f)
    
    print("Comparação Real vs OMR:")
    deslocamentos_analise = []
    
    for q, resposta_real in questoes_analise:
        q_key = str(q)
        omr = omr_detectado.get(q_key, "").upper()
        resposta_real_upper = resposta_real.upper()
        
        if omr:
            opcoes = ["A", "B", "C", "D", "E"]
            try:
                idx_real = opcoes.index(resposta_real_upper)
                idx_omr = opcoes.index(omr)
                deslocamento = idx_omr - idx_real
                deslocamentos_analise.append((q, resposta_real_upper, omr, deslocamento))
                print(f"  Q{q:2d}: Real={resposta_real_upper} | OMR={omr} | Desloc={deslocamento:+d}")
            except:
                pass
    
    if deslocamentos_analise:
        desloc_medio = np.mean([d[3] for d in deslocamentos_analise])
        print()
        print(f"💡 Deslocamento médio nas questões analisadas: {desloc_medio:.2f} opções")
        print(f"   Ajuste sugerido: {desloc_medio * 24:.0f} pixels")
        
except FileNotFoundError:
    print("⚠️ Arquivo de respostas não encontrado. Execute o teste primeiro.")

print()
print("🔧 Próximo passo:")
print("  - Usar imagem de debug para ver visualmente onde está lendo")
print("  - Ajustar coordenadas baseado na análise visual")

