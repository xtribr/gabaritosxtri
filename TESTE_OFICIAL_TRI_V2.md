# 🚀 Guia de Teste Oficial - TRI V2 Localhost

## ✅ Integração Completa

A integração entre o backend TypeScript e o serviço Python TRI V2 está **100% concluída**.

### 📊 Arquitetura

```
Frontend (React)
    ↓
Express Backend (porta 8080)
    ↓
    ├─→ Python OMR Service (porta 5002) - Processamento de imagens
    └─→ Python TRI V2 Service (porta 5003) - Cálculo TRI Coerência Pedagógica
```

---

## 🎯 Como Iniciar Todos os Serviços

### Opção 1: Script Automático (RECOMENDADO)

```bash
cd "/Users/xandao/Desktop/OCR XTRI GABARITO/gabaritosxtri"
./start_all_services.sh
```

Este script vai:
1. ✅ Limpar processos antigos nas portas 8080, 5002, 5003
2. ✅ Iniciar Python OMR Service (porta 5002)
3. ✅ Iniciar Python TRI V2 Service (porta 5003)
4. ✅ Iniciar Express Backend (porta 8080)
5. ✅ Verificar health de todos os serviços

**Logs disponíveis:**
- OMR: `tail -f /tmp/omr_service.log`
- TRI: `tail -f /tmp/tri_service.log`
- Express: `tail -f /tmp/express_backend.log`

### Opção 2: Manual (passo a passo)

#### 1. Python OMR Service
```bash
cd python_omr_service
source venv/bin/activate
python app.py
# Deve mostrar: "Running on http://127.0.0.1:5002"
```

#### 2. Python TRI V2 Service
```bash
cd python_tri_service
source venv/bin/activate
python app.py
# Deve mostrar: "Running on http://127.0.0.1:5003"
```

#### 3. Express Backend
```bash
cd "/Users/xandao/Desktop/OCR XTRI GABARITO/gabaritosxtri"
npm run dev
# Deve mostrar: "Server running on port 8080"
```

---

## 🧪 Testes de Validação

### 1. Health Check de Todos os Serviços

```bash
# OMR Service
curl http://localhost:5002/health
# Esperado: {"status":"online",...}

# TRI V2 Service
curl http://localhost:5003/health
# Esperado: {"status":"online","tabela_carregada":true,"version":"2.0.0"}

# Express Backend
curl http://localhost:8080/api/health
# Esperado: {"ok":true} ou similar
```

### 2. Teste TRI V2 Completo (via Express)

```bash
curl -X POST http://localhost:8080/api/calculate-tri-v2 \
  -H 'Content-Type: application/json' \
  -d '{
    "alunos": [
      {
        "nome": "João Silva",
        "q1": "A", "q2": "B", "q3": "C", "q4": "D", "q5": "E",
        "q6": "A", "q7": "B", "q8": "C", "q9": "D", "q10": "E"
      }
    ],
    "gabarito": {
      "1": "A", "2": "B", "3": "C", "4": "D", "5": "E",
      "6": "A", "7": "B", "8": "C", "9": "D", "10": "E"
    },
    "areas_config": {
      "Area 1": [1, 5],
      "Area 2": [6, 10]
    }
  }'
```

**Resposta esperada:**
```json
{
  "status": "sucesso",
  "total_alunos": 1,
  "prova_analysis": {
    "total_questoes": 10,
    "distribuicao": {...},
    "padroes_esperados": {...}
  },
  "resultados": [
    {
      "nome": "João Silva",
      "tri_total": 850.0,
      "areas": {...},
      "coerencia_analysis": {...}
    }
  ]
}
```

### 3. Teste TRI V2 Direto (Python)

```bash
cd python_tri_service
./test_curl.sh
```

---

## 🔍 Endpoints Disponíveis

### TRI V2 (Novo - Coerência Pedagógica)

**POST** `/api/calculate-tri-v2`

**Body:**
```json
{
  "alunos": [
    {
      "nome": "string",
      "q1": "A|B|C|D|E",
      "q2": "A|B|C|D|E",
      ...
    }
  ],
  "gabarito": {
    "1": "A",
    "2": "B",
    ...
  },
  "areas_config": {
    "CH": [1, 45],
    "CN": [46, 90],
    ...
  }
}
```

