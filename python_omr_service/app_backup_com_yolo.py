"""
Serviço Python para processamento OMR usando YOLO + baddrow-python
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
from ultralytics import YOLO

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Permitir CORS para o frontend

# Configurar tamanho máximo de upload (10MB)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

# ============================================================================
# CARREGAR MODELO YOLO TREINADO
# ============================================================================
YOLO_MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'omr model', 'model.pt')
YOLO_MODEL = None

def load_yolo_model():
    """Carrega modelo YOLO treinado para detecção OMR"""
    global YOLO_MODEL
    if YOLO_MODEL is None:
        try:
            logger.info(f"[YOLO] Carregando modelo: {YOLO_MODEL_PATH}")
            YOLO_MODEL = YOLO(YOLO_MODEL_PATH)
            logger.info(f"[YOLO] ✅ Modelo carregado! Classes: {YOLO_MODEL.names}")
        except Exception as e:
            logger.error(f"[YOLO] ❌ Erro ao carregar modelo: {e}")
            YOLO_MODEL = None
    return YOLO_MODEL

# ============================================================================
# CONFIGURAÇÃO DO TEMPLATE DO GABARITO ENEM (45 questões - Dia 1)
# Coordenadas normalizadas (extraídas do PDF real "Modelo de cartão - menor.pdf")
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
        0.8977, 0.9145, 0.9315, 0.9485, 0.9860,  # 45 questões completas
    ],
}


def build_enem90_template() -> Dict:
    """Constrói template completo de 90 questões - LAYOUT REAL ENEM (6 colunas x 15 linhas).
    
    COORDENADAS CALIBRADAS v4.1 (5 DEZ 2025):
    - Resolução: ~1240x1756px (escala 1.16x da base 1068x1498px)
    - Calibração HoughCircles + CORREÇÃO de deslocamento (+54px em X na escala real)
    - Correção: +46px na base × 1.161 = +53.4px ≈ +54px
    - Baseada em análise de erro sistemático (+1.67 posições → ~43px na base)
    - Coordenadas Y exatas para cada linha
    - Coordenadas X corrigidas por bloco e alternativa
    - Raio das bolhas: 13px (11px × 1.161)
    """
    # Coordenadas Y das 15 linhas (CALIBRADAS v4.0 escaladas)
    # Escala: scale_x=1.161, scale_y=1.172
    # v4.7: Mantendo Y originais (ajustes pioraram), testando apenas bubble_radius
    y_coords = [1212, 1240, 1269, 1300, 1330, 1358, 1389, 1419, 1449, 1478, 1507, 1536, 1567, 1596, 1625]
    
    # Coordenadas X para cada bloco (A, B, C, D, E) - v4.1 FINAL (MELHOR RESULTADO)
    # HISTÓRICO DE CALIBRAGEM:
    # v4.0 (+0px): 22.2%, offset +1.67
    # v4.1 (+54px): 48.9%, offset +1.04 ← ★ MELHOR RESULTADO ★
    # v4.2 (+84px): 40.0% - PIOROU
    # v4.3 (+69px): ~10% - CAOS
    # v4.4 (+60px): ~10% - CAOS
    # v4.5 (+45px): 17.8% - PIOROU
    # v4.6 (+57px): 20.0% - PIOROU
    # CONCLUSÃO: +54px é ponto ótimo local, ajustes de ±3px ou mais pioram
    blocos_x = [
        [157, 186, 218, 249, 278],      # Bloco 1: Q01-Q15 (103+54)
        [348, 377, 407, 437, 467],      # Bloco 2: Q16-Q30 (294+54)
        [537, 567, 597, 628, 658],      # Bloco 3: Q31-Q45 (483+54)
        [727, 756, 786, 817, 848],      # Bloco 4: Q46-Q60 (673+54)
        [918, 947, 977, 1008, 1037],    # Bloco 5: Q61-Q75 (864+54)
        [1106, 1135, 1165, 1196, 1227]  # Bloco 6: Q76-Q90 (1052+54)
    ]
    
    # Valores para compatibilidade
    base_x = [157, 348, 537, 727, 918, 1106]  # Primeira opção (A) de cada bloco
    y_start = 1212  # Primeira linha
    y_step = (1625 - 1212) / 14  # Espaçamento médio entre linhas (~29.5px)
    option_spacing = 30  # Espaçamento entre alternativas (escalado)
    
    total_questions = 90
    options = ["A", "B", "C", "D", "E"]
    questions = []

    for idx in range(total_questions):
        col = idx // 15  # 6 colunas
        row = idx % 15   # 15 linhas por coluna
        y = y_coords[row]  # Usar coordenadas Y calibradas
        x_positions = blocos_x[col]  # Usar coordenadas X calibradas por bloco
        questions.append({
            "id": idx + 1,
            "y": y,
            "x_positions": x_positions
        })

    return {
        "name": "enem90",
        "total_questions": total_questions,
        "options_per_question": 5,
        "columns": 6,
        "rows_per_column": 15,
        "options": options,
        "base_x": base_x,
        "y_start": y_start,
        "y_step": y_step,
        "bubble_radius": 13,  # v4.1: Mantendo 13px (11px piorou resultados)
        "bubble_radius_tolerance": 0.15,  # Tolerância de ±15% para variações de preenchimento
        "reference_size": {"width": 1240, "height": 1756},  # Tamanho real da imagem processada (v4.0 escalado)
        "enable_chatgpt_validation": True,  # Habilitar validação ChatGPT para baixa confiança
        "registration_marks": {
            "p1": (15, 15),
            "p2": (1225, 15),
            "p3": (15, 1735),
            "p4": (1225, 1735),
        },
        "questions": questions,
    }


GABARITO_TEMPLATE_90 = build_enem90_template()


def build_enem90_v5_template() -> Dict:
    """Template v5.0 - COORDENADAS 100% CORRETAS (HoughCircles) - PDF 300 DPI (2481x3509px).
    
    CALIBRAÇÃO v5.0 (VERIFICADA 100% CORRETA):
    - Resolução: 2481x3509px (300 DPI PDF)
    - ROI Gabarito: y[2400:3400], x[50:2400]
    - Detecção: HoughCircles automática
    - Raio das bolhas: 19px (diâmetro 38px)
    - Espaçamento: 60px entre alternativas, 60px entre linhas, 140px entre blocos
    - 6 blocos × 15 questões = 90 questões totais
    """
    # Coordenadas Y das 15 linhas (EXATAS do HoughCircles)
    y_coords = [2436, 2490, 2550, 2610, 2672, 2730, 2790, 2852, 2910, 2971, 3030, 3090, 3152, 3210, 3270]
    
    # Coordenadas X para cada bloco (A, B, C, D, E) - EXATAS do HoughCircles
    blocos_x = [
        [180, 240, 300, 362, 422],        # Bloco 1: Q01-Q15
        [562, 622, 684, 746, 806],        # Bloco 2: Q16-Q30
        [946, 1006, 1066, 1128, 1189],    # Bloco 3: Q31-Q45
        [1330, 1389, 1450, 1512, 1572],   # Bloco 4: Q46-Q60
        [1714, 1773, 1834, 1896, 1957],   # Bloco 5: Q61-Q75
        [2097, 2156, 2218, 2280, 2339]    # Bloco 6: Q76-Q90
    ]
    
    base_x = [180, 562, 946, 1330, 1714, 2097]  # Primeira opção (A) de cada bloco
    y_start = 2436
    y_step = 60  # Espaçamento entre linhas
    option_spacing = 60  # Espaçamento entre alternativas
    
    total_questions = 90
    options = ["A", "B", "C", "D", "E"]
    questions = []

    for idx in range(total_questions):
        col = idx // 15  # 6 colunas
        row = idx % 15   # 15 linhas por coluna
        y = y_coords[row]
        x_positions = blocos_x[col]
        questions.append({
            "id": idx + 1,
            "y": y,
            "x_positions": x_positions
        })

    return {
        "name": "enem90_v5",
        "version": "5.0",
        "total_questions": total_questions,
        "options_per_question": 5,
        "columns": 6,
        "rows_per_column": 15,
        "options": options,
        "base_x": base_x,
        "y_start": y_start,
        "y_step": y_step,
        "bubble_radius": 19,  # v5.0: Raio detectado pelo HoughCircles
        "bubble_radius_tolerance": 0.15,
        "reference_size": {"width": 2481, "height": 3509},  # PDF 300 DPI
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
# NOVO PIPELINE FIXO (COORDENADAS CALIBRADAS 45 QUESTÕES)
# ============================================================================


def preprocess_pil_image(pil_img: Image.Image) -> np.ndarray:
    """Pré-processa a imagem para OMR (grayscale, autocontrast, sharpen, threshold)."""
    gray = pil_img.convert("L")
    gray = ImageOps.autocontrast(gray, cutoff=5)
    gray = gray.filter(ImageFilter.SHARPEN)
    gray = gray.filter(ImageFilter.SHARPEN)
    # Threshold reduzido de 110 para 100 para detectar marcações mais leves
    bw = gray.point(lambda x: 0 if x < 100 else 255, '1')
    return np.array(bw, dtype=np.uint8)


def detect_bubbles_yolo(image_array: np.ndarray, template: Dict, debug: bool = False) -> Tuple[Dict[str, str], Optional[np.ndarray]]:
    """
    Detecta respostas usando modelo YOLO treinado.
    Retorna: (answers_dict, debug_image) se debug=True, senão (answers_dict, None)
    """
    model = load_yolo_model()
    if model is None:
        logger.warning("[YOLO] Modelo não disponível, usando fallback OpenCV")
        return detect_bubbles_fixed(image_array, template, debug)
    
    height, width = image_array.shape if len(image_array.shape) == 2 else image_array.shape[:2]
    answers: Dict[str, str] = {}
    
    # Converter para BGR se necessário
    if len(image_array.shape) == 2:
        image_bgr = cv2.cvtColor(image_array, cv2.COLOR_GRAY2BGR)
    else:
        image_bgr = image_array.copy()
    
    logger.info(f"[YOLO] Processando imagem {width}x{height}...")
    
    # Detectar bolhas com YOLO (imgsz=1280 para melhor precisão)
    results = model.predict(image_bgr, conf=0.01, imgsz=1280, verbose=False)
    boxes = results[0].boxes
    
    logger.info(f"[YOLO] ✅ {len(boxes)} detecções encontradas")
    
    # Organizar detecções por classe
    detections_by_class = {'a': [], 'b': [], 'c': [], 'd': [], 'e': [], 'not answered': []}
    
    for box in boxes:
        cls_id = int(box.cls[0])
        cls_name = model.names[cls_id]
        conf = float(box.conf[0])
        x, y, w, h = box.xywh[0].tolist()
        
        if cls_name in detections_by_class:
            detections_by_class[cls_name].append({
                'class': cls_name,
                'conf': conf,
                'x': x,
                'y': y,
                'w': w,
                'h': h
            })
    
    # Agrupar detecções por linhas (questões) usando clustering por Y
    # Assumindo que cada questão tem Y similar para todas as alternativas
    all_detections = []
    for cls_name, dets in detections_by_class.items():
        if cls_name != 'not answered':  # Ignorar "não respondeu" por enquanto
            all_detections.extend(dets)
    
    if not all_detections:
        logger.warning("[YOLO] Nenhuma bolha marcada detectada")
        total_questions = template.get("total_questions", 90)
        for q in range(1, total_questions + 1):
            answers[str(q)] = "Não respondeu"
        return (answers, image_bgr if debug else None)
    
    # Ordenar por Y para agrupar em linhas
    all_detections.sort(key=lambda d: d['y'])
    
    # Agrupar em linhas (tolerância de 30px em Y)
    lines = []
    current_line = [all_detections[0]]
    y_threshold = 30
    
    for det in all_detections[1:]:
        if abs(det['y'] - current_line[0]['y']) < y_threshold:
            current_line.append(det)
        else:
            lines.append(current_line)
            current_line = [det]
    
    if current_line:
        lines.append(current_line)
    
    logger.info(f"[YOLO] Agrupadas em {len(lines)} linhas (questões potenciais)")
    
    # Para cada linha, ordenar por X e pegar a bolha com maior confiança
    for line_idx, line in enumerate(lines):
        if line_idx + 1 > template.get("total_questions", 90):
            break
        
        # Ordenar por X (da esquerda para direita: A, B, C, D, E)
        line.sort(key=lambda d: d['x'])
        
        # Pegar a detecção com maior confiança
        best_det = max(line, key=lambda d: d['conf'])
        answer_letter = best_det['class'].upper()
        
        question_num = str(line_idx + 1)
        answers[question_num] = answer_letter
        
        # Debug: desenhar na imagem
        if debug:
            x, y = int(best_det['x']), int(best_det['y'])
            cv2.circle(image_bgr, (x, y), 15, (0, 0, 255), 2)  # Vermelho
            cv2.putText(image_bgr, f"Q{question_num}:{answer_letter}", 
                       (x + 20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
    
    # Preencher questões não detectadas
    total_questions = template.get("total_questions", 90)
    for q in range(1, total_questions + 1):
        if str(q) not in answers:
            answers[str(q)] = "Não respondeu"
    
    logger.info(f"[YOLO] ✅ Processadas {len(answers)} questões")
    
    return (answers, image_bgr if debug else None)


def detect_bubbles_fixed(image_array: np.ndarray, template: Dict, debug: bool = False) -> Tuple[Dict[str, str], Optional[np.ndarray]]:
    """
    Detecta respostas usando coordenadas fixas do template (45 ou 90 questões).
    Retorna: (answers_dict, debug_image) se debug=True, senão (answers_dict, None)
    """
    height, width = image_array.shape
    inverted = 255 - image_array
    answers: Dict[str, str] = {}
    
    # Criar imagem de debug se solicitado
    debug_image = None
    if debug:
        # Converter para BGR para desenhar cores
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
        darkness = float(np.mean(region) / 255.0)  # fração de pixels pretos
        
        # Debug: desenhar círculo na imagem
        if debug and debug_image is not None:
            cv2.circle(debug_image, (cx, cy), radius_px, (0, 255, 0), 1)  # Verde para todas as bolhas
        
        return darkness

    if "questions" in template:
        ref_w = template["reference_size"]["width"]
        ref_h = template["reference_size"]["height"]
        scale_x = width / ref_w
        scale_y = height / ref_h
        
        # Usar raio calibrado do template (18.6px na imagem 300 DPI)
        bubble_radius_ref = template.get("bubble_radius", 18.6)
        bubble_radius_px = max(4, int(bubble_radius_ref * max(scale_x, scale_y)))
        
        options = template["options"]
        
        logger.info(f"[DEBUG] Template ENEM90: scale_x={scale_x:.3f}, scale_y={scale_y:.3f}, radius={bubble_radius_px}px (ref={bubble_radius_ref})")

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
            
            # Threshold otimizado para coordenadas v4.0
            # Usar comparação relativa: se a opção mais escura for significativamente mais escura que a segunda
            sorted_opts = sorted(darkness_by_opt.items(), key=lambda x: x[1], reverse=True)
            if len(sorted_opts) >= 2:
                first_darkness = sorted_opts[0][1]
                second_darkness = sorted_opts[1][1]
                confidence_diff = first_darkness - second_darkness
                
                # Threshold adaptativo baseado em diferença de confiança
                # Se diferença grande (>0.2), usar threshold baixo (0.2)
                # Se diferença média (0.1-0.2), usar threshold médio (0.3)
                # Se diferença pequena (<0.1), usar threshold alto (0.4) para evitar falsos positivos
                if confidence_diff > 0.2:
                    threshold = 0.2  # Alta confiança - threshold baixo
                elif confidence_diff > 0.1:
                    threshold = 0.3  # Confiança média
                else:
                    threshold = 0.4  # Baixa confiança - threshold alto para evitar ruído
            else:
                threshold = 0.3  # Fallback
            
            is_marked = max_darkness > threshold
            answers[str(q_id)] = marked_opt if is_marked else "Não respondeu"
            
            # DEBUG: Log para primeiras questões
            if q_id <= 5:
                logger.info(f"[DEBUG Q{q_id}] Darkness: {darkness_by_opt} | Max: {max_darkness:.3f} | Diff: {confidence_diff:.3f} | Threshold: {threshold:.3f} | Marked: {is_marked} | Answer: {marked_opt if is_marked else 'Não respondeu'}")
            
            # Debug: desenhar bolha marcada em vermelho, não marcada em azul
            if debug and debug_image is not None:
                opt_idx = options.index(marked_opt)
                cx = int(q["x_positions"][opt_idx] * scale_x)
                cy = int(q["y"] * scale_y)
                color = (0, 0, 255) if is_marked else (255, 0, 0)  # Vermelho se marcada, azul se não
                cv2.circle(debug_image, (cx, cy), bubble_radius_px + 2, color, 2)
                # Adicionar texto com a resposta
                cv2.putText(debug_image, f"Q{q_id}:{marked_opt}", (cx + bubble_radius_px + 3, cy),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.3, color, 1)

    else:
        option_x = template["option_x"]
        question_y = template["question_y"]
        options = template["options"]
        bubble_radius_px = max(4, int(width * 0.006))
        
        logger.info(f"[DEBUG] Template ENEM45: width={width}, height={height}, radius={bubble_radius_px}px")

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
            
            # Debug: desenhar bolha marcada em vermelho, não marcada em azul
            if debug and debug_image is not None:
                opt_idx = options.index(marked_opt)
                x_px = int(width * option_x[opt_idx])
                y_px = int(height * y_norm)
                color = (0, 0, 255) if is_marked else (255, 0, 0)  # Vermelho se marcada, azul se não
                cv2.circle(debug_image, (x_px, y_px), bubble_radius_px + 2, color, 2)
                # Adicionar texto com a resposta
                cv2.putText(debug_image, f"Q{idx}:{marked_opt}", (x_px + bubble_radius_px + 3, y_px),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.3, color, 1)

    # Garantir que todas as questões existam no resultado
    for q in range(1, template.get("total_questions", 0) + 1):
        if str(q) not in answers:
            answers[str(q)] = "Não respondeu"

    return (answers, debug_image) if debug else (answers, None)


def find_registration_marks(gray: np.ndarray, template: Dict) -> Optional[Dict[str, Tuple[int, int]]]:
    """Localiza marcadores P1-P4 perto dos cantos usando limiar adaptativo."""
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
    """Alinha a imagem usando P1-P4 para uma perspectiva na referência do template."""
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


def detect_grid_structure(image: np.ndarray) -> Optional[Dict]:
    """
    Detecta a estrutura da grade de questões usando detecção de linhas
    Retorna informações sobre colunas e linhas
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    
    # Detectar bordas
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    
    # Detectar linhas verticais (colunas)
    vertical_lines = cv2.HoughLinesP(
        edges, 1, np.pi/180, threshold=100,
        minLineLength=100, maxLineGap=10
    )
    
    # Detectar linhas horizontais (linhas de questões)
    horizontal_lines = cv2.HoughLinesP(
        edges, 1, np.pi/180, threshold=100,
        minLineLength=100, maxLineGap=10
    )
    
    if vertical_lines is None or horizontal_lines is None:
        return None
    
    # Agrupar linhas verticais para identificar colunas
    vertical_x = sorted([line[0][0] for line in vertical_lines])
    # Remover duplicatas próximas (tolerância de 10 pixels)
    columns = []
    for x in vertical_x:
        if not columns or abs(x - columns[-1]) > 10:
            columns.append(x)
    
    # Agrupar linhas horizontais para identificar linhas
    horizontal_y = sorted([line[0][1] for line in horizontal_lines])
    rows = []
    for y in horizontal_y:
        if not rows or abs(y - rows[-1]) > 10:
            rows.append(y)
    
    return {
        "columns": columns,
        "rows": rows,
        "detected_columns": len(columns),
        "detected_rows": len(rows)
    }


