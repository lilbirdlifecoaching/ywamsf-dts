"""Safety check run by every workflow that rebuilds the site, BEFORE anything is published.

The site launched on https://ywamsanfrancisco.org on Nov 23 2026. A build made with the wrong settings would hide every
page from Google ("noindex") or point Google at the old test domain (this happened once, from the Squarespace-mirror
workflow). If any of these checks fail, the workflow stops and nothing is committed, so the live site stays as it was.

    python3 tools/check_launch.py
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOMAIN = 'https://ywamsanfrancisco.org/'
problems = []

def read(p):
    try: return open(os.path.join(ROOT, p), encoding='utf-8').read()
    except OSError: problems.append('%s is missing' % p); return ''

cname = read('CNAME').strip()
if cname != 'ywamsanfrancisco.org': problems.append('CNAME says %r (must be ywamsanfrancisco.org, or the domain stops working)' % cname)
for page in ['index.html', 'dts/index.html', 'volunteer/index.html', 'blog/index.html']:
    h = read(page)
    if not h: continue
    if re.search(r'<meta name="robots" content="[^"]*noindex', h): problems.append(page + ' is hidden from Google (noindex)')
    m = re.search(r'<link rel="canonical" href="([^"]+)"', h)
    if not m or not m.group(1).startswith(DOMAIN): problems.append('%s canonical address is %s' % (page, m.group(1) if m else 'missing'))
    if 'ywamembers.org' in re.sub(r'<script[^>]*>.*?</script>', '', h, flags=re.S): problems.append(page + ' mentions the old test domain ywamembers.org')
sm = read('sitemap.xml')
locs = re.findall(r'<loc>([^<]+)</loc>', sm)
if len(locs) < 50: problems.append('sitemap.xml lists only %d pages' % len(locs))
bad = [u for u in locs if not u.startswith(DOMAIN)]
if bad: problems.append('sitemap.xml has %d addresses not on %s (e.g. %s)' % (len(bad), DOMAIN, bad[0]))
rb = read('robots.txt')
if 'Sitemap: ' + DOMAIN + 'sitemap.xml' not in rb: problems.append('robots.txt does not point at %ssitemap.xml' % DOMAIN)
if re.search(r'^Disallow:\s*/\s*$', rb, re.M): problems.append('robots.txt blocks the whole site')

if problems:
    print('LAUNCH SETTINGS CHECK FAILED: nothing will be published.\n- ' + '\n- '.join(problems))
    sys.exit(1)
print('Launch settings OK: %d sitemap pages on %s, indexable, CNAME set.' % (len(locs), DOMAIN))
