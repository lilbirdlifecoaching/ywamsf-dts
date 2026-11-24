// Live site check: security and "is anything broken?" tests against the published site.
// Run by .github/workflows/site-check.yml (Mon/Wed/Fri), or locally: node tools/site_check.mjs
//   SITE=https://ywamsanfrancisco.org/   the site to test (default)
//   SERVICE=https://ywamsf-admin.angela-95e.workers.dev   the admin sign-in service
//   LOCAL=1   testing a local copy: skips the DNS, certificate and other-domain checks
// Writes site-check-report.md and site-check-report.json; exits 1 if anything FAILED (warnings don't fail).
import fs from 'node:fs';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const SITE = (process.env.SITE || 'https://ywamsanfrancisco.org/').replace(/\/?$/, '/');
const SERVICE = (process.env.SERVICE || 'https://ywamsf-admin.angela-95e.workers.dev').replace(/\/$/, '');
const LOCAL = !!process.env.LOCAL;
const HOST = new URL(SITE).host;
const results = [];   // {area, level: ok|warn|fail, msg}
const add = (area, level, msg) => { results.push({ area, level, msg }); console.log(`[${level}] ${area}: ${msg}`); };
const ok = (a, m) => add(a, 'ok', m), warn = (a, m) => add(a, 'warn', m), fail = (a, m) => add(a, 'fail', m);

async function get(url, opts = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, Object.assign({ redirect: 'manual', headers: { 'User-Agent': 'YWAMSF-site-check/1.0' } }, opts, { signal: AbortSignal.timeout(20000) }));
      const text = opts.method === 'HEAD' ? '' : await r.text();
      return { status: r.status, headers: r.headers, text, url };
    } catch (e) { if (attempt === 2) return { status: 0, error: String(e.message || e), text: '', headers: new Headers(), url }; await new Promise((s) => setTimeout(s, 1500)); }
  }
}
async function follow(url, max = 6) {   // follow redirects, return final {status, url, hops}
  let hops = [];
  for (let i = 0; i < max; i++) {
    const r = await get(url);
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { hops.push(r.status); url = new URL(r.headers.get('location'), url).href; continue; }
    return Object.assign(r, { url, hops });
  }
  return { status: 0, error: 'too many redirects', url, hops, text: '' };
}
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

