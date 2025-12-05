# 🧪 Guia Prático de Testes - OMR v5.0

## 🎬 Começar Agora

### Passo 1: Servidor Rodando?
```bash
# Verificar status do servidor
curl http://localhost:8080/api/health

# Se receber: {"status":"ok","timestamp":"..."}
# ✅ Servidor está OK!

# Se não funcionar:
npm run dev
```

### Passo 2: Acessar Interface
1. Abra: **http://localhost:8080**
2. Clique em **"Processar Gabaritos"**
3. Faça upload do seu PDF

### Passo 3: Monitorar Logs
```bash
# No terminal onde o servidor está rodando
# Observe as linhas que começam com [OMR]
```

---

## 📊 Exemplo de Resultado Esperado

### Saída de Sucesso Completo:
```
[OMR] Iniciando processamento com rigor máximo...
[OMR] Dimensões da imagem: 2480x3507
[OMR] ============================================================================
[OMR] Tentando detectar marcadores de canto para calibração...
[OMR] ✅ 4/4 marcadores detectados com sucesso. Calculando transformação...
[OMR] ✅ Transformação aplicada: scaleX=0.997, scaleY=0.998, offsetX=2.3, offsetY=-1.5
[OMR] ✅ Calibração aplicada: Sim
[OMR] ============================================================================
[OMR] Analisando 450 bolhas... (Calibração: Sim)
[OMR] Determinando respostas para 90 questões...
[OMR] Resumo da detecção:
  - Respostas detectadas: 90
  - Respostas ambíguas: 0
  - Questões vazias: 0
[OMR] ========================================
[OMR] Processamento concluído:
[OMR]   Questões respondidas: 90/90 (100.0%)
[OMR]   Confiança média: 95.2%
[OMR]   Warnings: 0
[OMR]   Calibração aplicada: Sim
[OMR]   Dimensões imagem: 2480x3507
[OMR]   Total de bolhas analisadas: 450
[OMR] ========================================
```

### Interpretação:
- 🟢 **90/90 questões** = 100% de detecção ✅
- 🟢 **95.2% confiança** = Muito confiável ✅
- 🟢 **4 marcadores** = Calibração automática funcionou ✅
- 🟢 **0 warnings** = Nenhum problema ✅

---

## 🧩 Tabela de Diagnosticado por Cenário

### Cenário 1: Tudo Perfeito ✅
```
✅ 4/4 marcadores detectados
✅ 90/90 questões respondidas
✅ Confiança ≥93%
✅ 0 warnings
```
→ **Resultado:** EXCELENTE - Sem mudanças necessárias

### Cenário 2: Marcadores Falhando ⚠️
```
❌ Apenas 2/4 marcadores detectados
⚠️ Continuando SEM calibração
⚠️ 82/90 questões respondidas (91%)
⚠️ Confiança: 88%
```
→ **Solução:** Tentar com PDF com bordas mais visíveis

### Cenário 3: Detecção Baixa 🔴
```
✅ 4/4 marcadores detectados
⚠️ 78/90 questões respondidas (86%)
⚠️ Confiança média: 82%
```
→ **Solução:** Aumentar sensibilidade (ver abaixo)

### Cenário 4: Múltiplas Marcações 📌
```
⚠️ Questão 5: Múltiplas marcações detectadas
   Selecionada: B (outras: C, D)
   Confiança reduzida: 65%
```
→ **Resultado:** Sistema seleciona a mais escura, confiança marcada como baixa

---

## 🔬 Testes Específicos

### Teste 1: Marcações Normais (Bem Preenchidas)
**Expectativa:**
```
Taxa detectada: 100%
Confiança média: ≥95%
Ambíguas: 0-1%
```

**Se falhar:**
- Aumentar sharpen de 2.0 para 2.5
- Reduzir threshold de 100 para 90
- Aumentar brightness de 1.05 para 1.10

### Teste 2: Marcações Leves (Levemente Tocadas)
**Expectativa:**
```
Taxa detectada: 98-100%
Confiança média: 85-93%
Ambíguas: 1-3%
```

