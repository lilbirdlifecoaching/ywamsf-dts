#!/usr/bin/env python3
"""Builds YWAM 5: home + Come Volunteer + Bring a Team + Ellis Room + 5 Month Course."""
import os, re, html, shutil, json, hashlib, datetime
from zoneinfo import ZoneInfo
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = int(os.environ.get('V', '5'))
OUT = os.environ.get('OUT') or os.path.join(ROOT, 'ywam%d' % V)
CONTENT = os.path.join(ROOT, 'content')
SF = ZoneInfo('America/Los_Angeles')
TODAY = datetime.date.fromisoformat(os.environ['TODAY']) if os.environ.get('TODAY') else datetime.datetime.now(SF).date()
if os.path.isdir(OUT): shutil.rmtree(OUT)
shutil.copytree(os.path.join(ROOT, 'src', 'assets'), os.path.join(OUT, 'assets'))
UPRE = re.compile(r'uploads/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:jpe?g|png|webp)$')
os.makedirs(os.path.join(OUT, 'assets', 'uploads'), exist_ok=True)
for f in sorted(os.listdir(os.path.join(CONTENT, 'uploads'))):
    if UPRE.match('uploads/' + f): shutil.copy2(os.path.join(CONTENT, 'uploads', f), os.path.join(OUT, 'assets', 'uploads', f))
_h = hashlib.sha1()
for d, _, fs in sorted(os.walk(os.path.join(ROOT, 'src', 'assets'))):
    for f in sorted(fs):
        if f.endswith(('.css', '.js')): _h.update(open(os.path.join(d, f), 'rb').read())
VER = _h.hexdigest()[:10]

# ---------------------------------------------------------------- CONTENT (edited in /admin)
def js(o): return json.dumps(o).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
def load(name):
    with open(os.path.join(CONTENT, name), encoding='utf-8') as fh: return json.load(fh)
def t(v):
    """plain text from the admin, made safe for HTML"""
    return html.escape(re.sub(r'\s+', ' ', str(v if v is not None else '')).strip(), quote=True)
def lnk(v, default='', raw=False):
    v = str(v or '').strip()
    if not re.match(r'^(https://|http://|mailto:|tel:)[^\s<>"]+$', v, re.I): return default
    return v if raw else html.escape(v, quote=True)
