# Política de Segurança e Proteção de Dados (LGPD)

## 🔒 Proteção de Dados Sensíveis

Este projeto lida com dados educacionais sensíveis de alunos. É **CRÍTICO** seguir as práticas de segurança abaixo.

## ⚠️ Arquivos que NUNCA devem ser commitados

O arquivo `.gitignore` está configurado para proteger automaticamente os seguintes tipos de arquivos:

- `*.csv` - Dados de alunos, gabaritos, estatísticas
- `*.xlsx`, `*.xls` - Planilhas com dados de alunos
- `data/` - Qualquer pasta com dados
- `uploads/` - Arquivos enviados pelos usuários
- `exports/` - Arquivos exportados

## 📋 Checklist antes de fazer commit

Antes de fazer `git commit`, verifique:

- [ ] Não há arquivos CSV com dados reais de alunos
- [ ] Não há arquivos Excel com dados reais de alunos
- [ ] Não há dados de alunos em logs ou arquivos temporários
- [ ] Variáveis de ambiente sensíveis estão no `.env` (não versionado)
- [ ] Tokens e senhas não estão hardcoded no código

## 🛡️ Boas Práticas

1. **Use dados de exemplo**: Para testes e desenvolvimento, use apenas dados fictícios
2. **Anonimização**: Se precisar usar dados reais para testes, anonimize completamente
3. **Variáveis de ambiente**: Nunca commite credenciais ou tokens
4. **Logs**: Não logue dados pessoais de alunos
5. **Backup**: Dados reais devem ser armazenados em locais seguros, não no repositório

## 📞 Reportar Problemas de Segurança

Se você encontrar dados sensíveis no repositório:

1. **NÃO** abra uma issue pública
2. Entre em contato diretamente com os mantenedores
3. Se possível, remova o commit sensível do histórico

## 🔐 LGPD (Lei Geral de Proteção de Dados)

Este projeto está em conformidade com a LGPD:

- Dados são processados apenas para fins educacionais
- Não compartilhamos dados com terceiros
- Usuários podem solicitar exclusão de dados
- Dados são armazenados de forma segura

## 📝 Exemplo de Dados Seguros para Testes

```csv
NOME;TURMA;MATRICULA
Aluno Teste 1;3º A;TEST001
Aluno Teste 2;3º B;TEST002
```

**NUNCA use:**
- Nomes reais de alunos
- Matrículas reais
- Dados que possam identificar pessoas reais

