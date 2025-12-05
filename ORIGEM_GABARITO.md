# 📋 ORIGEM DO GABARITO DETECTADO

## 🎯 De Onde Vem o Gabarito?

O gabarito mostrado na interface de debug vem do **serviço Python OMR** (`python_omr_service/app.py`).

### Fluxo Completo:

1. **Upload do PDF** → Frontend envia para `/api/debug/omr`
2. **Conversão PDF → PNG** → Primeira página convertida para imagem
3. **Envio para Python OMR** → `POST /api/process-image` no serviço Python
4. **Processamento OMR** → Função `process_omr_page()` em `app.py`
5. **Detecção de Bolhas** → Função `detect_bubbles_fixed()` usando coordenadas fixas
6. **Retorno do Gabarito** → Respostas em `resultado.questoes` (dict com Q1-Q90)

### Como Funciona a Detecção:

```python
# Template ENEM90 com coordenadas fixas
GABARITO_TEMPLATE_90 = {
    "total_questions": 90,
    "questions": [
        {"id": 1, "y": 140, "x_positions": [47, 71, 95, 119, 143]},  # Q1: A, B, C, D, E
        {"id": 2, "y": 163.5, "x_positions": [47, 71, 95, 119, 143]}, # Q2: A, B, C, D, E
        # ... 90 questões
    ]
}

# Para cada questão:
# 1. Calcula escala baseado nas dimensões da imagem
# 2. Aplica coordenadas fixas do template
# 3. Lê região de cada bolha (A, B, C, D, E)
# 4. Identifica qual bolha está mais escura (marcada)
# 5. Retorna resposta (A-E) ou "Não respondeu"
```

### Estrutura da Resposta:

```json
{
  "status": "sucesso",
  "pagina": {
    "pagina": 1,
    "template": "enem90",
    "resultado": {
      "questoes": {
        "1": "E",
        "2": "C",
        "3": "B",
        ...
        "90": "A"
      }
    }
  }
}
```

### Por Que Mostra 100%?

O Python OMR está detectando **TODAS as 90 questões**, mesmo que algumas estejam como "Não respondeu". A contagem considera:
- ✅ **Respostas válidas**: A, B, C, D, E
- ❌ **Não respondidas**: "Não respondeu", null, vazio

Se todas as 90 questões têm uma resposta (mesmo que seja "Não respondeu"), a taxa de detecção é 100%.

### Correção Aplicada:

A Etapa 6 agora:
1. ✅ Filtra corretamente "Não respondeu" da contagem
2. ✅ Considera sucesso se detectar 90%+ das questões válidas
3. ✅ Mostra logs detalhados para debug
4. ✅ Aceita status "unknown" se houver questões detectadas

