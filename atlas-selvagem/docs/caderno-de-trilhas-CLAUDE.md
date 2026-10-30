# Caderno de trilhas — instruções para o Claude Code

## Papel
Você é diretor de arte e desenvolvedor front-end deste projeto. Construa um caderno pessoal de trilhas, de página única, a partir do protótipo aprovado ("Folha de orientação", formato A · Atlas). Preserve os dados reais, siga a identidade visual à risca e evite o padrão genérico listado em "Proibido".

## Contexto
- Usuário: Deni, Campinas-SP. Faz trilhas quase sempre sozinho e treina para travessias de serra (do tipo Pico Paraná e Itapiroca). Grava no Wikiloc.
- Não existe integração com o Wikiloc. Os dados entram por três caminhos: (1) print enviado no chat, registrado por você no arquivo de dados; (2) arquivo GPX importado na própria página; (3) campos preenchidos na página (fotos, pontos, diário, alertas, folhas em branco).
- Não existe meta fixa. Cada registro calcula o progresso que trouxe e propõe a próxima meta (regras em "Cálculos").

## Stack e decisões
- HTML, CSS e JavaScript sem framework, em módulos ES, sem etapa de build obrigatória. Servir como site estático (GitHub Pages ou Netlify, com HTTPS).
- PWA: `manifest.webmanifest` e service worker que guarda o app em cache. A página precisa abrir e permitir anotar o diário sem sinal no meio da trilha.
- Dados em duas camadas:
  - Base versionada: `dados/trilhas.js` (`export const TRILHAS = [...]`). É a fonte única dos registros vindos do chat. A página só renderiza registros a partir dele e da camada pessoal.
  - Camada pessoal no IndexedDB do aparelho: trilhas importadas por GPX, fotos (como Blob), pontos de interesse, diário, alertas, folhas em branco criadas, estado do checklist e rascunho da folha de saída.
- Backup obrigatório: exportar e importar tudo da camada pessoal num arquivo (JSON com as fotos embutidas, ou zip), porque o IndexedDB fica só naquele aparelho.
- "Copiar como registro": em qualquer trilha da camada pessoal, um botão gera o objeto no formato de `TRILHAS` para colar no chat e promover à base.
- Fontes servidas localmente (woff2), para funcionar offline: Encode Sans Condensed (400, 600, 800) e Spectral itálico (400, 600).
- Campo vazio aparece como "—" e nunca quebra o layout.

## Estrutura de pastas sugerida
```
index.html
manifest.webmanifest
sw.js
css/estilo.css              tokens claro/escuro, tipografia, moldura da folha
js/app.js                   roteamento por estado (índice, folha, vistas), renderização
js/calculos.js              controles por km, progresso, metas, degraus, distintivos, leitura
js/gpx.js                   leitura e cálculo do GPX
js/desenho.js               traçado, curvas de nível decorativas, perfil, carimbos, ícones
js/armazenamento.js         IndexedDB, exportar/importar backup
dados/trilhas.js            base (fornecido)
dados/folhas-em-branco.js   folhas em branco iniciais (fornecido)
dados/checklist.js          itens da folha de saída (fornecido)
dados/icones.json           ícones dos distintivos e símbolos de pontos (fornecido)
fontes/                     woff2 locais
referencia/                 protótipos aprovados (não publicar)
```

## Modelo de dados

### Registro de trilha (`TRILHAS` e trilhas importadas)
| campo | tipo | observação |
|---|---|---|
| id | string | slug único |
| nome, local | string | |
| data | "AAAA-MM-DD" | |
| distanciaKm | número | |
| desnivelPos, desnivelNeg | número (m) | |
| altitudeMax | número (m) | |
| tempoTotalMin, tempoMovMin | número (min) | |
| dificuldade | "Fácil" \| "Moderada" \| "Difícil" \| null | |
| tipo | "circular" \| "ida e volta" \| "travessia" | travessia = início e fim em lugares diferentes |
| wikiloc | url \| null | opcional |
| esforco | 1 a 10 \| null | esforço percebido |
| notas | string \| null | |
| clima, companhia | string \| null | preservados do registro original |
| tracado | path SVG | quadro normalizado 100 x 70, margem 6 |
| pontos | [[x, y], ...] | mesma escala; usado para projetar toques no mapa e posicionar controles |
| cume | [x, y] | ponto mais alto, mesma escala |
| perfil | 40 números de 0 a 1 | forma do perfil altimétrico |
| fontePerfil | "print" \| "gpx" | |

