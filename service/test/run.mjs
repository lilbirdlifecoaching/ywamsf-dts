// End-to-end test of the admin service, run locally: `node test/run.mjs` (from service/).
// Uses Miniflare (a local Cloudflare) with a real D1 database, plus a fake GitHub and a fake email service.
import { Miniflare } from 'miniflare';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/* ---------- fake GitHub + Resend */
const files = new Map();          // path -> {sha, b64}
const commits = [];               // {sha, path, message, author, snapshot}
const mails = [];
const sha = (s) => crypto.createHash('sha1').update(s + Math.random()).digest('hex');
function seed(path, obj) { const b = Buffer.from(JSON.stringify(obj, null, 2)).toString('base64'); const s = sha(path); files.set(path, { sha: s, b64: b }); commits.push({ sha: s, path, message: 'seed', author: 'seed', b64: b }); }
seed('content/dts.json', { schools: [], cost_note: 'x' });
seed('content/faq.json', { questions: [{ question: 'Q', answer: 'A' }] });
seed('content/settings.json', { phone: '1', show_ellis_stories: false });
seed('content/resources.json', { groups: [] });
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const send = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/emails') { mails.push(JSON.parse(body)); return send(200, { id: 'm' }); }
  if (req.headers.authorization !== 'Bearer TEST-GH-TOKEN') return send(401, { message: 'Bad credentials' });
  let m;
  if ((m = /^\/repos\/o\/r\/contents\/(.+)$/.exec(u.pathname))) {
    const path = decodeURIComponent(m[1]);
    if (req.method === 'GET') {
      const ref = u.searchParams.get('ref');
      if (ref && /^[0-9a-f]{40}$/.test(ref)) { const c = commits.find((x) => x.sha === ref && x.path === path); return c ? send(200, { sha: c.sha, content: c.b64, encoding: 'base64' }) : send(404, { message: 'Not Found' }); }
      const f = files.get(path); return f ? send(200, { sha: f.sha, content: f.b64, encoding: 'base64', size: 1 }) : send(404, { message: 'Not Found' });
    }
    if (req.method === 'PUT') {
      const b = JSON.parse(body), f = files.get(path);
      if (f && b.sha !== f.sha) return send(409, { message: 'sha mismatch' });
      if (!f && b.sha) return send(422, { message: 'no such file' });
      const s = sha(path); files.set(path, { sha: s, b64: b.content });
      commits.unshift({ sha: s, path, message: b.message, author: b.author && b.author.name, authorEmail: b.author && b.author.email, b64: b.content });
      return send(200, { content: { sha: s } });
    }
  }
  if (u.pathname === '/repos/o/r/commits') { const p = u.searchParams.get('path'); return send(200, commits.filter((c) => c.path === p).map((c) => ({ sha: c.sha, commit: { message: c.message, author: { name: c.author, date: '2026-11-13T00:00:00Z' } } }))); }
  if (u.pathname === '/repos/o/r/actions/runs') return send(200, { workflow_runs: [{ name: 'Build site', status: 'completed', conclusion: 'success', updated_at: 'now' }] });
  send(404, { message: 'Not Found' });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