def mail(v, default):
    v = str(v or '').strip()
    return v if re.fullmatch(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', v) else default
def img(v, up, w=1500):
    v = str(v or '').strip()
    if UPRE.match(v): return up + 'assets/' + v
    if v.startswith('https://images.squarespace-cdn.com/'): return html.escape(re.sub(r'\?.*$', '', v), quote=True) + '?format=%dw' % w
    return ''
def num(v, default=0):
    try: return float(v)
    except (TypeError, ValueError): return default
def mins(hhmm):
    m = re.fullmatch(r'(\d{1,2}):(\d{2})', str(hhmm or '').strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else 0
def initials(n): return ''.join(w[0] for w in str(n).split()[:2]).upper()

S = load('settings.json')
PHONE = t(S.get('phone') or '415-885-6543'); TEL = 'tel:' + re.sub(r'[^0-9+]', '', S.get('phone') or '4158856543')
EMAIL = mail(S.get('email'), 'info@ywamsanfrancisco.org'); VEMAIL = mail(S.get('volunteer_email'), 'volunteer@ywamsanfrancisco.org')
OEMAIL = mail(S.get('outreach_email'), 'outreach@ywamsanfrancisco.org'); DEMAIL = mail(S.get('dts_email'), 'dts@ywamsanfrancisco.org')
ADDR = t(S.get('address') or '357 Ellis Street'); CITY = t(S.get('city') or 'San Francisco, CA 94102')
MA_RATE = int(num(S.get('ma_price_per_day'), 100)) or 100

# DTS schools: one list drives every date and price on the site
def _d(v):
    try: return datetime.date.fromisoformat(str(v))
    except ValueError: return None
_DTS = load('dts.json')
SCHOOLS = sorted([dict(x, _s=_d(x.get('start')), _e=_d(x.get('end'))) for x in _DTS.get('schools', []) if _d(x.get('start')) and _d(x.get('end'))], key=lambda x: x['_s'])
ACTIVE = [x for x in SCHOOLS if x['_e'] >= TODAY]            # on the board (in session or upcoming)
UPCOMING = [x for x in SCHOOLS if x['_s'] > TODAY]           # can still apply
NX = UPCOMING[0] if UPCOMING else None
def md(d): return d.strftime('%b ') + str(d.day)
def mdy(d): return md(d) + ', ' + str(d.year)
def drange(a, b): return (md(a) if a.year == b.year else mdy(a)) + ' – ' + mdy(b)
def ordn(n): return str(n) + ('th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th'))
def money(v): return '${:,.0f}'.format(num(v))
DTS_COST = num((NX or (SCHOOLS[-1] if SCHOOLS else {})).get('cost'), 8000) or 8000
C = 'https://images.squarespace-cdn.com/content/v1/56e87b56d51cd42c04a4fd37/'
def ph(k, w=1500): return C + P[k] + '?format=%dw' % w
P = {
 'preach': 'b35aba7c-2f00-4ad9-a1b9-1abfb7c52e46/Mark-preaching.jpg',
 'rain': '5ba0f660-bbf7-4144-b64a-585367f72114/BLOG1.jpg',
 'kitchen': '1575500058941-V8ANWXNMA9KBPJ0BNMBK/IMG_4598.jpeg',
 'eggs': '1523470468503-LAPWPKY6R826VXHL68K4/15032668_1220674414661086_4026214942382535655_n.jpg',
 'signst': '1540831552303-HBK9EJDA16MALV1V8TXK/MKMR8685+%283%29.jpg',
 'mural': '1579630421303-UET562M7KOQWLL8FEIH1/IMG_6147.JPG',
 'queue': '1540598603373-VXTW5XDY0CFKQFB8RVMQ/YWAM_FoodPantry_20180809_758_original.jpeg',
 'lunch': '4ddbffe2-014d-4194-a26e-e5fba257edad/Community%2520Lunch_VSCO.jpg',
 'team': '3aac1bb8-94e7-49d4-be92-e9dad686c355/MKMR8140.jpg',
 'rain2': '1779917437619-RYYYTGIULLW693NTZRZI/image-asset.jpeg',
 'night': '1771366341447-7MIV5OVDBE35181IZ7D8/image-asset.jpeg',
 'xmas': '1766710261599-3RJVQTYVZHFWL6GK280D/image-asset.jpeg',
 'still': '7d8e62c7-c5fe-4040-95ac-19e5c18df3ab/Screen+Shot+2023-06-01+at+11.11.29+AM.png',
 'timkarol': '1770318794175-4VCIPMH2PCKUT82R229Z/image-asset.jpeg',
 'blog_church': '1768858625059-EL4Y1P9H0MN1HE3AFLW4/slide-7.png',
 'blog_food': '787c8184-1cb9-4d8b-8835-5798cb4fe891/slide-6.png',
 'blog_cocoa': '1768433482925-1OM72F3IPMII10L2EFWG/slide-5.png',
}
DTS_APPLY = lnk(S.get('dts_apply_url'), 'https://www.tfaforms.com/4827504')
GIVE_ONLINE = lnk(S.get('give_online_url'), 'https://www.ywamsanfrancisco.org/give')
SIGNUP = DTS_APPLY   # Sign Me Up buttons go straight to the DTS application
TEAM_FORM = lnk(S.get('team_booking_url'), 'https://www.tfaforms.com/4652564')
NX_APPLY = lnk((NX or {}).get('apply_url'), DTS_APPLY)
LIVE = 'https://www.ywamsanfrancisco.org'
FONTS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700;800&display=swap'
NAV = [('volunteer/', 'Come Volunteer', 'volunteer'), ('teams/', 'Bring a Team', 'teams'), ('course/', 'DTS (5 Month Course)', 'course'), ('ellis-room/', 'Ellis Room', 'neighbors')]

TOP = [('about/', 'About', 'about'), ('give/', 'Give', 'give'), ('pay/', 'Pay', 'pay'), ('contact/', 'Connect with us', 'contact')]
def header(cur, up):
    links = ''.join('<a href="%s%s"%s>%s</a>' % (up, h, ' aria-current="page"' if k == cur else '', t) for h, t, k in NAV)
    top = ''.join('<a href="%s"%s%s>%s</a>' % (h if h.startswith('http') else up + h, ' target="_blank" rel="noopener"' if h.startswith('http') else '', ' aria-current="page"' if k == cur else '', t) for h, t, k in TOP)
    return f'''<header class="y5-head"><div class="y5-top"><div class="wrap"><a class="tlogo" href="{up or './'}" aria-label="YWAM San Francisco home"></a><span class="tlinks">{top}</span></div></div>
<nav class="y5-nav" aria-label="Main"><div class="wrap"><span class="links">{links}<a class="sign" href="{SIGNUP}" target="_blank" rel="noopener">Sign Me Up!</a></span><button class="y5-burger" aria-expanded="false" aria-label="Open menu">Menu</button></div></nav></header>'''

CONCEPT = 'Design concept YWAM 5 for the YWAM San Francisco refresh — not the live site' if V == 5 else 'Design concept YWAM 6 (YWAM 5 with a backlit sign) for the YWAM San Francisco refresh — not the live site'
def footer(up, root):
    wave = '<svg viewBox="0 0 1600 90" preserveAspectRatio="none"><path d="M0,40 C100,10 200,10 300,40 C400,70 500,70 600,40 C700,10 800,10 900,40 C1000,70 1100,70 1200,40 C1300,10 1400,10 1500,40 C1550,55 1580,62 1600,62 L1600,90 L0,90Z" fill="#5aa8cf"/></svg>'
    wave2 = wave.replace('#5aa8cf', '#8cc6e2')
    sw = '<nav class="switcher" aria-label="Design concepts"><span>Concepts</span>' + ''.join('<a href="%sywam%d/"><i>YWAM </i>%d</a>' % (root, i, i) for i in range(1, 5)) + ''.join('<a%s href="%sywam%d/"><i>YWAM </i>%d</a>' % (' class="on"' if i == V else '', root, i, i) for i in (5, 6)) + '</nav>'
    return f'''<div class="y5-foot"><div class="inner"><div class="wrap row">
<div class="links"><a href="{LIVE}/policy-page">Privacy Policy</a><span>|</span><a href="https://ywamsfbayarea.org/">YWAM San Francisco Bay Area</a><span>|</span><a href="https://ywam.org/">YWAM International</a></div>
<div class="addr">{ADDR}, {CITY}<br><a href="{TEL}">{PHONE}</a> · <a class="em" href="mailto:{EMAIL}">{EMAIL}</a></div>
<div class="concept">{CONCEPT}</div></div></div></div>
{sw}'''

def page(title, cur, up, root, body, extra_head='', scripts=''):
    css = f'{up}assets/site5.css?v={VER}'
    return wire(f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://images.squarespace-cdn.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com https://maps.google.com https://www.google.com; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; upgrade-insecure-requests"><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="format-detection" content="telephone=no">
<title>{title}</title><link rel="icon" type="image/png" href="{root}favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="{FONTS}" rel="stylesheet">
<link rel="stylesheet" href="{css}">{extra_head}</head><body>
{banner_html()}{header(cur, up)}
<main id="main">{body}</main>
{footer(up, root)}
{scripts}<script src="{up}assets/site5.js?v={VER}"></script></body></html>''', up)

def banner_html():
    b = load('banner.json')
    if not b.get('show') or not str(b.get('text') or '').strip(): return ''
    until = str(b.get('hide_after') or '').strip()
    if until and _d(until) and _d(until) < TODAY: return ''
    u = lnk(b.get('link_url'))
    a = ' <a href="%s"%s>%s</a>' % (u, ' target="_blank" rel="noopener"' if u.startswith('http') else '', t(b.get('link_text') or 'Learn more')) if u else ''
    return '<div class="ann" role="note"%s><div class="wrap">%s%s</div></div>' % (' data-until="%s"' % until if _d(until) else '', t(b['text']), a)

WIRE = [('/about"', 'about/'), ('/give"', 'give/'), ('/contact"', 'contact/'), ('/volunteer"', 'volunteer/'), ('/mission-adventure"', 'teams/')]
def wire(h, up):
    for a, b in WIRE: h = h.replace('href="' + LIVE + a, 'href="' + up + b + '"')
    return h

def esc(s): return html.escape(s, quote=True)

# ---------------------------------------------------------------- HOME
IG = load('instagram.json').get('posts', [])
ig_js = 'window.YWAM_IG_POSTS=' + js([{'img': img(x.get('photo'), '', 750), 'caption': str(x.get('caption') or ''), 'href': lnk(x.get('url'), 'https://www.instagram.com/ywamsf/', raw=True)} for x in IG if img(x.get('photo'), '', 750)]) + ';'

SIGN = ('''<div class="spill" style="left:60px;top:150px;width:900px;height:640px"></div>
    <img class="tube wave" src="assets/img/neon-wave.png" alt="" style="left:185px;top:305px">
    <img class="tube text" src="assets/img/neon-text.png" alt="" style="left:185px;top:305px">''' if V == 5 else
 '''<div class="spill white" style="left:20px;top:110px;width:980px;height:700px"></div>
    <img class="lit" src="assets/img/sign-lit.jpg" alt="" style="left:177px;top:285px;width:661px;height:367px">''')
if NX:
    _f = NX['_s'].strftime('%B ') + ordn(NX['_s'].day)
    CABLECAR = '<div data-cablecar data-board="YWAM San Francisco" data-plates="%s|%s" data-band="Next DTS · %s" data-flag="Our next 5-month adventure begins %s!" data-flag-cta="Check it out →" data-href="course/" aria-label="Our next 5-month adventure begins %s. Check out the DTS, our 5 Month Course."></div>' % (md(NX['_s']).upper(), md(NX['_e']).upper(), drange(NX['_s'], NX['_e']), _f, _f)
else:
    CABLECAR = '<div data-cablecar data-board="YWAM San Francisco" data-plates="NEXT DTS|SOON" data-band="Next DTS · dates coming soon" data-flag="New DTS dates are coming soon!" data-flag-cta="Find out more →" data-href="course/" aria-label="New DTS dates are coming soon. Find out more about the DTS, our 5 Month Course."></div>'
MIN = load('ministries.json').get('ministries', [])
REEL = ''.join('<a class="hit" href="ellis-room/"><img src="%s" alt="%s" loading="lazy"><span class="hit-t"><small>%s</small><b>%s</b><span>%s</span></span></a>' % (img(m.get('photo'), '', 1500), t(m.get('title')), t(m.get('when')), t(m.get('title')), t(m.get('description'))) for m in MIN if t(m.get('title')))
home = f'''
<section class="neon-hero" aria-label="YWAM San Francisco sign on Ellis Street">
  <div class="frame" style="width:2500px;height:1424px">
    <img class="photo" src="assets/img/hero-ellis.jpg" alt="Ellis Street in the Tenderloin, with the YWAM San Francisco sign on the left" style="width:2500px;height:1424px">
    <div class="tint" style="left:0;top:0;width:2500px;height:1424px"></div>
    <div class="night" aria-hidden="true">
      <i class="win" style="left:1873px;top:462px;width:81px;height:72px;--d:3.0s"></i><i class="win" style="left:1885px;top:741px;width:77px;height:76px;--d:4.1s"></i><i class="win dim" style="left:1889px;top:872px;width:76px;height:79px;--d:5.2s"></i>
      <i class="win" style="left:2154px;top:576px;width:23px;height:154px;--d:3.6s"></i><i class="win dim" style="left:2108px;top:622px;width:15px;height:108px;--d:4.6s"></i><i class="win" style="left:1802px;top:480px;width:12px;height:67px;--d:3.3s"></i>
      <i class="win" style="left:813px;top:167px;width:16px;height:58px;--d:3.9s"></i><i class="win dim" style="left:817px;top:342px;width:16px;height:58px;--d:4.8s"></i>
      <i class="lamp" style="left:1176px;top:822px;--d:2.6s"></i><i class="lamp sm" style="left:1171px;top:1038px;--d:3.0s"></i><i class="lamp globe" style="left:921px;top:916px;--d:2.8s"></i>
      <img class="sign" src="assets/img/n-hotel-l.png" alt="" style="left:900px;top:522px;--g:rgba(255,70,60,.85);--d:3.4s">
      <img class="sign" src="assets/img/n-hotel-r.png" alt="" style="left:1958px;top:778px;--g:rgba(255,70,60,.85);--d:4.4s">
      <img class="sign" src="assets/img/n-coronado.png" alt="" style="left:611px;top:711px;--g:rgba(150,200,255,.7);--d:3.8s">
      <img class="sign" src="assets/img/n-mentone.png" alt="" style="left:805px;top:1071px;--g:rgba(255,120,90,.75);--d:4.9s">
    </div>
    <img class="face" src="assets/img/sign-dim.jpg" alt="" style="left:177px;top:285px;width:661px;height:367px">
{SIGN}
  </div>
</section>

<section class="pad intro"><div class="wrap">
  <h1 class="kick intro-kick">The love of Jesus is meant to be lived!</h1>
  <p class="lit plain lines"><span>We believe people can change,</span> <span>neighborhoods can heal,</span> <span>and love can make a difference.</span></p>
  <div class="intro-body rv"><p>We’re here to be part of that. Our neighborhood is called <b>the Tenderloin</b>. We build relationships, create places to belong, meet practical needs, and share the love of Jesus with our neighbors.</p><a class="btn come-btn" href="{DTS_APPLY}" target="_blank" rel="noopener">Come and live this with us <span aria-hidden="true">→</span></a></div>
</div></section>

<section class="cc-strip" aria-label="Next 5-month course">
  {CABLECAR}
</section>

<section class="wall-sec pad"><div class="wrap wall-grid">
  <div class="wall rv" data-qframe data-w="1400" data-h="1167" style="aspect-ratio:1400/1167">
    <img class="bg" src="assets/img/ellis-front.jpg" alt="The YWAM San Francisco building at 357 Ellis Street, with the film playing in its front window">
    <div class="screen" data-quad="166,729 634,711 634,1009 166,989"><img class="poster" src="{ph('still', 750)}" alt=""></div>
    <div class="pane" data-quad="166,729 634,711 634,1009 166,989" aria-hidden="true"></div>
    <img class="occ" src="assets/img/ellis-front-occ.png" alt="" style="left:9.857%;top:76.864%;width:14.857%">
    <button class="play" data-film style="left:79%;top:93.5%"><i></i>Watch the film</button>
  </div>
  <div class="rv">
    <span class="kick">Now showing on Ellis Street</span>
    <p class="vision">We envision a Tenderloin where neighbors and the neighborhood are <em>renewed</em>, and where the Church is mobilized to share the love of Christ.</p>
    <p>Two minutes inside YWAM San Francisco: the people, the street, and the everyday work of loving our neighbors.</p>
    <button class="btn" data-film>▶ Play full screen</button>
  </div>
</div></section>

<section class="engage pad"><div class="wrap">
  <span class="kick rv">The Ellis Room · greatest hits</span>
  <h2 class="rv">Neighborhood engagement</h2>
  <div class="reel" aria-label="Ministry highlights"><div class="reel-track">{REEL}</div></div>
  <div class="reel-nav"><button class="reel-prev" aria-label="Previous">←</button><div class="reel-dots"></div><button class="reel-next" aria-label="Next">→</button></div>
</div></section>

<section class="verse pad"><div class="fogs" aria-hidden="true"><i></i><i></i><i></i></div><div class="wrap">
  <blockquote data-verse>Follow God’s example, therefore, as dearly loved children and walk in the way of <em>love,</em> just as Christ loved us and gave himself up for us as a fragrant offering and sacrifice to God.</blockquote>
  <cite>Ephesians 5:1–2 · NIV</cite>
</div></section>

<section class="believe" aria-label="What we believe">
  <div class="slides">
    <figure data-where="Outreach team · Ellis Street"><img src="{ph('team',2000)}" alt="An outreach team with backpacks on a city sidewalk"></figure>
    <figure data-where="Community lunch"><img src="{ph('lunch',2000)}" alt="Neighbors sharing a meal" loading="lazy"></figure>
    <figure data-where="In the kitchen"><img src="{ph('kitchen',2000)}" alt="Volunteers preparing food" loading="lazy"></figure>
    <figure data-where="Pop-Up Church"><img src="{ph('preach',2000)}" alt="Pop-Up Church on the sidewalk" loading="lazy"></figure>
    <figure data-where="Food pantry day"><img src="{ph('queue',2000)}" alt="Neighbors outside the building on food pantry day" loading="lazy"></figure>
  </div>
  <div class="copy">
    <p>We believe restoration starts with <em>relationship.</em></p>
    <p>We believe everyone matters, everyone belongs, and everyone has <em>something to give.</em></p>
    <p>We believe love can change a <em>neighborhood.</em></p>
    <a class="btn light" href="{SIGNUP}" target="_blank" rel="noopener">Sign me up!</a>
  </div>
  <span class="where"></span><div class="bar"></div>
</section>

<section class="ig5"><div class="wrap head rv"><span class="kick">@ywamsf on Instagram</span><h2>Life on Ellis Street, <em>this week.</em></h2><a class="handle" href="https://www.instagram.com/ywamsf/" target="_blank" rel="noopener">Follow @ywamsf →</a></div>
  <div class="ig-stage" data-ig tabindex="0" aria-label="Recent posts from YWAM San Francisco. Use the left and right arrow keys to browse."></div>
</section>

<div class="lightbox" role="dialog" aria-modal="true" aria-label="YWAM San Francisco film"><div class="box"><iframe title="YWAM San Francisco film" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><button class="x" aria-label="Close film">✕</button></div>
'''
home_scripts = f'<script>{ig_js}</script><script src="assets/igcarousel.js?v={VER}"></script><script src="assets/cablecar.js?v={VER}"></script>'
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, 'index.html'), 'w').write(page('YWAM San Francisco — Concept %d' % V, 'home', '', '../', home, scripts=home_scripts))

# ---------------------------------------------------------------- VOLUNTEER
SHIFTS = [x for x in load('shifts.json').get('shifts', []) if t(x.get('title'))]
DAYS = ('SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT')
def sdays(x): return ' '.join(d for d in (str(v).upper()[:3] for v in x.get('days') or []) if d in DAYS)
board_rows = ''.join(f'''<tr data-days="{sdays(x)}" data-href="#shift" data-shift="{i}"><td><span class="flap">{t(str(x.get('when') or '').upper()[:22])}</span></td><td><span class="flap">{t(str(x.get('title')).upper())}</span></td><td>{t(x.get('time'))}</td><td><span class="status">{'Weekly' if sdays(x) else 'Ongoing'}</span></td></tr>''' for i, x in enumerate(SHIFTS))
import json
def rgb(hx):
    m = re.fullmatch(r'#?([0-9a-fA-F]{6})', str(hx or '').strip())
    return ','.join(str(int(m.group(1)[i:i + 2], 16)) for i in (0, 2, 4)) if m else '70,83,97'
vol_posts = [{'img': img(x.get('photo'), '../', 750), 'title': str(x['title']).strip(), 'when': str(x.get('when') or ''), 'time': str(x.get('time') or ''), 'href': '#shift', 'desc': str(x.get('description') or ''), 'meta': [str(m) for m in x.get('tags') or [] if str(m).strip()], 'subject': str(x['title']).strip() + ' volunteer', 'days': sdays(x), 'rule': 'nth24' if x.get('every') == '2nd & 4th' else '', 'tint': rgb(x.get('colour')), 'email': VEMAIL} for x in SHIFTS]
vol_js = '<script>window.YWAM_VOL_N=%d;window.YWAM_IG_POSTS=' % len(vol_posts) + js(vol_posts * 2) + ';</script>'
vol = f'''
<section class="page-hero"><div class="ph-img still"><img src="../assets/img/vol-header.jpg" alt="A smiling neighbor holding a box of groceries at the food pantry" style="object-position:60% 30%"></div><div class="copy"><div class="wrap"><span class="kick">Come volunteer</span><h1>Come for a shift. Stay for the people.</h1><p class="lede">Every day we open our doors to serve our neighbors, our students and our outreach teams. It’s a big job, and we can’t do it alone.</p></div></div></section>
<section class="vol-top"><div class="wrap">
  <div class="vmosaic">
    <figure class="rv big"><img src="../assets/img/vol-crew.jpg" alt="Four volunteers arm in arm on the sidewalk, smiling" style="object-position:50% 35%"><figcaption>Friends you make on Ellis Street</figcaption></figure>
    <figure class="rv"><img src="../assets/img/vol-hero.jpg" alt="A smiling volunteer in gloves holding up two onions at the food pantry" loading="lazy" style="object-position:50% 30%"><figcaption>Thursday food pantry</figcaption></figure>
    <figure class="rv"><img src="../assets/img/vol-kitchen.jpg" alt="Two volunteers cooking at the stoves" loading="lazy" style="object-position:50% 45%"><figcaption>In the kitchen</figcaption></figure>
  
</div></section>
<section class="vol-board"><div class="wrap">
  <div class="board rv"><div class="board-head"><span>Volunteer departures · 357 Ellis St</span><span class="clock"></span></div>
  <table><thead><tr><th>When</th><th>Shift</th><th>Time</th><th>Status</th></tr></thead><tbody>{board_rows}</tbody></table></div>
  <p class="board-note">Tap a row to see the details and sign up.</p>
</div></section>
<section class="ig5 vol-ig"><div class="wrap head rv"><span class="kick">Ways to serve · for Bay Area volunteers</span><h2>Pick a shift. We’ll save you a seat.</h2><p class="lede" style="margin:10px auto 0;max-width:560px">Swipe or use the arrows. The card in the middle shows when it happens, with the details just below.</p></div>
  <div class="ig-stage" data-ig data-vol tabindex="0" aria-label="Volunteer opportunities. Use the left and right arrow keys to browse."></div>
  <div class="wrap"><div class="shift" id="shift" aria-live="polite">
    <div class="shift-when"><small>When</small><b data-f="when"></b><span data-f="time"></span></div>
    <div class="shift-body"><h3 data-f="title"></h3><p data-f="desc"></p><div class="meta" data-f="meta"></div></div>
    <div class="shift-cta"><a class="btn" data-f="signup" href="mailto:{VEMAIL}">Sign up for this shift</a><small>Or email <a href="mailto:{VEMAIL}">{VEMAIL}</a></small></div>
  </div>
  <div class="shift-dots" role="tablist" aria-label="Choose a shift"></div></div>
</section>
<section class="stats5-sec"><div class="wrap"><div class="stats5 rv"><div><b data-count="400">0</b><span>tons of food served</span></div><div><b data-count="300" data-suffix="+">0</b><span>neighbors a week at the pantry</span></div><div><b data-count="4">0</b><span>days a week the Ellis Room is open</span></div><div><b data-count="100" data-suffix=" yrs">0</b><span>our ministry center’s age</span></div></div></div></section>
<section class="cta-band pad"><div class="wrap rv"><span class="kick" style="color:rgba(255,255,255,.7)">Live outside the Bay Area?</span><h2>Serve for a summer, or a season.</h2><p>Join our Summer of Service, or come as a Mission Builder: use your skills in maintenance, cooking, administration or photo and video, in exchange for free or subsidized room and board.</p><div class="row"><a class="btn light" href="{LIVE}/summerservice" target="_blank" rel="noopener">Summer of Service</a><a class="btn ghost-light" href="https://www.missionbuilders.org/location/?LID=149" target="_blank" rel="noopener">Mission Builders</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'volunteer'), exist_ok=True)
open(os.path.join(OUT, 'volunteer/index.html'), 'w').write(page('Come Volunteer — YWAM San Francisco', 'volunteer', '../', '../../', vol, scripts=vol_js + f'<script src="../assets/igcarousel.js?v={VER}"></script>'))

