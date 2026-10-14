# Mr. Holmes — Localizador

Interface visual e interativa para localizar um nome de usuário em **~400 redes sociais ao mesmo tempo**, com resultados chegando ao vivo, cena 3D (globo holográfico, lupa de latão, pinos dourados por perfil encontrado) e estética vitoriana-futurista.

O motor de detecção é um **port em TypeScript do [Sherlock Project](https://github.com/sherlock-project/sherlock)** (MIT): mesma base de sites (`data.json`) e as mesmas três regras de verificação — código HTTP, mensagem de erro na página e redirecionamento.

> Use com responsabilidade: para verificar a sua própria pegada digital, escolher um nome de usuário livre, ou em investigações autorizadas.

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:3000
```

Produção: `npm run build && npm start`.

## O que existe

| Área | Onde |
|---|---|
| Página e orquestração | `components/holmes-app.tsx` |
| Cena 3D (Three.js + bloom) | `components/scene/holmes-scene.ts` |
| Busca ao vivo (SSE, um stream por suspeito) | `app/api/search/route.ts`, `lib/client/use-investigation.ts` |
| Motor (port do Sherlock) | `lib/sherlock/engine.ts` |
| Base de sites (ao vivo do GitHub, com cópia embutida de reserva) | `lib/sherlock/sites.ts`, `lib/sherlock/data.json` |
| Ajustes, casos arquivados, atalhos | `components/overlays.tsx`, `lib/client/storage.ts` |

- **Vários suspeitos** por caso (até 10), e `{?}` testa variações (`joao{?}silva` → `joao_silva`, `joao-silva`, `joao.silva`).
- **Filtros** Encontrados / Todos / Inconclusivos, busca por rede, ordenação.
- **Exportar** dossiê `.json`, planilha `.csv` ou só os links `.txt`; copiar/abrir todos os links.
- **Casos arquivados** no navegador (caso nº começa em 1887, o ano de *Um Estudo em Vermelho*).
- **Modo simulação** (Ajustes): resultados inventados, sem consultar rede — útil para conhecer a interface.
- **Som** discreto a cada perfil encontrado e acorde ao fechar o caso; **movimento reduzido** respeitado.

## Atalhos

`/` busca · `↵` investigar · `Esc` interromper/fechar · `N` novo caso · `1` `2` `3` filtros · `F` filtrar · `[` `]` suspeitos · `C` copiar links · `O` abrir todos · `E` exportar · `H` casos · `S` ajustes · `M` som · `G` girar o globo · `?` lista de atalhos

## Notas

- Cada suspeito é um request separado a `/api/search` (`maxDuration = 300`), então uma lista longa nunca estoura o tempo de uma função na Vercel.
- Alguns sites bloqueiam IPs de datacenter; esses aparecem como **Inconclusivo** em vez de virar falso positivo.
- Variáveis de ambiente: nenhuma.
