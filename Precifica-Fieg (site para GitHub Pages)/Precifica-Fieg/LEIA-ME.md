# Precifica-Fieg

Plataforma da Central de SST (SESI Goiás) para esboço de medição e precificação de LTCAT, LI, LP, PPR, AEP, AET e FRP.
Roda inteira no navegador (HTML + JavaScript). Nenhum arquivo é enviado para servidor.

## Módulos (menu no topo)

| Item | Módulo | O que faz |
|---|---|---|
| 1 | Esboço de medição | Lê o PGR, aplica o plano (o que já está contratado) e gera o esboço de medições por GES, sem preço. |
| 2 | LTCAT/LI/LP | Precificação completa: levantamento, escopo, logística, resultado (Planilha de Custos SESI), esboço e relatório de ocorrências. |
| 3 | PPR | Programa de Proteção Respiratória (faixa de trabalhadores, amostra química, treinamentos, fit test). |
| 4 | AEP | Análise Ergonômica Preliminar, por posto (setor, função/atividade). |
| 5 | AET | Análise Ergonômica do Trabalho, por posto administrativo ou de produção. |
| 6 | FRP | Fatores de Risco Psicossociais, por faixa de trabalhadores. |
| 7 | Guia de métodos | Pesquisa nos 568 métodos do laboratório (agente, CAS, método, amostrador, vazão, volume, cuidados). |

Laudos teste (passo 1): "Laudo teste: Anicuns" (PGR planilha por cargo, com referência da planilha manual) e
"Laudo teste: Shopequip" (PGR padrão SESI por GES). Os PDFs ficam em `dados/demo/`.

## Pastas

```
index.html                a tela
js/app.js                 lógica da tela (LTCAT/LI/LP e Esboço)
js/motor.js               motor de cálculo (regras da Planilha de Custos SESI)
js/classificar.js         cruzamento risco x tipo de avaliação x exame (sinônimos)
js/leitor-pgr.js          leitor do PGR padrão SESI (GHE/GES)
js/leitor-pgr-matriz.js   leitor de PGR de terceiros (matriz de risco)
js/leitor-pgr-planilha.js leitor de PGR de terceiros (planilha por cargo)
js/leitor-proposta.js     leitor da proposta FO-021
js/pdf-geom.js            leitura das tabelas do PDF
js/ocorrencias.js         relatório técnico de ocorrências
js/ppr.js                 módulo PPR
js/ergonomia.js           módulos AEP, AET e FRP
js/metodos.js             aba Guia de métodos
js/parametros-xlsx.js     planilha de parâmetros (baixar em Excel e importar de volta)
js/drive.js, pasta-local.js   salvar no Google Drive ou na pasta do cliente
lib/                      pdf.js e ExcelJS (bibliotecas, não mexer)
dados/regras.json         valores e regras (diária, km, hora, BDI, ruído, planos, PPR, ergonomia)
dados/exames.json         tabela do laboratório (vigências 2025/2026 e 2026/2027)
dados/metodos.json        guia de métodos do laboratório
dados/distancias-go.json  km de Goiânia até as cidades (só ida)
dados/modelo.xlsx         Planilha de Custos SESI usada no "Baixar Excel"
dados/extras.json         base complementar (sinônimos e exames incluídos pelo usuário)
dados/config.json         configuração do Drive (googleClientId, drivePasta)
dados/demo/               PDFs dos laudos teste
```

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `precifica-fieg`). Pode ser público (grátis) ou privado (o Pages em repositório privado exige o plano Pro).
2. Envie todos os arquivos desta pasta (arrastar e soltar na página do repositório funciona; o `lib/` tem 3 arquivos grandes, envie-os também).
3. Em Settings > Pages, escolha "Deploy from a branch", branch `main`, pasta `/ (root)`. Salve.
4. Em 1 a 2 minutos o site abre em `https://SEUUSUARIO.github.io/precifica-fieg/`.

Nome próprio (ex.: precificafieg.com.br): compre o domínio (Registro.br), crie no DNS um registro CNAME
`www` apontando para `SEUUSUARIO.github.io` (ou registros A para os IPs do GitHub Pages) e informe o domínio
em Settings > Pages > Custom domain. O GitHub emite o HTTPS sozinho. Não precisa de plano pago para isso.

Abrir o `index.html` direto do computador (duplo clique) não funciona: o navegador bloqueia a leitura dos
arquivos `dados/*.json`. Use o GitHub Pages ou um servidor local (`python -m http.server` na pasta).

## Cenários