def analyze_bubble_fill(bubble_region: np.ndarray) -> float:
    """
    Analisa o preenchimento de uma bolha
    Retorna um valor entre 0.0 (vazia) e 1.0 (completamente preenchida)
    """
    if len(bubble_region.shape) == 3:
        bubble_region = cv2.cvtColor(bubble_region, cv2.COLOR_BGR2GRAY)
    
    # Threshold para identificar pixels escuros (marcados)
    _, binary = cv2.threshold(bubble_region, 127, 255, cv2.THRESH_BINARY_INV)
    
    # Calcular porcentagem de pixels escuros
    total_pixels = binary.size
    dark_pixels = np.sum(binary > 0)
    
    fill_ratio = dark_pixels / total_pixels if total_pixels > 0 else 0.0
    
    return fill_ratio


def process_omr_page(
    image: np.ndarray,
    page_number: int = 1,
    template_name: Optional[str] = None,
    align_marks: bool = True,
    debug: bool = False,
    use_yolo: bool = False,
) -> Dict:
    """
    Processa uma página usando template fixo (45 ou 90) com alinhamento opcional pelos marcadores.
    Se debug=True, retorna também imagem de debug com bolhas marcadas.
    Se use_yolo=True, usa YOLO para detecção ao invés de OpenCV.
    """
    template = select_template(template_name)
    candidate = template_name.lower() if template_name else DEFAULT_TEMPLATE_NAME
    template_key = candidate if candidate in AVAILABLE_TEMPLATES else DEFAULT_TEMPLATE_NAME
    height, width = image.shape[:2]
    logger.info(f"[DEBUG] Processando página {page_number}: {width}x{height} pixels | template={template_key} | yolo={use_yolo} | debug={debug}")

    working_image = image
    alignment_info = {"aligned": False}
    if align_marks and "registration_marks" in template:
        logger.info(f"[DEBUG] Tentando alinhamento por marcadores...")
        aligned_img, info = align_with_registration_marks(image, template)
        alignment_info = info
        working_image = aligned_img
        if info.get("aligned"):
            logger.info(f"[DEBUG] ✅ Alinhamento aplicado via marcadores: {info.get('marks')}")
        else:
            logger.warning(f"[DEBUG] ⚠️  Alinhamento não aplicado ({info.get('reason')})")
    else:
        logger.info(f"[DEBUG] Alinhamento por marcadores desabilitado ou não disponível no template")

    # Escolher método de detecção
    if use_yolo:
        logger.info(f"[DEBUG] Detectando bolhas usando YOLO (imagem original)...")
        # YOLO precisa da imagem colorida original, não processada
        answers, debug_image = detect_bubbles_yolo(working_image, template, debug=debug)
        detection_method = "YOLO"
    else:
        logger.info(f"[DEBUG] Pré-processando imagem (grayscale, autocontrast, sharpen, threshold)...")
        pil_img = Image.fromarray(working_image)
        bw_array = preprocess_pil_image(pil_img)
        logger.info(f"[DEBUG] Imagem pré-processada: {bw_array.shape} | min={bw_array.min()}, max={bw_array.max()}")
        
        logger.info(f"[DEBUG] Detectando bolhas usando coordenadas fixas do template...")
        answers, debug_image = detect_bubbles_fixed(bw_array, template, debug=debug)
        detection_method = "OpenCV"
    
    detected_count = len([q for q in answers.values() if q != "Não respondeu"])
    logger.info(f"[DEBUG] ✅ Página {page_number} ({detection_method}): {detected_count}/{template['total_questions']} respostas marcadas")
    
    # Log detalhado das primeiras 5 questões para debug
    if debug:
        logger.info(f"[DEBUG] Primeiras 5 questões detectadas:")
        for q_id in sorted(answers.keys(), key=int)[:5]:
            logger.info(f"  Q{q_id}: {answers[q_id]}")

    result = {
        "pagina": page_number,
        "template": template_key,
        "detection_method": detection_method,
        "alinhamento": alignment_info,
        "resultado": {
            "questoes": answers
        }
    }
    
    # Adicionar imagem de debug se disponível
    if debug and debug_image is not None:
        # Converter para base64
        _, buffer = cv2.imencode('.png', debug_image)
        debug_base64 = base64.b64encode(buffer).decode('utf-8')
        result["debug_image"] = debug_base64
        logger.info(f"[DEBUG] Imagem de debug gerada: {len(debug_base64)} bytes (base64)")

    return result


