# Complete a Música

Jogo web estilo Sporcle/"forca" de letras musicais, com sorteio de músicas misteriosas via **LRCLIB**, sorteio ao vivo por artista/banda e um aplicativo **Desktop (Electron)** para gerenciar o catálogo-base no próprio GitHub com proteção contra duplicatas.

---

## Desenvolvimento local

- `npm run dev` — inicia o servidor local de catálogo (`http://127.0.0.1:3001`) e o jogo Web (`http://127.0.0.1:5173`).
- `npm test` — executa a suíte de testes Vitest.
- `npm run build` — gera o build estático Web em `dist/`.
- `npm run desktop:build` — compila o app Desktop em `desktop-dist/`.
- `npm run desktop:package` — gera o executável Windows em `release/CompleteAMusica-Catalogo-win32-x64/`.
