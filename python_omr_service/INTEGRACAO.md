# Guia de Integração - baddrow-python com Frontend HTML

## Visão Geral

Este serviço Python substitui o processamento OMR atual, usando técnicas de visão computacional (OpenCV) inspiradas em baddrow-python. A principal vantagem é a **detecção adaptativa** que não depende de coordenadas fixas.

## Diferenças Principais

### Sistema Atual (Node.js/TypeScript)
- ❌ Depende de coordenadas fixas no `schema.ts`
- ❌ Falha com gabaritos desalinhados ou rotacionados
- ❌ Requer calibração manual

### Novo Sistema (Python/baddrow-python)
- ✅ Detecta automaticamente a estrutura do gabarito
- ✅ Resiste a rotação, inclinação e variações de escala
- ✅ Usa OpenCV para detecção robusta de bolhas
- ✅ Não precisa de coordenadas pré-definidas

## Como Usar

### 1. Iniciar o Serviço Python

```bash
cd python_omr_service
./start_service.sh
```

Ou manualmente:

```bash
cd python_omr_service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

O serviço estará disponível em `http://localhost:5002` (porta 5002 para evitar conflito com AirPlay no macOS)

### 2. Atualizar o Frontend HTML

No seu HTML, atualize a constante `PYTHON_API_URL`:

```javascript
// ANTES (se estava usando outro serviço)
const PYTHON_API_URL = "https://ocr-xtri.onrender.com/api/process-pdf";

// DEPOIS (usando o novo serviço)
const PYTHON_API_URL = "http://localhost:5002/api/process-pdf";
// ou em produção:
const PYTHON_API_URL = "https://seu-servidor.onrender.com/api/process-pdf";
```

### 3. Formato de Resposta

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
          "3": "Não respondeu",
          ...
        }
      }
    }
  ],
  "total_paginas": 1
}
```

## Deploy em Produção

### Render.com

1. **Criar novo Web Service**
   - Nome: `omr-service` (ou similar)
   - Ambiente: Python 3
   - Branch: `main`

2. **Configurar Build**
   - **Build Command:**
     ```bash
     pip install -r python_omr_service/requirements.txt
     ```
   - **Start Command:**
     ```bash
     cd python_omr_service && python app.py
     ```

3. **Variáveis de Ambiente**
   - Não são necessárias para funcionamento básico
   - Pode adicionar `FLASK_ENV=production` se desejar

4. **Atualizar Frontend**
   ```javascript
   const PYTHON_API_URL = "https://seu-servico.onrender.com/api/process-pdf";
   ```

### Outras Plataformas

**Heroku:**
```bash
heroku create seu-omr-service
cd python_omr_service
git subtree push --prefix python_omr_service heroku main
```

**Railway:**
- Conectar repositório
- Detectar automaticamente Python
- Configurar start command: `cd python_omr_service && python app.py`

## Testando Localmente

### 1. Teste Básico

```bash
# Terminal 1: Iniciar serviço
cd python_omr_service
python app.py

# Terminal 2: Testar health
curl http://localhost:5002/health

# Terminal 3: Testar com PDF (substitua URL)
curl "http://localhost:5002/api/process-pdf?url=https://res.cloudinary.com/.../sample.pdf"
```

### 2. Teste com Frontend HTML

1. Abrir o HTML no navegador
2. Configurar `PYTHON_API_URL = "http://localhost:5002/api/process-pdf"`
3. Fazer upload de um PDF de teste
4. Verificar logs no terminal do serviço Python

## Troubleshooting

### Erro: "pdf2image não está instalado"

**Solução:**
```bash
# Linux
sudo apt-get install poppler-utils

# macOS
brew install poppler

# Windows
# Baixar de: https://github.com/oschwartz10612/poppler-windows/releases
```

### Erro: "Poucas bolhas detectadas"

**Possíveis causas:**
- Imagem de baixa qualidade (DPI < 150)
- Gabarito muito desalinhado
- Contraste insuficiente

**Solução:**
- Aumentar DPI na conversão do PDF (padrão: 150, tentar 200-300)
- Melhorar qualidade do scan original
- Verificar se o gabarito está completo na imagem

### Performance Lenta

**Otimizações:**
1. Reduzir DPI (se qualidade permitir)
2. Processar páginas em paralelo (requer adaptação)
3. Usar cache para PDFs já processados

## Próximos Passos

1. **Melhorar Detecção:**
   - Adicionar calibração automática usando marcadores de canto
   - Implementar detecção de rotação e correção automática

2. **Otimização:**
   - Processamento em lote
   - Cache de resultados
   - Processamento assíncrono para PDFs grandes

3. **Métricas:**
   - Adicionar confiança por resposta
   - Logs detalhados de detecção
   - Estatísticas de precisão

## Comparação de Resultados

Para validar a migração, compare resultados:

1. Processar mesmo PDF com sistema antigo e novo
2. Comparar número de respostas detectadas
3. Verificar consistência das respostas
4. Ajustar thresholds se necessário

## Suporte

Em caso de problemas:
1. Verificar logs do serviço Python
2. Testar endpoint `/health`
3. Verificar formato da resposta
4. Comparar com formato esperado pelo frontend

