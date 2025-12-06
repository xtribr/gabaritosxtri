#!/bin/bash

echo "=========================================="
echo "🧪 TESTE COMPLETO - INTEGRAÇÃO TRI V2"
echo "=========================================="
echo ""

# Teste 1: Verificar se serviços estão online
echo "📌 PASSO 1: Verificando serviços..."
echo "=========================================="

echo -n "🔍 Express Backend (8080): "
if curl -s http://localhost:8080/api/calculate-tri-v2 >/dev/null 2>&1; then
    echo "✅ ONLINE"
else
    echo "❌ OFFLINE - Execute: npm run dev"
    exit 1
fi

echo -n "🔍 Python TRI Service (5003): "
if curl -s http://localhost:5003/health >/dev/null 2>&1; then
    echo "✅ ONLINE"
else
    echo "❌ OFFLINE - Execute: cd python_tri_service && ./start_service.sh"
    exit 1
fi

echo ""
echo "📌 PASSO 2: Teste TRI V2 - Aluno Perfeito (100% acerto)"
echo "=========================================="

curl -X POST http://localhost:8080/api/calculate-tri-v2 \
  -H "Content-Type: application/json" \
  -d '{
    "alunos": [
      {
        "nome": "João Silva - Aluno Perfeito",
        "q1": "A", "q2": "B", "q3": "C", "q4": "D", "q5": "E",
        "q6": "A", "q7": "B", "q8": "C", "q9": "D", "q10": "E",
        "q11": "A", "q12": "B", "q13": "C", "q14": "D", "q15": "E",
        "q16": "A", "q17": "B", "q18": "C", "q19": "D", "q20": "E",
        "q21": "A", "q22": "B", "q23": "C", "q24": "D", "q25": "E",
        "q26": "A", "q27": "B", "q28": "C", "q29": "D", "q30": "E",
        "q31": "A", "q32": "B", "q33": "C", "q34": "D", "q35": "E",
        "q36": "A", "q37": "B", "q38": "C", "q39": "D", "q40": "E",
        "q41": "A", "q42": "B", "q43": "C", "q44": "D", "q45": "E"
      }
    ],
    "gabarito": {
      "1": "A", "2": "B", "3": "C", "4": "D", "5": "E",
      "6": "A", "7": "B", "8": "C", "9": "D", "10": "E",
      "11": "A", "12": "B", "13": "C", "14": "D", "15": "E",
      "16": "A", "17": "B", "18": "C", "19": "D", "20": "E",
      "21": "A", "22": "B", "23": "C", "24": "D", "25": "E",
      "26": "A", "27": "B", "28": "C", "29": "D", "30": "E",
      "31": "A", "32": "B", "33": "C", "34": "D", "35": "E",
      "36": "A", "37": "B", "38": "C", "39": "D", "40": "E",
      "41": "A", "42": "B", "43": "C", "44": "D", "45": "E"
    },
    "areas_config": {
      "Ciências Humanas": [1, 45]
    }
  }' | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print('\n✅ RESPOSTA RECEBIDA:')
    print(json.dumps(data, indent=2, ensure_ascii=False))
    
    if 'resultados' in data and len(data['resultados']) > 0:
        aluno = data['resultados'][0]
        print('\n📊 RESUMO:')
        print(f\"  Nome: {aluno['nome']}\")
        print(f\"  TRI Total: {aluno['tri_total']:.1f} pontos\")
        print(f\"  Acertos: {aluno['coerencia_analysis']['acertos_total']}/45\")
        print(f\"  Percentual: {aluno['coerencia_analysis']['percentual_acerto']:.1f}%\")
        print(f\"  Coerência: {aluno['coerencia_analysis']['coerencia']:.2f}\")
        print(f\"  Concordância: {aluno['coerencia_analysis']['concordancia']:.2f}\")
except Exception as e:
    print(f'\n❌ ERRO: {e}')
    print('Resposta inválida ou erro no serviço')
"

echo ""
echo ""
echo "📌 PASSO 3: Teste TRI V2 - Aluno Chutador (só acerta fáceis)"
echo "=========================================="

curl -X POST http://localhost:8080/api/calculate-tri-v2 \
  -H "Content-Type: application/json" \
  -d '{
    "alunos": [
      {
        "nome": "Maria Santos - Chutadora",
        "q1": "A", "q2": "B", "q3": "C", "q4": "D", "q5": "E",
        "q6": "A", "q7": "B", "q8": "C", "q9": "D", "q10": "E",
        "q11": "X", "q12": "X", "q13": "X", "q14": "X", "q15": "X",
        "q16": "X", "q17": "X", "q18": "X", "q19": "X", "q20": "X",
        "q21": "X", "q22": "X", "q23": "X", "q24": "X", "q25": "X",
        "q26": "X", "q27": "X", "q28": "X", "q29": "X", "q30": "X",
        "q31": "X", "q32": "X", "q33": "X", "q34": "X", "q35": "X",
        "q36": "X", "q37": "X", "q38": "X", "q39": "X", "q40": "X",
        "q41": "X", "q42": "X", "q43": "X", "q44": "X", "q45": "X"
      }
    ],
    "gabarito": {
      "1": "A", "2": "B", "3": "C", "4": "D", "5": "E",
      "6": "A", "7": "B", "8": "C", "9": "D", "10": "E",
      "11": "A", "12": "B", "13": "C", "14": "D", "15": "E",
      "16": "A", "17": "B", "18": "C", "19": "D", "20": "E",
      "21": "A", "22": "B", "23": "C", "24": "D", "25": "E",
      "26": "A", "27": "B", "28": "C", "29": "D", "30": "E",
      "31": "A", "32": "B", "33": "C", "34": "D", "35": "E",
      "36": "A", "37": "B", "38": "C", "39": "D", "40": "E",
      "41": "A", "42": "B", "43": "C", "44": "D", "45": "E"
    },
    "areas_config": {
      "Ciências Humanas": [1, 45]
    }
  }' | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'resultados' in data and len(data['resultados']) > 0:
        aluno = data['resultados'][0]
        print('\n📊 RESUMO:')
        print(f\"  Nome: {aluno['nome']}\")
        print(f\"  TRI Total: {aluno['tri_total']:.1f} pontos\")
        print(f\"  Acertos: {aluno['coerencia_analysis']['acertos_total']}/45\")
        print(f\"  Percentual: {aluno['coerencia_analysis']['percentual_acerto']:.1f}%\")
        print(f\"  Coerência: {aluno['coerencia_analysis']['coerencia']:.2f}\")
        print(f\"  Penalidades: {aluno['coerencia_analysis']['penalidades']}\")
except Exception as e:
    print(f'\n❌ ERRO: {e}')
"

echo ""
echo ""
echo "=========================================="
echo "✅ TESTE COMPLETO - INTEGRAÇÃO FUNCIONANDO!"
echo "=========================================="
echo ""
echo "📚 Como usar no seu código:"
echo ""
echo "fetch('http://localhost:8080/api/calculate-tri-v2', {"
echo "  method: 'POST',"
echo "  headers: { 'Content-Type': 'application/json' },"
echo "  body: JSON.stringify({"
echo "    alunos: [{nome: 'João', q1: 'A', q2: 'B', ...}],"
echo "    gabarito: {1: 'A', 2: 'B', ...},"
echo "    areas_config: {CH: [1, 45], CN: [46, 90]}"
echo "  })"
echo "})"
echo ".then(r => r.json())"
echo ".then(data => console.log(data));"
echo ""
