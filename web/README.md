# mtg-brain · web

App web do mtg-brain: React + TypeScript + Vite + Tailwind v4, com TanStack Query e React Router.
Visão geral do projeto, banco e API: [README da raiz](../README.md).

## Desenvolvimento

Precisa da API rodando em `localhost:8000` (o `vite.config.ts` encaminha `/api` pra ela).

```bash
npm install
npm run dev      # http://localhost:5173
```

## Checagens e build

```bash
npx tsc -b --noEmit
npm run lint
npm run build    # gera dist/, que a FastAPI serve em produção (com fallback de SPA)
```

## Rotas

- `/commanders` — comandantes (populares, por tema, cor, preço)
- `/cards` — busca de cartas por texto ou semântica
- `/decks` — lista de decks, criar e importar
- `/decks/:id` — um deck: lista/grade, análise, preços, versões e exportação