/* ---------- local Cloudflare */
const mf = new Miniflare({
  modules: true, scriptPath: 'src/index.js', compatibilityDate: '2024-11-01', d1Databases: ['DB'],
  bindings: { REPO: 'o/r', BRANCH: 'main', ALLOWED_ORIGINS: 'https://ywamembers.org', ADMIN_URL: 'https://ywamembers.org/admin/', GITHUB_API: base, RESEND_API: base + '/emails', GITHUB_TOKEN: 'TEST-GH-TOKEN', RESEND_KEY: 'TEST-RESEND', SETUP_KEY: 'setup-key-123456' }
});
const db = await mf.getD1Database('DB');
for (const stmt of fs.readFileSync('schema.sql', 'utf8').replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();

async function call(method, path, body, token, origin = 'https://ywamembers.org') {
  const h = { 'Content-Type': 'application/json', Origin: origin };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await mf.dispatchFetch('https://svc.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, ...d };
}
const linkFrom = (mail, kind) => new RegExp('#' + kind + '=([A-Za-z0-9_-]+)').exec(mail.text)[1];
const fileJson = (p) => JSON.parse(Buffer.from(files.get(p).b64, 'base64').toString());
let n = 0; const ok = (name) => console.log('  ✓ ' + name, ++n && '');

/* ---------- tests */
let r = await call('GET', '/health'); assert.equal(r.setup, true); ok('fresh service asks for setup');
r = await call('POST', '/setup', { setup_key: 'nope', email: 'luke@example.org', name: 'Luke', password: 'correct horse 1' }); assert.equal(r.status, 403); ok('setup refuses a wrong setup key');
r = await call('POST', '/setup', { setup_key: 'setup-key-123456', email: 'Luke@Example.org', name: 'Luke', password: 'short' }); assert.equal(r.status, 400); ok('setup refuses a short password');
r = await call('POST', '/setup', { setup_key: 'setup-key-123456', email: 'Luke@Example.org', name: 'Luke', password: 'correct horse 1' }); assert.equal(r.user.role, 'admin'); const admin = r.token; ok('first administrator created');
r = await call('POST', '/setup', { setup_key: 'setup-key-123456', email: 'x@example.org', name: 'X', password: 'correct horse 1' }); assert.equal(r.status, 403); ok('setup can’t run twice');
r = await call('GET', '/health', null, null, 'https://evil.example'); assert.equal(r.status, 403); ok('other websites are refused (CORS)');

r = await call('POST', '/auth/login', { email: 'luke@example.org', password: 'wrong password' }); assert.equal(r.status, 401); ok('wrong password refused');
r = await call('POST', '/auth/login', { email: 'LUKE@example.org', password: 'correct horse 1' }); assert.ok(r.token); ok('sign in (email is not case-sensitive)');
r = await call('GET', '/me'); assert.equal(r.status, 401); ok('no token → signed out');

// invites
r = await call('POST', '/users', { email: 'ange@example.org', name: 'Ange', role: 'editor' }, admin); assert.equal(r.user.active, false);
let mail = mails.at(-1); assert.deepEqual(mail.to, ['ange@example.org']); const inv = linkFrom(mail, 'invite'); ok('administrator invites an editor by email');
r = await call('POST', '/auth/invite-info', { token: inv }); assert.equal(r.roleName, 'Editor'); ok('invite link shows who it’s for');
r = await call('POST', '/auth/accept', { token: inv, password: 'ange password 1' }); const editor = r.token; assert.equal(r.user.role, 'editor'); ok('editor accepts and is signed in');
r = await call('POST', '/auth/accept', { token: inv, password: 'ange password 2' }); assert.equal(r.status, 400); ok('invite link works only once');
await call('POST', '/users', { email: 'sam@example.org', name: 'Sam', role: 'contributor' }, admin);
r = await call('POST', '/auth/accept', { token: linkFrom(mails.at(-1), 'invite'), password: 'sam password 1' }); const contrib = r.token; ok('contributor joins');
r = await call('POST', '/users', { email: 'x@example.org', name: 'X', role: 'admin' }, editor); assert.equal(r.status, 403); ok('editors can’t add people');
r = await call('POST', '/users', { email: 'ange@example.org', name: 'A2', role: 'editor' }, admin); assert.equal(r.status, 409); ok('no duplicate accounts');

// publishing
r = await call('PUT', '/content', { path: 'content/dts.json', content: JSON.stringify({ schools: [{ start: '2027-01-18' }] }), summary: 'DTS schools', base_sha: files.get('content/dts.json').sha }, admin);
assert.equal(r.published, true); assert.match(commits[0].message, /^DTS schools: updated by Luke \(site admin\)$/); assert.equal(commits[0].authorEmail, 'site-admin@ywamsanfrancisco.org'); ok('administrator publishes; people’s own emails never go to GitHub');
r = await call('PUT', '/content', { path: 'content/dts.json', content: '{}', summary: 'x', base_sha: 'stale' }, admin); assert.equal(r.status, 409); ok('stale edit is refused instead of overwriting someone else');
const before = mails.length;
r = await call('PUT', '/content', { path: 'content/faq.json', content: JSON.stringify({ questions: [] }), summary: 'DTS FAQ' }, editor); assert.equal(r.published, true);
assert.ok(mails.slice(before).some((m) => m.to.includes('luke@example.org') && /Published: DTS FAQ/.test(m.subject))); ok('editor publishes copy without approval; administrators are emailed');
r = await call('PUT', '/content', { path: 'content/settings.json', content: JSON.stringify({ phone: '2', show_ellis_stories: false }), summary: 'Settings' }, editor); assert.equal(r.published, true); ok('editor can change settings');
r = await call('PUT', '/content', { path: 'content/settings.json', content: JSON.stringify({ phone: '2', show_ellis_stories: true }), summary: 'Show stories' }, editor); assert.equal(r.published, false); assert.match(r.reviewers, /administrator/); ok('editor turning a section on/off needs an administrator');
for (const bad of ['admin/keys.json', 'content/../admin/keys.json', 'content/comments/x.json', '.github/workflows/build.yml', 'content/Settings.JSON']) { r = await call('PUT', '/content', { path: bad, content: '{}' }, admin); assert.equal(r.status, 400, bad); }
ok('only website content files can be changed (not keys, workflows or comments)');
r = await call('PUT', '/content', { path: 'content/faq.json', content: '{not json' }, admin); assert.equal(r.status, 400); ok('broken content is refused');

// contributor → editor approval (resources)
const m0 = mails.length;
r = await call('PUT', '/content', { path: 'content/resources.json', content: JSON.stringify({ groups: [{ title: 'New' }] }), summary: 'Resources' }, contrib); assert.equal(r.published, false); assert.match(r.reviewers, /editor/);
assert.ok(mails.slice(m0).some((m) => m.to.includes('ange@example.org') && /Waiting for your approval/.test(m.subject))); ok('contributor’s resource change waits; editors are emailed');
r = await call('GET', '/content?path=content/resources.json', null, contrib); assert.ok(r.pending); ok('contributor sees their own waiting version');
r = await call('GET', '/changes', null, editor); const resChange = r.changes.find((c) => c.path === 'content/resources.json' && c.status === 'pending'); assert.ok(resChange); ok('editor sees it in the approval queue');
r = await call('POST', `/changes/${resChange.id}/approve`, {}, editor); assert.equal(r.ok, true); assert.match(commits[0].message, /updated by Sam, approved by Ange/);
assert.match(mails.at(-1).subject, /^Approved/); assert.deepEqual(mails.at(-1).to, ['sam@example.org']); ok('editor approves; it goes live credited to both; contributor is emailed');

// contributor → admin approval (page copy), send back, resubmit, conflict
r = await call('PUT', '/content', { path: 'content/faq.json', content: JSON.stringify({ questions: [{ question: 'New Q', answer: '' }] }), summary: 'DTS FAQ' }, contrib); const cid = r.change;
r = await call('POST', `/changes/${cid}/approve`, {}, editor); assert.equal(r.status, 403); ok('editors can’t approve page copy (administrators only)');
r = await call('POST', `/changes/${cid}/send-back`, { note: '' }, admin); assert.equal(r.status, 400); ok('sending back needs a note');
r = await call('POST', `/changes/${cid}/send-back`, { note: 'Please add an answer.' }, admin); assert.equal(r.ok, true); assert.match(mails.at(-1).text, /Please add an answer/); ok('administrator sends it back; contributor gets the note by email');
r = await call('GET', '/me', null, contrib); assert.equal(r.waiting.sent_back, 1); ok('contributor’s dashboard shows it was sent back');
r = await call('PUT', '/content', { path: 'content/faq.json', content: JSON.stringify({ questions: [{ question: 'New Q', answer: 'Yes' }] }), summary: 'DTS FAQ' }, contrib); assert.equal(r.change, cid); ok('resubmitting reuses the same change');
await call('PUT', '/content', { path: 'content/faq.json', content: JSON.stringify({ questions: [{ question: 'Other', answer: 'edit' }] }), summary: 'DTS FAQ' }, editor);
r = await call('POST', `/changes/${cid}/approve`, {}, admin); assert.equal(r.status, 409); ok('approving warns if the page changed since it was submitted');
r = await call('POST', `/changes/${cid}/approve`, { force: true }, admin); assert.equal(r.ok, true); assert.equal(fileJson('content/faq.json').questions[0].answer, 'Yes'); ok('… and can be approved anyway');
r = await call('GET', '/me', null, admin); assert.equal(r.waiting.changes, 1); ok('administrator’s dashboard counts what’s waiting (the switch change)');

// photos
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5bd0000000049454e44ae426082', 'hex').toString('base64');
r = await call('POST', '/upload', { name: 'Team Photo.PNG', data: png }, contrib); assert.equal(r.path, 'uploads/team-photo.png'); ok('photo upload (name cleaned up)');
r = await call('POST', '/upload', { name: 'evil.png', data: Buffer.from('<svg onload=alert(1)>').toString('base64') }, contrib); assert.equal(r.status, 400); ok('a non-photo pretending to be a photo is refused');
r = await call('POST', '/upload', { name: 'x.svg', data: png }, admin); assert.equal(r.status, 400); ok('only JPG, PNG, WebP');

// forgot password
const m1 = mails.length;
r = await call('POST', '/auth/forgot', { email: 'nobody@example.org' }); assert.equal(r.ok, true); assert.equal(mails.length, m1); ok('unknown email: same answer, no email (doesn’t reveal who has access)');
r = await call('POST', '/auth/forgot', { email: 'ange@example.org' }); const rt = linkFrom(mails.at(-1), 'reset'); ok('“Forgot password?” emails a reset link');
r = await call('POST', '/auth/reset', { token: rt, password: 'brand new pass 9' }); assert.ok(r.token); ok('new password set from the link');
r = await call('GET', '/me', null, editor); assert.equal(r.status, 401); ok('resetting signs out old sessions');
r = await call('POST', '/auth/login', { email: 'ange@example.org', password: 'ange password 1' }); assert.equal(r.status, 401);
r = await call('POST', '/auth/login', { email: 'ange@example.org', password: 'brand new pass 9' }); const editor2 = r.token; assert.ok(editor2); ok('old password stops working, new one works');
r = await call('POST', '/auth/reset', { token: rt, password: 'another pass 99' }); assert.equal(r.status, 400); ok('reset link works only once');

// lockout
for (let i = 0; i < 8; i++) await call('POST', '/auth/login', { email: 'sam@example.org', password: 'nope nope nope' });
r = await call('POST', '/auth/login', { email: 'sam@example.org', password: 'sam password 1' }); assert.equal(r.status, 429); ok('8 wrong passwords lock the account for 15 minutes');

// comments
r = await call('POST', '/public/comments', { post: 'think-small', name: 'Jo', email: 'jo@example.org', text: 'Lovely post!' }); assert.equal(r.ok, true); assert.match(mails.at(-1).subject, /comment/i); ok('visitor comment held for approval; team emailed');
r = await call('POST', '/public/comments', { post: 'think-small', name: 'Bot', text: 'spam', website: 'http://spam' }); r = await call('GET', '/comments', null, admin); assert.equal(r.comments.length, 1); ok('robot comments (hidden field) are dropped');
r = await call('POST', '/public/comments', { post: '../x', name: 'J', text: 'hi' }); assert.equal(r.status, 400); ok('comment on an unknown post refused');
r = await call('GET', '/comments', null, contrib); assert.equal(r.status, 403); ok('contributors can’t moderate comments');
const com = (await call('GET', '/comments', null, editor2)).comments[0];
r = await call('POST', `/comments/${com.id}/approve`, {}, editor2); assert.equal(r.ok, true);
const cj = fileJson('content/comments/think-small.json'); assert.equal(cj.comments[0].text, 'Lovely post!'); assert.ok(!JSON.stringify(cj).includes('jo@example.org')); ok('editor approves; comment published without the commenter’s email');
r = await call('POST', `/comments/${com.id}/reject`, {}, admin); assert.equal(fileJson('content/comments/think-small.json').comments.length, 0); ok('an approved comment can be taken down again');
for (let i = 0; i < 6; i++) r = await call('POST', '/public/comments', { post: 'think-small', name: 'Jo', text: 'again ' + i });
assert.equal(r.status, 429); ok('a flood of comments from one place is slowed down');

// history
r = await call('GET', '/history?path=content/faq.json', null, editor2); assert.ok(r.versions.length >= 3); ok('history lists past versions');
const seedSha = r.versions.at(-1).sha;
r = await call('POST', '/history/restore', { path: 'content/faq.json', sha: seedSha }, editor2); assert.equal(r.status, 403); ok('only administrators can undo to an old version');
r = await call('POST', '/history/restore', { path: 'content/faq.json', sha: seedSha }, admin); assert.equal(fileJson('content/faq.json').questions[0].question, 'Q'); ok('administrator restores an old version in one click');

// people management
const users = (await call('GET', '/users', null, admin)).users; const lukeId = users.find((u) => u.email === 'luke@example.org').id, samId = users.find((u) => u.email === 'sam@example.org').id;
r = await call('PATCH', `/users/${lukeId}`, { role: 'editor' }, admin); assert.equal(r.status, 400); ok('the last administrator can’t be demoted');
r = await call('DELETE', `/users/${lukeId}`, null, admin); assert.equal(r.status, 400); ok('administrators can’t remove themselves');
r = await call('PATCH', `/users/${samId}`, { disabled: true }, admin); assert.equal(r.user.disabled, true);
r = await call('POST', '/auth/login', { email: 'sam@example.org', password: 'sam password 1' }); assert.equal(r.status, 401); ok('turning someone off blocks sign-in');
r = await call('GET', '/audit', null, admin); assert.ok(r.entries.some((e) => e.action === 'approved')); ok('audit log records who did what');

console.log(`\n${n} checks passed`);
await mf.dispose(); server.close();