# ---------------------------------------------------------------- BRING A TEAM
teams = f'''
<section class="page-hero"><div class="ph-img"><img src="../assets/img/team-bags.jpg" alt="A team holding up paper lunch bags with names written on them, in front of a brick wall and a wooden cross" style="object-position:50% 38%"></div><div class="copy"><div class="wrap"><span class="kick">Bring a team · Mission Adventures</span><h1>Step into mission. <em>Step into transformation.</em></h1><p class="lede">A short-term outreach for youth groups, church teams and individuals who want to encounter God in the heart of San Francisco.</p></div></div></section>
<section class="pad"><div class="wrap">
  <div class="rv" style="max-width:720px;margin-bottom:34px"><span class="kick">We take care of the details</span><h2>Your team focuses on <em>loving God and loving people.</em></h2></div>
  <div class="cards3"><div class="card5 rv icard"><div class="ic"><span class="icw"><svg class="ghost" viewBox="0 0 64 64" aria-hidden="true"><circle pathLength="1" cx="32" cy="32" r="22" class="l"/><circle pathLength="1" cx="32" cy="32" r="15" class="l t"/><path pathLength="1" d="M32 5v7M32 52v7M5 32h7M52 32h7" class="l"/><path pathLength="1" d="M39 25l-10 4-4 10 10-4z" class="a"/><circle pathLength="1" cx="32" cy="32" r="1.8" class="dot"/></svg><svg class="live" viewBox="0 0 64 64" aria-hidden="true"><circle pathLength="1" cx="32" cy="32" r="22" class="l"/><circle pathLength="1" cx="32" cy="32" r="15" class="l t"/><path pathLength="1" d="M32 5v7M32 52v7M5 32h7M52 32h7" class="l"/><path pathLength="1" d="M39 25l-10 4-4 10 10-4z" class="a"/><circle pathLength="1" cx="32" cy="32" r="1.8" class="dot"/></svg></span></div><h3>Orientation</h3><p>We prepare your team for the Tenderloin before you ever step onto the street.</p></div><div class="card5 rv icard"><div class="ic"><span class="icw"><svg class="ghost" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M12 34h40c0 10-8 18-20 18S12 44 12 34z" class="l"/><path pathLength="1" d="M8 34h48M24 57h16" class="l"/><path pathLength="1" d="M24 27c-3-4 3-6 0-10M32 27c-3-4 3-6 0-10M40 27c-3-4 3-6 0-10" class="a s"/></svg><svg class="live" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M12 34h40c0 10-8 18-20 18S12 44 12 34z" class="l"/><path pathLength="1" d="M8 34h48M24 57h16" class="l"/><path pathLength="1" d="M24 27c-3-4 3-6 0-10M32 27c-3-4 3-6 0-10M40 27c-3-4 3-6 0-10" class="a s"/></svg></span></div><h3>Food planning</h3><p>Meals planned and shared at our base, with YWAM staff around the table.</p></div><div class="card5 rv icard"><div class="ic"><span class="icw"><svg class="ghost" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M9 30L32 11l23 19" class="l"/><path pathLength="1" d="M16 26v28h32V26" class="l"/><path pathLength="1" d="M27 54V41h10v13" class="l"/><rect pathLength="1" x="20.5" y="30" width="8" height="7" rx="1" class="win"/><rect pathLength="1" x="35.5" y="30" width="8" height="7" rx="1" class="win"/><path pathLength="1" d="M42 18v-7h5v11" class="l t"/></svg><svg class="live" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M9 30L32 11l23 19" class="l"/><path pathLength="1" d="M16 26v28h32V26" class="l"/><path pathLength="1" d="M27 54V41h10v13" class="l"/><rect pathLength="1" x="20.5" y="30" width="8" height="7" rx="1" class="win"/><rect pathLength="1" x="35.5" y="30" width="8" height="7" rx="1" class="win"/><path pathLength="1" d="M42 18v-7h5v11" class="l t"/></svg></span></div><h3>Housing</h3><p>Stay at the YWAM San Francisco base, right in the heart of the city.</p></div><div class="card5 rv icard"><div class="ic"><span class="icw"><svg class="ghost" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M5 45l10-10c3-3 7-3 10 0l4 4h11c3 0 3 5 0 5H28" class="l"/><path pathLength="1" d="M5 55l6-6h19l14-10c3-2 6 2 3 5L32 57H16" class="l"/><path pathLength="1" d="M42 29c-4-3-10-6-10-12 0-3 2-5 5-5 2 0 4 1 5 3 1-2 3-3 5-3 3 0 5 2 5 5 0 6-6 9-10 12z" class="a"/></svg><svg class="live" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M5 45l10-10c3-3 7-3 10 0l4 4h11c3 0 3 5 0 5H28" class="l"/><path pathLength="1" d="M5 55l6-6h19l14-10c3-2 6 2 3 5L32 57H16" class="l"/><path pathLength="1" d="M42 29c-4-3-10-6-10-12 0-3 2-5 5-5 2 0 4 1 5 3 1-2 3-3 5-3 3 0 5 2 5 5 0 6-6 9-10 12z" class="a"/></svg></span></div><h3>Ministry</h3><p>Real opportunities to serve alongside local ministries every day.</p></div></div>
</div></section>
<section class="pad" style="background:var(--mist)"><div class="wrap" style="display:grid;gap:clamp(28px,4vw,56px)">
  <div class="split"><div class="photo-stack rv"><img src="../assets/img/team-street.jpg" alt="A youth team gathered on the sidewalk on Ellis Street" loading="lazy" style="object-position:50% 55%"><img src="../assets/img/team-juggle.jpg" alt="A Mission Adventures volunteer juggling apples for a neighbor at the food pantry" loading="lazy" style="object-position:47% 45%"></div><div class="rv"><span class="kick">Outreach</span><h2>Serve in <em>the Tenderloin.</em></h2><p class="lede">Feed the hungry, pray for and encourage neighbors on the street and in the Ellis Room. Share testimonies and the Gospel. Care for families, immigrants and unhoused neighbors.</p></div></div>
  <div class="split flip"><div class="photo-stack rv"><img src="../assets/img/team-cross.jpg" alt="A group gathered beneath the cross on Mount Davidson" loading="lazy" style="object-position:50% 70%"><img src="{ph('lunch')}" alt="A shared meal" loading="lazy"></div><div class="rv"><span class="kick">Community living</span><h2>Eat, worship and <em>live together.</em></h2><p class="lede">Your team stays at our base, shares meals and space with YWAM staff, and gathers for devotion and worship each day.</p></div></div>
</div></section>
<section class="pad"><div class="wrap">
  <div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Plan your trip</span><h2>A weekend, a week, <em>or longer.</em></h2><p class="lede">{money(MA_RATE)} per participant per day, including food, accommodation and ministry supplies. Slide to estimate your team’s trip.</p></div>
  <div class="calc rv" data-rate="{MA_RATE}"><div><div class="ctl"><label for="calcPeople">Team size <output id="outPeople">12</output></label><input id="calcPeople" type="range" min="1" max="40" value="12"></div><div class="ctl"><label for="calcDays">Days <output id="outDays">5</output></label><input id="calcDays" type="range" min="1" max="21" value="5"></div><p style="font-size:14px;color:var(--muted);margin:0">Estimate only. We’ll confirm details when you book.</p></div>
  <div class="total"><span class="kick" style="color:rgba(255,255,255,.7)">Estimated trip cost</span><b id="calcTotal">{money(MA_RATE * 60)}</b><small id="calcPer"></small><a class="btn light" style="margin-top:20px" href="{TEAM_FORM}" target="_blank" rel="noopener">Book today</a></div></div>
</div></section>
<section class="pad" style="background:var(--mist)"><div class="wrap">
  <div class="rv" style="margin-bottom:30px"><span class="kick">Why Mission Adventures?</span><h2>More than a trip.</h2></div>
  <div class="cards3"><div class="card5 rv draw"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M14 30h52v34H14z"/><path pathLength="1" d="M30 30v-7a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v7"/><path pathLength="1" d="M14 44h52"/><path pathLength="1" d="M34 40v8M46 40v8"/><path pathLength="1" class="r" d="M58 18l14 6-6 14-14-6z"/><path pathLength="1" class="r" d="M61 25l5 2"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M14 30h52v34H14z"/><path pathLength="1" d="M30 30v-7a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v7"/><path pathLength="1" d="M14 44h52"/><path pathLength="1" d="M34 40v8M46 40v8"/><path pathLength="1" class="r" d="M58 18l14 6-6 14-14-6z"/><path pathLength="1" class="r" d="M61 25l5 2"/></svg></span><h3>All-inclusive</h3><p>We take care of the details so leaders can focus on their students and the ministry at hand.</p></div><div class="card5 rv draw"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 56c10-4 20-4 30 2 10-6 20-6 30-2V22c-10-4-20-4-30 2-10-6-20-6-30-2z"/><path pathLength="1" d="M40 24v34"/><path pathLength="1" class="r" d="M40 22c0-8 0-12-2-16"/><path pathLength="1" class="r" d="M39 12c-6-2-10 0-12 4 5 2 9 0 12-4zM40 9c4-4 9-4 12-1-3 4-8 4-12 1z"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 56c10-4 20-4 30 2 10-6 20-6 30-2V22c-10-4-20-4-30 2-10-6-20-6-30-2z"/><path pathLength="1" d="M40 24v34"/><path pathLength="1" class="r" d="M40 22c0-8 0-12-2-16"/><path pathLength="1" class="r" d="M39 12c-6-2-10 0-12 4 5 2 9 0 12-4zM40 9c4-4 9-4 12-1-3 4-8 4-12 1z"/></svg></span><h3>Discipleship focused</h3><p>Every part of the trip helps participants grow in their relationship with Jesus.</p></div><div class="card5 rv draw"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M6 62h68"/><path pathLength="1" d="M10 62V40h10v22M20 62V30h12v32M32 62V44h8v18M48 62V34h10v28M58 62V46h12v16"/><path pathLength="1" d="M24 36h4M24 42h4M24 48h4M52 40h3M52 46h3"/><path pathLength="1" class="r" d="M40 44V14M33 22h14"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M6 62h68"/><path pathLength="1" d="M10 62V40h10v22M20 62V30h12v32M32 62V44h8v18M48 62V34h10v28M58 62V46h12v16"/><path pathLength="1" d="M24 36h4M24 42h4M24 48h4M52 40h3M52 46h3"/><path pathLength="1" class="r" d="M40 44V14M33 22h14"/></svg></span><h3>Urban mission field</h3><p>The Tenderloin is a unique place to learn how the Gospel changes lives in real time.</p></div><div class="card5 rv draw"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 18h60v46H10z"/><path pathLength="1" d="M10 30h60"/><path pathLength="1" d="M24 12v10M56 12v10"/><path pathLength="1" d="M20 40h4M32 40h4M44 40h4M56 40h4M20 52h4M32 52h4"/><path pathLength="1" class="r" d="M30 50h22"/><path pathLength="1" class="r" d="M30 46v8M52 46v8"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 18h60v46H10z"/><path pathLength="1" d="M10 30h60"/><path pathLength="1" d="M24 12v10M56 12v10"/><path pathLength="1" d="M20 40h4M32 40h4M44 40h4M56 40h4M20 52h4M32 52h4"/><path pathLength="1" class="r" d="M30 50h22"/><path pathLength="1" class="r" d="M30 46v8M52 46v8"/></svg></span><h3>Flexible times</h3><p>Come for a weekend, a week, or longer.</p></div></div>
</div></section>
<section class="pad"><div class="wrap"><div class="rv" style="margin-bottom:30px"><span class="kick">Stories from the street</span><h2>What your team <em>will step into.</em></h2></div>
  <div class="stories"><a class="story rv" href="{LIVE}/blog/2026/1/19/church-that-shows-up" target="_blank" rel="noopener"><div class="ph"><img src="{ph('blog_church',900)}" alt="" loading="lazy"></div><h3>Church that shows up</h3><p>Hot chocolate, cookies and worship on the sidewalk every Sunday.</p></a>
  <a class="story rv" href="{LIVE}/blog/2026/1/19/feeding-our-city-with-hope" target="_blank" rel="noopener"><div class="ph"><img src="{ph('blog_food',900)}" alt="" loading="lazy"></div><h3>Feeding our city with hope</h3><p>More than 300 people a week, met with fresh food and warm smiles.</p></a>
  <a class="story rv" href="{LIVE}/blog/2026/1/14/hot-chocolate-a-simple-ministry-making-a-real-impact-in-san-francisco" target="_blank" rel="noopener"><div class="ph"><img src="{ph('blog_cocoa',900)}" alt="" loading="lazy"></div><h3>Hot chocolate</h3><p>A simple ministry making a real impact, one conversation at a time.</p></a></div>
</div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Gather your team. Pray. <em>Say yes.</em></h2><p>We’ll take care of the rest. Email <a style="color:#fff" href="mailto:{OEMAIL}">{OEMAIL}</a> or call {PHONE}.</p><div class="row"><a class="btn light" href="{TEAM_FORM}" target="_blank" rel="noopener">Book your trip</a><a class="btn ghost-light" href="mailto:{OEMAIL}">Ask a question</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'teams'), exist_ok=True)
open(os.path.join(OUT, 'teams/index.html'), 'w').write(page('Bring a Team — YWAM San Francisco', 'teams', '../', '../../', teams))

# ---------------------------------------------------------------- SERVING OUR NEIGHBORS
CAT = {'room': ('#465361', 'Ellis Room'), 'word': ('#9A1E14', 'Church & Bible study'), 'care': ('#6E9CBF', 'Showers, haircuts & care'), 'food': ('#C99634', 'Food'), 'out': ('#2E7D6B', 'Street & SRO outreach')}
DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
WEEK = {d: [] for d in range(7)}
for e in load('ellis_week.json').get('entries', []):
    if str(e.get('day'))[:3].title() in DN and e.get('category') in CAT and t(e.get('title')):
        WEEK[DN.index(str(e['day'])[:3].title())].append((e['category'], str(e['title']).strip(), str(e.get('label') or '').strip(), mins(e.get('start')), mins(e.get('end')) or mins(e.get('start')) + 60) + (('nth24',) if e.get('every') == '2nd & 4th' else ()))
for d in WEEK: WEEK[d].sort(key=lambda e: e[3])
def ev_html(e):
    c, tt, h, st, en = e[:5]; rule = e[5] if len(e) > 5 else ''
    return '<div class="ev" style="--c:%s" data-s="%d" data-e="%d" data-t="%s"%s><b>%s</b><small>%s</small></div>' % (CAT[c][0], st, en, esc(tt), ' data-rule="%s"' % rule if rule else '', esc(tt), esc(h))
week = ''.join('<div class="day" data-d="%d"><h4>%s</h4>%s</div>' % (d, DN[d], ''.join(ev_html(e) for e in WEEK[d]) or '<div class="ev" style="--c:var(--line)"><b>Rest &amp; prep</b><small>No public services</small></div>') for d in [1, 2, 3, 4, 5, 6, 0])
legend = ''.join('<span style="--c:%s">%s</span>' % v for v in CAT.values())
nb = f'''
<section class="page-hero"><div class="ph-img"><img src="../assets/img/er-hero.jpg" alt="Tables and chairs on the sidewalk outside 357 Ellis Street, with a chalkboard sign: Welcome to the Ellis Room" style="object-position:50% 64%"></div><div class="copy"><div class="wrap"><span class="kick">The Ellis Room · 357 Ellis Street</span><h1>Building relationships that lead to <em>lasting transformation.</em></h1><p class="lede">God is restoring, empowering and serving in our neighborhood, and we’re following His lead.</p></div></div></section>
<section class="pad"><div class="wrap"><p class="lit" data-lit>Everyone has value. Everyone has a place. Everyone has <em>something</em> <em>to</em> <em>give,</em> and everyone has something to receive.</p>
<div class="stats5 rv" style="margin-top:20px"><div><b data-count="400">0</b><span>tons of food shared</span></div><div><b data-count="300" data-suffix="+">0</b><span>neighbors each week</span></div><div><b data-count="209">0</b><span>served at Christmas lunch</span></div><div><b data-count="6">0</b><span>days a week, doors open</span></div></div></div></section>
<section class="pad" style="background:var(--mist)"><div class="wrap"><div class="rv" style="margin-bottom:30px"><span class="kick">Restoration initiatives · tap a card</span><h2>Restore. Empower. <em>Serve.</em></h2></div>
<div class="pillars"><div class="pillar rv"><div class="in"><div class="f"><img src="../assets/img/er-restore.jpg" alt="A neighbor in glasses hugging her dog, who is wearing pink glasses" loading="lazy" style="object-position:50% 25%"><span class="plab"><small>i.</small><h3>Restore</h3><em>Tap to read</em></span></div><div class="b"><p>Our heart is for people to be restored to God, their families and others: restored dignity and restored identity.</p></div></div></div>
<div class="pillar rv"><div class="in"><div class="f"><img src="../assets/img/er-empower.jpg" alt="A neighbor with a long white beard, smiling and flexing" loading="lazy" style="object-position:50% 30%"><span class="plab"><small>ii.</small><h3>Empower</h3><em>Tap to read</em></span></div><div class="b"><p>We equip people with tools for a stable life, to pursue work, employment and housing, and to be their true selves.</p></div></div></div>
<div class="pillar rv"><div class="in"><div class="f"><img src="../assets/img/er-serve.jpg" alt="A smiling neighbor in a white jacket over a leopard-print hoodie" loading="lazy" style="object-position:50% 25%"><span class="plab"><small>iii.</small><h3>Serve</h3><em>Tap to read</em></span></div><div class="b"><p>First by being good listeners. Free haircuts, showers and prayer. We go with people to the hospital, court and rehab.</p></div></div></div></div></div></section>
<section class="pad"><div class="wrap"><div class="rv" style="margin-bottom:26px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap"><div><span class="kick">The week at 357 Ellis</span><h2>Come by. <em>The door is open.</em></h2></div><p style="max-width:420px;margin:0">The proclamation of the Gospel and the activity of the Gospel, side by side. Today, and anything happening right now, is highlighted in San Francisco time.</p></div>
<div class="nownext rv" aria-live="polite"></div><div class="week-wrap rv"><div class="week">{week}</div></div><div class="legend">{legend}</div></div></section>
<section class="pad voices5"><div class="wrap"><div class="rv" style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;margin-bottom:26px"><div><span class="kick">Love your neighbor(hood)</span><h2>Lessons learned on these streets.</h2></div><div class="varrows"><button aria-label="Previous" data-dir="-1">←</button><button aria-label="Next" data-dir="1">→</button></div></div>
<div class="vtrack">
<a class="voice5" href="{LIVE}/blog/emilyg" target="_blank" rel="noopener"><blockquote>“…choose hurry instead of human in these moments.”</blockquote><cite><b>Restaurants of the TL</b>From the YWAM SF blog</cite></a>
<a class="voice5" href="{LIVE}/blog/danica-bless" target="_blank" rel="noopener"><blockquote>“…seeking out God’s beauty amidst the chaos of daily life.”</blockquote><cite><b>Arts and Murals</b>From the YWAM SF blog</cite></a>
<a class="voice5" href="{LIVE}/blog/karol-svoboda" target="_blank" rel="noopener"><blockquote>“…see and understand my neighbors at a much deeper level.”</blockquote><cite><b>Karol Svoboda</b>From the YWAM SF blog</cite></a>
<a class="voice5" href="{LIVE}/blog/2019/10/22/seniors-of-the-tl" target="_blank" rel="noopener"><blockquote>“He shows up. Will you?”</blockquote><cite><b>Seniors of the Tenderloin</b>From the YWAM SF blog</cite></a>
<a class="voice5" href="{LIVE}/blog/mateo" target="_blank" rel="noopener"><blockquote>“…it’s an honor to walk side by side with these visionaries.”</blockquote><cite><b>The Youth of the Tenderloin</b>From the YWAM SF blog</cite></a>
</div></div></section>
<section class="believe" aria-label="Life in the neighborhood"><div class="slides">
<figure data-where="Inside the Ellis Room"><img src="../assets/img/er-room.jpg" alt="Neighbors around tables inside the Ellis Room, with a wooden cross on the brick wall"></figure><figure data-where="Pool in the Ellis Room"><img src="../assets/img/er-pool.jpg" alt="A neighbor lining up a shot at the Ellis Room pool table" loading="lazy"></figure><figure data-where="The Ellis Room on a rainy night"><img src="{ph('night',2000)}" alt="Ellis Room at night" loading="lazy"></figure><figure data-where="Christmas lunch"><img src="{ph('xmas',2000)}" alt="Christmas lunch" loading="lazy"></figure></div>
<div class="copy"><p>“A gospel that does not deal with the issues of the day is <em>not the gospel at all.</em>”</p><p style="font-family:var(--sans);font-size:13px;letter-spacing:.18em;text-transform:uppercase">Quoted on our restoration page</p><a class="btn light" href="../volunteer/">Volunteer with us</a></div><span class="where"></span><div class="bar"></div></section>
<section class="pad"><div class="wrap split"><div class="rv"><span class="kick">Need food?</span><h2>The food pantry, <em>every Thursday.</em></h2><p class="lede">We partner with the SF-Marin Food Bank. Sign-ups happen on site at 357 Ellis Street, Thursdays at 3:30 pm. We serve residents of the 94102 zip code: bring an ID with your current address, or your ID and a recent piece of mail.</p><p>Need food right away? Visit the <a href="https://www.sfmfoodbank.org/find-food/" target="_blank" rel="noopener">SF-Marin Food Bank</a> or call 211.</p></div><div class="photo-stack rv"><img src="{ph('queue')}" alt="Neighbors outside on food pantry day" loading="lazy"><img src="../assets/img/er-door.jpg" alt="Neighbors and a staff member welcoming people at the door, beside the food pantry signs" loading="lazy" style="object-position:62% 30%"></div></div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Join what God is <em>already doing here.</em></h2><p>Serve a shift, give toward showers and groceries, or bring a team.</p><div class="row"><a class="btn light" href="../volunteer/">Volunteer</a><a class="btn ghost-light" href="{LIVE}/give" target="_blank" rel="noopener">Give</a><a class="btn ghost-light" href="../teams/">Bring a team</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'ellis-room'), exist_ok=True)
open(os.path.join(OUT, 'ellis-room/index.html'), 'w').write(page('The Ellis Room — YWAM San Francisco', 'neighbors', '../', '../../', nb))

