# 🚀 Integração Completa: baddrow-python + Frontend HTML

## ✅ O que foi criado

### 1. Serviço Python (`python_omr_service/`)

- ✅ **`app.py`**: Servidor Flask com endpoints compatíveis com seu HTML
- ✅ **`requirements.txt`**: Todas as dependências necessárias
- ✅ **`start_service.sh`**: Script para iniciar facilmente
- ✅ **`README.md`**: Documentação completa
- ✅ **`INTEGRACAO.md`**: Guia de integração detalhado

### 2. Características Principais

#### Detecção Robusta com OpenCV
- Usa `HoughCircles` para detectar bolhas automaticamente
- Múltiplas tentativas com diferentes configurações
- Remove duplicatas e valida detecções

#### Detecção de Estrutura
- Identifica colunas e linhas do gabarito automaticamente
- Não depende de coordenadas fixas
- Resiste a rotação e inclinação

#### Análise de Preenchimento
- Calcula porcentagem de preenchimento de cada bolha
- Compara bolhas da mesma questão
- Threshold adaptativo (25% mínimo, 12% diferença)

## 📋 Como Usar

### Passo 1: Instalar Dependências do Sistema

**Linux:**
```bash
sudo apt-get update
sudo apt-get install poppler-utils
```

**macOS:**
```bash
brew install poppler
```

**Windows:**
- Baixar poppler de: https://github.com/oschwartz10612/poppler-windows/releases
- Extrair e adicionar `bin/` ao PATH

### Passo 2: Instalar Dependências Python

```bash
cd python_omr_service
python3 -m venv venv
source venv/bin/activate  # No Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Passo 3: Iniciar Serviço

```bash
# Opção 1: Usar script
./start_service.sh

# Opção 2: Manual
python app.py
```

Serviço estará em: `http://localhost:5002` (porta 5002 para evitar conflito com AirPlay no macOS)

### Passo 4: Atualizar Frontend HTML

No seu HTML, apenas atualize a URL:

```javascript
// ANTES
const PYTHON_API_URL = "https://ocr-xtri.onrender.com/api/process-pdf";

// DEPOIS (local)
const PYTHON_API_URL = "http://localhost:5002/api/process-pdf";

// DEPOIS (produção - após deploy)
const PYTHON_API_URL = "https://seu-servico.onrender.com/api/process-pdf";
```

**O resto do código HTML permanece igual!** ✅

## 🔄 Formato de Resposta

O serviço retorna exatamente o formato que seu HTML espera:

```json
{
  "status": "sucesso",
  "paginas": [
    {
      "pagina": 1,
      "resultado": {
        "questoes": {
          "1": "A",
          "2": "B",
          "3": "C",
          "4": "Não respondeu",
          ...
        }
      }
    }
  ],
  "total_paginas": 1
}
```

## 🚀 Deploy em Produção

### Render.com (Recomendado)

1. **Criar Web Service**
   - Nome: `omr-baddrow-service`
   - Ambiente: Python 3
   - Branch: `main`

2. **Configurar:**
   - **Build Command:**
     ```bash
     pip install -r python_omr_service/requirements.txt
     ```
   - **Start Command:**
     ```bash
     cd python_omr_service && python app.py
     ```

3. **Atualizar HTML:**
   ```javascript
   const PYTHON_API_URL = "https://omr-baddrow-service.onrender.com/api/process-pdf";
   ```

## 🧪 Testando

### Teste 1: Health Check

```bash
curl http://localhost:5002/health
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "service": "baddrow-omr-service",
  "template": {
    "total_questions": 90,
    "options_per_question": 5,
    ...
  }
}
```

### Teste 2: Processar PDF

```bash
curl "http://localhost:5002/api/process-pdf?url=https://res.cloudinary.com/.../sample.pdf"
```

### Teste 3: Com Frontend HTML

1. Abrir HTML no navegador
2. Configurar URL para `http://localhost:5002/api/process-pdf`
3. Fazer upload de PDF
4. Verificar logs no terminal do serviço

## 📊 Comparação: Antes vs Depois

| Aspecto | Sistema Atual | Novo Sistema (baddrow) |
|---------|---------------|------------------------|
| **Coordenadas** | Fixas no schema.ts | Detectadas automaticamente |
| **Desalinhamento** | ❌ Falha | ✅ Resiste |
| **Rotação** | ❌ Falha | ✅ Detecta e corrige |
| **Inclinação** | ❌ Falha | ✅ Detecta e corrige |
| **Calibração** | Manual necessária | Automática |
| **Robustez** | Baixa | Alta |

## 🔧 Ajustes Finais (Opcional)

Se precisar ajustar sensibilidade:

**No arquivo `app.py`, função `process_omr_page()`:**

```python
# Linha ~200: Threshold de preenchimento
threshold = 0.25  # Aumentar para ser mais rigoroso, diminuir para mais permissivo

# Linha ~201: Diferença mínima entre bolhas
min_difference = 0.12  # Aumentar para evitar falsos positivos
```

## 📝 Próximos Passos

1. ✅ Testar localmente
2. ✅ Fazer deploy em produção
3. ✅ Atualizar URL no HTML
4. ✅ Validar resultados com PDFs reais
5. ⏳ (Opcional) Adicionar calibração com marcadores de canto
6. ⏳ (Opcional) Melhorar detecção de rotação

## 🆘 Troubleshooting

### "pdf2image não está instalado"
→ Instalar poppler-utils (veja Passo 1)

### "Poucas bolhas detectadas"
→ Aumentar DPI na conversão ou melhorar qualidade do scan

### "Erro 502 no Render"
→ Verificar se poppler está disponível no ambiente
→ Aumentar timeout do serviço

### "Respostas incorretas"
→ Ajustar thresholds (veja seção "Ajustes Finais")
→ Verificar qualidade da imagem original

## ✨ Vantagens da Nova Abordagem

1. **Não precisa de coordenadas fixas** - Detecta automaticamente
2. **Resiste a desalinhamentos** - Usa visão computacional
3. **Mais robusto** - Múltiplas técnicas de detecção
4. **Fácil manutenção** - Menos configuração manual
5. **Compatível** - Funciona com seu HTML existente

---

**Pronto para usar!** 🎉

O serviço está completo e compatível com seu frontend HTML. Basta iniciar o serviço Python e atualizar a URL no HTML.

