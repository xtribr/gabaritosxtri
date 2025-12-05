# 🔍 DIAGNÓSTICO: PROBLEMA DE COORDENADAS

## 🚨 Problema Identificado

**Acurácia: 23.3% (21/90 acertos)**

O OMR está detectando as bolhas nas posições erradas, resultando em respostas incorretas.

## 📊 Padrões de Erro

### Erros Mais Frequentes:
- **D→A**: 11 vezes (D real detectado como A)
- **B→A**: 8 vezes (B real detectado como A)
- **E→A**: 7 vezes (E real detectado como A)
- **A→C**: 6 vezes (A real detectado como C)

### Interpretação:
Isso sugere que as **coordenadas X das opções estão deslocadas**. O OMR está lendo a bolha **à esquerda** da posição correta.

## 🔧 Coordenadas Atuais (Template ENEM90)

```python
base_x = [47, 222, 397, 572, 747, 922]  # X inicial de cada coluna (opção A)
option_spacing = 24  # Espaçamento entre A, B, C, D, E
y_start = 140  # Y inicial
y_step = 23.5  # Espaçamento vertical entre questões
```

### Cálculo das Posições:
Para Q1 (primeira questão, primeira coluna):
- A: x = 47
- B: x = 47 + 24 = 71
- C: x = 47 + 48 = 95
- D: x = 47 + 72 = 119
- E: x = 47 + 96 = 143

## 💡 Possíveis Causas

1. **base_x está errado**: A posição inicial de cada coluna pode estar deslocada
2. **option_spacing está errado**: O espaçamento entre opções pode ser diferente de 24px
3. **Ordem invertida**: As opções podem estar em ordem diferente (E, D, C, B, A ao invés de A, B, C, D, E)
4. **Escala incorreta**: A escala calculada pode estar errada, deslocando todas as coordenadas

## 🎯 Próximos Passos

1. ✅ Gerar imagem de debug para visualizar onde o OMR está lendo
2. ⏳ Comparar coordenadas detectadas vs coordenadas esperadas
3. ⏳ Ajustar base_x e option_spacing baseado na análise
4. ⏳ Re-testar com o gabarito real

## 📋 Teste Realizado

- **Gabarito Real**: Extraído da imagem do cartão-resposta (LETICIA VALERIA)
- **OMR Detectado**: Respostas do Python OMR no PDF
- **Resultado**: 23.3% de acurácia (69 erros em 90 questões)