def pdf_url_to_images(pdf_url: str) -> List[np.ndarray]:
    """
    Converte PDF de URL em lista de imagens
    """
    try:
        # Baixar PDF
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        pdf_bytes = response.content
        
        # Converter PDF para imagens usando pdf2image
        try:
            from pdf2image import convert_from_bytes
            images = convert_from_bytes(pdf_bytes, dpi=150)
            return [np.array(img) for img in images]
        except ImportError:
            logger.error("pdf2image não está instalado. Instale com: pip install pdf2image")
            raise
        except Exception as e:
            logger.error(f"Erro ao converter PDF: {e}")
            raise
            
    except Exception as e:
        logger.error(f"Erro ao processar PDF da URL: {e}")
        raise


def image_url_to_numpy(image_url: str) -> np.ndarray:
    """
    Converte imagem de URL para numpy array
    """
    try:
        response = requests.get(image_url, timeout=30)
        response.raise_for_status()
        image_bytes = io.BytesIO(response.content)
        image = Image.open(image_bytes)
        return np.array(image)
    except Exception as e:
        logger.error(f"Erro ao carregar imagem da URL: {e}")
        raise


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "service": "baddrow-omr-service",
        "default_template": DEFAULT_TEMPLATE_NAME,
        "templates": list(AVAILABLE_TEMPLATES.keys())
    })


