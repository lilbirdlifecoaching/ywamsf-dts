// Page speed grades: runs Google Lighthouse (phone settings, like Google's own PageSpeed test) on the main pages of the
// live site and writes a plain-English report. Run by .github/workflows/speed-check.yml.
//   SITE=https://ywamsanfrancisco.org/  PAGES="dts/ volunteer/"  (optional)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const lighthouse = (await import(require.resolve('lighthouse'))).default;
const chromeLauncher = require('chrome-launcher');

const SITE = (process.env.SITE || 'https://ywamsanfrancisco.org/').replace(/\/?$/, '/');
const PAGES = (process.env.PAGES || ' about/ about/people/ about/news/ about/resources/ blog/ blog/2026/1/19/church-that-shows-up/ contact/ dts/ dts/apply/ dts/inquire/ ellis-room/ give/ join-staff/ teams/ volunteer/ newsletter/ privacy/').split(' ');
const RUNS = +process.env.RUNS || 2;   // best of N: one run can be slow by chance

const grade = (s) => s >= 90 ? 'A (fast)' : s >= 75 ? 'B (good)' : s >= 50 ? 'C (needs work)' : 'D (slow)';
const ms = (v) => v == null ? '–' : v >= 1000 ? (v / 1000).toFixed(1) + 's' : Math.round(v) + 'ms';
const kb = (b) => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
const vital = (id, v) => {   // Google's "good / needs improvement / poor" bands
  const t = { lcp: [2500, 4000], cls: [0.1, 0.25], tbt: [200, 600], fcp: [1800, 3000] }[id];
  return v == null ? '' : v <= t[0] ? '✅' : v <= t[1] ? '🟡' : '🔴';
};

const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'] });
const rows = [];
for (const p of PAGES) {
  let best = null;
  for (let i = 0; i < RUNS; i++) {
    try {
      const r = await lighthouse(SITE + p, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance'], formFactor: 'mobile', screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2 } });
      const lhr = r.lhr, a = lhr.audits;
      const res = {
        page: '/' + p, score: Math.round((lhr.categories.performance.score || 0) * 100),
        lcp: a['largest-contentful-paint'].numericValue, cls: a['cumulative-layout-shift'].numericValue, tbt: a['total-blocking-time'].numericValue,
        fcp: a['first-contentful-paint'].numericValue, bytes: a['total-byte-weight'].numericValue,
        lcpEl: ((a['largest-contentful-paint-element'] || {}).details || {}).items?.[0]?.items?.[0]?.node?.snippet || '',
        big: (((a['total-byte-weight'] || {}).details || {}).items || []).slice(0, 3).map((x) => x.url.replace(SITE, '/').split('?')[0] + ' ' + kb(x.totalBytes)),
        tips: Object.values(a).filter((x) => x.details && x.details.type === 'opportunity' && (x.details.overallSavingsMs || 0) >= 300).sort((x, y) => y.details.overallSavingsMs - x.details.overallSavingsMs).slice(0, 3).map((x) => x.title + ' (~' + ms(x.details.overallSavingsMs) + ')'),
      };
      if (!best || res.score > best.score) best = res;
    } catch (e) { if (!best) best = { page: '/' + p, error: String(e.message || e).slice(0, 120) }; }
  }
  rows.push(best); console.log(best.page, best.score ?? best.error);
}
await chrome.kill();

const ok = rows.filter((r) => r.score != null), avg = ok.length ? Math.round(ok.reduce((s, r) => s + r.score, 0) / ok.length) : 0;
const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' });
const md = [
  `# Page speed: average ${avg}/100 on phones`, '', `${SITE} · ${stamp} (San Francisco time) · Google Lighthouse, phone on a slow 4G connection (best of ${RUNS})`, '',
  '| Page | Score | Grade | Main content shows (LCP) | Layout jumps (CLS) | Busy time (TBT) | Page weight |', '|---|---|---|---|---|---|---|',
  ...rows.slice().sort((x, y) => (x.score ?? -1) - (y.score ?? -1)).map((r) => r.error ? `| ${r.page} | – | couldn't test: ${r.error} | | | | |`
    : `| ${r.page} | ${r.score} | ${grade(r.score)} | ${vital('lcp', r.lcp)} ${ms(r.lcp)} | ${vital('cls', r.cls)} ${r.cls.toFixed(2)} | ${vital('tbt', r.tbt)} ${ms(r.tbt)} | ${kb(r.bytes)} |`),
  '', '✅ good · 🟡 needs improvement · 🔴 poor (Google’s bands: main content within 2.5s, layout jumps under 0.1, busy time under 200ms)', '',
  '## Details for the slowest pages', '',
  ...rows.filter((r) => r.score != null && r.score < 90).sort((x, y) => x.score - y.score).flatMap((r) => [`### ${r.page} (${r.score})`,
    `- Main content: ${r.lcpEl ? '`' + r.lcpEl.slice(0, 140).replace(/`/g, "'") + '`' : '–'}`, `- Heaviest files: ${r.big.join(', ') || '–'}`, `- Biggest fixes: ${r.tips.join('; ') || '–'}`, '']),
].join('\n');
fs.writeFileSync('speed-report.md', md + '\n');
fs.writeFileSync('speed-report.json', JSON.stringify({ site: SITE, at: new Date().toISOString(), avg, rows }, null, 1));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log('\n' + md);
