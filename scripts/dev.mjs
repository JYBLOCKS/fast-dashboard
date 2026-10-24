import { spawn } from 'node:child_process';

const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const children = [
  spawn(process.execPath, ['server.mjs'], { stdio: 'inherit', env: { ...process.env, API_PORT: '3030' } }),
  spawn(packageManager, ['vite', '--host', '0.0.0.0', '--port', '3000'], { stdio: 'inherit' }),
];
const stop = (signal) => children.forEach((child) => child.kill(signal));
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
children.forEach((child) => child.on('exit', (code) => { if (code && code !== 0) process.exitCode = code; }));