| Entrada | O que fazer |
|---|---|
| PGR interno (S+) | Passo 1: envie o PGR. Ele lê cadastro, GES, expostos, cargos e riscos. |
| PGR interno + proposta | Envie os dois. A proposta define o plano; no passo 3 aplique o plano para separar o que já está coberto. |
| Só proposta | Envie a proposta. Se ela enumera avaliações, viram linhas; senão, preencha à mão no passo 2. |
| PGR de terceiros no layout "matriz de avaliação de risco" (GHE numerado, Nº de Expostos, tabela Categoria/Perigo, cargos embaixo) | Envie o PGR: se não for S+, o leitor de terceiros entra sozinho. Confira agentes e expostos (o resumo compara a soma dos expostos com o cadastro). |
| Outro layout ou nenhum documento | "Começar sem documentos" e preencha o levantamento à mão (GES, expostos, tipo, exame). |

## Escopo (passo 3)

Cada linha do levantamento tem um escopo: **Adicional (cobrar)**, **Coberto pelo plano** ou **Não entra**.
"Aplicar o plano" marca automaticamente o que o pacote cobre (Plus/Premium: ruído, calor, vibração e
físicos qualitativos). O resultado mostra dois números: o adicional a cobrar e o valor se cobrasse tudo.

## Laudo de Periculosidade por função

No passo 2, "Laudo de Periculosidade: escolher funções" abre a lista de todas as funções do PGR (por GES, com
expostos quando o PGR informa). Marque as que o cliente quer avaliar e aplique: cada função vira uma linha
cobrada pelo valor por cargo dos Parâmetros.

## Mineração (NR-22, Anexo V)

No passo 3, marque "Empresa de mineração". As poeiras minerais e sílica passam a ter 3 medições por GES
(item 4.2: 3 a 5 medições com média aritmética, ou 6 ou mais). O número está em Parâmetros. O CNAE de
mineração (05 a 09) liga a opção sozinho.

## Parâmetros

Em Parâmetros, "Baixar planilha de parâmetros (Excel)" gera a base com valores, tipos de avaliação, tabela de exames, PPR e ergonomia. Edite só as colunas de valor e use "Importar planilha de parâmetros": a plataforma mostra cada alteração aplicada e registra no relatório de ocorrências.

Botão "Parâmetros" no topo. Alterações ficam salvas no navegador. Para valer para todo mundo, "Baixar
regras.json" e substituir `dados/regras.json` no GitHub. Itens marcados **pendente** ainda não foram
confirmados pela Central de SST (LI/LTCAT valor fechado, limite de "muitos cargos" no LP, horas por tipo,
folhas, postagem, lista oficial dos planos).

## Nova tabela do laboratório

Edite `dados/exames.json`: adicione uma vigência em `vigencias` (rótulo, início, fim, campo) e o campo
correspondente em cada item (ex.: `"v2027": 99.00`). O passo 4 deixa escolher a vigência; a padrão é a
da data de hoje.

## Salvar no Google Drive

1. Acesse console.cloud.google.com, crie um projeto (ex.: "Precifica-Fieg").
2. APIs e serviços > Biblioteca > ative "Google Drive API".
3. APIs e serviços > Tela de permissão OAuth > tipo Externo, preencha nome e e-mail, salve. Em "Usuários de teste" adicione o seu e-mail.
4. APIs e serviços > Credenciais > Criar credenciais > ID do cliente OAuth > tipo "Aplicativo da Web".
   Em "Origens JavaScript autorizadas" coloque o endereço do site (ex.: `https://SEUUSUARIO.github.io` e o domínio próprio, se houver).
5. Copie o Client ID (termina em `.apps.googleusercontent.com`) para `dados/config.json`:
   `{ "googleClientId": "xxxx.apps.googleusercontent.com", "drivePasta": "Precifica-Fieg" }`
6. No site, "Salvar no Google Drive" pede a autorização uma vez e grava o Excel e o JSON na pasta.

Sem o Client ID, use "Baixar Excel" e "Baixar JSON". O JSON reabre o orçamento no passo 1.

## Saídas

- **Excel**: o modelo `dados/modelo.xlsx` preenchido (aba Levantamento); a aba Precificação calcula ao abrir no Excel.
- **Imprimir / PDF**: documento próprio com cabeçalho, resumo, planilha de custos e texto da proposta (quebra de página só entre linhas).
- **Relatório de ocorrências**: o que o PGR trouxe fora da base, como foi tratado, pendências com parecer e alterações manuais.
- **Texto da proposta**: pronto para colar no FO-021.
- **JSON**: guarda tudo (linhas, escopo, logística) para reabrir e ajustar.
