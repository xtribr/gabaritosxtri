"""
╔════════════════════════════════════════════════════════════════════════════════╗
║                                                                                ║
║              TRI V2 - PRODUÇÃO CORRIGIDA COM TABELA OFICIAL                    ║
║                                                                                ║
║  • Usa: TRI_ENEM_DE_2009_A_2023_MIN_MED_E_MAX.xlsx (tabela oficial)           ║
║  • Agrega: Por ÁREA (CH, CN, LC, MT) + média dos anos                         ║
║  • Retorna: Valores corretos por área                                         ║
║  • Bug fixado: Zero acertos → TRI mínima correta (não inflada)                ║
║                                                                                ║
╚════════════════════════════════════════════════════════════════════════════════╝
"""

import pandas as pd
import json
import numpy as np
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, Tuple, Optional

# ════════════════════════════════════════════════════════════════════════════════
# 1. CARREGAMENTO DE TABELA DE REFERÊNCIA
# ════════════════════════════════════════════════════════════════════════════════

class TabelaReferenciaTRI:
    """
    Gerenciador de tabela de referência TRI oficial.
    
    Estrutura:
    - area: CH, CN, LC, MT
    - acertos: 0-45 (número de acertos por área)
    - tri_min, tri_med, tri_max: valores agregados (média dos anos 2009-2023)
    """
    
    def __init__(self, csv_path: str):
        """
        Carrega tabela de referência agregada.
        
        Args:
            csv_path: Caminho para 'tri_tabela_referencia_oficial.csv'
        """
        self.df = pd.read_csv(csv_path)
        
        # Validar estrutura
        required_cols = ['area', 'acertos', 'tri_min', 'tri_med', 'tri_max']
        assert all(col in self.df.columns for col in required_cols), \
            f"Tabela deve ter colunas: {required_cols}"
        
        # Criar dicionário para lookup rápido
        self.lookup = {}
        for area in self.df['area'].unique():
            self.lookup[area] = {}
            area_df = self.df[self.df['area'] == area]
            for _, row in area_df.iterrows():
                acertos = int(row['acertos'])
                self.lookup[area][acertos] = {
                    'tri_min': round(row['tri_min'], 1),
                    'tri_med': round(row['tri_med'], 1),
                    'tri_max': round(row['tri_max'], 1)
                }
    
    def obter(self, area: str, acertos: int) -> Dict[str, float]:
        """
        Obtém valores TRI para uma área e número de acertos.
        
        Args:
            area: 'CH', 'CN', 'LC' ou 'MT'
            acertos: Número de acertos (0-45)
        
        Returns:
            Dict com 'tri_min', 'tri_med', 'tri_max'
        """
        if area not in self.lookup:
            raise ValueError(f"Área inválida: {area}")
        
        if acertos not in self.lookup[area]:
            # Se acertos está fora do range, usar valor máximo disponível
            max_acertos = max(self.lookup[area].keys())
            if acertos > max_acertos:
                acertos = max_acertos
        
        return self.lookup[area][acertos]
    
    def validar(self) -> bool:
        """Valida integridade da tabela."""
        for area in self.lookup:
            # Verificar se tem 0 acertos
            assert 0 in self.lookup[area], f"Falta 0 acertos para {area}"
            # Verificar se valores crescem monotonicamente
            tri_meds = [self.lookup[area][a]['tri_med'] for a in sorted(self.lookup[area].keys())]
            assert tri_meds == sorted(tri_meds), f"TRI não está monotônica para {area}"
        return True


# ════════════════════════════════════════════════════════════════════════════════
# 2. ANÁLISE DE COERÊNCIA (mantém coerência pedagógica)
# ════════════════════════════════════════════════════════════════════════════════

@dataclass
class AnaliseCoerencia:
    """Resultado da análise de coerência do aluno."""
    coerencia: float  # 0.0 a 1.0
    padrao_resposta: str
    taxa_muito_facil: float
    taxa_facil: float
    taxa_media: float
    taxa_dificil: float
    taxa_muito_dificil: float


