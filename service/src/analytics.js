/* "How it's going" dashboard for the admin page: visitor numbers from three places, fetched here so no key ever
   reaches a browser.
   - Google Analytics 4 (Data API) and Google Search Console: one Google service account, secret GOOGLE_SA_KEY (the whole
     JSON key file) + GA4_PROPERTY_ID (the number from GA4 Admin → Property details). The service account's email is added
     as a Viewer in GA4 and a Restricted user in Search Console. Search Console site: var GSC_SITE (default
     sc-domain:ywamsanfrancisco.org).
   - Cloudflare Web Analytics (GraphQL API): secrets CF_ANALYTICS_TOKEN (Account Analytics: Read) + CF_ACCOUNT_ID.
   Results are kept for an hour in D1 (analytics_cache) so the page is quick and the APIs' limits are never near.
   With nothing set up, the dashboard shows clearly labelled sample numbers. */

const enc = new TextEncoder();
const b64url = (buf) => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64urlStr = (s) => b64url(enc.encode(s));
const CACHE_FOR = 3600;
const EVENTS = { volunteer_signup_click: 'Volunteer sign-up clicks', give_click: 'Give clicks', dts_apply_click: 'DTS application clicks', contact_click: 'Email / phone clicks' };
const HOSTS = ['ywamsanfrancisco.org', 'www.ywamsanfrancisco.org', 'ywamembers.org', 'www.ywamembers.org'];

function sfDate(offsetDays) {   // YYYY-MM-DD in San Francisco, offsetDays ago
  const d = new Date(Date.now() - offsetDays * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
const num = (v) => +v || 0;

export function analyticsStatus(env) {
  let key = 'missing';
  if (String(env.GOOGLE_SA_KEY || '').trim()) { try { const k = JSON.parse(env.GOOGLE_SA_KEY); key = k.client_email && k.private_key ? 'ok' : 'not a service account key'; } catch (e) { key = 'not valid JSON (paste the whole file)'; } }
  return {
    GOOGLE_SA_KEY: key,
    GA4_PROPERTY_ID: /^\d{5,15}$/.test(String(env.GA4_PROPERTY_ID || '').trim()) ? 'ok' : (env.GA4_PROPERTY_ID ? 'should be a number like 412345678 (not the G- code)' : 'missing'),
    CF_ANALYTICS_TOKEN: String(env.CF_ANALYTICS_TOKEN || '').trim() ? 'ok' : 'missing',
    CF_ACCOUNT_ID: /^[0-9a-f]{32}$/i.test(String(env.CF_ACCOUNT_ID || '').trim()) ? 'ok' : (env.CF_ACCOUNT_ID ? 'should be 32 letters and numbers' : 'missing'),
  };
}

/* ------------------------------------------------------------------ Google */
async function googleToken(env) {
  const k = JSON.parse(env.GOOGLE_SA_KEY), t = Math.floor(Date.now() / 1000);
  const head = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64urlStr(JSON.stringify({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: t, exp: t + 3600 }));
  const pem = String(k.private_key).replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + claims));
  const r = await fetch(env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claims + '.' + b64url(sig) });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('Google sign-in for the service account failed (' + (j.error_description || j.error || r.status) + ')');
  return j.access_token;
}
async function gjson(url, token, body) {
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (j.error && j.error.message) || ('HTTP ' + r.status);
    throw new Error(r.status === 403 ? 'no access yet: add the service account’s email as a user (' + m.slice(0, 160) + ')' : m.slice(0, 240));
  }
  return j;
}
const rows = (rep) => (rep && rep.rows || []).map((r) => ({ d: (r.dimensionValues || []).map((x) => x.value), m: (r.metricValues || []).map((x) => num(x.value)) }));

