# 🔍 GUIA DE DEBUG DO OMR

## 📋 Visão Geral

Sistema completo de debug para identificar e corrigir problemas no OMR (Optical Mark Recognition).

## 🚀 Como Usar

### 1. **Debug Visual via Endpoint**

#### Endpoint: `POST /api/debug/visual`

**Uso:**
```bash
curl -X POST http://localhost:5002/api/debug/visual \
  -F "image=@gabarito.png" \
  -G -d "template=enem90"
```

**Resposta:**
```json
{
  "status": "sucesso",
  "debug_image": "base64...",
  "answers": {
    "1": "A",
    "2": "B",
    ...
  },
  "template": "enem90",
  "alignment": {
    "aligned": true,
    "marks": {...}
  }
}
```

**Visualização:**
- **Círculos verdes**: Todas as bolhas detectadas
- **Círculos vermelhos**: Bolhas marcadas (resposta detectada)
- **Círculos azuis**: Bolhas não marcadas (sem resposta)
- **Texto**: `Q{id}:{resposta}` ao lado de cada bolha

### 2. **Debug no Processamento Normal**

#### Endpoint: `POST /api/process-image?debug=true`

**Uso:**
```bash
curl -X POST "http://localhost:5002/api/process-image?debug=true" \
  -F "image=@gabarito.png" \
  -F "page=1" \
  -F "template=enem90"
```

**Resposta:** Inclui campo `debug_image` na resposta da página.

### 3. **Logs Detalhados**

Todos os logs são salvos em `/tmp/python_omr_service.log`

**Ver logs em tempo real:**
```bash
tail -f /tmp/python_omr_service.log
```

**Filtrar logs de debug:**
```bash
tail -f /tmp/python_omr_service.log | grep "\[DEBUG\]"
```

## 📊 Informações de Debug

### Logs Incluem:

1. **Informações da Imagem:**
   - Tamanho (width x height)
   - Tipo de dados
   - Formato

2. **Alinhamento:**
   - Se marcadores foram encontrados
   - Coordenadas dos marcadores
   - Se alinhamento foi aplicado

3. **Pré-processamento:**
   - Shape da imagem processada
   - Valores min/max

4. **Detecção de Bolhas:**
   - Template usado
   - Escala calculada (scale_x, scale_y)
   - Raio das bolhas
   - Primeiras 5 questões detectadas

5. **Resultados:**
   - Total de respostas detectadas
   - Porcentagem de acurácia

## 🎯 Interpretando os Resultados

### Imagem de Debug

1. **Verificar se bolhas estão sendo detectadas:**
   - Se não há círculos verdes, o problema está na detecção de coordenadas
   - Verificar se o template está correto (enem45 vs enem90)

2. **Verificar se respostas estão corretas:**
   - Comparar círculos vermelhos com respostas esperadas
   - Verificar se texto `Q{id}:{resposta}` está correto

3. **Verificar alinhamento:**
   - Se bolhas estão desalinhadas, verificar logs de alinhamento
   - Verificar se marcadores foram encontrados

### Logs

1. **Erro de alinhamento:**
   ```
   [DEBUG] ⚠️  Alinhamento não aplicado (marks_not_found)
   ```
   - **Causa**: Marcadores não foram encontrados
   - **Solução**: Verificar se o PDF tem os marcadores corretos

2. **Poucas respostas detectadas:**
   ```
   [DEBUG] ✅ Página 1: 5/90 respostas marcadas
   ```
   - **Causa**: Threshold muito alto ou coordenadas incorretas
   - **Solução**: Ajustar threshold ou verificar template

3. **Erro de processamento:**
   ```
   [DEBUG] ❌ Erro ao processar imagem: ...
   ```
   - **Causa**: Ver traceback completo
   - **Solução**: Verificar formato da imagem ou template

## 🔧 Troubleshooting

### Problema: Nenhuma bolha detectada

**Verificar:**
1. Template correto? (`enem45` vs `enem90`)
2. Imagem está no formato correto? (PNG, JPG)
3. Imagem não está muito escura/clara?
4. Coordenadas do template estão corretas?

**Solução:**
- Usar endpoint `/api/debug/visual` para ver imagem de debug
- Verificar logs para ver escala calculada
- Comparar com template esperado

### Problema: Respostas incorretas

**Verificar:**
1. Threshold está muito baixo/alto?
2. Alinhamento foi aplicado corretamente?
3. Coordenadas estão desalinhadas?

**Solução:**
- Ajustar threshold em `detect_bubbles_fixed`
- Verificar logs de alinhamento
- Comparar coordenadas esperadas vs detectadas

### Problema: Erro no processamento

**Verificar:**
1. Formato da imagem
2. Tamanho da imagem
3. Template disponível

**Solução:**
- Verificar logs completos com `tail -f /tmp/python_omr_service.log`
- Verificar se serviço está rodando: `curl http://localhost:5002/health`

## 📝 Exemplo Completo

```bash
# 1. Verificar se serviço está rodando
curl http://localhost:5002/health

# 2. Processar com debug visual
curl -X POST "http://localhost:5002/api/debug/visual?template=enem90" \
  -F "image=@gabarito.png" \
  -o debug_result.json

# 3. Extrair imagem de debug
cat debug_result.json | jq -r '.debug_image' | base64 -d > debug_image.png

# 4. Ver logs
tail -f /tmp/python_omr_service.log | grep "\[DEBUG\]"
```

## 🎨 Cores na Imagem de Debug

- **🟢 Verde**: Bolha detectada (todas as bolhas do template)
- **🔴 Vermelho**: Bolha marcada (resposta detectada)
- **🔵 Azul**: Bolha não marcada (sem resposta ou abaixo do threshold)
- **📝 Texto**: `Q{id}:{resposta}` - Identificação da questão e resposta

## 📈 Próximos Passos

1. **Testar com gabaritos reais**
2. **Comparar resultados Python vs TypeScript**
3. **Ajustar thresholds baseado nos resultados**
4. **Implementar calibração automática**

