# 🔍 Diagnóstico - Página em Branco

## ✅ Servidor está funcionando
- ✅ Servidor rodando na porta 8080
- ✅ API respondendo: http://localhost:8080/api/health
- ✅ Vite transformando arquivos corretamente

## 🔍 Como Diagnosticar

### 1. Abra o Console do Navegador

**Chrome/Edge:**
- Pressione `F12` ou `Cmd+Option+I` (Mac)
- Vá na aba "Console"

**Firefox:**
- Pressione `F12` ou `Cmd+Option+K` (Mac)
- Vá na aba "Console"

**Safari:**
- Ative o menu Desenvolvedor: Preferências > Avançado > "Mostrar menu Desenvolvedor"
- Pressione `Cmd+Option+C`

### 2. Verifique Erros

Procure por mensagens em **vermelho** no console. Erros comuns:

- `Cannot find module` - Dependência faltando
- `Failed to fetch` - Problema de rede
- `Uncaught Error` - Erro de JavaScript
- `404 Not Found` - Arquivo não encontrado

### 3. Verifique a Aba Network

1. Abra as DevTools (F12)
2. Vá na aba "Network"
3. Recarregue a página (F5)
4. Procure por requisições com status **vermelho** (erro)

### 4. Teste Direto

Abra no navegador:
```
http://localhost:8080/api/health
```

Deve retornar:
```json
{"status":"ok","timestamp":"..."}
```

## 🛠️ Soluções Comuns

### Problema: Erro de módulo não encontrado

**Solução:**
```bash
# Pare o servidor (Ctrl+C)
# Reinstale as dependências
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Problema: Erro de CSS não encontrado

**Solução:**
Verifique se o arquivo existe:
```bash
ls -la client/src/index.css
```

### Problema: Porta diferente

Se você mudou a porta, certifique-se de acessar a porta correta:
- Porta 8080: http://localhost:8080
- Porta 3000: http://localhost:3000
- Porta 5000: http://localhost:5000

### Problema: Cache do navegador

**Solução:**
1. Pressione `Cmd+Shift+R` (Mac) ou `Ctrl+Shift+R` (Windows) para hard refresh
2. Ou limpe o cache do navegador

## 📋 Checklist

- [ ] Console do navegador aberto
- [ ] Sem erros vermelhos no console
- [ ] Aba Network sem erros 404
- [ ] URL correta: http://localhost:8080
- [ ] Servidor rodando (verifique o terminal)

## 🆘 Se Nada Funcionar

1. **Pare o servidor** (Ctrl+C no terminal)
2. **Verifique os logs** no terminal onde o servidor está rodando
3. **Copie os erros** do console do navegador
4. **Verifique se todas as dependências estão instaladas:**
   ```bash
   npm install
   ```

## 📞 Informações para Suporte

Se precisar de ajuda, forneça:
1. Erros do console do navegador (screenshot ou texto)
2. Erros do terminal onde o servidor está rodando
3. Versão do Node.js: `node -v`
4. Versão do npm: `npm -v`

