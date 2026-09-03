# Fast Cut Vídeo — documentação técnica

SPA React + Zustand servida por uma API Express. Entregue de dois jeitos a partir do
**mesmo** servidor: container Docker (web) e app desktop Tauri (o servidor vira sidecar).
`yt-dlp` e `ffmpeg` vêm junto nos dois casos (nunca baixados em runtime).

- **Front:** `src/` — React 19, Zustand (`persist`: `localStorage` na web, SQLite no
  desktop), SSE para progresso.
- **Back:** `server/` — Express, jobs em memória espelhados em `data/jobs/*.json`.
- **Compartilhado:** `shared/` — tipos + utilidades de tempo, nome de arquivo e
  detecção de fonte de vídeo, usados nos dois lados.

## Rodar a partir do código

Requer **Node 22**. No Windows, `npm run dev` roda `scripts/fetch-binaries.mjs` antes,
que baixa `yt-dlp` e `ffmpeg` para `./bin/`. Em macOS/Linux instale via `brew`/`apt`.
O servidor procura os binários nesta ordem: env var → `./bin/` → `PATH`.

```bash
npm install
npm run setup      # (opcional) baixa yt-dlp + ffmpeg para ./bin  (--force p/ atualizar)
npm run dev        # front em :3000 (proxy /api → :5000) + API em :5000
npm test           # Vitest (unit)
npm run test:e2e   # Playwright (fluxo real: upload → corte → processa → resultados)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint (flat config em eslint.config.js)
npm run format     # Prettier --write .   (format:check só confere)
npm run check      # format:check + lint + typecheck + test  (o mesmo que a CI roda)
npm run build      # dist/public (SPA) + dist/server (bundle da API, via tsup)
npm start          # roda o build: node dist/server/index.js  (porta 5000 por padrão)
```

`npm install` instala um hook de **pre-commit** (Husky) que roda `lint-staged`
(ESLint + Prettier nos arquivos em stage) e `tsc --noEmit`. A **CI**
(`.github/workflows/ci.yml`) roda `npm run check` + `npm run build` (job `check`) e os
testes E2E do Playwright (job `e2e`) em todo Pull Request e push na `master`.

Todo o código de teste vive em **`tests/`** (espelha a árvore do projeto:
`tests/server/…`, `tests/shared/…`, `tests/src/…`, `tests/e2e/…`). Os testes
importam a aplicação pelos aliases `@/`, `@server/`, `@shared/` (definidos em
`vitest.config.ts` e `tsconfig.json`).

Os testes E2E (`tests/e2e/*.spec.ts`) sobem o build de verdade via
`tests/e2e/serve.mjs` (num `DATA_DIR` limpo) e usam `tests/e2e/fixtures/sample.mp4`
como fonte — cobrem o pipeline inteiro sem rede. Rodam com
`npx playwright install chromium` na 1ª vez.

Cobertura: `npm run test:coverage` (relatório em `coverage/`). Só a lógica não-React
é coberta por unit tests; os componentes ficam a cargo do E2E.

Em dev a API usa a porta **5000** (o front Vite fica na 3000 e faz proxy `/api`).
Em produção (Docker) o container roda tudo na **3000** — a imagem já traz `PORT=3000`.

`predev` roda `scripts/free-ports.mjs`, que mata qualquer processo ouvindo nas portas
3000/5000 antes de subir — `npm run dev` nunca falha com `EADDRINUSE`.

Com Docker:

```bash
docker compose up --build      # porta 3000, bind mount ./data
```

## Desktop (Tauri)

O app desktop **não é um segundo código-base** — é o mesmo servidor Node rodando como
_sidecar_ do Tauri (`src-tauri/`), com a janela apontada pra `http://127.0.0.1:47823`
depois que o `/api/health` responde. `ffmpeg`/`ffprobe`/`yt-dlp` e o SPA buildado são
_resources_ do bundle; o servidor os acha via `BIN_DIR` e `PUBLIC_DIR`.

Requer **Rust** (`rustup`) e, no Linux, as libs do WebKitGTK (ver `release-desktop.yml`).

```bash
npm run build:desktop-server   # tsup CJS → dist/desktop/index.cjs  (tudo embutido)
npm run fetch:desktop-bin      # ffmpeg/ffprobe/yt-dlp do SO atual → src-tauri/binaries/vendor
npm run package:server         # @yao-pkg/pkg → src-tauri/binaries/fast-cut-video-server-<triple>[.exe]
npm run tauri build            # roda `desktop:stage` (build:web + copia p/ src-tauri/public) e gera o instalador
```