CDN = C
# ---------------------------------------------------------------- DTS (5 MONTH COURSE) — native page
YT = 'lH3BLHA6dhI'
YT_SRC = f'https://www.youtube-nocookie.com/embed/{YT}?autoplay=1&mute=1&loop=1&playlist={YT}&controls=0&modestbranding=1&playsinline=1&rel=0&start=10&iv_load_policy=3&disablekb=1&enablejsapi=1'
SVG = {
 'god': '''<svg viewBox="0 0 200 150" aria-hidden="true"><circle cx="100" cy="70" r="46" class="glow"/><circle cx="100" cy="70" r="30" class="glow2"/><path d="M100 38c10 13 13 22 13 29a13 13 0 0 1-26 0c0-7 4-15 13-29z" class="flame"/><path d="M100 55c4 6 5 10 5 13a5 5 0 0 1-10 0c0-3 1-7 5-13z" class="ink"/><rect x="86" y="84" width="28" height="44" rx="2" class="ln"/><path d="M100 80v4" class="ln"/><path d="M60 128h80" class="ln"/><path d="M52 70h-14M162 70h-14M100 18v-8M64 34l-8-8M136 34l8-8" class="ln thin"/></svg>''',
 'neighbor': '''<svg viewBox="0 0 200 150" aria-hidden="true"><ellipse cx="100" cy="122" rx="70" ry="8" class="glow"/><path d="M48 66h40v34a16 16 0 0 1-16 16h-8a16 16 0 0 1-16-16z" class="ln fillm"/><path d="M88 74h6a9 9 0 0 1 0 18h-6" class="ln"/><path d="M112 66h40v34a16 16 0 0 1-16 16h-8a16 16 0 0 1-16-16z" class="ln fillm"/><path d="M112 74h-6a9 9 0 0 0 0 18h6" class="ln"/><path d="M60 56c-4-8 4-10 0-18M72 56c-4-8 4-10 0-18M128 56c-4-8 4-10 0-18M140 56c-4-8 4-10 0-18" class="ln thin"/><path d="M100 46c-4-5-12-3-12 4 0 6 12 12 12 12s12-6 12-12c0-7-8-9-12-4z" class="flame"/></svg>''',
 'humility': '''<svg viewBox="0 0 200 150" aria-hidden="true"><ellipse cx="100" cy="124" rx="74" ry="8" class="glow"/><path d="M44 84h112l-12 32a8 8 0 0 1-8 6H64a8 8 0 0 1-8-6z" class="ln fillm"/><ellipse cx="100" cy="84" rx="56" ry="8" class="ln water"/><path d="M118 30h22a6 6 0 0 1 6 6v34" class="ln"/><path d="M130 36v40c0 5 6 7 10 4" class="ln fillm"/><path d="M134 46h8M134 56h8M134 66h8" class="ln thin"/><path d="M70 66c6-4 6-10 0-14M84 66c6-4 6-10 0-14" class="ln thin"/></svg>''',
 'multiply': '''<svg viewBox="0 0 200 150" aria-hidden="true"><ellipse cx="100" cy="128" rx="64" ry="7" class="glow"/><path d="M100 128V60" class="ln"/><path d="M100 96c-18-2-30-12-34-28 16 0 30 10 34 28zM100 84c18-2 30-12 34-28-16 0-30 10-34 28zM100 66c-12-2-20-10-22-22 11 1 20 9 22 22zM100 60c10-4 16-12 16-24-10 3-16 12-16 24z" class="ln leaf"/><circle cx="58" cy="118" r="5" class="seed"/><circle cx="142" cy="118" r="5" class="seed"/><circle cx="40" cy="124" r="3" class="seed"/><circle cx="160" cy="124" r="3" class="seed"/><path d="M58 113v-8c-4-2-6-6-6-10M142 113v-8c4-2 6-6 6-10" class="ln thin"/></svg>''',
}
VOWS = [('god', 'i.', 'Love of God', 'We stay rooted in Him.', 'Before anyone opens a door or a laptop, we’re in prayer: for each other, for the neighborhood, for the person we’ll meet by lunch.'),
        ('neighbor', 'ii.', 'Love of Neighbor', 'We practice compassionate presence.', 'You learn which neighbor takes two sugars in their cocoa. Next week, you remember. That’s ministry too.'),
        ('humility', 'iii.', 'Humility in Action', 'We look first to the interests of others.', 'Mopping the Ellis Room floor. Stacking pantry boxes. Listening more than talking. Faith on your sleeve, not in anyone’s face.'),
        ('multiply', 'iv.', 'Formation that Multiplies', 'We are disciples forming disciples.', 'A one-on-one with your mentor over coffee. Small group after dinner. What you’re learning becomes something you can pass on.')]
