/* YWAM SF admin service (Cloudflare Worker).

   The admin page (admin/) talks only to this service. The service:
   - keeps everyone's sign-in (email + password, invites and password resets by email);
   - holds the ONLY GitHub key (a Worker secret), so nobody's browser ever has it;
   - decides what each level may do: administrators and editors publish straight away, contributors'
     changes wait in a queue until an editor (blog posts, resources) or an administrator (page copy,
     dates, show/hide) approves them;
   - keeps blog comments until an administrator or editor approves them;
   - sends the notification emails (Resend).

   Secrets (npx wrangler secret put NAME): GITHUB_TOKEN, RESEND_KEY, SETUP_KEY, TURNSTILE_SECRET (optional).
   Settings (wrangler.toml [vars]): REPO, BRANCH, ALLOWED_ORIGINS, ADMIN_URL, SITE_URL, MAIL_FROM, GITHUB_API. */

const DAY = 86400, HOUR = 3600;
const SESSION_IDLE = 45 * 60, SESSION_MAX = 12 * HOUR;
const INVITE_TTL = 7 * DAY, RESET_TTL = 2 * HOUR;
const LOCK_AFTER = 8, LOCK_FOR = 15 * 60;
const PBKDF2_ITER = 100000;                       // the highest Cloudflare Workers allow
const ROLES = ['admin', 'editor', 'contributor'];
const ROLE_NAME = { admin: 'Administrator', editor: 'Editor', contributor: 'Contributor' };

/* ------------------------------------------------------------------ small helpers */
const now = () => Math.floor(Date.now() / 1000);
const enc = new TextEncoder();
function b64(buf) { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
function b64url(buf) { return b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromB64(s) { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
function utf8ToB64(str) { return b64(enc.encode(str)); }
function b64ToUtf8(s) { return new TextDecoder().decode(fromB64(String(s).replace(/\s/g, ''))); }
function randomToken() { return b64url(crypto.getRandomValues(new Uint8Array(32))); }
async function sha256(s) { return b64url(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0 && a.length > 0;
}
async function hashPassword(pw, saltB64) {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i.test(e) && e.length <= 200;
const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80);
function pwProblem(pw) {
  pw = String(pw || '');
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (/^(.)\1+$/.test(pw)) return 'Choose a password that isn’t one repeated character.';
  return '';
}

class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

/* ------------------------------------------------------------------ what each level may do */
// Which reviewers a contributor's change goes to, and whether a path may be edited at all.
const JSON_PATH = /^content\/[a-z0-9_]{1,40}\.json$/;
const BLOG_PATH = /^content\/blog\/[a-z0-9][a-z0-9-]{0,80}\.json$/;
const UPLOAD_PATH = /^content\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:jpe?g|png|webp)$/;
const NEVER = new Set(['content/comments.json']);
function policy(path) {
  if (NEVER.has(path) || path.startsWith('content/comments/')) return null;   // comments change only through moderation
  if (BLOG_PATH.test(path) || path === 'content/resources.json') return { reviewers: 'editor' };
  if (JSON_PATH.test(path)) return { reviewers: 'admin' };
  return null;
}
// Section on/off switches are administrator-only: they live as show_* keys in settings.json.
function touchesSwitches(path, oldText, newText) {
  if (path !== 'content/settings.json') return false;
  let a = {}, b = {};
  try { a = JSON.parse(oldText || '{}'); } catch (e) {}
  try { b = JSON.parse(newText || '{}'); } catch (e) {}
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => /^show_/.test(k)));
  for (const k of keys) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return true;
  return false;
}
function canPublish(user, path, switches) {
  if (user.role === 'admin') return true;
  if (switches) return false;
  return user.role === 'editor';
}
const canReview = (user, reviewers) => user.role === 'admin' || (reviewers === 'editor' && user.role === 'editor');

/* ------------------------------------------------------------------ GitHub (the website's files) */
function gh(env) {
  const api = env.GITHUB_API || 'https://api.github.com', repo = env.REPO, branch = env.BRANCH || 'main';
  async function call(method, url, body) {
    const r = await fetch(api + url, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ywamsf-admin-service', 'Content-Type': 'application/json' }
    });
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) {}
    if (!r.ok) { const err = new HttpError(r.status === 404 ? 404 : 502, (data && data.message) || ('GitHub error ' + r.status)); err.gh = r.status; throw err; }
    return data;
  }
  const enc_ = (p) => p.split('/').map(encodeURIComponent).join('/');
  return {
    async get(path, ref) {
      try {
        const d = await call('GET', `/repos/${repo}/contents/${enc_(path)}?ref=${encodeURIComponent(ref || branch)}`);
        return { sha: d.sha, text: d.content != null && d.encoding === 'base64' ? b64ToUtf8(d.content) : null, size: d.size };
      } catch (e) { if (e.gh === 404) return { sha: null, text: null }; throw e; }
    },
    async put(path, b64content, message, sha, author) {
      const body = { message, content: b64content, branch, committer: { name: 'YWAM SF site admin', email: 'site-admin@ywamsanfrancisco.org' } };
      if (author) body.author = { name: author, email: 'site-admin@ywamsanfrancisco.org' };   // people's own emails never go to GitHub
      if (sha) body.sha = sha;
      try { return await call('PUT', `/repos/${repo}/contents/${enc_(path)}`, body); }
      catch (e) { if (e.gh === 409 || e.gh === 422) fail(409, 'Someone else saved this at the same moment. Reload and try again.'); throw e; }
    },
    async history(path) {
      const list = await call('GET', `/repos/${repo}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(branch)}&per_page=30`);
      return (list || []).map((c) => ({ sha: c.sha, message: (c.commit.message || '').split('\n')[0], who: (c.commit.author && c.commit.author.name) || '', date: c.commit.author && c.commit.author.date }));
    },
    async build() {                                          // most recent site build, for "is it live yet?"
      try {
        const d = await call('GET', `/repos/${repo}/actions/runs?per_page=5`);
        const run = (d.workflow_runs || [])[0];
        return run ? { name: run.name, status: run.status, conclusion: run.conclusion, at: run.updated_at } : null;
      } catch (e) { return null; }
    }
  };
}

