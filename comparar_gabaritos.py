#!/usr/bin/env python3
"""
Compara o gabarito real com o detectado pelo OMR
Gera análise detalhada de erros e padrões
"""

import json
from collections import Counter

def analisar_comparacao(gabarito_real, gabarito_omr):
    """Compara dois gabaritos e retorna análise completa"""
    
    total_questoes = len(gabarito_real)
    acertos = 0
    erros = []
    padroes_erro = Counter()
    
    # Análise questão por questão
    print("\n" + "="*80)
    print("🔬 COMPARAÇÃO DETALHADA: GABARITO REAL vs OMR DETECTADO")
    print("="*80 + "\n")
    
    for questao in range(1, total_questoes + 1):
        q_str = str(questao)
        real = gabarito_real.get(q_str, "?")
        omr = gabarito_omr.get(q_str, "?")
        
        if real == omr:
            acertos += 1
        else:
            erros.append({
                'questao': questao,
                'real': real,
                'omr': omr,
                'coluna': ((questao - 1) // 15) + 1,
                'linha': ((questao - 1) % 15) + 1
            })
            padroes_erro[f"{real}→{omr}"] += 1
    
    # Calcular acurácia
    acuracia = (acertos / total_questoes) * 100
    
    # Relatório de Acurácia
    print(f"📊 RESULTADO GERAL")
    print("-" * 80)
    print(f"Total de questões: {total_questoes}")
    print(f"✅ Acertos: {acertos} ({acuracia:.1f}%)")
    print(f"❌ Erros: {len(erros)} ({100-acuracia:.1f}%)")
    print()
    
    # Análise de Erros por Padrão
    if erros:
        print(f"🔍 PADRÕES DE ERRO (Top 10)")
        print("-" * 80)
        for padrao, count in padroes_erro.most_common(10):
            real_opt, omr_opt = padrao.split('→')
            deslocamento = ord(omr_opt) - ord(real_opt)
            dir_texto = f"+{deslocamento}" if deslocamento > 0 else str(deslocamento)
            print(f"{padrao:6} : {count:2}x  (deslocamento: {dir_texto} posições)")
        print()
        
        # Erros por Coluna
        erros_por_coluna = Counter([e['coluna'] for e in erros])
        print(f"📍 ERROS POR COLUNA")
        print("-" * 80)
        for col in range(1, 7):
            total_col = 15
            erros_col = erros_por_coluna[col]
            acertos_col = total_col - erros_col
            taxa = (acertos_col / total_col) * 100
            print(f"Coluna {col}: {erros_col}/15 erros ({taxa:.1f}% acurácia)")
        print()
        
        # Lista Detalhada de Erros
        print(f"📋 LISTA DETALHADA DE ERROS")
        print("-" * 80)
        print(f"{'Q':<5} {'Col':<5} {'Linha':<7} {'Real':<6} {'OMR':<6} {'Erro'}")
        print("-" * 80)
        for erro in erros[:30]:  # Primeiros 30 erros
            q = erro['questao']
            col = erro['coluna']
            linha = erro['linha']
            real = erro['real']
            omr = erro['omr']
            deslocamento = ord(omr) - ord(real)
            print(f"{q:<5} {col:<5} {linha:<7} {real:<6} {omr:<6} {deslocamento:+d}")
        
        if len(erros) > 30:
            print(f"... e mais {len(erros) - 30} erros")
        print()
    
    # Diagnóstico
    print(f"🎯 DIAGNÓSTICO")
    print("-" * 80)
    
    if acuracia >= 98:
        print("✅ EXCELENTE! OMR funcionando perfeitamente.")
    elif acuracia >= 90:
        print("⚠️ BOM, mas pode melhorar. Ajuste fino necessário.")
    elif acuracia >= 70:
        print("🚨 PROBLEMAS MODERADOS. Coordenadas precisam de ajuste.")
    else:
        print("❌ CRÍTICO! Coordenadas completamente descalibradas.")
    
    # Análise de deslocamento
    if erros:
        deslocamentos = [ord(e['omr']) - ord(e['real']) for e in erros]
        desl_medio = sum(deslocamentos) / len(deslocamentos)
        desl_comum = Counter(deslocamentos).most_common(1)[0]
        
        print(f"\nDeslocamento médio: {desl_medio:+.1f} posições")
        print(f"Deslocamento mais comum: {desl_comum[0]:+d} ({desl_comum[1]}x)")
        
        if desl_comum[0] < 0:
            print(f"\n💡 CORREÇÃO SUGERIDA:")
            print(f"   As opções estão sendo lidas ANTES da posição real.")
            print(f"   Aumente base_x em aproximadamente {abs(desl_comum[0]) * 24}px")
        elif desl_comum[0] > 0:
            print(f"\n💡 CORREÇÃO SUGERIDA:")
            print(f"   As opções estão sendo lidas DEPOIS da posição real.")
            print(f"   Diminua base_x em aproximadamente {desl_comum[0] * 24}px")
    
    print("\n" + "="*80 + "\n")
    
    return {
        'acuracia': acuracia,
        'acertos': acertos,
        'erros': len(erros),
        'padroes': dict(padroes_erro),
        'lista_erros': erros
    }


if __name__ == "__main__":
    # Carregar gabarito real
    with open('gabarito_leticia_real.json', 'r') as f:
        data_real = json.load(f)
        gabarito_real = data_real['gabarito_real']
    
    print("\n📖 Gabarito Real carregado:")
    print(f"   Aluno: {data_real['aluno']}")
    print(f"   Total: {len(gabarito_real)} questões")
    
    # Aguardar gabarito OMR
    print("\n⏳ Aguardando gabarito OMR...")
    print("   Cole o JSON da Etapa 6 em 'gabarito_leticia_omr.json'")
    print()
    
    try:
        with open('gabarito_leticia_omr.json', 'r') as f:
            data_omr = json.load(f)
            gabarito_omr = data_omr.get('questoes', {})
        
        # Executar comparação
        resultado = analisar_comparacao(gabarito_real, gabarito_omr)
        
        # Salvar relatório
        with open('relatorio_comparacao.json', 'w') as f:
            json.dump(resultado, f, indent=2, ensure_ascii=False)
        
        print("💾 Relatório salvo em: relatorio_comparacao.json")
        
    except FileNotFoundError:
        print("❌ Arquivo 'gabarito_leticia_omr.json' não encontrado")
        print("   Execute o teste no /debug primeiro!")