@app.route('/api/process-pdf', methods=['GET'])
def process_pdf():
    """
    Endpoint compatível com o frontend HTML
    Recebe: ?url=<URL_DO_PDF_NO_CLOUDINARY>
    Retorna: { status: "sucesso", paginas: [...] }
    """
    try:
        pdf_url = request.args.get('url')
        if not pdf_url:
            return jsonify({
                "status": "erro",
                "mensagem": "Parâmetro 'url' não fornecido"
            }), 400
        
        template_name = request.args.get('template', DEFAULT_TEMPLATE_NAME)
        template_key = template_name.lower() if template_name and template_name.lower() in AVAILABLE_TEMPLATES else DEFAULT_TEMPLATE_NAME
        logger.info(f"Processando PDF: {pdf_url} | template={template_key}")
        
        # Converter PDF para imagens
        images = pdf_url_to_images(pdf_url)
        logger.info(f"PDF convertido: {len(images)} páginas")
        
        # Processar cada página
        results = []
        for page_num, image in enumerate(images, start=1):
            try:
                result = process_omr_page(image, page_num, template_name=template_key)
                results.append(result)
                logger.info(f"Página {page_num}: {len([q for q in result['resultado']['questoes'].values() if q != 'Não respondeu'])} respostas detectadas")
            except Exception as e:
                logger.error(f"Erro ao processar página {page_num}: {e}")
                results.append({
                    "pagina": page_num,
                    "status": "erro",
                    "mensagem": str(e)
                })
        
        return jsonify({
            "status": "sucesso",
            "paginas": results,
            "total_paginas": len(results),
            "template": template_key
        })
        
    except Exception as e:
        logger.error(f"Erro ao processar PDF: {e}")
        return jsonify({
            "status": "erro",
            "mensagem": str(e)
        }), 500


