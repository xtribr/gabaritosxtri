# 🎯 PLANO DE AÇÃO: MELHORAR ACURÁCIA DO OMR

## 📊 DIAGNÓSTICO ATUAL

### Problemas Identificados:

1. **Python OMR (baddrow)**:
   - Threshold muito alto: 0.25 (25%) de preenchimento mínimo
   - Detecção de estrutura de grade pode falhar
   - Agrupamento de bolhas por questão pode estar incorreto

2. **TypeScript OMR**:
   - Coordenadas fixas podem estar desalinhadas
   - Thresholds muito permissivos podem gerar falsos positivos
   - Múltiplas camadas de validação podem estar rejeitando marcações válidas

## 🔧 SOLUÇÕES IMEDIATAS

### 1. Ajustar Thresholds do Python OMR

**Problema**: Threshold de 0.25 (25%) é muito alto para marcações leves.

**Solução**:
```python
# ANTES
threshold = 0.25  # 25% mínimo
min_difference = 0.12  # 12% diferença mínima

# DEPOIS (mais permissivo)
threshold = 0.15  # 15% mínimo (marcações leves)
min_difference = 0.08  # 8% diferença mínima (mais sensível)
```

### 2. Melhorar Detecção de Estrutura

**Problema**: Agrupamento de bolhas por questão pode estar errado.

**Solução**:
- Usar coordenadas conhecidas do template como referência
- Validar se bolhas detectadas estão próximas das coordenadas esperadas
- Se não estiverem, usar coordenadas do template diretamente

### 3. Sistema de Validação Cruzada

**Ideia**: Usar ambos os sistemas OMR e comparar resultados.

**Implementação**:
- Processar com Python OMR
- Processar com TypeScript OMR
- Comparar resultados
- Se divergirem, usar o resultado com maior confiança
- Se ambos tiverem baixa confiança, marcar como "Revisar manualmente"

### 4. Calibração Automática por Página

**Ideia**: Detectar desalinhamento e ajustar coordenadas automaticamente.

**Implementação**:
- Detectar algumas bolhas conhecidas (ex: primeira questão de cada coluna)
- Calcular offset/scale baseado nas detecções
- Aplicar transformação nas coordenadas do template

### 5. Modo de Validação Manual

**Ideia**: Permitir que o usuário corrija respostas detectadas incorretamente.

**Implementação**:
- Interface para visualizar detecções
- Permitir edição manual de respostas
- Salvar correções para melhorar o sistema

## 🚀 IMPLEMENTAÇÃO PRIORITÁRIA

### Fase 1: Ajustes Rápidos (HOJE)
1. ✅ Reduzir threshold do Python OMR de 0.25 para 0.15
2. ✅ Ajustar min_difference de 0.12 para 0.08
3. ✅ Melhorar logs de debug

### Fase 2: Validação Cruzada (AMANHÃ)
1. Implementar processamento duplo (Python + TypeScript)
2. Comparar resultados automaticamente
3. Escolher melhor resultado baseado em confiança

### Fase 3: Calibração Automática (PRÓXIMA SEMANA)
1. Detectar bolhas de referência
2. Calcular transformação
3. Aplicar nas coordenadas

## 📈 MÉTRICAS DE SUCESSO

- **Acurácia atual**: ~60-70% (estimado)
- **Meta**: >90% de acurácia
- **Tolerância**: <5% de falsos positivos

## 🔍 TESTES NECESSÁRIOS

1. Testar com gabaritos reais conhecidos
2. Comparar resultados Python vs TypeScript
3. Medir acurácia por questão
4. Identificar padrões de erro


