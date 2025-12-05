#!/usr/bin/env python3
"""
Calibra coordenadas usando o gabarito real como referência
Estratégia: Se sabemos que Q1=B, Q2=A, etc., podemos encontrar onde estão essas bolhas
"""

import json
import requests
import base64
from PIL import Image
import io

# Carregar gabarito real
with open('/tmp/gabarito_imagem_aluno1.json', 'r') as f:
    gabarito_real = json.load(f)

print("=" * 80)
print("🎯 CALIBRAÇÃO USANDO GABARITO REAL COMO REFERÊNCIA")
print("=" * 80)
print()

print("💡 Estratégia:")
print("  1. Usar debug visual para ver onde o OMR está lendo")
print("  2. Comparar com onde DEVERIA ler (baseado no gabarito real)")
print("  3. Calcular offset necessário")
print("  4. Aplicar ajuste")
print()

# Primeiro, vamos ver algumas questões específicas para entender o padrão
print("📋 Análise de Questões Específicas:")
print()

# Questões que sabemos a resposta real
questoes_amostra = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30]

for q in questoes_amostra:
    q_key = str(q)
    real = gabarito_real.get(q_key, "")
    print(f"  Q{q:2d}: Resposta real = {real}")

print()
print("🔧 Próximo passo:")
print("  - Gerar imagem de debug com o gabarito real sobreposto")
print("  - Comparar visualmente onde o OMR está lendo vs onde deveria")
print("  - Calcular ajuste preciso")

