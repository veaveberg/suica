import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import app from '../server/index.cjs';

test('local API rejects external origins and DNS rebinding hosts before any data access', async () => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        const local = await fetch(`${base}/api/not-a-table`);
        assert.equal(local.status, 400);
        assert.equal(local.headers.get('cache-control'), 'no-store');
        assert.equal(local.headers.get('x-powered-by'), null);
        for (const origin of ['https://evil.example', 'null', 'https://localhost.evil.example:5173', 'http://localhost:9999']) {
            const response = await fetch(`${base}/api/students`, { headers: { Origin: origin } });
            assert.equal(response.status, 403, origin);
            assert.equal(response.headers.get('access-control-allow-origin'), null);
        }
        const rebinding = await new Promise((resolve, reject) => {
            const req = request(`${base}/api/students`, { headers: { Host: 'evil.example:3001' } }, res => {
                res.resume();
                resolve(res.statusCode);
            });
            req.on('error', reject);
            req.end();
        });
        assert.equal(rebinding, 403);
        const write = await fetch(`${base}/api/students`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(write.status, 403);
        const crossSite = await fetch(`${base}/api/students`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
        assert.equal(crossSite.status, 403);
        const preview = await fetch(`${base}/api/not-a-table`, { headers: { Origin: 'https://localhost:5173' } });
        assert.equal(preview.status, 400);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});