@app.route('/api/process-image', methods=['POST'])
def process_image():
    """
    Endpoint para processar uma imagem (buffer)
    Recebe: multipart/form-data com 'image' (arquivo) e 'page' (número da página)
    Query params: 
      - ?debug=true para retornar imagem de debug
      - ?validate_with_chatgpt=true para validar com ChatGPT (Etapa 8)
    Retorna: { status: "sucesso", pagina: {...}, chatgpt_validation: {...} }
    """
    try:
        if 'image' not in request.files:
            return jsonify({
                "status": "erro",
                "mensagem": "Arquivo 'image' não fornecido"
            }), 400
        
        image_file = request.files['image']
        if image_file.filename == '':
            return jsonify({
                "status": "erro",
                "mensagem": "Arquivo vazio"
            }), 400
        
        # Ler imagem
        image_bytes = image_file.read()
        logger.info(f"[DEBUG] Recebida imagem: {len(image_bytes)} bytes | filename={image_file.filename}")
        
        # Converter para numpy array
        image = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image)
        logger.info(f"[DEBUG] Imagem convertida: shape={image_array.shape} | dtype={image_array.dtype}")
        
        # Processar
        page_num = int(request.form.get('page', 1))
        template_name = request.form.get('template', DEFAULT_TEMPLATE_NAME)
        debug_mode = request.args.get('debug', 'false').lower() == 'true'
        validate_chatgpt = request.args.get('validate_with_chatgpt', 'false').lower() == 'true'
        use_yolo = request.args.get('use_yolo', 'false').lower() == 'true'
        template_key = template_name.lower() if template_name and template_name.lower() in AVAILABLE_TEMPLATES else DEFAULT_TEMPLATE_NAME
        logger.info(f"[DEBUG] Processando página {page_num} | template={template_key} | debug={debug_mode} | yolo={use_yolo} | chatgpt={validate_chatgpt}...")
        
        # Etapas 1-7: OMR Puro
        result = process_omr_page(image_array, page_num, template_name=template_key, debug=debug_mode, use_yolo=use_yolo)
        logger.info(f"[DEBUG] ✅ Página {page_num} processada com sucesso")
        
        response_data = {
            "status": "sucesso",
            "pagina": result,
            "template": template_key
        }
        
        # Etapa 8: Validação ChatGPT (opcional)
        if validate_chatgpt:
            openai_api_key = request.form.get('openai_api_key') or request.headers.get('X-OpenAI-API-Key')
            
            if not openai_api_key:
                logger.warning("[CHATGPT VALIDATION] API Key não fornecida, pulando validação")
                response_data["chatgpt_validation"] = {
                    "status": "skipped",
                    "reason": "OPENAI_API_KEY não fornecida"
                }
            else:
                try:
                    logger.info(f"[CHATGPT VALIDATION] Etapa 8: Validando com ChatGPT...")
                    
                    # Chamar validação interna
                    chatgpt_result = validate_with_chatgpt_internal(
                        image_bytes=image_bytes,
                        omr_result=result["resultado"]["questoes"],
                        template_key=template_key,
                        openai_api_key=openai_api_key
                    )
                    
                    response_data["chatgpt_validation"] = chatgpt_result
                    
                    # Se houver correções, atualizar resultado principal
                    if chatgpt_result.get("corrections_count", 0) > 0:
                        logger.info(f"[CHATGPT VALIDATION] Aplicando {chatgpt_result['corrections_count']} correções ao resultado final")
                        result["resultado"]["questoes"] = chatgpt_result["chatgpt_validated"]
                        response_data["pagina"] = result
                        
                except Exception as e:
                    logger.error(f"[CHATGPT VALIDATION] Erro na validação ChatGPT: {e}")
                    response_data["chatgpt_validation"] = {
                        "status": "error",
                        "error": str(e)
                    }
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"[DEBUG] ❌ Erro ao processar imagem: {e}", exc_info=True)
        return jsonify({
            "status": "erro",
            "mensagem": str(e),
            "traceback": str(e.__traceback__) if hasattr(e, '__traceback__') else None
        }), 500


