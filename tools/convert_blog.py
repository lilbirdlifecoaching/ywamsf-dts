"""Turn the raw Squarespace posts (design-src/squarespace-blog/posts.json, from tools/fetch_squarespace_blog.py)
into one clean file per post in content/blog/, ready for the site builder and the admin page.

    python3 tools/convert_blog.py

Each post keeps its Squarespace address (for example blog/2026/1/19/church-that-shows-up/), so links and
Google results keep working when the domain moves. The text is reduced to plain, safe HTML (paragraphs,
headings, lists, quotes, links, photos, YouTube videos); Squarespace layout code, scripts and styles are dropped.
Photos point at the copies in content/uploads/ (blog-*). Running it again overwrites content/blog/.
"""
import json, os, re, html, datetime
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'design-src', 'squarespace-blog')
OUT = os.path.join(ROOT, 'content', 'blog')
OLD_HOSTS = re.compile(r'^https?://(www\.)?ywamsanfrancisco\.org', re.I)

posts = json.load(open(os.path.join(RAW, 'posts.json'), encoding='utf-8'))
IMAGES = json.load(open(os.path.join(RAW, 'images.json')))
PATHS = {p['fullUrl'].rstrip('/') for p in posts}


def local_img(u):
    u = html.unescape(u or '').split('?')[0]
    if u.startswith('//'): u = 'https:' + u
    return IMAGES.get(u, '')


def fix_link(h):
    h = html.unescape(h or '').strip()
    if h.startswith('/') and not h.startswith('//'): h = 'https://www.ywamsanfrancisco.org' + h
    m = OLD_HOSTS.match(h)
    if m:
        path = h[m.end():] or '/'
        if path.split('?')[0].split('#')[0].rstrip('/') in PATHS: return path   # a moved post: link within the new site
    if re.match(r'^(https?://|mailto:|tel:)', h, re.I): return h
    return ''


class Clean(HTMLParser):
    """Walks the Squarespace HTML and writes only the parts that carry meaning."""
    KEEP = {'p': 'p', 'h1': 'h2', 'h2': 'h2', 'h3': 'h3', 'h4': 'h4', 'strong': 'strong', 'b': 'strong', 'em': 'em', 'i': 'em',
            'ul': 'ul', 'ol': 'ol', 'li': 'li', 'blockquote': 'blockquote', 'figcaption': 'figcaption', 'sup': 'sup', 'sub': 'sub'}
    SKIP = {'script', 'style', 'noscript', 'svg', 'button', 'form', 'template', 'iframe'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.stack, self.skip, self.seen_imgs, self.code = [], [], 0, set(), 0
        self.div_classes = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs); cls = a.get('class') or ''
        if tag == 'div':
            mark = None
            if 'sqs-block-code' in cls or 'sqs-block-spacer' in cls: mark = 'skip'
            elif 'sqs-video-wrapper' in cls and a.get('data-html'):
                m = re.search(r'youtube(?:-nocookie)?\.com/embed/([A-Za-z0-9_-]{6,20})', html.unescape(a['data-html']))
                if m: self.out.append('<div class="yt" data-yt="%s"></div>' % m.group(1))
            elif 'image-caption' in cls: mark = None
            self.div_classes.append(mark)
            if mark == 'skip': self.skip += 1
            return
        if self.skip:
            if tag not in ('img', 'br', 'hr'):
                self.stack.append('#skip' if tag in self.SKIP else '#none')
                if tag in self.SKIP: self.skip += 1
            return
        if tag in self.SKIP:
            self.skip += 1; self.stack.append('#skip'); return
        if tag == 'img':
            src = local_img(a.get('data-src') or a.get('data-image') or a.get('src'))
            if src and src not in self.seen_imgs:
                self.seen_imgs.add(src)
                alt = (a.get('alt') or '').strip()
                if re.search(r'\.(jpe?g|png|gif|webp)$', alt, re.I) or re.fullmatch(r'[A-Z0-9_ -]{3,}\d', alt): alt = ''
                self.out.append('<img src="%s" alt="%s">' % (src, html.escape(alt, quote=True)))
            return
        if tag == 'br': self.out.append('<br>'); return
        if tag == 'hr': self.out.append('<hr>'); return
        if tag == 'a':
            h = fix_link(a.get('href'))
            if h and not re.search(r'squarespace-cdn\.com|static1\.squarespace\.com', h):
                btn = 'sqs-block-button-element' in cls
                self.out.append('<a href="%s"%s>' % (html.escape(h, quote=True), ' class="btn"' if btn else ''))
                self.stack.append('a')
            else:
                self.stack.append('#none')
            return
        if tag == 'figure':
            self.out.append('<figure>'); self.stack.append('figure'); return
        if tag in self.KEEP:
            self.out.append('<%s>' % self.KEEP[tag]); self.stack.append(self.KEEP[tag]); return
        if tag in ('span', 'section', 'article', 'header', 'footer', 'main'):
            self.stack.append('#none'); return
        self.stack.append('#none')

    def handle_startendtag(self, tag, attrs):
        if tag in ('img', 'br', 'hr'): self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == 'div':
            if self.div_classes:
                mark = self.div_classes.pop()
                if mark == 'skip': self.skip -= 1
            return
        if tag in ('img', 'br', 'hr'): return
        if not self.stack: return
        top = self.stack.pop()
        if top == '#skip': self.skip -= 1; return
        if self.skip or top == '#none': return
        self.out.append('</%s>' % top)

    def handle_data(self, d):
        if self.skip: return
        self.out.append(html.escape(d, quote=False))