**Se falhar:**
- Reduzir MIN_FILL_RATIO_FOR_MARKED para 0.05
- Reduzir MIN_BUBBLE_RADIUS_PIXELS para 5

### Teste 3: Imagens Inclinadas (até 10°)
**Expectativa:**
```
Marcadores detectados: 4/4
Taxa detectada: 99%+
Confiança: ≥94%
```

**Se falhar:**
- Aumentar searchRadius de 8 para 10
- Aumentar searchRadius de 8 para 12

### Teste 4: Múltiplos PDFs em Lote
**Expectativa:**
```
Tempo por PDF: 2-3 segundos
Taxa média: 98%+
Confiança média: 93%+
```

**Se falhar:**
- Verificar se servidor tem memória suficiente
- Aumentar timeout se necessário

---

## 🛠️ Ajustes Progressivos

Se a taxa não atingir 98%, execute os ajustes em ordem:

### Ajuste 1: Sensibilidade Básica
```typescript
// server/omr.ts linha ~22
const MIN_FILL_RATIO_FOR_MARKED = 0.06; // De 0.08
const MIN_BUBBLE_RADIUS_PIXELS = 5;     // De 6
```
**Impacto:** +2-3% na taxa

### Ajuste 2: Binarização Agressiva
```typescript
// server/omr.ts linha ~230
.threshold(90)  // De 100
```
**Impacto:** +3-5% na taxa

### Ajuste 3: Sharpen Mais Alto
```typescript
// server/omr.ts linha ~227
.sharpen(2.5, 3, 4)  // De 2.0, 2, 3
```
**Impacto:** +1-2% na taxa

### Ajuste 4: Brightness Maior
```typescript
// server/omr.ts linha ~231
.modulate({ brightness: 1.10 })  // De 1.05
```
**Impacto:** +0.5-1% na taxa

### Ajuste 5: Reduzir Critério Final
```typescript
// server/omr.ts linha ~363
darknessDiff > 0.05  // De 0.1
```
**Impacto:** +1-2% na taxa

---

## 📈 Métricas de Sucesso

### Objetivo Principal:
```
✅ Taxa de Detecção: ≥98%
✅ Confiança Média: ≥92%
✅ Tempo por Página: <4s
✅ Warnings: <5%
```

### Métrica Adicional (Bônus):
```
✅ Marcadores Detectados: 4/4
✅ Taxa de Ambiguidade: <2%
✅ Calibração Aplicada: Sim
```

---

## 🐛 Troubleshooting Rápido

| Problema | Log | Solução |
|----------|-----|---------|
| Marcadores não detectam | `❌ Marcador NÃO detectado` | Aumentar tamanho do marcador |
| Taxa baixa (<90%) | `Questões respondidas: 78/90` | Aplicar Ajustes 1-3 acima |
| Confiança baixa (<80%) | `Confiança média: 75%` | Aplicar Ajuste 2 (threshold) |
| Múltiplas marcações | `Múltiplas marcações detectadas` | Normal - sistema seleciona maior |
| Crash/Timeout | Erro no servidor | Aumentar timeout, reduzir PDF |

---

## ✅ Checklist Final

- [ ] Servidor rodando (`npm run dev`)
- [ ] API respondendo (`curl localhost:8080/api/health`)
- [ ] Interface acessível (`http://localhost:8080`)
- [ ] Upload funciona
- [ ] Logs aparecem no terminal
- [ ] Taxa ≥98%
- [ ] Confiança ≥92%
- [ ] Marcadores detectados

Se todos os itens estão ✅ = **SUCESSO! 🎉**

---

## 📞 Próximos Passos

1. ✅ Testar com 5-10 PDFs diferentes
2. ✅ Registrar taxa média e confiança
3. ✅ Se taxa <95%, aplicar Ajuste 1
4. ✅ Se taxa <90%, aplicar Ajustes 2-3
5. ✅ Quando taxa ≥98%, está pronto!

**OMR v5.0 - Pronto para Máxima Performance! 🚀**
