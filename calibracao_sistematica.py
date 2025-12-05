#!/usr/bin/env python3
"""
Calibração sistemática - testa múltiplas configurações e escolhe a melhor
"""

import json
import subprocess
import time

# Carregar gabarito real
with open('/tmp/gabarito_imagem_aluno1.json', 'r') as f:
    gabarito_real = json.load(f)

base_x_original = [47, 222, 397, 572, 747, 922]

print("=" * 80)
print("🔧 CALIBRAÇÃO SISTEMÁTICA - TESTANDO MÚLTIPLAS CONFIGURAÇÕES")
print("=" * 80)
print()

# Estratégia: Testar diferentes ajustes e ver qual dá melhor resultado
# Mas como não podemos fazer requisições reais facilmente, vamos usar análise

print("💡 Como os ajustes simples não funcionaram, o problema pode ser:")
print("  1. Espaçamento entre opções errado (não 24px)")
print("  2. Ordem das opções invertida")
print("  3. Coordenadas Y erradas (y_start ou y_step)")
print("  4. Múltiplos problemas combinados")
print()

# Vamos analisar se há um padrão por questão
print("📊 Análise por Posição na Coluna:")
print()

# Agrupar questões por posição na coluna (1-15)
posicoes_coluna = {i: [] for i in range(15)}

for q in range(1, 91):
    pos = (q - 1) % 15  # Posição na coluna (0-14)
    q_key = str(q)
    real = gabarito_real.get(q_key, "").upper()
    # Vamos analisar depois com OMR
    posicoes_coluna[pos].append(q)

print("  Questões por posição na coluna:")
for pos, questoes in list(posicoes_coluna.items())[:5]:
    print(f"    Posição {pos+1}: Q{questoes[0]}, Q{questoes[1]}, Q{questoes[2]}, ...")

print()
print("🔍 Vou criar um script que testa diferentes configurações...")

