# Fast Dashboard

Local Kanban application for managing tasks, boards, and acceptance criteria. The app uses React, TypeScript, Vite, Tailwind, and Zustand, with browser `localStorage` persistence.

## Requirements

- Node.js 20+ and npm

## Development

```bash
npm ci
npm run dev
```

Vite serves the frontend at `http://localhost:5173`. Run `npm run build` to create a production bundle, then `npm start` to preview it locally.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite development mode |
| `npm run build` | Type-check and build into `dist/` |
| `npm test` | Type-check and build the application |
| `npm start` | Preview the production build |

## Architecture

- `src/App.tsx`: Kanban interface, dialogs, and criterion formatting.
- `src/store.ts`: Zustand state, normalization, and `localStorage` persistence.
- `src/config.ts` and `src/types.ts`: configuration and types.
- `data/tasks.json` and `data/boards.json`: seed data bundled into the frontend.

The app stores task and board changes in the browser's `localStorage`. Text entered or edited by users is intentionally not translated or modified.

Built-in statuses are `backlog`, `todo`, `in_progress`, `done`, and `hold`. User-created boards can also become valid statuses.

## Criterion formatting

The editor preserves the current selection and supports `**text**` (bold), `__text__` (underline), and `__{#rrggbb}text__` (underline color). Formatting applies only to selected text and is escaped before rendering.

## CI and tests

`.github/workflows/ci.yml` runs on every push and pull request: `npm ci`, the TypeScript/Vite build, and a production preview smoke test.

## Operations and security

- No secrets or credentials are committed.
- Use `npm ci` in CI.
- Data is stored per browser profile and is not synchronized between users or devices.