O instalador sai em `src-tauri/target/release/bundle/`. Para iterar no Rust sem gerar
instalador: `npm run tauri build -- --no-bundle` (ou `cargo check` dentro de `src-tauri/`).

- **Porta:** o `lib.rs` procura uma porta livre a partir de `47823` (reusa se já achar
  um servidor nosso ali — típico em dev). `capabilities/default.json` libera o IPC do
  Tauri (plugin SQL) pra `http://127.0.0.1:*` e `http://localhost:*`.
  `tauri-plugin-single-instance` evita duas instâncias.
- **Persistência:** no desktop o Zustand `persist` grava em **SQLite** (tabela `kv`,
  1 blob JSON) via `tauri-plugin-sql` — `src/lib/desktopStorage.ts`, selecionado por
  `isTauri()` em `src/store.ts`. Na web/Docker continua `localStorage`. O import do
  plugin é dinâmico, então não entra no bundle web. Os manifestos de job do servidor
  seguem em `data/jobs/*.json` (agora sob a pasta de dados do app).

### Variáveis de ambiente

| Var                                           | Default                               | Para quê                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                        | `5000` (dev) / `3000` (imagem Docker) | porta da API                                                                                                                                                     |
| `HOST`                                        | `0.0.0.0` / `127.0.0.1` (desktop)     | interface onde a API escuta                                                                                                                                      |
| `DATA_DIR`                                    | `./data`                              | raiz de output/sources/jobs/uploads/compilations                                                                                                                 |
| `BIN_DIR`                                     | `./bin`                               | onde procurar os binários                                                                                                                                        |
| `PUBLIC_DIR`                                  | `<bundle>/../public`                  | onde está o SPA buildado (o shell desktop aponta pros _resources_ do Tauri)                                                                                      |
| `FFMPEG_PATH` / `FFPROBE_PATH` / `YTDLP_PATH` | —                                     | caminho explícito de cada binário                                                                                                                                |
| `SOURCE_MAX_HEIGHT`                           | `1080`                                | resolução máxima baixada pelo yt-dlp                                                                                                                             |
| `YTDLP_IMPERSONATE`                           | `chrome`                              | alvo do `--impersonate` do yt-dlp (fingerprint de navegador; evita HTTP 403 em sites como o Rumble). `""` desliga; cai fora sozinho se o binário não suportar    |
| `YTDLP_COOKIES`                               | —                                     | caminho de um `cookies.txt` (formato Netscape) passado ao yt-dlp — necessário p/ Instagram e conteúdo que exige login                                            |
| `YTDLP_COOKIES_FROM_BROWSER`                  | —                                     | alternativa ao anterior: nome do navegador de onde ler os cookies (`firefox`, `chrome`, `edge`, `brave`…[`:perfil`]). Ignorado se `YTDLP_COOKIES` estiver setado |
| `MAX_FFMPEG`                                  | metade dos núcleos (mín. 1)           | quantos processos ffmpeg podem rodar ao mesmo tempo (entre jobs simultâneos)                                                                                     |
| `DATA_TTL_DAYS`                               | `7`                                   | GC de disco: idade máxima de um item ocioso em `data/` (`0` desliga a poda por idade)                                                                            |
| `DATA_MAX_GB`                                 | `0`                                   | GC de disco: teto de tamanho do `data/` inteiro; os itens mais antigos são apagados até caber (`0` = sem teto)                                                   |
| `DATA_SWEEP_HOURS`                            | `6`                                   | intervalo entre varreduras do GC                                                                                                                                 |
| `FONT_NAME`                                   | —                                     | família de fonte da marca d'água de texto (`drawtext`); vazio = default do fontconfig                                                                            |

## Frontend

- **Multi-projeto.** Store = `{ projects: Project[], activeId, view }`. `persist` grava
  o modelo mínimo (`StoredProject`: `{ id, url, isLow, cuts:[{init,end,name?}], title?,
duration?, thumbnail?, videoId?, jobId? }`) na key `yt-cut-projects`. Recarregar não
  perde URL/cortes; se havia `jobId`, o projeto volta em `progress` e `<JobWatchers>`
  re-busca o job.
- **Fases do projeto:** `url → editor → progress → results`. Cada `Project` tem seu
  `phase`, `jobId` e snapshot `job`. "Processar" gera um **jobId novo** (não reusa
  `project.id`).
- **`<JobWatchers>`** (montado 1× no `App`) mantém uma assinatura SSE por projeto com
  job não-terminal → o progresso continua mesmo trocando de aba.
