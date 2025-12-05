#!/bin/bash

# Script para testar múltiplas configurações de coordenadas

echo "🧪 TESTANDO MÚLTIPLAS CONFIGURAÇÕES"
echo "===================================="
echo ""

# Configurações para testar
configs=(
    "47,222,397,572,747,922:24:140:23.5"  # Original
    "71,246,421,596,771,946:24:140:23.5"  # +24px
    "23,198,373,548,723,898:24:140:23.5"  # -24px
    "59,234,409,584,759,934:24:140:23.5"  # +12px
    "35,210,385,560,735,910:24:140:23.5"  # -12px
    "47,222,397,572,747,922:20:140:23.5"  # Espaçamento menor
    "47,222,397,572,747,922:28:140:23.5"  # Espaçamento maior
)

melhor_config=""
melhor_acertos=0

for config in "${configs[@]}"; do
    IFS=':' read -r base_x_str option_spacing y_start y_step <<< "$config"
    IFS=',' read -ra base_x_array <<< "$base_x_str"
    
    echo "Testando: base_x=[${base_x_str}], spacing=${option_spacing}, y_start=${y_start}, y_step=${y_step}"
    
    # Aqui faria a atualização do template e teste
    # Por enquanto, apenas mostra
    echo "  (Teste simulado - implementar atualização real do template)"
done

echo ""
echo "💡 Para implementar completamente, preciso:"
echo "  1. Atualizar python_omr_service/app.py com cada configuração"
echo "  2. Reiniciar serviço"
echo "  3. Testar e comparar resultados"
echo "  4. Escolher melhor configuração"