/* ------------------------------------------------------------------ email (Resend) */
async function sendMail(env, to, subject, lines) {
  to = [].concat(to).filter(Boolean);
  if (!to.length) return;
  const text = lines.join('\n') + '\n\n— YWAM San Francisco site admin\n' + (env.ADMIN_URL || '');
  if (!env.RESEND_KEY) { console.log('[mail skipped: no RESEND_KEY]', to.join(', '), subject); return; }
  try {
    const r = await fetch(env.RESEND_API || 'https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || 'YWAM SF website <website@ywamsanfrancisco.org>', to, subject, text })
    });
    if (!r.ok) console.log('[mail failed]', r.status, await r.text());
  } catch (e) { console.log('[mail failed]', e.message); }
}
async function emailsFor(env, roles, exceptId) {
  const q = await env.DB.prepare(`SELECT id, email FROM users WHERE disabled = 0 AND pw_hash IS NOT NULL AND role IN (${roles.map(() => '?').join(',')})`).bind(...roles).all();
  return q.results.filter((u) => u.id !== exceptId).map((u) => u.email);
}
const reviewerRoles = (r) => (r === 'editor' ? ['admin', 'editor'] : ['admin']);

/* ------------------------------------------------------------------ database helpers */
async function audit(env, userId, action, detail) {
  await env.DB.prepare('INSERT INTO audit (at, user_id, action, detail) VALUES (?, ?, ?, ?)').bind(now(), userId || null, action, String(detail || '').slice(0, 500)).run();
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, roleName: ROLE_NAME[u.role], toured: !!u.toured, active: !!u.pw_hash, disabled: !!u.disabled });
async function newSession(env, user) {
  const token = randomToken(), t = now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires, last_seen) VALUES (?, ?, ?, ?)').bind(await sha256(token), user.id, t + SESSION_MAX, t).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires < ? OR last_seen < ?').bind(t, t - SESSION_IDLE).run();
  return token;
}
async function newLink(env, userId, kind) {
  const token = randomToken();
  await env.DB.prepare('UPDATE links SET used = 1 WHERE user_id = ? AND kind = ? AND used = 0').bind(userId, kind).run();
  await env.DB.prepare('INSERT INTO links (token_hash, user_id, kind, expires) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, kind, now() + (kind === 'invite' ? INVITE_TTL : RESET_TTL)).run();
  return token;
}
async function useLink(env, token, kind) {
  const row = await env.DB.prepare('SELECT * FROM links WHERE token_hash = ? AND kind = ?').bind(await sha256(String(token || '')), kind).first();
  if (!row || row.used || row.expires < now()) fail(400, kind === 'invite' ? 'This invitation link has expired or was already used. Ask an administrator to send a new one.' : 'This reset link has expired or was already used. Ask for a new one.');
  return row;
}
async function currentUser(env, req) {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,})$/.exec(req.headers.get('Authorization') || '');
  if (!m) fail(401, 'Please sign in.');
  const th = await sha256(m[1]), t = now();
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE token_hash = ?').bind(th).first();
  if (!s || s.expires < t || s.last_seen < t - SESSION_IDLE) { if (s) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run(); fail(401, 'You were signed out. Please sign in again.'); }
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(s.user_id).first();
  if (!u || u.disabled || !u.pw_hash) fail(401, 'Your access has been turned off.');
  if (t - s.last_seen > 60) await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').bind(t, th).run();
  u._session = th;
  return u;
}
const need = (u, ...roles) => { if (!roles.includes(u.role)) fail(403, 'Your access level can’t do that.'); };

