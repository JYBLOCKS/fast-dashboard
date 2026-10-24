import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = path.join(__dirname, 'data', 'tasks.json');
const BOARDS_FILE = path.join(__dirname, 'data', 'boards.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(__dirname, 'dist');
const DEFAULT_STATUSES = new Set(['backlog', 'todo', 'in_progress', 'done', 'hold']);
function criteriaFor(task) {
  const values = Array.isArray(task.acceptance_criteria) ? task.acceptance_criteria : (task.acceptance_criteria ? [task.acceptance_criteria] : []);
  return values.flatMap((value, index) => {
    if (typeof value === 'string') return value.trim() ? [{id: `criterion-${index + 1}`, text: value.trim(), completed: false}] : [];
    if (!value || typeof value !== 'object' || !String(value.text || '').trim()) return [];
    return [{id: String(value.id || `criterion-${index + 1}`), text: String(value.text).trim(), completed: Boolean(value.completed)}];
  });
}
function criterionInput(input) {
  const value = typeof input === 'string' ? {text: input} : input;
  if (!value || typeof value.text !== 'string' || !value.text.trim()) return null;
  return {text: value.text.trim(), completed: Boolean(value.completed)};
}

async function readTasks() {
  const value = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  if (!Array.isArray(value)) throw new Error('Task data must be an array');
  return value;
}

async function writeTasks(tasks) {
  const temp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(tasks, null, 2)}\n`, 'utf8');
  await fs.rename(temp, DATA_FILE);
}

async function readBoards() {
  try { const value = JSON.parse(await fs.readFile(BOARDS_FILE, 'utf8')); if (!Array.isArray(value)) throw new Error('Board data must be an array'); return value; }
  catch (error) { if (error.code !== 'ENOENT') throw error; return []; }
}
async function writeBoards(boards) { await fs.writeFile(BOARDS_FILE, JSON.stringify(boards, null, 2) + '\n', 'utf8'); }
async function validStatuses() { return new Set([...DEFAULT_STATUSES, ...(await readBoards()).map(board => String(board.board_id))]); }
function boardView(board, tasks) { return {...board, tasks: tasks.filter(task => String(task.board_id || task.status || '') === String(board.board_id))}; }

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8'});
  res.end(payload);
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (raw.length > 1024 * 1024) throw Object.assign(new Error('Payload too large'), {status: 413});
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('Invalid JSON'), {status: 400}); }
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return sendJson(res, 200, {status: 'ok', service: 'fast-dashboard'});
  }
  const boardMatch = url.pathname.match(/^\/api\/boards(?:\/([^/]+))?$/);
  if (boardMatch) {
    const boardId = boardMatch[1] === undefined ? undefined : decodeURIComponent(boardMatch[1]);
    const boards = await readBoards(); const tasks = await readTasks();
    if (req.method === 'GET') { if (boardId === undefined) return sendJson(res, 200, boards.map(board => boardView(board, tasks))); const board = boards.find(item => String(item.board_id) === boardId); return board ? sendJson(res, 200, boardView(board, tasks)) : sendJson(res, 404, {error: 'Board not found'}); }
    if (req.method === 'POST' && boardId === undefined) { const input = await body(req); if (!input.board_id || typeof input.name !== 'string' || !input.name.trim()) return sendJson(res, 400, {error: 'board_id and name are required'}); if (boards.some(item => String(item.board_id) === String(input.board_id))) return sendJson(res, 409, {error: 'Board id already exists'}); const board = {board_id: String(input.board_id), name: input.name.trim(), description: String(input.description || ''), accent: typeof input.accent === 'string' ? input.accent : '#9aa3ad'}; boards.push(board); await writeBoards(boards); return sendJson(res, 201, boardView(board, tasks)); }
    if ((req.method === 'PATCH' || req.method === 'DELETE') && boardId !== undefined) { const index = boards.findIndex(item => String(item.board_id) === boardId); if (index < 0) return sendJson(res, 404, {error: 'Board not found'}); if (req.method === 'DELETE') { const [deleted] = boards.splice(index, 1); await writeBoards(boards); return sendJson(res, 200, {...deleted, tasksPreserved: true}); } const input = await body(req); if (input.board_id !== undefined && String(input.board_id) !== boardId) return sendJson(res, 400, {error: 'board_id cannot be changed'}); if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) return sendJson(res, 400, {error: 'name is required'}); boards[index] = {...boards[index], ...(input.name === undefined ? {} : {name: input.name.trim()}), ...(input.description === undefined ? {} : {description: String(input.description)}), ...((input.color ?? input.accent) === undefined ? {} : {color: String(input.color ?? input.accent), accent: String(input.color ?? input.accent)})}; await writeBoards(boards); return sendJson(res, 200, boardView(boards[index], tasks)); }
    return sendJson(res, 405, {error: 'Method not allowed'});
  }
  if (req.method === 'GET' && url.pathname === '/api/tasks') {
    const tasks = await readTasks();
    return sendJson(res, 200, tasks.map(task => ({...task, acceptance_criteria: criteriaFor(task)})));
  }
  if (req.method === 'POST' && url.pathname === '/api/tasks') {
    const input = await body(req);
    if (!input.task_id || !input.name || !(await validStatuses()).has(input.status || 'backlog'))
      return sendJson(res, 400, {error: 'task_id, name and a valid status are required'});
    const tasks = await readTasks();
    if (tasks.some(item => String(item.task_id) === String(input.task_id))) return sendJson(res, 409, {error: 'Task id already exists'});
    const task = {task_id: String(input.task_id), name: String(input.name), description: String(input.description || ''), acceptance_criteria: criteriaFor({acceptance_criteria: input.acceptance_criteria}), status: input.status || 'backlog'};
    if (input.board_id !== undefined) task.board_id = String(input.board_id);
    tasks.push(task); await writeTasks(tasks); return sendJson(res, 201, task);
  }
  const criteriaMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/acceptance-criteria(?:\/([^/]+))?$/);
  if (criteriaMatch) {
    const taskId = decodeURIComponent(criteriaMatch[1]);
    const tasks = await readTasks(); const task = tasks.find(item => String(item.task_id) === taskId);
    if (!task) return sendJson(res, 404, {error: 'Task not found'});
    const criteria = criteriaFor(task); const criterionId = criteriaMatch[2] === undefined ? undefined : decodeURIComponent(criteriaMatch[2]);
    if (req.method === 'GET') { if (criterionId === undefined) return sendJson(res, 200, criteria); const criterion = criteria.find(item => item.id === criterionId); return criterion ? sendJson(res, 200, criterion) : sendJson(res, 404, {error: 'Acceptance criterion not found'}); }
    if (req.method === 'POST' && criterionId === undefined) {
      const input = criterionInput(await body(req)); if (!input) return sendJson(res, 400, {error: 'text is required'});
      const used = new Set(criteria.map(item => item.id)); let number = criteria.length + 1; let id = `criterion-${number}`; while (used.has(id)) id = `criterion-${++number}`;
      const created = {id, ...input}; task.acceptance_criteria = [...criteria, created]; await writeTasks(tasks); return sendJson(res, 201, created);
    }
    if ((req.method === 'PATCH' || req.method === 'DELETE') && criterionId !== undefined) {
      const index = criteria.findIndex(item => item.id === criterionId); if (index < 0) return sendJson(res, 404, {error: 'Acceptance criterion not found'});
      if (req.method === 'DELETE') { const [deleted] = criteria.splice(index, 1); task.acceptance_criteria = criteria; await writeTasks(tasks); return sendJson(res, 200, deleted); }
      const updated = criterionInput({...criteria[index], ...(await body(req))}); if (!updated) return sendJson(res, 400, {error: 'text is required'});
      criteria[index] = {id: criterionId, ...updated}; task.acceptance_criteria = criteria; await writeTasks(tasks); return sendJson(res, 200, criteria[index]);
    }
    return sendJson(res, 405, {error: 'Method not allowed'});
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if ((req.method === 'PATCH' || req.method === 'DELETE') && taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    const tasks = await readTasks(); const index = tasks.findIndex(item => String(item.task_id) === taskId);
    if (index < 0) return sendJson(res, 404, {error: 'Task not found'});
    if (req.method === 'DELETE') { const [deleted] = tasks.splice(index, 1); await writeTasks(tasks); return sendJson(res, 200, deleted); }
    const input = await body(req); const current = tasks[index];
    if (input.status !== undefined && !(await validStatuses()).has(input.status)) return sendJson(res, 400, {error: 'Invalid status'});
    tasks[index] = {...current, ...input, task_id: current.task_id, acceptance_criteria: input.acceptance_criteria === undefined ? criteriaFor(current) : criteriaFor({acceptance_criteria: input.acceptance_criteria})};
    await writeTasks(tasks); return sendJson(res, 200, tasks[index]);
  }
  const match = url.pathname.match(/^\/api\/tasks\/([^/]+)\/status$/);
  if (req.method === 'PATCH' && match) {
    const input = await body(req);
    if (typeof input.status !== 'string' || !(await validStatuses()).has(input.status))
      return sendJson(res, 400, {error: 'status must be a configured board'});
    const tasks = await readTasks();
    const task = tasks.find(item => item.task_id === decodeURIComponent(match[1]));
    if (!task) return sendJson(res, 404, {error: 'Task not found'});
    task.status = input.status;
    await writeTasks(tasks);
    return sendJson(res, 200, task);
  }
  if (req.method === 'GET') {
    try {
      const distEntry = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const distPath = path.resolve(DIST_DIR, distEntry);
      if (distPath.startsWith(`${DIST_DIR}${path.sep}`) || distPath === path.join(DIST_DIR, 'index.html')) {
        const payload = await fs.readFile(distPath);
        const ext = path.extname(distPath);
        const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
        res.writeHead(200, {'content-type': types[ext] || 'application/octet-stream', 'x-content-type-options':'nosniff'});
        return res.end(payload);
      }
    } catch {}
    const staticFiles = {
      '/': ['index.html', 'text/html; charset=utf-8'],
      '/index.html': ['index.html', 'text/html; charset=utf-8'],
      '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
      '/overrides.css': ['overrides.css', 'text/css; charset=utf-8'],
      '/palette.css': ['palette.css', 'text/css; charset=utf-8'],
      '/icon-buttons.css': ['icon-buttons.css', 'text/css; charset=utf-8'],
      '/layout.css': ['layout.css', 'text/css; charset=utf-8'],
      '/sidebar.css': ['sidebar.css', 'text/css; charset=utf-8'],
      '/app.js': ['app.js', 'text/javascript; charset=utf-8']
    };
    const file = staticFiles[url.pathname];
    if (file) {
      const payload = await fs.readFile(path.join(PUBLIC_DIR, file[0]));
      res.writeHead(200, {'content-type': file[1], 'x-content-type-options': 'nosniff'});
      return res.end(payload);
    }
  }
  return sendJson(res, 404, {error: 'Not found'});
}

const server = http.createServer((req, res) => {
  handler(req, res).catch(error => sendJson(res, error.status || 500, {error: error.message}));
});

if (process.argv[1] === __filename) server.listen(PORT, HOST, () => console.log(`Task API listening on ${HOST}:${PORT}`));
export {server, handler, readTasks, writeTasks, DEFAULT_STATUSES};
