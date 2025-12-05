#!/usr/bin/env python3
"""
Escala as coordenadas v3.0 da preview para o tamanho original (2481x3509px)
"""

# Coordenadas v3.0 (da preview)
y_lines_preview = [1034, 1058, 1084, 1109, 1135, 1159, 1185, 1211, 1236, 1262, 1286, 1311, 1337, 1362, 1387]

blocos_preview = {
    "1": {"A": 90,  "B": 114, "C": 141, "D": 168, "E": 193},
    "2": {"A": 252, "B": 278, "C": 304, "D": 330, "E": 356},
    "3": {"A": 416, "B": 442, "C": 468, "D": 494, "E": 520},
    "4": {"A": 580, "B": 606, "C": 631, "D": 658, "E": 684},
    "5": {"A": 743, "B": 769, "C": 795, "D": 821, "E": 847},
    "6": {"A": 907, "B": 933, "C": 959, "D": 985, "E": 1011}
}

# Tamanho original da imagem
width_original = 2481
height_original = 3509

# Tamanho da preview (aproximado - baseado no scale 0.3)
# A preview é renderizada com scale 0.3, então:
width_preview = width_original * 0.3  # ~744px
height_preview = height_original * 0.3  # ~1053px

# Mas as coordenadas v3.0 vão até ~1387 em Y, então pode ser outra escala
# Vamos calcular a escala baseada nas coordenadas Y
y_max_preview = max(y_lines_preview)  # 1387
y_max_original = 3270  # Da v2.0 (última linha)

scale_y = y_max_original / y_max_preview if y_max_preview > 0 else 2.36

# Para X, vamos usar a mesma escala ou calcular
x_max_preview = max([max(bloco.values()) for bloco in blocos_preview.values()])  # 1011
x_max_original = 2339  # Da v2.0 (última coordenada X)

scale_x = x_max_original / x_max_preview if x_max_preview > 0 else 2.31

print("=" * 80)
print("🔧 ESCALANDO COORDENADAS v3.0 PARA TAMANHO ORIGINAL")
print("=" * 80)
print()

print(f"📊 Escalas calculadas:")
print(f"  scale_x: {scale_x:.3f}")
print(f"  scale_y: {scale_y:.3f}")
print()

# Escalar coordenadas Y
y_lines_original = [int(y * scale_y) for y in y_lines_preview]

print("📋 Coordenadas Y escaladas:")
print(f"  Preview: {y_lines_preview[:5]}...")
print(f"  Original: {y_lines_original[:5]}...")
print()

# Escalar coordenadas X
blocos_original = {}
for bloco_id, coords in blocos_preview.items():
    blocos_original[bloco_id] = {opt: int(x * scale_x) for opt, x in coords.items()}

print("📋 Coordenadas X escaladas (Bloco 1):")
print(f"  Preview: {blocos_preview['1']}")
print(f"  Original: {blocos_original['1']}")
print()

# Gerar código Python
print("=" * 80)
print("📝 CÓDIGO PARA python_omr_service/app.py:")
print("=" * 80)
print()

print("# Coordenadas Y das 15 linhas (CALIBRADAS v3.0 escaladas)")
print(f"y_coords = {y_lines_original}")
print()
print("# Coordenadas X para cada bloco (A, B, C, D, E) - CALIBRADAS v3.0 escaladas")
print("blocos_x = [")
for i in range(1, 7):
    bloco = blocos_original[str(i)]
    print(f"    [{bloco['A']}, {bloco['B']}, {bloco['C']}, {bloco['D']}, {bloco['E']}],      # Bloco {i}: Q{((i-1)*15)+1:02d}-Q{i*15:02d}")
print("]")
print()
print(f"bubble_radius = {9 * scale_x:.1f}  # Raio escalado")

