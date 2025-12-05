#!/usr/bin/env python3
"""
Gera imagem de calibração mostrando onde OMR lê vs onde deveria ler
"""

import json
import requests
import base64
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import io

# Carregar gabarito real
with open('/tmp/gabarito_imagem_aluno1.json', 'r') as f:
    gabarito_real = json.load(f)

print("=" * 80)
print("🎯 GERANDO IMAGEM DE CALIBRAÇÃO VISUAL")
print("=" * 80)
print()

# Chamar endpoint de debug visual
print("📥 Chamando endpoint de debug visual...")
try:
    with open('data/gabaritos_alinhados.pdf', 'rb') as f:
        files = {'image': ('gabaritos_alinhados.pdf', f.read(), 'application/pdf')}
        response = requests.post(
            'http://localhost:5002/api/debug/visual?template=enem90',
            files=files,
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        
        if 'debug_image' in data:
            # Decodificar imagem base64
            debug_img_base64 = data['debug_image']
            debug_img_bytes = base64.b64decode(debug_img_base64)
            debug_img = Image.open(io.BytesIO(debug_img_bytes))
            debug_array = np.array(debug_img)
            
            print(f"✅ Imagem de debug recebida: {debug_array.shape}")
            
            # Converter para BGR (OpenCV)
            if len(debug_array.shape) == 3:
                debug_cv = cv2.cvtColor(debug_array, cv2.COLOR_RGB2BGR)
            else:
                debug_cv = cv2.cvtColor(debug_array, cv2.COLOR_GRAY2BGR)
            
            # Sobrepor gabarito real (mostrar onde DEVERIA ler)
            # Para questões conhecidas, desenhar círculo vermelho onde deveria estar
            opcoes = ["A", "B", "C", "D", "E"]
            base_x = [71, 246, 421, 596, 771, 946]  # Coordenadas atuais
            y_start = 140
            y_step = 23.5
            option_spacing = 24
            
            # Desenhar onde DEVERIA estar (gabarito real)
            for q in range(1, 91):
                q_key = str(q)
                resposta_real = gabarito_real.get(q_key, "").upper()
                
                if resposta_real and resposta_real in opcoes:
                    col = (q - 1) // 15
                    row = (q - 1) % 15
                    y = int(y_start + (row * y_step))
                    idx_resposta = opcoes.index(resposta_real)
                    x = int(base_x[col] + (idx_resposta * option_spacing))
                    
                    # Desenhar círculo vermelho (onde DEVERIA ler)
                    cv2.circle(debug_cv, (x, y), 8, (0, 0, 255), 2)  # Vermelho
                    cv2.putText(debug_cv, f"Q{q}", (x-15, y-15), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.3, (0, 0, 255), 1)
            
            # Salvar imagem
            output_path = '/tmp/debug_calibracao.png'
            cv2.imwrite(output_path, debug_cv)
            print(f"✅ Imagem de calibração salva em: {output_path}")
            print()
            print("💡 Interpretação:")
            print("  - Círculos VERDES: onde o OMR está lendo")
            print("  - Círculos VERMELHOS: onde DEVERIA ler (gabarito real)")
            print("  - Se não coincidem, há deslocamento nas coordenadas")
            
        else:
            print("❌ Resposta não contém debug_image")
            
except Exception as e:
    print(f"❌ Erro: {e}")
    import traceback
    traceback.print_exc()

