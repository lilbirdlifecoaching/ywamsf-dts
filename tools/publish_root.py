"""Publish YWAM 7 as the main site (https://ywamsanfrancisco.org/).

    ROOT_SITE=1 OUT=.site7 python3 src7/build.py && python3 tools/publish_root.py

The site is built into .site7/ (not committed) and copied to the top of the repository. The list of
published files is kept in site-files.txt, so files a later build no longer makes are removed, and
nothing else at the top of the repository (admin/, content/, src*/, ywam0-6/, …) is ever touched.

Old addresses keep working through small redirect pages:
  /ywam7/<page>/  →  /<page>/      (YWAM 7's previous home)
  /course/…       →  /dts/…        (the DTS page's previous address)
  old Squarespace pages (tools/old_addresses.txt, tools/old_events.txt) → their new pages
Redirect pages use SITE_BASE (default https://ywamsanfrancisco.org/) for their canonical address.
"""
import os, shutil, sys, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '.site7')
MANIFEST = os.path.join(ROOT, 'site-files.txt')
PROTECTED = {'admin', 'content', 'src', 'src7', 'service', 'tools', 'design-src', 'legacy', 'am-i-ready', '.github',
             'CNAME', 'README.md', 'CLAUDE.md', 'favicon.png', '.gitignore', 'site-files.txt', '.site7', '.git'} | {'ywam%d' % i for i in range(0, 7)}
OLD_DTS = 'course'          # the DTS page used to live at /course/
BASE = (os.environ.get('SITE_BASE') or 'https://ywamsanfrancisco.org/').rstrip('/')


def old_squarespace():
    """Old Squarespace address → new page, from tools/old_addresses.txt and tools/old_events.txt."""
    out = {}
    for line in open(os.path.join(ROOT, 'tools', 'old_addresses.txt')):
        line = line.split('#', 1)[0] if line.lstrip().startswith('#') else line
        parts = line.split()
        if len(parts) == 2: out[parts[0].strip('/')] = parts[1]
    for line in open(os.path.join(ROOT, 'tools', 'old_events.txt')):
        if line.strip() and not line.startswith('#'): out[line.strip().strip('/')] = 'about/news/#events'
    return out


def redirect_page(target, noindex=True):
    # An instant redirect (meta refresh 0 + script) is treated by Google as a permanent (301) redirect.
    t = html.escape(target, quote=True); canon = html.escape(BASE + target.split('#')[0], quote=True)
    keep = 'location.search + location.hash' if '#' not in target else "''"
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">%s'
            '<title>This page has moved — YWAM San Francisco</title><link rel="canonical" href="%s">'
            '<meta http-equiv="refresh" content="0; url=%s"><script>location.replace(%r + %s)</script></head>'
            '<body><p><a href="%s">This page has moved. Continue →</a></p></body></html>\n') % (
        '<meta name="robots" content="noindex">' if noindex else '', canon, t, target, keep, t)


def main():
    if not os.path.isfile(os.path.join(SRC, 'index.html')):
        sys.exit('Build first: ROOT_SITE=1 OUT=.site7 python3 src7/build.py')
    new = {}
    for d, _, fs in os.walk(SRC):
        for f in fs:
            full = os.path.join(d, f); rel = os.path.relpath(full, SRC).replace(os.sep, '/')
            new[rel] = full
    # redirects from the old addresses
    pages = sorted(r[:-len('index.html')] for r in new if r.endswith('index.html'))
    gen = {}
    for p in pages:
        gen['ywam7/' + p + 'index.html'] = '/' + p
        if p.startswith('dts/'):
            gen['ywam7/' + OLD_DTS + '/' + p[4:] + 'index.html'] = '/' + p
            gen[OLD_DTS + '/' + p[4:] + 'index.html'] = '/' + p
    old = {}
    for src, dst in old_squarespace().items():
        rel = src + '/index.html'
        if rel in new: continue                          # the new site has a page at the same address
        old[rel] = dst if dst.startswith('/') else '/' + dst
    gen.update(old)
    tops = {r.split('/', 1)[0] for r in list(new) + [g for g in gen if not g.startswith('ywam7/')]}
    clash = sorted(tops & PROTECTED)
    if clash: sys.exit('Refusing to publish: the site would overwrite ' + ', '.join(clash))

    prev = set()
    if os.path.exists(MANIFEST): prev = {l.strip() for l in open(MANIFEST) if l.strip()}
    keep = set(new) | {g for g in gen if not g.startswith('ywam7/')}
    for rel in sorted(prev - keep):                      # files the site no longer makes
        if rel.split('/', 1)[0] in PROTECTED: continue
        path = os.path.join(ROOT, rel)
        if os.path.isfile(path): os.remove(path)
    for rel, full in new.items():
        dst = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(full, dst)
    # ywam7/ now only holds redirects: rebuild it from scratch
    y7 = os.path.join(ROOT, 'ywam7')
    if os.path.isdir(y7): shutil.rmtree(y7)
    for rel, target in gen.items():
        dst = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'w').write(redirect_page(target, noindex=rel not in old))
    # tidy empty folders left behind by removed files
    for rel in sorted(prev - keep, key=lambda r: -r.count('/')):
        d = os.path.dirname(os.path.join(ROOT, rel))
        while d != ROOT and os.path.isdir(d) and not os.listdir(d) and os.path.relpath(d, ROOT).split(os.sep)[0] not in PROTECTED:
            os.rmdir(d); d = os.path.dirname(d)
    open(MANIFEST, 'w').write('\n'.join(sorted(keep)) + '\n')
    print('published %d files to the site root, %d redirect pages' % (len(new), len(gen)))


if __name__ == '__main__':
    main()
