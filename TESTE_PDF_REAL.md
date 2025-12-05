# 🧪 TESTE COM PDF REAL

## ✅ Teste Realizado

**PDF testado**: `MODELO_PREENCHIDO_1764873149888.pdf`
- **Dimensões**: 1654x2339 pixels
- **Escala calculada**: scale_x=1.334, scale_y=1.337
- **Resultado**: **90/90 questões detectadas (100%)**
- **Status**: ✅ SUCESSO

## 🔍 Análise

O teste mostrou que o OMR **ESTÁ FUNCIONANDO** com PDFs reais quando:
- ✅ Dimensões são 1654x2339 (diferente do modelo 1241x1755)
- ✅ Escala é 1.334 (33% maior)
- ✅ Template ENEM90 está correto

## ⚠️ Problema Reportado

Você mencionou que `gabaritos_alinhados.pdf` estava dando apenas **5-18/90 questões**.

### Possíveis Causas:

1. **Qualidade do PDF diferente**
   - Scan com baixa resolução
   - Compressão excessiva
   - Ruído na imagem

2. **Marcações muito leves**
   - Threshold atual (0.4) pode estar rejeitando marcações leves
   - Precisamos ajustar dinamicamente baseado na escala

3. **Estrutura diferente**
   - PDF pode ter rotação
   - Pode ter inclinação
   - Coordenadas podem estar desalinhadas

4. **Problema na conversão**
   - Conversão PDF → PNG pode estar distorcendo
   - DPI diferente pode afetar coordenadas

## 🎯 Próximos Passos

1. **Testar com o PDF específico** (`gabaritos_alinhados.pdf`)
2. **Gerar imagem de debug** para ver onde estão as bolhas
3. **Ajustar thresholds** dinamicamente baseado na escala
4. **Comparar** PDF que funciona vs PDF que não funciona

## 📋 Como Testar

```bash
# Via endpoint de debug
curl -X POST "http://localhost:8080/api/debug/omr" \
  -F "file=@gabaritos_alinhados.pdf"

# Ou via interface web
# Acesse a página de debug e faça upload do PDF
```

## 🔧 Ajustes Necessários

Se o problema persistir, precisamos:
1. ✅ Ajustar threshold baseado na escala (já identificado)
2. ✅ Adicionar debug visual para PDFs reais
3. ✅ Melhorar detecção de marcações leves
4. ✅ Validar coordenadas antes de processar

