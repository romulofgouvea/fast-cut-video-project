# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
A versão em `package.json` deve bater com a tag `v*` que dispara a release.

## [Não lançado]

## [0.0.5-beta] - 2026-09-02

### Alterado

- Imagem Docker publicada em **`ghcr.io/<owner>/tools/fast-cut-video`** (prefixo `tools/`).

### Corrigido

- Build dos instaladores desktop (só afetava o CI da Release; as tentativas
  `v0.0.2`–`v0.0.4` não saíram completas):
  - **macOS** sai **por arquitetura** (Intel + Apple Silicon) em vez de universal — o
    Tauri não faz `lipo` do binário do servidor sidecar (`@yao-pkg/pkg`).
  - **ffmpeg/ffprobe** estáticos: fonte trocada pro release `latest` do BtbN
    (`/releases/download/latest/`, não `/releases/latest/download/`, que passou a
    apontar pra um autobuild sem os assets `master-latest` → HTTP 404). Vale para
    Windows e Linux; o `johnvansickle.com` (que bloqueava os runners) saiu de cena.

## [0.0.2-beta] - 2026-09-02

### Adicionado

- **App desktop (Tauri) para Windows, macOS e Linux.** Os mesmos recursos da versão
  web, num executável — instaladores (`.exe`, `.dmg`, `.AppImage`/`.deb`) são anexados à
  Release de cada tag `v*` (novo workflow `release-desktop.yml`, no formato do `fpaste`).
  - O servidor Node/Express (idêntico ao da imagem Docker) roda como **sidecar** do
    Tauri, ligado a `127.0.0.1`; `ffmpeg`/`ffprobe`/`yt-dlp` e o SPA buildado viajam
    como resources do bundle. Empacotamento do servidor via `tsup` (CJS) +
    `@yao-pkg/pkg`; binários por plataforma via `scripts/fetch-desktop-binaries.mjs`.
  - **Persistência em SQLite no desktop** (`tauri-plugin-sql`, tabela chave/valor) no
    lugar do `localStorage` — a lógica de projetos/cortes é a mesma, só troca a camada
    de storage do Zustand `persist` (`src/lib/desktopStorage.ts`). Na web/Docker
    continua `localStorage`. Os manifestos de job do servidor seguem em
    `data/jobs/*.json`.
  - `server/index.ts` aceita `PUBLIC_DIR` (onde está o SPA) e `HOST` (o desktop liga em
    `127.0.0.1`).

## [0.0.1-beta] - 2026-09-02

Primeira _prerelease_ pública sob o nome **Fast Cut Vídeo**. Imagem Docker em
`ghcr.io/<owner>/fast-cut-video:0.0.1-beta`.

### Adicionado

- **Outras fontes de vídeo além do YouTube**, sem SDK de terceiros. YouTube mantém o
  player completo (scrub, "Marcar início/fim"); nas outras fontes o preview é um
  `<iframe>` de embed simples (ou a thumbnail) e os tempos são digitados. Novo
  `shared/videoSource.ts`; `youtubeUrl` virou `sourceUrl`.
  - **Prévia embutida** para Vimeo, Dailymotion, Rumble, Facebook, Instagram, TikTok,
    X/Twitter, Reddit, Telegram, LinkedIn, Giphy, Pinterest (pin) e Twitch —
    `detectSource` monta a URL de embed a partir de **só o link** da página/post.
  - **Cola o código de incorporação** (`<iframe>`, `<blockquote>` do Instagram/TikTok/
    X/Reddit, `<div class="fb-video">`, `<script data-telegram-post>`, wrappers do
    iframely, …): `extractSourceUrl()` acha a URL canônica no `src`, num `data-*`,
    no `cite` ou no `<a href>` e limpa os parâmetros de rastreio. Provedor
    desconhecido com `<iframe>` (Panda Video, Wistia, …) usa o `src` direto.
- **Player local com scrub para qualquer fonte.** Assim que o download termina, o
  editor troca o embed por um `<video>` real (servido por `GET /api/source` com
  suporte a _range_) com a mesma barra de transporte e o "Marcar início/fim" — antes
  isso só existia no YouTube. Players unificados em `src/components/player/`
  (`PlayerControls` + adaptador; `YouTubePlayer` / `LocalFilePlayer`).
- **Waveform + timeline.** `GET /api/source/peaks` extrai a forma de onda do áudio via
  ffmpeg (cacheada em `peaks-<n>.json`). No editor ela vira a barra de navegação:
  clique/arraste para navegar, **Shift+arraste para criar um corte**; os cortes
  existentes e o "início marcado" aparecem sobre a onda.
- **Arquivo local como fonte.** Arraste um vídeo do computador (ou clique) na tela
  inicial — `POST /api/uploads` guarda o arquivo e o projeto passa a usar
  `sourceUrl = local:<id>`; daí o fluxo é o mesmo (player local, waveform, cortes). Sem
  yt-dlp: `ffprobe` para a duração.
