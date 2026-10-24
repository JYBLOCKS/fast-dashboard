# Fast Dashboard

Local Kanban application for managing tasks, boards, and acceptance criteria. The frontend uses React, TypeScript, Vite, Tailwind, and Zustand; the backend is a Node.js HTTP API with JSON persistence.

## Requirements

- Node.js 20+ and npm
- Docker 20+ (optional)

## Development

```bash
npm ci
npm run dev
```

Vite serves the frontend at `http://localhost:5173` and proxies `/api` to the local server. For a production build and local server, run `npm start`; the server is available at `http://localhost:3000`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite development mode |
| `npm run build` | Type-check and build into `dist/` |
| `npm test` | Run integrated server tests |
| `npm run coverage` | Generate text and HTML coverage in `coverage/` |
| `npm run coverage:check` | Run coverage with the configured threshold |
| `npm start` | Build and start the server on port 3000 |

## Architecture

- `src/App.tsx`: Kanban interface, dialogs, and criterion formatting.
- `src/store.ts`: Zustand state, normalization, and `localStorage` persistence.
- `src/config.ts` and `src/types.ts`: configuration and types.
- `server.js`: HTTP API, compiled files, and JSON persistence.
- `data/tasks.json` and `data/boards.json`: local server storage and seed data.
- `test/server.test.js`: API and dashboard delivery tests.

The frontend stores local changes in `localStorage`; the server stores API changes in `data/`. Mount a volume for those files in deployments. Text entered or edited by users is intentionally not translated or modified.

## API

All responses are JSON. Routes include `GET /api/tasks`, `POST /api/tasks`, `PATCH` and `DELETE /api/tasks/:id`, `PATCH /api/tasks/:id/status`, acceptance-criteria CRUD routes, and board CRUD routes under `/api/boards`.

Built-in statuses are `backlog`, `todo`, `in_progress`, `done`, and `hold`. User-created boards can also become valid statuses.

## Criterion formatting

The editor preserves the current selection and supports `**text**` (bold), `__text__` (underline), and `__{#rrggbb}text__` (underline color). Formatting applies only to selected text and is escaped before rendering.

## Docker

```bash
docker build -t fast-dashboard .
docker run --rm -p 3000:3000 fast-dashboard
```

The image includes a `HEALTHCHECK` for `/healthz`. To persist data, mount `"$PWD/data:/app/data"`.

## CI, tests, and coverage

`.github/workflows/ci.yml` runs on every push and pull request: `npm ci`, coverage tests, the TypeScript/Vite build, a Docker build, and an HTTP smoke test against `/healthz`. The current suite is below the configured coverage threshold, so CI currently runs reporting without blocking deliveries. The React UI needs a future browser test suite for interaction coverage.

## Operations and security

- No secrets or credentials are committed.
- Use `npm ci` in CI and Docker.
- JSON request bodies are limited to 1 MiB.
- The API has no authentication or multi-user support; protect it behind a private network or authenticated gateway before public exposure.