### Camada pessoal (IndexedDB), por id de trilha
- pontos de interesse: `{ id, tipo, nome, nota, x, y, km }` (tipos: mirante, água, cume, bifurcação, acampamento, perigo)
- fotos: `{ id, blob, legenda, pontoId }`
- diário: `{ relato, entradas: [{ id, quando, texto }] }`
- alertas: `{ id, tipo, onde, nota }` (tipos: propriedade particular, sem sinal de celular, cães soltos, lama ou trecho escorregadio, travessia de rio, sem água no percurso, mato fechado, trânsito de veículos, outro)
- sugestões descartadas, folhas em branco criadas, folhas em branco já registradas, checklist, rascunho da folha de saída

## Identidade visual: Folha de orientação
A página é uma carta topográfica. Cada trilha é um percurso de corrida de orientação sobreimpresso.

Tokens de cor:

| token | claro | escuro ("lanterna de cabeça") |
|---|---|---|
| fundo | #FAF8F0 | #110F0C |
| tinta | #121212 | #EFE8D6 |
| curva (curva de nível, cotas) | #8A4B1C | #C98A52 |
| curva fina (decoração) | #C9A27E | #5A4027 |
| campo aberto (só preenchimento) | #EBC23A | #4A3B12 |
| sobreimpressão (vermelho) | #D3261A | #FF5B3F |
| sutil (texto secundário) | #6B645A | #A39B8C |

Tipografia:
- Encode Sans Condensed: rótulos, números (tabulares), botões em caixa alta com espaçamento.
- Spectral itálico: título, nomes de trilhas e de lugares (como a toponímia das cartas), notas e diário.

Elementos que não podem faltar:
- Moldura dupla de carta (traço 1,5 + traço 0,6, com 3 px entre eles) envolvendo a página.
- Traçado em tinta tracejado (trilha de mapa), triângulo de largada, um círculo de controle numerado a cada km e círculo duplo na chegada, tudo em vermelho de sobreimpressão.
- Curvas de nível decorativas ao redor do cume, com uma curva mestra mais grossa a cada cinco. Ponto cotado com a altitude máxima.
- Títulos de seção com um círculo de controle numerado (1 a 6), como um percurso dentro da folha.
- Botões segmentados retos, com bordas de 1 px. Nada arredondado, exceto círculos de controle.
- Contraste alto para leitura ao sol (texto ≥ 4,5:1 nos dois modos). Alvos de toque ≥ 44 px.
- Modo claro e escuro: seguem o sistema e têm alternância manual.

## Proibido
Cards com cantos arredondados e sombra; grade de 3 ou 4 números em caixas; hero com gradiente; Inter, Roboto ou fonte de sistema como identidade; ícones emoji; cara de dashboard SaaS; roxo ou azul de tecnologia.

## Telas
O app é uma página só, com estados. No topo de tudo: cabeçalho de carta ("Série trilhas"), alternância de modo e navegação Atlas · Passaporte · Distintivos.

### 1. Atlas (índice)
- Ações: Importar GPX · Folha de saída · Folha em branco.
- Bloco "Próxima meta", calculado a partir da trilha mais recente, com as opções, a recomendada destacada, o porquê e as folhas em branco que encaixam no próximo degrau.
- Busca por nome ou local.
- Ver: folhas (grade de 2 colunas com miniatura do traçado) ou lista compacta.
- Agrupar: nada, mês, tipo ou dificuldade, com total de km por grupo.
- Ordenar por: data, distância, desnível, altitude, tempo em movimento, ritmo, esforço ou nome, com inversão de ordem.
- Filtros: tipo, dificuldade (incluindo "não informada"), período (tudo, 30 dias, 90 dias, este ano), distância mínima e máxima, e "só folhas com dados faltando". Mostrar o número de filtros ativos e um botão para limpar.
- Comparar duas: marcar A e B e ver lado a lado, com a diferença B − A em cada parâmetro.
- Cada folha do índice mostra o que tem da camada pessoal (ex.: "2 pontos · 1 foto · diário") e quantos dados faltam.
- Folhas em branco: cartões tracejados com números, fonte, a quantos degraus estão e as ações "Folha de saída" e "Registrar com GPX".

### 2. Folha (página única)
Menu de seções preso no topo durante a rolagem. Tocar num botão rola suavemente até a seção, e o botão da seção visível fica destacado. As seções surgem com um leve deslize ao entrar na tela, sem animação se o sistema pedir menos movimento. Ao abrir outra folha, a página volta ao topo.

1. **Folha:** mapa com controles por km e pontos de interesse. "Marcar ponto" ativa o toque no mapa; o ponto encaixa no traçado mais próximo e mostra o km aproximado; o formulário aparece logo abaixo do mapa. Perfil altimétrico hachurado com a altitude máxima. Legenda, descrição (com ritmo médio), notas, link do Wikiloc, aviso de dados faltando com o comando pronto ("corrigir [nome]") e marcos conquistados nesta folha.
2. **Progresso:** o que esta folha mudou (recordes), a meta da folha anterior (cumprida ou não) e a próxima meta (ou "a meta que esta folha propôs", se não for a mais recente). Depois, a leitura calculada.
3. **Pontos:** lista com símbolo, km aproximado, nota e fotos ligadas. Botão "Marcar no mapa ↑".
4. **Fotos:** enviar várias, legenda e ligação a um ponto.
5. **Diário:** condições (clima e companhia), relato livre e registro de campo com anotações por km ou hora.
6. **Alertas:** sugestão vinda das notas, lista de alertas e formulário de novo alerta.

