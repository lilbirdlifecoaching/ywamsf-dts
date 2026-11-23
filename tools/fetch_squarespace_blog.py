"""One-off: copy the blog from the Squarespace site (www.ywamsanfrancisco.org) into this repository.

Run by .github/workflows/import-blog.yml (GitHub's servers can reach Squarespace; Claude's workspace can't).
Saves the raw posts to design-src/squarespace-blog/posts.json and every photo the posts use to
content/uploads/blog-*, with a map from the old Squarespace address to the new file in images.json.
tools/convert_blog.py then turns the raw posts into content/blog/*.json for the site.
"""
import json, os, re, sys, time, hashlib, urllib.request, urllib.parse

SITE = 'https://www.ywamsanfrancisco.org'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'design-src', 'squarespace-blog')
IMG = os.path.join(ROOT, 'content', 'uploads')   # saved as blog-<name>, next to the other uploaded photos
UA = {'User-Agent': 'Mozilla/5.0 (YWAM SF site migration)'}


def get(url, binary=False):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                d = r.read(); return d if binary else d.decode('utf-8')
        except Exception as e:
            print('retry', url, e); time.sleep(3 * (i + 1))
    raise SystemExit('Could not fetch ' + url)


def main():
    os.makedirs(RAW, exist_ok=True)
    items, url = [], SITE + '/blog?format=json'
    while url:
        j = json.loads(get(url)); items += j.get('items', [])
        p = j.get('pagination') or {}
        url = (SITE + p['nextPageUrl'] + ('&' if '?' in p['nextPageUrl'] else '?') + 'format=json') if p.get('nextPage') else None
    print(len(items), 'posts listed')
    posts = []
    for it in items:
        full = json.loads(get(SITE + it['fullUrl'] + '?format=json'))['item']
        full.pop('collection', None); posts.append(full); time.sleep(.3)
    json.dump(posts, open(os.path.join(RAW, 'posts.json'), 'w'), ensure_ascii=False, indent=1)
    # photos
    urls = set()
    for p in posts:
        b = p.get('body') or ''
        for m in re.finditer(r'(?:data-src|src|data-image|href)="(https://(?:images\.squarespace-cdn\.com|static1\.squarespace\.com)/[^"]+)"', b):
            u = m.group(1).split('?')[0]
            if re.search(r'\.(jpe?g|png|gif|webp)$', u, re.I) or 'images.squarespace-cdn.com' in u: urls.add(u)
        for k in ('assetUrl',):
            if p.get(k): urls.add(p[k].split('?')[0])
    mp = {}
    for u in sorted(urls):
        name = urllib.parse.unquote(u.rsplit('/', 1)[-1]).replace('+', '-')
        name = re.sub(r'[^A-Za-z0-9._-]+', '-', name).strip('-').lower() or 'image'
        base, ext = os.path.splitext(name)
        if ext.lower() not in ('.jpg', '.jpeg', '.png', '.gif', '.webp'): ext = '.jpg'
        name = 'blog-%s-%s%s' % (base[:50], hashlib.sha1(u.encode()).hexdigest()[:6], ext.lower())
        try:
            data = get(u + '?format=1500w', binary=True)
        except SystemExit:
            print('SKIP', u); continue
        open(os.path.join(IMG, name), 'wb').write(data); mp[u] = 'uploads/' + name
    json.dump(mp, open(os.path.join(RAW, 'images.json'), 'w'), indent=1)
    print(len(posts), 'posts,', len(mp), 'photos')


if __name__ == '__main__':
    main()