async function ga4(env, token, days) {
  const url = (env.GA4_API || 'https://analyticsdata.googleapis.com') + '/v1beta/properties/' + String(env.GA4_PROPERTY_ID).trim() + ':batchRunReports';
  const range = [{ startDate: (days - 1) + 'daysAgo', endDate: 'today' }];
  const both = [{ startDate: (days - 1) + 'daysAgo', endDate: 'today', name: 'now' }, { startDate: (2 * days - 1) + 'daysAgo', endDate: days + 'daysAgo', name: 'before' }];
  const top = (dims, metric, limit, extra) => Object.assign({ dateRanges: range, dimensions: dims.map((name) => ({ name })), metrics: [{ name: metric }], orderBys: [{ metric: { metricName: metric }, desc: true }], limit }, extra || {});
  const [a, b] = await Promise.all([
    gjson(url, token, { requests: [
      { dateRanges: range, dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 },
      { dateRanges: both, metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }, { name: 'userEngagementDuration' }, { name: 'newUsers' }, { name: 'engagementRate' }] },
      top(['pagePath', 'pageTitle'], 'screenPageViews', 60),
      top(['sessionDefaultChannelGroup'], 'sessions', 12),
      top(['sessionSource'], 'sessions', 12),
    ] }),
    gjson(url, token, { requests: [
      Object.assign({ dateRanges: both, dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], limit: 20 }, { dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: Object.keys(EVENTS) } } } }),
      top(['deviceCategory'], 'activeUsers', 5),
      top(['country'], 'activeUsers', 10),
      top(['city'], 'activeUsers', 12),
      top(['newVsReturning'], 'activeUsers', 4),
    ] }),
  ]);
  const R = a.reports || [], S = b.reports || [];
  const tot = { now: [0, 0, 0, 0, 0, 0], before: [0, 0, 0, 0, 0, 0] };
  rows(R[1]).forEach((r) => { tot[r.d[0] === 'before' ? 'before' : 'now'] = r.m; });
  const pack = (m) => ({ visitors: m[0], views: m[1], sessions: m[2], avg_engaged_sec: m[0] ? Math.round(m[3] / m[0]) : 0, new_visitors: m[4], engagement_rate: Math.round(m[5] * 100) });
  const ev = {}; Object.keys(EVENTS).forEach((k) => { ev[k] = { label: EVENTS[k], now: 0, before: 0 }; });
  rows(S[0]).forEach((r) => { const e = ev[r.d[0]]; if (e) e[r.d[1] === 'before' ? 'before' : 'now'] += r.m[0]; });
  return {
    daily: rows(R[0]).map((r) => ({ date: r.d[0].replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3'), visitors: r.m[0], views: r.m[1] })),
    totals: pack(tot.now), before: pack(tot.before),
    pages: rows(R[2]).filter((r) => r.d[0] && r.d[0] !== '(not set)').map((r) => ({ path: r.d[0], title: r.d[1], views: r.m[0] })),
    channels: rows(R[3]).map((r) => ({ name: r.d[0], value: r.m[0] })),
    sources: rows(R[4]).map((r) => ({ name: r.d[0], value: r.m[0] })),
    actions: Object.keys(ev).map((k) => Object.assign({ id: k }, ev[k])),
    devices: rows(S[1]).map((r) => ({ name: r.d[0], value: r.m[0] })),
    countries: rows(S[2]).filter((r) => r.d[0] !== '(not set)').map((r) => ({ name: r.d[0], value: r.m[0] })),
    cities: rows(S[3]).filter((r) => r.d[0] !== '(not set)').map((r) => ({ name: r.d[0], value: r.m[0] })),
    returning: rows(S[4]).map((r) => ({ name: r.d[0], value: r.m[0] })),
  };
}

async function gsc(env, token, days) {
  const site = String(env.GSC_SITE || 'sc-domain:ywamsanfrancisco.org');
  const url = (env.GSC_API || 'https://www.googleapis.com') + '/webmasters/v3/sites/' + encodeURIComponent(site) + '/searchAnalytics/query';
  const end = sfDate(2), start = sfDate(days + 1), pend = sfDate(days + 2), pstart = sfDate(2 * days + 1);   // Search Console runs ~2 days behind
  const q = (dims, limit, s, e) => gjson(url, token, Object.assign({ startDate: s || start, endDate: e || end, rowLimit: limit, dataState: 'all' }, dims ? { dimensions: dims } : {}));
  const [byDate, byQuery, byPage, totNow, totBefore] = await Promise.all([q(['date'], 400), q(['query'], 20), q(['page'], 10), q(null, 1), q(null, 1, pstart, pend)]);
  const t = (j) => { const r = (j.rows || [])[0] || {}; return { clicks: num(r.clicks), impressions: num(r.impressions), ctr: Math.round(num(r.ctr) * 1000) / 10, position: Math.round(num(r.position) * 10) / 10 }; };
  return {
    from: start, to: end,
    daily: (byDate.rows || []).map((r) => ({ date: r.keys[0], clicks: num(r.clicks), impressions: num(r.impressions) })),
    queries: (byQuery.rows || []).map((r) => ({ query: r.keys[0], clicks: num(r.clicks), impressions: num(r.impressions), position: Math.round(num(r.position) * 10) / 10 })),
    pages: (byPage.rows || []).map((r) => ({ page: r.keys[0].replace(/^https?:\/\/[^/]+/, '') || '/', clicks: num(r.clicks), impressions: num(r.impressions) })),
    totals: t(totNow), before: t(totBefore),
  };
}

/* ------------------------------------------------------------------ Cloudflare */
async function cloudflare(env, days) {
  const run = async (hostFilter) => {
    const f = '{date_geq: $s, date_leq: $e' + (hostFilter ? ', requestHost_in: $h' : '') + '}';
    const g = (name, dim, order, limit) => `${name}: rumPageloadEventsAdaptiveGroups(limit: ${limit}, filter: ${f}, orderBy: [${order}]) { count sum { visits } dimensions { ${dim} } }`;
    const query = `query ($a: String!, $s: Date!, $e: Date!${hostFilter ? ', $h: [String!]' : ''}) { viewer { accounts(filter: {accountTag: $a}) {
      ${g('daily', 'date', 'date_ASC', 400)} ${g('pages', 'requestPath', 'count_DESC', 20)} ${g('refs', 'refererHost', 'count_DESC', 12)}
      ${g('countries', 'countryName', 'count_DESC', 10)} ${g('devices', 'deviceType', 'count_DESC', 5)} } } }`;
    const r = await fetch(env.CF_GRAPHQL || 'https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: 'Bearer ' + String(env.CF_ANALYTICS_TOKEN).trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { a: String(env.CF_ACCOUNT_ID).trim(), s: sfDate(days - 1), e: sfDate(0), h: HOSTS } }) });
    const j = await r.json().catch(() => ({}));
    if (j.errors && j.errors.length) throw new Error(String(j.errors[0].message || 'query failed').slice(0, 240));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const acc = (((j.data || {}).viewer || {}).accounts || [])[0];
    if (!acc) throw new Error('the token can’t see this account (check CF_ACCOUNT_ID and the token’s account)');
    return acc;
  };
  let acc;
  try { acc = await run(true); } catch (e) { if (/requestHost/i.test(e.message)) acc = await run(false); else throw e; }
  const list = (a, k) => (a || []).map((r) => ({ name: r.dimensions[k] || '(direct)', value: r.count, visits: num(r.sum && r.sum.visits) }));
  const daily = (acc.daily || []).map((r) => ({ date: r.dimensions.date, views: r.count, visits: num(r.sum && r.sum.visits) }));
  return {
    daily, totals: { views: daily.reduce((s, d) => s + d.views, 0), visits: daily.reduce((s, d) => s + d.visits, 0) },
    pages: list(acc.pages, 'requestPath'), referrers: list(acc.refs, 'refererHost').filter((r) => !/ywamsanfrancisco\.org|ywamembers\.org/.test(r.name)),
    countries: list(acc.countries, 'countryName'), devices: list(acc.devices, 'deviceType'),
  };
}

/* ------------------------------------------------------------------ sample numbers (before setup) */
function sample(days) {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const dates = []; for (let i = days - 1; i >= 0; i--) dates.push(sfDate(i));
  const base = (d, i) => { const dow = new Date(d + 'T12:00:00Z').getUTCDay(); return (dow === 0 ? 1.25 : dow === 6 ? 0.8 : 1) * (60 + i * 0.4) * (0.8 + rnd() * 0.4); };
  const daily = dates.map((d, i) => { const v = Math.round(base(d, i)); return { date: d, visitors: v, views: Math.round(v * (2.1 + rnd() * 0.5)) }; });
  const sum = (k) => daily.reduce((s, d) => s + d[k], 0);
  const P = [['/', 'YWAM San Francisco'], ['/volunteer/', 'Come volunteer'], ['/dts/', 'Discipleship Training School'], ['/ellis-room/', 'The Ellis Room'], ['/bring-a-team/', 'Bring a team'], ['/give/', 'Give'], ['/blog/2026/1/19/church-that-shows-up/', 'The church that shows up'], ['/about/people/', 'Staff & board'], ['/join-staff/', 'Join staff'], ['/blog/', 'Blog']];
  const v = sum('views');
  const pages = P.map((p, i) => ({ path: p[0], title: p[1], views: Math.round(v * [0.31, 0.14, 0.12, 0.08, 0.06, 0.05, 0.04, 0.035, 0.03, 0.028][i]) }));
  const visitors = sum('visitors');
  const g = { daily, totals: { visitors, views: v, sessions: Math.round(visitors * 1.3), avg_engaged_sec: 74, new_visitors: Math.round(visitors * 0.78), engagement_rate: 58 },
    before: { visitors: Math.round(visitors * 0.88), views: Math.round(v * 0.9), sessions: Math.round(visitors * 1.2), avg_engaged_sec: 69, new_visitors: Math.round(visitors * 0.7), engagement_rate: 55 },
    pages, channels: [['Organic Search', 0.46], ['Direct', 0.27], ['Organic Social', 0.15], ['Referral', 0.08], ['Email', 0.04]].map((c) => ({ name: c[0], value: Math.round(visitors * 1.3 * c[1]) })),
    sources: [['google', 0.42], ['(direct)', 0.27], ['instagram.com', 0.11], ['facebook.com', 0.05], ['ywam.org', 0.04], ['bing', 0.03]].map((c) => ({ name: c[0], value: Math.round(visitors * 1.3 * c[1]) })),
    actions: Object.keys(EVENTS).map((k, i) => ({ id: k, label: EVENTS[k], now: Math.round(days * [1.4, 0.6, 0.3, 0.5][i]), before: Math.round(days * [1.2, 0.7, 0.2, 0.5][i]) })),
    devices: [['mobile', 0.64], ['desktop', 0.33], ['tablet', 0.03]].map((c) => ({ name: c[0], value: Math.round(visitors * c[1]) })),
    countries: [['United States', 0.86], ['Canada', 0.03], ['United Kingdom', 0.02], ['Australia', 0.02], ['Germany', 0.01]].map((c) => ({ name: c[0], value: Math.round(visitors * c[1]) })),
    cities: [['San Francisco', 0.31], ['Oakland', 0.06], ['Los Angeles', 0.04], ['San Jose', 0.03], ['Seattle', 0.02], ['Kona', 0.02]].map((c) => ({ name: c[0], value: Math.round(visitors * c[1]) })),
    returning: [{ name: 'new', value: Math.round(visitors * 0.78) }, { name: 'returning', value: Math.round(visitors * 0.22) }] };
  const sc = { from: dates[0], to: dates[dates.length - 1], daily: daily.map((d) => ({ date: d.date, clicks: Math.round(d.visitors * 0.45), impressions: Math.round(d.visitors * 9) })),
    queries: [['ywam san francisco', 0.3], ['ywam sf', 0.12], ['volunteer san francisco tenderloin', 0.06], ['dts san francisco', 0.05], ['ellis room sf', 0.04], ['youth with a mission san francisco', 0.04], ['volunteer soup kitchen sf', 0.03], ['discipleship training school california', 0.02]].map((c, i) => ({ query: c[0], clicks: Math.round(visitors * 0.45 * c[1]), impressions: Math.round(visitors * 0.45 * c[1] * (4 + i * 3)), position: Math.round((1.2 + i * 1.3) * 10) / 10 })),
    pages: pages.slice(0, 6).map((p) => ({ page: p.path, clicks: Math.round(p.views * 0.2), impressions: Math.round(p.views * 3) })) };
  const clicks = sc.daily.reduce((s, d) => s + d.clicks, 0), imp = sc.daily.reduce((s, d) => s + d.impressions, 0);
  sc.totals = { clicks, impressions: imp, ctr: Math.round(clicks / imp * 1000) / 10, position: 6.4 }; sc.before = { clicks: Math.round(clicks * 0.85), impressions: Math.round(imp * 0.9), ctr: 4.8, position: 7.1 };
  const cf = { daily: daily.map((d) => ({ date: d.date, views: Math.round(d.views * 1.15), visits: Math.round(d.visitors * 1.25) })), pages: pages.map((p) => ({ name: p.path, value: Math.round(p.views * 1.15) })),
    referrers: [['(direct)', 0.5], ['www.google.com', 0.3], ['l.instagram.com', 0.1], ['m.facebook.com', 0.06]].map((c) => ({ name: c[0], value: Math.round(v * c[1]) })), countries: [], devices: [] };
  cf.totals = { views: cf.daily.reduce((s, d) => s + d.views, 0), visits: cf.daily.reduce((s, d) => s + d.visits, 0) };
  return { ga4: g, gsc: sc, cf };
}

/* ------------------------------------------------------------------ the report */
export async function analyticsReport(env, days, fresh) {
  days = [7, 30, 90].includes(days) ? days : 30;
  const st = analyticsStatus(env);
  const haveG = st.GOOGLE_SA_KEY === 'ok', haveGA = haveG && st.GA4_PROPERTY_ID === 'ok', haveCF = st.CF_ANALYTICS_TOKEN === 'ok' && st.CF_ACCOUNT_ID === 'ok';
  if (!haveG && !haveCF) return Object.assign({ days, sample: true, updated: Math.floor(Date.now() / 1000), status: { ga4: 'not set up', gsc: 'not set up', cf: 'not set up' }, setup: st }, sample(days));
  const key = 'report:' + days;
  if (!fresh) {
    try { const c = await env.DB.prepare('SELECT at, data FROM analytics_cache WHERE k = ?').bind(key).first(); if (c && Date.now() / 1000 - c.at < CACHE_FOR) return Object.assign(JSON.parse(c.data), { cached: true }); } catch (e) {}
  }
  const out = { days, sample: false, updated: Math.floor(Date.now() / 1000), status: {}, setup: st };
  let token = null;
  if (haveG) { try { token = await googleToken(env); } catch (e) { out.status.ga4 = out.status.gsc = e.message; } }
  await Promise.all([
    (async () => { if (!haveGA) { out.status.ga4 = out.status.ga4 || 'not set up'; return; } if (!token) return; try { out.ga4 = await ga4(env, token, days); out.status.ga4 = 'ok'; } catch (e) { out.status.ga4 = 'Google Analytics: ' + e.message; } })(),
    (async () => { if (!haveG) { out.status.gsc = 'not set up'; return; } if (!token) return; try { out.gsc = await gsc(env, token, days); out.status.gsc = 'ok'; } catch (e) { out.status.gsc = 'Search Console: ' + e.message; } })(),
    (async () => { if (!haveCF) { out.status.cf = 'not set up'; return; } try { out.cf = await cloudflare(env, days); out.status.cf = 'ok'; } catch (e) { out.status.cf = 'Cloudflare: ' + e.message; } })(),
  ]);
  if (out.ga4 || out.gsc || out.cf) {
    try { await env.DB.prepare('INSERT OR REPLACE INTO analytics_cache (k, at, data) VALUES (?, ?, ?)').bind(key, out.updated, JSON.stringify(out)).run(); } catch (e) {}
  }
  return out;
}
