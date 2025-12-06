# Integração Assistant API - Análise ENEM/TRI

## 📋 Resumo

Rota criada para integração com o Assistant API da OpenAI, permitindo análises personalizadas do desempenho de alunos no ENEM usando TRI.

## 🚀 Endpoint

**POST** `/api/analise-enem-tri`

## ⚙️ Configuração

### Variáveis de Ambiente

```bash
# Obrigatória
export OPENAI_API_KEY="sk-..."

# Opcional (usa o padrão se não configurado)
export OPENAI_ASSISTANT_ID="asst_e0B9jTVTFZGw1ZvE5H38hx072"
```

## 📝 Exemplo de Requisição

### Dados Obrigatórios
- `respostasAluno`: Array de respostas do aluno (ex: `["A", "B", "C", ...]`)
- `tri` ou `triGeral`: Nota TRI geral do aluno
- `anoProva`: Ano da prova ENEM (ex: `2023`)

### Dados Opcionais
- `nomeAluno`: Nome do aluno
- `matricula`: Matrícula do aluno
- `turma`: Turma do aluno
- `serie`: Série do aluno
- `acertos`: Número de acertos
- `erros`: Número de erros
- `nota`: Nota do aluno
- `triLc`: TRI de Linguagens e Códigos
- `triCh`: TRI de Ciências Humanas
- `triCn`: TRI de Ciências da Natureza
- `triMt`: TRI de Matemática
- `infoExtra`: Objeto com informações adicionais

### Exemplo Completo (cURL)

```bash
curl -X POST http://localhost:8080/api/analise-enem-tri \
  -H "Content-Type: application/json" \
  -d '{
    "nomeAluno": "João Silva",
    "matricula": "2024001",
    "turma": "3º A",
    "serie": "3º Ano",
    "anoProva": 2023,
    "respostasAluno": ["A", "B", "C", "D", "A", "B", "C", "D", "A", "B"],
    "acertos": 35,
    "erros": 10,
    "nota": 650.5,
    "triGeral": 650.5,
    "triLc": 620.3,
    "triCh": 640.2,
    "triCn": 660.1,
    "triMt": 680.9,
    "infoExtra": {
      "contexto": "Aluno do ensino médio público",
      "objetivo": "Medicina"
    }
  }'
```

### Exemplo JavaScript/Frontend

```javascript
async function analisarAlunoENEM(dadosAluno) {
  try {
    const response = await fetch('/api/analise-enem-tri', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nomeAluno: dadosAluno.nome,
        matricula: dadosAluno.matricula,
        turma: dadosAluno.turma,
        serie: dadosAluno.serie,
        anoProva: 2023,
        respostasAluno: dadosAluno.respostas,
        acertos: dadosAluno.acertos,
        erros: dadosAluno.erros,
        nota: dadosAluno.nota,
        triGeral: dadosAluno.triGeral,
        triLc: dadosAluno.triLc,
        triCh: dadosAluno.triCh,
        triCn: dadosAluno.triCn,
        triMt: dadosAluno.triMt,
        infoExtra: {
          contexto: dadosAluno.contexto,
          objetivo: dadosAluno.objetivo,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Erro: ${response.status}`);
    }

    const resultado = await response.json();
    console.log('Análise:', resultado.analise);
    return resultado;
  } catch (error) {
    console.error('Erro ao analisar:', error);
    throw error;
  }
}
```

## 📤 Resposta da API

### Sucesso (200)

```json
{
  "success": true,
  "analise": "Análise detalhada do desempenho do aluno...",
  "threadId": "thread_abc123",
  "runId": "run_xyz789",
  "dadosProcessados": {
    "nomeAluno": "João Silva",
    "anoProva": 2023,
    "triGeral": 650.5
  }
}
```

### Erro (400/500)

```json
{
  "error": "Mensagem de erro",
  "details": "Detalhes adicionais do erro"
}
```

## 🔄 Fluxo de Funcionamento

1. **Recebe dados do aluno** via POST
2. **Valida dados obrigatórios** (respostasAluno, tri, anoProva)
3. **Verifica OPENAI_API_KEY** configurada
4. **Cria thread** no Assistant API
5. **Adiciona mensagem** com dados formatados do aluno
6. **Executa run** do Assistant
7. **Aguarda conclusão** (polling até 60 segundos)
8. **Busca resposta** do Assistant
9. **Retorna análise** formatada

## ⚠️ Considerações

- **Timeout**: Máximo de 60 segundos aguardando resposta
- **Rate Limits**: Respeite os limites da API da OpenAI
- **Custos**: Cada análise consome tokens do Assistant
- **Thread Management**: Threads são criadas a cada requisição (não reutilizadas)

## 🎯 Próximos Passos

1. Integrar no frontend para chamar automaticamente após cálculo TRI
2. Adicionar cache de análises similares
3. Implementar retry automático em caso de falha
4. Adicionar métricas de uso e custos