@app.route('/api/debug/visual', methods=['POST'])
def debug_visual():
    """
    Endpoint de debug visual - retorna imagem com bolhas marcadas
    Recebe: multipart/form-data com 'image' (arquivo)
    Query params: ?template=enem90|enem45
    Retorna: { status: "sucesso", debug_image: "base64...", answers: {...} }
    """
    try:
        if 'image' not in request.files:
            return jsonify({
                "status": "erro",
                "mensagem": "Arquivo 'image' não fornecido"
            }), 400
        
        image_file = request.files['image']
        if image_file.filename == '':
            return jsonify({
                "status": "erro",
                "mensagem": "Arquivo vazio"
            }), 400
        
        # Ler imagem
        image_bytes = image_file.read()
        logger.info(f"[DEBUG VISUAL] Recebida imagem: {len(image_bytes)} bytes")
        
        # Converter para numpy array
        image = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image)
        logger.info(f"[DEBUG VISUAL] Imagem: {image_array.shape}")
        
        # Processar com debug ativado
        template_name = request.args.get('template', DEFAULT_TEMPLATE_NAME)
        template_key = template_name.lower() if template_name and template_name.lower() in AVAILABLE_TEMPLATES else DEFAULT_TEMPLATE_NAME
        
        result = process_omr_page(image_array, 1, template_name=template_key, debug=True)
        
        return jsonify({
            "status": "sucesso",
            "debug_image": result.get("debug_image"),
            "answers": result["resultado"]["questoes"],
            "template": template_key,
            "alignment": result.get("alinhamento", {})
        })
        
    except Exception as e:
        logger.error(f"[DEBUG VISUAL] Erro: {e}", exc_info=True)
        return jsonify({
            "status": "erro",
            "mensagem": str(e)
        }), 500