- **Tema claro / escuro / sistema.** Botão no topo alterna e lembra a escolha
  (`localStorage`); escuro continua o padrão. Paleta light nova em
  `:root[data-theme="light"]`.
- **Mais atalhos de teclado.** `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` desfaz/refaz a lista de
  cortes (histórico por projeto, com botões ↶ ↷ na lista); `Ctrl/Cmd+Enter` processa;
  `Ctrl/Cmd+Alt+↑/↓` troca de projeto; `Ctrl/Cmd+Alt+N` cria projeto. No player,
  `←/→` (±1s) e `Shift+←/→` (±10s) além de I/O/J/K/L.
- **Formato de saída por projeto**: MP4 (padrão), **WebM** (VP9/Opus), **GIF** (paleta,
  sem som) ou **MP3** (só o áudio). A extensão dos arquivos acompanha.
- **Marca d'água** nos cortes: texto sobreposto (`drawtext`) e/ou uma imagem/logo
  (`POST /api/uploads/image` + `overlay`), com posição (4 cantos) e opacidade. Um
  watermark força o re-encode mesmo no modo "rápido". Docker ganhou `fonts-dejavu-core`
  para o texto; `FONT_NAME` troca a fonte.
- **Download antecipado**: o servidor baixa o vídeo em segundo plano
  (`POST /api/prefetch`) enquanto o usuário marca os cortes — no YouTube ao 1º corte,
  nas outras fontes assim que o editor abre (o player local precisa do arquivo).
  Nenhum corte é gerado aí. Ao clicar "Processar", o vídeo já está em disco e o job só
  corta. Progresso em `GET /api/prefetch?url=`, cacheado por vídeo e reaproveitado
  entre jobs/reprocessos.
- **Remover corte na tela de Resultados** (`DELETE /api/jobs/:id/cuts/:position`) —
  apaga o arquivo e tira do manifesto; os outros cortes mantêm a posição.
- **Cancelar a geração dos cortes** (`POST /api/jobs/:id/cancel`) — mata o ffmpeg em
  andamento via `AbortSignal`; os cortes já prontos ficam, o download fica no cache.
- Na tela de Resultados, "Editar e reprocessar" virou dois botões: **Editar** (vai pro
  editor) e **Processar novamente** (re-roda o mesmo job direto, sem passar pelo editor).
- **Modais de confirmação** no estilo do sistema (`<ConfirmDialog>`) para remover corte
  e remover projeto (o `×` da sidebar), no lugar do `window.confirm`.
- Logo própria (`<Logo>` + favicon SVG). Projeto renomeado para **fast-cut-video**.
- Tooltips nos botões do player e nas opções de modo de corte.

### Corrigido

- **Rumble (e outros sites) davam HTTP 403 ao baixar/ler metadados.** O yt-dlp agora
  roda com `--impersonate chrome` (fingerprint de navegador, via curl_cffi já embutido
  nos binários oficiais). Configurável por `YTDLP_IMPERSONATE`; se o binário não
  suportar, o app detecta na 1ª falha e segue sem a flag.

### Alterado

- **Menor espaço em disco, mantendo boa qualidade:**
  - Download limitado a 1080p (`SOURCE_MAX_HEIGHT`, default 1080), preferindo H.264/mp4 —
    4K/1440p enchiam o cache à toa.
  - Cortes `precise` e montagem: `libx264 -preset slow -crf 23` + AAC 128k + `+faststart`
    (era `veryfast -crf 18 / 192k`).
- Editor refinado: modo de corte numa linha só, card do vídeo sem padding, barra do
  player numa linha com divisórias, botão único "Marcar início / fim".
- Ícones removidos dos botões (só texto), incluindo o `←` do botão de voltar.

### Corrigido

- `<ConfirmDialog>` vazava `overflow: hidden` no `<body>` (dependência instável no
  `useEffect`) e o player do YouTube renderizava **na frente** da modal — agora a modal
  é portada pro `<body>` (z-index 200), e o `<iframe>` some enquanto a modal está aberta.
- Altura do editor passou a ser 100% flex (sem `height: 100%` frágil) — o grid volta a
  preencher a viewport de forma consistente.
- Layout ocupa a largura toda; a tela do editor não rola mais.

## [1.0.0] - 2026-08-29

Publicado como `yt-cut-cut` (renomeado para `fast-cut-video` em seguida).

### Adicionado

- App web em container Docker: baixa um vídeo do YouTube uma vez e gera um `.mp4` por
  intervalo de corte.
- Player embutido com marcação `I`/`O`, atalhos de teclado e scrub próprio.
- Vários projetos ao mesmo tempo; download/corte roda em segundo plano (SSE) e persiste
  em `localStorage` + `data/jobs/*.json`.
- Dois modos de corte: **Preciso** (re-encode) e **Rápido** (`-c:v copy`).
- Montagem final: concatena cortes e arquivos enviados num vídeo único (1080p/30fps).
- Download por corte, "baixar tudo" em `.zip`, nomes de arquivo automáticos.
