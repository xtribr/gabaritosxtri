#!/bin/bash

echo "================================"
echo "🧪 TESTE SERVIÇO TRI V2"
echo "================================"

# Teste com dados REAIS (10 questões, 3 alunos)
curl -X POST http://localhost:5003/api/calcular-tri \
  -H "Content-Type: application/json" \
  -d '{
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
  }' | python3 -m json.tool
