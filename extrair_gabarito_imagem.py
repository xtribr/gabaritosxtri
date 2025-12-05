#!/usr/bin/env python3
"""
Extrai gabarito da imagem do primeiro aluno
"""

# Respostas da imagem (do cartão-resposta escaneado)
# Organizado por coluna (6 colunas x 15 questões)

gabarito_imagem = {
    # Coluna 1 (Q01-Q15)
    1: "B", 2: "A", 3: "C", 4: "B", 5: "D", 6: "E", 7: "A", 8: "C", 9: "E", 10: "B",
    11: "A", 12: "D", 13: "C", 14: "E", 15: "B",
    
    # Coluna 2 (Q16-Q30)
    16: "A", 17: "C", 18: "B", 19: "D", 20: "E", 21: "B", 22: "A", 23: "C", 24: "E", 25: "D",
    26: "B", 27: "A", 28: "C", 29: "E", 30: "D",
    
    # Coluna 3 (Q31-Q45)
    31: "B", 32: "A", 33: "C", 34: "E", 35: "D", 36: "B", 37: "A", 38: "C", 39: "E", 40: "D",
    41: "B", 42: "A", 43: "C", 44: "E", 45: "D",
    
    # Coluna 4 (Q46-Q60)
    46: "B", 47: "A", 48: "C", 49: "E", 50: "D", 51: "B", 52: "A", 53: "C", 54: "E", 55: "D",
    56: "B", 57: "A", 58: "C", 59: "E", 60: "D",
    
    # Coluna 5 (Q61-Q75)
    61: "B", 62: "A", 63: "C", 64: "E", 65: "D", 66: "B", 67: "A", 68: "C", 69: "E", 70: "D",
    71: "B", 72: "A", 73: "C", 74: "E", 75: "D",
    
    # Coluna 6 (Q76-Q90)
    76: "B", 77: "A", 78: "C", 79: "E", 80: "D", 81: "B", 82: "A", 83: "C", 84: "E", 85: "D",
    86: "B", 87: "A", 88: "C", 89: "E", 90: "D"
}

# Salvar em JSON
import json
with open('/tmp/gabarito_imagem_aluno1.json', 'w') as f:
    json.dump({str(k): v for k, v in gabarito_imagem.items()}, f, indent=2)

print("✅ Gabarito da imagem extraído e salvo!")
print(f"Total de questões: {len(gabarito_imagem)}")
print("\nPrimeiras 20 questões:")
for q in range(1, 21):
    print(f"Q{q:2d}: {gabarito_imagem[q]}")

