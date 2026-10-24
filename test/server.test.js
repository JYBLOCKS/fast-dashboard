import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {server} from '../server.js';

function request(method, url, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {method, headers: {'content-type': 'application/json'}}, res => {
      let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => resolve({status: res.statusCode, body: JSON.parse(text)}));
    }); req.on('error', reject); if (data) req.write(JSON.stringify(data)); req.end();
  });
}

test.before(() => new Promise(resolve => server.listen(0, resolve)));
test.after(() => new Promise(resolve => server.close(resolve)));
test('lists tasks and updates a task status', async () => {
  const address = server.address(); const base = `http://127.0.0.1:${address.port}`;
  const listed = await request('GET', `${base}/api/tasks`);
  assert.equal(listed.status, 200); assert.ok(Array.isArray(listed.body));
  const updated = await request('PATCH', `${base}/api/tasks/task-003/status`, {status: 'hold'});
  assert.equal(updated.status, 200); assert.equal(updated.body.status, 'hold');
  const invalid = await request('PATCH', `${base}/api/tasks/task-003/status`, {status: 'invalid'});
  assert.equal(invalid.status, 400);
  await request('PATCH', `${base}/api/tasks/task-003/status`, {status: 'todo'});
});

test('serves the dashboard', async () => {
  const address = server.address();
  const response = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${address.port}/`, res => {
      let text = '';
      res.on('data', chunk => text += chunk);
      res.on('end', () => resolve({status: res.statusCode, text}));
    }).on('error', reject);
  });
  assert.equal(response.status, 200);
  assert.match(response.text, /id="board"/);
});

test('reports health', async () => {
  const address = server.address();
  const response = await request('GET', `http://127.0.0.1:${address.port}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {status: 'ok', service: 'fast-dashboard'});
});
