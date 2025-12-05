# 🚨 ANÁLISE: PROBLEMA DE ACURÁCIA DO OMR

## 📊 Comparação de Resultados

### ✅ Teste com Imagem Modelo
- **Arquivo**: `modelo_gabarito.png`
- **Dimensões**: 1241x1755 pixels
- **Escala**: scale_x=1.001, scale_y=1.003 (quase 1:1)
- **Resultado**: **90/90 questões detectadas (100%)**
- **Raio das bolhas**: 6px

### ❌ Processamento Real (PDF)
- **Arquivo**: `gabaritos_alinhados.pdf`
- **Dimensões**: 1654x2340 pixels (diferente!)
- **Escala**: scale_x=1.334, scale_y=1.337 (33% maior)
- **Resultado**: **5-18/90 questões detectadas (~10-20%)**
- **Raio das bolhas**: 8px

## 🔍 Problemas Identificados

### 1. **Dimensões Diferentes**
- Imagem modelo: 1241x1755
- PDF real: 1654x2340
- **Diferença**: ~33% maior em ambas as dimensões

### 2. **Escala Calculada**
- Teste: 1.001 (quase perfeito)
- Real: 1.334 (33% maior)
- **Impacto**: Coordenadas podem estar desalinhadas

### 3. **Threshold Muito Alto**
- Atual: 0.4 (40%) para ENEM90
- **Problema**: Pode estar rejeitando marcações válidas em imagens reais

### 4. **Raio das Bolhas**
- Teste: 6px
- Real: 8px
- **Impacto**: Pode estar capturando área errada

## 💡 Soluções Propostas

### 1. **Ajustar Threshold Dinamicamente**
```python
# Threshold adaptativo baseado na escala
if scale_x > 1.2 or scale_y > 1.2:
    threshold = 0.3  # Mais permissivo para imagens maiores
else:
    threshold = 0.4  # Padrão
```

### 2. **Melhorar Detecção de Coordenadas**
- Usar alinhamento por marcadores quando disponível
- Ajustar coordenadas baseado na escala real

### 3. **Aumentar Raio de Detecção**
```python
# Raio adaptativo baseado na escala
bubble_radius_px = max(6, int(8 * max(scale_x, scale_y)))
```

### 4. **Adicionar Debug Visual para PDFs Reais**
- Gerar imagem de debug para cada página processada
- Comparar coordenadas esperadas vs detectadas

## 🎯 Próximos Passos

1. ✅ **Identificar problema**: Dimensões e escala diferentes
2. ⏳ **Ajustar thresholds**: Tornar mais permissivo para imagens maiores
3. ⏳ **Melhorar detecção**: Ajustar raio e coordenadas baseado na escala
4. ⏳ **Testar com debug visual**: Ver onde estão as bolhas detectadas vs esperadas

## 📋 Comandos para Debug

```bash
# Ver logs detalhados do processamento real
tail -f /tmp/python_omr_service.log | grep "\[DEBUG\]"

# Testar com debug visual em uma página do PDF
curl -X POST "http://localhost:5002/api/debug/visual?template=enem90" \
  -F "image=@pagina_extraida.png"
```