vows = ''.join(f'''<div class="vow5 rv" role="button" tabindex="0" aria-pressed="false" aria-label="{t}: turn the card over"><span class="vin"><span class="vf"><span class="art glass"><img class="lit" src="../assets/img/vow-{k}.jpg" alt="Stained-glass illustration: {t}" loading="lazy" width="900" height="900"></span><small>{n}</small><b>{t}</b><span class="sub">{sub}</span><span class="turn">Turn over</span><span class="fold"></span></span><span class="vb"><img class="vbimg" src="../assets/img/vow-{k}.jpg" alt="" loading="lazy"><small>On an ordinary Tuesday</small><span class="bt">{back}</span><span class="turn back">Turn back</span></span></span></div>''' for k, n, t, sub, back in VOWS)
HOURS = [("7:00", 420, "Morning prayer", "Before the neighborhood wakes", "Scripture, silence and prayer for each other and for the block. We get rooted before we go out."),
         ("8:00", 480, "One table", "Breakfast together", "Someone burns the toast, someone makes coffee for everyone. Shared meals are where community happens."),
         ("9:00", 540, "Teaching", "Speaker of the week", "Worship, then a new teacher each week on the character of God, identity, hearing His voice, the nations, justice and mercy."),
         ("12:30", 750, "Pray & work", "Lunch and chores", "Dishes, floors, pantry boxes. Humility learned with a mop in your hand."),
         ("14:00", 840, "On the street", "Local ministry", "The food pantry, the Ellis Room, hot chocolate on the corner. Mostly you listen, learn names and pray when asked."),
         ("17:30", 1050, "Dinner", "Back at the table", "The funny stories and the heavy ones get told here. Nobody carries the day alone."),
         ("19:00", 1140, "Reflection", "Small groups", "Where did you see God today? Small groups, mentorship and honest prayer close the day."),
         ("21:00", 1260, "Rest", "…or the night shift", "Most nights, rest. Some rain nights the Ellis Room stays lit until morning.")]
day = ''.join(f'<button type="button" class="hr" style="--x:{i/(len(HOURS)-1)*100:.2f}%" data-i="{i}"><span class="dot"></span><b>{t}</b><span class="nm">{n}</span></button>' for i, (t, m, n, s2, d) in enumerate(HOURS))
day_data = js([{'t': t, 'n': n, 's': s2, 'd': d} for t, m, n, s2, d in HOURS])
PHASES = [('i.', 'Training', 'About 3 months · San Francisco', 'local:phase-training', 'Weekly teaching and worship, small groups, one-on-one mentorship and local ministry in the Tenderloin, with a new speaker every week.'),
          ('ii.', 'Outreach', 'About 2 months · the cities of the world', 'team', 'Travel as a team to put what you’ve learned into practice, serving alongside local churches and ministries in urban centers.'),
          ('iii.', 'Debrief', 'The final days', 'local:phase-debrief', 'Reflect on all God has done and prepare for your next season, whether that’s work, college, joining YWAM or wherever He leads.')]
def pimg(k): return '../assets/img/' + k[6:] + '.jpg' if k.startswith('local:') else ph(k, 900)
phases = ''.join(f'<div class="phase rv"><div class="pimg"><img src="{pimg(img)}" alt="" loading="lazy"><span>{n}</span></div><h3>{t}</h3><small>{w}</small><p>{d}</p></div>' for n, t, w, img, d in PHASES)
TESTI_REAL = [x for x in load('testimonials.json').get('testimonials', []) if t(x.get('quote'))]
TESTI = [('Student story', 'DTS alumni quote goes here: one or two sentences in their own words about what changed.', 'Name · DTS year'),
         ('Student story', 'A second voice. Ideally someone who came unsure and left with a clearer sense of who God is.', 'Name · DTS year'),
         ('Student story', 'A third voice, perhaps from outreach: what they learned serving alongside a local church abroad.', 'Name · DTS year')]
testi = ''.join('<figure class="testi rv"><blockquote>“%s”</blockquote><figcaption>%s</figcaption></figure>' % (t(x.get('quote')).strip('“”"'), ' · '.join(v for v in (t(x.get('name')), t(x.get('detail'))) if v)) for x in TESTI_REAL) if TESTI_REAL else ''.join(f'<figure class="testi rv placeholder"><span class="ph-badge">{k}</span><blockquote>“{q}”</blockquote><figcaption>{c}</figcaption></figure>' for k, q, c in TESTI)
COACH = 'mailto:' + DEMAIL + '?subject=I%E2%80%99d%20like%20to%20talk%20to%20a%20DTS%20coach'
def _row(x):
    st = 'In session' if x['_s'] <= TODAY else (t(x.get('status')) or 'Applications open')
    href = lnk(x.get('apply_url'), DTS_APPLY)
    return '  <tr data-days="" data-href="%s" data-newtab="1"><td><span class="flap">%s</span></td><td><span class="flap">%s</span></td><td>%s</td><td><span class="status">%s</span></td></tr>' % (href, x['_s'].strftime('%b ').upper() + str(x['_s'].day) + ' ' + str(x['_s'].year), t(x.get('name') or 'Discipleship Training School').upper(), x['_e'].strftime('%b ').upper() + str(x['_e'].day) + ' ' + str(x['_e'].year), st)
DTS_ROWS = '\n'.join(_row(x) for x in ACTIVE) or '  <tr data-days=""><td><span class="flap">COMING SOON</span></td><td><span class="flap">DISCIPLESHIP TRAINING SCHOOL</span></td><td></td><td><span class="status">Dates TBA</span></td></tr>'
if NX:
    _hm = re.fullmatch(r'(\d{1,2}):(\d{2})', str(NX.get('start_time') or '09:00').strip()) or re.fullmatch(r'(\d+):(\d+)', '09:00')
    _start = datetime.datetime(NX['_s'].year, NX['_s'].month, NX['_s'].day, int(_hm.group(1)), int(_hm.group(2)), tzinfo=SF)
    COUNTDOWN_OPEN = '<div class="countdown" data-countdown="%s" aria-live="off">' % _start.isoformat()
    COUNTDOWN_CLOSE = ''
else:
    COUNTDOWN_OPEN = '<div class="countdown" hidden aria-live="off">'; COUNTDOWN_CLOSE = ''