- **Shell:** `<Sidebar>` (projetos + "Mesclar vídeos") + `.topbar` + `.content__main`.
  Layout full-width; o editor é uma cadeia flexbox que preenche a viewport sem scroll
  de página (cada coluna rola por dentro).
- **`<VideoPreview>`** (`src/components/player/`) é um dispatcher
  (`shared/videoSource.ts` `detectSource`):
  - YouTube com id → `<YouTubePlayer>` (IFrame API).
  - fonte já baixada / arquivo local → `<LocalFilePlayer>` (`<video>` servido por
    `GET /api/source`, com _range_).
  - senão → `<EmbedPreview>` (`<iframe>` de embed ou thumbnail) até o download acabar.
  - Os dois players fornecem um `PlayerAdapter` ao `<PlayerControls>` compartilhado:
    transporte, relógio, **Marcar início/fim** (`I`/`O`; `K`/espaço; `J`/`L` ±5s;
    `←/→` ±1s, `Shift` ±10s) e a **waveform** (`GET /api/source/peaks`) que vira a barra
    de navegação (clique/arraste = seek; `Shift`+arraste = novo corte). A ponte de
    tempo (`seekTo`/`getPlayerTime`) vive no store.
- **`<OutputOptions>`** (no bloco "Processar"): formato de saída (mp4/webm/gif/mp3) e
  marca d'água (texto + logo, canto, opacidade) — vão no payload de `POST /api/jobs` e
  o `buildCutArgs` monta o filtergraph.
- **Undo/redo** por projeto: `store.history[projectId] = {past, future}` de `VideoCut[]`
  (runtime, não persistido); edições de texto no mesmo campo coalescem em 700ms.
- **`<ConfirmDialog>`** substitui `window.confirm` (remover corte, cancelar
  processamento, remover projeto). É portado pro `document.body` e adiciona
  `body.has-modal` — o `<iframe>` do YouTube compõe em layer própria e passava na frente
  da modal.
- **Montagem final** (`<CompilationView>`): timeline de `.montage-card` com
  drag-and-drop nativo; pool de clipes numa modal (`GET /api/clips` + upload via
  `multer`). "Gerar vídeo" → `POST /api/compilations` + SSE → download.

## Pipeline

`POST /api/jobs` valida o projeto (Zod + `validateCut`), cria o job (`phase:
"downloading"`) e dispara `runPipeline` (fire-and-forget). SSE em
`GET /api/jobs/:id/events`.

1. **Download** — `ensureSource(url)` (`server/core/sourceCache.ts`). O vídeo é cacheado
   **por vídeo**, não por job: `sourceKey` = `detectSource(url).id` (`<provider>-<id>`;
   YouTube sem prefixo) ou hash da URL, gravado em `data/sources/<key>/source.mp4`.
   Downloads concorrentes para o mesmo vídeo compartilham um só (fan-out de progresso).
   Reaproveitado entre jobs e reinícios.
2. **Corte** — para cada intervalo, `ffmpeg` com `-ss` antes de `-i` e `-t` de duração.
   Sequencial, em ordem do array. Cada corte reporta `pending → processing → done/error`.

### Download antecipado

`POST /api/prefetch { url }` dispara `prefetchSource` (fire-and-forget);
`GET /api/prefetch?url=` devolve `{ state, percent }`. O `<Editor>` chama isso **assim
que existe ≥1 corte** e faz poll do progresso numa linha de status. Nenhum corte é
gerado aí — só o download; ao "Processar", `ensureSource` encontra o arquivo pronto e o
job cai direto no corte.

### Cancelar

