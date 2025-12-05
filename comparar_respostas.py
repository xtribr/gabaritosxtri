#!/usr/bin/env python3
"""
Script para comparar respostas da imagem com o gabarito do primeiro aluno
"""

import json
import sys

# Respostas da imagem (grid 10x10, mas preciso mapear para 90 questões)
# A imagem mostra um grid, mas o ENEM tem 6 colunas x 15 linhas = 90 questões
# Vou assumir que a imagem mostra as primeiras 100 questões ou está organizada de forma diferente

# Respostas extraídas da imagem (linha por linha, da esquerda para direita)
imagem_respostas = [
    # Linha 1 (Q1-Q10)
    "E", "C", "B", "B", "B", "C", "B", "C", "C", "C",
    # Linha 2 (Q11-Q20)
    "B", "B", "A", "D", "B", "D", "C", "B", "C", "C",
    # Linha 3 (Q21-Q30)
    "A", "C", "C", "C", "C", "C", "A", "A", "A", "A",
    # Linha 4 (Q31-Q40)
    "A", "A", "D", "A", "A", "A", "A", "C", "B", "B",
    # Linha 5 (Q41-Q50)
    "C", "C", "B", "A", "A", "E", "A", "A", "A", "A",
    # Linha 6 (Q51-Q60)
    "A", "A", "A", "A", "C", "C", "C", "C", "C", "C",
    # Linha 7 (Q61-Q70)
    "A", "A", "B", "A", "A", "A", "A", "A", "A", "E",
    # Linha 8 (Q71-Q80)
    "E", "E", "A", "A", "E", "E", "E", "A", "A", "A",
    # Linha 9 (Q81-Q90)
    "E", "A", "A", "E", "A", "C", "D", "A", "C", "C",
    # Linha 10 (se houver mais questões, mas ENEM tem 90)
    "A", "D", "E", "A", "A", "A", "D", "A", "A", "A"
]

# Ler respostas do PDF
try:
    with open('/tmp/respostas_aluno1.json', 'r') as f:
        pdf_respostas = json.load(f)
except:
    print("❌ Erro ao ler respostas do PDF")
    sys.exit(1)

print("=" * 80)
print("🔍 COMPARAÇÃO: IMAGEM vs PDF (Primeiro Aluno)")
print("=" * 80)
print()

# Comparar primeiras 90 questões
acertos = 0
erros = 0
diferencas = []

for i in range(1, 91):
    q_key = str(i)
    img_resp = imagem_respostas[i-1] if i <= len(imagem_respostas) else None
    pdf_resp = pdf_respostas.get(q_key, "Não respondeu")
    
    # Normalizar
    if pdf_resp and pdf_resp != "Não respondeu":
        pdf_resp = pdf_resp.strip().upper()
    else:
        pdf_resp = None
    
    if img_resp and pdf_resp:
        if img_resp == pdf_resp:
            acertos += 1
            status = "✅"
        else:
            erros += 1
            status = "❌"
            diferencas.append({
                'questao': i,
                'imagem': img_resp,
                'pdf': pdf_resp
            })
    elif img_resp and not pdf_resp:
        erros += 1
        status = "⚠️"
        diferencas.append({
            'questao': i,
            'imagem': img_resp,
            'pdf': "Não detectado"
        })
    elif not img_resp and pdf_resp:
        erros += 1
        status = "⚠️"
        diferencas.append({
            'questao': i,
            'imagem': "Não na imagem",
            'pdf': pdf_resp
        })
    else:
        status = "⚪"
    
    if i <= 20 or (i % 10 == 0):  # Mostrar primeiras 20 e múltiplos de 10
        print(f"{status} Q{i:2d}: Imagem={img_resp or 'N/A':3s} | PDF={pdf_resp or 'N/A':3s}")

print()
print("=" * 80)
print("📊 ESTATÍSTICAS")
print("=" * 80)
print(f"✅ Acertos (iguais): {acertos}")
print(f"❌ Diferenças: {erros}")
print(f"📈 Taxa de concordância: {(acertos/90)*100:.1f}%")
print()

if diferencas:
    print("=" * 80)
    print("🔍 DIFERENÇAS ENCONTRADAS (primeiras 20):")
    print("=" * 80)
    for diff in diferencas[:20]:
        print(f"Q{diff['questao']:2d}: Imagem={diff['imagem']:3s} | PDF={diff['pdf']:3s}")

