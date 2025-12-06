# Python TRI Service V2

Serviço REST para cálculo de TRI com **coerência pedagógica** (V2).

## 🚀 Quick Start

```bash
# Dar permissão de execução
chmod +x start_service.sh

# Iniciar serviço
./start_service.sh
```

Serviço estará disponível em: `http://localhost:5003`

## 📡 Endpoints

### 1. Health Check
```bash
GET /health
```

Resposta:
```json
{
  "status": "online",
  "service": "python_tri_v2",
  "version": "2.0.0",
  "tabela_carregada": true
}
```

### 2. Calcular TRI
```bash
POST /api/calcular-tri
Content-Type: application/json
```

**Entrada**:
```json
{
  "alunos": [
    {
      "nome": "João Silva",
      "q1": "A",
      "q2": "B",
      ...
      "q90": "E"
    }
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
```

**Saída**:
```json
{
  "status": "sucesso",
  "total_alunos": 30,
  "prova_analysis": {
    "muito_facil": {"questoes": [1, 5, 8], "pct_medio": 0.85},
    "facil": {...},
    "media": {...},
    "dificil": {...},
    "muito_dificil": {...}
  },
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
        "LC": {
          "n_acertos": 15,
          "pct_acertos": 0.333,
          "tri": {"tri_ajustado": 487}
        },
        "CH": {...},
        "CN": {...},
        "MT": {...}
      }
    }
  ]
}
```

### 3. Debug
```bash
GET /api/debug
```

## 🧪 Teste Manual

```bash
# 1. Verificar health
curl http://localhost:5003/health

# 2. Testar cálculo TRI
curl -X POST http://localhost:5003/api/calcular-tri \
  -H "Content-Type: application/json" \
  -d '{
    "alunos": [{"nome": "Teste", "q1": "A", "q2": "B"}],
    "gabarito": {"1": "A", "2": "B"}
  }'
```

## 📂 Estrutura

```
python_tri_service/
├── app.py                  # API Flask
├── requirements.txt        # Dependências Python
├── start_service.sh       # Script de inicialização
├── README.md              # Este arquivo
└── venv/                  # Ambiente virtual (criado automaticamente)
```

## 🔧 Dependências

- Flask 3.0+
- Flask-CORS
- Pandas
- Numpy
- Openpyxl

## ⚙️ Configuração

O serviço busca a tabela TRI em:
```
../data/tri_v2_producao/tabela_tri_referencia.xlsx
```

Se não encontrar, cria uma tabela de exemplo automaticamente.

## 🐛 Troubleshooting

### Erro: "Tabela TRI não carregada"
```bash
# Verificar se arquivo existe
ls -l ../data/tri_v2_producao/tabela_tri_referencia.xlsx

# Se não existir, gerar exemplo
cd ../data/tri_v2_producao
python gerar_dados_exemplo.py
```

### Erro: "Port 5003 already in use"
```bash
# Matar processo na porta 5003
lsof -ti:5003 | xargs kill -9
```

## 📊 Performance

- **Latência típica**: 50-200ms (depende do número de alunos)
- **Throughput**: ~100 alunos/segundo
- **Memória**: ~50MB base + 1MB por 100 alunos

## 🔐 Segurança

Para produção:
1. Adicionar autenticação (API Key)
2. Rate limiting
3. Validação de input rigorosa
4. HTTPS