BOARD_NOTE = ('Tap a school to apply.' if len(UPCOMING) > 1 else 'Tap the school to apply. More dates coming soon.') if UPCOMING else 'New dates coming soon. Email ' + DEMAIL + ' to hear first.'
FAQ = ''.join('<details%s><summary>%s</summary><p>%s</p></details>' % (' open' if i == 0 else '', t(q.get('question')), t(q.get('answer'))) for i, q in enumerate(x for x in load('faq.json').get('questions', []) if t(x.get('question'))))
DTS_INFO = {'range': drange(NX['_s'], NX['_e']) if NX else 'over five months', 'cost': money(DTS_COST), 'month': (NX['_s'].strftime('%B ') + str(NX['_s'].year)) if NX else 'the next school', 'start': md(NX['_s']) if NX else 'soon', 'apply': NX_APPLY, 'email': DEMAIL}
dts = f'''
<section class="bb" aria-label="DTS film on a billboard over San Francisco">
  <div class="bb-frame" data-qframe data-w="2000" data-h="1162">
    <img class="bg" src="../assets/img/dts-billboard.jpg" alt="A rooftop billboard in front of the San Francisco skyline, playing the YWAM San Francisco DTS film">
    <div class="bb-screen" data-quad="426.5,353.9 1733.2,381.1 1708.7,995.5 440.1,830.3"><div class="vposter" style="background-image:url('{CDN}1767778466252-U9HEDNEUX7JRPHIDTQR6/image-asset.jpeg?format=1500w')"></div><iframe id="dtsfilm" src="{YT_SRC}" title="YWAM San Francisco DTS film" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" tabindex="-1"></iframe></div>
    <button type="button" class="bb-hit" data-quad="426.5,353.9 1733.2,381.1 1708.7,995.5 440.1,830.3" aria-label="Play the DTS film from the beginning with sound"></button>
  </div>
  <div class="vctl"><button type="button" class="vsound" aria-pressed="false"><span class="ico" aria-hidden="true"></span><span class="lbl">Play with sound</span></button><button type="button" class="vfull" aria-label="Watch full screen"><span class="ico" aria-hidden="true"></span></button><button type="button" class="vplay" aria-pressed="false" aria-label="Pause film"><span class="ico" aria-hidden="true"></span></button></div>
</section>

<section class="pad heart"><div class="wrap heart-grid">
  <div class="rv"><span class="kick">DTS · The 5 Month Course{(' · ' + drange(NX['_s'], NX['_e'])) if NX else ''}</span>
    <h1>Do you find yourself longing for more?</h1>
    <p class="more"><span>More from life.</span> <span>More of Jesus.</span> <span>More of the world beyond your own.</span></p></div>
  <div class="rv heart-copy">
    <p class="lede">A Discipleship Training School (DTS) is five months set apart to know God and to make Him known. Three months of training here in the Tenderloin, two months of outreach in the cities of the world, then a debrief to send you into whatever comes next.</p>
    <p>We go to the edges, to the people most of the world walks past, not as heroes or fixers but as learners and neighbors. We listen first. We serve alongside local churches who were there long before us and will be there long after. And again and again we find that Jesus was already there too.</p>
    <div class="links-row"><a class="btn" href="{NX_APPLY}" target="_blank" rel="noopener">Apply for DTS</a><button class="btn ghost" type="button" data-survey>Am I ready?</button></div>
    <dl class="facts"><div><dt>Dates</dt><dd>{drange(NX['_s'], NX['_e']) if NX else 'Coming soon'}</dd></div><div><dt>Length</dt><dd>About 5 months</dd></div><div><dt>Cost</dt><dd>{money(DTS_COST)} USD</dd></div><div><dt>Where</dt><dd>{ADDR}</dd></div></dl>
  </div>
</div></section>

<section class="pad" style="padding-top:0"><div class="wrap">
  <div class="board rv"><div class="board-head"><span>DTS departures · 357 Ellis St</span><span class="clock"></span></div>
  <table><thead><tr><th>Departs</th><th>School</th><th>Returns</th><th>Status</th></tr></thead><tbody>
{DTS_ROWS}
  </tbody></table>
  {COUNTDOWN_OPEN}<span class="cd-lab">Departs in</span><div class="cd-units"><div><b data-u="d">--</b><small>Days</small></div><div><b data-u="h">--</b><small>Hours</small></div><div><b data-u="m">--</b><small>Minutes</small></div><div><b data-u="s">--</b><small>Seconds</small></div></div><a class="cd-cta" href="{NX_APPLY}" target="_blank" rel="noopener">Apply now →</a></div>{COUNTDOWN_CLOSE}</div>
  <p class="board-note">{BOARD_NOTE}</p>
</div></section>

<section class="pad monastery"><div class="wrap">
  <div class="mon-head rv"><h2>A monastery without walls</h2><p class="mon-sub">Live amid the chaos. Stay grounded in His presence.</p></div>
  <div class="mon-copy rv"><p class="lede">Monks used to build their monasteries far from the noise. We built ours in the middle of it. Sirens, shouting on the corner, a neighbor who needs to talk: the city doesn’t go quiet for us.</p>
  <p>So we keep a rhythm that holds. Morning prayer before the street wakes. One shared table. Silence, Scripture and work done with our hands. Over five months you learn what the old monks knew: stillness isn’t somewhere you go. It’s Someone you stay close to, wherever you are.</p></div>
  <div class="rhythm" aria-label="The rhythm of a DTS week">
    <figure class="rv"><div class="rph"><img src="../assets/img/rhythm-pray.jpg" alt="Students worshipping with a guitar in a city park" loading="lazy" style="object-position:58% 50%"></div><figcaption><b>Pray</b><span>Worship in the open air, in the middle of the city.</span></figcaption></figure>
    <figure class="rv"><div class="rph"><img src="../assets/img/rhythm-study.jpg" alt="Two students studying together at a table" loading="lazy" style="object-position:42% 50%"></div><figcaption><b>Study</b><span>Scripture, journals and long conversations.</span></figcaption></figure>
    <figure class="rv"><div class="rph"><img src="../assets/img/rhythm-serve.jpg" alt="A student kneeling to talk with a neighbor wrapped in a blanket" loading="lazy" style="object-position:52% 40%"></div><figcaption><b>Serve</b><span>Presence first. Names remembered.</span></figcaption></figure>
    <figure class="rv"><div class="rph"><img src="../assets/img/rhythm-rest.jpg" alt="Students on a coastal trail looking out at the Golden Gate Bridge" loading="lazy" style="object-position:33% 60%"></div><figcaption><b>Rest</b><span>Sabbath, and the city from a distance.</span></figcaption></figure>
  </div>
</div></section>

<section class="pad rule5" style="background:var(--mist)"><div class="wrap">
  <div class="rv rule5-head"><div><span class="kick">Our rule of life</span><h2>Four vows. One rhythm.</h2></div><p>Every monastery has a rule. Ours is short. Turn a card over to see what it looks like on an ordinary Tuesday.</p></div>
  <div class="vows5">{vows}</div>
  <div class="daybar rv" id="day"><div class="daybar-head"><span class="kick">A day in the life</span><span class="hint">Tap an hour</span></div>
    <div class="sky"><div class="sun"></div>{day}</div>
    <div class="hour5" aria-live="polite"><small data-h="t"></small><h3 data-h="n"></h3><p data-h="d"></p></div>
    <p class="note-small">A sample day. Rhythms shift week to week, and every week has free time and a Sabbath.</p></div>
</div></section>

<section class="pad"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Three parts, one journey</span><h2>From the neighborhood to the nations.</h2></div>
  <div class="phases">{phases}</div></div></section>

<section class="pad" style="background:var(--mist)"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">In their words</span><h2>Stories from past students.</h2></div>
  <div class="testis">{testi}</div></div></section>

<section class="pad" id="cost"><div class="wrap numbers5">
  <div class="rv"><span class="kick">Cost</span><h2>Clear numbers. No surprises.</h2>
    <div class="price5"><div class="amt">{money(DTS_COST)} <small>USD*</small></div><p>We believe finances shouldn’t stop someone from saying yes. Our team will help you explore fundraising and support options.</p><p class="fine">*{t(_DTS.get('cost_note') or 'Cost may vary for international applicants; please ask about alternative pricing.')}</p></div></div>
  <div class="faq5 rv"><span class="kick">FAQ</span>
    {FAQ}
  </div>
</div></section>

<section class="ready pad"><div class="wrap">
  <div class="rv ready-head"><span class="kick">The door is open</span><h2>How do I know I’m ready for a DTS?</h2><p>You don’t have to figure it out alone. Start wherever feels right.</p></div>
  <div class="ready3">
    <button class="rcard rv" type="button" data-survey><small>01 · Reflect</small><b>Take the 3-minute check-in</b><span>Seven honest questions with a gentle, personal read on where you are.</span><em>Start →</em></button>
    <a class="rcard rv" href="{COACH}"><small>02 · Talk</small><b>Talk to a DTS coach</b><span>A real conversation with someone from our DTS staff. Ask anything, no pressure.</span><em>Email a coach →</em></a>
    <a class="rcard rv solid" href="{NX_APPLY}" target="_blank" rel="noopener"><small>03 · Apply</small><b>{('Apply for ' + NX['_s'].strftime('%B')) if NX else 'Apply for DTS'}</b><span>{('Applications are open for the ' + NX['_s'].strftime('%B ') + str(NX['_s'].day) + ', ' + str(NX['_s'].year) + ' school.') if NX else 'New school dates are coming soon. Get in touch and we’ll let you know.'}</span><em>Apply now →</em></a>
  </div>
  <p class="ready-foot rv">Want to see the place first? <a href="../volunteer/">Serve a shift on Ellis Street</a> or <a href="../teams/">come with a team</a>.</p>
</div></section>

<div class="modal" id="modal" aria-hidden="true"><div class="modal-box"><button class="modal-x" aria-label="Close">✕</button><div id="survey"></div></div></div>
'''
dts_scripts = f'<script>window.YWAM_DAY={day_data};window.YWAM_DTS={js(DTS_INFO)};</script><script src="../assets/survey.js?v={VER}"></script>'
dts_head = f'<link rel="stylesheet" href="../assets/survey.css?v={VER}">'
os.makedirs(os.path.join(OUT, 'course'), exist_ok=True)
open(os.path.join(OUT, 'course/index.html'), 'w').write(page('DTS (5 Month Course) — YWAM San Francisco', 'course', '../', '../../', dts, extra_head=dts_head, scripts=dts_scripts))

# ---------------------------------------------------------------- ABOUT SECTION (Who We Are + History · Staff & Board · News & Events)
CDN = C
def subnav(cur, ab):
    """ab = relative path from the current page to the about/ folder"""
    items = [(ab, 'Who We Are', 'who'), (ab + 'people/', 'Staff & Board', 'people'), (ab + 'news/', 'News & Events', 'news'), (ab + '../contact/', 'Contact', 'contact')]
    return '<nav class="subnav" aria-label="About"><div class="wrap"><span>About</span>' + ''.join('<a href="%s"%s>%s</a>' % (h or './', ' aria-current="page"' if k == cur else '', t) for h, t, k in items) + '</div></nav>'

def hero(img, alt, kick, h1, lede):
    return f'''<section class="page-hero"><div class="ph-img"><img src="{img}" alt="{alt}"></div><div class="copy"><div class="wrap"><span class="kick">{kick}</span><h1>{h1}</h1><p class="lede">{lede}</p></div></div></section>'''

WAYS = ['Having influence in significant places', 'Creating opportunities for community involvement in urban missions', 'Collaborating with local churches and agencies', 'Supporting complete individual development', 'Advocating for vulnerable populations', 'Using creative means to share faith', 'Reaching unreached populations with citywide impact']
TIMELINE = [
 ('1987', 'YWAM Northern California begins', 'John Dawson commissions Dick and Pat Eachus to establish YWAM Northern California from the Southwest Regional headquarters, building on relationships formed by Loren and Darlene Cunningham, the Dawsons and the Eachus family.'),
 ('1987–88', 'Prayer walking the city', 'An office opens, the team develops a system of prayer walking and demographic research, and Cecil and Lillian Cooper transfer the Springs of Living Water property to YWAM.'),
 ('1991', 'The first DTS', 'Our first Discipleship Training School is held at the Bridgemont High School facility.'),
 ('1995', 'Home on Ellis Street', 'Staff move into the Tenderloin Training and Outreach Center at 357 Ellis Street, and Mission Adventures begins.'),
 ('1996', 'Training in the Tenderloin', 'The first DTS at 357 Ellis Street runs in the fall. A second annual school is added in January 2002.'),
 ('1998–2004', 'Reaching across the city', 'The Street Team opens “The Refuge” discipleship house on Girard Street (1998), then The Pharos on Polk Street (2001). The base director moves to Bayview–Hunters Point (1999), and Oakdale Youth House opens there with after-school programs and summer camps (2003). The Street Team returns to Ellis Street in 2004.'),
 ('2007', '1,600 on mission', 'Mission Adventures hosts more than 1,600 participants in a single year.'),
 ('2008', 'A full house', 'Two DTSs a year, Mission Adventures teams, Oakdale Youth House, the Street Team, a Discipleship Training Program and an Urban Internship.'),
 ('Today', 'Presence that restores', 'The Ellis Room, the food pantry, showers and haircuts, Bible study, Pop-Up Church and the DTS, all from the same 100-year-old building on Ellis Street.'),
]
tl = ''.join(f'<li class="rv"><span class="yr">{y}</span><div><h3>{t}</h3><p>{d}</p></div></li>' for y, t, d in TIMELINE)
who = hero(ph('signst', 2000), 'The YWAM San Francisco building at 357 Ellis Street', 'Who we are', 'We believe God loves San Francisco.', 'We believe God is pursuing real, transformational relationship with each and every person in our city, and we want to be a part of what God is already doing.') + subnav('who', '') + f'''
<section class="pad"><div class="wrap"><span class="kick" style="text-align:center">Our mission</span><p class="lit" data-lit>Our mission is to engage San Francisco with a loving God.</p>
<p class="lede mission rv">We have a vision to birth unique, focused ministry throughout San Francisco, reaching each sphere of society in ways that are relevant and creative. In our city, mission is at our doorstep.</p></div></section>
<section class="pad" style="background:var(--mist)"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">How we engage the city</span><h2>Seven ways we show up.</h2></div>
<ol class="ways rv">{"".join("<li>%s</li>" % w for w in WAYS)}<li class="q">In our city, mission is at our doorstep.</li></ol></div></section>
<section class="pad" id="history"><div class="wrap hist"><div class="hist-head rv"><span class="kick">Our history</span><h2>Since 1987.</h2><blockquote>“The city of San Francisco is only 47 square miles in size, but its potential to reach the nations is endless.”</blockquote></div>
<ol class="timeline">{tl}</ol></div></section>
<section class="pad" style="background:var(--mist)"><div class="wrap family"><div class="rv"><span class="kick">Our family</span><h2>Part of something bigger.</h2><p class="lede">YWAM San Francisco is a non-profit and part of the YWAM San Francisco Bay Area family of ministries, which belongs to Youth With A Mission, a global, interdenominational movement of Christians from many cultures and churches.</p><div class="links-row"><a class="btn" href="https://ywamsfbayarea.org/" target="_blank" rel="noopener">YWAM SF Bay Area</a><a class="btn ghost" href="https://ywam.org/" target="_blank" rel="noopener">YWAM International</a></div></div>
<div class="rings rv" aria-hidden="true"><span>Youth With A Mission</span><span>San Francisco Bay Area</span><span>YWAM San Francisco</span></div></div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Meet the people behind the work.</h2><p>Our staff serve on Ellis Street every day, with a board that helps guide and steward the ministry.</p><div class="row"><a class="btn light" href="people/">Staff &amp; Board</a><a class="btn ghost-light" href="../contact/">Contact us</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'about'), exist_ok=True)
open(os.path.join(OUT, 'about/index.html'), 'w').write(page('Who We Are — YWAM San Francisco', 'about', '../', '../../', who))

# staff & board
STAFF = load('staff.json')
def face(p, w, cls='av'):
    u = img(p.get('photo'), '../../', w)
    if u: return '<img class="%s ph" src="%s" alt="%s" loading="lazy">' % (cls, u, t(p.get('name')))
    return '<span class="%s">%s</span>' % (cls, t(initials(p.get('name') or '?')))
lead = ''.join('<div class="person lead rv">' + face(p, 750, 'pp') + '<div class="pt"><h3>' + t(p.get('name')) + '</h3><p>' + t(p.get('role')) + '</p></div></div>' for p in STAFF.get('directors', []) if t(p.get('name')))
teams_html = ''.join('<div class="crew rv"><h4>' + t(tm.get('name')) + '</h4><ul>' + ''.join('<li>' + face(p, 300) + t(p.get('name')) + '</li>' for p in tm.get('members', []) if t(p.get('name'))) + '</ul></div>' for tm in STAFF.get('teams', []) if tm.get('members'))
board = ''.join('<article class="bm rv">%s<div><h3>%s</h3><small>%s</small><p>%s</p></div></article>' % (('<img src="%s" alt="%s" loading="lazy">' % (img(b.get('photo'), '../../', 500), t(b.get('name')))) if img(b.get('photo'), '../../', 500) else '<span class="bm-av">%s</span>' % t(initials(b.get('name'))), t(b.get('name')), t(b.get('role')), t(b.get('bio'))) for b in load('board.json').get('members', []) if t(b.get('name')))
people = hero(ph('team', 2000), 'YWAM San Francisco staff and volunteers on outreach', 'Staff & Board', 'The people on Ellis Street.', 'A small team of staff, joined by students, volunteers and outreach teams, serves the Tenderloin every day. A board of experienced leaders helps steward the ministry.') + subnav('people', '../') + f'''
<section class="pad"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Leadership</span><h2>Our directors.</h2></div>
<div class="people4">{lead}</div>
<div class="crews">{teams_html}</div></div></section>
<section class="pad" style="background:var(--mist)" id="board"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Board of directors</span><h2>Guiding and stewarding the ministry.</h2><p class="lede">Our board brings decades of experience in missions, leadership and finance.</p></div>
<div class="board-grid">{board}</div></div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Join the staff.</h2><p>Most of our staff first came for a DTS. If you’re sensing a call to serve in the city, start a conversation with us.</p><div class="row"><a class="btn light" href="../../course/">DTS (5 Month Course)</a><a class="btn ghost-light" href="../../contact/">Get in touch</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'about/people'), exist_ok=True)
open(os.path.join(OUT, 'about/people/index.html'), 'w').write(page('Staff & Board — YWAM San Francisco', 'about', '../../', '../../../', people))