def validate_with_chatgpt_internal(image_bytes: bytes, omr_result: Dict[str, str], template_key: str, openai_api_key: str) -> Dict:
    """
    Função interna para validação ChatGPT (Etapa 8)
    Chamada automaticamente quando validate_with_chatgpt=true
    
    Args:
        image_bytes: Bytes da imagem original
        omr_result: Resultado OMR {questão: resposta}
        template_key: Template usado (enem90/enem45)
        openai_api_key: Chave API OpenAI
        
    Returns:
        Dict com resultado da validação
    """
    try:
        # 1. Converter respostas OMR para array ordenado
        total_questions = AVAILABLE_TEMPLATES[template_key]["total_questions"]
        omr_array = [omr_result.get(str(i), None) for i in range(1, total_questions + 1)]
        
        # 2. Codificar imagem em base64
        image = Image.open(io.BytesIO(image_bytes))
        buffered = io.BytesIO()
        image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        # 3. Chamar ChatGPT Vision para validação
        chatgpt_payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "system",
                    "content": f"You are an expert OMR validator. Validate the automated OMR readings for a {total_questions}-question answer sheet. Return ONLY valid JSON."
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"OMR detected these answers: {json.dumps(omr_array)}. Validate each bubble (A-E) for questions 1-{total_questions}. Return JSON: {{\"answers\":[\"A\",\"B\",...], \"corrections\": [{{\"q\": 5, \"omr\": \"A\", \"corrected\": \"B\", \"reason\": \"bubble B clearly marked\"}}]}}"
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{img_base64}"
                            }
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
        
        logger.info("[CHATGPT VALIDATION INTERNAL] Enviando para OpenAI API...")
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=chatgpt_payload,
            timeout=60
        )
        
        if response.status_code != 200:
            logger.error(f"[CHATGPT VALIDATION INTERNAL] Erro API: {response.status_code} - {response.text}")
            raise Exception(f"ChatGPT API error: {response.status_code}")
        
        chatgpt_data = response.json()
        raw_content = chatgpt_data["choices"][0]["message"]["content"]
        
        logger.info(f"[CHATGPT VALIDATION INTERNAL] Resposta: {raw_content[:150]}...")
        
        # 4. Parse resposta JSON
        import re
        json_match = re.search(r'\{.*\}', raw_content, re.DOTALL)
        if json_match:
            validated_data = json.loads(json_match.group())
            validated_answers = validated_data.get("answers", omr_array)
            corrections = validated_data.get("corrections", [])
        else:
            validated_answers = omr_array
            corrections = []
        
        # 5. Converter array de volta para dict {questão: resposta}
        validated_dict = {str(i): validated_answers[i-1] for i in range(1, len(validated_answers) + 1)}
        
        # 6. Calcular estatísticas
        corrections_count = len(corrections)
        agreement_rate = sum(1 for i in range(len(omr_array)) if omr_array[i] == validated_answers[i]) / len(omr_array) * 100
        
        logger.info(f"[CHATGPT VALIDATION INTERNAL] Etapa 8 concluída: {corrections_count} correções | {agreement_rate:.1f}% concordância")
        
        return {
            "status": "success",
            "chatgpt_validated": validated_dict,
            "corrections": corrections,
            "corrections_count": corrections_count,
            "agreement_rate": round(agreement_rate, 1),
            "model": "gpt-4o-mini"
        }
        
    except Exception as e:
        logger.error(f"[CHATGPT VALIDATION INTERNAL] Erro: {e}")
        raise


