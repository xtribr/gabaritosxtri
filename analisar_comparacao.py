#!/usr/bin/env python3
"""
Analisa a comparação visual entre gabarito real e OMR detectado
Baseado na grade 10x10 mostrada (100 questões, mas ENEM tem 90)
"""

# Dados da grade 10x10 (primeiras 100 células)
# Verde = acerto, Vermelho = erro
grid_data = [
    # Linha 1 (Q1-Q10)
    ("A", "green"), ("B", "red"), ("D", "red"), ("E", "red"), ("E", "red"),
    ("E", "red"), ("C", "red"), ("C", "red"), ("C", "red"), ("C", "red"),
    # Linha 2 (Q11-Q20)
    ("D", "red"), ("C", "red"), ("D", "red"), ("C", "red"), ("D", "red"),
    ("C", "red"), ("A", "green"), ("B", "red"), ("C", "red"), ("C", "red"),
    # Linha 3 (Q21-Q30)
    ("B", "red"), ("A", "green"), ("B", "red"), ("C", "red"), ("A", "green"),
    ("C", "red"), ("A", "green"), ("B", "red"), ("C", "red"), ("C", "red"),
    # Linha 4 (Q31-Q40)
    ("B", "red"), ("C", "red"), ("B", "red"), ("C", "red"), ("B", "red"),
    ("B", "red"), ("A", "green"), ("C", "red"), ("A", "green"), ("A", "green"),
    # Linha 5 (Q41-Q50)
    ("C", "red"), ("A", "green"), ("C", "red"), ("A", "green"), ("B", "red"),
    ("C", "red"), ("B", "red"), ("C", "red"), ("A", "green"), ("A", "green"),
    # Linha 6 (Q51-Q60)
    ("C", "red"), ("B", "red"), ("D", "red"), ("B", "red"), ("C", "red"),
    ("A", "green"), ("B", "red"), ("C", "red"), ("A", "green"), ("A", "green"),
    # Linha 7 (Q61-Q70)
    ("B", "red"), ("C", "red"), ("A", "green"), ("C", "red"), ("A", "green"),
    ("A", "green"), ("B", "red"), ("B", "red"), ("A", "green"), ("A", "green"),
    # Linha 8 (Q71-Q80)
    ("A", "green"), ("B", "red"), ("A", "green"), ("B", "red"), ("A", "green"),
    ("B", "red"), ("A", "green"), ("A", "green"), ("B", "red"), ("B", "red"),
    # Linha 9 (Q81-Q90)
    ("A", "green"), ("C", "red"), ("A", "green"), ("A", "green"), ("A", "green"),
    ("B", "red"), ("B", "red"), ("C", "red"), ("C", "red"), ("C", "red"),
    # Linha 10 (Q91-Q100) - mas ENEM só tem 90, então vamos considerar só Q91-Q90
    ("C", "red"), ("D", "red"), ("D", "red"), ("E", "red"), ("E", "red"),
    ("A", "green"), ("B", "red"), ("C", "red"), ("C", "red"), ("D", "red"),
]

print("=" * 80)
print("📊 ANÁLISE DE COMPARAÇÃO: GABARITO REAL vs OMR DETECTADO")
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
    print("  2. Ajustar threshold de detecção (atualmente 0.4)")
    print("  3. Verificar qualidade da imagem/PDF")
    print("  4. Recalibrar coordenadas se necessário")
else:
    print("  ✅ OMR está funcionando bem! Continue monitorando a qualidade.")