class AlunoCoherenceAnalyzer:
    """
    Analisa padrão de respostas do aluno para detectar coerência.
    """
    
    def __init__(self, respostas_por_dificuldade: Dict[str, int]):
        """
        Args:
            respostas_por_dificuldade: {
                'muito_facil': 5,
                'facil': 8,
                'media': 3,
                'dificil': 2,
                'muito_dificil': 1
            }
        """
        self.respostas = respostas_por_dificuldade
    
    def analisar(self) -> AnaliseCoerencia:
        """
        Analisa coerência das respostas.
        
        Coerência esperada:
        - Acerta mais em fácil → acerta menos em difícil
        - Padrão: MF > F > M > D > MD
        """
        total = sum(self.respostas.values())
        
        if total == 0:
            return AnaliseCoerencia(
                coerencia=0.0,
                padrao_resposta='Aluno não respondeu',
                taxa_muito_facil=0.0,
                taxa_facil=0.0,
                taxa_media=0.0,
                taxa_dificil=0.0,
                taxa_muito_dificil=0.0
            )
        
        # Calcular taxas
        taxa_mf = self.respostas.get('muito_facil', 0) / total
        taxa_f = self.respostas.get('facil', 0) / total
        taxa_m = self.respostas.get('media', 0) / total
        taxa_d = self.respostas.get('dificil', 0) / total
        taxa_md = self.respostas.get('muito_dificil', 0) / total
        
        # Verificar coerência (padrão esperado: MF ≥ F ≥ M ≥ D ≥ MD)
        comparacoes = [
            taxa_mf >= taxa_f,
            taxa_f >= taxa_m,
            taxa_m >= taxa_d,
            taxa_d >= taxa_md
        ]
        coerencia = sum(comparacoes) / len(comparacoes)
        
        # Classificar padrão
        if coerencia == 1.0:
            padrao = 'Padrão coerente (MF > F > M > D > MD)'
        elif coerencia >= 0.75:
            padrao = 'Padrão consistente'
        elif coerencia >= 0.5:
            padrao = 'Padrão parcialmente coerente'
        else:
            padrao = 'Padrão incoerente'
        
        return AnaliseCoerencia(
            coerencia=coerencia,
            padrao_resposta=padrao,
            taxa_muito_facil=taxa_mf,
            taxa_facil=taxa_f,
            taxa_media=taxa_m,
            taxa_dificil=taxa_d,
            taxa_muito_dificil=taxa_md
        )


# ════════════════════════════════════════════════════════════════════════════════
# 3. CÁLCULO DE TRI
# ════════════════════════════════════════════════════════════════════════════════

@dataclass
class ResultadoTRI:
    """Resultado do cálculo TRI para uma área."""
    area: str
    acertos: int
    tri_baseline: float
    ajuste_coerencia: float
    ajuste_relacao: float
    penalidade: float
    tri_ajustado: float
    motivo: str


class TRICalculator:
    """
    Calcula TRI para uma área com base em acertos e padrão de resposta.
    """
    
    def __init__(self, tabela_referencia: TabelaReferenciaTRI):
        self.tabela = tabela_referencia
    
    def calcular(
        self,
        area: str,
        acertos: int,
        analise_coerencia: Optional[AnaliseCoerencia] = None,
        relacao_com_outras_areas: Optional[Dict[str, float]] = None
    ) -> ResultadoTRI:
        """
        Calcula TRI para uma área.
        
        Args:
            area: 'CH', 'CN', 'LC', 'MT'
            acertos: Número de acertos (0-45)
            analise_coerencia: Análise de coerência das respostas
            relacao_com_outras_areas: TRI de outras áreas para ajuste relativo
        
        Returns:
            ResultadoTRI com detalhes do cálculo
        """
        
        # [CRÍTICO] Se zero acertos, retornar TRI mínima SEM ajustes
        if acertos == 0:
            baseline = self.tabela.obter(area, 0)
            tri_min = baseline['tri_min']
            
            return ResultadoTRI(
                area=area,
                acertos=acertos,
                tri_baseline=tri_min,
                ajuste_coerencia=0.0,
                ajuste_relacao=0.0,
                penalidade=0.0,
                tri_ajustado=tri_min,
                motivo=f'Zero acertos: TRI mínima ({tri_min:.1f}) sem ajustes'
            )
        
        # Buscar valores baseline
        baseline = self.tabela.obter(area, acertos)
        tri_med = baseline['tri_med']
        tri_min = baseline['tri_min']
        tri_max = baseline['tri_max']
        
        # Inicializar ajustes
        ajuste_coerencia = 0.0
        ajuste_relacao = 0.0
        penalidade = 0.0
        motivo = f'{area}: {acertos} acertos'
        
        # [AJUSTE 1] Coerência (pequeno efeito)
        if analise_coerencia:
            if analise_coerencia.coerencia < 0.5:
                # Padrão muito incoerente → penalidade
                penalidade = (1.0 - analise_coerencia.coerencia) * 10.0
                motivo += f' | Penalidade coerência: -{penalidade:.1f}'
            elif analise_coerencia.coerencia > 0.9:
                # Padrão muito coerente → bônus pequeno
                ajuste_coerencia = (analise_coerencia.coerencia - 0.9) * 20.0
                motivo += f' | Bônus coerência: +{ajuste_coerencia:.1f}'
        
        # [AJUSTE 2] Relação com outras áreas (contexto)
        if relacao_com_outras_areas:
            media_outras = np.mean(list(relacao_com_outras_areas.values()))
            diferenca = tri_med - media_outras
            
            if diferenca > 50:
                # Muito acima da média → manter conservador
                ajuste_relacao = -5.0
            elif diferenca < -50:
                # Muito abaixo da média → boost pequeno
                ajuste_relacao = 5.0
        
        # Aplicar ajustes (com limites)
        tri_ajustado = tri_med + ajuste_coerencia + ajuste_relacao - penalidade
        
        # Garantir que não saia do range [tri_min, tri_max]
        tri_ajustado = max(tri_min, min(tri_max, tri_ajustado))
        
        return ResultadoTRI(
            area=area,
            acertos=acertos,
            tri_baseline=tri_med,
            ajuste_coerencia=ajuste_coerencia,
            ajuste_relacao=ajuste_relacao,
            penalidade=penalidade,
            tri_ajustado=tri_ajustado,
            motivo=motivo
        )


