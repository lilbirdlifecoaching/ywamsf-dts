"""Full-page screenshots of built pages, for checking changes before pushing.

Usage (from the repo root, after building):
    V=6 python3 src/build.py
    python3 tools/screenshot_pages.py check ",course/,join-staff/"      # "" = home page
    python3 tools/contact_sheet.py check course                          # stitch one page into a single image

Writes <tag>_<page>.png (full page) and <tag>_<page>_<n>.png (2400px-tall slices at half size)
to the current folder. Needs: pip install playwright pillow && playwright install chromium.
Set SITE=ywam5 to check YWAM 5 instead of YWAM 6.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SITE = os.environ.get('SITE', 'ywam6')
tag, pages = sys.argv[1], sys.argv[2].split(',')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for pg_ in pages:
            pg = await b.new_page(viewport={'width': 1440, 'height': 900})
            await pg.goto('file://%s/%s/%sindex.html' % (ROOT, SITE, pg_))
            await pg.wait_for_timeout(800)
            # show everything that normally fades in on scroll
            await pg.evaluate("document.querySelectorAll('.rv').forEach(e=>e.classList.add('in','on','is-in'))")
            await pg.evaluate("window.scrollTo(0,document.body.scrollHeight)"); await pg.wait_for_timeout(600); await pg.evaluate("window.scrollTo(0,0)")
            name = (pg_.strip('/') or 'home').replace('/', '-')
            fn = '%s_%s.png' % (tag, name)
            await pg.screenshot(path=fn, full_page=True)
            im = Image.open(fn); w, h = im.size
            for i in range(0, h, 2400):
                im.crop((0, i, w, min(h, i + 2400))).resize((720, round((min(h, i + 2400) - i) / 2))).save('%s_%s_%d.png' % (tag, name, i // 2400))
            await pg.close()
        await b.close()

asyncio.run(main())
