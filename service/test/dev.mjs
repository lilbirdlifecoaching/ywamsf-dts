// Local admin service for trying the admin page: node test/dev.mjs (from service/), then open the admin page with <meta name="admin-service" content="http://127.0.0.1:8787">.
import { Miniflare } from 'miniflare';
import http from 'node:http'; import fs from 'node:fs'; import crypto from 'node:crypto';
const REPO = '..';  // run from service/: node test/dev.mjs
const files = new Map(), commits = [], mails = [];
const sha = () => crypto.randomBytes(20).toString('hex');
for (const f of fs.readdirSync(REPO + '/content')) if (f.endsWith('.json')) { const b = fs.readFileSync(REPO + '/content/' + f).toString('base64'), s = sha(); files.set('content/' + f, { sha: s, b64: b }); commits.push({ sha: s, path: 'content/' + f, message: 'Earlier version', author: 'Luke', b64: b }); }
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const send = (st, o) => { res.writeHead(st, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(o)); };
  const u = new URL(req.url, 'http://x'); let m;
  if (u.pathname === '/emails') { mails.push(JSON.parse(body)); return send(200, {}); }
  if (u.pathname === '/_mails') return send(200, mails);
  if ((m = /^\/repos\/o\/r\/contents\/(.+)$/.exec(u.pathname))) {
    const path = decodeURIComponent(m[1]), ref = u.searchParams.get('ref');
    if (req.method === 'GET') { if (ref && ref.length === 40) { const c = commits.find(x => x.sha === ref && x.path === path); return c ? send(200, { sha: c.sha, content: c.b64, encoding: 'base64' }) : send(404, { message: 'Not Found' }); } const f = files.get(path); return f ? send(200, { sha: f.sha, content: f.b64, encoding: 'base64' }) : send(404, { message: 'Not Found' }); }
    const b = JSON.parse(body), f = files.get(path); if (f && b.sha !== f.sha) return send(409, { message: 'conflict' });
    const s = sha(); files.set(path, { sha: s, b64: b.content }); commits.unshift({ sha: s, path, message: b.message, author: b.author && b.author.name, b64: b.content }); return send(200, { content: { sha: s } });
  }
  if (u.pathname === '/repos/o/r/commits') { const p = u.searchParams.get('path'); return send(200, commits.filter(c => c.path === p).map(c => ({ sha: c.sha, commit: { message: c.message, author: { name: c.author, date: new Date().toISOString() } } }))); }
  if (u.pathname === '/repos/o/r/actions/runs') return send(200, { workflow_runs: [{ name: 'Build site', status: 'completed', conclusion: 'success', updated_at: new Date().toISOString() }] });
  send(404, {});
});
server.listen(8788, '127.0.0.1');
const mf = new Miniflare({ modules: true, scriptPath: 'src/index.js', compatibilityDate: '2024-11-01', d1Databases: ['DB'], port: 8787, host: '127.0.0.1',
  bindings: { REPO: 'o/r', BRANCH: 'main', ALLOWED_ORIGINS: 'http://127.0.0.1:8000', ADMIN_URL: 'http://127.0.0.1:8000/admin/', GITHUB_API: 'http://127.0.0.1:8788', RESEND_API: 'http://127.0.0.1:8788/emails', GITHUB_TOKEN: 't', RESEND_KEY: 'k', SETUP_KEY: 'local-setup-key' } });
await mf.ready;
const db = await mf.getD1Database('DB');
for (const s of fs.readFileSync('schema.sql', 'utf8').replace(/--.*$/gm, '').split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(s).run();
console.log('service ready');
