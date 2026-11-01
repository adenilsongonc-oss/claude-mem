# Atlas Selvagem — caderno de expedições

Aplicação pessoal para registrar, organizar, mapear e analisar trilhas. É um **Progressive Web App** estático: HTML, CSS e JavaScript em módulos ES, **sem framework e sem etapa de build obrigatória**. Os dados ficam no aparelho (IndexedDB) e saem dele num arquivo de backup que você controla.

## Diagnóstico de partida

O que existia antes do código: o pacote `caderno-de-trilhas` (o `CLAUDE.md` original está em [`docs/caderno-de-trilhas-CLAUDE.md`](docs/caderno-de-trilhas-CLAUDE.md)), com:

- dados reais: `dados/trilhas.js` (1 registro, Pico das Cabras), `dados/folhas-em-branco.js` (3 trilhas planejadas), `dados/checklist.js` e `dados/icones.json`;
- protótipos aprovados num canvas de design (`referencia/*.dc.html`), com sintaxe própria que não roda fora dele. Ficaram fora do repositório, e os registros `exemplo: true` foram descartados.

Não havia aplicação implementada, então nada foi substituído. A stack pedida no caderno (JS sem framework, site estático, PWA) foi mantida. Nome, paleta e tipografia seguem o prompt mestre do **Atlas Selvagem**, que é posterior ao caderno. A lógica do caderno foi portada para JavaScript comum e tem testes: progresso, metas, degraus, distintivos, leitura, GPX e folha de saída.

## Requisitos

- Qualquer servidor de arquivos estáticos. HTTPS é obrigatório em produção para service worker e instalação; `localhost` dispensa.
- Node.js ≥ 20, só para o servidor de desenvolvimento e os testes.
- Opcional: Playwright com Chromium, para o teste de ponta a ponta e para gerar os ícones.

Não há dependências npm em tempo de execução: Leaflet e as fontes estão vendorizados em `vendor/` e `fontes/`.

## Instalação e execução em desenvolvimento

```bash
cd atlas-selvagem
npm run dev          # http://localhost:5173
```

Não é preciso rodar `npm install`.

## Build e publicação

Não há compilação. `npm run build` roda `scripts/verificar.mjs`, que confere o que será publicado:

- todo arquivo do app está no pré-cache do `sw.js`, e todo item da lista existe;
- todos os `import` relativos resolvem;
- os JSON e o manifesto são válidos e os ícones existem.

### Netlify ligado ao GitHub (recomendado)

O `netlify.toml` na raiz do repositório define a pasta do app (`base`), o build, a pasta `dist/` e os cabeçalhos de cache. No Netlify:

1. Abra o site → **Site configuration → Build & deploy → Link repository**. Num site novo, use **Add new site → Import an existing project**.
2. Escolha o repositório e o branch de publicação.
3. Deixe **Base directory**, **Build command** e **Publish directory** vazios. Tudo vem do `netlify.toml`.

Depois disso, cada `git push` publica uma versão nova, sem arrastar arquivos.

### Publicação manual

Para publicar, copie a pasta (sem `docs/`, `testes/`, `scripts/` e `package.json`) para GitHub Pages, Netlify, Vercel ou outro host estático com HTTPS. Depois de qualquer alteração, **incremente `VERSAO` em `sw.js`**, senão os aparelhos continuam com a versão antiga em cache.

## Testes

```bash
npm test             # unidade: cálculos, GPX, estrutura do PWA (node:test)
npm run test:e2e     # ponta a ponta no Chromium (precisa de playwright)
```

O E2E percorre:

- cadastro com GPX, foto e ponto de interesse;
- persistência após recarregar, diário com salvamento automático;
- favoritos, busca, filtros, ordenação e modos de visualização;
- edição, cancelamento com confirmação e exclusão;
- backup, restauração e exportação de GPX;
- folha de saída;
- service worker, uso offline completo e ausência de rolagem horizontal em 360 px.

Os ícones são gerados com `npm run icones` (Playwright), a partir de `icones/icone.svg`.

## Como testar o PWA

1. Rode `npm run dev` e abra `http://localhost:5173` no Chrome ou Edge.
2. DevTools → **Application**:
   - *Manifest*: sem erros, ícones 192/512/maskable;
   - *Service Workers*: `sw.js` ativo.