def clean_body(b):
    c = Clean(); c.feed(b or ''); c.close()
    s = ''.join(c.out)
    s = re.sub(r'\s+', ' ', s)
    s = s.replace(' ', ' ')
    for _ in range(3):
        s = re.sub(r'<(p|h2|h3|h4|strong|em|li|blockquote|figcaption|figure|a[^>]*)>\s*(<br>\s*)*</(p|h2|h3|h4|strong|em|li|blockquote|figcaption|figure|a)>', '', s)
    s = re.sub(r'(<br>\s*){3,}', '<br><br>', s)
    s = re.sub(r'<p>\s*(<br>\s*)+', '<p>', s); s = re.sub(r'(\s*<br>)+\s*</p>', '</p>', s)
    s = re.sub(r'<blockquote>\s*“\s*', '<blockquote>', s)
    s = re.sub(r'\s*(<(?:p|h2|h3|h4|ul|ol|li|blockquote|figure|figcaption|hr|img|div)\b)', r'\n\1', s)
    # runs of photos (Squarespace galleries) become a grid
    s = re.sub(r'(?:\n<img [^>]*>[ ]*){2,}', lambda m: '\n<div class="gal">' + ''.join(re.findall(r'<img [^>]*>', m.group(0))) + '</div>', s)
    return s.strip()


def plain(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.json'): os.remove(os.path.join(OUT, f))
    n = 0
    for p in posts:
        body = clean_body(p.get('body'))
        if not p.get('title') or not plain(body): continue
        path = p['fullUrl'].strip('/') + '/'
        seo = p.get('seoData') or {}
        date = datetime.datetime.fromtimestamp((p.get('publishOn') or p.get('addedOn')) / 1000, datetime.timezone.utc)
        # San Francisco time, so a post published in the evening keeps its date
        date = (date - datetime.timedelta(hours=8)).strftime('%Y-%m-%d')
        excerpt = plain(p.get('excerpt')) or plain(body)[:240]
        rec = {
            'title': plain(p['title']), 'path': path, 'date': date,
            'author': ((p.get('author') or {}).get('displayName') or '').strip(),
            'categories': [str(c) for c in (p.get('categories') or [])], 'tags': [str(t) for t in (p.get('tags') or [])],
            'excerpt': excerpt, 'image': local_img(p.get('assetUrl')),
            'seo_title': (seo.get('seoTitle') or '').strip(), 'seo_description': (seo.get('seoDescription') or '').strip(),
            'body': body, 'source': 'https://www.ywamsanfrancisco.org' + p['fullUrl'],
        }
        name = re.sub(r'[^a-z0-9]+', '-', path.lower()).strip('-')[:120] + '.json'
        json.dump(rec, open(os.path.join(OUT, name), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        n += 1
    print('wrote %d posts to content/blog/' % n)


if __name__ == '__main__':
    main()