# ════════════════════════════════════════════════════════════════════════════════
# 4. ORQUESTRADOR PRINCIPAL
# ════════════════════════════════════════════════════════════════════════════════

class TRIProcessadorV2:
    """
    Processador completo de TRI V2 para um aluno.
    """
    
    def __init__(self, tabela_referencia: TabelaReferenciaTRI):
        self.tabela = tabela_referencia
        self.calculator = TRICalculator(tabela_referencia)
    
    def processar_aluno(
        self,
        lc_acertos: int,
        ch_acertos: int,
        cn_acertos: int,
        mt_acertos: int,
        respostas_por_dificuldade: Dict[str, Dict[str, int]] = None
    ) -> Dict:
        """
        Processa TRI completo para um aluno.
        
        Args:
            lc_acertos, ch_acertos, cn_acertos, mt_acertos: Acertos por área
            respostas_por_dificuldade: {
                'LC': {'muito_facil': 5, 'facil': 8, ...},
                'CH': {...},
                ...
            }
        
        Returns:
            Dicionário com resultados por área e geral
        """
        
        areas = {
            'LC': lc_acertos,
            'CH': ch_acertos,
            'CN': cn_acertos,
            'MT': mt_acertos
        }
        
        # Calcular TRI para cada área
        resultados = {}
        tris = {}
        
        for area, acertos in areas.items():
            # Analisar coerência se disponível
            analise_coerencia = None
            if respostas_por_dificuldade and area in respostas_por_dificuldade:
                analyzer = AlunoCoherenceAnalyzer(respostas_por_dificuldade[area])
                analise_coerencia = analyzer.analisar()
            
            # Relação com outras áreas (contexto)
            outras_areas = {k: v for k, v in areas.items() if k != area}
            relacao = {k: self.tabela.obter(k, v)['tri_med'] for k, v in outras_areas.items()}
            
            # Calcular
            resultado = self.calculator.calcular(
                area=area,
                acertos=acertos,
                analise_coerencia=analise_coerencia,
                relacao_com_outras_areas=relacao
            )
            
            resultados[area] = resultado
            tris[area] = resultado.tri_ajustado
        
        # Calcular TRI geral (média das áreas)
        tri_geral = np.mean(list(tris.values()))
        
        # Calcular TCT (nota bruta 0-4)
        total_acertos = lc_acertos + ch_acertos + cn_acertos + mt_acertos
        tct = (total_acertos / 90.0) * 4.0  # Escala 0-4
        
        return {
            'tct': round(tct, 2),
            'tri_geral': round(tri_geral, 1),
            'tri_lc': round(tris['LC'], 1),
            'tri_ch': round(tris['CH'], 1),
            'tri_cn': round(tris['CN'], 1),
            'tri_mt': round(tris['MT'], 1),
            'detalhes': {area: {
                'acertos': resultado.acertos,
                'baseline': resultado.tri_baseline,
                'ajustes': {
                    'coerencia': resultado.ajuste_coerencia,
                    'relacao': resultado.ajuste_relacao,
                    'penalidade': resultado.penalidade
                },
                'tri_ajustado': resultado.tri_ajustado,
                'motivo': resultado.motivo
            } for area, resultado in resultados.items()}
        }


