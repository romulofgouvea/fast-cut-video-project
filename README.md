# Fast Cut Vídeo

Baixa um vídeo da internet e recorta os pedaços que você quiser, cada um
num arquivo `.mp4` separado. Roda no seu computador, sem instalar nada além do Docker.

## O que dá pra fazer

- **Cole o link** de um vídeo (YouTube, Vimeo, Dailymotion, Rumble e muitos outros) e
  ele aparece na tela.
- **Marque os trechos** que quer cortar — no YouTube dá pra dar play, apertar `I` no
  início e `O` no fim que o corte entra na lista sozinho; nas outras fontes você digita
  os tempos (tipo `00:01:30`).
- **Processe** e baixe cada corte, ou tudo de uma vez num `.zip`.
- **Vários vídeos ao mesmo tempo** — cada um é um projeto na barra da esquerda. O
  download e o corte rodam em segundo plano, então dá pra ir montando outro projeto
  enquanto o primeiro trabalha.
- **Mesclar vídeos**: junta vários cortes (e arquivos seus) num vídeo só.
- Nada se perde se você fechar a aba sem querer — os projetos ficam salvos no navegador.

## Como rodar

### Opção 1 — baixar o app (Windows, macOS, Linux)

Vá em **[Releases](../../releases/latest)** e baixe o instalador do seu sistema:

| Sistema | Arquivo                       |
| ------- | ----------------------------- |
| Windows | `.msi` ou `.exe`              |
| macOS   | `.dmg`                        |
| Linux   | `.AppImage` ou `.deb`         |

Instale e abra normalmente. Não precisa de Docker nem de mais nada — o `ffmpeg` e o
`yt-dlp` já vêm dentro. Os vídeos ficam numa pasta do seu usuário; a tela inicial mostra
quanto espaço estão ocupando e tem um botão pra limpar o que não está em uso.

> Os instaladores não são assinados ainda: no Windows o SmartScreen pode pedir
> "Mais informações → Executar assim mesmo"; no macOS, botão direito → Abrir.

### Opção 2 — Docker

Você precisa do **[Docker Desktop](https://www.docker.com/products/docker-desktop/)**
instalado. Com ele aberto, rode num terminal:

```bash
docker run -p 3000:3000 -v "$PWD/data:/data" ghcr.io/<owner>/tools/fast-cut-video:latest
```

Agora abra **<http://localhost:3000>** no navegador. Pronto.

Para parar, feche o terminal (ou `Ctrl+C`). Para rodar de novo é o mesmo comando.

> Quer rodar a partir do código-fonte, alterar ou contribuir? Veja
> **[DEVELOPMENT.md](DEVELOPMENT.md)**.

## Passo a passo

1. Clique em **+ Novo projeto**, cole o link do vídeo e clique em **Abrir no player**.

   - Adicionando o link do vídeo
     ![Colar o link do vídeo](docs/screenshot-url.png)
   - Depois de adicionado
     ![Tela do editor](docs/screenshot-editor.png)

2. Marque os cortes:
   - **YouTube:** play, `I` no início do trecho, `O` no fim — o corte aparece na lista.
     Os botões `-10s / -5s / +5s / +10s` ajudam a achar o ponto certo.
   - **Outras fontes:** clique em **+ Adicionar corte** e digite início e fim.
3. Assim que existe o primeiro corte, o app **já começa a baixar o vídeo** em segundo
   plano — quando você clicar em **Processar cortes**, ele só recorta.
4. Escolha o modo:
   - **Preciso** — recorta no segundo exato, um pouco mais lento.
   - **Rápido** — quase instantâneo, mas o início pode "pular" alguns quadros.
5. Clique em **Processar cortes** e acompanhe o progresso. Dá pra **Cancelar** a
   qualquer momento.

   ![Tela de progresso](docs/screenshot-progress.png)

6. Na tela de resultados: baixe cada corte, **Baixar tudo (.zip)**, ou **Remover** um
   corte que não ficou bom e **Processar novamente**.

![Tela de resultados](docs/screenshot-results.png)

## Onde ficam os arquivos

Tudo fica na pasta `data/`, ao lado de onde você rodou o comando:

| Pasta                | O que tem                                                  |
| -------------------- | ---------------------------------------------------------- |
| `data/output/`       | os cortes gerados                                          |
| `data/sources/`      | os vídeos baixados (reaproveitados — não baixa o mesmo 2×) |
| `data/compilations/` | os vídeos da mesclagem                                     |

Essa pasta **sobrevive** a reiniciar o container. Só apagar `data/` manualmente perde
os arquivos.

## Perguntas comuns

**Precisa de conta ou login?** Não.

**Fica salvo na nuvem?** Não. Tudo roda no seu computador; os arquivos ficam em `data/`.

**Dá pra baixar em 4K?** O download é limitado a 1080p de propósito, pra não encher o
disco — 1080p já é bastante pra recortar.

**O vídeo não aparece no player (fora do YouTube).** É esperado: só o YouTube tem player
com controle de tempo aqui. Nas outras fontes o preview é só pra assistir — abra o vídeo
no site original pra ver os minutos e digite os tempos.

**Deu erro no download.** Alguns vídeos são privados, têm restrição de idade ou são
bloqueados por região. A mensagem de erro geralmente diz o motivo.

---

Detalhes técnicos em **[DEVELOPMENT.md](DEVELOPMENT.md)** · histórico em
**[CHANGELOG.md](CHANGELOG.md)**.
