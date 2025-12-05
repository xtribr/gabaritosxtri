# 🚀 Como Usar a Validação ChatGPT

## ✅ Status: FUNCIONANDO

O endpoint está **100% funcional** e pronto para uso!

---

## 📝 Endpoint

```
POST http://localhost:5002/api/validate-with-chatgpt
```

---

## 🔧 Parâmetros (multipart/form-data)

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `image` | File | ✅ Sim | Arquivo PNG/JPG do gabarito |
| `template` | String | ❌ Não | `enem90` ou `enem45` (padrão: `enem90`) |
| `openai_api_key` | String | ✅ Sim | Sua chave OpenAI |

---

## 💻 Exemplos de Uso

### 1. Script Bash (Mais Fácil)

```bash
./test_chatgpt.sh

# Ou com imagem customizada:
./test_chatgpt.sh caminho/para/gabarito.png
```

### 2. cURL Direto

```bash
curl -X POST http://localhost:5002/api/validate-with-chatgpt \
  -F "image=@gabarito.png" \
  -F "template=enem90" \
  -F "openai_api_key=sk-proj-..."
```

### 3. Python

```python
import requests

with open("gabarito.png", "rb") as f:
    response = requests.post(
        "http://localhost:5002/api/validate-with-chatgpt",
        files={"image": f},
        data={
            "template": "enem90",
            "openai_api_key": "YOUR_OPENAI_API_KEY_HERE"
        }
    )

result = response.json()
print(f"Status: {result['status']}")
print(f"Concordância: {result['statistics']['agreement_rate']}%")
print(f"Correções: {result['statistics']['corrections_count']}")
```

### 4. JavaScript/TypeScript

```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);
formData.append('template', 'enem90');
formData.append('openai_api_key', 'sk-proj-...');

const response = await fetch('http://localhost:5002/api/validate-with-chatgpt', {
  method: 'POST',
  body: formData
});

const data = await response.json();
console.log('Concordância:', data.statistics.agreement_rate + '%');
```

---

## 📊 Resposta do Endpoint

```json
{
  "status": "sucesso",
  "omr_original": {
    "1": "A",
    "2": "B",
    ...
  },
  "chatgpt_validated": {
    "1": "A",
    "2": "C",  // Corrigido pelo ChatGPT
    ...
  },
  "corrections": [
    {
      "q": 2,
      "omr": "B",
      "corrected": "C",
      "reason": "bubble C is clearly marked, B is faint"
    }
  ],
  "statistics": {
    "corrections_count": 1,
    "agreement_rate": 98.9,
    "total_questions": 90
  },
  "template": "enem90",
  "model": "gpt-4o-mini"
}
```

---

## ❌ Tratamento de Erros

### Erro: Imagem não fornecida
```json
{
  "status": "erro",
  "mensagem": "Nenhuma imagem fornecida"
}
```

### Erro: API Key não fornecida
```json
{
  "status": "erro",
  "mensagem": "OPENAI_API_KEY não fornecida"
}
```

### Erro: ChatGPT API falhou
```json
{
  "status": "erro",
  "mensagem": "ChatGPT API error: 401",
  "omr_result": {...}  // Retorna resultado OMR como fallback
}
```

---

## 💰 Custos

- **Modelo**: gpt-4o-mini (mais barato)
- **Custo médio**: ~$0.05 por gabarito
- **Tempo**: 8-10 segundos

---

## 🎯 Quando Usar

✅ **Recomendado para:**
- Gabaritos com bolhas fracas/borradas
- Auditoria de resultados críticos
- Validação de baixa confiança do OMR
- Controle de qualidade

❌ **Não recomendado para:**
- Processamento em larga escala (custo alto)
- Quando OMR já tem >95% de confiança
- Gabaritos de alta qualidade

---

## 🔍 Interpretando Resultados

### Agreement Rate (Taxa de Concordância)
- **100%**: OMR e ChatGPT concordam totalmente
- **90-99%**: Poucas correções, boa qualidade
- **<90%**: Muitas divergências, revisar manualmente

### Corrections Count (Correções)
- **0**: Perfeito, nenhuma correção necessária
- **1-5**: Normal, pequenos ajustes
- **>10**: Possível problema na imagem ou calibragem

---

## 🛠️ Troubleshooting

### "Method Not Allowed"
✅ **Solução**: Certifique-se de usar `POST`, não GET

```bash
# ❌ Errado
curl http://localhost:5002/api/validate-with-chatgpt

# ✅ Correto
curl -X POST http://localhost:5002/api/validate-with-chatgpt \
  -F "image=@gabarito.png" \
  -F "openai_api_key=..."
```

### "Connection refused"
✅ **Solução**: Verificar se o serviço OMR está rodando

```bash
curl http://localhost:5002/health
# Deve retornar: {"status":"ok",...}
```

### "Invalid API key"
✅ **Solução**: Verificar sua chave OpenAI

```bash
# Testar API key diretamente
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer sk-proj-..."
```

---

## ✅ Checklist de Uso

- [ ] Serviço OMR rodando (`curl http://localhost:5002/health`)
- [ ] API Key OpenAI válida
- [ ] Imagem do gabarito disponível
- [ ] Template correto (`enem90` ou `enem45`)
- [ ] Método POST (não GET)
- [ ] Content-Type: multipart/form-data

---

## 🎉 Pronto!

O endpoint está **funcionando perfeitamente**. Use `./test_chatgpt.sh` para um teste rápido!

**Custo**: ~$0.05/gabarito  
**Tempo**: ~8s  
**Precisão**: Alta (ChatGPT Vision)
