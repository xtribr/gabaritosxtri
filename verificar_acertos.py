#!/usr/bin/env python3
"""
Script para verificar quantas questões o aluno realmente acertou
baseado na imagem do gabarito mostrada
"""

# Gabarito visual da imagem (padrão que vi na segunda imagem)
# Linha 1: A E A E A E A E A (9 questões)
# Linha 2: E A E A E A C C C (9 questões)
# Linha 3: E A E A E A E A E (9 questões)
# Linha 4: A E A E A E A E A (9 questões)
# Linha 5: E A E A E A E A E (9 questões)

gabarito_visual = [
    'A', 'E', 'A', 'E', 'A', 'E', 'A', 'E', 'A',  # Q1-9
    'E', 'A', 'E', 'A', 'E', 'A', 'C', 'C', 'C',  # Q10-18
    'E', 'A', 'E', 'A', 'E', 'A', 'E', 'A', 'E',  # Q19-27
    'A', 'E', 'A', 'E', 'A', 'E', 'A', 'E', 'A',  # Q28-36
    'E', 'A', 'E', 'A', 'E', 'A', 'E', 'A', 'E',  # Q37-45
]

# Gabarito do sistema (que temos no código)
gabarito_sistema = {
    '1':'C','2':'A','3':'E','4':'A','5':'A','6':'A','7':'A','8':'A','9':'A','10':'A',
    '11':'A','12':'A','13':'A','14':'A','15':'A','16':'A','17':'C','18':'C','19':'C','20':'A',
    '21':'A','22':'A','23':'A','24':'A','25':'A','26':'A','27':'C','28':'A','29':'A','30':'A',
    '31':'A','32':'A','33':'A','34':'A','35':'A','36':'A','37':'A','38':'A','39':'A','40':'A',
    '41':'A','42':'A','43':'A','44':'A','45':'A','46':'A','47':'A','48':'B','49':'A','50':'A',
    '51':'A','52':'A','53':'A','54':'A','55':'A','56':'A','57':'A','58':'A','59':'A','60':'D',
    '61':'A','62':'A','63':'A','64':'A','65':'A','66':'A','67':'A','68':'A','69':'A','70':'A',
    '71':'A','72':'A','73':'A','74':'A','75':'A','76':'A','77':'A','78':'B','79':'A','80':'A',
    '81':'A','82':'A','83':'A','84':'A','85':'A','86':'A','87':'A','88':'A','89':'A','90':'A'
}

print("=" * 80)
print("VERIFICAÇÃO DE ACERTOS - PRIMEIRAS 45 QUESTÕES")
print("=" * 80)

acertos = 0
erros = []

for i in range(45):
    questao = i + 1
    resposta_visual = gabarito_visual[i]
    resposta_sistema = gabarito_sistema[str(questao)]
    
    if resposta_visual == resposta_sistema:
        acertos += 1
    else:
        erros.append({
            'questao': questao,
            'visual': resposta_visual,
            'sistema': resposta_sistema
        })

print(f"\n✅ ACERTOS: {acertos}/45 ({acertos/45*100:.1f}%)")
print(f"❌ ERROS: {len(erros)}/45")

if erros:
    print("\nQuestões com divergência:")
    for erro in erros[:10]:  # Mostrar primeiros 10 erros
        print(f"  Q{erro['questao']:02d}: Visual={erro['visual']} vs Sistema={erro['sistema']}")
    
    if len(erros) > 10:
        print(f"  ... e mais {len(erros) - 10} erros")

print("\n" + "=" * 80)
