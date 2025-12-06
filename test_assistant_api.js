// Script de teste Node.js para a rota /api/analise-enem-tri
// Execute: node test_assistant_api.js

const BASE_URL = process.env.API_URL || 'http://localhost:8080';

async function testarAnaliseENEM() {
  console.log('🧪 Testando rota /api/analise-enem-tri\n');

  // Verificar se servidor está rodando
  try {
    const healthCheck = await fetch(BASE_URL);
    if (!healthCheck.ok) {
      throw new Error('Servidor não respondeu');
    }
    console.log('✅ Servidor está rodando\n');
  } catch (error) {
    console.error('❌ Servidor não está rodando em', BASE_URL);
    console.error('   Execute: npm run dev\n');
    process.exit(1);
  }

  // Dados de exemplo do aluno
  const dadosAluno = {
    nomeAluno: "João Silva",
    matricula: "2024001",
    turma: "3º A",
    serie: "3º Ano",
    anoProva: 2023,
    respostasAluno: Array(90).fill(null).map((_, i) => {
      const options = ['A', 'B', 'C', 'D', 'E'];
      return options[i % 5];
    }),
    acertos: 35,
    erros: 10,
    nota: 650.5,
    tri: 650.5, // Campo obrigatório
    triGeral: 650.5,
    triLc: 620.3,
    triCh: 640.2,
    triCn: 660.1,
    triMt: 680.9,
    infoExtra: {
      contexto: "Aluno do ensino médio público",
      objetivo: "Medicina"
    }
  };

  console.log('📊 Enviando dados de teste...');
  console.log(`   Aluno: ${dadosAluno.nomeAluno}`);
  console.log(`   Ano: ${dadosAluno.anoProva}`);
  console.log(`   TRI Geral: ${dadosAluno.triGeral}`);
  console.log(`   Respostas: ${dadosAluno.respostasAluno.length} questões\n`);

  try {
    const inicio = Date.now();
    
    const response = await fetch(`${BASE_URL}/api/analise-enem-tri`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dadosAluno),
    });

    const tempoDecorrido = ((Date.now() - inicio) / 1000).toFixed(2);

    console.log(`📥 Resposta recebida (HTTP ${response.status}) em ${tempoDecorrido}s\n`);

    const resultado = await response.json();

    if (response.ok && resultado.success) {
      console.log('✅ Teste bem-sucedido!\n');
      console.log('📋 Informações da resposta:');
      console.log(`   Thread ID: ${resultado.threadId}`);
      console.log(`   Run ID: ${resultado.runId}`);
      console.log(`   Aluno processado: ${resultado.dadosProcessados.nomeAluno}`);
      console.log(`   Ano: ${resultado.dadosProcessados.anoProva}`);
      console.log(`   TRI: ${resultado.dadosProcessados.triGeral}\n`);

      if (resultado.analise) {
        console.log('📝 Análise recebida:');
        console.log('─'.repeat(60));
        const linhas = resultado.analise.split('\n');
        linhas.slice(0, 30).forEach(linha => console.log(linha));
        if (linhas.length > 30) {
          console.log(`\n... (${linhas.length - 30} linhas restantes)`);
        }
        console.log('─'.repeat(60));
      }
    } else {
      console.error('❌ Teste falhou!');
      console.error('   Erro:', resultado.error || 'Erro desconhecido');
      if (resultado.details) {
        console.error('   Detalhes:', resultado.details);
      }
      console.error('\n💡 Verifique:');
      console.error('   - OPENAI_API_KEY está configurada?');
      console.error('   - OPENAI_ASSISTANT_ID está correto?');
      console.error('   - Assistant está configurado corretamente?');
    }
  } catch (error) {
    console.error('❌ Erro ao fazer requisição:', error.message);
    if (error.cause) {
      console.error('   Causa:', error.cause);
    }
  }
}

// Executar teste
testarAnaliseENEM();