/* ------------------------------------------------------------------ content: read, publish or submit */
function checkContent(path, content) {
  if (typeof content !== 'string') fail(400, 'Missing content.');
  if (content.length > 900000) fail(413, 'That’s too much text for one save.');
  try { JSON.parse(content); } catch (e) { fail(400, 'That content isn’t valid.'); }
}
function commitMessage(summary, path, who, approver) {
  const what = cleanName(summary) || path.replace(/^content\//, '');
  return `${what}: updated by ${who}${approver ? ', approved by ' + approver : ''} (site admin)`;
}
async function publish(env, user, path, content, summary, baseSha, approver) {
  const g = gh(env), cur = await g.get(path);
  if (baseSha !== undefined && baseSha !== null && cur.sha && baseSha !== cur.sha) fail(409, 'Someone else changed this since you opened it. Reload to see their version, then make your change again.', { current_sha: cur.sha });
  const r = await g.put(path, utf8ToB64(content), commitMessage(summary, path, user.name, approver && approver.name), cur.sha, user.name);
  return r && r.content ? r.content.sha : null;
}
async function notifyPublished(env, actor, path, summary) {
  // Editors hear about every published change, so nothing goes live unnoticed.
  const to = await emailsFor(env, ['editor', 'admin'], actor.id);
  await sendMail(env, to, `Published: ${cleanName(summary) || path}`, [`${actor.name} (${ROLE_NAME[actor.role]}) published a change to “${cleanName(summary) || path}”.`, 'It goes live on the website in about two minutes.', '', 'See the history or undo it in the admin page:']);
}

/* ------------------------------------------------------------------ comments */
const POST_SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;
async function rewriteComments(env, post, fn, actor, message) {
  const path = `content/comments/${post}.json`, g = gh(env), cur = await g.get(path);
  let data = { post, comments: [] };
  if (cur.text) { try { data = JSON.parse(cur.text); } catch (e) {} }
  if (!Array.isArray(data.comments)) data.comments = [];
  fn(data.comments);
  await g.put(path, utf8ToB64(JSON.stringify(data, null, 2) + '\n'), `${message} (by ${actor.name}, site admin)`, cur.sha, actor.name);
}

/* ------------------------------------------------------------------ routes */
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler });

route('GET', '/health', async (req, env) => ({ ok: true, setup: !(await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first()) }));

// First administrator. Only works while there are no accounts, and needs the SETUP_KEY secret.
route('POST', '/setup', async (req, env, body) => {
  if (await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first()) fail(403, 'The admin is already set up.');
  if (!env.SETUP_KEY || !safeEqual(body.setup_key, env.SETUP_KEY)) fail(403, 'That setup key isn’t right.');
  const email = normEmail(body.email), name = cleanName(body.name);
  if (!validEmail(email) || !name) fail(400, 'Enter your name and email.');
  const p = pwProblem(body.password); if (p) fail(400, p);
  const h = await hashPassword(body.password);
  const r = await env.DB.prepare('INSERT INTO users (email, name, role, pw_hash, pw_salt, created) VALUES (?, ?, ?, ?, ?, ?)').bind(email, name, 'admin', h.hash, h.salt, now()).run();
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(r.meta.last_row_id).first();
  await audit(env, user.id, 'setup', 'first administrator');
  return { token: await newSession(env, user), user: publicUser(user) };
});

route('POST', '/auth/login', async (req, env, body) => {
  const email = normEmail(body.email), t = now();
  const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  const wrong = 'That email and password don’t match. Check them, or use “Forgot password?”.';
  if (!u || !u.pw_hash || u.disabled) { await hashPassword(String(body.password || ''), 'AAAAAAAAAAAAAAAAAAAAAA=='); fail(401, wrong); }   // same timing either way
  if (u.locked_until > t) fail(429, 'Too many tries. Wait 15 minutes, or use “Forgot password?”.');
  const h = await hashPassword(String(body.password || ''), u.pw_salt);
  if (!safeEqual(h.hash, u.pw_hash)) {
    const f = u.failed + 1;
    await env.DB.prepare('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?').bind(f >= LOCK_AFTER ? 0 : f, f >= LOCK_AFTER ? t + LOCK_FOR : 0, u.id).run();
    if (f >= LOCK_AFTER) await audit(env, u.id, 'locked', 'too many failed sign-ins');
    fail(401, wrong);
  }
  await env.DB.prepare('UPDATE users SET failed = 0, locked_until = 0 WHERE id = ?').bind(u.id).run();
  await audit(env, u.id, 'sign-in', '');
  return { token: await newSession(env, u), user: publicUser(u) };
});

route('POST', '/auth/logout', async (req, env) => {
  const u = await currentUser(env, req);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(u._session).run();
  return { ok: true };
});

