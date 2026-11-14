"""Publish YWAM 7 as the main site (https://ywamembers.org/).

    ROOT_SITE=1 OUT=.site7 python3 src7/build.py && python3 tools/publish_root.py

The site is built into .site7/ (not committed) and copied to the top of the repository. The list of
published files is kept in site-files.txt, so files a later build no longer makes are removed, and
nothing else at the top of the repository (admin/, content/, src*/, ywam0-6/, …) is ever touched.

Old addresses keep working through small redirect pages:
  /ywam7/<page>/  →  /<page>/      (YWAM 7's previous home)
  /course/…       →  /dts/…        (the DTS page's previous address)
"""
import os, shutil, sys, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '.site7')
MANIFEST = os.path.join(ROOT, 'site-files.txt')
PROTECTED = {'admin', 'content', 'src', 'src7', 'service', 'tools', 'design-src', 'legacy', 'am-i-ready', '.github',
             'CNAME', 'README.md', 'CLAUDE.md', 'favicon.png', '.gitignore', 'site-files.txt', '.site7', '.git'} | {'ywam%d' % i for i in range(0, 7)}
OLD_DTS = 'course'          # the DTS page used to live at /course/


def redirect_page(target):
    t = html.escape(target, quote=True)
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">'
            '<title>This page has moved — YWAM San Francisco</title><link rel="canonical" href="https://ywamembers.org%s">'
            '<meta http-equiv="refresh" content="0; url=%s"><script>location.replace(%r + location.search + location.hash)</script></head>'
            '<body><p><a href="%s">This page has moved. Continue →</a></p></body></html>\n') % (t, t, target, t)


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
    tops = {r.split('/', 1)[0] for r in list(new) + [g for g in gen if not g.startswith('ywam7/')]}
    clash = sorted(tops & PROTECTED)
    if clash: sys.exit('Refusing to publish: the site would overwrite ' + ', '.join(clash))

    old = set()
    if os.path.exists(MANIFEST): old = {l.strip() for l in open(MANIFEST) if l.strip()}
    keep = set(new) | {g for g in gen if not g.startswith('ywam7/')}
    for rel in sorted(old - keep):                      # files the site no longer makes
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
        open(dst, 'w').write(redirect_page(target))
    # tidy empty folders left behind by removed files
    for rel in sorted(old - keep, key=lambda r: -r.count('/')):
        d = os.path.dirname(os.path.join(ROOT, rel))
        while d != ROOT and os.path.isdir(d) and not os.listdir(d) and os.path.relpath(d, ROOT).split(os.sep)[0] not in PROTECTED:
            os.rmdir(d); d = os.path.dirname(d)
    open(MANIFEST, 'w').write('\n'.join(sorted(keep)) + '\n')
    print('published %d files to the site root, %d redirect pages' % (len(new), len(gen)))


if __name__ == '__main__':
    main()