# news & events
def _ev_ok(e):
    d = _d(e.get('date')) if e.get('date') else None
    return t(e.get('title')) and (d is None or d >= TODAY)
EVENTS = ''.join('<div class="ev5 rv"><div class="when"><b>%s</b><span>%s</span></div><div><h3>%s</h3><p>%s</p></div></div>' % (t(e.get('when')) or (_d(e.get('date')).strftime('%b') if _d(e.get('date')) else ''), t(e.get('when_detail')) or (str(_d(e.get('date')).day) if _d(e.get('date')) else ''), t(e.get('title')), t(e.get('description'))) for e in load('events.json').get('events', []) if _ev_ok(e))
POSTS = [
 ('night', 'Feb 17, 2026', 'Keeping the lights on after hours', 'When it rains in the Tenderloin, the Ellis Room stays open from 9 pm to 5 am for friends with nowhere dry to stay.', '/blog/2026/2/17/keeping-the-lights-on-after-hours-in-the-ellis-room'),
 ('blog_church', 'Jan 19, 2026', 'Church that shows up', 'Hot chocolate, cookies and worship on the sidewalk every Sunday morning.', '/blog/2026/1/19/church-that-shows-up'),
 ('blog_food', 'Jan 19, 2026', 'Feeding our city with hope', 'More than 300 people a week, met with fresh food and warm smiles.', '/blog/2026/1/19/feeding-our-city-with-hope'),
 ('blog_cocoa', 'Jan 14, 2026', 'Hot chocolate', 'A simple ministry making a real impact, one conversation at a time.', '/blog/2026/1/14/hot-chocolate-a-simple-ministry-making-a-real-impact-in-san-francisco'),
 ('xmas', 'Christmas', '209 neighbors at Christmas lunch', 'Thank you to the many volunteers who came and helped serve one long table.', '/blog'),
 ('lunch', 'Oct 22, 2019', 'Seniors of the TL', 'Stories from some of the Tenderloin’s longest-standing residents.', '/blog/2019/10/22/seniors-of-the-tl'),
]
posts = ''.join(f'<a class="story rv" href="{LIVE}{u}" target="_blank" rel="noopener"><div class="ph"><img src="{ph(k,900)}" alt="" loading="lazy"></div><small class="date">{d}</small><h3>{t}</h3><p>{x}</p></a>' for k, d, t, x, u in POSTS)
news = hero(ph('preach', 2000), 'Pop-Up Church on the sidewalk', 'News & Events', 'What’s happening on Ellis Street.', 'Updates from the ministry, stories from the neighborhood, and the gatherings anyone is welcome to join.') + subnav('news', '../') + f'''
<section class="pad"><div class="wrap"><div class="update rv"><img src="{ph('timkarol',900)}" alt="Tim and Karol" loading="lazy"><div><span class="kick">Leadership update</span><h2>Thank you, Tim and Karol.</h2><p class="lede">After 18 faithful years leading YWAM in the Tenderloin, Tim and Karol are transitioning out of their leadership role. We’re deeply grateful for their years of love and service on Ellis Street.</p><a class="btn ghost" href="{LIVE}/blog" target="_blank" rel="noopener">Read the update</a></div></div></div></section>
<section class="pad" style="background:var(--mist)"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Gatherings</span><h2>Come and join us.</h2><p class="lede">Everyone is welcome at 357 Ellis Street.</p></div>
<div class="events">
{EVENTS}
</div><div class="links-row"><a class="btn" href="{LIVE}/events" target="_blank" rel="noopener">See the events calendar</a></div></div></section>
<section class="pad"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">From the blog</span><h2>Stories from the street.</h2></div>
<div class="stories news-grid">{posts}</div>
<div class="links-row"><a class="btn" href="{LIVE}/blog" target="_blank" rel="noopener">Read the blog</a><a class="btn ghost" href="{LIVE}/resources" target="_blank" rel="noopener">Resources</a></div></div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Be part of the next story.</h2><p>Serve a shift, bring a team, or give toward the work on Ellis Street.</p><div class="row"><a class="btn light" href="../../volunteer/">Volunteer</a><a class="btn ghost-light" href="../../give/">Give</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'about/news'), exist_ok=True)
open(os.path.join(OUT, 'about/news/index.html'), 'w').write(page('News & Events — YWAM San Francisco', 'about', '../../', '../../../', news))


# ---------------------------------------------------------------- PAY (placeholder until a payment processor is connected)
pay = f'''
<section class="pay-sec"><div class="wrap pay-grid">
  <div class="pay-intro rv"><span class="kick">Pay</span><h1>Make a payment.</h1>
    <p class="lede">Pay school or trip fees for yourself or someone else. Choose what it’s for, tell us who it’s for, and we’ll make sure it’s applied to the right person.</p>
    <ul class="pay-notes"><li>Payments go straight to a student’s or participant’s account.</li><li>To support our work in general, please <a href="../give/">give here</a> instead.</li><li>Questions? Email <a href="mailto:{EMAIL}">{EMAIL}</a> or call {PHONE}.</li></ul></div>
  <form class="pay-card rv" id="payform" novalidate>
    <fieldset class="pay-opts"><legend>What is this payment for?</legend>
      <label class="opt"><input type="radio" name="program" value="DTS (5 Month Course)" checked><span class="o"><span class="drw"><svg class="dr ghost" viewBox="0 0 84 76" aria-hidden="true"><path pathLength="1" d="M42 30 C32 24 20 23 8 26 V60 C20 57 32 58 42 64"/><path pathLength="1" d="M42 30 C52 24 64 23 76 26 V60 C64 57 52 58 42 64"/><path pathLength="1" d="M42 30 V64"/><path pathLength="1" d="M15 36 C22 34.5 28 35 35 37 M15 44 C22 42.5 28 43 35 45 M15 52 C22 50.5 28 51 35 53"/><path pathLength="1" d="M49 37 C56 35 62 34.5 69 36 M49 45 C56 43 62 42.5 69 44 M49 53 C56 51 62 50.5 69 52"/><path pathLength="1" d="M42 21 C37.5 17 38.5 10 42 4 C45.5 10 46.5 17 42 21 Z" class="r"/></svg><svg class="dr" viewBox="0 0 84 76" aria-hidden="true"><path pathLength="1" d="M42 30 C32 24 20 23 8 26 V60 C20 57 32 58 42 64"/><path pathLength="1" d="M42 30 C52 24 64 23 76 26 V60 C64 57 52 58 42 64"/><path pathLength="1" d="M42 30 V64"/><path pathLength="1" d="M15 36 C22 34.5 28 35 35 37 M15 44 C22 42.5 28 43 35 45 M15 52 C22 50.5 28 51 35 53"/><path pathLength="1" d="M49 37 C56 35 62 34.5 69 36 M49 45 C56 43 62 42.5 69 44 M49 53 C56 51 62 50.5 69 52"/><path pathLength="1" d="M42 21 C37.5 17 38.5 10 42 4 C45.5 10 46.5 17 42 21 Z" class="r"/></svg></span><b>DTS</b><small>5 Month Course · school fees</small></span></label>
      <label class="opt"><input type="radio" name="program" value="Mission Adventures"><span class="o"><span class="drw"><svg class="dr ghost" viewBox="0 0 84 76" aria-hidden="true"><path pathLength="1" d="M4 8 L80 12 M42 10 V22" class="r"/><path pathLength="1" d="M6 30 H78 M14 30 L20 22 H64 L70 30"/><path pathLength="1" d="M10 30 V58 H74 V30"/><path pathLength="1" d="M17 36 H29 V46 H17 Z M36 36 H48 V58 M55 36 H67 V46 H55 Z"/><path pathLength="1" d="M18 62 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M58 62 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0"/><path pathLength="1" d="M2 70 H82"/></svg><svg class="dr" viewBox="0 0 84 76" aria-hidden="true"><path pathLength="1" d="M4 8 L80 12 M42 10 V22" class="r"/><path pathLength="1" d="M6 30 H78 M14 30 L20 22 H64 L70 30"/><path pathLength="1" d="M10 30 V58 H74 V30"/><path pathLength="1" d="M17 36 H29 V46 H17 Z M36 36 H48 V58 M55 36 H67 V46 H55 Z"/><path pathLength="1" d="M18 62 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M58 62 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0"/><path pathLength="1" d="M2 70 H82"/></svg></span><b>Mission Adventures</b><small>Team trip · participant fees</small></span></label>
    </fieldset>
    <label class="fld"><span>Who is this payment for?</span><input name="for" required autocomplete="off" placeholder="Student or participant’s full name"></label>
    <label class="fld team-only" hidden><span>Team or church name</span><input name="team" autocomplete="organization" placeholder="e.g. Grace Church Youth"></label>
    <label class="fld"><span>Amount (USD)</span><div class="amt-row"><span class="cur">$</span><input name="amount" type="number" min="1" step="0.01" inputmode="decimal" required placeholder="0.00"></div></label>
    <div class="quick" aria-label="Quick amounts"></div>
    <div class="two"><label class="fld"><span>Your name</span><input name="payer" required autocomplete="name"></label><label class="fld"><span>Your email</span><input name="email" type="email" required autocomplete="email"></label></div>
    <label class="fld"><span>Note <i>(optional)</i></span><input name="note" placeholder="Deposit, balance, outreach fee…"></label>
    <button class="btn pay-btn" type="submit">Continue to payment</button>
    <p class="pay-soon" role="status">Online card payments are coming soon. For now, “Continue” sends these details to our finance team, who will reply with how to pay.</p>
  </form>
