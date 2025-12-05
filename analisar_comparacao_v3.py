#!/usr/bin/env python3
"""
Analisa a comparação visual entre gabarito real e OMR detectado (v3.0)
"""

# Dados da grade 10x10 (primeiras 100 células)
# Verde = acerto, Vermelho = erro
grid_data = [
    # Linha 1 (Q1-Q10)
    ("A", "green"), ("D", "red"), ("C", "red"), ("E", "red"), ("D", "red"),
    ("D", "red"), ("D", "red"), ("C", "red"), ("C", "red"), ("A", "red"),
    # Linha 2 (Q11-Q20)
    ("C", "red"), ("C", "red"), ("C", "red"), ("C", "red"), ("C", "red"),
    ("C", "red"), ("A", "green"), ("A", "red"), ("A", "red"), ("A", "red"),
    # Linha 3 (Q21-Q30)
    ("A", "red"), ("A", "red"), ("A", "red"), ("A", "red"), ("A", "red"),
    ("B", "red"), ("E", "green"), ("B", "red"), ("C", "red"), ("A", "red"),
    # Linha 4 (Q31-Q40)
    ("D", "red"), ("D", "red"), ("C", "red"), ("A", "green"), ("D", "red"),
    ("A", "green"), ("A", "red"), ("A", "red"), ("A", "red"), ("A", "red"),
    # Linha 5 (Q41-Q50)
    ("A", "red"), ("A", "red"), ("A", "red"), ("B", "green"), ("A", "red"),
    ("A", "green"), ("B", "red"), ("D", "red"), ("C", "red"), ("A", "red"),
    # Linha 6 (Q51-Q60)
    ("A", "red"), ("A", "red"), ("A", "red"), ("A", "green"), ("A", "red"),
    ("A", "green"), ("A", "red"), ("A", "red"), ("C", "red"), ("A", "red"),
    # Linha 7 (Q61-Q70)
    ("D", "red"), ("C", "red"), ("A", "red"), ("C", "green"), ("B", "red"),
    ("B", "red"), ("A", "green"), ("B", "red"), ("A", "red"), ("A", "red"),
    # Linha 8 (Q71-Q80)
    ("A", "red"), ("A", "red"), ("A", "red"), ("A", "red"), ("A", "red"),
    ("C", "green"), ("D", "red"), ("B", "green"), ("D", "red"), ("A", "red"),
    # Linha 9 (Q81-Q90)
    ("C", "red"), ("E", "red"), ("E", "red"), ("A", "green"), ("B", "red"),
    ("A", "green"), ("A", "red"), ("A", "red"), ("A", "red"), ("A", "red"),
    # Linha 10 (Q91-Q100) - mas ENEM só tem 90, então vamos considerar só Q91-Q90
    ("A", "red"), ("A", "red"), ("E", "green"), ("D", "red"), ("E", "red"),
    ("E", "red"), ("C", "green"), ("B", "red"), ("A", "red"), ("A", "red"),
]

print("=" * 80)
print("📊 ANÁLISE DE COMPARAÇÃO: GABARITO REAL vs OMR DETECTADO (v3.0)")
print("=" * 80)
print()

# Analisar apenas as primeiras 90 questões (ENEM)
total_questions = 90
acertos = 0
erros = 0

print("📋 Análise por questão (primeiras 90):")
print()

for i in range(total_questions):
    answer, status = grid_data[i]
    q_num = i + 1
    if status == "green":
        acertos += 1
        symbol = "✅"
    else:
        erros += 1
        symbol = "❌"
    
    # Mostrar apenas algumas questões para não poluir
    if q_num <= 10 or q_num % 10 == 0:
        print(f"  {symbol} Q{q_num:2d}: {answer} ({status})")

print()
print("=" * 80)
print("📊 ESTATÍSTICAS GERAIS")
print("=" * 80)
print()

taxa_acerto = (acertos / total_questions) * 100
taxa_erro = (erros / total_questions) * 100

print(f"✅ Acertos: {acertos}/{total_questions} ({taxa_acerto:.1f}%)")
print(f"❌ Erros: {erros}/{total_questions} ({taxa_erro:.1f}%)")
print()

# Análise por bloco (6 blocos de 15 questões)
print("=" * 80)
print("📊 ANÁLISE POR BLOCO (15 questões cada)")
print("=" * 80)
print()

for bloco in range(6):
    inicio = bloco * 15
    fim = inicio + 15
    acertos_bloco = sum(1 for i in range(inicio, fim) if grid_data[i][1] == "green")
    taxa_bloco = (acertos_bloco / 15) * 100
    
    print(f"  Bloco {bloco + 1} (Q{inicio + 1:2d}-Q{fim:2d}): {acertos_bloco}/15 ({taxa_bloco:.1f}%)")

print()
print("=" * 80)
print("📊 COMPARAÇÃO: v2.0 vs v3.0")
print("=" * 80)
print()

print("  v2.0 (coordenadas anteriores): 32.2% acurácia (29/90)")
print(f"  v3.0 (coordenadas novas):      {taxa_acerto:.1f}% acurácia ({acertos}/90)")
print()

melhoria = taxa_acerto - 32.2
if melhoria > 0:
    print(f"  ✅ Melhoria: +{melhoria:.1f} pontos percentuais")
elif melhoria < 0:
    print(f"  ❌ Piora: {melhoria:.1f} pontos percentuais")
else:
    print(f"  ➡️  Sem mudança")

print()
print("=" * 80)
print("💡 INTERPRETAÇÃO")
print("=" * 80)
print()

if taxa_acerto >= 90:
    print("🎉 EXCELENTE! Acurácia acima de 90% - OMR funcionando muito bem!")
elif taxa_acerto >= 70:
    print("✅ BOM! Acurácia acima de 70% - OMR funcionando bem, mas pode melhorar")
elif taxa_acerto >= 50:
    print("⚠️ RAZOÁVEL! Acurácia acima de 50% - OMR precisa de ajustes")
else:
    print("❌ BAIXA! Acurácia abaixo de 50% - OMR precisa de calibração urgente")

print()
print("🔍 Próximos passos:")
if taxa_acerto < 90:
    print("  1. Verificar se as coordenadas estão corretas no overlay verde")
    print("  2. Ajustar threshold de detecção (atualmente adaptativo 0.25-0.35)")
    print("  3. Verificar qualidade da imagem/PDF")
    print("  4. Recalibrar coordenadas se necessário")
else:
    print("  ✅ OMR está funcionando bem! Continue monitorando a qualidade.")