# ════════════════════════════════════════════════════════════════════════════════
# 5. TESTE E VALIDAÇÃO
# ════════════════════════════════════════════════════════════════════════════════

def teste_completo():
    """Testa o sistema com exemplos."""
    
    print("\n" + "="*120)
    print("🧪 TESTE: TRI V2 COM TABELA OFICIAL")
    print("="*120)
    
    # Carregar tabela
    tabela = TabelaReferenciaTRI('/mnt/user-data/outputs/tri_tabela_referencia_oficial.csv')
    assert tabela.validar(), "Tabela inválida!"
    print("✓ Tabela de referência carregada e validada")
    
    # Criar processador
    processador = TRIProcessadorV2(tabela)
    
    # TESTE 1: Aluno com 0 acertos
    print("\n" + "-"*120)
    print("TESTE 1: Aluno com 0 acertos (deve retornar TRI mínima)")
    print("-"*120)
    
    resultado = processador.processar_aluno(
        lc_acertos=0,
        ch_acertos=0,
        cn_acertos=0,
        mt_acertos=0
    )
    
    print(f"TCT: {resultado['tct']}")
    print(f"TRI Geral: {resultado['tri_geral']}")
    print(f"TRI LC (esperado ~300): {resultado['tri_lc']}")
    print(f"TRI CH (esperado ~330): {resultado['tri_ch']}")
    print(f"TRI CN (esperado ~340): {resultado['tri_cn']}")
    print(f"TRI MT (esperado ~343): {resultado['tri_mt']}")
    
    assert resultado['tri_lc'] < 310, "LC deveria estar por volta de 300!"
    assert resultado['tri_ch'] < 340, "CH deveria estar por volta de 330!"
    print("✅ Teste 1 passou!")
    
    # TESTE 2: Aluno com distribuição normal
    print("\n" + "-"*120)
    print("TESTE 2: Aluno com 10 acertos por área (40 total)")
    print("-"*120)
    
    resultado = processador.processar_aluno(
        lc_acertos=10,
        ch_acertos=10,
        cn_acertos=10,
        mt_acertos=10
    )
    
    print(f"TCT: {resultado['tct']}")
    print(f"TRI Geral: {resultado['tri_geral']}")
    print(f"TRI LC: {resultado['tri_lc']}")
    print(f"TRI CH: {resultado['tri_ch']}")
    print(f"TRI CN: {resultado['tri_cn']}")
    print(f"TRI MT: {resultado['tri_mt']}")
    
    # TCT deve ser ~1.8 (40/90 * 4)
    assert 1.7 < resultado['tct'] < 1.9, f"TCT esperada ~1.8, obtida {resultado['tct']}"
    # TRI deve estar correlacionado com TCT
    assert 400 < resultado['tri_geral'] < 480, f"TRI esperada ~400-480, obtida {resultado['tri_geral']}"
    print("✅ Teste 2 passou!")
    
    # TESTE 3: Aluno com distribuição desequilibrada
    print("\n" + "-"*120)
    print("TESTE 3: Aluno com desempenho desequilibrado (LC=20, MT=5)")
    print("-"*120)
    
    resultado = processador.processar_aluno(
        lc_acertos=20,
        ch_acertos=10,
        cn_acertos=10,
        mt_acertos=5
    )
    
    print(f"TCT: {resultado['tct']}")
    print(f"TRI Geral: {resultado['tri_geral']}")
    print(f"TRI LC (20 acertos): {resultado['tri_lc']}")
    print(f"TRI CH (10 acertos): {resultado['tri_ch']}")
    print(f"TRI CN (10 acertos): {resultado['tri_cn']}")
    print(f"TRI MT (5 acertos): {resultado['tri_mt']}")
    
    # LC deve ser bem maior que MT
    assert resultado['tri_lc'] > resultado['tri_mt'] + 50, \
        f"LC ({resultado['tri_lc']}) deveria ser significativamente maior que MT ({resultado['tri_mt']})"
    print("✅ Teste 3 passou!")
    
    print("\n" + "="*120)
    print("✅ TODOS OS TESTES PASSARAM!")
    print("="*120)


# Alias para compatibilidade com app.py
ProcessadorTRICompleto = TRIProcessadorV2

if __name__ == '__main__':
    teste_completo()
