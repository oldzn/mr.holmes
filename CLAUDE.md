@AGENTS.md

# Mr. Holmes — instruções do projeto

Localizador visual de nomes de usuário (motor portado do Sherlock Project), Next.js 16 App Router, Three.js para a cena 3D. Toda a interface é em **português do Brasil**; código, identificadores e commits em inglês.

## REGRA FIXA — UI/UX sempre com referência do 21st.dev

Pedido do dono do projeto (14/10/2026): **toda** tarefa que toca interface — tela nova, componente, botão, formulário, navegação, estado vazio/erro/carregando, animação, atalho — começa consultando o MCP do **21st.dev** (`https://21st.dev/api/mcp`, declarado em `.mcp.json`).

1. **Antes de escrever o componente**, busque no registro do 21st os componentes e padrões já validados para aquela necessidade (ex.: "command palette", "search input with chips", "progress ring", "drawer settings", "toast"). Compare duas ou três opções.
2. **Adapte, não cole.** O resultado tem que seguir a lógica e a estética deste projeto: paleta Baker Street (`--ink`, `--brass`, `--gold`, `--teal` em `app/globals.css`), tipografia Cormorant/Inter/JetBrains, textos em pt-BR, e os comportamentos já definidos (atalhos de teclado, feedback por toast, `prefers-reduced-motion`).
3. **Diga de onde veio.** Ao terminar, cite qual componente do 21st serviu de referência e o que foi mudado.
4. **Se o MCP não estiver conectado** na sessão, avise logo no início — não invente que consultou. Como conectar:
   - **Claude Code local:** exporte a chave antes de abrir o Claude Code — `export TWENTYFIRST_API_KEY=21st_sk_...` — e o `.mcp.json` do projeto usa ela. Confira com `claude mcp list`. Alternativa: `/plugin marketplace add 21st-dev/claude-code-plugin` e `/plugin install 21st@21st`.
   - **claude.ai / sessões na nuvem:** Configurações → Conectores → *Add custom connector* → nome `21st`, URL `https://21st.dev/api/mcp`, entrar com OAuth; depois abrir uma sessão nova. A rede do ambiente também precisa liberar `21st.dev`.
   - **Nunca** grave a chave `21st_sk_…` em arquivo do repositório: ele é público.

## Armadilhas já encontradas (não repetir)

- **Nomes de classe que colidem com utilitários do Tailwind.** `.ring` desenhava uma borda branca de 1px em volta do anel de progresso (é o utilitário `ring` do Tailwind). Antes de criar uma classe CSS, confira se o nome não é um utilitário (`ring`, `shadow`, `border`, `grow`, `blur`, `container`…).
- **`background-clip: text` + `filter` no mesmo elemento** some no Chrome. O título dourado tem o gradiente nas letras e o `drop-shadow` no `<h1>` pai.
- **Preferências do `localStorage` na primeira renderização** causam erro de hidratação (React #418). Tudo que vem do navegador passa por `useHydrated()` em `components/holmes-app.tsx`.
- **Classe de texto não é o mesmo que verificar.** Mudança visível se confere no navegador (Playwright em `/opt/pw-browsers`), lendo a captura — typecheck, lint e build passaram nos três bugs acima.

## Comandos

```bash
npm run dev     # http://localhost:3000
npx tsc --noEmit && npm run lint && npm run build
```
