#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SERVIÇO PYTHON TRI V2 - API REST
Porta 5003 (para não conflitar com OMR na 5002)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os
import json
import numpy as np

# Importar motor TRI V2 da pasta data
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'data', 'tri_v2_producao'))
from tri_v2_producao import ProcessadorTRICompleto, TabelaReferenciaTRI

app = Flask(__name__)
CORS(app)

# Custom JSON encoder para suportar tipos numpy
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.integer, np.int64, np.int32)):
            return int(obj)
        elif isinstance(obj, (np.floating, np.float64, np.float32)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

app.json_encoder = NumpyEncoder

# ============================================================================
# CONFIGURAÇÃO GLOBAL
# ============================================================================

TABELA_TRI_PATH = os.path.join(
    os.path.dirname(__file__),
    'tri_tabela_referencia_oficial.csv'
)

# Instanciar processador (carrega tabela UMA VEZ)
try:
    tabela_referencia = TabelaReferenciaTRI(TABELA_TRI_PATH)
    processador = ProcessadorTRICompleto(tabela_referencia)
    print(f"✅ Processador TRI V2 inicializado com tabela: {TABELA_TRI_PATH}")
except Exception as e:
    print(f"❌ ERRO ao carregar tabela TRI: {e}")
    processador = None


# ============================================================================
# ENDPOINTS
# ============================================================================

@app.route('/health', methods=['GET'])
def health():
    """Endpoint de saúde do serviço"""
    return jsonify({
        'status': 'online',
        'service': 'python_tri_v2',
        'version': '2.0.0',
        'tabela_carregada': processador is not None
    }), 200


@app.route('/api/calcular-tri', methods=['POST'])
def calcular_tri():
    """
    Calcula TRI com V2 (coerência pedagógica).
    
    Entrada JSON:
    {
      "alunos": [
        {
          "nome": "João Silva",
          "q1": "A",
          "q2": "B",
          ...
          "q90": "E"
        },
        ...
      ],
      "gabarito": {
        "1": "A",
        "2": "B",
        ...
        "90": "E"
      },
      "areas_config": {
        "LC": [1, 45],
        "CH": [46, 90],
        "CN": [1, 45],
        "MT": [46, 90]
      }
    }
    
    Saída JSON:
    {
      "status": "sucesso",
      "total_alunos": 30,
      "prova_analysis": {...},
      "resultados": [
        {
          "nome": "João Silva",
          "n_acertos_geral": 42,
          "pct_acertos_geral": 0.467,
          "coerencia_geral": 0.73,
          "concordancia_geral": 0.81,
          "tri_geral": {
            "tri_baseline": 520,
            "ajuste_coerencia": 23,
            "ajuste_relacao": 12,
            "penalidade": 0,
            "tri_ajustado": 555
          },
          "areas": {
            "LC": {...},
            "CH": {...},
            "CN": {...},
            "MT": {...}
          }
        },
        ...
      ]
    }
    """
    
    if processador is None:
        return jsonify({
            'status': 'erro',
            'mensagem': 'Processador TRI não inicializado (tabela não carregada)'
        }), 500
    
    try:
        data = request.get_json()
        
        # Validar entrada
        if not data or 'alunos' not in data or 'gabarito' not in data:
            return jsonify({
                'status': 'erro',
                'mensagem': 'Dados inválidos. Necessário: alunos, gabarito'
            }), 400
        
        alunos = data['alunos']
        gabarito_raw = data['gabarito']
        areas_config_raw = data.get('areas_config', {
            'LC': [1, 45],
            'CH': [46, 90],
            'CN': [1, 45],
            'MT': [46, 90]
        })
        
        # Converter gabarito de string keys para int keys
        gabarito = {int(k): v for k, v in gabarito_raw.items()}
        
        # Converter areas_config de list para tuple
        areas_config = {k: tuple(v) for k, v in areas_config_raw.items()}
        
        print(f"\n{'='*100}")
        print(f"[TRI SERVICE] Processando {len(alunos)} alunos...")
        print(f"[TRI SERVICE] Gabarito: {len(gabarito)} questões")
        print(f"[TRI SERVICE] Áreas: {list(areas_config.keys())}")
        print(f"{'='*100}")
        
        # Processar com TRI V2
        prova_analysis, resultados = processador.processar_turma(
            alunos=alunos,
            gabarito=gabarito,
            areas_config=areas_config
        )
        
        print(f"\n✅ [TRI SERVICE] Processamento concluído!")
        print(f"   Total de resultados: {len(resultados)}")
        
        # Converter tipos numpy para tipos Python nativos (para JSON)
        def convert_numpy(obj):
            """Converte recursivamente tipos numpy para Python nativos"""
            if isinstance(obj, (np.integer, np.int64, np.int32)):
                return int(obj)
            elif isinstance(obj, (np.floating, np.float64, np.float32)):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            elif isinstance(obj, dict):
                return {key: convert_numpy(value) for key, value in obj.items()}
            elif isinstance(obj, list):
                return [convert_numpy(item) for item in obj]
            return obj
        
        # Converter resultados
        resultados_converted = convert_numpy(resultados)
        prova_analysis_converted = convert_numpy(prova_analysis)
        
        return jsonify({
            'status': 'sucesso',
            'total_alunos': len(alunos),
            'prova_analysis': prova_analysis_converted,
            'resultados': resultados_converted
        }), 200
        
    except KeyError as e:
        return jsonify({
            'status': 'erro',
            'mensagem': f'Campo obrigatório ausente: {str(e)}'
        }), 400
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ [TRI SERVICE] ERRO: {error_trace}")
        
        return jsonify({
            'status': 'erro',
            'mensagem': str(e),
            'trace': error_trace
        }), 500


@app.route('/api/debug', methods=['GET'])
def debug():
    """Endpoint de debug para verificar configuração"""
    return jsonify({
        'service': 'Python TRI V2',
        'version': '2.0.0',
        'tabela_tri_path': TABELA_TRI_PATH,
        'tabela_carregada': processador is not None,
        'tabela_linhas': len(processador.tabela_tri) if processador else 0,
        'python_version': sys.version,
        'flask_version': '3.0.0',
    }), 200


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    print("\n" + "="*100)
    print("🚀 SERVIÇO PYTHON TRI V2 - Iniciando...")
    print("="*100)
    print(f"📊 Tabela TRI: {TABELA_TRI_PATH}")
    print(f"🔧 Processador: {'✅ Carregado' if processador else '❌ Falhou'}")
    print(f"🌐 Servidor: http://0.0.0.0:5003")
    print("="*100 + "\n")
    
    app.run(
        host='0.0.0.0',
        port=5003,
        debug=True,
        threaded=True
    )
