# Fast Dashboard

Aplicación Kanban local para gestionar tareas, tableros y criterios de aceptación. El frontend usa React, TypeScript, Vite, Tailwind y Zustand; el backend es una API HTTP Node.js con persistencia JSON.

## Requisitos

- Node.js 20+ y npm
- Docker 20+ (opcional)

## Desarrollo

```bash
npm ci
npm run dev
```

Vite sirve el frontend en `http://localhost:5173` y redirige `/api` al servidor local. Para ejecutar la compilación de producción:

```bash
npm start
# http://localhost:3000
```

## Scripts

| Comando | Propósito |
|---|---|
| `npm run dev` | Desarrollo con Vite |
| `npm run build` | Type-check y build en `dist/` |
| `npm test` | Tests integrados del servidor |
| `npm run coverage` | Reporte textual y HTML en `coverage/` |
| `npm run coverage:check` | Cobertura con umbral 100% configurado |
| `npm start` | Compila y ejecuta el servidor en el puerto 3000 |

## Arquitectura

- `src/App.tsx`: interfaz Kanban, diálogos y formato de criterios.
- `src/store.ts`: estado Zustand, normalización y `localStorage`.
- `src/config.ts` y `src/types.ts`: configuración y tipos.
- `server.js`: API HTTP, archivos compilados y persistencia JSON.
- `data/tasks.json` y `data/boards.json`: almacenamiento local.
- `test/server.test.js`: pruebas de API y entrega del dashboard.

El frontend guarda cambios locales en `localStorage`; el servidor guarda cambios de API en `data/`. En despliegues reales monta un volumen para conservar esos archivos.

## API

Todas las respuestas son JSON.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/tasks` | Lista tareas y normaliza criterios |
| POST | `/api/tasks` | Crea una tarea |
| PATCH/DELETE | `/api/tasks/:id` | Actualiza o elimina una tarea |
| PATCH | `/api/tasks/:id/status` | Cambia el estado |
| GET/POST | `/api/tasks/:id/acceptance-criteria` | Lista o añade criterios |
| PATCH/DELETE | `/api/tasks/:id/acceptance-criteria/:criterionId` | Modifica o elimina criterios |
| GET/POST | `/api/boards` | Lista o crea tableros |
| PATCH/DELETE | `/api/boards/:id` | Modifica o elimina tableros |

```bash
curl http://localhost:3000/api/tasks
curl -X PATCH http://localhost:3000/api/tasks/task-001/status \
  -H 'content-type: application/json' -d '{"status":"done"}'
```

Estados integrados: `backlog`, `todo`, `in_progress`, `done` y `hold`. Los tableros creados también pueden ser estados válidos.

## Formato de criterios

El editor conserva la selección actual y permite aplicar `**texto**` (negrita), `__texto__` (subrayado) y `__{#rrggbb}texto__` (color del subrayado). El formato solo afecta el texto seleccionado y se escapa antes de renderizarse.

## Docker

```bash
docker build -t fast-dashboard .
docker run --rm -p 3000:3000 fast-dashboard
```

La imagen compila en una etapa de build, ejecuta Node Alpine y contiene un `HEALTHCHECK` contra `/healthz`. Para persistir datos:

```bash
docker run --rm -p 3000:3000 -v "$PWD/data:/app/data" fast-dashboard
```

## CI, tests y coverage

`.github/workflows/ci.yml` ejecuta en cada push y pull request: `npm ci`, tests con reporte de coverage, build TypeScript/Vite, build Docker y smoke test HTTP contra `/healthz`. `coverage:check` está preparado para exigir 100% de líneas, funciones, ramas y statements del alcance instrumentado (`server.js`), pero la suite actual todavía reporta 59.52% de statements, 52.83% de ramas, 72.72% de funciones y 59.52% de líneas; por eso CI usa temporalmente `coverage` y no bloquea entregas. La UI React requiere una futura suite de navegador (por ejemplo Playwright) para cobertura de interacción.

## Operación y seguridad

- No hay secretos ni credenciales en el repositorio.
- Usa `npm ci` en CI y Docker.
- Los cuerpos JSON están limitados a 1 MiB.
- La API no tiene autenticación ni multiusuario: protégela detrás de una red privada o gateway autenticado antes de exponerla públicamente.
