#!/usr/bin/env python3
"""
Analisa a comparação visual entre gabarito real e OMR detectado (v4.0 escalado)
"""

# Dados da grade 10x10 (100 células, mas ENEM tem 90)
# Verde = acerto, Vermelho = erro
grid_data = [
    # Linha 1 (Q1-Q10)
    ("A", "green"), ("B", "red"), ("D", "red"), ("E", "red"), ("E", "red"),
    ("E", "red"), ("C", "red"), ("C", "red"), ("C", "red"), ("C", "red"),
    # Linha 2 (Q11-Q20)
    ("D", "red"), ("C", "red"), ("D", "red"), ("C", "red"), ("D", "red"),
    ("C", "red"), ("A", "green"), ("B", "green"), ("C", "red"), ("C", "red"),
    # Linha 3 (Q21-Q30)
    ("B", "red"), ("A", "red"), ("B", "green"), ("C", "red"), ("A", "red"),
    ("C", "green"), ("A", "green"), ("B", "red"), ("C", "red"), ("C", "red"),
    # Linha 4 (Q31-Q40)
    ("B", "red"), ("C", "red"), ("B", "red"), ("C", "red"), ("B", "red"),
    ("B", "red"), ("A", "green"), ("C", "red"), ("A", "red"), ("A", "red"),
    # Linha 5 (Q41-Q50)
    ("C", "red"), ("A", "red"), ("C", "red"), ("A", "red"), ("B", "green"),
    ("C", "red"), ("B", "red"), ("C", "red"), ("A", "red"), ("A", "red"),
    # Linha 6 (Q51-Q60)
    ("C", "red"), ("B", "red"), ("D", "green"), ("B", "red"), ("C", "green"),
    ("A", "red"), ("B", "red"), ("C", "red"), ("A", "red"), ("A", "red"),
    # Linha 7 (Q61-Q70)
    ("B", "red"), ("C", "red"), ("A", "green"), ("C", "green"), ("A", "red"),
    ("A", "red"), ("C", "red"), ("C", "red"), ("B", "red"), ("B", "green"),
    # Linha 8 (Q71-Q80)
    ("B", "green"), ("C", "red"), ("B", "red"), ("C", "red"), ("B", "red"),
    ("C", "red"), ("A", "red"), ("B", "red"), ("C", "red"), ("C", "red"),
    # Linha 9 (Q81-Q90)
    ("B", "red"), ("D", "red"), ("B", "red"), ("A", "red"), ("A", "red"),
    ("B", "red"), ("B", "green"), ("C", "red"), ("C", "red"), ("C", "red"),
    # Linha 10 (Q91-Q100) - mas ENEM só tem 90, então vamos considerar só Q91-Q90
    ("C", "red"), ("D", "green"), ("D", "red"), ("E", "red"), ("E", "red"),
    ("A", "green"), ("B", "green"), ("C", "red"), ("C", "red"), ("D", "green"),
]

print("=" * 80)
print("📊 ANÁLISE DE COMPARAÇÃO: GABARITO REAL vs OMR DETECTADO (v4.0 Escalado)")
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
print("📊 EVOLUÇÃO COMPLETA")
print("=" * 80)
print()

print("  v2.0 (coordenadas anteriores):     32.2% acurácia (29/90)")
print("  v3.0 (coordenadas escaladas):       16.7% acurácia (15/90)")
print("  v4.0 (HoughCircles original):       21.1% acurácia (19/90)")
print(f"  v4.0 Escalado (tamanho real):       {taxa_acerto:.1f}% acurácia ({acertos}/90)")
print()

melhoria_v2 = taxa_acerto - 32.2
melhoria_v4_original = taxa_acerto - 21.1

if melhoria_v2 > 0:
    print(f"  ✅ Melhoria vs v2.0: +{melhoria_v2:.1f} pontos percentuais")
elif melhoria_v2 < 0:
    print(f"  ❌ Piora vs v2.0: {melhoria_v2:.1f} pontos percentuais")
else:
    print(f"  ➡️  Sem mudança vs v2.0")

if melhoria_v4_original > 0:
    print(f"  ✅ Melhoria vs v4.0 original: +{melhoria_v4_original:.1f} pontos percentuais")
elif melhoria_v4_original < 0:
    print(f"  ❌ Piora vs v4.0 original: {melhoria_v4_original:.1f} pontos percentuais")
else:
    print(f"  ➡️  Sem mudança vs v4.0 original")

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
elif taxa_acerto >= 30:
    print("⚠️ BAIXA! Acurácia entre 30-50% - OMR precisa de calibração")
else:
    print("❌ MUITO BAIXA! Acurácia abaixo de 30% - OMR precisa de calibração urgente")

print()
print("🔍 Próximos passos:")
if taxa_acerto < 90:
    print("  1. Verificar se as coordenadas estão corretas no overlay verde")
    print("  2. Verificar se a escala está correta (deve ser ≈ 1.0 agora)")
    print("  3. Ajustar threshold de detecção se necessário")
    print("  4. Verificar qualidade da imagem/PDF")
    if taxa_acerto < 50:
        print("  5. Recalibrar coordenadas se necessário")
        print("  6. Verificar se o alinhamento por marcadores está funcionando")
else:
    print("  ✅ OMR está funcionando bem! Continue monitorando a qualidade.")

