#!/usr/bin/env python3
"""
Sistema de calibração iterativa - testa múltiplos ajustes e escolhe o melhor
"""

import json
import subprocess
import time

# Carregar gabarito real
with open('/tmp/gabarito_imagem_aluno1.json', 'r') as f:
    gabarito_real = json.load(f)

base_x_original = [47, 222, 397, 572, 747, 922]

print("=" * 80)
print("🔧 CALIBRAÇÃO ITERATIVA - TESTANDO MÚLTIPLOS AJUSTES")
print("=" * 80)
print()

melhor_ajuste = None
melhor_acertos = 0
melhor_base_x = None

# Testar ajustes de -48 a +48 pixels (2 opções em cada direção)
ajustes = list(range(-48, 49, 6))  # Testar de 6 em 6 pixels

print(f"🧪 Testando {len(ajustes)} ajustes diferentes...")
print()

for ajuste in ajustes:
    # Calcular novo base_x
    novo_base_x = [x + ajuste for x in base_x_original]
    
    # Atualizar template no código Python
    # (Por enquanto, vamos simular testando diferentes valores)
    print(f"  Testando ajuste {ajuste:+3d}px: base_x = {[round(x, 0) for x in novo_base_x]}")
    
    # Simular resultado (em produção, faria requisição real)
    # Por enquanto, vamos usar análise estatística
    pass

print()
print("💡 Como os deslocamentos são muito variados, o problema pode ser:")
print("  1. Coordenadas base completamente erradas")
print("  2. Espaçamento entre opções errado")
print("  3. Ordem das opções invertida")
print("  4. Problema na detecção de bolhas (threshold)")
print()
print("🔍 Vou analisar se há um padrão por coluna...")

# Analisar por coluna
colunas = {
    1: list(range(1, 16)),
    2: list(range(16, 31)),
    3: list(range(31, 46)),
    4: list(range(46, 61)),
    5: list(range(61, 76)),
    6: list(range(76, 91))
}

print()
print("📊 Análise por Coluna:")
for col_num, questoes in colunas.items():
    deslocamentos_col = []
    for q in questoes:
        q_key = str(q)
        real = gabarito_real.get(q_key, "").upper()
        # Simular OMR (vamos usar os dados reais depois)
        pass
    
    print(f"  Coluna {col_num}: análise pendente")

