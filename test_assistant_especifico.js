// Teste específico para análise de estudo
// Foco: CN TRI 485 e MT TRI 345

const BASE_URL = process.env.API_URL || 'http://localhost:8080';

async function testarAnaliseEspecifica() {
  console.log('🧪 Teste Específico: Análise de Estudo');
  console.log('📚 Foco: Ciências da Natureza (TRI 485) e Matemática (TRI 345)\n');

  const dadosAluno = {
    nomeAluno: "Aluno Teste",
    matricula: "TEST001",
    turma: "3º Ano",
    serie: "3º Ano",
    anoProva: 2023,
    respostasAluno: Array(90).fill(null).map((_, i) => {
      const options = ['A', 'B', 'C', 'D', 'E'];
      return options[i % 5];
    }),
    acertos: 25,
    erros: 20,
    nota: 450.0,
    tri: 400.0,
    triGeral: 400.0,
    triLc: 420.0,
    triCh: 450.0,
    triCn: 485.0,  // Foco: CN com TRI 485
    triMt: 345.0,  // Foco: MT com TRI 345
    infoExtra: {
      contexto: "Aluno precisa melhorar especialmente em Matemática (TRI 345) e Ciências da Natureza (TRI 485)",
      objetivo: "Aumentar TRI em Matemática e Ciências da Natureza",
      pedidoEspecifico: "Por favor, indique especificamente o que o aluno deve estudar para melhorar em Ciências da Natureza (atualmente TRI 485) e Matemática (atualmente TRI 345). Forneça conteúdos prioritários, tópicos específicos e estratégias de estudo para cada área."
    }
  };

  console.log('📊 Dados do aluno:');
  console.log(`   Nome: ${dadosAluno.nomeAluno}`);
  console.log(`   TRI Geral: ${dadosAluno.triGeral}`);
  console.log(`   TRI CN (Ciências da Natureza): ${dadosAluno.triCn} ⚠️`);
  console.log(`   TRI MT (Matemática): ${dadosAluno.triMt} ⚠️`);
  console.log(`   TRI LC: ${dadosAluno.triLc}`);
  console.log(`   TRI CH: ${dadosAluno.triCh}`);
  console.log('');

  try {
    const inicio = Date.now();
    
    console.log('📤 Enviando requisição para análise...\n');
    
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
      console.log('✅ Análise recebida com sucesso!\n');
      console.log('═'.repeat(80));
      console.log('📝 ANÁLISE COMPLETA DO ASSISTANT:');
      console.log('═'.repeat(80));
      console.log('');
      
      if (resultado.analise) {
        console.log(resultado.analise);
      } else {
        console.log('⚠️  Análise vazia recebida');
      }
      
      console.log('');
      console.log('═'.repeat(80));
      console.log('');
      console.log('📋 Informações técnicas:');
      console.log(`   Thread ID: ${resultado.threadId}`);
      console.log(`   Run ID: ${resultado.runId}`);
      console.log(`   Tempo de processamento: ${tempoDecorrido}s`);
    } else {
      console.error('❌ Erro na análise!');
      console.error('   Erro:', resultado.error || 'Erro desconhecido');
      if (resultado.details) {
        console.error('   Detalhes:', resultado.details);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao fazer requisição:', error.message);
    if (error.cause) {
      console.error('   Causa:', error.cause);
    }
  }
}

// Executar teste
testarAnaliseEspecifica();