`server/core/jobControl.ts` guarda um `AbortController` por job. `runPipeline` passa o
`signal` pro `spawn` do ffmpeg e faz `Promise.race([whenAborted(signal), ensureSource])`.
`POST /api/jobs/:id/cancel` → `cancelJob()` + marca o job `failed` ("Geração dos cortes
cancelada") e os cortes pendentes viram `error`. O download compartilhado **continua**
(cacheado, útil pra outros jobs).

## Encode — menor disco, boa qualidade

| Modo        | ffmpeg                                                                           | Resultado                                                   |
| ----------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Preciso** | `libx264 -preset slow -crf 23 -pix_fmt yuv420p` + `aac -b:a 128k` + `+faststart` | corte no segundo exato, arquivo pequeno, mais lento         |
| **Rápido**  | `-c:v copy` + áudio re-encoda (`aac 128k` + `aresample=async=1:first_pts=0`)     | quase instantâneo; o início salta pro keyframe mais próximo |

- O áudio é re-encodado mesmo no modo Rápido — `-c copy` puro deixava o som
  dessincronizado no salto de keyframe.
- `-avoid_negative_ts make_zero` é **proibido** (infla a duração).
- Download limitado a `SOURCE_MAX_HEIGHT` (1080p) preferindo H.264/mp4 — mantém o modo
  Rápido compatível com mp4 e evita 4K/1440p enchendo o cache.
- A montagem final re-encoda tudo pra 1920×1080/30fps/48kHz stereo com os mesmos
  parâmetros; clipes sem áudio ganham trilha `anullsrc`.

## API

| Método + rota                                                                | O quê                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `POST /api/video-info`                                                       | `{ url }` → título/duração/thumbnail (yt-dlp `--dump-single-json`) |
| `POST /api/prefetch` · `GET /api/prefetch?url=`                              | inicia / consulta o download antecipado                            |
| `POST /api/jobs`                                                             | cria e dispara um job                                              |
| `GET /api/jobs` · `GET /api/jobs/:id`                                        | lista / snapshot                                                   |
| `GET /api/jobs/:id/events`                                                   | SSE de progresso                                                   |
| `POST /api/jobs/:id/cancel`                                                  | cancela um job em andamento                                        |
| `DELETE /api/jobs/:id/cuts/:position`                                        | remove um corte (apaga o arquivo, mantém as posições)              |
| `GET /api/jobs/:id/files/:position` · `/preview/:position` · `/download-all` | download / preview inline / zip                                    |
| `GET /api/clips` · `POST /api/uploads`                                       | pool da montagem                                                   |
| `POST /api/compilations` · `GET /api/compilations/:id/events` · `/download`  | montagem final                                                     |

## Persistência

Bind mount `./data` → `output/`, `sources/`, `jobs/`, `uploads/`, `compilations/`
sobrevivem a `docker compose down && up`. O job store e o compilation store (em memória)
são espelhados em `data/jobs/*.json` / `data/compilations/*.json` e rehidratados no boot
— jobs interrompidos por restart viram `failed`.

## Estrutura

```
shared/   tipos + utils (time, filename, youtube, videoSource)
src/
  components/   Sidebar, UrlStep, Editor, VideoPreview, CutsManager, CutRow,
                CutModeToggle, ProgressView, ResultsView, CompilationView,
                ConfirmDialog, Logo, JobWatchers, ClipVideo
  lib/          api.ts (fetch + SSE), youtubeApi.ts, uuid.ts
  store.ts      Zustand + persist
server/
  index.ts      monta as rotas, serve dist/public em produção
  routes/       videoInfo, prefetch, jobs, clips, uploads, compilations
  core/         ytdlp, ffmpeg, pipeline, sourceCache, jobControl, jobStore,
                compile, compilationPipeline, compilationStore, naming, probe, paths
src-tauri/      shell desktop: Cargo.toml, tauri.conf.json, src/lib.rs (spawn do
                sidecar + health + navigate), capabilities/, splash/, icons/
scripts/        fetch-binaries (dev), fetch-desktop-binaries, package-server,
                stage-desktop
```

## Release

Ao empurrar uma tag `v*`, dois workflows independentes rodam em paralelo:

- **`.github/workflows/release.yml`** — `npm ci` → confere `package.json` == tag →
  `typecheck` + `test` → build + push da imagem pra `ghcr.io/<owner>/tools/fast-cut-video`
  (tags `:X.Y.Z`, `:X.Y`, `:latest`; `latest` só se não for pré-release) → cria a
  Release do GitHub.
- **`.github/workflows/release-desktop.yml`** — matriz Windows / macOS Intel
  (`macos-13`) / macOS Apple Silicon (`macos-14`) / Linux (mesmo formato do `fpaste`):
  empacota o servidor sidecar (`build:desktop-server` + `fetch:desktop-bin` +
  `package:server`) e roda `tauri-apps/tauri-action`, que builda e anexa os instaladores
  à Release da tag. macOS sai **por arquitetura**, não universal — o sidecar é um binário
  do `@yao-pkg/pkg` e o payload dele não sobrevive a `lipo`. `version` do
  `tauri.conf.json` é `"../package.json"` (fonte única). Pré-release herda o `-` da tag.

Os dois criam/atualizam a **mesma** Release (a que corresponde à tag).

```bash
npm version 1.2.0 --no-git-tag-version
git commit -am "v1.2.0" && git tag v1.2.0
git push && git push origin v1.2.0
```

Atualize o `CHANGELOG.md` (seção "Não lançado" → nova versão) antes de taguear.
