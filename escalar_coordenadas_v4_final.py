#!/usr/bin/env python3
"""
Escala coordenadas v4.0 para o tamanho real da imagem (~1240x1756px)
Baseado na escala detectada: 1.161x (X) e 1.172x (Y)
"""

# Coordenadas v4.0 (1068x1498px)
y_coords_v4 = [1034, 1058, 1083, 1109, 1135, 1159, 1185, 1211, 1236, 1261, 1286, 1311, 1337, 1362, 1387]

blocos_v4 = [
    [89, 114, 141, 168, 193],      # Bloco 1
    [253, 278, 304, 330, 356],     # Bloco 2
    [416, 442, 468, 494, 520],     # Bloco 3
    [580, 605, 631, 658, 684],     # Bloco 4
    [744, 769, 795, 822, 847],     # Bloco 5
    [906, 932, 958, 985, 1010]     # Bloco 6
]

# Escalas detectadas nos logs
scale_x = 1.161
scale_y = 1.172

print("=" * 80)
print("🔧 ESCALANDO COORDENADAS v4.0 PARA TAMANHO REAL")
print("=" * 80)
print()

print(f"📊 Escalas detectadas:")
print(f"  scale_x: {scale_x:.3f}")
print(f"  scale_y: {scale_y:.3f}")
print()

# Escalar coordenadas Y
y_coords_scaled = [int(y * scale_y) for y in y_coords_v4]

print("📋 Coordenadas Y escaladas:")
print(f"  Original: {y_coords_v4[:5]}...")
print(f"  Escalada: {y_coords_scaled[:5]}...")
print()

# Escalar coordenadas X
blocos_scaled = []
for bloco in blocos_v4:
    blocos_scaled.append([int(x * scale_x) for x in bloco])

print("📋 Coordenadas X escaladas (Bloco 1):")
print(f"  Original: {blocos_v4[0]}")
print(f"  Escalada: {blocos_scaled[0]}")
print()

# Calcular tamanho real
width_real = int(1068 * scale_x)
height_real = int(1498 * scale_y)

print(f"📐 Tamanho real da imagem:")
print(f"  Original: 1068x1498px")
print(f"  Real: {width_real}x{height_real}px")
print()

# Gerar código
print("=" * 80)
print("📝 CÓDIGO PARA python_omr_service/app.py:")
print("=" * 80)
print()

print("# Coordenadas Y das 15 linhas (CALIBRADAS v4.0 escaladas para tamanho real)")
print(f"y_coords = {y_coords_scaled}")
print()
print("# Coordenadas X para cada bloco (A, B, C, D, E) - CALIBRADAS v4.0 escaladas")
print("blocos_x = [")
for i, bloco in enumerate(blocos_scaled):
    print(f"    {bloco},      # Bloco {i+1}: Q{((i)*15)+1:02d}-Q{(i+1)*15:02d}")
print("]")
print()
print(f"bubble_radius = {int(11 * max(scale_x, scale_y))}  # Raio escalado")
print(f'"reference_size": {{"width": {width_real}, "height": {height_real}}},  # Tamanho real')

