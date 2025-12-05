#!/usr/bin/env python3
"""
Script para testar novo gabarito com 3 métodos:
1. OpenCV v4.1 (baseline 48.9%)
2. YOLO (ML-based detection)
3. Template v5.0 (300 DPI - coordenadas HoughCircles)
"""
import requests
import json
import sys

# Gabarito correto (baseado na imagem anexada pelo usuário)
GABARITO_CORRETO = {
    # Bloco 1 (Q01-Q15)
    '1': 'A', '2': 'E', '3': 'A', '4': 'E', '5': 'A', '6': 'E', '7': 'A', '8': 'E', '9': 'A', '10': 'E',
    '11': 'A', '12': 'E', '13': 'A', '14': 'E', '15': 'A',
    # Bloco 2 (Q16-Q30)
    '16': 'C', '17': 'C', '18': 'C', '19': 'E', '20': 'A', '21': 'E', '22': 'A', '23': 'E', '24': 'A', '25': 'E',
    '26': 'A', '27': 'E', '28': 'A', '29': 'E', '30': 'A',
    # Bloco 3 (Q31-Q45)
    '31': 'E', '32': 'A', '33': 'E', '34': 'A', '35': 'E', '36': 'A', '37': 'E', '38': 'A', '39': 'E', '40': 'A',
    '41': 'E', '42': 'A', '43': 'E', '44': 'A', '45': 'E',
    # Bloco 4 (Q46-Q60)
    '46': 'A', '47': 'E', '48': 'A', '49': 'E', '50': 'A', '51': 'A', '52': 'E', '53': 'A', '54': 'E', '55': 'A',
    '56': 'E', '57': 'A', '58': 'E', '59': 'A', '60': 'E',
    # Bloco 5 (Q61-Q75)
    '61': 'A', '62': 'E', '63': 'A', '64': 'E', '65': 'A', '66': 'E', '67': 'A', '68': 'E', '69': 'A', '70': 'E',
    '71': 'A', '72': 'E', '73': 'A', '74': 'E', '75': 'A',
    # Bloco 6 (Q76-Q90)
    '76': 'A', '77': 'E', '78': 'A', '79': 'E', '80': 'A', '81': 'E', '82': 'A', '83': 'E', '84': 'A', '85': 'E',
    '86': 'A', '87': 'E', '88': 'A', '89': 'E', '90': 'A'
}

def testar_metodo(image_path, metodo_nome, query_params, template='enem90'):
    """Testa um método de detecção e retorna acurácia"""
    
    with open(image_path, 'rb') as f:
        img_bytes = f.read()
    
    url = f'http://localhost:5002/api/process-image{query_params}'
    
    response = requests.post(
        url,
        files={'image': ('test.png', img_bytes, 'image/png')},
        data={'page': '1', 'template': template}
    )
    
    if response.status_code != 200:
        print(f"❌ Erro {metodo_nome}: {response.status_code}")
        return 0
    
    data = response.json()
    questoes = data['pagina']['resultado']['questoes']
    
    # Calcular acertos
    acertos = sum(1 for i in range(1, 91) if questoes[str(i)] == GABARITO_CORRETO[str(i)])
    acuracia = acertos / 90 * 100
    
    # Mostrar primeiras questões
    print(f"\n{'='*70}")
    print(f"🧪 TESTE: {metodo_nome}")
    print(f"{'='*70}")
    print(f"📊 Template: {data['pagina']['template']}")
    print(f"🔍 Método: {data['pagina'].get('detection_method', 'N/A')}")
    print(f"✅ Acurácia: {acertos}/90 ({acuracia:.1f}%)")
    
    # Mostrar erros
    erros = []
    for i in range(1, 91):
        if questoes[str(i)] != GABARITO_CORRETO[str(i)]:
            erros.append(f"Q{i}: {questoes[str(i)]} ≠ {GABARITO_CORRETO[str(i)]}")
    
    if erros:
        print(f"\n❌ {len(erros)} Erros encontrados:")
        for i, erro in enumerate(erros[:10]):  # Mostrar até 10 erros
            print(f"  {erro}")
        if len(erros) > 10:
            print(f"  ... e mais {len(erros) - 10} erros")
    else:
        print("\n🎉 100% CORRETO!")
    
    return acuracia

def main():
    if len(sys.argv) < 2:
        print("❌ Uso: python3 testar_novo_gabarito.py <caminho_imagem>")
        print("\nExemplo:")
        print("  python3 testar_novo_gabarito.py attached_assets/gabarito_novo.png")
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    print("🚀 TESTE DE ACURÁCIA - NOVO GABARITO")
    print("=" * 70)
    print(f"📁 Imagem: {image_path}")
    print(f"📝 Gabarito: 90 questões (padrão A/E alternado)")
    print("=" * 70)
    
    resultados = {}
    
    # Teste 1: OpenCV v4.1 (baseline)
    resultados['OpenCV v4.1'] = testar_metodo(
        image_path,
        "OpenCV v4.1 (Coordenadas Fixas)",
        "",
        template='enem90'
    )
    
    # Teste 2: YOLO
    resultados['YOLO'] = testar_metodo(
        image_path,
        "YOLO (ML Detection)",
        "?use_yolo=true",
        template='enem90'
    )
    
    # Teste 3: Template v5.0 (se imagem for 300 DPI)
    # resultados['v5.0'] = testar_metodo(
    #     image_path,
    #     "Template v5.0 (HoughCircles 300 DPI)",
    #     "",
    #     template='enem90_v5'
    # )
    
    # Resumo final
    print(f"\n{'='*70}")
    print("📊 RESUMO FINAL")
    print(f"{'='*70}")
    for metodo, acuracia in sorted(resultados.items(), key=lambda x: x[1], reverse=True):
        emoji = "🥇" if acuracia == max(resultados.values()) else "📊"
        print(f"{emoji} {metodo:30s}: {acuracia:5.1f}%")
    print(f"{'='*70}")

if __name__ == '__main__':
    main()
