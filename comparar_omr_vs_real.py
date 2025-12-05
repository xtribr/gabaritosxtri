#!/usr/bin/env python3
"""
Compara OMR detectado vs Gabarito Real (da imagem)
"""

import json

# Carregar gabarito da imagem
with open('/tmp/gabarito_imagem_aluno1.json', 'r') as f:
    gabarito_real = json.load(f)

# Carregar respostas do OMR
with open('/tmp/respostas_aluno1.json', 'r') as f:
    omr_detectado = json.load(f)

print("=" * 80)
print("🔍 COMPARAÇÃO: OMR DETECTADO vs GABARITO REAL (Primeiro Aluno)")
print("=" * 80)
print()

acertos = 0
erros = []
erros_por_tipo = {}

for q in range(1, 91):
    q_key = str(q)
    real = gabarito_real.get(q_key, "").upper()
    omr = omr_detectado.get(q_key, "").upper()
    
    if real == omr:
        acertos += 1
        status = "✅"
    else:
        status = "❌"
        erro = {
            'q': q,
            'real': real,
            'omr': omr,
            'tipo': f"{real}→{omr}" if real and omr else f"{real or 'vazio'}→{omr or 'vazio'}"
        }
        erros.append(erro)
        tipo = erro['tipo']
        erros_por_tipo[tipo] = erros_por_tipo.get(tipo, 0) + 1

print(f"✅ Acertos: {acertos}/90 ({acertos/90*100:.1f}%)")
print(f"❌ Erros: {len(erros)}/90 ({len(erros)/90*100:.1f}%)")
print()

print("=" * 80)
print("📊 ERROS POR TIPO (mais frequentes):")
print("=" * 80)
for tipo, count in sorted(erros_por_tipo.items(), key=lambda x: x[1], reverse=True)[:15]:
    print(f"  {tipo}: {count} vezes")

print()
print("=" * 80)
print("🔍 TODAS AS DIFERENÇAS:")
print("=" * 80)
for erro in erros:
    print(f"❌ Q{erro['q']:2d}: Real={erro['real']:3s} | OMR={erro['omr']:3s} | {erro['tipo']}")

print()
print("=" * 80)
print("💡 ANÁLISE:")
print("=" * 80)
print(f"Taxa de acurácia do OMR: {acertos/90*100:.1f}%")
print(f"Total de erros: {len(erros)}")
if len(erros) > 0:
    print(f"\nErros mais comuns:")
    for tipo, count in sorted(erros_por_tipo.items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  - {tipo}: {count} vezes")

