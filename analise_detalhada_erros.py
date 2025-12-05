#!/usr/bin/env python3
"""
Análise detalhada dos erros para entender o padrão exato
"""

import json
from collections import Counter

with open('/tmp/gabarito_imagem_aluno1.json', 'r') as f:
    gabarito_real = json.load(f)

with open('/tmp/respostas_aluno1.json', 'r') as f:
    omr_detectado = json.load(f)

opcoes = ["A", "B", "C", "D", "E"]

# Analisar cada erro individualmente
erros_detalhados = []
for q in range(1, 91):
    q_key = str(q)
    real = gabarito_real.get(q_key, "").upper()
    omr = omr_detectado.get(q_key, "").upper()
    
    if real and omr and real != omr:
        idx_real = opcoes.index(real)
        idx_omr = opcoes.index(omr)
        deslocamento = idx_omr - idx_real  # Positivo = OMR está à direita
        erros_detalhados.append({
            'q': q,
            'real': real,
            'omr': omr,
            'deslocamento': deslocamento
        })

# Contar deslocamentos
deslocamentos = [e['deslocamento'] for e in erros_detalhados]
contador = Counter(deslocamentos)

print("=" * 80)
print("🔍 ANÁLISE DETALHADA DOS ERROS")
print("=" * 80)
print()
print("📊 Distribuição de Deslocamentos:")
for desl, count in sorted(contador.items()):
    direcao = "direita" if desl > 0 else "esquerda" if desl < 0 else "igual"
    print(f"  {desl:+2d} opções ({direcao}): {count} vezes ({count/len(erros_detalhados)*100:.1f}%)")

print()
print("💡 Interpretação:")
deslocamento_mais_comum = contador.most_common(1)[0][0]
print(f"  Deslocamento mais comum: {deslocamento_mais_comum:+d} opções")
if deslocamento_mais_comum > 0:
    print(f"  → OMR está lendo {deslocamento_mais_comum} opção(ões) à DIREITA")
    print(f"  → Precisa mover base_x para ESQUERDA em {deslocamento_mais_comum * 24} pixels")
elif deslocamento_mais_comum < 0:
    print(f"  → OMR está lendo {abs(deslocamento_mais_comum)} opção(ões) à ESQUERDA")
    print(f"  → Precisa mover base_x para DIREITA em {abs(deslocamento_mais_comum) * 24} pixels")
else:
    print("  → Problema não é deslocamento simples")

print()
print("🔍 Primeiros 20 erros detalhados:")
for erro in erros_detalhados[:20]:
    print(f"  Q{erro['q']:2d}: Real={erro['real']} → OMR={erro['omr']} (desloc: {erro['deslocamento']:+d})")

