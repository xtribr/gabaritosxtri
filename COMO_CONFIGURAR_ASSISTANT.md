# Como Configurar o Assistant ID

## 🔍 Problema Atual

O Assistant ID `asst_e0B9jTVTFZGw1ZvE5H38hx072` não está sendo encontrado.

## ✅ Passos para Resolver

### 1. Encontrar o Assistant ID Correto

1. Acesse o painel da OpenAI: https://platform.openai.com/assistants
2. Faça login na sua conta
3. Clique no Assistant que você quer usar
4. O ID aparece de duas formas:
   - **Na URL**: `https://platform.openai.com/assistants/asst_xxxxxxxxxxxxx`
   - **No campo "Assistant ID"** na página do Assistant

### 2. Verificar a API Key

Certifique-se de que:
- A `OPENAI_API_KEY` está configurada
- A API key é da mesma conta onde o Assistant foi criado
- A API key tem permissões para usar Assistants

### 3. Configurar o Assistant ID

**Opção A: Variável de Ambiente (Temporária)**
```bash
export OPENAI_ASSISTANT_ID='asst_seu_id_correto'
npm run dev
```

**Opção B: Arquivo .env (Permanente)**
```bash
# Crie ou edite o arquivo .env na raiz do projeto
echo "OPENAI_ASSISTANT_ID=asst_seu_id_correto" >> .env
```

**Opção C: No código (Não recomendado para produção)**
Edite `server/routes.ts` e altere a linha:
```typescript
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID || "asst_seu_id_correto";
```

### 4. Reiniciar o Servidor

Após configurar, reinicie o servidor:
```bash
# Parar servidor atual
pkill -f "tsx server/index.ts"

# Iniciar novamente
npm run dev
```

### 5. Testar

Execute o teste:
```bash
node test_assistant_especifico.js
```

## 🧪 Teste Rápido

Para testar se o Assistant ID está correto, você pode usar este comando:

```bash
curl https://api.openai.com/v1/assistants/asst_seu_id_aqui \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "OpenAI-Beta: assistants=v2"
```

Se retornar os dados do Assistant, o ID está correto!

## ❓ Ainda com Problemas?

1. Verifique se o Assistant existe na sua conta
2. Verifique se a API key tem acesso à API de Assistants
3. Verifique se você está usando a versão correta da API (assistants=v2)