3. A instalação aparece na barra de endereço. Em **Arquivo** há o botão "Instalar o Atlas" quando o navegador oferece o evento `beforeinstallprompt`. Em iOS e Firefox, a tela mostra as instruções da plataforma.
4. **Atualização**: altere um arquivo, incremente `VERSAO` em `sw.js` e recarregue. Aparece a faixa "Há uma nova versão" com o botão "Atualizar agora". Se houver uma expedição em edição, a atualização fica bloqueada até você salvar ou cancelar.

## Como testar o funcionamento offline

1. Abra o app uma vez com conexão; o service worker guarda todos os arquivos.
2. DevTools → Network → **Offline** (ou modo avião) e recarregue.
3. Continuam funcionando:
   - atlas, lista, detalhes, diário, fotos e estatísticas;
   - cadastro e edição, folha de saída e distintivos.

   Uma faixa avisa "Sem conexão".
4. O **mapa de fundo não funciona offline**. Os tiles não são guardados, por respeito às políticas de uso dos servidores. O percurso GPX continua desenhado sobre fundo neutro, com aviso.

## Estratégia de armazenamento

| O quê | Onde | Observação |
|---|---|---|
| Registros vindos do chat | `dados/trilhas.js` (código-fonte) | Base versionada, só leitura no app |
| Registros criados aqui, edições da base | IndexedDB `trilhas` | Edição de um registro da base fica local e pode ser desfeita |
| Exclusões de registros da base | IndexedDB `ocultas` | Ocultos só neste aparelho (reversível em Arquivo) |
| Diário, pontos, alertas, tags, favorito | IndexedDB `anotacoes` (por trilha) | Salvamento automático |
| Trajeto GPX completo (lat, lon, ele, tempo) | IndexedDB `trajetos` | Preserva o original para exportar de volta |
| Fotos | IndexedDB `fotos` (Blob) | Reduzidas para ≤ 1600 px JPEG (~200–600 KB); limite de 25 MB por original |
| Contador de números, checklist, rascunho da folha de saída, folhas em branco | IndexedDB `meta` | |
| Tema, camada do mapa, ordenação | `localStorage` | Só preferências pequenas |

- **Identificadores estáveis**: `id` é um slug criado uma vez e nunca mais alterado. `numero` (Nº 01, 02…) também é atribuído uma vez: na base, pela posição no arquivo (ou pelo campo `numero`); nos registros locais, por um contador persistente. Mudar a ordenação não muda nada disso.
- **Proteção contra duplicação**:
  - um GPX já importado é reconhecido pela assinatura (pontos + extremos + horário inicial) e o app pede confirmação antes de importar de novo;
  - "Duplicar" abre o formulário preenchido, sem gravar até você salvar;
  - na restauração, as fotos têm ids UUID e não duplicam.
- **Limites**: o navegador dá a cada site uma cota proporcional ao disco, normalmente centenas de MB ou mais. O uso aparece em Arquivo. Se você não pedir **armazenamento persistente**, o navegador pode apagar dados sob pressão de espaço. O app pede persistência automaticamente quando já há registros próprios, e há um botão para isso.
- Um PWA **não sincroniza entre aparelhos** e **não faz backup em nuvem**. Não há servidor. Para levar os dados a outro aparelho, use o backup.

## Procedimentos de backup

Em **Arquivo → Exportar backup completo** o app gera `atlas-selvagem-backup-AAAA-MM-DD.json`, um único arquivo com:

- registros, anotações, trajetos GPX, metadados;
- **fotos embutidas em base64**.

Guarde-o fora do aparelho (nuvem, e-mail, computador).

**Restaurar**: em Arquivo → Restaurar backup…, o app:

1. valida o arquivo: formato, versão, registros e fotos. Itens inválidos são ignorados com aviso;
2. mostra contagens e **conflitos**: registros que já existem, dizendo qual versão é mais nova;
3. pede o modo:
   - **Mesclar** acrescenta o que falta e, em conflito, fica a versão com `atualizadoEm` mais recente;
   - **Substituir tudo** apaga a camada pessoal e grava só o backup. Exige uma segunda confirmação.

Outras saídas, para não depender do app:

- **CSV** de todos os registros (Arquivo);
- **GPX** do trajeto original e **JSON** do registro (página da trilha);
- **"Copiar como registro"**: gera o objeto no formato de `dados/trilhas.js` para promover o registro à base pelo chat.

## Integrações externas

