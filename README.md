# Fast Dashboard

Local Kanban application for managing tasks, boards, and acceptance criteria. The app uses React, TypeScript, Vite, Tailwind, and Zustand, with JSON persistence in the `data/` folder.

## Requirements

- Node.js 20+ and pnpm 12+

## Development

```bash
pnpm install
pnpm dev
```

`pnpm dev` starts React/Vite at `http://localhost:3000` and the JSON API at `http://localhost:3030`. Vite proxies `/api` requests to the API. UI changes are written to `data/tasks.json`, `data/boards.json`, and `data/preferences.json`.

To run the development stack in Docker, use `docker compose up --build`; it exposes the same ports (`3000` for React and `3030` for the API) and mounts `data/` for persistence.

If Vite reports that a Rolldown native binding is missing after changing Node versions or package managers, rebuild the optional platform dependency:

```bash
pnpm install --force
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start React on `3000` and the JSON API on `3030` |
| `pnpm build` | Type-check and build into `dist/` |
| `pnpm test` | Type-check and build the application |
| `pnpm start` | Preview the production build |

## Architecture

- `src/App.tsx`: Kanban interface, dialogs, and criterion formatting.
- `src/store.ts`: Zustand state, normalization, and task JSON API persistence.
- `src/dataApi.ts`: JSON API client used by the UI.
- `server.mjs`: local HTTP server for the JSON API on port `3030`.
- `scripts/dev.mjs`: starts the API and Vite together during development.
- `Dockerfile`, `docker-compose.yml`: containerized API and React development stack.
- `src/config.ts` and `src/types.ts`: configuration and types.
- `data/tasks.json`, `data/boards.json`, and `data/preferences.json`: application data persisted by the server.

The app stores task, board, and sidebar-width changes in the JSON files under `data/`. Text entered or edited by users is intentionally not translated or modified.

Built-in statuses are `backlog`, `todo`, `in_progress`, `done`, and `hold`. User-created boards can also become valid statuses.

## Criterion formatting

The editor preserves the current selection and supports `**text**` (bold), `__text__` (underline), and `__{#rrggbb}text__` (underline color). Formatting applies only to selected text and is escaped before rendering.

## CI and tests

`.github/workflows/ci.yml` runs on every push and pull request: `npm ci`, the TypeScript/Vite build, and a production preview smoke test.

## Operations and security

- No secrets or credentials are committed.
- Use `npm ci` in CI.
- Data is stored per browser profile and is not synchronized between users or devices.
