#!/usr/bin/env python3
"""
Analisa padrões de erro na detecção OMR
"""

# Dados da grade (primeiras 90 questões)
grid_data = [
    ("A", "green"), ("B", "red"), ("D", "red"), ("E", "red"), ("E", "red"),
    ("E", "red"), ("C", "red"), ("C", "red"), ("C", "red"), ("C", "red"),
    ("D", "red"), ("C", "red"), ("D", "red"), ("C", "red"), ("D", "red"),
    ("C", "red"), ("A", "green"), ("B", "red"), ("C", "red"), ("C", "red"),
    ("B", "red"), ("A", "green"), ("B", "red"), ("C", "red"), ("A", "green"),
    ("C", "red"), ("A", "green"), ("B", "red"), ("C", "red"), ("C", "red"),
    ("B", "red"), ("C", "red"), ("B", "red"), ("C", "red"), ("B", "red"),
    ("B", "red"), ("A", "green"), ("C", "red"), ("A", "green"), ("A", "green"),
    ("C", "red"), ("A", "green"), ("C", "red"), ("A", "green"), ("B", "red"),
    ("C", "red"), ("B", "red"), ("C", "red"), ("A", "green"), ("A", "green"),
    ("C", "red"), ("B", "red"), ("D", "red"), ("B", "red"), ("C", "red"),
    ("A", "green"), ("B", "red"), ("C", "red"), ("A", "green"), ("A", "green"),
    ("B", "red"), ("C", "red"), ("A", "green"), ("C", "red"), ("A", "green"),
    ("A", "green"), ("B", "red"), ("B", "red"), ("A", "green"), ("A", "green"),
    ("A", "green"), ("B", "red"), ("A", "green"), ("B", "red"), ("A", "green"),
    ("B", "red"), ("A", "green"), ("A", "green"), ("B", "red"), ("B", "red"),
    ("A", "green"), ("C", "red"), ("A", "green"), ("A", "green"), ("A", "green"),
    ("B", "red"), ("B", "red"), ("C", "red"), ("C", "red"), ("C", "red"),
]

# Carregar gabarito real (se disponível)
# Por enquanto, vamos analisar os padrões de detecção

print("=" * 80)
print("🔍 ANÁLISE DE PADRÕES DE ERRO")
print("=" * 80)
print()

# Contar quantas vezes cada letra foi detectada (correta ou incorretamente)
detections = {}
for answer, status in grid_data[:90]:
    detections[answer] = detections.get(answer, 0) + 1

print("📊 Distribuição de detecções (todas as 90 questões):")
for letter in sorted(detections.keys()):
    count = detections[letter]
    percentage = (count / 90) * 100
    print(f"  {letter}: {count} vezes ({percentage:.1f}%)")

print()
print("💡 Observações:")
print("  - Se 'C' aparece muito mais que outras, pode indicar:")
print("    * Coordenadas desalinhadas (lendo sempre a mesma posição)")
print("    * Threshold muito baixo (detectando ruído como marcação)")
print("    * Problema na escala/conversão de coordenadas")
print()

# Análise por bloco
print("=" * 80)
print("📊 ANÁLISE DETALHADA POR BLOCO")
print("=" * 80)
print()

for bloco in range(6):
    inicio = bloco * 15
    fim = inicio + 15
    bloco_data = grid_data[inicio:fim]
    
    acertos = sum(1 for _, status in bloco_data if status == "green")
    detections_bloco = {}
    for answer, _ in bloco_data:
        detections_bloco[answer] = detections_bloco.get(answer, 0) + 1
    
    print(f"Bloco {bloco + 1} (Q{inicio + 1:2d}-Q{fim:2d}): {acertos}/15 acertos")
    print(f"  Detecções: {dict(sorted(detections_bloco.items()))}")
    print()

print("=" * 80)
print("🎯 RECOMENDAÇÕES")
print("=" * 80)
print()

print("1. VERIFICAR COORDENADAS:")
print("   - Abra o overlay verde no frontend")
print("   - Compare visualmente se os quadrados estão sobre as bolhas corretas")
print("   - Se não estiverem, ajuste as coordenadas no template Python")
print()

print("2. AJUSTAR THRESHOLD:")
print("   - Atualmente: 0.4 (40% de preenchimento)")
print("   - Se detecta muitas 'C' incorretas, pode estar muito baixo")
print("   - Tente aumentar para 0.5 ou 0.6")
print()

print("3. VERIFICAR ESCALA:")
print("   - A imagem pode ter tamanho diferente de 2481x3509px")
print("   - O sistema faz escala automática, mas pode estar errada")
print("   - Verifique os logs do Python para ver a escala aplicada")
print()

print("4. TESTAR COM OUTRA IMAGEM:")
print("   - Use uma imagem de melhor qualidade")
print("   - Verifique se o problema persiste")
print("   - Isso ajuda a identificar se é problema de calibração ou qualidade")