route('POST', '/auth/forgot', async (req, env, body) => {
  const email = normEmail(body.email);
  const u = validEmail(email) && await env.DB.prepare('SELECT * FROM users WHERE email = ? AND disabled = 0').bind(email).first();
  if (u) {
    const kind = u.pw_hash ? 'reset' : 'invite';
    const token = await newLink(env, u.id, kind);
    const url = (env.ADMIN_URL || '') + '#' + kind + '=' + token;
    await sendMail(env, u.email, kind === 'reset' ? 'Reset your YWAM SF admin password' : 'Your YWAM SF admin invitation', [
      `Hi ${u.name},`, '', kind === 'reset' ? 'Someone (hopefully you) asked to reset your password for the YWAM San Francisco website admin. Choose a new one here (the link works for 2 hours):' : 'Here’s a fresh link to set up your account for the YWAM San Francisco website admin:',
      url, '', 'If you didn’t ask for this, you can ignore this email; your password hasn’t changed.']);
    await audit(env, u.id, 'reset-requested', '');
  }
  return { ok: true };   // the same answer whether or not the email has an account
});

route('POST', '/auth/reset', async (req, env, body) => {
  const link = await useLink(env, body.token, 'reset');
  const p = pwProblem(body.password); if (p) fail(400, p);
  const h = await hashPassword(body.password);
  await env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, failed = 0, locked_until = 0 WHERE id = ?').bind(h.hash, h.salt, link.user_id).run();
  await env.DB.prepare('UPDATE links SET used = 1 WHERE token_hash = ?').bind(link.token_hash).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(link.user_id).run();    // sign out everywhere else
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(link.user_id).first();
  await audit(env, u.id, 'password-reset', '');
  return { token: await newSession(env, u), user: publicUser(u) };
});

route('POST', '/auth/invite-info', async (req, env, body) => {
  const link = await useLink(env, body.token, 'invite');
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(link.user_id).first();
  return { name: u.name, email: u.email, roleName: ROLE_NAME[u.role] };
});
route('POST', '/auth/accept', async (req, env, body) => {
  const link = await useLink(env, body.token, 'invite');
  const p = pwProblem(body.password); if (p) fail(400, p);
  const h = await hashPassword(body.password), name = cleanName(body.name);
  if (name) await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, link.user_id).run();
  await env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(h.hash, h.salt, link.user_id).run();
  await env.DB.prepare('UPDATE links SET used = 1 WHERE token_hash = ?').bind(link.token_hash).run();
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(link.user_id).first();
  await audit(env, u.id, 'joined', ROLE_NAME[u.role]);
  return { token: await newSession(env, u), user: publicUser(u) };
});