Rodapé da folha: anterior e próxima, na ordem atual do índice.

### 3. Importar GPX
Escolher arquivo ou usar um GPX de exemplo (gerado no código e marcado como exemplo). Mostrar o que foi lido (miniatura, perfil e números) e pedir para completar nome, local, dificuldade, esforço e notas. Ao adicionar, abrir a folha nova já com o progresso calculado. Se vier de uma folha em branco, ela sai da lista.

### 4. Folha de saída
Campos: trilha, ponto de partida, data, saída, volta prevista, para quem, companhia (sozinho ou acompanhado) e prazo para acionar ajuda (1, 2 ou 3 h após a volta).

A página monta esta mensagem: "[Nome], vou fazer a trilha X, saindo de Y, em [data], às [hora]. Vou sozinho. Volta prevista: [hora]. Se eu não der notícia até [volta + prazo], tente me ligar; sem resposta, acione os bombeiros (193) e passe este roteiro." Ela tem os botões "Copiar" e "Enviar pelo WhatsApp" (`https://wa.me/?text=`).

Abaixo, o checklist de `dados/checklist.js`, com o contador "x de y".

### 5. Folha em branco
Nome, local, distância, subida, altitude e nota.

### 6. Passaporte
Um carimbo por trilha, em vermelho de sobreimpressão, com rotação e falhas de tinta derivadas do id (filtro de ruído no SVG), para que nenhum se repita.
- Forma pelo tipo: redondo para circular, retangular para ida e volta, oval para travessia.
- Anéis pela dificuldade: 1 fácil, 2 moderada, 3 difícil, tracejado quando não informada.
- Conteúdo: nome no arco, km, traçado e data.
- Os marcos conquistados naquela trilha entram como vistos em tinta preta sobre o carimbo.
- Tocar no carimbo mostra a ficha.

### 7. Distintivos
Prismas de controle com os ícones de `dados/icones.json`. Conquistado: traço cheio e prisma vermelho no canto. Em aberto: traço em "sutil". Painel do distintivo selecionado com regra, situação (data e trilha da conquista, ou quanto falta) e uma linha de progresso.

## Cálculos

**Controles por km:** um círculo a cada km ao longo de `pontos`. Em circular e travessia, use o comprimento todo. Em ida e volta, só até a metade. Omita o controle a menos de 0,5 km da chegada (0,25 km na ida e volta). Rótulo deslocado 15 px para fora, a partir do centro do traçado.

**Progresso e próxima meta:** percorra as trilhas em ordem de data.
- Recordes: compare distância, subida, altitude, tempo em movimento e dificuldade (Fácil=1, Moderada=2, Difícil=3) com o melhor anterior. Primeiro valor de um eixo = "primeiro registro".
- Meta anterior: cumprida se qualquer opção da meta proposta pela folha anterior foi atingida. Informe quais e se era a recomendada. Se não foi, diga a recomendada e o valor feito, e chame a folha de "folha de base, que também conta".
- Próxima meta, a partir dos melhores valores após esta folha:
  - distância: × 1,10, arredondando para cima em 0,5 km;
  - subida: × 1,15, para cima em 50 m;
  - altitude: + 200 m, para cima em 50 m;
  - dificuldade: próximo nível, se houver dado e não for Difícil.
- Recomendada: o eixo cujo recorde é mais antigo ("avance uma coisa por vez"). Em empate, a ordem é subida, altitude, dificuldade, distância, porque a subida é o que mais pesa em trilhas de serra. Cumprir qualquer opção conta.
- Com o dado atual (só Pico das Cabras), a próxima meta é 17 km, 450 m de subida (recomendada) ou 1.300 m de altitude.

**Degraus das folhas em branco:** para cada eixo, aplique o passo acima a partir do melhor atual até alcançar o valor da folha e conte os passos.
- O maior número de passos define a folha: 0 = "dentro do que você já fez"; 1 = "encaixa no próximo degrau de [eixo]"; n = "faltam cerca de n degraus de [eixo]".
- Hoje: Getúlio 2, Itapiroca 5, Pico Paraná 8.

