# 🚀 Guia de Inicialização Rápida - Sistema Completo

## ✅ Tudo Está Integrado e Pronto!

O sistema possui **100% de integração** entre frontend e backend, incluindo:
- ✅ Python OMR Service (porta 5002) - Processamento de gabaritos
- ✅ Python TRI V2 Service (porta 5003) - Cálculo TRI Coerência Pedagógica
- ✅ Express Backend (porta 8080) - API REST
- ✅ Frontend React (porta 5173) - Interface completa

---

## 🎯 Iniciar Todos os Serviços (1 Comando)

```bash
cd "/Users/xandao/Desktop/OCR XTRI GABARITO/gabaritosxtri"
./start_all_services.sh
```

Este script vai:
1. ✅ Limpar processos antigos (kill automaticamente)
2. ✅ Iniciar Python OMR Service (porta 5002)
3. ✅ Iniciar Python TRI V2 Service (porta 5003)
4. ✅ Iniciar Express Backend + Frontend (porta 8080 + 5173)
5. ✅ Abrir navegador automaticamente

**Para parar**: `Ctrl+C` (mata todos os processos automaticamente)

---

## 📊 Como Usar o TRI V2 no Frontend

### Passo 1: Processar Gabaritos
1. Acesse http://localhost:5173
2. Faça upload dos PDFs dos gabaritos
3. Configure o template (ENEM 90, etc.)
4. Processe os gabaritos

### Passo 2: Configurar Gabarito
1. Vá na aba **"Gabarito"**
2. Cadastre as respostas corretas (ou importe CSV)
3. Salve o gabarito

### Passo 3: Calcular TRI
1. Vá na aba **"TRI"**
2. Escolha o algoritmo:
   - **TRI V1 - Lookup Table**: Baseado em tabela histórica ENEM 2009-2023
   - **TRI V2 - Coerência Pedagógica**: Análise avançada com detecção de padrões
3. Clique em **"Calcular TRI"**
4. Veja os resultados:
   - Nota TRI total (300-900)
   - Nota TRI por área (LC, CH, CN, MT)
   - Gráficos de dispersão
   - Análise de coerência

---

## 🎨 Diferenças entre TRI V1 e TRI V2

| Aspecto | TRI V1 (Lookup) | TRI V2 (Coerência Pedagógica) |
|---------|-----------------|-------------------------------|
| **Algoritmo** | Interpolação em tabela histórica ENEM | Análise estatística avançada |
| **Entrada** | Área + Ano + Acertos | Respostas individuais + Gabarito |
| **Coerência** | Score Real / Score Ideal | Taxa de acerto por dificuldade |
| **Ajustes** | ±50% por coerência | Coerência (±50%) + Relação (±30%) + Penalidades (-60) |
| **Análise Prova** | ❌ Não | ✅ Distribuição de dificuldades |
| **Penalidades** | ❌ Não | ✅ Detecta padrão inverso |
| **Output** | TRI score | TRI + análise detalhada |
| **Velocidade** | ⚡ Muito rápido | 🐢 Mais lento (2-3 segundos) |
| **Precisão** | ⭐⭐⭐ Boa | ⭐⭐⭐⭐⭐ Excelente |

---

## 🧪 Testes de Validação

### Teste Completo de Integração
```bash
./test_tri_v2_integration.sh
```

Este script testa:
- ✅ Health check de todos os serviços
- ✅ Cálculo TRI V2 com aluno perfeito (100%)
- ✅ Cálculo TRI V2 com aluno chutador (22%)
- ✅ Retorno de dados completos (análise de coerência)

### Teste Manual via cURL
```bash
curl -X POST http://localhost:8080/api/calculate-tri-v2 \
  -H "Content-Type: application/json" \
  -d '{
    "alunos": [
      {
        "nome": "João Silva",
        "q1": "A", "q2": "B", "q3": "C", "q4": "D", "q5": "E",
        ...
      }
    ],
    "gabarito": {
      "1": "A", "2": "B", "3": "C", ...
    },
    "areas_config": {
      "Ciências Humanas": [1, 45]
    }
  }'
```

---

## 📝 Logs e Troubleshooting

### Ver Logs dos Serviços
```bash
# OMR Service
tail -f /tmp/omr_service.log

# TRI V2 Service
tail -f /tmp/tri_service.log

# Express Backend
tail -f /tmp/express_backend.log
```

### Problemas Comuns

**Porta já em uso:**
```bash
# Verificar processo
lsof -i :5003

# Matar processo
lsof -ti :5003 | xargs kill -9
```

**Serviço não inicia:**
```bash
# Verificar logs
tail -30 /tmp/tri_service.log

# Verificar se tabela foi carregada
curl http://localhost:5003/api/debug
```

**Frontend não conecta ao backend:**
```bash
# Verificar se todos estão rodando
curl http://localhost:5002/health  # OMR
curl http://localhost:5003/health  # TRI
curl http://localhost:8080/api/calculate-tri-v2  # Express
```

---

## 🎯 Funcionalidades do TRI V2

### 1. Análise de Coerência Pedagógica
- Taxa de acerto por nível de dificuldade
- Detecção de padrão esperado vs real
- Ajuste de ±50% baseado em coerência

### 2. Relação Prova-Aluno
- Concordância estatística entre prova e aluno
- Ajuste de ±30% baseado em concordância
- Desvio total calculado

### 3. Penalidades
- Padrão inverso: acerta difíceis, erra fáceis (-60 pts)
- Detecção automática de inconsistências
- Registro no resultado final

### 4. Análise da Prova
- Distribuição por dificuldade (Muito Fácil, Fácil, Média, Difícil, Muito Difícil)
- Padrões esperados de acerto
- Estatísticas por área

---

## 📚 Estrutura do Projeto

```
gabaritosxtri/
├── client/                          # Frontend React
│   └── src/
│       └── pages/
│           └── home.tsx            # ✅ TRI V2 integrado (linha 1017-1149)
├── server/                          # Backend Express
│   ├── routes.ts                   # ✅ API TRI V2 (linha 1308-1355)
│   └── index.ts
├── python_omr_service/             # Serviço OMR Python
│   ├── app.py                      # Porta 5002
│   └── requirements.txt
├── python_tri_service/             # Serviço TRI V2 Python
│   ├── app.py                      # Porta 5003 ✅ NOVO
│   ├── requirements.txt
│   └── README.md
├── data/
│   └── tri_v2_producao/
│       ├── tri_v2_producao.py      # Algoritmo TRI V2
│       └── tabela_tri_referencia.xlsx
├── start_all_services.sh           # ✅ Script de inicialização
├── stop_all_services.sh
└── test_tri_v2_integration.sh      # ✅ Script de teste
```

---

## ✅ Checklist de Validação

- [x] Serviço OMR responde em http://localhost:5002/health
- [x] Serviço TRI V2 responde em http://localhost:5003/health
- [x] Express backend responde em http://localhost:8080
- [x] Frontend abre em http://localhost:5173
- [x] Endpoint `/api/calculate-tri-v2` retorna resultado válido
- [x] Frontend possui seletor de versão TRI (V1/V2)
- [x] Botão "Calcular TRI V2" funciona
- [x] Resultados aparecem na tabela de alunos
- [x] Gráficos exibem dados corretos
- [x] TRI total está entre 300-900
- [x] TRI por área está entre 300-900

---

## 🎉 Sistema 100% Operacional!

Execute:
```bash
./start_all_services.sh
```

Acesse: **http://localhost:5173**

Divirta-se! 🚀