route('GET', '/me', async (req, env) => {
  const u = await currentUser(env, req);
  const waiting = {};
  if (u.role !== 'contributor') {
    const roles = u.role === 'admin' ? ['admin', 'editor'] : ['editor'];
    waiting.changes = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM changes WHERE status = 'pending' AND reviewers IN (${roles.map(() => '?').join(',')})`).bind(...roles).first()).n;
    waiting.comments = (await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE status = 'pending'").first()).n;
  }
  waiting.mine = (await env.DB.prepare("SELECT COUNT(*) AS n FROM changes WHERE user_id = ? AND status IN ('pending', 'sent_back')").bind(u.id).first()).n;
  waiting.sent_back = (await env.DB.prepare("SELECT COUNT(*) AS n FROM changes WHERE user_id = ? AND status = 'sent_back'").bind(u.id).first()).n;
  return { user: publicUser(u), waiting };
});
route('POST', '/me/toured', async (req, env) => { const u = await currentUser(env, req); await env.DB.prepare('UPDATE users SET toured = 1 WHERE id = ?').bind(u.id).run(); return { ok: true }; });
route('POST', '/me/password', async (req, env, body) => {
  const u = await currentUser(env, req);
  const h0 = await hashPassword(String(body.current || ''), u.pw_salt);
  if (!safeEqual(h0.hash, u.pw_hash)) fail(400, 'Your current password isn’t right.');
  const p = pwProblem(body.password); if (p) fail(400, p);
  const h = await hashPassword(body.password);
  await env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(h.hash, h.salt, u.id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(u.id, u._session).run();
  await audit(env, u.id, 'password-changed', '');
  return { ok: true };
});

/* people (administrators only) */
route('GET', '/users', async (req, env) => {
  const u = await currentUser(env, req); need(u, 'admin');
  const q = await env.DB.prepare("SELECT * FROM users ORDER BY role = 'admin' DESC, role = 'editor' DESC, name").all();
  return { users: q.results.map(publicUser) };
});
route('POST', '/users', async (req, env, body) => {
  const u = await currentUser(env, req); need(u, 'admin');
  const email = normEmail(body.email), name = cleanName(body.name), role = body.role;
  if (!validEmail(email)) fail(400, 'Enter a valid email address.');
  if (!name) fail(400, 'Enter their name.');
  if (!ROLES.includes(role)) fail(400, 'Choose an access level.');
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) fail(409, 'Someone with that email already has access.');
  const r = await env.DB.prepare('INSERT INTO users (email, name, role, created) VALUES (?, ?, ?, ?)').bind(email, name, role, now()).run();
  const id = r.meta.last_row_id, token = await newLink(env, id, 'invite');
  await sendMail(env, email, 'You’re invited to edit the YWAM San Francisco website', [
    `Hi ${name},`, '', `${u.name} has given you ${ROLE_NAME[role] === 'Administrator' ? 'Administrator' : ROLE_NAME[role]} access to the YWAM San Francisco website admin.`,
    'Choose your password here (the link works for 7 days):', (env.ADMIN_URL || '') + '#invite=' + token, '',
    'A short guided tour starts the first time you sign in.']);
  await audit(env, u.id, 'invited', `${name} as ${ROLE_NAME[role]}`);
  return { user: publicUser(await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()) };
});
route('PATCH', '/users/:id', async (req, env, body, p) => {
  const u = await currentUser(env, req); need(u, 'admin');
  const t = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(+p.id).first(); if (!t) fail(404, 'Not found.');
  const admins = (await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0 AND pw_hash IS NOT NULL").first()).n;
  const losesAdmin = t.role === 'admin' && !t.disabled && ((body.role && body.role !== 'admin') || body.disabled === true);
  if (losesAdmin && admins <= 1) fail(400, 'There must always be at least one administrator.');
  if (body.role !== undefined) { if (!ROLES.includes(body.role)) fail(400, 'Choose an access level.'); await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, t.id).run(); }
  if (body.name !== undefined) { const n = cleanName(body.name); if (n) await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(n, t.id).run(); }
  if (body.disabled !== undefined) {
    await env.DB.prepare('UPDATE users SET disabled = ? WHERE id = ?').bind(body.disabled ? 1 : 0, t.id).run();
    if (body.disabled) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(t.id).run();
  }
  if (body.resend_invite && !t.pw_hash) {
    const token = await newLink(env, t.id, 'invite');
    await sendMail(env, t.email, 'Your YWAM SF admin invitation', [`Hi ${t.name},`, '', 'Here’s a new link to set up your account for the YWAM San Francisco website admin (it works for 7 days):', (env.ADMIN_URL || '') + '#invite=' + token]);
  }
  await audit(env, u.id, 'person-updated', `${t.name}: ${JSON.stringify({ role: body.role, disabled: body.disabled, resend: !!body.resend_invite })}`);
  return { user: publicUser(await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(t.id).first()) };
});
route('DELETE', '/users/:id', async (req, env, body, p) => {
  const u = await currentUser(env, req); need(u, 'admin');
  const t = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(+p.id).first(); if (!t) fail(404, 'Not found.');
  if (t.id === u.id) fail(400, 'You can’t remove yourself. Ask another administrator.');
  if (t.role === 'admin') { const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0 AND pw_hash IS NOT NULL").first()).n; if (n <= 1 && t.pw_hash) fail(400, 'There must always be at least one administrator.'); }
  await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(t.id), env.DB.prepare('DELETE FROM links WHERE user_id = ?').bind(t.id), env.DB.prepare('DELETE FROM users WHERE id = ?').bind(t.id)]);
  await audit(env, u.id, 'person-removed', t.name);
  return { ok: true };
});
route('GET', '/audit', async (req, env) => {
  const u = await currentUser(env, req); need(u, 'admin');
  const q = await env.DB.prepare('SELECT a.at, a.action, a.detail, u.name FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200').all();
  return { entries: q.results };
});

/* content */
route('GET', '/content', async (req, env, body, p, url) => {
  const u = await currentUser(env, req);
  const path = url.searchParams.get('path') || '';
  if (!policy(path) && !/^content\/comments\/[a-z0-9-]+\.json$/.test(path)) fail(400, 'Unknown file.');
  const f = await gh(env).get(path);
  // A contributor sees their own waiting version, so they can keep working on it.
  let pending = null;
  const row = await env.DB.prepare("SELECT id, content, created, status, note FROM changes WHERE path = ? AND user_id = ? AND status IN ('pending', 'sent_back') ORDER BY id DESC LIMIT 1").bind(path, u.id).first();
  if (row) pending = row;
  return { path, sha: f.sha, content: f.text, pending };
});

route('PUT', '/content', async (req, env, body) => {
  const u = await currentUser(env, req);
  const path = String(body.path || ''), pol = policy(path);
  if (!pol) fail(400, 'That can’t be edited here.');
  checkContent(path, body.content);
  const cur = await gh(env).get(path);
  const switches = touchesSwitches(path, cur.text, body.content);
  if (canPublish(u, path, switches)) {
    await publish(env, u, path, body.content, body.summary, body.base_sha, null);
    await env.DB.prepare("UPDATE changes SET status = 'withdrawn', decided = ? WHERE path = ? AND user_id = ? AND status IN ('pending', 'sent_back')").bind(now(), path, u.id).run();
    await audit(env, u.id, 'published', cleanName(body.summary) || path);
    if (u.role === 'editor') await notifyPublished(env, u, path, body.summary);
    return { published: true };
  }
  // Waits for approval: one open change per person per file (a new save replaces the old one).
  const reviewers = switches ? 'admin' : pol.reviewers, t = now();
  const open = await env.DB.prepare("SELECT id FROM changes WHERE path = ? AND user_id = ? AND status IN ('pending', 'sent_back')").bind(path, u.id).first();
  let id;
  if (open) { id = open.id; await env.DB.prepare("UPDATE changes SET content = ?, summary = ?, base_sha = ?, reviewers = ?, status = 'pending', note = '', created = ?, decided = NULL WHERE id = ?").bind(body.content, cleanName(body.summary), cur.sha, reviewers, t, id).run(); }
  else id = (await env.DB.prepare('INSERT INTO changes (user_id, path, content, summary, base_sha, reviewers, created) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(u.id, path, body.content, cleanName(body.summary), cur.sha, reviewers, t).run()).meta.last_row_id;
  await audit(env, u.id, 'submitted', cleanName(body.summary) || path);
  await sendMail(env, await emailsFor(env, reviewerRoles(reviewers), u.id), `Waiting for your approval: ${cleanName(body.summary) || path}`, [
    `${u.name} (${ROLE_NAME[u.role]}) submitted a change to “${cleanName(body.summary) || path}”.`, '', 'Open the admin page to see it side by side with what’s live now, then approve it or send it back with a note:']);
  return { published: false, change: id, reviewers: reviewers === 'editor' ? 'an editor or administrator' : 'an administrator' };
});

// Photos: published straight away for everyone signed in (a photo isn't shown anywhere until a page uses it).
route('POST', '/upload', async (req, env, body) => {
  const u = await currentUser(env, req);
  const name = String(body.name || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+/, '');
  const path = 'content/uploads/' + name;
  if (!UPLOAD_PATH.test(path)) fail(400, 'Photos must be JPG, PNG or WebP.');
  const data = String(body.data || '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(data) || data.length > 11000000) fail(413, 'That photo is too large. Use one under 8 MB.');
  const head = fromB64(data.slice(0, 32));
  const isJpg = head[0] === 0xff && head[1] === 0xd8, isPng = head[0] === 0x89 && head[1] === 0x50, isWebp = head[8] === 0x57 && head[9] === 0x45;
  if (!(isJpg || isPng || isWebp)) fail(400, 'That file isn’t a photo.');
  const g = gh(env), cur = await g.get(path);
  if (cur.sha) fail(409, 'A photo with that name already exists. Rename the file and try again.');
  await g.put(path, data, `Photo ${name}: uploaded by ${u.name} (site admin)`, null, u.name);
  await audit(env, u.id, 'uploaded', name);
  return { path: 'uploads/' + name };
});

/* approvals */
route('GET', '/changes', async (req, env, body, p, url) => {
  const u = await currentUser(env, req);
  const mine = url.searchParams.get('mine') === '1';
  let q;
  if (mine || u.role === 'contributor') q = await env.DB.prepare("SELECT c.*, u.name AS who, r.name AS reviewer FROM changes c JOIN users u ON u.id = c.user_id LEFT JOIN users r ON r.id = c.reviewer_id WHERE c.user_id = ? ORDER BY c.id DESC LIMIT 50").bind(u.id).all();
  else {
    const roles = u.role === 'admin' ? ['admin', 'editor'] : ['editor'];
    q = await env.DB.prepare(`SELECT c.*, u.name AS who, r.name AS reviewer FROM changes c JOIN users u ON u.id = c.user_id LEFT JOIN users r ON r.id = c.reviewer_id WHERE (c.status = 'pending' AND c.reviewers IN (${roles.map(() => '?').join(',')})) OR (c.decided > ?) ORDER BY c.status = 'pending' DESC, c.id DESC LIMIT 100`).bind(...roles, now() - 14 * DAY).all();
  }
  return { changes: q.results.map((c) => ({ id: c.id, path: c.path, summary: c.summary, who: c.who, status: c.status, note: c.note, reviewer: c.reviewer, created: c.created, decided: c.decided, reviewers: c.reviewers, content: c.content, base_sha: c.base_sha })) };
});
route('POST', '/changes/:id/approve', async (req, env, body, p) => {
  const u = await currentUser(env, req);
  const c = await env.DB.prepare('SELECT * FROM changes WHERE id = ?').bind(+p.id).first();
  if (!c || c.status !== 'pending') fail(404, 'That change isn’t waiting any more.');
  if (!canReview(u, c.reviewers)) fail(403, 'Only an administrator can approve this.');
  const author = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(c.user_id).first() || { name: 'a former contributor' };
  await publish(env, author, c.path, c.content, c.summary, body.force ? undefined : c.base_sha, u);
  await env.DB.prepare("UPDATE changes SET status = 'approved', reviewer_id = ?, note = ?, decided = ? WHERE id = ?").bind(u.id, cleanName(body.note || '').slice(0, 500), now(), c.id).run();
  await audit(env, u.id, 'approved', `${c.summary || c.path} by ${author.name}`);
  if (author.email) await sendMail(env, author.email, `Approved: ${c.summary || c.path}`, [`Good news: ${u.name} approved your change to “${c.summary || c.path}”. It goes live in about two minutes.`, body.note ? `\nNote from ${u.name}: ${String(body.note).slice(0, 500)}` : '']);
  return { ok: true };
});
route('POST', '/changes/:id/send-back', async (req, env, body, p) => {
  const u = await currentUser(env, req);
  const c = await env.DB.prepare('SELECT * FROM changes WHERE id = ?').bind(+p.id).first();
  if (!c || c.status !== 'pending') fail(404, 'That change isn’t waiting any more.');
  if (!canReview(u, c.reviewers)) fail(403, 'Only an administrator can review this.');
  const note = String(body.note || '').trim().slice(0, 1000);
  if (!note) fail(400, 'Add a short note so they know what to change.');
  await env.DB.prepare("UPDATE changes SET status = 'sent_back', reviewer_id = ?, note = ?, decided = ? WHERE id = ?").bind(u.id, note, now(), c.id).run();
  const author = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(c.user_id).first();
  await audit(env, u.id, 'sent-back', `${c.summary || c.path}`);
  if (author) await sendMail(env, author.email, `Sent back: ${c.summary || c.path}`, [`${u.name} sent back your change to “${c.summary || c.path}” with this note:`, '', note, '', 'Your version is kept. Open it in the admin page, make the changes and submit it again:']);
  return { ok: true };
});
route('POST', '/changes/:id/withdraw', async (req, env, body, p) => {
  const u = await currentUser(env, req);
  const c = await env.DB.prepare('SELECT * FROM changes WHERE id = ? AND user_id = ?').bind(+p.id, u.id).first();
  if (!c || !['pending', 'sent_back'].includes(c.status)) fail(404, 'Not found.');
  await env.DB.prepare("UPDATE changes SET status = 'withdrawn', decided = ? WHERE id = ?").bind(now(), c.id).run();
  return { ok: true };
});

/* history and undo */
route('GET', '/history', async (req, env, body, p, url) => {
  const u = await currentUser(env, req); need(u, 'admin', 'editor');
  const path = url.searchParams.get('path') || '';
  if (!policy(path)) fail(400, 'Unknown file.');
  const g = gh(env), sha = url.searchParams.get('sha');
  if (sha) { if (!/^[0-9a-f]{40}$/.test(sha)) fail(400, 'Bad version.'); const f = await g.get(path, sha); return { content: f.text }; }
  return { versions: await g.history(path) };
});
route('POST', '/history/restore', async (req, env, body) => {
  const u = await currentUser(env, req); need(u, 'admin');
  const path = String(body.path || ''), sha = String(body.sha || '');
  if (!policy(path) || !/^[0-9a-f]{40}$/.test(sha)) fail(400, 'Bad request.');
  const g = gh(env), old = await g.get(path, sha);
  if (old.text == null) fail(404, 'That version has no content.');
  await publish(env, u, path, old.text, `Undo: ${path.replace(/^content\//, '')} back to ${sha.slice(0, 7)}`, undefined, null);
  await audit(env, u.id, 'restored', `${path} to ${sha.slice(0, 7)}`);
  return { ok: true };
});
route('GET', '/build', async (req, env) => { await currentUser(env, req); return { build: await gh(env).build() }; });

/* comments: anyone can post one; it waits until an administrator or editor approves it */
route('POST', '/public/comments', async (req, env, body) => {
  if (body.website) return { ok: true };                          // the hidden field only robots fill in
  const post = String(body.post || ''), name = cleanName(body.name), email = normEmail(body.email), text = String(body.text || '').replace(/\r/g, '').trim();
  if (!POST_SLUG.test(post)) fail(400, 'Unknown post.');
  if (!name) fail(400, 'Please add your name.');
  if (email && !validEmail(email)) fail(400, 'That email doesn’t look right.');
  if (text.length < 2) fail(400, 'Please write a comment.');
  if (text.length > 2000) fail(400, 'Please keep comments under 2,000 characters.');
  if ((text.match(/https?:\/\//g) || []).length > 2) fail(400, 'Please include no more than two links.');
  if (env.TURNSTILE_SECRET) {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(body.turnstile || '') }) });
    if (!(await r.json()).success) fail(400, 'Please try again in a moment.');
  }
  const ip = await sha256((req.headers.get('CF-Connecting-IP') || '') + '|' + (env.SETUP_KEY || ''));
  const recent = (await env.DB.prepare('SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created > ?').bind(ip, now() - HOUR).first()).n;
  if (recent >= 5) fail(429, 'Thanks! You’ve sent several comments already; please try again later.');
  await env.DB.prepare('INSERT INTO comments (post, name, email, text, ip_hash, created) VALUES (?, ?, ?, ?, ?, ?)').bind(post, name, email, text, ip, now()).run();
  await sendMail(env, await emailsFor(env, ['admin', 'editor']), 'New blog comment waiting for approval', [`${name} commented on “${post}”:`, '', text.slice(0, 600), '', 'Approve or remove it in the admin page:']);
  return { ok: true, message: 'Thanks! Your comment will appear once our team has read it.' };
});
route('GET', '/comments', async (req, env, body, p, url) => {
  const u = await currentUser(env, req); need(u, 'admin', 'editor');
  const status = ['pending', 'approved', 'rejected'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending';
  const q = await env.DB.prepare('SELECT c.id, c.post, c.name, c.email, c.text, c.status, c.created, c.decided, r.name AS reviewer FROM comments c LEFT JOIN users r ON r.id = c.reviewer_id WHERE c.status = ? ORDER BY c.id DESC LIMIT 100').bind(status).all();
  return { comments: q.results };
});
route('POST', '/comments/:id/approve', async (req, env, body, p) => {
  const u = await currentUser(env, req); need(u, 'admin', 'editor');
  const c = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(+p.id).first();
  if (!c || c.status !== 'pending') fail(404, 'That comment isn’t waiting any more.');
  await rewriteComments(env, c.post, (list) => { if (!list.some((x) => x.id === c.id)) list.push({ id: c.id, name: c.name, text: c.text, date: new Date(c.created * 1000).toISOString().slice(0, 10) }); }, u, `Comment on ${c.post}: approved`);
  await env.DB.prepare("UPDATE comments SET status = 'approved', reviewer_id = ?, decided = ? WHERE id = ?").bind(u.id, now(), c.id).run();
  await audit(env, u.id, 'comment-approved', `${c.name} on ${c.post}`);
  return { ok: true };
});
route('POST', '/comments/:id/reject', async (req, env, body, p) => {
  const u = await currentUser(env, req); need(u, 'admin', 'editor');
  const c = await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(+p.id).first();
  if (!c || c.status === 'rejected') fail(404, 'Not found.');
  if (c.status === 'approved') await rewriteComments(env, c.post, (list) => { const i = list.findIndex((x) => x.id === c.id); if (i >= 0) list.splice(i, 1); }, u, `Comment on ${c.post}: removed`);
  await env.DB.prepare("UPDATE comments SET status = 'rejected', reviewer_id = ?, decided = ? WHERE id = ?").bind(u.id, now(), c.id).run();
  await audit(env, u.id, 'comment-removed', `${c.name} on ${c.post}`);
  return { ok: true };
});

/* ------------------------------------------------------------------ entry point */
function cors(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { 'Vary': 'Origin' };
  if (allowed.includes(origin)) Object.assign(h, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Max-Age': '600' });
  return { h, ok: !origin || allowed.includes(origin) };
}
function json(data, status, extra) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }, extra) });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), c = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: c.ok ? 204 : 403, headers: c.h });
    if (!c.ok) return json({ error: 'Not allowed from this site.' }, 403, c.h);
    const path = url.pathname.replace(/^\/api(?=\/)/, '').replace(/\/+$/, '') || '/';
    try {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(path); if (!m) continue;
        let body = {};
        if (req.method !== 'GET' && req.method !== 'DELETE') {
          const len = +(req.headers.get('Content-Length') || 0);
          if (len > 12000000) fail(413, 'That’s too large.');
          try { body = await req.json(); } catch (e) { body = {}; }
          if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
        }
        return json(await r.handler(req, env, body, m.groups || {}, url), 200, c.h);
      }
      return json({ error: 'Not found.' }, 404, c.h);
    } catch (e) {
      if (e instanceof HttpError) return json(Object.assign({ error: e.message }, e.extra || {}), e.status, c.h);
      console.log('[error]', e && e.stack || e);
      return json({ error: 'Something went wrong on our side. Try again in a minute.' }, 500, c.h);
    }
  }
};

export const _test = { policy, touchesSwitches, canPublish, pwProblem };