</div></section>
'''
pay_js = '''<script>(function(){var f=document.getElementById('payform');if(!f)return;
var Q={'DTS (5 Month Course)':[250,1000,%d],'Mission Adventures':[%d,500,1000]},quick=f.querySelector('.quick'),team=f.querySelector('.team-only');
function upd(){var p=f.program.value;team.hidden=p!=='Mission Adventures';quick.innerHTML='';Q[p].forEach(function(v){var b=document.createElement('button');b.type='button';b.textContent='$'+v.toLocaleString();b.onclick=function(){f.amount.value=v;[].forEach.call(quick.children,function(x){x.classList.toggle('on',x===b)})};quick.appendChild(b)});}
[].forEach.call(f.program,function(r){r.addEventListener('change',upd)});upd();
f.amount.addEventListener('input',function(){[].forEach.call(quick.children,function(x){x.classList.remove('on')})});
f.addEventListener('submit',function(e){e.preventDefault();if(!f.reportValidity())return;
var a=parseFloat(f.amount.value).toFixed(2),sub='Payment: '+f.program.value+' for '+f['for'].value+' ($'+a+')';
var body='Program: '+f.program.value+'\\nFor: '+f['for'].value+(f.team.value&&!team.hidden?'\\nTeam: '+f.team.value:'')+'\\nAmount: $'+a+'\\nFrom: '+f.payer.value+' <'+f.email.value+'>'+(f.note.value?'\\nNote: '+f.note.value:'');
location.href='mailto:%s?subject='+encodeURIComponent(sub)+'&body='+encodeURIComponent(body);});})();</script>''' % (int(DTS_COST), MA_RATE, EMAIL)
os.makedirs(os.path.join(OUT, 'pay'), exist_ok=True)
open(os.path.join(OUT, 'pay/index.html'), 'w').write(page('Pay — YWAM San Francisco', 'pay', '../', '../../', pay, scripts=pay_js))

# ---------------------------------------------------------------- GIVE
give = f'''
<section class="page-hero"><div class="ph-img"><img src="{ph('xmas',2000)}" alt="Neighbors at one long table for Christmas lunch"></div><div class="copy"><div class="wrap"><span class="kick">Give</span><h1>Keep the doors open on Ellis Street.</h1><p class="lede">Your generosity puts groceries on the pantry tables, hot water in the showers and keeps the lights on in the Ellis Room.</p></div></div></section>
<section class="pad give-top"><div class="wrap">
  <div class="give-online rv">
    <div class="go-txt"><span class="kick">The quickest way</span><h2>Give online.</h2><p>Give once or monthly by card or bank account through our secure giving page, powered by Click &amp; Pledge. Monthly gifts help us plan ahead for the pantry, showers and outreach.</p></div>
    <div class="go-cta"><a class="btn" href="{GIVE_ONLINE}" target="_blank" rel="noopener">Give online →</a><small>Secure · tax-deductible · receipt by email</small></div>
  </div>
</div></section>
<section class="pad give-ways" style="padding-top:0"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:26px"><span class="kick">Other ways to give</span><h2>However you’d like to help.</h2></div>
<div class="gw-grid"><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 22h60v34H10z"/><path pathLength="1" d="M10 22l30 20 30-20"/><path pathLength="1" class="r" d="M54 14h12v12"/><path pathLength="1" class="r" d="M48 32l18-18"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 22h60v34H10z"/><path pathLength="1" d="M10 22l30 20 30-20"/><path pathLength="1" class="r" d="M54 14h12v12"/><path pathLength="1" class="r" d="M48 32l18-18"/></svg></span><h3>By check</h3><p>Payable to YWAM San Francisco, mailed to {ADDR}, {CITY}.</p></div><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M12 30L40 14l28 16"/><path pathLength="1" d="M12 60h56M16 56h48"/><path pathLength="1" d="M22 34v20M34 34v20M46 34v20M58 34v20"/><path pathLength="1" class="r" d="M30 24h20"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M12 30L40 14l28 16"/><path pathLength="1" d="M12 60h56M16 56h48"/><path pathLength="1" d="M22 34v20M34 34v20M46 34v20M58 34v20"/><path pathLength="1" class="r" d="M30 24h20"/></svg></span><h3>Recurring bank transfer</h3><p>Give monthly straight from your bank account (ACH). We’ll send you a short form.</p><a class="go" href="mailto:{EMAIL}?subject=ACH%20giving%20form">Request the form →</a></div><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M14 32h52v28H14z"/><path pathLength="1" d="M10 24h60v8H10z"/><path pathLength="1" d="M40 24v36"/><path pathLength="1" class="r" d="M40 24c-6-10-18-10-16-2 2 5 16 2 16 2zM40 24c6-10 18-10 16-2-2 5-16 2-16 2z"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M14 32h52v28H14z"/><path pathLength="1" d="M10 24h60v8H10z"/><path pathLength="1" d="M40 24v36"/><path pathLength="1" class="r" d="M40 24c-6-10-18-10-16-2 2 5 16 2 16 2zM40 24c6-10 18-10 16-2-2 5-16 2-16 2z"/></svg></span><h3>In-kind gifts</h3><p>New socks, toiletries and more for neighbors who visit the Ellis Room.</p><a class="go" href="{LIVE}/give" target="_blank" rel="noopener">See what we need →</a></div><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M8 42l10-10c3-3 7-3 10 0l6 6"/><path pathLength="1" d="M72 42L62 32c-3-3-7-3-10 0L38 46c-3 3 1 7 4 4l6-6"/><path pathLength="1" d="M18 50l10 10M26 46l10 10"/><path pathLength="1" class="r" d="M40 8v12M34 14h12"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M8 42l10-10c3-3 7-3 10 0l6 6"/><path pathLength="1" d="M72 42L62 32c-3-3-7-3-10 0L38 46c-3 3 1 7 4 4l6-6"/><path pathLength="1" d="M18 50l10 10M26 46l10 10"/><path pathLength="1" class="r" d="M40 8v12M34 14h12"/></svg></span><h3>Employer matching</h3><p>Many employers match gifts, so yours could go twice as far.</p></div><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M40 62a26 26 0 1 0 0-52 26 26 0 0 0 0 52z"/><path pathLength="1" d="M14 36h52M40 10c-10 12-10 40 0 52M40 10c10 12 10 40 0 52"/><path pathLength="1" class="r" d="M58 14l10-4-4 10M68 10L52 26"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M40 62a26 26 0 1 0 0-52 26 26 0 0 0 0 52z"/><path pathLength="1" d="M14 36h52M40 10c-10 12-10 40 0 52M40 10c10 12 10 40 0 52"/><path pathLength="1" class="r" d="M58 14l10-4-4 10M68 10L52 26"/></svg></span><h3>Wire transfer</h3><p>Domestic or international. Ask us for the instructions.</p><a class="go" href="mailto:{EMAIL}?subject=Wire%20transfer%20instructions">Ask for instructions →</a></div><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M12 12v48h56"/><path pathLength="1" d="M22 50V40M34 50V32M46 50V36M58 50V24"/><path pathLength="1" class="r" d="M20 36l12-10 12 6 18-16"/><path pathLength="1" class="r" d="M54 16h8v8"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M12 12v48h56"/><path pathLength="1" d="M22 50V40M34 50V32M46 50V36M58 50V24"/><path pathLength="1" class="r" d="M20 36l12-10 12 6 18-16"/><path pathLength="1" class="r" d="M54 16h8v8"/></svg></span><h3>Stocks & securities</h3><p>Contact our finance office to give appreciated stock.</p><a class="go" href="{TEL}">{PHONE} →</a></div></div>
<p class="taxnote">YWAM San Francisco is a non-profit. Tax receipts are issued to U.S. residents only, and contributions are tax-deductible as allowed by IRS guidelines. Gifts toward staff members are accepted. Student donations and school fees are not tax-deductible; to pay fees, use the <a href="../pay/">Pay page</a>.</p></div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Give your time, too.</h2><p>Some of the best gifts are an afternoon at the pantry or an evening with hot chocolate on the corner.</p><div class="row"><a class="btn light" href="../volunteer/">Come volunteer</a><a class="btn ghost-light" href="../teams/">Bring a team</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'give'), exist_ok=True)
open(os.path.join(OUT, 'give/index.html'), 'w').write(page('Give — YWAM San Francisco', 'give', '../', '../../', give))

# ---------------------------------------------------------------- CONTACT
MAP = 'https://maps.google.com/maps?q=357%20Ellis%20St%2C%20San%20Francisco%2C%20CA%2094102&z=16&output=embed'
contact = f'''
<section class="page-hero"><div class="ph-img"><img src="{ph('night',2000)}" alt="The Ellis Room lit up on a rainy night"></div><div class="copy"><div class="wrap"><span class="kick">Contact us · 357 Ellis Street</span><h1>Come by. <em>Say hello.</em></h1><p class="lede">Whether you want to serve, bring a team, join a school or just ask a question, we’d love to hear from you.</p></div></div></section>''' + subnav('contact', '../about/') + f'''
<section class="pad"><div class="wrap contact-grid">
<div class="rv"><span class="kick">Find us</span><h2>In the heart of <em>the Tenderloin.</em></h2>
<div class="cards-c" style="margin-top:22px"><div class="cc wide"><small>Visit</small><b>{ADDR}<br>{CITY}</b></div><div class="cc"><small>Call</small><a href="{TEL}">{PHONE}</a></div><div class="cc"><small>Email</small><a class="em" href="mailto:{EMAIL}">{EMAIL}</a></div><div class="cc"><small>Volunteering</small><a class="em" href="mailto:{VEMAIL}">{VEMAIL}</a></div><div class="cc"><small>Teams &amp; outreach</small><a class="em" href="mailto:{OEMAIL}">{OEMAIL}</a></div><div class="cc wide"><small>DTS (5 Month Course)</small><a class="em" href="mailto:{DEMAIL}">{DEMAIL}</a></div></div>
<div class="hours">{"".join('<div><b>%s</b><span>%s</span></div>' % (t(h.get('label')), t(h.get('text'))) for h in S.get('hours', []) if t(h.get('label')))}</div></div>
<div class="map rv"><iframe title="Map of 357 Ellis Street, San Francisco" src="{MAP}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
</div></section>
<section class="pad" style="background:var(--mist)"><div class="wrap contact-grid">
<div class="rv"><span class="kick">Send a message</span><h2>How can we <em>help?</em></h2><p class="lede">Tell us a little about yourself and what you’re hoping for. We usually reply within a few days.</p><p>Looking for food help? Pantry sign-ups happen on site at 357 Ellis Street, Thursdays at 3:30 pm. For food right away, visit the <a href="https://www.sfmfoodbank.org/find-food/" target="_blank" rel="noopener">SF-Marin Food Bank</a> or call 211.</p></div>
<form class="msg rv" id="msg"><div class="two"><label>Name<input name="name" required autocomplete="name"></label><label>Email<input name="email" type="email" required autocomplete="email"></label></div>
<label>I’m asking about<select name="topic"><option value="{EMAIL}">Something else</option><option value="{VEMAIL}">Volunteering</option><option value="{OEMAIL}">Bringing a team</option><option value="{DEMAIL}">DTS (5 Month Course)</option><option value="{EMAIL}|Giving">Giving</option></select></label>
<label>Message<textarea name="message" required></textarea></label>
<div><button class="btn" type="submit">Send message</button></div><p class="note">This opens your email app with your message filled in, addressed to the right person on our team.</p></form>
</div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Ready to <em>jump in?</em></h2><p>Pick a volunteer shift, plan a team trip, or apply for our next DTS.</p><div class="row"><a class="btn light" href="../volunteer/">Volunteer</a><a class="btn ghost-light" href="../teams/">Bring a team</a><a class="btn ghost-light" href="../course/">DTS (5 Month Course)</a></div></div></section>
'''
contact_js = '''<script>(function(){var f=document.getElementById('msg');if(!f)return;f.addEventListener('submit',function(e){e.preventDefault();var t=f.topic.value.split('|'),to=t[0],lab=f.topic.options[f.topic.selectedIndex].text;var sub='Website message: '+lab+' ('+f.name.value+')';var body=f.message.value+'\\n\\n'+f.name.value+'\\n'+f.email.value;location.href='mailto:'+to+'?subject='+encodeURIComponent(sub)+'&body='+encodeURIComponent(body);});})();</script>'''
os.makedirs(os.path.join(OUT, 'contact'), exist_ok=True)
open(os.path.join(OUT, 'contact/index.html'), 'w').write(page('Contact Us — YWAM San Francisco', 'contact', '../', '../../', contact, scripts=contact_js))
print('built', V, VER)
