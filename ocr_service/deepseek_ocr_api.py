#!/usr/bin/env python3
"""
DeepSeek-OCR API Service
Serviço REST para processar OCR usando DeepSeek-OCR do Hugging Face
"""

import os
import sys
import base64
import json
from io import BytesIO
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import torch

# Configurar GPU se disponível
os.environ["CUDA_VISIBLE_DEVICES"] = os.getenv("CUDA_VISIBLE_DEVICES", "0")

app = Flask(__name__)
CORS(app)  # Permitir CORS para requisições do frontend

# Variáveis globais para o modelo
model = None
tokenizer = None
device = None

def load_model():
    """Carrega o modelo DeepSeek-OCR"""
    global model, tokenizer, device
    
    if model is not None:
        return  # Já carregado
    
    try:
        print("[DeepSeek-OCR] Carregando modelo...")
        from transformers import AutoModel, AutoTokenizer
        
        model_name = 'deepseek-ai/DeepSeek-OCR'
        
        # Carregar tokenizer
        print(f"[DeepSeek-OCR] Carregando tokenizer de {model_name}...")
        tokenizer = AutoTokenizer.from_pretrained(
            model_name, 
            trust_remote_code=True
        )
        
        # Carregar modelo
        print(f"[DeepSeek-OCR] Carregando modelo de {model_name}...")
        model = AutoModel.from_pretrained(
            model_name,
            _attn_implementation='flash_attention_2' if torch.cuda.is_available() else 'sdpa',
            trust_remote_code=True,
            use_safetensors=True
        )
        
        # Mover para GPU se disponível
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = model.eval().to(device)
        
        if device == "cuda":
            model = model.to(torch.bfloat16)
            print(f"[DeepSeek-OCR] Modelo carregado na GPU (bfloat16)")
        else:
            print(f"[DeepSeek-OCR] Modelo carregado na CPU (float32)")
        
        print("[DeepSeek-OCR] ✅ Modelo carregado com sucesso!")
        
    except Exception as e:
        print(f"[DeepSeek-OCR] ❌ Erro ao carregar modelo: {e}")
        raise

def process_image_ocr(image_bytes: bytes, prompt: str = "<image>\nFree OCR.") -> dict:
    """
    Processa uma imagem usando DeepSeek-OCR
    
    Args:
        image_bytes: Bytes da imagem
        prompt: Prompt para o modelo (padrão: OCR livre)
    
    Returns:
        dict com texto extraído e confiança
    """
    global model, tokenizer
    
    if model is None or tokenizer is None:
        load_model()
    
    try:
        # Carregar imagem
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        
        # Salvar temporariamente para o modelo
        temp_path = "/tmp/deepseek_temp_image.jpg"
        image.save(temp_path, "JPEG", quality=95)
        
        # Processar com DeepSeek-OCR
        # Configuração: base_size=1024, image_size=640, crop_mode=True (Gundam mode)
        result = model.infer(
            tokenizer,
            prompt=prompt,
            image_file=temp_path,
            output_path="/tmp",
            base_size=1024,
            image_size=640,
            crop_mode=True,
            save_results=False,
            test_compress=False
        )
        
        # Extrair texto do resultado
        extracted_text = result if isinstance(result, str) else str(result)
        
        # Limpar arquivo temporário
        if os.path.exists(temp_path):
            os.remove(temp_path)
        
        return {
            "text": extracted_text.strip(),
            "confidence": 0.95,  # DeepSeek-OCR é muito preciso
            "words": []  # DeepSeek não retorna palavras individuais por padrão
        }
        
    except Exception as e:
        print(f"[DeepSeek-OCR] Erro ao processar imagem: {e}")
        return {
            "text": "",
            "confidence": 0.0,
            "words": [],
            "error": str(e)
        }

@app.route('/health', methods=['GET'])
def health():
    """Endpoint de health check"""
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "device": device if device else "unknown"
    })

@app.route('/ocr', methods=['POST'])
def ocr_endpoint():
    """
    Endpoint principal para OCR
    
    Body (JSON):
    {
        "image": "base64_encoded_image",
        "prompt": "opcional - prompt customizado"
    }
    """
    try:
        data = request.get_json()
        
        if not data or "image" not in data:
            return jsonify({
                "error": "Missing 'image' field in request body"
            }), 400
        
        # Decodificar imagem base64
        try:
            image_base64 = data["image"]
            # Remover prefixo data:image/...;base64, se presente
            if "," in image_base64:
                image_base64 = image_base64.split(",")[1]
            
            image_bytes = base64.b64decode(image_base64)
        except Exception as e:
            return jsonify({
                "error": f"Invalid base64 image: {str(e)}"
            }), 400
        
        # Obter prompt (opcional)
        prompt = data.get("prompt", "<image>\nFree OCR.")
        
        # Processar OCR
        result = process_image_ocr(image_bytes, prompt)
        
        return jsonify(result)
        
    except Exception as e:
        print(f"[DeepSeek-OCR API] Erro: {e}")
        return jsonify({
            "error": str(e),
            "text": "",
            "confidence": 0.0
        }), 500

@app.route('/ocr/batch', methods=['POST'])
def ocr_batch():
    """
    Endpoint para processar múltiplas imagens
    
    Body (JSON):
    {
        "images": ["base64_1", "base64_2", ...],
        "prompt": "opcional"
    }
    """
    try:
        data = request.get_json()
        
        if not data or "images" not in data:
            return jsonify({
                "error": "Missing 'images' field in request body"
            }), 400
        
        images = data["images"]
        prompt = data.get("prompt", "<image>\nFree OCR.")
        
        results = []
        for i, image_base64 in enumerate(images):
            try:
                # Decodificar
                if "," in image_base64:
                    image_base64 = image_base64.split(",")[1]
                image_bytes = base64.b64decode(image_base64)
                
                # Processar
                result = process_image_ocr(image_bytes, prompt)
                results.append(result)
            except Exception as e:
                results.append({
                    "text": "",
                    "confidence": 0.0,
                    "error": str(e)
                })
        
        return jsonify({
            "results": results
        })
        
    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500

if __name__ == "__main__":
    print("[DeepSeek-OCR API] Iniciando servidor...")
    
    # Carregar modelo na inicialização
    try:
        load_model()
    except Exception as e:
        print(f"[DeepSeek-OCR API] ⚠️  Aviso: Não foi possível carregar modelo na inicialização: {e}")
        print("[DeepSeek-OCR API] O modelo será carregado na primeira requisição.")
    
    # Iniciar servidor Flask
    port = int(os.getenv("OCR_PORT", "5001"))
    print(f"[DeepSeek-OCR API] Servidor rodando na porta {port}")
    print(f"[DeepSeek-OCR API] Endpoints disponíveis:")
    print(f"  - GET  /health")
    print(f"  - POST /ocr")
    print(f"  - POST /ocr/batch")
    
    app.run(host="0.0.0.0", port=port, debug=False)