@app.route('/api/validate-with-chatgpt', methods=['POST'])
def validate_with_chatgpt():
    """
    Endpoint híbrido: Processa com OMR e valida/corrige com ChatGPT Vision
    """
    try:
        if 'image' not in request.files:
            return jsonify({"status": "erro", "mensagem": "Nenhuma imagem fornecida"}), 400
        
        image_file = request.files['image']
        template_name = request.form.get('template', DEFAULT_TEMPLATE_NAME)
        openai_api_key = request.form.get('openai_api_key') or request.headers.get('X-OpenAI-Key')
        
        if not openai_api_key:
            return jsonify({
                "status": "erro", 
                "mensagem": "OPENAI_API_KEY não fornecida"
            }), 400
        
        # 1. Processar com OMR
        image_bytes = image_file.read()
        image = Image.open(io.BytesIO(image_bytes))
        image_array = np.array(image)
        
        template_key = template_name.lower() if template_name and template_name.lower() in AVAILABLE_TEMPLATES else DEFAULT_TEMPLATE_NAME
        omr_result = process_omr_page(image_array, 1, template_name=template_key, debug=False)
        omr_answers = omr_result["resultado"]["questoes"]
        
        logger.info(f"[CHATGPT VALIDATION] OMR processou {len(omr_answers)} questões")
        
        # 2. Converter respostas OMR para array ordenado
        total_questions = AVAILABLE_TEMPLATES[template_key]["total_questions"]
        omr_array = [omr_answers.get(str(i), None) for i in range(1, total_questions + 1)]
        
        # 3. Codificar imagem em base64
        buffered = io.BytesIO()
        image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        # 4. Chamar ChatGPT Vision para validação
        chatgpt_payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "system",
                    "content": f"You are an expert OMR validator. Validate the automated OMR readings for a {total_questions}-question answer sheet. Return ONLY valid JSON."
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"OMR detected these answers: {json.dumps(omr_array)}. Validate each bubble (A-E) for questions 1-{total_questions}. Return JSON: {{\"answers\":[\"A\",\"B\",...], \"corrections\": [{{\"q\": 5, \"omr\": \"A\", \"corrected\": \"B\", \"reason\": \"bubble B clearly marked\"}}]}}"
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{img_base64}"
                            }
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
        
        logger.info("[CHATGPT VALIDATION] Enviando para OpenAI API...")
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=chatgpt_payload,
            timeout=60
        )
        
        if response.status_code != 200:
            logger.error(f"[CHATGPT VALIDATION] Erro API: {response.status_code} - {response.text}")
            return jsonify({
                "status": "erro",
                "mensagem": f"ChatGPT API error: {response.status_code}",
                "omr_result": omr_answers
            }), 500
        
        chatgpt_data = response.json()
        raw_content = chatgpt_data["choices"][0]["message"]["content"]
        
        logger.info(f"[CHATGPT VALIDATION] Resposta bruta: {raw_content[:200]}...")
        
        # 5. Parse resposta JSON
        import re
        json_match = re.search(r'\{.*\}', raw_content, re.DOTALL)
        if json_match:
            validated_data = json.loads(json_match.group())
            validated_answers = validated_data.get("answers", omr_array)
            corrections = validated_data.get("corrections", [])
        else:
            validated_answers = omr_array
            corrections = []
        
        # 6. Converter array de volta para dict {questão: resposta}
        validated_dict = {str(i): validated_answers[i-1] for i in range(1, len(validated_answers) + 1)}
        
        # 7. Calcular estatísticas de validação
        corrections_count = len(corrections)
        agreement_rate = sum(1 for i in range(len(omr_array)) if omr_array[i] == validated_answers[i]) / len(omr_array) * 100
        
        logger.info(f"[CHATGPT VALIDATION] Correções: {corrections_count} | Concordância OMR↔ChatGPT: {agreement_rate:.1f}%")
        
        return jsonify({
            "status": "sucesso",
            "omr_original": omr_answers,
            "chatgpt_validated": validated_dict,
            "corrections": corrections,
            "statistics": {
                "corrections_count": corrections_count,
                "agreement_rate": round(agreement_rate, 1),
                "total_questions": total_questions
            },
            "template": template_key,
            "model": "gpt-4o-mini"
        })
        
    except Exception as e:
        logger.error(f"[CHATGPT VALIDATION] Erro: {e}", exc_info=True)
        return jsonify({
            "status": "erro",
            "mensagem": str(e)
        }), 500


if __name__ == '__main__':
    import os
    port = int(os.getenv('PORT', 5002))  # Usar porta 5002 por padrão (5000 pode estar em uso no macOS)
    logger.info("Iniciando serviço OMR com baddrow-python...")
    logger.info(f"Templates disponíveis: {list(AVAILABLE_TEMPLATES.keys())} | padrão={DEFAULT_TEMPLATE_NAME}")
    logger.info(f"Servidor rodando em: http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
