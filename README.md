# Complete a Música

Jogo web estilo Sporcle/"forca" de letras musicais, com sorteio de músicas misteriosas via **LRCLIB**, sorteio ao vivo por artista/banda e um aplicativo **Desktop (Electron)** para gerenciar o catálogo-base no próprio GitHub com proteção contra duplicatas.

---

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub (por exemplo, `complete-a-musica`).
2. Na pasta raiz do projeto (`c:\Users\ericm\Documents\Complete a Musica`), conecte o repositório remoto e envie seus arquivos (a sua branch local atual é `master` — o workflow aceita tanto `master` quanto `main`):
   ```bash
   git add .
   git commit -m "Versão inicial para GitHub Pages"
   git remote add origin https://github.com/ericmonne/complete-a-musica.git
   git push -u origin master
   ```
3. No GitHub, abra o repositório e vá em **Settings → Pages**.
4. Em **Build and deployment → Source**, selecione **GitHub Actions**.
5. Assim que o workflow [deploy.yml](.github/workflows/deploy.yml) concluir (~1 minuto), o jogo estará no ar em `https://ericmonne.github.io/complete-a-musica/`.

---

## Como adicionar músicas pelo App Desktop (usando o GitHub como servidor)

O catálogo oficial do jogo fica em `public/catalog.json` dentro do repositório. O jogo Web apenas lê esse arquivo; somente quem possuir o **App Desktop** + um **Token do GitHub** com permissão de escrita consegue adicionar ou remover músicas.

### 1. Gerar o Token de Acesso (Fine-grained PAT)
1. No GitHub, abra **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Em **Repository access**, escolha **Only select repositories** e marque apenas o repositório deste jogo.
3. Em **Repository permissions → Contents**, selecione **Read and write**.
4. Gere o token e guarde-o com segurança (você pode compartilhá-lo apenas com as pessoas autorizadas a editar o catálogo).

### 2. Usar o App Desktop (`CompleteAMusica-Catalogo.exe`)
1. Abra `release/CompleteAMusica-Catalogo-win32-x64/CompleteAMusica-Catalogo.exe` (ou execute `npm run desktop` no projeto).
2. Mantenha a aba **GitHub (GitHub Pages)** selecionada.
3. Preencha:
   - **Repositório GitHub:** `ericmonne/complete-a-musica`
   - **Branch:** deixe em branco para detectar automaticamente (`main` ou `master`)
   - **Token do GitHub (PAT):** cole o token gerado
4. Clique em **Conectar / Atualizar**.
5. Pesquise músicas no LRCLIB ou use o cadastro manual — o app bloqueia duplicatas automaticamente (ignorando maiúsculas, acentos, cedilhas e sufixos como `- Remastered 2011`).
6. Ao adicionar ou remover uma música, o app grava o commit em `public/catalog.json` e o **GitHub Pages republica o site automaticamente em ~30–45 segundos**.

---

## Desenvolvimento local

- `npm run dev` — inicia o servidor local de catálogo (`http://127.0.0.1:3001`) e o jogo Web (`http://127.0.0.1:5173`).
- `npm test` — executa a suíte de testes Vitest.
- `npm run build` — gera o build estático Web em `dist/`.
- `npm run desktop:build` — compila o app Desktop em `desktop-dist/`.
- `npm run desktop:package` — gera o executável Windows em `release/CompleteAMusica-Catalogo-win32-x64/`.
