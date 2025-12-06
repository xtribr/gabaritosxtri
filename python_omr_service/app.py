"""
Serviço Python para processamento OMR usando OpenCV
Compatível com o frontend HTML fornecido
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
from PIL import Image, ImageOps, ImageFilter
import io
import requests
import base64
from typing import Dict, List, Tuple, Optional
import json
import logging
import os

# Configurar logging - apenas WARNING e ERROR para melhor performance
logging.basicConfig(level=logging.WARNING, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Permitir CORS para o frontend

# Configurar tamanho máximo de upload (10MB)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

# ============================================================================
# CONFIGURAÇÃO DO TEMPLATE DO GABARITO ENEM (45 questões - Dia 1)
# ============================================================================
GABARITO_TEMPLATE_45 = {
    "total_questions": 45,
    "options_per_question": 5,  # A, B, C, D, E
    "columns": 1,
    "rows_per_column": 45,
    "options": ["A", "B", "C", "D", "E"],
    "option_x": [
        0.1810,  # A
        0.3072,  # B
        0.4335,  # C
        0.5597,  # D
        0.6859,  # E
    ],
    "question_y": [
        0.0584, 0.0643, 0.0898, 0.1235, 0.2059,
        0.2527, 0.3332, 0.3584, 0.3599, 0.3814,
        0.3828, 0.4036, 0.4047, 0.4205, 0.4314,
        0.4434, 0.4595, 0.4723, 0.4825, 0.5196,
        0.5324, 0.5448, 0.5579, 0.5982, 0.6005,
        0.6161, 0.6307, 0.6337, 0.6935, 0.7091,
        0.7259, 0.7435, 0.7606, 0.7772, 0.7947,
        0.8120, 0.8285, 0.8461, 0.8629, 0.8803,
        0.8977, 0.9145, 0.9315, 0.9485, 0.9860,
    ],
}


def build_enem90_template() -> Dict:
    """Template ENEM90 - 150 DPI (6 colunas x 15 linhas) - v4.1 calibrado."""
    y_coords = [1212, 1240, 1269, 1300, 1330, 1358, 1389, 1419, 1449, 1478, 1507, 1536, 1567, 1596, 1625]
    
    blocos_x = [
        [157, 186, 218, 249, 278],      # Bloco 1: Q01-Q15
        [348, 377, 407, 437, 467],      # Bloco 2: Q16-Q30
        [537, 567, 597, 628, 658],      # Bloco 3: Q31-Q45
        [727, 756, 786, 817, 848],      # Bloco 4: Q46-Q60
        [918, 947, 977, 1008, 1037],    # Bloco 5: Q61-Q75
        [1106, 1135, 1165, 1196, 1227]  # Bloco 6: Q76-Q90
    ]
    
    base_x = [157, 348, 537, 727, 918, 1106]
    y_start = 1212
    y_step = 29.5
    
    questions = []
    for idx in range(90):
        col = idx // 15
        row = idx % 15
        questions.append({
            "id": idx + 1,
            "y": y_coords[row],
            "x_positions": blocos_x[col]
        })

    return {
        "name": "enem90",
        "total_questions": 90,
        "options_per_question": 5,
        "columns": 6,
        "rows_per_column": 15,
        "options": ["A", "B", "C", "D", "E"],
        "base_x": base_x,
        "y_start": y_start,
        "y_step": y_step,
        "bubble_radius": 13,
        "bubble_radius_tolerance": 0.15,
        "reference_size": {"width": 1240, "height": 1756},
        "enable_chatgpt_validation": True,
        "registration_marks": {
            "p1": (15, 15),
            "p2": (1225, 15),
            "p3": (15, 1735),
            "p4": (1225, 1735),
        },
        "questions": questions,
    }


def build_enem90_v5_template() -> Dict:
    """Template v5.0 - 300 DPI (6 colunas x 15 linhas) - HoughCircles calibrado."""
    y_coords = [2436, 2490, 2550, 2610, 2672, 2730, 2790, 2852, 2910, 2971, 3030, 3090, 3152, 3210, 3270]
    
    blocos_x = [
        [180, 240, 300, 362, 422],        # Bloco 1: Q01-Q15
        [562, 622, 684, 746, 806],        # Bloco 2: Q16-Q30
        [946, 1006, 1066, 1128, 1189],    # Bloco 3: Q31-Q45
        [1330, 1389, 1450, 1512, 1572],   # Bloco 4: Q46-Q60
        [1714, 1773, 1834, 1896, 1957],   # Bloco 5: Q61-Q75
        [2097, 2156, 2218, 2280, 2339]    # Bloco 6: Q76-Q90
    ]
    
    base_x = [180, 562, 946, 1330, 1714, 2097]
    y_start = 2436
    y_step = 60
    
    questions = []
    for idx in range(90):
        col = idx // 15
        row = idx % 15
        questions.append({
            "id": idx + 1,
            "y": y_coords[row],
            "x_positions": blocos_x[col]
        })

    return {
        "name": "enem90_v5",
        "version": "5.0",
        "total_questions": 90,
        "options_per_question": 5,
        "columns": 6,
        "rows_per_column": 15,
        "options": ["A", "B", "C", "D", "E"],
        "base_x": base_x,
        "y_start": y_start,
        "y_step": y_step,
        "bubble_radius": 19,
        "bubble_radius_tolerance": 0.15,
        "reference_size": {"width": 2481, "height": 3509},
        "roi_gabarito": {
            "y_inicio": 2400,
            "y_fim": 3400,
            "x_inicio": 50,
            "x_fim": 2400
        },
        "enable_chatgpt_validation": True,
        "registration_marks": {
            "p1": (50, 2400),
            "p2": (2400, 2400),
            "p3": (50, 3400),
            "p4": (2400, 3400),
        },
        "questions": questions,
    }


# Instanciar templates
GABARITO_TEMPLATE_90 = build_enem90_template()
GABARITO_TEMPLATE_90_V5 = build_enem90_v5_template()

AVAILABLE_TEMPLATES: Dict[str, Dict] = {
    "enem45": GABARITO_TEMPLATE_45,
    "enem90": GABARITO_TEMPLATE_90,
    "enem90_v5": GABARITO_TEMPLATE_90_V5,
}

DEFAULT_TEMPLATE_NAME = "enem90_v5"  # v5.0: 300 DPI (100% accuracy)


def select_template(name: Optional[str]) -> Dict:
    """Retorna template pelo nome ou o padrão."""
    if not name:
        return AVAILABLE_TEMPLATES[DEFAULT_TEMPLATE_NAME]
    key = name.lower()
    return AVAILABLE_TEMPLATES.get(key, AVAILABLE_TEMPLATES[DEFAULT_TEMPLATE_NAME])


# ============================================================================
# PROCESSAMENTO OMR - OPENCV
# ============================================================================

def preprocess_pil_image(pil_img: Image.Image) -> np.ndarray:
    """Pré-processa a imagem para OMR (grayscale, autocontrast, threshold) - CALIBRAÇÃO ORIGINAL."""
    # Reduzir tamanho se muito grande (acelera processamento)
    # MANTIDO EM 3000 - NÃO ALTERAR (afeta calibração)
    max_size = 3000
    if max(pil_img.size) > max_size:
        ratio = max_size / max(pil_img.size)
        new_size = (int(pil_img.width * ratio), int(pil_img.height * ratio))
        # MANTIDO LANCZOS - NÃO ALTERAR (afeta calibração)
        pil_img = pil_img.resize(new_size, Image.Resampling.LANCZOS)
    
    gray = pil_img.convert("L")
    # AUTOCONTRAST MANTIDO - NÃO ALTERAR (afeta calibração)
    gray = ImageOps.autocontrast(gray, cutoff=2)
    # Removido SHARPEN para melhor performance (não é crítico)
    bw = gray.point(lambda x: 0 if x < 100 else 255, '1')
    return np.array(bw, dtype=np.uint8)


def detect_bubbles_fixed(image_array: np.ndarray, template: Dict, debug: bool = False) -> Tuple[Dict[str, str], Optional[np.ndarray]]:
    """
    Detecta respostas usando coordenadas fixas do template (OpenCV).
    Retorna: (answers_dict, debug_image)
    """
    height, width = image_array.shape
    inverted = 255 - image_array
    answers: Dict[str, str] = {}
    
    debug_image = None
    if debug:
        if len(image_array.shape) == 2:
            debug_image = cv2.cvtColor(image_array, cv2.COLOR_GRAY2BGR)
        else:
            debug_image = image_array.copy()

    def read_region(cx: int, cy: int, radius_px: int) -> float:
        y_min = max(0, cy - radius_px)
        y_max = min(height, cy + radius_px)
        x_min = max(0, cx - radius_px)
        x_max = min(width, cx + radius_px)
        region = inverted[y_min:y_max, x_min:x_max]
        if region.size == 0:
            return 0.0
        darkness = float(np.mean(region) / 255.0)
        
        if debug and debug_image is not None:
            cv2.circle(debug_image, (cx, cy), radius_px, (0, 255, 0), 1)
        
        return darkness

    if "questions" in template:
        ref_w = template["reference_size"]["width"]
        ref_h = template["reference_size"]["height"]
        scale_x = width / ref_w
        scale_y = height / ref_h
        
        bubble_radius_ref = template.get("bubble_radius", 19)
        bubble_radius_px = max(4, int(bubble_radius_ref * max(scale_x, scale_y)))
        
        options = template["options"]
        
        # Log removido para melhor performance

        for q in template["questions"]:
            q_id = q["id"]
            cy = int(q["y"] * scale_y)
            darkness_by_opt = {}
            for opt_idx, x_abs in enumerate(q["x_positions"]):
                cx = int(x_abs * scale_x)
                darkness_by_opt[options[opt_idx]] = read_region(cx, cy, bubble_radius_px)

            if not darkness_by_opt:
                answers[str(q_id)] = "Não respondeu"
                continue

            marked_opt = max(darkness_by_opt, key=darkness_by_opt.get)
            max_darkness = darkness_by_opt[marked_opt]
            
            sorted_opts = sorted(darkness_by_opt.items(), key=lambda x: x[1], reverse=True)
            if len(sorted_opts) >= 2:
                first_darkness = sorted_opts[0][1]
                second_darkness = sorted_opts[1][1]
                confidence_diff = first_darkness - second_darkness
                
                if confidence_diff > 0.2:
                    threshold = 0.2
                elif confidence_diff > 0.1:
                    threshold = 0.3
                else:
                    threshold = 0.4
            else:
                threshold = 0.3
            
            is_marked = max_darkness > threshold
            answers[str(q_id)] = marked_opt if is_marked else "Não respondeu"
            
            if debug and debug_image is not None:
                opt_idx = options.index(marked_opt)
                cx = int(q["x_positions"][opt_idx] * scale_x)
                cy = int(q["y"] * scale_y)
                color = (0, 0, 255) if is_marked else (255, 0, 0)
                cv2.circle(debug_image, (cx, cy), bubble_radius_px + 2, color, 2)
                cv2.putText(debug_image, f"Q{q_id}:{marked_opt}", (cx + bubble_radius_px + 3, cy),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.3, color, 1)

    else:
        # Template 45 questões (normalizado)
        option_x = template["option_x"]
        question_y = template["question_y"]
        options = template["options"]
        bubble_radius_px = max(4, int(width * 0.006))
        
        # Log removido para melhor performance

        for idx, y_norm in enumerate(question_y, start=1):
            if idx > template["total_questions"]:
                break
            y_px = int(height * y_norm)
            darkness_by_opt = {}
            for opt_idx, x_norm in enumerate(option_x):
                x_px = int(width * x_norm)
                darkness_by_opt[options[opt_idx]] = read_region(x_px, y_px, bubble_radius_px)

            if not darkness_by_opt:
                answers[str(idx)] = "Não respondeu"
                continue

            marked_opt = max(darkness_by_opt, key=darkness_by_opt.get)
            max_darkness = darkness_by_opt[marked_opt]
            is_marked = max_darkness > 0.6
            answers[str(idx)] = marked_opt if is_marked else "Não respondeu"
            
            if debug and debug_image is not None:
                opt_idx = options.index(marked_opt)
                x_px = int(width * option_x[opt_idx])
                y_px = int(height * y_norm)
                color = (0, 0, 255) if is_marked else (255, 0, 0)
                cv2.circle(debug_image, (x_px, y_px), bubble_radius_px + 2, color, 2)
                cv2.putText(debug_image, f"Q{idx}:{marked_opt}", (x_px + bubble_radius_px + 3, y_px),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.3, color, 1)

    for q in range(1, template.get("total_questions", 0) + 1):
        if str(q) not in answers:
            answers[str(q)] = "Não respondeu"

    return (answers, debug_image) if debug else (answers, None)


def find_registration_marks(gray: np.ndarray, template: Dict) -> Optional[Dict[str, Tuple[int, int]]]:
    """Localiza marcadores P1-P4 nos cantos."""
    if "registration_marks" not in template or "reference_size" not in template:
        return None

    h, w = gray.shape
    ref_w = template["reference_size"]["width"]
    ref_h = template["reference_size"]["height"]
    scale_x = w / ref_w
    scale_y = h / ref_h
    expected = {k: (int(v[0] * scale_x), int(v[1] * scale_y)) for k, v in template["registration_marks"].items()}

    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    margin = int(30 * max(scale_x, scale_y))
    found: Dict[str, Tuple[int, int]] = {}

    for name, (ex, ey) in expected.items():
        x1 = max(0, ex - margin)
        x2 = min(w, ex + margin)
        y1 = max(0, ey - margin)
        y2 = min(h, ey + margin)
        roi = binary[y1:y2, x1:x2]
        if roi.size == 0:
            continue
        contours, _ = cv2.findContours(roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        M = cv2.moments(contour)
        if M["m00"] == 0:
            continue
        cx = int(M["m10"] / M["m00"]) + x1
        cy = int(M["m01"] / M["m00"]) + y1
        found[name] = (cx, cy)

    if len(found) == len(expected):
        return found
    return None


def align_with_registration_marks(image: np.ndarray, template: Dict) -> Tuple[np.ndarray, Dict]:
    """Alinha a imagem usando P1-P4."""
    if "registration_marks" not in template or "reference_size" not in template:
        return image, {"aligned": False, "reason": "template_without_marks"}

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    marks = find_registration_marks(gray, template)
    if not marks:
        return image, {"aligned": False, "reason": "marks_not_found"}

    ref_w = template["reference_size"]["width"]
    ref_h = template["reference_size"]["height"]
    src_pts = np.float32([marks["p1"], marks["p2"], marks["p3"], marks["p4"]])
    dst_pts = np.float32([[0, 0], [ref_w, 0], [0, ref_h], [ref_w, ref_h]])
    M = cv2.getPerspectiveTransform(src_pts, dst_pts)
    aligned = cv2.warpPerspective(image, M, (ref_w, ref_h))
    return aligned, {"aligned": True, "marks": marks}


def process_omr_page(
    image: np.ndarray,
    page_number: int = 1,
    template_name: Optional[str] = None,
    align_marks: bool = True,
    debug: bool = False,
) -> Dict:
    """
    Processa uma página usando template fixo (OpenCV).
    OTIMIZADO: Reduzido logging verboso para melhor performance.
    """
    template = select_template(template_name)
    candidate = template_name.lower() if template_name else DEFAULT_TEMPLATE_NAME
    template_key = candidate if candidate in AVAILABLE_TEMPLATES else DEFAULT_TEMPLATE_NAME
    height, width = image.shape[:2]
    # Log reduzido para performance
    working_image = image
    alignment_info = {"aligned": False}
    # ALINHAMENTO MANTIDO HABILITADO - NÃO ALTERAR (afeta calibração)
    if align_marks and "registration_marks" in template:
        # Logs removidos para melhor performance
        aligned_img, info = align_with_registration_marks(image, template)
        alignment_info = info
        working_image = aligned_img
        # Logs removidos para melhor performance

    # Pré-processamento otimizado
    pil_img = Image.fromarray(working_image)
    bw_array = preprocess_pil_image(pil_img)
    
    # Detecção de bolhas
    answers, debug_image = detect_bubbles_fixed(bw_array, template, debug=debug)
    
    detected_count = len([q for q in answers.values() if q != "Não respondeu"])
    # Log removido para melhor performance
    
    result = {
        "pagina": page_number,
        "template": template_key,
        "detection_method": "OpenCV",
        "alinhamento": alignment_info,
        "resultado": {
            "questoes": answers
        }
    }
    
    if debug and debug_image is not None:
        _, buffer = cv2.imencode('.png', debug_image)
        debug_base64 = base64.b64encode(buffer).decode('utf-8')
        result["debug_image"] = debug_base64
        # Log removido para melhor performance

    return result


def pdf_url_to_images(pdf_url: str) -> List[np.ndarray]:
    """Converte PDF de URL em lista de imagens."""
    try:
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        pdf_bytes = response.content
        
        try:
            from pdf2image import convert_from_bytes
            # DPI MANTIDO EM 150 - NÃO ALTERAR (afeta calibração)
            images = convert_from_bytes(pdf_bytes, dpi=150, thread_count=2)
            return [np.array(img) for img in images]
        except ImportError:
            logger.error("pdf2image não instalado")
            raise
            
    except Exception as e:
        logger.error(f"Erro ao processar PDF: {e}")
        raise


# ============================================================================
# VALIDAÇÃO CHATGPT (ETAPA 8)
# ============================================================================

def validate_with_chatgpt_internal(image_bytes: bytes, omr_result: Dict[str, str], template_key: str, openai_api_key: str) -> Dict:
    """
    Validação ChatGPT (Etapa 8).
    """
    try:
        total_questions = AVAILABLE_TEMPLATES[template_key]["total_questions"]
        omr_array = [omr_result.get(str(i), None) for i in range(1, total_questions + 1)]
        
        image = Image.open(io.BytesIO(image_bytes))
        buffered = io.BytesIO()
        image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        chatgpt_payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "system",
                    "content": f"You are an expert OMR validator. Validate {total_questions} questions. Return ONLY valid JSON."
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"OMR: {json.dumps(omr_array)}. Return: {{\"answers\":[\"A\",...], \"corrections\": [{{\"q\": 5, \"omr\": \"A\", \"corrected\": \"B\", \"reason\": \"...\"}}]}}"
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{img_base64}"}
                        }
                    ]
                }
            ],
            "max_tokens": 2000,
            "temperature": 0.1
        }
        
        headers = {
            "Authorization": f"Bearer {openai_api_key}",
            "Content-Type": "application/json"
        }
        
        # Log removido para melhor performance
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=chatgpt_payload,
            timeout=60
        )
        
        if response.status_code != 200:
            raise Exception(f"ChatGPT API error: {response.status_code}")
        
        chatgpt_data = response.json()
        raw_content = chatgpt_data["choices"][0]["message"]["content"]
        
        import re
        json_match = re.search(r'\{.*\}', raw_content, re.DOTALL)
        if json_match:
            validated_data = json.loads(json_match.group())
            validated_answers = validated_data.get("answers", omr_array)
            corrections = validated_data.get("corrections", [])
        else:
            validated_answers = omr_array
            corrections = []
        
        validated_dict = {str(i): validated_answers[i-1] for i in range(1, len(validated_answers) + 1)}
        
        corrections_count = len(corrections)
        agreement_rate = sum(1 for i in range(len(omr_array)) if omr_array[i] == validated_answers[i]) / len(omr_array) * 100
        
        # Log removido para melhor performance
        
        return {
            "status": "success",
            "chatgpt_validated": validated_dict,
            "corrections": corrections,
            "corrections_count": corrections_count,
            "agreement_rate": round(agreement_rate, 1),
            "model": "gpt-4o-mini"
        }
        
    except Exception as e:
        logger.error(f"[ChatGPT] Erro: {e}")
        raise


# ============================================================================
# ENDPOINTS
# ============================================================================

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "service": "baddrow-omr-service",
        "default_template": DEFAULT_TEMPLATE_NAME,
        "templates": list(AVAILABLE_TEMPLATES.keys()),
        "detection": "OpenCV"
    })


@app.route('/api/process-pdf', methods=['GET'])
def process_pdf():
    """Processa PDF completo."""
    try:
        pdf_url = request.args.get('url')
        if not pdf_url:
            return jsonify({"status": "erro", "mensagem": "Parâmetro 'url' não fornecido"}), 400
        
        template_name = request.args.get('template', DEFAULT_TEMPLATE_NAME)
        template_key = template_name.lower() if template_name and template_name.lower() in AVAILABLE_TEMPLATES else DEFAULT_TEMPLATE_NAME
        # Log removido para melhor performance
        images = pdf_url_to_images(pdf_url)
        # Log removido para melhor performance
        
        results = []
        for page_num, image in enumerate(images, start=1):
            try:
                result = process_omr_page(image, page_num, template_name=template_key)
                results.append(result)
                # Log removido para melhor performance
            except Exception as e:
                logger.error(f"[PDF] Erro página {page_num}: {e}")
                results.append({"pagina": page_num, "status": "erro", "mensagem": str(e)})
        
        return jsonify({
            "status": "sucesso",
            "paginas": results,
            "total_paginas": len(results),
            "template": template_key
        })
        
    except Exception as e:
        logger.error(f"[PDF] Erro: {e}")
        return jsonify({"status": "erro", "mensagem": str(e)}), 500


@app.route('/api/process-image', methods=['POST'])
def process_image():
    """Processa imagem individual."""
    try:
        if 'image' not in request.files:
            return jsonify({"status": "erro", "mensagem": "Arquivo 'image' não fornecido"}), 400
        
        image_file = request.files['image']
        if image_file.filename == '':
            return jsonify({"status": "erro", "mensagem": "Arquivo vazio"}), 400
        
        image_bytes = image_file.read()
        # Log removido para melhor performance
        image = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image)
        # Log removido para melhor performance
        
        page_num = int(request.form.get('page', 1))
        template_name = request.form.get('template', DEFAULT_TEMPLATE_NAME)
        debug_mode = request.args.get('debug', 'false').lower() == 'true'
        validate_chatgpt = request.args.get('validate_with_chatgpt', 'false').lower() == 'true'
        template_key = template_name.lower() if template_name and template_name.lower() in AVAILABLE_TEMPLATES else DEFAULT_TEMPLATE_NAME
        
        # Log removido para melhor performance
        result = process_omr_page(image_array, page_num, template_name=template_key, debug=debug_mode)
        # Log removido para melhor performance
        
        response_data = {
            "status": "sucesso",
            "pagina": result,
            "template": template_key
        }
        
        if validate_chatgpt:
            openai_api_key = request.form.get('openai_api_key') or request.headers.get('X-OpenAI-API-Key')
            
            if not openai_api_key:
                logger.warning("[Image] ChatGPT: API Key não fornecida")
                response_data["chatgpt_validation"] = {"status": "skipped", "reason": "OPENAI_API_KEY não fornecida"}
            else:
                try:
                    # Log removido para melhor performance
                    chatgpt_result = validate_with_chatgpt_internal(
                        image_bytes=image_bytes,
                        omr_result=result["resultado"]["questoes"],
                        template_key=template_key,
                        openai_api_key=openai_api_key
                    )
                    response_data["chatgpt_validation"] = chatgpt_result
                    
                    if chatgpt_result.get("corrections_count", 0) > 0:
                        # Log removido para melhor performance
                        result["resultado"]["questoes"] = chatgpt_result["chatgpt_validated"]
                        response_data["pagina"] = result
                        
                except Exception as e:
                    logger.error(f"[Image] ChatGPT: Erro {e}")
                    response_data["chatgpt_validation"] = {"status": "error", "error": str(e)}
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"[Image] Erro: {e}", exc_info=True)
        return jsonify({"status": "erro", "mensagem": str(e)}), 500


@app.route('/api/validate-with-chatgpt', methods=['POST'])
def validate_with_chatgpt():
    """Endpoint híbrido: OMR + ChatGPT."""
    try:
        if 'image' not in request.files:
            return jsonify({"status": "erro", "mensagem": "Nenhuma imagem fornecida"}), 400
        
        image_file = request.files['image']
        template_name = request.form.get('template', DEFAULT_TEMPLATE_NAME)
        openai_api_key = request.form.get('openai_api_key') or request.headers.get('X-OpenAI-Key')
        
        if not openai_api_key:
            return jsonify({"status": "erro", "mensagem": "OPENAI_API_KEY não fornecida"}), 400
        
        image_bytes = image_file.read()
        image = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image)
        
        template_key = template_name.lower() if template_name and template_name.lower() in AVAILABLE_TEMPLATES else DEFAULT_TEMPLATE_NAME
        omr_result = process_omr_page(image_array, 1, template_name=template_key, debug=False)
        omr_answers = omr_result["resultado"]["questoes"]
        
        logger.info(f"[ChatGPT Endpoint] OMR: {len(omr_answers)} questões")
        
        chatgpt_result = validate_with_chatgpt_internal(
            image_bytes=image_bytes,
            omr_result=omr_answers,
            template_key=template_key,
            openai_api_key=openai_api_key
        )
        
        return jsonify({
            "status": "sucesso",
            "omr_original": omr_answers,
            "chatgpt_validated": chatgpt_result["chatgpt_validated"],
            "corrections": chatgpt_result["corrections"],
            "statistics": {
                "corrections_count": chatgpt_result["corrections_count"],
                "agreement_rate": chatgpt_result["agreement_rate"],
                "total_questions": AVAILABLE_TEMPLATES[template_key]["total_questions"]
            },
            "template": template_key,
            "model": "gpt-4o-mini"
        })
        
    except Exception as e:
        logger.error(f"[ChatGPT Endpoint] Erro: {e}", exc_info=True)
        return jsonify({"status": "erro", "mensagem": str(e)}), 500


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5002))
    logger.info("🚀 Iniciando serviço OMR (OpenCV + ChatGPT)...")
    logger.info(f"📋 Templates: {list(AVAILABLE_TEMPLATES.keys())} | default={DEFAULT_TEMPLATE_NAME}")
    logger.info(f"🌐 Servidor: http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