**Distintivos** (código, nome, regra):
- Marcos:
  - 31 Primeira folha: 1 trilha
  - 32 Curva de 5 km: trilha ≥ 5 km
  - 33 Curva de 10 km: ≥ 10 km
  - 34 Curva mestra 15 km: ≥ 15 km
  - 35 Curva de 20 km: ≥ 20 km
  - 36 Meta cumprida: 1 meta cumprida
  - 37 Cume dos mil: altitude ≥ 1.000 m
  - 38 Subida firme: uma trilha com ≥ 500 m de subida
- Desafios:
  - 41 Mil metros de subida: soma ≥ 1.000 m
  - 42 Everest no bolso: soma ≥ 8.849 m
  - 43 Cem quilômetros: soma ≥ 100 km
  - 44 Cinco folhas: 5 trilhas
  - 45 Mês cheio: 4 trilhas no mesmo mês
  - 46 Dia longo: ≥ 5 h em movimento
  - 47 Três metas cumpridas: 3 metas cumpridas

A conquista é registrada na primeira trilha, em ordem de data, que atinge a regra. Sem dado (ex.: tempo), mostre "sem dado ainda", nunca zero.

**Leitura:**
- posição por distância entre todas as trilhas;
- diferença para a anterior (km e subida);
- subida por km (< 30 suave, 30 a 60 ondulado, > 60 íngreme);
- ritmo comparado à média das outras trilhas, ou aviso de que falta tempo em movimento;
- próximo marco de distância.

**Sugestão de alerta:** se as notas mencionarem "propriedade particular" e não houver esse alerta, ofereça registrá-lo (Registrar / Descartar).

**GPX:**
- Ler `trkpt` (ou `rtept`) com lat, lon, ele e time. Distância por haversine.
- Subida e descida: média móvel de 5 pontos na elevação, contando só variações ≥ 3 m (histerese). Altitude máxima: valor bruto.
- Tempo total: do primeiro ao último horário. Em movimento: soma dos intervalos ≤ 600 s com velocidade ≥ 0,3 m/s.
- Tipo: fim a menos de 200 m do início e caminho de volta coincidente com o de ida (distância média < 80 m entre os pontos em f e 1 − f) = ida e volta; fim perto do início sem coincidir = circular; fim longe = travessia.
- Traçado: reamostrar 141 pontos por distância, projetar (lon·cos(lat₀)·111.320; −lat·110.540) e normalizar em 100 x 70 com margem 6. Cume = ponto de maior elevação. Perfil = 40 amostras normalizadas.
- Avisar que o desnível do GPX pode diferir do mostrado pelo Wikiloc.

## Protocolo pelo chat (com você, Claude Code)
Quando o Deni mandar um print com "registrar trilha":
1. Leia os números visíveis e mostre o que leu numa tabela curta, marcando o que não estava legível.
2. Não invente valores: pergunte o que faltar.
3. Desenhe `tracado`, `pontos` e `cume` a partir do mapa do print (aproximado, é identidade visual, não GPS) e o `perfil` a partir do gráfico do print. Use `fontePerfil: "print"`. Não embuta o print no projeto.
4. Depois da confirmação, acrescente só o novo registro em `dados/trilhas.js`, sem reescrever o resto.

Outros comandos:
- "corrigir [trilha]": muda só os campos citados.
- "remover [trilha]": pede confirmação antes.
- "resumo do mês": distância, subida, recordes, metas cumpridas e distintivos do mês, lendo `TRILHAS` e, se ele colar o backup, a camada pessoal.

## Critérios de aceite
- Funciona no celular, a partir de 360 px de largura. Modos claro e escuro com contraste alto.
- Abre e salva o diário sem internet depois da primeira visita.
- Nenhum campo vazio quebra o layout.
- Registros marcados como exemplo nos protótipos não entram no projeto.
- Antes de entregar, confira o resultado contra a lista "Proibido" e diga em uma linha qual escolha de design ficou mais distante do padrão.

## Ordem de trabalho sugerida
1. Esqueleto: tokens, moldura, cabeçalho, alternância de modo e renderização do índice a partir de `TRILHAS`.
2. Folha em página única: mapa, perfil, descrição e menu fixo.
3. Cálculos: progresso, metas, leitura e distintivos, com testes simples usando os números acima.
4. Camada pessoal no IndexedDB, mais backup e "Copiar como registro".
5. Importar GPX, folhas em branco e folha de saída.
6. Passaporte e distintivos.
7. PWA (manifest, service worker, fontes locais) e revisão contra "Proibido".

## Referências
`referencia/*.dc.html` são os protótipos aprovados no canvas de design. Eles usam uma sintaxe de template própria (`{{ }}`, `<sc-for>`, `<sc-if>`, `class Component extends DCLogic`) que não roda fora do canvas.

Use-os como referência exata de layout, textos, estados e lógica. As funções `progresso`, `distintivos`, `lerGPX`, `aneisJS` e `gpxExemplo` estão no script do atlas. Reescreva tudo em JavaScript comum e ignore os registros com `exemplo: true`.