/* ---------------------------------------------------------------- 1. every page in the sitemap */
const sm = await follow(SITE + 'sitemap.xml');
let urls = [];
if (sm.status !== 200) fail('Pages', `sitemap.xml didn't load (${sm.status || sm.error})`);
else {
  urls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (LOCAL) urls = urls.map((u) => u.replace(/^https?:\/\/[^/]+\//, SITE));
  if (urls.length < 50) fail('Pages', `sitemap lists only ${urls.length} pages (expected 100+)`); else ok('Pages', `sitemap lists ${urls.length} pages`);
}
const pages = {};
const bad = [];
await pool(urls, 8, async (u) => { const r = await follow(u); pages[u] = r; if (r.status !== 200) bad.push(`${u.replace(SITE, '/')} → ${r.status || r.error}`); });
if (bad.length) fail('Pages', `${bad.length} page(s) in the sitemap don't load: ${bad.slice(0, 10).join('; ')}`); else if (urls.length) ok('Pages', `all ${urls.length} sitemap pages load`);

/* ---------------------------------------------------------------- 2. what each page must contain (security + SEO) */
const noCsp = [], noindex = [], badCanon = [], mixed = [], noTitle = [];
for (const [u, r] of Object.entries(pages)) {
  if (r.status !== 200) continue;
  const h = r.text, p = u.replace(SITE, '/');
  if (!/http-equiv="Content-Security-Policy"/i.test(h)) noCsp.push(p);
  if (/<meta name="robots" content="[^"]*noindex/i.test(h)) noindex.push(p);
  const canon = (/<link rel="canonical" href="([^"]+)"/i.exec(h) || [])[1] || '';
  if (!LOCAL && !canon.startsWith('https://' + HOST + '/')) badCanon.push(p + (canon ? ' (' + canon + ')' : ' (none)'));
  if (/\s(?:src|href)="http:\/\//i.test(h.replace(/<a [^>]*>/gi, ''))) mixed.push(p);
  if (!/<title>[^<]{2,}<\/title>/i.test(h)) noTitle.push(p);
}
noCsp.length ? fail('Security', `security policy (CSP) missing on: ${noCsp.slice(0, 8).join(', ')}`) : ok('Security', 'every page has its security policy (CSP)');
mixed.length ? fail('Security', `insecure http:// files loaded on: ${mixed.slice(0, 8).join(', ')}`) : ok('Security', 'no insecure (http://) files on any page');
noindex.length ? fail('Search', `hidden from Google (noindex) by mistake: ${noindex.slice(0, 8).join(', ')}`) : ok('Search', 'every page can be found by Google');
if (!LOCAL) badCanon.length ? fail('Search', `wrong canonical address on: ${badCanon.slice(0, 6).join(', ')}`) : ok('Search', `canonical addresses all point at ${HOST}`);
noTitle.length ? warn('Search', `missing page titles on: ${noTitle.join(', ')}`) : ok('Search', 'every page has a title');

const robots = await follow(SITE + 'robots.txt');
if (robots.status !== 200) fail('Search', 'robots.txt missing');
else if (/^Disallow:\s*\/\s*$/m.test(robots.text)) fail('Search', 'robots.txt blocks the whole site from Google');
else if (!/Disallow:\s*\/admin\//.test(robots.text)) warn('Search', 'robots.txt no longer keeps /admin/ out of Google');
else ok('Search', 'robots.txt is right');
const feed = await follow(SITE + 'blog/feed.xml');
feed.status === 200 && /<rss|<feed/.test(feed.text) && (feed.text.match(/<item>/g) || []).length > 10 ? ok('Blog', `RSS feed works (${(feed.text.match(/<item>/g) || []).length} posts)`) : fail('Blog', `RSS feed broken (${feed.status})`);

/* ---------------------------------------------------------------- 3. broken links inside the site */
const links = new Set();
for (const [u, r] of Object.entries(pages)) {
  if (r.status !== 200) continue;
  for (const m of r.text.matchAll(/\s(?:href|src)="([^"#]+)"/g)) {
    let v = m[1]; if (/^(mailto:|tel:|data:|javascript:)/i.test(v)) continue;
    let abs; try { abs = new URL(v, u).href; } catch (e) { continue; }
    if (abs.startsWith(SITE)) links.add(abs.split('#')[0].split('?')[0]);
  }
}
const known = new Set(Object.keys(pages)), toCheck = [...links].filter((l) => !known.has(l));
const broken = [];
await pool(toCheck, 10, async (l) => { const r = await follow(l); if (r.status !== 200) broken.push(`${l.replace(SITE, '/')} (${r.status || r.error})`); });
broken.length ? fail('Links', `${broken.length} broken link(s)/file(s) inside the site: ${broken.slice(0, 12).join('; ')}`) : ok('Links', `all ${links.size} links, photos, styles and scripts inside the site work`);

/* ---------------------------------------------------------------- 4. old Squarespace addresses still redirect */
const oldLines = ['tools/old_addresses.txt', 'tools/old_events.txt'].flatMap((f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n') : []).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)[0]);
const redirBad = [];
await pool(oldLines, 8, async (o) => {
  const r = await follow(SITE + o.replace(/^\//, ''));
  if (r.status !== 200 || !/http-equiv="refresh"/i.test(r.text)) redirBad.push(`/${o} (${r.status || r.error})`);
});
redirBad.length ? fail('Old addresses', `${redirBad.length} old Squarespace address(es) no longer redirect: ${redirBad.slice(0, 10).join('; ')}`) : ok('Old addresses', `all ${oldLines.length} old Squarespace addresses redirect`);

/* ---------------------------------------------------------------- 5. pages work in a real browser (desktop + phone) */
const KEY = ['', 'volunteer/', 'dts/', 'ellis-room/', 'give/', 'contact/', 'about/people/', 'blog/', 'teams/', 'join-staff/'];
const browser = await chromium.launch();
for (const [label, ctxOpts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const ctx = await browser.newContext(ctxOpts);
  const problems = [];
  for (const p of KEY) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('script error: ' + e.message.slice(0, 120)));
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) errs.push('blocked by security policy: ' + m.text().slice(0, 140)); });
    page.on('response', (r) => { if (r.url().startsWith(SITE) && r.status() >= 400) errs.push(`missing file ${r.url().replace(SITE, '/')} (${r.status()})`); });
    try {
      await page.goto(SITE + p, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(1500);
      const info = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, vw: innerWidth, h1: !!document.querySelector('h1'), broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('loading') !== 'lazy' && i.src).map((i) => i.src.split('/').pop()).slice(0, 4) }));
      if (!info.h1) errs.push('no main heading');
      if (info.w > info.vw + 2) errs.push(`page is wider than the screen (${info.w}px on ${info.vw}px)`);
      if (info.broken.length) errs.push('photos not loading: ' + info.broken.join(', '));
    } catch (e) { errs.push('did not load: ' + e.message.split('\n')[0]); }
    if (errs.length) problems.push(`/${p} → ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
    await page.close();
  }
  problems.length ? fail('Browser', `${label}: ${problems.join(' ;; ')}`) : ok('Browser', `${label}: ${KEY.length} key pages load with no errors, nothing too wide`);
  await ctx.close();
}
// the admin page opens and shows its sign-in screen
{
  const page = await browser.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  try { await page.goto(SITE + 'admin/', { waitUntil: 'load', timeout: 45000 }); await page.waitForSelector('input[type=password], input[type=email]', { timeout: 20000 }); } catch (e) { errs.push('sign-in screen did not appear'); }
  errs.length ? fail('Admin', `admin page: ${errs.join(' | ')}`) : ok('Admin', 'admin page opens to its sign-in screen');
  await page.close();
}
await browser.close();

/* ---------------------------------------------------------------- 6. the admin sign-in service */
if (!LOCAL) {
  const hl = await get(SERVICE + '/health', { headers: { Origin: 'https://' + HOST } });
  let health = {}; try { health = JSON.parse(hl.text); } catch (e) {}
  if (hl.status !== 200 || !health.ok) fail('Admin', `sign-in service not answering (${hl.status || hl.error})`);
  else {
    ok('Admin', 'sign-in service is up');
    if (health.setup) fail('Security', 'sign-in service says it has NO accounts (setup mode): someone could claim it. Check immediately.');
    const an = health.analytics || {}, notOk = Object.entries(an).filter(([, v]) => v !== 'ok');
    notOk.length ? warn('Dashboard', 'dashboard settings not ok: ' + notOk.map(([k, v]) => k + ' ' + v).join('; ')) : ok('Dashboard', 'all four dashboard settings are in place');
  }
  const me = await get(SERVICE + '/me', { headers: { Origin: 'https://' + HOST } });
  me.status === 401 ? ok('Security', 'service refuses requests without a sign-in') : fail('Security', `service answered /me without a sign-in (${me.status})`);
  const evil = await get(SERVICE + '/health', { headers: { Origin: 'https://evil.example' } });
  evil.status === 403 ? ok('Security', 'service refuses other websites (CORS)') : fail('Security', `service accepted a request from another website (${evil.status})`);
  const lp = await get(SERVICE + '/auth/login', { method: 'POST', headers: { Origin: 'https://' + HOST, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nobody@example.org', password: 'wrong-password-123' }) });
  lp.status === 401 ? ok('Security', 'wrong passwords are refused') : fail('Security', `odd answer to a wrong password (${lp.status})`);
  const rx = await get(SERVICE + '/public/reactions?post=think-small', { headers: { Origin: 'https://' + HOST } });
  rx.status === 200 ? ok('Blog', 'blog reactions are working') : fail('Blog', `blog reactions not working (${rx.status})`);
}

/* ---------------------------------------------------------------- 7. domain, certificate, email records */
if (!LOCAL) {
  const exp = await new Promise((res) => { const s = tls.connect(443, HOST, { servername: HOST, timeout: 15000 }, () => { const c = s.getPeerCertificate(); s.end(); res(c && c.valid_to ? new Date(c.valid_to) : null); }); s.on('error', () => res(null)); s.on('timeout', () => { s.destroy(); res(null); }); });
  if (!exp) fail('Domain', 'could not read the security certificate');
  else { const d = Math.round((exp - Date.now()) / 864e5); d < 10 ? fail('Domain', `security certificate expires in ${d} days`) : d < 20 ? warn('Domain', `security certificate expires in ${d} days (GitHub normally renews it automatically)`) : ok('Domain', `security certificate valid for ${d} more days`); }
  const plain = await get('http://' + HOST + '/');
  plain.status >= 300 && plain.status < 400 && /^https:/.test(plain.headers.get('location') || '') ? ok('Security', 'http:// sends visitors to https://') : fail('Security', `http:// doesn't redirect to https:// (${plain.status}): tick "Enforce HTTPS" in GitHub Pages`);
  const www = await follow('https://www.' + HOST + '/');
  www.status === 200 && new URL(www.url).host === HOST ? ok('Domain', `www.${HOST} goes to ${HOST}`) : warn('Domain', `www.${HOST} ended at ${www.url} (${www.status || www.error})`);
  const com = await follow('https://' + HOST.replace(/\.org$/, '.com') + '/');
  com.status === 200 && new URL(com.url).host === HOST ? ok('Domain', HOST.replace(/\.org$/, '.com') + ' forwards to the site') : warn('Domain', `${HOST.replace(/\.org$/, '.com')} ended at ${com.url} (${com.status || com.error})`);
  try {
    const a = await dns.resolve4(HOST); const gh = a.filter((x) => /^185\.199\.(108|109|110|111)\.153$/.test(x));
    gh.length === a.length && a.length ? ok('Domain', 'website DNS points at GitHub Pages') : fail('Domain', `website DNS changed: ${a.join(', ')}`);
  } catch (e) { fail('Domain', 'website DNS lookup failed: ' + e.code); }
  try {
    const mx = await dns.resolveMx(HOST);
    mx.some((m) => /google\.com$|googlemail\.com$/i.test(m.exchange)) ? ok('Email', 'email (MX) records still point at Google') : fail('Email', 'email (MX) records changed: ' + mx.map((m) => m.exchange).join(', '));
  } catch (e) { fail('Email', 'no email (MX) records found: email may be broken'); }
  try {
    const txt = (await dns.resolveTxt(HOST)).map((t) => t.join(''));
    txt.some((t) => t.startsWith('google-site-verification=')) ? ok('Search', 'Search Console verification record is in place') : warn('Search', 'Search Console verification record (TXT) is missing');
    txt.some((t) => /^v=spf1/.test(t)) ? ok('Email', 'SPF email record present') : warn('Email', 'no SPF record (helps emails avoid spam folders)');
  } catch (e) { warn('Search', 'could not read TXT records'); }
  try { (await dns.resolveTxt('resend._domainkey.' + HOST)).length ? ok('Email', 'Resend email record (DKIM) in place') : fail('Email', 'Resend DKIM record missing: admin emails will fail'); } catch (e) { fail('Email', 'Resend DKIM record missing: admin emails will fail'); }
}

/* ---------------------------------------------------------------- report */
const order = { fail: 0, warn: 1, ok: 2 }, icon = { fail: '❌', warn: '⚠️', ok: '✅' };
const nf = results.filter((r) => r.level === 'fail').length, nw = results.filter((r) => r.level === 'warn').length;
const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' });
const md = [`# Site check: ${nf ? nf + ' problem' + (nf > 1 ? 's' : '') : 'all good'}${nw ? `, ${nw} warning${nw > 1 ? 's' : ''}` : ''}`, '', `${SITE} · ${stamp} (San Francisco time)`, '',
  ...results.slice().sort((a, b) => order[a.level] - order[b.level]).map((r) => `- ${icon[r.level]} **${r.area}:** ${r.msg}`)].join('\n');
fs.writeFileSync('site-check-report.md', md + '\n');
fs.writeFileSync('site-check-report.json', JSON.stringify({ site: SITE, at: new Date().toISOString(), fails: nf, warnings: nw, results }, null, 1));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log('\n' + md);
process.exit(nf ? 1 : 0);