**Response:**
```json
{
  "status": "sucesso",
  "total_alunos": 1,
  "prova_analysis": {
    "total_questoes": 45,
    "distribuicao": {
      "Muito Fácil": 10,
      "Fácil": 12,
      "Média": 11,
      "Difícil": 8,
      "Muito Difícil": 4
    },
    "padroes_esperados": {
      "acima_50": {"Muito Fácil": 90, "Fácil": 70, ...},
      "30_a_50": {...},
      "abaixo_30": {...}
    }
  },
  "resultados": [
    {
      "nome": "João Silva",
      "tri_total": 750.5,
      "areas": {
        "CH": {"acertos": 30, "total": 45, "tri": 680.3},
        ...
      },
      "coerencia_analysis": {
        "acertos_total": 75,
        "percentual_acerto": 83.3,
        "taxa_muito_facil": 90.0,
        "coerencia": 1.15,
        "concordancia": 0.85,
        "penalidades": [],
        "ajuste_coerencia": 50.0,
        "ajuste_relacao": 25.0
      }
    }
  ]
}
```

---

## 🎯 Cenários de Teste

### Teste 1: Aluno Perfeito (100% acerto)
- **Esperado TRI**: ~900 (máximo)
- **Coerência**: Alta (acerta todas as dificuldades)
- **Penalidades**: 0

### Teste 2: Aluno Chutador (acerta apenas fáceis)
- **Esperado TRI**: ~450-550
- **Coerência**: Média (acerta só fáceis)
- **Penalidades**: 0

### Teste 3: Aluno Padrão Inverso (acerta difíceis, erra fáceis)
- **Esperado TRI**: Baixo (penalidade -60 pts)
- **Coerência**: Baixa
- **Penalidades**: "padrão inverso detectado"

---

## 🛑 Parar Todos os Serviços

```bash
./stop_all_services.sh
```

Ou manualmente:
```bash
# Matar todos os processos
pkill -9 -f "tsx.*server"
pkill -9 -f "python.*app.py"

# Liberar portas
lsof -ti :8080 | xargs kill -9
lsof -ti :5002 | xargs kill -9
lsof -ti :5003 | xargs kill -9
```

---

## 🐛 Troubleshooting

### Problema: Porta já em uso

```bash
# Verificar processo na porta
lsof -i :5003

# Matar processo
lsof -ti :5003 | xargs kill -9
```

### Problema: Serviço TRI não inicia

```bash
# Verificar logs
tail -f /tmp/tri_service.log

# Verificar se tabela foi carregada
curl http://localhost:5003/api/debug
```

### Problema: Erro de serialização JSON (numpy)

✅ **JÁ RESOLVIDO** - A função `convert_numpy()` em `app.py` converte automaticamente tipos numpy para JSON.

### Problema: Express não conecta ao TRI

```bash
# Verificar se checkPythonTRIService() retorna true
# Logs do Express devem mostrar: "[TRI V2] Chamando serviço Python..."
tail -f /tmp/express_backend.log
```

---

## ✅ Checklist de Validação

- [ ] Serviço OMR responde em http://localhost:5002/health
- [ ] Serviço TRI responde em http://localhost:5003/health
- [ ] Express backend responde em http://localhost:8080
- [ ] Endpoint `/api/calculate-tri-v2` retorna resultado válido
- [ ] `prova_analysis` contém distribuição de dificuldades
- [ ] `coerencia_analysis` contém taxa de acerto por dificuldade
- [ ] TRI total está entre 300-900
- [ ] Penalidades detectam padrão inverso corretamente

---

## 📚 Documentação de Referência

- **TRI**: `/data/tri_v2_producao/tri_v2_producao.py`
- **Serviço Python TRI**: `/python_tri_service/README.md`
- **Integração Backend**: `/server/routes.ts` (linhas 1308-1355)

---

## 🎉 Pronto para Teste!

Execute:
```bash
./start_all_services.sh
```

E acesse seu frontend em **http://localhost:5173** (ou a porta do Vite).

O sistema está 100% integrado e pronto para uso! 🚀
