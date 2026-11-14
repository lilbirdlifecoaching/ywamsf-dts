"""Download the files the site still loads from Squarespace (tools/mirror.txt) into src7/assets/,
so the site keeps working after the Squarespace subscription ends. Run by .github/workflows/mirror.yml.
Images go to src7/assets/sq/<hash>.<ext> (1500px wide), PDFs to src7/assets/files/<name>.pdf.
src7/build.py swaps in the local copy wherever one exists."""
import hashlib, os, sys, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def local_name(url):
    path = url.split('?')[0]
    if path.lower().endswith('.pdf'): return 'files/' + path.rsplit('/', 1)[1]
    ext = os.path.splitext(path)[1].lower()
    ext = ext if ext in ('.jpg', '.jpeg', '.png', '.webp', '.gif') else '.jpg'
    return 'sq/' + hashlib.sha1(path.encode()).hexdigest()[:16] + ext
if __name__ == '__main__':
    urls = [l.strip() for l in open(os.path.join(ROOT, 'tools', 'mirror.txt')) if l.strip() and not l.startswith('#')]
    ok = fail = skip = 0
    for u in urls:
        dest = os.path.join(ROOT, 'src7', 'assets', local_name(u))
        if os.path.exists(dest): skip += 1; continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        src = u if u.lower().endswith('.pdf') else u + '?format=1500w'
        for attempt in range(3):
            try:
                req = urllib.request.Request(src, headers={'User-Agent': 'Mozilla/5.0 (YWAM SF site mirror)'})
                data = urllib.request.urlopen(req, timeout=60).read()
                if len(data) < 200: raise ValueError('too small')
                open(dest, 'wb').write(data); ok += 1; break
            except Exception as e:
                if attempt == 2: print('FAILED', u, e, file=sys.stderr); fail += 1
                time.sleep(2)
    print('downloaded %d, already had %d, failed %d' % (ok, skip, fail))
