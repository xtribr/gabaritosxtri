#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TESTE RÁPIDO DO SERVIÇO TRI V2
"""

import requests
import json

# Dados de teste (3 alunos, 10 questões)
payload = {
    "alunos": [
        {
            "nome": "João Silva",
            "q1": "A", "q2": "B", "q3": "C", "q4": "D", "q5": "E",
            "q6": "A", "q7": "B", "q8": "C", "q9": "D", "q10": "E"
        },
        {
            "nome": "Maria Santos",
            "q1": "A", "q2": "B", "q3": "C", "q4": "D", "q5": "E",
            "q6": "B", "q7": "C", "q8": "D", "q9": "E", "q10": "A"
        },
        {
            "nome": "Pedro Costa",
            "q1": "B", "q2": "C", "q3": "D", "q4": "E", "q5": "A",
            "q6": "A", "q7": "B", "q8": "C", "q9": "D", "q10": "E"
        }
    ],
    "gabarito": {
        "1": "A", "2": "B", "3": "C", "4": "D", "5": "E",
        "6": "A", "7": "B", "8": "C", "9": "D", "10": "E"
    },
    "areas_config": {
        "A1": [1, 5],
        "A2": [6, 10]
    }
}

print("="*100)
print("TESTANDO SERVIÇO TRI V2")
print("="*100)

# 1. Health Check
print("\n[1] Health Check...")
try:
    r = requests.get("http://localhost:5003/health")
    print(f"Status: {r.status_code}")
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print(f"❌ Erro: {e}")
    exit(1)

# 2. Calcular TRI
print("\n[2] Calculando TRI...")
try:
    r = requests.post(
        "http://localhost:5003/api/calcular-tri",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    print(f"Status: {r.status_code}")
    
    if r.status_code == 200:
        result = r.json()
        print(f"\n✅ Sucesso! {result['total_alunos']} alunos processados")
        
        print("\n" + "="*100)
        print("RESULTADOS")
        print("="*100)
        
        for aluno in result['resultados']:
            print(f"\n👤 {aluno['nome']}")
            print(f"   Acertos: {aluno['n_acertos_geral']} ({aluno['pct_acertos_geral']:.1%})")
            print(f"   Coerência: {aluno['coerencia_geral']:.2f}")
            print(f"   TRI Geral: {aluno['tri_geral']['tri_ajustado']:.0f}")
            
            if 'areas' in aluno:
                print(f"   Áreas:")
                for area, dados in aluno['areas'].items():
                    print(f"     - {area}: TRI={dados['tri']['tri_ajustado']:.0f} | Acertos={dados['n_acertos']}")
        
        print("\n" + "="*100)
        print("✅ TESTE CONCLUÍDO COM SUCESSO!")
        print("="*100)
    else:
        print(f"❌ Erro: {r.status_code}")
        print(r.text)
        
except Exception as e:
    print(f"❌ Erro: {e}")
    exit(1)
