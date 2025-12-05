#!/usr/bin/env python3
"""
Sistema de calibração automática de coordenadas baseado no gabarito real
"""

import json
import numpy as np

# Carregar dados
with open('/tmp/gabarito_imagem_aluno1.json', 'r') as f:
    gabarito_real = json.load(f)

with open('/tmp/respostas_aluno1.json', 'r') as f:
    omr_detectado = json.load(f)

print("=" * 80)
print("🔧 CALIBRAÇÃO AUTOMÁTICA DE COORDENADAS")
print("=" * 80)
print()

# Analisar deslocamento sistemático
deslocamentos = []

for q in range(1, 91):
    q_key = str(q)
    real = gabarito_real.get(q_key, "").upper()
    omr = omr_detectado.get(q_key, "").upper()
    
    if real and omr and real != omr:
        # Calcular deslocamento (A=0, B=1, C=2, D=3, E=4)
        opcoes = ["A", "B", "C", "D", "E"]
        try:
            idx_real = opcoes.index(real)
            idx_omr = opcoes.index(omr)
            deslocamento = idx_real - idx_omr  # Positivo = OMR está à esquerda
            deslocamentos.append(deslocamento)
        except:
            pass

if deslocamentos:
    deslocamento_medio = np.mean(deslocamentos)
    deslocamento_mediano = np.median(deslocamentos)
    
    print(f"📊 Análise de Deslocamento:")
    print(f"  Deslocamento médio: {deslocamento_medio:.2f} opções")
    print(f"  Deslocamento mediano: {deslocamento_mediano:.2f} opções")
    print(f"  Interpretação: OMR está lendo {abs(deslocamento_mediano):.0f} opção(ões) à {'esquerda' if deslocamento_mediano > 0 else 'direita'}")
    print()
    
    # Calcular ajuste necessário
    option_spacing_atual = 24
    ajuste_x = deslocamento_mediano * option_spacing_atual
    
    print(f"💡 Ajuste Necessário:")
    print(f"  Ajuste X: {ajuste_x:.1f} pixels")
    print(f"  Direção: {'direita' if ajuste_x > 0 else 'esquerda'}")
    print()
    
    # Calcular novos base_x
    base_x_atual = [47, 222, 397, 572, 747, 922]
    base_x_ajustado = [x - ajuste_x for x in base_x_atual]  # Subtrair porque se está lendo à esquerda, precisa mover para direita
    
    print(f"🔧 Coordenadas Atuais vs Ajustadas:")
    for i, (atual, ajustado) in enumerate(zip(base_x_atual, base_x_ajustado)):
        print(f"  Coluna {i+1}: {atual:.0f} → {ajustado:.0f} (ajuste: {ajuste_x:.1f}px)")
    
    # Salvar ajustes
    ajustes = {
        "base_x_original": base_x_atual,
        "base_x_ajustado": [round(x, 1) for x in base_x_ajustado],
        "ajuste_x": round(ajuste_x, 1),
        "deslocamento_mediano": round(deslocamento_mediano, 2),
        "option_spacing": option_spacing_atual
    }
    
    with open('/tmp/ajustes_coordenadas.json', 'w') as f:
        json.dump(ajustes, f, indent=2)
    
    print()
    print("✅ Ajustes calculados e salvos em /tmp/ajustes_coordenadas.json")
else:
    print("⚠️ Não foi possível calcular deslocamento (poucos erros ou padrão inconsistente)")