| Serviço | Uso | Chave | Condições |
|---|---|---|---|
| OpenTopoMap (`tile.opentopomap.org`) | Mapa de fundo padrão (relevo) | Não | CC-BY-SA, atribuição exibida; uso moderado |
| OpenStreetMap (`tile.openstreetmap.org`) | Mapa de fundo alternativo | Não | [Política de tiles](https://operations.osmfoundation.org/policies/tiles/): atribuição, sem uso intensivo nem pré-carregamento |
| WhatsApp (`wa.me`) | Enviar a folha de saída | Não | Link simples, só quando você toca |

O app não guarda nenhuma chave. Os tiles vêm direto da rede, sem passar pelo cache do service worker. Para muitos acessos ou mapas offline, troque para um provedor com contrato e chave (MapTiler, Stadia, Thunderforest) em `js/mapa.js`. Nesse caso, restrinja a chave por domínio no painel do provedor.

## Regras de cálculo

- **Unidades**: km, m e min; coordenadas WGS84 em graus decimais. Ausente = `null`, mostrado como "—" e nunca somado como zero.
- **Totais**: somam só as trilhas que têm o dado e informam a cobertura ("3 de 5 com dado"). Desnível positivo e negativo nunca se misturam.
- **Regiões exploradas**: valores distintos de `regiao`, ignorando caixa e acento.
- **Duração** em filtros e ordenação: tempo total; sem ele, tempo em movimento.
- **Origem de cada valor**: etiqueta *manual*, *GPX*, *print* ou *calc.* ao lado do número.
- **GPX**:
  - distância por haversine;
  - desnível com média móvel de 5 pontos e histerese de 3 m;
  - altitude máxima e mínima brutas;
  - tempo total do primeiro ao último horário;
  - "em movimento" soma intervalos ≤ 600 s com velocidade ≥ 0,3 m/s;
  - tipo: fim a menos de 200 m do início **e** volta coincidente (< 80 m) = ida e volta; fim perto sem coincidir = circular; fim longe = travessia.

  Sem elevação ou horário (menos da metade dos pontos), os campos ficam vazios e o app diz o que faltou.
- **Perfil altimétrico**: com GPX, altitude real × distância. Com registro de print, só a *forma* do perfil, sem escala vertical, rotulada como tal. Sem nenhum dos dois, aparece a mensagem de indisponível.
- **Esboço da folha**: o traçado normalizado (100 × 70) vem do print ou do GPX. As curvas de nível ao redor do cume são **ornamentais** e a legenda diz isso. Esboços de print não têm coordenadas, por isso não aparecem no mapa de exploração; ficam listados à parte.
- **Progresso, metas, degraus, distintivos e leitura**: regras do caderno original (`docs/caderno-de-trilhas-CLAUDE.md`, seção "Cálculos"), cobertas por `testes/calculos.teste.mjs`. Com os dados atuais:
  - próxima meta: 17 km, 450 m (recomendada) ou 1.300 m;
  - degraus: Getúlio 2, Itapiroca 5, Pico Paraná 8.

## Estrutura

```
index.html  offline.html  manifest.webmanifest  sw.js
css/tokens.css        paleta, temas claro/escuro, fontes (único lugar com cores)
css/estilo.css        estrutura, componentes e telas
js/app.js             shell, rotas por hash, faixas, proteção de edição
js/estado.js          mescla base + IndexedDB; todas as escritas
js/armazenamento.js   IndexedDB
js/modelo.js          modelo de dados, validação, pendências
js/calculos.js        estatísticas, filtros, ordenação, metas, distintivos
js/gpx.js             leitura/análise/exportação de GPX
js/desenho.js         SVG: folha, perfil, gráficos, símbolos
js/mapa.js            Leaflet + camadas de tiles
js/backup.js          backup/restauração JSON, CSV
js/pwa.js             service worker, instalação, atualização
js/componentes.js     folha cartográfica, linha de lista, selos
js/telas/*.js         atlas, exploração, estatísticas, expedição, detalhe, arquivo, saída, distintivos
dados/                base versionada (fornecida)
fontes/ vendor/ icones/
testes/ scripts/ docs/
```

## Limitações conhecidas

- Sem sincronização entre aparelhos nem backup automático na nuvem: o backup é manual.
- Mapas de fundo exigem conexão; não há mapa offline.
- Ainda não implementados, embora previstos no caderno original:
  - Passaporte de carimbos;
  - comparação lado a lado de duas trilhas;
  - agrupamento do índice por mês, tipo ou dificuldade.
- A instalação foi verificada no Chromium automatizado (manifesto válido, service worker ativo). O prompt de instalação real e o comportamento no iOS precisam ser conferidos num aparelho.
- GPX com várias trilhas ou segmentos é lido como um percurso contínuo.
