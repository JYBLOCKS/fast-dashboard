import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, "data");
const allowedFiles = new Set(["tasks.json", "boards.json", "preferences.json"]);
const port = Number(process.env.API_PORT || process.env.PORT || 3030);
const host = process.env.HOST || "0.0.0.0";
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
const maxBodyBytes = 2 * 1024 * 1024;
const writeQueues = new Map();

const json = (response, status, value) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": corsOrigin, "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" });
  response.end(JSON.stringify(value));
};

const serveStatic = async (request, response) => {
  const requested = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const file = normalize(join(root, "dist" + requested));
  const base = join(root, "dist");
  const relativePath = relative(base, file);
  if (relativePath.startsWith("..") || relativePath.includes(".." + normalize("/")) || !existsSync(file)) return false;
  const content = await readFile(file);
  const type = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "application/octet-stream";
  response.writeHead(200, { "content-type": type });
  response.end(content);
  return true;
};

const readBody = async (request) => { let body = ""; for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > maxBodyBytes) { const error = new Error("Request body too large"); error.statusCode = 413; throw error; } } return body; };
const atomicWrite = (file, value) => { const previous = writeQueues.get(file) || Promise.resolve(); const current = previous.catch(() => {}).then(async () => { const temporary = `${file}.${process.pid}.${Date.now()}.tmp`; try { await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8"); await rename(temporary, file); } finally { await unlink(temporary).catch(() => {}); } }); writeQueues.set(file, current); return current; };

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") return json(response, 204, null);
    response.setHeader("access-control-allow-origin", corsOrigin);
    response.setHeader("access-control-allow-methods", "GET,PUT,OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    if (request.method === "OPTIONS") return response.end();
    const url = new URL(request.url, "http://localhost");
    const match = url.pathname.match(/^\/api\/data\/([^/]+)$/);
    if (match) {
      const filename = decodeURIComponent(match[1]);
      if (!allowedFiles.has(filename)) return json(response, 404, { error: "Unknown data file" });
      const file = join(dataDir, filename);
      if (request.method === "GET") return json(response, 200, JSON.parse(await readFile(file, "utf8")));
      if (request.method === "PUT") {
        const body = await readBody(request);
        const value = JSON.parse(body);
        await mkdir(dataDir, { recursive: true });
        await atomicWrite(file, value);
        return json(response, 200, value);
      }
      return json(response, 405, { error: "Method not allowed" });
    }
    if (!(await serveStatic(request, response))) json(response, 404, { error: "Not found" });
  } catch (error) {
    json(response, error?.statusCode || (error instanceof SyntaxError ? 400 : 500), { error: error instanceof Error ? error.message : "Server error" });
  }
});

server.on("error", (error) => { console.error(`Unable to bind ${host}:${port}:`, error.message); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Fast Dashboard server listening on http://${host}:${port}`));
