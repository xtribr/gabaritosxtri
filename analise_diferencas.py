#!/usr/bin/env python3
"""
Análise detalhada das diferenças entre imagem e PDF
"""

# Respostas da imagem
imagem = {
    1: "E", 2: "C", 3: "B", 4: "B", 5: "B", 6: "C", 7: "B", 8: "C", 9: "C", 10: "C",
    11: "B", 12: "B", 13: "A", 14: "D", 15: "B", 16: "D", 17: "C", 18: "B", 19: "C", 20: "C",
    21: "A", 22: "C", 23: "C", 24: "C", 25: "C", 26: "C", 27: "A", 28: "A", 29: "A", 30: "A",
    31: "A", 32: "A", 33: "D", 34: "A", 35: "A", 36: "A", 37: "A", 38: "C", 39: "B", 40: "B",
    41: "C", 42: "C", 43: "B", 44: "A", 45: "A", 46: "E", 47: "A", 48: "A", 49: "A", 50: "A",
    51: "A", 52: "A", 53: "A", 54: "A", 55: "C", 56: "C", 57: "C", 58: "C", 59: "C", 60: "C",
    61: "A", 62: "A", 63: "B", 64: "A", 65: "A", 66: "A", 67: "A", 68: "A", 69: "A", 70: "E",
    71: "E", 72: "E", 73: "A", 74: "A", 75: "E", 76: "E", 77: "E", 78: "A", 79: "A", 80: "A",
    81: "E", 82: "A", 83: "A", 84: "E", 85: "A", 86: "C", 87: "D", 88: "A", 89: "C", 90: "C"
}

# Respostas do PDF
pdf = {
    1: "E", 2: "C", 3: "B", 4: "B", 5: "B", 6: "C", 7: "B", 8: "C", 9: "C", 10: "B",
    11: "B", 12: "A", 13: "C", 14: "B", 15: "D", 16: "C", 17: "A", 18: "C", 19: "A", 20: "C",
    21: "C", 22: "C", 23: "C", 24: "C", 25: "A", 26: "A", 27: "A", 28: "A", 29: "A", 30: "D",
    31: "C", 32: "A", 33: "A", 34: "A", 35: "C", 36: "B", 37: "C", 38: "C", 39: "C", 40: "A",
    41: "A", 42: "E", 43: "A", 44: "A", 45: "A", 46: "A", 47: "A", 48: "B", 49: "A", 50: "C",
    51: "C", 52: "C", 53: "C", 54: "B", 55: "A", 56: "A", 57: "C", 58: "A", 59: "A", 60: "A",
    61: "A", 62: "A", 63: "E", 64: "E", 65: "E", 66: "A", 67: "A", 68: "E", 69: "E", 70: "A",
    71: "A", 72: "B", 73: "E", 74: "A", 75: "A", 76: "E", 77: "A", 78: "B", 79: "E", 80: "B",
    81: "C", 82: "A", 83: "D", 84: "E", 85: "A", 86: "A", 87: "A", 88: "D", 89: "A", 90: "A"
}

print("=" * 80)
print("🔍 ANÁLISE DETALHADA: IMAGEM vs PDF (Primeiro Aluno)")
print("=" * 80)
print()

acertos = 0
erros = []
padroes = {}

for q in range(1, 91):
    img = imagem.get(q)
    pdf_resp = pdf.get(q)
    
    if img == pdf_resp:
        acertos += 1
        status = "✅"
    else:
        status = "❌"
        erros.append({
            'q': q,
            'imagem': img,
            'pdf': pdf_resp,
            'diff': f"{img}→{pdf_resp}"
        })
        # Analisar padrões
        if img and pdf_resp:
            padrao = f"{img}→{pdf_resp}"
            padroes[padrao] = padroes.get(padrao, 0) + 1

print(f"✅ Acertos: {acertos}/90 ({acertos/90*100:.1f}%)")
print(f"❌ Erros: {len(erros)}/90 ({len(erros)/90*100:.1f}%)")
print()

print("=" * 80)
print("📊 PADRÕES DE ERRO (mais frequentes):")
print("=" * 80)
for padrao, count in sorted(padroes.items(), key=lambda x: x[1], reverse=True)[:10]:
    print(f"  {padrao}: {count} vezes")

print()
print("=" * 80)
print("🔍 PRIMEIRAS 30 QUESTÕES - COMPARAÇÃO DETALHADA:")
print("=" * 80)
for q in range(1, 31):
    img = imagem.get(q)
    pdf_resp = pdf.get(q)
    if img == pdf_resp:
        print(f"✅ Q{q:2d}: {img} = {pdf_resp}")
    else:
        print(f"❌ Q{q:2d}: {img} ≠ {pdf_resp}")

print()
print("=" * 80)
print("💡 INTERPRETAÇÃO:")
print("=" * 80)
print("A imagem pode estar mostrando:")
print("  1. Gabarito oficial (respostas corretas)")
print("  2. Outro aluno (não o primeiro)")
print("  3. Visualização de comparação (verde=correto, vermelho=errado)")
print()
print("O PDF mostra as respostas detectadas pelo OMR do primeiro aluno.")
print(f"Taxa de concordância: {acertos/90*100:.1f}%")

