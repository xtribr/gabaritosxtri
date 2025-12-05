#!/usr/bin/env python3
"""
Testa se as coordenadas estão corretas comparando com o gabarito real
"""

import json

# Carregar dados
with open('/tmp/gabarito_imagem_aluno1.json', 'r') as f:
    gabarito_real = json.load(f)

with open('/tmp/respostas_aluno1.json', 'r') as f:
    omr_detectado = json.load(f)

print("=" * 80)
print("🔍 ANÁLISE: PADRÕES DE ERRO POR COLUNA")
print("=" * 80)
print()

# Analisar por coluna
colunas = {
    1: list(range(1, 16)),   # Q1-Q15
    2: list(range(16, 31)),  # Q16-Q30
    3: list(range(31, 46)), # Q31-Q45
    4: list(range(46, 61)), # Q46-Q60
    5: list(range(61, 76)), # Q61-Q75
    6: list(range(76, 91))  # Q76-Q90
}

for col_num, questoes in colunas.items():
    acertos_col = 0
    erros_col = []
    
    for q in questoes:
        q_key = str(q)
        real = gabarito_real.get(q_key, "").upper()
        omr = omr_detectado.get(q_key, "").upper()
        
        if real == omr:
            acertos_col += 1
        else:
            erros_col.append({
                'q': q,
                'real': real,
                'omr': omr
            })
    
    taxa = (acertos_col / len(questoes)) * 100
    print(f"Coluna {col_num} (Q{questoes[0]}-Q{questoes[-1]}):")
    print(f"  ✅ Acertos: {acertos_col}/{len(questoes)} ({taxa:.1f}%)")
    print(f"  ❌ Erros: {len(erros_col)}/{len(questoes)}")
    
    # Mostrar padrões de erro na coluna
    if erros_col:
        padroes = {}
        for erro in erros_col:
            padrao = f"{erro['real']}→{erro['omr']}"
            padroes[padrao] = padroes.get(padrao, 0) + 1
        print(f"  Padrões: {', '.join([f'{p}({c}x)' for p, c in sorted(padroes.items(), key=lambda x: x[1], reverse=True)[:3]])}")
    print()

print("=" * 80)
print("💡 DIAGNÓSTICO:")
print("=" * 80)
print("Se os erros são consistentes por coluna, o problema pode estar em:")
print("  1. base_x[col] - coordenada X inicial de cada coluna")
print("  2. option_spacing - espaçamento entre A, B, C, D, E")
print("  3. Ordem das opções (A, B, C, D, E pode estar invertida)")

