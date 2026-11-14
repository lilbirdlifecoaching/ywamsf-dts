#!/usr/bin/env python3
"""Builds YWAM 7: a copy of YWAM 6 (src/) to try big simplifications without touching YWAM 5 and 6.
Shares content/ (and so the admin page) with YWAM 5 and 6; has its own styles and scripts in src7/assets."""
import os, re, html, shutil, json, hashlib, datetime
from zoneinfo import ZoneInfo
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = 7   # this generator only builds YWAM 7
OUT = os.environ.get('OUT') or os.path.join(ROOT, 'ywam%d' % V)
CONTENT = os.path.join(ROOT, 'content')
SF = ZoneInfo('America/Los_Angeles')
TODAY = datetime.date.fromisoformat(os.environ['TODAY']) if os.environ.get('TODAY') else datetime.datetime.now(SF).date()
if os.path.isdir(OUT): shutil.rmtree(OUT)
shutil.copytree(os.path.join(ROOT, 'src7', 'assets'), os.path.join(OUT, 'assets'))
UPRE = re.compile(r'uploads/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:jpe?g|png|webp)$')
os.makedirs(os.path.join(OUT, 'assets', 'uploads'), exist_ok=True)
for f in sorted(os.listdir(os.path.join(CONTENT, 'uploads'))):
    if UPRE.match('uploads/' + f): shutil.copy2(os.path.join(CONTENT, 'uploads', f), os.path.join(OUT, 'assets', 'uploads', f))
_h = hashlib.sha1()
for d, _, fs in sorted(os.walk(os.path.join(ROOT, 'src7', 'assets'))):
    for f in sorted(fs):
        if f.endswith(('.css', '.js')): _h.update(open(os.path.join(d, f), 'rb').read())
# YWAM 6 brand palette (Oct 2026): white page, logo cyan as the anchor, deep teal for weight, red only for tiny "today" marks.
# The shared stylesheet is written for YWAM 5's fog palette; YWAM 6 gets the same file with these colour literals swapped.
TB_SWAP = [('rgba(234,237,240,', 'rgba(255,255,255,'), ('#dfe6ec', '#E3F3F5'), ('rgba(154,30,20,', 'rgba(11,126,144,'),
           ('#ff3a30', '#C81D1B'), ('rgba(255,58,48,', 'rgba(200,29,27,'), ('rgba(70,83,97,', 'rgba(8,64,79,'),
           ('rgba(247,248,249,', 'rgba(241,248,249,')]
if V in (6, 7): _h.update(repr(TB_SWAP).encode())
VER = _h.hexdigest()[:10]
_kh = hashlib.sha1((VER + str(TODAY)).encode())
for f in sorted(os.listdir(CONTENT)):
    if f.endswith('.json'): _kh.update(open(os.path.join(CONTENT, f), 'rb').read())
_kh.update(open(os.path.abspath(__file__), 'rb').read())
KBV = _kh.hexdigest()[:10]
if V in (6, 7):
    _cp = os.path.join(OUT, 'assets', 'site5.css'); _css = open(_cp).read()
    for a, b in TB_SWAP: _css = _css.replace(a, b)
    open(_cp, 'w').write(_css)

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
# Click & Pledge Connect form, the same one embedded on ywamsanfrancisco.org/donate-credit-card
CNP_FORM = 'https://connect.clickandpledge.com/w/Form/32fcb711-dd22-4115-829c-5aead24bcac5'
SIGNUP = DTS_APPLY   # Sign Me Up buttons go straight to the DTS application
TEAM_FORM = lnk(S.get('team_booking_url'), 'https://www.tfaforms.com/4652564')
DTS_INQUIRY_FORM = lnk(S.get('dts_inquiry_url'), 'https://www.tfaforms.com/4827504')
DTS_APPLICATION_FORM = lnk((NX or {}).get('apply_url') or S.get('dts_application_url'), 'https://www.tfaforms.com/4827904')
NX_APPLY = 'apply/'      # YWAM 7: the application is embedded at /course/apply/, the inquiry at /course/inquire/
LIVE = 'https://www.ywamsanfrancisco.org'
# Shifts with their own sign-up form (keyed by shift title, lower case). Used on the Volunteer page, the Ellis Room schedule and in the chat.
SIGNUP_LINKS = {'tenderloin connect': 'https://tl-connect-volunteer-stewardship.replit.app/'}
FONTS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700;800&display=swap'
NAV = [('volunteer/', 'Come Volunteer', 'volunteer'), ('teams/', 'Bring a Team', 'teams'), ('course/', 'DTS (5 Month Course)', 'course'), ('ellis-room/', 'The Ellis Room', 'neighbors')]

TOP = [('about/', 'About', 'about'), ('give/', 'Give', 'give'), ('pay/', 'Pay Fees', 'pay'), ('contact/', 'Connect with us', 'contact')]
ABOUT_MENU = [('about/', 'Who We Are'), ('about/#history', 'Our History'), ('about/people/#staff', 'Staff'), ('about/people/#board', 'Board'), ('join-staff/', 'Join Staff'), ('about/news/', 'News & Events'), ('about/resources/', 'Resources'), ('contact/', 'Contact')]
def header(cur, up):
    links = ''.join('<a href="%s%s"%s>%s</a>' % (up, h, ' aria-current="page"' if k == cur else '', t) for h, t, k in NAV)
    def tl(h, t, k):
        a = '<a href="%s"%s%s>%s</a>' % (h if h.startswith('http') else up + h, ' target="_blank" rel="noopener"' if h.startswith('http') else '', ' aria-current="page"' if k == cur else '', t)
        if k != 'about': return a
        menu = ''.join('<a href="%s%s" role="menuitem">%s</a>' % (up, mh, mt) for mh, mt in ABOUT_MENU)
        return '<span class="tdd"><a href="%sabout/" class="tdd-btn" aria-haspopup="true" aria-expanded="false"%s>About<i aria-hidden="true"></i></a><span class="tdd-menu" role="menu" aria-label="About">%s</span></span>' % (up, ' aria-current="page"' if k == cur else '', menu)
    top = ''.join(tl(h, t, k) for h, t, k in TOP)
    return f'''<header class="y5-head"><div class="y5-top"><div class="wrap"><a class="tlogo" href="{up or './'}" aria-label="YWAM San Francisco home"></a><span class="tlinks">{top}</span></div></div>
<nav class="y5-nav" aria-label="Main"><div class="wrap"><span class="links">{links}<a class="sign" href="{up}course/inquire/">Sign Me Up!</a></span><button class="y5-burger" aria-expanded="false" aria-label="Open menu">Menu</button></div></nav></header>'''

CONCEPT = 'Design concept YWAM 7 (a simpler YWAM 6) for the YWAM San Francisco refresh — not the live site' if V == 7 else 'Design concept YWAM 5 for the YWAM San Francisco refresh — not the live site' if V == 5 else 'Design concept YWAM 6 (YWAM 5 with a backlit sign) for the YWAM San Francisco refresh — not the live site'
def footer(up, root):
    wave = '<svg viewBox="0 0 1600 90" preserveAspectRatio="none"><path d="M0,40 C100,10 200,10 300,40 C400,70 500,70 600,40 C700,10 800,10 900,40 C1000,70 1100,70 1200,40 C1300,10 1400,10 1500,40 C1550,55 1580,62 1600,62 L1600,90 L0,90Z" fill="#5aa8cf"/></svg>'
    wave2 = wave.replace('#5aa8cf', '#8cc6e2')
    sw = '<nav class="switcher" aria-label="Design concepts"><span>Concepts</span>' + ''.join('<a href="%sywam%d/"><i>YWAM </i>%d</a>' % (root, i, i) for i in range(1, 5)) + ''.join('<a%s href="%sywam%d/"><i>YWAM </i>%d</a>' % (' class="on"' if i == V else '', root, i, i) for i in (5, 6, 7)) + '</nav>'
    return f'''<div class="y5-foot"><div class="inner"><div class="wrap row">
<div class="links"><a href="{LIVE}/policy-page">Privacy Policy</a><span>|</span><a href="https://ywamsfbayarea.org/">YWAM San Francisco Bay Area</a><span>|</span><a href="https://ywam.org/">YWAM International</a></div>
<div class="tag">Presence that restores.</div>
<div class="addr">{ADDR}, {CITY}<br><a href="{TEL}">{PHONE}</a> · <a class="em" href="mailto:{EMAIL}">{EMAIL}</a></div>
<div class="concept">{CONCEPT}</div></div></div></div>
{sw}'''

BASE = os.environ.get('SITE_BASE') or 'https://ywamembers.org/ywam%d/' % V
def meta_for(title):
    m = META.get(title)
    if not m: return title, '', '', 'assets/img/hero-ellis.jpg'
    return m
def page(title, cur, up, root, body, extra_head='', scripts=''):
    title, desc, path, shot = meta_for(title)
    url = BASE + path
    seo = ('<meta name="description" content="%s"><link rel="canonical" href="%s">'
           '<meta property="og:type" content="website"><meta property="og:site_name" content="YWAM San Francisco"><meta property="og:title" content="%s"><meta property="og:description" content="%s"><meta property="og:url" content="%s"><meta property="og:image" content="%s"><meta name="twitter:card" content="summary_large_image">') % (t(desc), url, t(title), t(desc), url, BASE + shot) if desc else ''
    title = t(title)
    css = f'{up}assets/site5.css?v={VER}'
    return wire(f'''<!doctype html>
<html lang="en"{' class="tb"' if V in (6, 7) else ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://www.tfaforms.com https://resources.connect.clickandpledge.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://images.squarespace-cdn.com; frame-src https://www.tfaforms.com https://connect.clickandpledge.com https://www.youtube-nocookie.com https://www.youtube.com https://maps.google.com https://www.google.com; connect-src 'self' https://api.open-meteo.com; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; upgrade-insecure-requests"><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="format-detection" content="telephone=no">
<title>{title}</title>{seo}<link rel="icon" type="image/png" href="{root}favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="{FONTS}" rel="stylesheet">
<link rel="stylesheet" href="{css}">{extra_head}</head><body>
{banner_html()}{header(cur, up)}
<main id="main">{body}</main>
{footer(up, root)}
<div class="chat7" data-kb="{up}assets/chat-kb.js?v={KBV}" data-root="{up}"><button type="button" class="chat7-btn" aria-expanded="false" aria-controls="chat7-p"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z"/></svg><span>Ask us anything</span></button><div class="chat7-p" id="chat7-p" role="dialog" aria-label="Ask YWAM San Francisco" hidden><div class="c7-head"><div><b>Ask YWAM SF</b><small>Instant answers from our website</small></div><button type="button" class="c7-x" aria-label="Close chat">✕</button></div><div class="c7-log" aria-live="polite"></div><form class="c7-form" autocomplete="off"><input type="text" name="q" maxlength="200" placeholder="Type a question…" aria-label="Your question"><button type="submit" aria-label="Send"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg></button></form><p class="c7-foot">Automated answers, not a person. A real person replies at <a href="mailto:{EMAIL}">{EMAIL}</a> or <a href="{TEL}">{PHONE}</a>.</p></div></div>
{scripts}<script src="{up}assets/site5.js?v={VER}"></script><script src="{up}assets/chat7.js?v={VER}" defer></script></body></html>''', up)

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

ALT_PH = {'blog_church': 'Hot chocolate, cookies and worship on the sidewalk on a Sunday morning', 'blog_food': 'Fresh groceries handed out at the food pantry', 'blog_cocoa': 'Hot chocolate outreach on a Tenderloin corner', 'night': 'The Ellis Room lit up on a rainy night', 'xmas': 'Neighbors around one long table at Christmas lunch', 'lunch': 'Neighbors sharing a community lunch'}
# ---------------------------------------------------------------- PAGE TITLES & DESCRIPTIONS (search + sharing)
_nx_date = (NX['_s'].strftime('%B ') + str(NX['_s'].day) + ', ' + str(NX['_s'].year)) if NX else ''
META = {
 'HOME': ('YWAM San Francisco | Christian Nonprofit in the Tenderloin', 'Youth With A Mission San Francisco is a Christian nonprofit serving the Tenderloin: food pantry, the Ellis Room, outreach, volunteering and discipleship training.', '', 'assets/img/hero-ellis.jpg'),
 'Come Volunteer — YWAM San Francisco': ('Volunteer in San Francisco | Food Pantry & Outreach | YWAM SF', 'Serve with YWAM San Francisco in the Tenderloin: the Thursday food pantry, the Ellis Room, hot chocolate outreach, Pop-Up Church and more. Pick a shift and sign up.', 'volunteer/', 'assets/img/vol-header.jpg'),
 'Bring a Team — YWAM San Francisco': ('San Francisco Mission Trips for Church & Youth Teams | YWAM SF', "Bring your church, youth group or school to serve in San Francisco's Tenderloin. Housing, meals, orientation and ministry included, from %s per person per day." % money(MA_RATE), 'teams/', 'assets/img/team-overlook.jpg'),
 'DTS (5 Month Course) — YWAM San Francisco': ('Discipleship Training School (DTS) in San Francisco | YWAM SF', "A 5-month Discipleship Training School in San Francisco's Tenderloin: 3 months of training, then 2 months of outreach. " + ('Next school starts %s.' % _nx_date if NX else 'New school dates coming soon.'), 'course/', 'assets/img/phase-training.jpg'),
 'The Ellis Room — YWAM San Francisco': ('The Ellis Room: Community Space in the Tenderloin | YWAM SF', 'A safe place in the Tenderloin for coffee, showers, haircuts, Bible study and friendship, plus a free food pantry every Thursday at 357 Ellis Street.', 'ellis-room/', 'assets/img/er-hero.jpg'),
 'Who We Are — YWAM San Francisco': ('About YWAM San Francisco | Youth With A Mission Since 1987', 'Rooted in the way of Jesus, YWAM San Francisco restores lives, forms whole persons and equips believers in the Tenderloin. Our mission, values and history.', 'about/', 'assets/img/hero-ellis.jpg'),
 'Staff & Board — YWAM San Francisco': ('Staff & Board | YWAM San Francisco', "Meet the directors, staff and board who lead YWAM San Francisco's ministry in the Tenderloin, from neighborhood engagement to training and outreach.", 'about/people/', 'assets/img/team-overlook.jpg'),
 'News & Events — YWAM San Francisco': ('News & Events | YWAM San Francisco', 'Updates from YWAM San Francisco, stories from the Tenderloin, and community gatherings everyone is welcome to join at 357 Ellis Street.', 'about/news/', 'assets/img/er-room.jpg'),
 'Resources — YWAM San Francisco': ('Urban Mission Resources & Videos | YWAM San Francisco', "Articles, video teaching and guides on urban mission and San Francisco, including Tim Svoboda's series on the strategic nature of cities and our YouTube channel.", 'about/resources/', 'assets/img/hero-ellis.jpg'),
 'Give — YWAM San Francisco': ('Give to YWAM San Francisco | Support the Tenderloin', "Support food, showers and outreach in San Francisco's Tenderloin. Give online, by check, bank transfer, stock or in-kind gifts. Tax-deductible for U.S. donors.", 'give/', 'assets/img/er-room.jpg'),
 'Pay — YWAM San Francisco': ('Pay DTS & Mission Adventures Fees | YWAM San Francisco', 'Pay school or team trip fees for a DTS student or Mission Adventures participant. For general donations to YWAM San Francisco, please use our Give page.', 'pay/', 'assets/img/phase-training.jpg'),
 'Apply for the DTS — YWAM San Francisco': ('Apply for the DTS | YWAM San Francisco', 'Apply for the YWAM San Francisco Discipleship Training School: five months of faith lived out in the Tenderloin and the nations.', 'course/apply/', ''),
 'DTS Inquiry — YWAM San Francisco': ('DTS Inquiry | YWAM San Francisco', 'Curious about a Discipleship Training School in San Francisco? Send a quick inquiry and our DTS team will be in touch.', 'course/inquire/', ''),
 'Join Staff — YWAM San Francisco': ('Join Staff | Serve Long-Term in San Francisco | YWAM SF', 'Join the YWAM San Francisco staff: make the Tenderloin your home, love your neighbors and help train disciples at 357 Ellis Street.', 'join-staff/', ''),
 'Contact Us — YWAM San Francisco': ('Contact YWAM San Francisco | 357 Ellis St, Tenderloin', 'Visit, call or email YWAM San Francisco at 357 Ellis Street in the Tenderloin. Reach the right team for volunteering, mission trips, DTS or giving.', 'contact/', 'assets/img/er-door.jpg'),
}

# ---------------------------------------------------------------- HOME
IG = load('instagram.json').get('posts', [])
ig_js = 'window.YWAM_IG_POSTS=' + js([{'img': img(x.get('photo'), '', 750), 'caption': str(x.get('caption') or ''), 'href': lnk(x.get('url'), 'https://www.instagram.com/ywamsf/', raw=True)} for x in IG if img(x.get('photo'), '', 750)]) + ';'

SIGN = ('''<div class="spill" style="left:60px;top:150px;width:900px;height:640px"></div>
    <img class="tube wave" src="assets/img/neon-wave.png" alt="" aria-hidden="true" style="left:185px;top:305px">
    <img class="tube text" src="assets/img/neon-text.png" alt="" aria-hidden="true" style="left:185px;top:305px">''' if V == 5 else
 '''<div class="spill white" style="left:20px;top:110px;width:980px;height:700px"></div>
    <img class="lit" src="assets/img/sign-lit.png" alt="" aria-hidden="true" style="left:177px;top:285px;width:661px;height:367px">''')
if NX:
    _f = NX['_s'].strftime('%B ') + ordn(NX['_s'].day)
    CABLECAR = '<div data-cablecar data-board="YWAM San Francisco" data-plates="%s|%s" data-band="Next DTS · %s" data-flag="Our next 5-month adventure begins %s!" data-flag-cta="Check it out →" data-href="course/" aria-label="Our next 5-month adventure begins %s. Check out the DTS, our 5 Month Course."></div>' % (md(NX['_s']).upper(), md(NX['_e']).upper(), drange(NX['_s'], NX['_e']), _f, _f)
else:
    CABLECAR = '<div data-cablecar data-board="YWAM San Francisco" data-plates="NEXT DTS|SOON" data-band="Next DTS · dates coming soon" data-flag="New DTS dates are coming soon!" data-flag-cta="Find out more →" data-href="course/" aria-label="New DTS dates are coming soon. Find out more about the DTS, our 5 Month Course."></div>'
MIN = load('ministries.json').get('ministries', [])
REEL = ''.join('<a class="hit" href="ellis-room/"><img src="%s" alt="%s" loading="lazy"><span class="hit-t"><small>%s</small><b>%s</b><span>%s</span></span></a>' % (img(m.get('photo'), '', 1500), t(m.get('title')), t(m.get('when')), t(m.get('title')), t(m.get('description'))) for m in MIN if t(m.get('title')))
SPOTS_TXT = ('%d spots' % int(num(NX.get('spots')))) if NX and num(NX.get('spots')) > 0 else ''
NEXT7 = ('<p class="next7">Next DTS begins ' + mdy(NX['_s']) + ('. ' + SPOTS_TXT + '.' if SPOTS_TXT else '.') + '</p>') if NX else '<p class="next7">New DTS dates are coming soon.</p>'
home = f'''
<section class="hero7"><div class="hero7-grid">
<div class="hero7-media">
<div class="neon-hero" role="img" aria-label="Ellis Street in the Tenderloin, with the YWAM San Francisco sign, in today’s real light and weather">
  <div class="frame" style="width:2500px;height:1424px">
    <img class="photo" src="assets/img/hero-ellis.jpg" alt="Ellis Street in the Tenderloin, with the YWAM San Francisco sign on the left" style="width:2500px;height:1424px">
    <div class="sky-c" aria-hidden="true"></div>
    <div class="sky-w" aria-hidden="true"></div>
    <div class="stars" aria-hidden="true"></div>
    <div class="sun-l" aria-hidden="true"><i class="sun"></i></div>
    <div class="tint" style="left:0;top:0;width:2500px;height:1424px"></div>
    <div class="sunwash" aria-hidden="true"></div>
    <div class="wet" aria-hidden="true"></div>
    <div class="night" aria-hidden="true">
      <i class="win" style="left:1873px;top:462px;width:81px;height:72px;--d:3.0s"></i><i class="win" style="left:1885px;top:741px;width:77px;height:76px;--d:4.1s"></i><i class="win dim" style="left:1889px;top:872px;width:76px;height:79px;--d:5.2s"></i>
      <i class="win" style="left:2154px;top:576px;width:23px;height:154px;--d:3.6s"></i><i class="win dim" style="left:2108px;top:622px;width:15px;height:108px;--d:4.6s"></i><i class="win" style="left:1802px;top:480px;width:12px;height:67px;--d:3.3s"></i>
      <i class="win" style="left:813px;top:167px;width:16px;height:58px;--d:3.9s"></i><i class="win dim" style="left:817px;top:342px;width:16px;height:58px;--d:4.8s"></i>
      <i class="lamp" style="left:1176px;top:822px;--d:2.6s"></i><i class="lamp sm" style="left:1171px;top:1038px;--d:3.0s"></i><i class="lamp globe" style="left:921px;top:916px;--d:2.8s"></i>
      <img class="sign" src="assets/img/n-hotel-l.png" alt="" style="left:900px;top:522px;--g:rgba(255,70,60,.85);--d:3.4s">
      <img class="sign" src="assets/img/n-hotel-r.png" alt="" style="left:1958px;top:778px;--g:rgba(255,70,60,.85);--d:4.4s">
      <img class="sign" src="assets/img/n-coronado.png" alt="" style="left:611px;top:711px;--g:rgba(150,200,255,.7);--d:3.8s">
      <img class="sign" src="assets/img/n-mentone.png" alt="" style="left:805px;top:1071px;--g:rgba(255,120,90,.75);--d:4.9s">
      <img class="sign far" src="assets/img/n-far-blade.png" alt="" style="left:1097px;top:1017px;--g:rgba(255,80,70,.8);--d:4.2s">
      <img class="sign far" src="assets/img/n-far-maroon.png" alt="" style="left:1052px;top:1072px;--g:rgba(255,90,90,.6);--d:4.7s">
      <img class="sign far" src="assets/img/n-far-cyan.png" alt="" style="left:1078px;top:1106px;--g:rgba(90,220,255,.6);--d:3.9s">
      <img class="sign far" src="assets/img/n-far-blue.png" alt="" style="left:1103px;top:1108px;--g:rgba(150,200,255,.55);--d:5.1s">
      <img class="sign far" src="assets/img/n-far-ok.png" alt="" style="left:975px;top:1086px;--g:rgba(255,240,170,.55);--d:4.4s">
      <img class="sign far" src="assets/img/n-far-red.png" alt="" style="left:980px;top:1183px;--g:rgba(255,120,110,.5);--d:5.3s">
      <img class="sign far" src="assets/img/n-far-banner.png" alt="" style="left:1624px;top:958px;--g:rgba(120,170,255,.25);--d:4.0s">
      <img class="sign far" src="assets/img/n-pepsi.png" alt="" style="left:1930px;top:1050px;--g:rgba(140,200,255,.55);--d:3.7s">
      <img class="sign far" src="assets/img/n-liquor.png" alt="" style="left:1928px;top:1101px;--g:rgba(255,236,190,.5);--d:4.5s">
      <i class="lamp xs" style="left:1100px;top:963px;--d:2.7s"></i><i class="lamp xs" style="left:1081px;top:904px;--d:3.1s"></i><i class="lamp xs" style="left:1603px;top:997px;--d:2.9s"></i>
      <i class="sig" style="left:1722px;top:1185px;--c:rgba(70,255,180,.95);--d:2.8s"></i><i class="sig" style="left:1376px;top:1242px;--c:rgba(255,90,60,.95);--d:3.0s"></i>
    </div>
    <img class="face" src="assets/img/sign-dim.png" alt="" aria-hidden="true" style="left:177px;top:285px;width:661px;height:367px">
{SIGN}
    <div class="fog" aria-hidden="true"><i></i><i></i><i></i></div>
  </div>
  <div class="rainhaze" aria-hidden="true"></div>
  <canvas class="rain" aria-hidden="true"></canvas>
  <div class="dayctl" role="group" aria-label="Time of day on Ellis Street"><button type="button" class="dc-play" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="pl" d="M8 5.5v13l10.5-6.5z"/><path class="sk" d="M6.5 6v12M11 6l7 6-7 6z"/></svg><span class="lbl">Watch the last 24 hours</span></button><div class="dc-panel" id="dcpanel"><small><span>Midnight</span><span>Noon</span><span>Midnight</span></small><input type="range" min="0" max="1439" step="5" aria-label="Drag through the day on Ellis Street"><div class="dc-btns"><button type="button" class="dc-replay">Replay the day</button><button type="button" class="dc-live">Back to now</button></div></div><button type="button" class="dc-pill" aria-expanded="false" aria-controls="dcpanel"><span class="dc-dot" aria-hidden="true"></span><span class="dc-time">Ellis St</span><span class="dc-sep" aria-hidden="true"></span><span class="dc-ic" aria-hidden="true"></span><span class="dc-tmp"></span><span class="dc-wx"></span></button></div>
</div>
  <div class="films7" aria-label="Watch">
    <button type="button" class="film7" data-film="esouyuxQv8M" aria-label="Play See what we do, a 2-minute film about YWAM San Francisco"><span class="th" style="background-image:url('{ph('still', 750)}')"><i class="pl" aria-hidden="true"></i></span><span class="tx"><small>2-min film</small><b>See what we do</b></span></button>
    <button type="button" class="film7" data-film="lH3BLHA6dhI" aria-label="Play the DTS film: Live this with us"><span class="th" style="background-image:url('{C}1767778466252-U9HEDNEUX7JRPHIDTQR6/image-asset.jpeg?format=750w')"><i class="pl" aria-hidden="true"></i></span><span class="tx"><small>The DTS film</small><b>Live this with us</b></span></button>
  </div>
</div>
<div class="hero7-copy">
  <span class="kick">We believe</span>
  <h1 class="believe7"><span>People can change.</span> <span>Neighborhoods can heal.</span> <span>Love can make a difference.</span></h1>
  <p>The love of Jesus is meant to be lived. In the Tenderloin, we learn His way by living it: loving our neighbors, meeting practical needs, and building relationships that bring lasting change.</p>
  <div class="cta7">
    <a class="btn" href="course/">Join our DTS</a>
    <a class="btn ghost" href="give/">Give</a>
    <a class="btn ghost" href="volunteer/">Volunteer</a>
  </div>
  {NEXT7}
</div>
</div></section>

<section class="engage pad"><div class="wrap">
  <span class="kick rv">Neighborhood engagement</span>
  <h2 class="rv">A place of peace, right in the middle of it.</h2>
  <p class="engage-sub rv">Not an escape from the chaos, but a steady, welcoming presence inside it.</p>
  <div class="reel" aria-label="Ministry highlights"><div class="reel-track">{REEL}</div></div>
  <div class="reel-nav"><button class="reel-prev" aria-label="Previous">←</button><div class="reel-dots"></div><button class="reel-next" aria-label="Next">→</button></div>
</div></section>

<section class="ig5"><div class="wrap head rv"><span class="kick">@ywamsf on Instagram</span><h2>Life on Ellis Street, <em>this week.</em></h2><a class="handle" href="https://www.instagram.com/ywamsf/" target="_blank" rel="noopener">Follow @ywamsf →</a></div>
  <div class="ig-stage" data-ig tabindex="0" aria-label="Recent posts from YWAM San Francisco. Use the left and right arrow keys to browse."></div>
</section>

<section class="verse pad"><div class="fogs" aria-hidden="true"><i></i><i></i><i></i></div><div class="wrap">
  <blockquote data-verse>Follow God’s example, therefore, as dearly loved children and walk in the way of <em>love,</em> just as Christ loved us and gave himself up for us as a fragrant offering and sacrifice to God.</blockquote>
  <cite>Ephesians 5:1–2 · NIV</cite>
</div></section>

<div class="lightbox" role="dialog" aria-modal="true" aria-label="YWAM San Francisco film"><div class="box"><iframe title="YWAM San Francisco film" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><button class="x" aria-label="Close film">✕</button></div>
'''
home_scripts = f'<script>{ig_js}</script><script src="assets/igcarousel.js?v={VER}"></script><script src="assets/dayhero.js?v={VER}"></script>'
os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, 'index.html'), 'w').write(page('HOME', 'home', '', '../', home, scripts=home_scripts))

# ---------------------------------------------------------------- VOLUNTEER
SHIFTS = [x for x in load('shifts.json').get('shifts', []) if t(x.get('title'))]
DAYS = ('SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT')
def sdays(x): return ' '.join(d for d in (str(v).upper()[:3] for v in x.get('days') or []) if d in DAYS)
board_rows = ''.join(f'''<tr data-days="{sdays(x)}" data-href="#shift" data-shift="{i}"><td><span class="flap">{t(str(x.get('when') or '').upper()[:22])}</span></td><td><span class="flap">{t(str(x.get('title')).upper())}</span></td><td>{t(x.get('time'))}</td><td><span class="status">{'Weekly' if sdays(x) else 'Ongoing'}</span></td></tr>''' for i, x in enumerate(SHIFTS))
import json
def rgb(hx):
    m = re.fullmatch(r'#?([0-9a-fA-F]{6})', str(hx or '').strip())
    return ','.join(str(int(m.group(1)[i:i + 2], 16)) for i in (0, 2, 4)) if m else '70,83,97'
vol_posts = [{'img': img(x.get('photo'), '../', 750), 'title': str(x['title']).strip(), 'when': str(x.get('when') or ''), 'time': str(x.get('time') or ''), 'href': '#shift', 'desc': str(x.get('description') or ''), 'meta': [str(m) for m in x.get('tags') or [] if str(m).strip()], 'subject': str(x['title']).strip() + ' volunteer', 'days': sdays(x), 'rule': 'nth24' if x.get('every') == '2nd & 4th' else '', 'tint': rgb(x.get('colour')), 'email': VEMAIL, 'signup': SIGNUP_LINKS.get(str(x['title']).strip().lower(), '')} for x in SHIFTS]
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
<section class="page-hero"><div class="ph-img still"><img src="../assets/img/team-overlook.jpg" alt="A team smiling together on a hilltop overlooking San Francisco and the downtown skyline" style="object-position:50% 58%"></div><div class="copy"><div class="wrap"><span class="kick">Bring a team</span><h1>Step into mission. <em>Step into transformation.</em></h1><p class="lede">Short-term outreach in the heart of San Francisco: Mission Adventures for church and youth groups, and a city base for YWAM teams from other locations.</p></div></div></section>
<section class="pad tracks5"><div class="wrap">
  <div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Two ways to come</span><h2>Who’s coming?</h2></div>
  <div class="tracks2">
    <a class="track rv" href="#ma"><small>Church, youth &amp; school groups</small><h3>Mission Adventures</h3><p>A weekend, a week or longer serving in the Tenderloin. We plan the ministry, meals and housing so your team can focus on loving God and loving people.</p><span class="go">Plan a Mission Adventure ↓</span></a>
    <a class="track rv" href="#ywam-teams"><small>YWAM schools &amp; teams</small><h3>YWAM teams from other locations</h3><p>Bring your DTS or school to the city for a final lecture week, a local outreach, or a launch point before you head overseas.</p><span class="go">Plan a YWAM team visit ↓</span></a>
  </div>
</div></section>
<section class="pad" id="ma" style="padding-top:0"><div class="wrap">
  <div class="rv" style="max-width:720px;margin-bottom:34px"><span class="kick">Mission Adventures · We take care of the details</span><h2>Your team focuses on <em>loving God and loving people.</em></h2></div>
  <div class="cards3"><div class="card5 rv icard"><div class="ic"><span class="icw"><svg class="ghost" viewBox="0 0 64 64" aria-hidden="true"><circle pathLength="1" cx="32" cy="32" r="22" class="l"/><circle pathLength="1" cx="32" cy="32" r="15" class="l t"/><path pathLength="1" d="M32 5v7M32 52v7M5 32h7M52 32h7" class="l"/><path pathLength="1" d="M39 25l-10 4-4 10 10-4z" class="a"/><circle pathLength="1" cx="32" cy="32" r="1.8" class="dot"/></svg><svg class="live" viewBox="0 0 64 64" aria-hidden="true"><circle pathLength="1" cx="32" cy="32" r="22" class="l"/><circle pathLength="1" cx="32" cy="32" r="15" class="l t"/><path pathLength="1" d="M32 5v7M32 52v7M5 32h7M52 32h7" class="l"/><path pathLength="1" d="M39 25l-10 4-4 10 10-4z" class="a"/><circle pathLength="1" cx="32" cy="32" r="1.8" class="dot"/></svg></span></div><h3>Orientation</h3><p>We prepare your team for the Tenderloin before you ever step onto the street.</p></div><div class="card5 rv icard"><div class="ic"><span class="icw"><svg class="ghost" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M12 34h40c0 10-8 18-20 18S12 44 12 34z" class="l"/><path pathLength="1" d="M8 34h48M24 57h16" class="l"/><path pathLength="1" d="M24 27c-3-4 3-6 0-10M32 27c-3-4 3-6 0-10M40 27c-3-4 3-6 0-10" class="a s"/></svg><svg class="live" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M12 34h40c0 10-8 18-20 18S12 44 12 34z" class="l"/><path pathLength="1" d="M8 34h48M24 57h16" class="l"/><path pathLength="1" d="M24 27c-3-4 3-6 0-10M32 27c-3-4 3-6 0-10M40 27c-3-4 3-6 0-10" class="a s"/></svg></span></div><h3>Food planning</h3><p>Meals planned and shared at our base, with YWAM staff around the table.</p></div><div class="card5 rv icard"><div class="ic"><span class="icw"><svg class="ghost" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M9 30L32 11l23 19" class="l"/><path pathLength="1" d="M16 26v28h32V26" class="l"/><path pathLength="1" d="M27 54V41h10v13" class="l"/><rect pathLength="1" x="20.5" y="30" width="8" height="7" rx="1" class="win"/><rect pathLength="1" x="35.5" y="30" width="8" height="7" rx="1" class="win"/><path pathLength="1" d="M42 18v-7h5v11" class="l t"/></svg><svg class="live" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M9 30L32 11l23 19" class="l"/><path pathLength="1" d="M16 26v28h32V26" class="l"/><path pathLength="1" d="M27 54V41h10v13" class="l"/><rect pathLength="1" x="20.5" y="30" width="8" height="7" rx="1" class="win"/><rect pathLength="1" x="35.5" y="30" width="8" height="7" rx="1" class="win"/><path pathLength="1" d="M42 18v-7h5v11" class="l t"/></svg></span></div><h3>Housing</h3><p>Stay at the YWAM San Francisco base, right in the heart of the city.</p></div><div class="card5 rv icard"><div class="ic"><span class="icw"><svg class="ghost" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M5 45l10-10c3-3 7-3 10 0l4 4h11c3 0 3 5 0 5H28" class="l"/><path pathLength="1" d="M5 55l6-6h19l14-10c3-2 6 2 3 5L32 57H16" class="l"/><path pathLength="1" d="M42 29c-4-3-10-6-10-12 0-3 2-5 5-5 2 0 4 1 5 3 1-2 3-3 5-3 3 0 5 2 5 5 0 6-6 9-10 12z" class="a"/></svg><svg class="live" viewBox="0 0 64 64" aria-hidden="true"><path pathLength="1" d="M5 45l10-10c3-3 7-3 10 0l4 4h11c3 0 3 5 0 5H28" class="l"/><path pathLength="1" d="M5 55l6-6h19l14-10c3-2 6 2 3 5L32 57H16" class="l"/><path pathLength="1" d="M42 29c-4-3-10-6-10-12 0-3 2-5 5-5 2 0 4 1 5 3 1-2 3-3 5-3 3 0 5 2 5 5 0 6-6 9-10 12z" class="a"/></svg></span></div><h3>Ministry</h3><p>Real opportunities to serve alongside local ministries every day.</p></div></div>
</div></section>
<section class="pad" style="background:var(--mist)"><div class="wrap" style="display:grid;gap:clamp(28px,4vw,56px)">
  <div class="split"><div class="photo-stack rv"><img src="../assets/img/team-street.jpg" alt="A youth team gathered on the sidewalk on Ellis Street" loading="lazy" style="object-position:50% 55%"><img src="../assets/img/team-juggle.jpg" alt="A Mission Adventures volunteer juggling apples for a neighbor at the food pantry" loading="lazy" style="object-position:47% 45%"></div><div class="rv"><span class="kick">Outreach</span><h2>Serve in <em>the Tenderloin.</em></h2><p class="lede">Feed the hungry, pray for and encourage neighbors on the street and in the Ellis Room. Share testimonies and the Gospel. Care for families, immigrants and unhoused neighbors.</p></div></div>
  <div class="split flip"><div class="photo-stack single rv"><img src="../assets/img/team-cross.jpg" alt="A group gathered beneath the cross on Mount Davidson" loading="lazy" style="object-position:50% 70%"></div><div class="rv"><span class="kick">Community living</span><h2>Eat, worship and <em>live together.</em></h2><p class="lede">Your team stays at our base, shares meals and space with YWAM staff, and gathers for devotion and worship each day.</p></div></div>
</div></section>
<section class="pad"><div class="wrap">
  <div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Plan your trip</span><h2>A weekend, a week, <em>or longer.</em></h2><p class="lede">{money(MA_RATE)} per participant per day, including food, accommodation and ministry supplies. Slide to estimate your team’s trip.</p></div>
  <div class="calc rv" data-rate="{MA_RATE}"><div><div class="ctl"><label for="calcPeople">Team size <output id="outPeople">12</output></label><input id="calcPeople" type="range" min="1" max="40" value="12"></div><div class="ctl"><label for="calcDays">Days <output id="outDays">5</output></label><input id="calcDays" type="range" min="1" max="21" value="5"></div><p style="font-size:14px;color:var(--muted);margin:0">Estimate only. We’ll confirm details when you book.</p></div>
  <div class="total"><span class="kick" style="color:rgba(255,255,255,.7)">Estimated trip cost</span><b id="calcTotal">{money(MA_RATE * 60)}</b><small id="calcPer"></small><a class="btn light" style="margin-top:20px" href="{TEAM_FORM}" target="_blank" rel="noopener">Book today</a></div></div>
</div></section>
<section class="pad ywamteams" id="ywam-teams"><div class="wrap fit-grid">
  <div class="rv"><span class="kick">For YWAM schools &amp; teams</span><h2>Finish strong in the city, <em>or launch from it.</em></h2></div>
  <div class="rv"><p class="lede">YWAM San Francisco hosts schools and outreach teams from other YWAM locations. Spend time in a real urban neighborhood, alongside staff who have served these blocks for years.</p>
  <ul class="ticks"><li><b>A final lecture week.</b> Close your lecture phase with a week of teaching and ministry in the Tenderloin.</li><li><b>A city outreach.</b> Serve in the Ellis Room, the food pantry and on the street.</li><li><b>A launch point overseas.</b> Transition through San Francisco on your way to international outreach.</li></ul>
  <div class="links-row"><a class="btn" href="mailto:{OEMAIL}?subject=YWAM%20team%20visit">Plan a YWAM team visit</a></div></div>
</div></section>
<section class="pad" style="background:var(--mist)"><div class="wrap">
  <div class="rv" style="margin-bottom:30px"><span class="kick">Why Mission Adventures?</span><h2>More than a trip.</h2></div>
  <div class="cards3"><div class="card5 rv draw"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M14 30h52v34H14z"/><path pathLength="1" d="M30 30v-7a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v7"/><path pathLength="1" d="M14 44h52"/><path pathLength="1" d="M34 40v8M46 40v8"/><path pathLength="1" class="r" d="M58 18l14 6-6 14-14-6z"/><path pathLength="1" class="r" d="M61 25l5 2"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M14 30h52v34H14z"/><path pathLength="1" d="M30 30v-7a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v7"/><path pathLength="1" d="M14 44h52"/><path pathLength="1" d="M34 40v8M46 40v8"/><path pathLength="1" class="r" d="M58 18l14 6-6 14-14-6z"/><path pathLength="1" class="r" d="M61 25l5 2"/></svg></span><h3>All-inclusive</h3><p>We take care of the details so leaders can focus on their students and the ministry at hand.</p></div><div class="card5 rv draw"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 56c10-4 20-4 30 2 10-6 20-6 30-2V22c-10-4-20-4-30 2-10-6-20-6-30-2z"/><path pathLength="1" d="M40 24v34"/><path pathLength="1" class="r" d="M40 22c0-8 0-12-2-16"/><path pathLength="1" class="r" d="M39 12c-6-2-10 0-12 4 5 2 9 0 12-4zM40 9c4-4 9-4 12-1-3 4-8 4-12 1z"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 56c10-4 20-4 30 2 10-6 20-6 30-2V22c-10-4-20-4-30 2-10-6-20-6-30-2z"/><path pathLength="1" d="M40 24v34"/><path pathLength="1" class="r" d="M40 22c0-8 0-12-2-16"/><path pathLength="1" class="r" d="M39 12c-6-2-10 0-12 4 5 2 9 0 12-4zM40 9c4-4 9-4 12-1-3 4-8 4-12 1z"/></svg></span><h3>Discipleship focused</h3><p>Every part of the trip helps participants grow in their relationship with Jesus.</p></div><div class="card5 rv draw"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M6 62h68"/><path pathLength="1" d="M10 62V40h10v22M20 62V30h12v32M32 62V44h8v18M48 62V34h10v28M58 62V46h12v16"/><path pathLength="1" d="M24 36h4M24 42h4M24 48h4M52 40h3M52 46h3"/><path pathLength="1" class="r" d="M40 44V14M33 22h14"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M6 62h68"/><path pathLength="1" d="M10 62V40h10v22M20 62V30h12v32M32 62V44h8v18M48 62V34h10v28M58 62V46h12v16"/><path pathLength="1" d="M24 36h4M24 42h4M24 48h4M52 40h3M52 46h3"/><path pathLength="1" class="r" d="M40 44V14M33 22h14"/></svg></span><h3>Urban mission field</h3><p>The Tenderloin is a unique place to learn how the Gospel changes lives in real time.</p></div><div class="card5 rv draw"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 18h60v46H10z"/><path pathLength="1" d="M10 30h60"/><path pathLength="1" d="M24 12v10M56 12v10"/><path pathLength="1" d="M20 40h4M32 40h4M44 40h4M56 40h4M20 52h4M32 52h4"/><path pathLength="1" class="r" d="M30 50h22"/><path pathLength="1" class="r" d="M30 46v8M52 46v8"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 18h60v46H10z"/><path pathLength="1" d="M10 30h60"/><path pathLength="1" d="M24 12v10M56 12v10"/><path pathLength="1" d="M20 40h4M32 40h4M44 40h4M56 40h4M20 52h4M32 52h4"/><path pathLength="1" class="r" d="M30 50h22"/><path pathLength="1" class="r" d="M30 46v8M52 46v8"/></svg></span><h3>Flexible times</h3><p>Come for a weekend, a week, or longer.</p></div></div>
</div></section>
<section class="pad"><div class="wrap"><div class="rv" style="margin-bottom:30px"><span class="kick">Stories from the street</span><h2>What your team <em>will step into.</em></h2></div>
  <div class="stories"><a class="story rv" href="{LIVE}/blog/2026/1/19/church-that-shows-up" target="_blank" rel="noopener"><div class="ph"><img src="{ph('blog_church',900)}" alt="{ALT_PH['blog_church']}" loading="lazy"></div><h3>Church that shows up</h3><p>Hot chocolate, cookies and worship on the sidewalk every Sunday.</p></a>
  <a class="story rv" href="{LIVE}/blog/2026/1/19/feeding-our-city-with-hope" target="_blank" rel="noopener"><div class="ph"><img src="{ph('blog_food',900)}" alt="{ALT_PH['blog_food']}" loading="lazy"></div><h3>Feeding our city with hope</h3><p>More than 300 people a week, met with fresh food and warm smiles.</p></a>
  <a class="story rv" href="{LIVE}/blog/2026/1/14/hot-chocolate-a-simple-ministry-making-a-real-impact-in-san-francisco" target="_blank" rel="noopener"><div class="ph"><img src="{ph('blog_cocoa',900)}" alt="{ALT_PH['blog_cocoa']}" loading="lazy"></div><h3>Hot chocolate</h3><p>A simple ministry making a real impact, one conversation at a time.</p></a></div>
</div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Gather your team. Pray. <em>Say yes.</em></h2><p>We’ll take care of the rest. Email <a style="color:#fff" href="mailto:{OEMAIL}">{OEMAIL}</a> or call {PHONE}.</p><div class="row"><a class="btn light" href="{TEAM_FORM}" target="_blank" rel="noopener">Book your trip</a><a class="btn ghost-light" href="mailto:{OEMAIL}">Ask a question</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'teams'), exist_ok=True)
open(os.path.join(OUT, 'teams/index.html'), 'w').write(page('Bring a Team — YWAM San Francisco', 'teams', '../', '../../', teams))

# ---------------------------------------------------------------- JOIN STAFF
staffp = f'''
<section class="page-hero"><div class="ph-img"><img src="../assets/img/vol-crew.jpg" alt="YWAM San Francisco staff and volunteers together at 357 Ellis Street" style="object-position:50% 40%"></div><div class="copy"><div class="wrap"><span class="kick">Join staff · 357 Ellis Street</span><h1>Make the Tenderloin <em>your home.</em></h1><p class="lede">Love God, love your neighbors and help form disciples, for the long haul. If you sense a call to the city, we’d love to talk.</p></div></div></section>
<section class="pad staff-wrap"><div class="wrap staff-layout">
<div class="staff-main">
<div class="sblock"><div class="rv"><span class="kick">Why staff here</span><h2>Come and build <em>this with us.</em></h2>
  <p class="lede">Joining staff isn’t just taking a role. It’s adopting a way of life: becoming a place of peace in the middle of the Tenderloin, a presence people know they can return to.</p>
  <p>The most important things on Ellis Street happen slowly: a neighbor who learns your name, a friendship that holds through a hard season, a student who finally gets what it means to live their faith. Staff are the people who stay, and who shape the community that everyone else encounters.</p>
  <p>You’ll be rooted in the way of Jesus alongside people who have given years to this neighborhood, and you’ll help form the students, volunteers and teams who carry that heart back out into the world.</p>
  <a class="btn ghost" href="../course/#monastery">More about the Monastery <span aria-hidden="true">→</span></a></div>
</div>
<div class="sblock panel"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Where you could serve</span><h2>Three teams, one mission.</h2></div>
  <div class="cards3 three">
    <div class="card5 rv"><h3>Neighborhood engagement</h3><p>The Ellis Room, the food pantry, showers and haircuts, hot chocolate and outreach on the street.</p></div>
    <div class="card5 rv"><h3>Training &amp; outreach</h3><p>Staffing the DTS, hosting Mission Adventures and YWAM teams, and leading teams into the city.</p></div>
    <div class="card5 rv"><h3>Operations</h3><p>Kitchen, hospitality, maintenance, office, communications and finance: the work that keeps the doors open.</p></div>
  </div></div>
<div class="sblock"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">How to start</span><h2>Three steps.</h2></div>
  <div class="ready3 steps3">
    <div class="rcard rv"><small>01</small><b>Complete a DTS</b><span>Like all YWAM staff, you’ll start with a Discipleship Training School, here or at any YWAM location.</span><em><a href="../course/">Our DTS →</a></em></div>
    <div class="rcard rv"><small>02</small><b>Start a conversation</b><span>Tell us about yourself and what’s drawing you to San Francisco. We’ll talk through roles, timing and fit.</span><em><a href="mailto:{EMAIL}?subject=Joining%20staff">Email us →</a></em></div>
    <div class="rcard rv"><small>03</small><b>Come and see</b><span>Spend time on Ellis Street before you commit. Like all YWAM staff, our team raises personal support, and we’ll help you build yours.</span><em><a href="../contact/">Plan a visit →</a></em></div>
  </div></div>
</div>
<aside class="glass-col" aria-label="The heart of the Monastery"><div class="glass-stick"><span class="kick">The Monastery</span>
<figure><img src="../assets/img/vow-god.jpg" alt="" loading="lazy"><figcaption>A place to encounter God</figcaption></figure>
    <figure><img src="../assets/img/vow-neighbor.jpg" alt="" loading="lazy"><figcaption>A place of peace in the Tenderloin</figcaption></figure>
    <figure><img src="../assets/img/vow-humility.jpg" alt="" loading="lazy"><figcaption>A way of life rooted in Jesus</figcaption></figure>
    <figure><img src="../assets/img/vow-multiply.jpg" alt="" loading="lazy"><figcaption>Formed here, sent out</figcaption></figure>
</div></aside>
</div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Sensing a call to the city?</h2><p>We’d love to hear your story. Email <a style="color:#fff" href="mailto:{EMAIL}">{EMAIL}</a> or call {PHONE}.</p><div class="row"><a class="btn light" href="mailto:{EMAIL}?subject=Joining%20staff">Talk with us about staff</a><a class="btn ghost-light" href="../about/people/">Meet the staff</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'join-staff'), exist_ok=True)
open(os.path.join(OUT, 'join-staff/index.html'), 'w').write(page('Join Staff — YWAM San Francisco', 'about', '../', '../../', staffp))

# ---------------------------------------------------------------- SERVING OUR NEIGHBORS
CAT = {'room': ('#465361', 'Ellis Room'), 'word': ('#9A1E14', 'Church & Bible study'), 'care': ('#6E9CBF', 'Showers, haircuts & care'), 'food': ('#C99634', 'Food'), 'out': ('#2E7D6B', 'Street & SRO outreach')}
if V in (6, 7): CAT = {'room': ('#08404F', CAT['room'][1]), 'word': ('#0B7E90', CAT['word'][1]), 'care': ('#24AFBE', CAT['care'][1]), 'food': ('#C99634', CAT['food'][1]), 'out': ('#86B6BE', CAT['out'][1])}
DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
WEEK = {d: [] for d in range(7)}
for e in load('ellis_week.json').get('entries', []):
    if str(e.get('day'))[:3].title() in DN and e.get('category') in CAT and t(e.get('title')):
        WEEK[DN.index(str(e['day'])[:3].title())].append((e['category'], str(e['title']).strip(), str(e.get('label') or '').strip(), mins(e.get('start')), mins(e.get('end')) or mins(e.get('start')) + 60) + (('nth24',) if e.get('every') == '2nd & 4th' else ()))
for d in WEEK: WEEK[d].sort(key=lambda e: e[3])
def ev_html(e):
    c, tt, h, st, en = e[:5]; rule = e[5] if len(e) > 5 else ''
    su = SIGNUP_LINKS.get(tt.strip().lower())
    if su: return '<a class="ev ev-link" href="%s" target="_blank" rel="noopener" style="--c:%s" data-s="%d" data-e="%d" data-t="%s"%s><b>%s <span aria-hidden="true">↗</span></b><small>%s · Sign up</small></a>' % (su, CAT[c][0], st, en, esc(tt), ' data-rule="%s"' % rule if rule else '', esc(tt), esc(h))
    return '<div class="ev" style="--c:%s" data-s="%d" data-e="%d" data-t="%s"%s><b>%s</b><small>%s</small></div>' % (CAT[c][0], st, en, esc(tt), ' data-rule="%s"' % rule if rule else '', esc(tt), esc(h))
week = ''.join('<div class="day" data-d="%d"><h4>%s</h4>%s</div>' % (d, DN[d], ''.join(ev_html(e) for e in WEEK[d]) or '<div class="ev" style="--c:var(--line)"><b>Rest &amp; prep</b><small>No public services</small></div>') for d in [1, 2, 3, 4, 5, 6, 0])
legend = ''.join('<span style="--c:%s">%s</span>' % v for v in CAT.values())
nb = f'''
<section class="page-hero"><div class="ph-img still"><img src="../assets/img/er-hero.jpg" alt="Tables and chairs on the sidewalk outside 357 Ellis Street, with a chalkboard sign: Welcome to the Ellis Room" style="object-position:50% 64%"></div><div class="copy"><div class="wrap"><span class="kick">357 Ellis Street</span><h1>The <em>Ellis Room</em></h1><p class="lede"><b>Where neighbors become friends.</b> Friendship over coffee, a full pantry, a hot shower, and someone to pray with. We walk alongside our neighbors and build bridges to the community resources and church family that help life flourish. Jesus came so that we may have life, and have it abundantly (John 10:10), and we see that life growing on these blocks every day.</p></div></div></section>
<section class="pad"><div class="wrap"><p class="lit" data-lit>Everyone has value. Everyone has a place. Everyone has <em>something</em> <em>to</em> <em>give,</em> and everyone has something to receive.</p>
<div class="stats5 rv" style="margin-top:20px"><div><b data-count="400">0</b><span>tons of food shared</span></div><div><b data-count="300" data-suffix="+">0</b><span>neighbors each week</span></div><div><b data-count="209">0</b><span>served at Christmas lunch</span></div><div><b data-count="6">0</b><span>days a week, doors open</span></div></div></div></section>
<section class="pad" style="background:var(--mist)"><div class="wrap"><div class="rv" style="margin-bottom:30px"><span class="kick">Tap a card</span><h2>Relationship. Dignity. <em>Respect.</em></h2><p class="lede" style="margin-top:12px">Friendship comes first. From there, we help neighbors connect with the resources and the church community around them.</p></div>
<div class="pillars"><div class="pillar rv"><div class="in"><div class="f"><img src="../assets/img/er-restore.jpg" alt="A neighbor in glasses hugging her dog, who is wearing pink glasses" loading="lazy" style="object-position:50% 25%"><span class="plab"><small>01</small><h3>Relationship</h3><em>Tap to read</em></span></div><div class="b"><p>Everything here starts with knowing each other’s names. We pull up a chair, pour the coffee, and keep showing up. Help means the most when it comes from a friend.</p></div></div></div>
<div class="pillar rv"><div class="in"><div class="f"><img src="../assets/img/er-empower.jpg" alt="A neighbor with a long white beard, smiling and flexing" loading="lazy" style="object-position:50% 30%"><span class="plab"><small>02</small><h3>Dignity</h3><em>Tap to read</em></span></div><div class="b"><p>Every person who walks through our door is made in the image of God. We meet people where they are and honor their stories.</p></div></div></div>
<div class="pillar rv"><div class="in"><div class="f"><img src="../assets/img/er-serve.jpg" alt="A smiling neighbor in a white jacket over a leopard-print hoodie" loading="lazy" style="object-position:50% 25%"><span class="plab"><small>03</small><h3>Mutual respect</h3><em>Tap to read</em></span></div><div class="b"><p>We’re not here to fix the Tenderloin. We’re here to be good neighbors in it. We learn from our neighbors as much as they learn from us, because everyone has something to give and something to receive. We believe that’s when change will come to our beloved neighborhood.</p></div></div></div></div></div></section>
<section class="pad"><div class="wrap"><div class="rv" style="margin-bottom:26px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap"><div><span class="kick">The week at 357 Ellis</span><h2>Come by. <em>The door is open.</em></h2></div><p style="max-width:420px;margin:0">The proclamation of the Gospel and the activity of the Gospel, side by side. Today, and anything happening right now, is highlighted in San Francisco time.</p></div>
<div class="nownext rv" aria-live="polite"></div><div class="week-wrap rv"><div class="week">{week}</div></div><div class="legend">{legend}</div></div></section>
<section class="pad stories5-home er-stories"><div class="wrap"><div class="rv" style="max-width:760px;margin-bottom:30px"><span class="kick">Stories from Ellis Street</span><h2>God is already at work here.</h2><p class="lede">Real people, real neighbors, and the lives being touched in the Tenderloin.</p></div>
  <div class="stories3"><article class="story5 rv"><div class="sph"><img src="../assets/img/er-pool.jpg" alt="" loading="lazy" style="object-position:50% 40%"><span class="ph-badge">Example photo</span></div><small>Example story · The Ellis Room</small><h3>“This is the first place I didn’t feel watched.”</h3><p>[Placeholder] A neighbor who came in for coffee and stayed for a game of pool now helps set up chairs every Tuesday. A real story and name, with permission, will go here.</p></article><article class="story5 rv"><div class="sph"><img src="../assets/img/er-restore.jpg" alt="" loading="lazy" style="object-position:50% 25%"><span class="ph-badge">Example photo</span></div><small>Example story · Food pantry</small><h3>From the pantry line to the prayer table.</h3><p>[Placeholder] Months of Thursday conversations turned into friendship, and one day, a request for prayer. A real story will go here.</p></article><article class="story5 rv"><div class="sph"><img src="../assets/img/er-empower.jpg" alt="" loading="lazy" style="object-position:50% 30%"><span class="ph-badge">Example photo</span></div><small>Example story · Connecting to support</small><h3>Someone to walk with him to court.</h3><p>[Placeholder] Staff went with a neighbor to his hearing, then to his first appointment for housing. A real story will go here.</p></article></div></div></section>

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
<div class="copy"><p>“A gospel that does not deal with the issues of the day is <em>not the gospel at all.</em>”</p><a class="btn light" href="../volunteer/">Volunteer with us</a></div><span class="where"></span><div class="bar"></div></section>
<section class="pad"><div class="wrap split"><div class="rv"><span class="kick">Need food?</span><h2>The food pantry, <em>every Thursday.</em></h2><p class="lede">We partner with the SF-Marin Food Bank to share food with neighbors living in the 94102 zip code. Sign-ups happen on site at 357 Ellis Street on Thursdays at 3:30 pm. Please bring an ID with your current address, or your ID plus a recent piece of mail.</p><p>Need food right away? Visit the <a href="https://www.sfmfoodbank.org/find-food/" target="_blank" rel="noopener">SF-Marin Food Bank</a> or call 211.</p></div><div class="photo-stack rv"><img src="{ph('queue')}" alt="Neighbors outside on food pantry day" loading="lazy"><img src="../assets/img/er-door.jpg" alt="Neighbors and a staff member welcoming people at the door, beside the food pantry signs" loading="lazy" style="object-position:62% 30%"></div></div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Join what God is <em>already doing here.</em></h2><p>Serve a shift, give toward showers and groceries, or bring a team.</p><div class="row"><a class="btn light" href="../volunteer/">Volunteer</a><a class="btn ghost-light" href="../give/">Give</a><a class="btn ghost-light" href="../teams/">Bring a team</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'ellis-room'), exist_ok=True)
open(os.path.join(OUT, 'ellis-room/index.html'), 'w').write(page('The Ellis Room — YWAM San Francisco', 'neighbors', '../', '../../', nb))

CDN = C
RES = load('resources.json')
YT_CHANNEL = lnk(RES.get('youtube_url'), 'https://www.youtube.com/user/YWAMsanfrancisco')
def rkind(u):
    u = str(u).lower()
    if 'youtube.com' in u or 'youtu.be' in u: return 'Video · YouTube'
    if 'vimeo.com' in u: return 'Video · Vimeo'
    if u.split('?')[0].endswith('.pdf'): return 'PDF'
    if 'map' in u: return 'Map'
    return 'Read'
def res_items(g):
    return ''.join('<li><a class="rlink" href="%s" target="_blank" rel="noopener"><small>%s</small><b>%s</b>%s<i aria-hidden="true">↗</i></a></li>' % (lnk(x.get('url')), rkind(x.get('url')), t(x.get('title')), ('<span>' + t(x.get('by')) + '</span>') if t(x.get('by')) else '') for x in g.get('items', []) if t(x.get('title')) and lnk(x.get('url')))
RES_GROUPS = [g for g in RES.get('groups', []) if t(g.get('title')) and g.get('items')]
def gid(g): return re.sub(r'[^a-z0-9]+', '-', str(g.get('title')).lower()).strip('-')
YT_SVG = '<svg viewBox="0 0 28 20" aria-hidden="true"><rect x="1" y="1" width="26" height="18" rx="5"/><path d="M11.5 6.2v7.6L18 10z"/></svg>'
res_tabs = ''.join('<button type="button" role="tab" aria-selected="%s" aria-controls="rt-%s" id="rtb-%s">%s</button>' % ('true' if i == 0 else 'false', gid(g), gid(g), t(g['title'])) for i, g in enumerate(RES_GROUPS))
res_panels = ''.join('<div class="rpanel" role="tabpanel" id="rt-%s" aria-labelledby="rtb-%s"%s><p>%s</p><ul class="rlist">%s</ul></div>' % (gid(g), gid(g), '' if i == 0 else ' hidden', t(g.get('intro')), res_items(g)) for i, g in enumerate(RES_GROUPS))
DTS_RES = f'''<section class="pad deeper" id="go-deeper"><div class="wrap">
  <div class="rv deeper-head"><div><span class="kick">Go deeper before you come</span><h2>Read, watch and get to know the city.</h2><p class="lede">Teaching and articles on urban mission, and a feel for San Francisco, from our resource library.</p></div><a class="yt-btn" href="{YT_CHANNEL}" target="_blank" rel="noopener">{YT_SVG}<span>Our YouTube channel</span></a></div>
  <div class="rtabs rv" data-tabs><div class="rtab-list" role="tablist" aria-label="Resources">{res_tabs}</div>{res_panels}</div>
  <p class="deeper-foot rv"><a href="../about/resources/">See the full resource library →</a></p>
</div></section>'''
# ---------------------------------------------------------------- DTS APPLY + INQUIRE (FormAssembly forms, embedded)
def form_page(kick, h1, lede, prep, form_url, title, alt_link, h):
    return f'''
<section class="pad formpage"><div class="wrap form-grid">
  <aside class="form-side rv">
    <span class="kick">{kick}</span><h1>{h1}</h1><p class="lede">{lede}</p>
    {prep}
    <p class="form-help">Questions? Email <a href="mailto:{DEMAIL}">{DEMAIL}</a> or call <a href="{TEL}">{PHONE}</a>.</p>
    <p class="form-alt">{alt_link}</p>
  </aside>
  <div class="form-frame">
    <iframe class="fa-frame" src="{form_url}" title="{title}" style="height:{h}px" loading="eager" allow="clipboard-write"></iframe>
    <p class="form-fallback">Form not showing? <a href="{form_url}" target="_blank" rel="noopener">Open it in a new tab ↗</a></p>
  </div>
</div></section>
<script src="https://www.tfaforms.com/js/iframe_resize_helper.js"></script>
'''
APPLY_PREP = '''<div class="prep"><b>Before you start</b><ul>
<li>Set aside about 30–40 minutes. There are 7 short sections.</li>
<li>Have ready: your passport details, your pastor’s or church leader’s contact details, an emergency contact and your health insurance information.</li>
<li>The last section asks how you plan to cover lecture and outreach fees. No payment is taken here.</li>
</ul></div>'''
applyp = form_page('DTS · Application' + ((' · ' + drange(NX['_s'], NX['_e'])) if NX else ''), 'Apply for the <em>DTS</em>',
    ('Applications are open for the ' + NX['_s'].strftime('%B ') + str(NX['_s'].year) + ' school' + (', with ' + SPOTS_TXT + '.' if SPOTS_TXT else '.')) if NX else 'Applications for the next school open soon.',
    APPLY_PREP, DTS_APPLICATION_FORM, 'YWAM San Francisco DTS application', 'Not ready to apply yet? <a href="../inquire/">Send us an inquiry</a> and a DTS staff member will be in touch.', 2400)
inquirep = form_page('DTS · Inquiry', 'Curious about the <em>DTS?</em>',
    'Tell us a little about you and a DTS staff member will be in touch to answer your questions. This isn’t the application.',
    '<div class="prep"><b>Takes about a minute</b><ul><li>Name, email, phone and where you are in the world.</li><li>Which school you’re interested in.</li></ul></div>',
    DTS_INQUIRY_FORM, 'YWAM San Francisco DTS inquiry', 'Ready to apply? <a href="../apply/">Start your application</a>.', 1150)
for _d, _body, _t in (('course/apply', applyp, 'Apply for the DTS — YWAM San Francisco'), ('course/inquire', inquirep, 'DTS Inquiry — YWAM San Francisco')):
    os.makedirs(os.path.join(OUT, _d), exist_ok=True)
    open(os.path.join(OUT, _d, 'index.html'), 'w').write(page(_t, 'course', '../../', '../../../', _body))

# ---------------------------------------------------------------- DTS (5 MONTH COURSE) — native page
YT = 'lH3BLHA6dhI'
YT_SRC = f'https://www.youtube-nocookie.com/embed/{YT}?autoplay=1&mute=1&loop=1&playlist={YT}&controls=0&modestbranding=1&playsinline=1&rel=0&start=10&iv_load_policy=3&disablekb=1&enablejsapi=1'
SVG = {
 'god': '''<svg viewBox="0 0 200 150" aria-hidden="true"><circle cx="100" cy="70" r="46" class="glow"/><circle cx="100" cy="70" r="30" class="glow2"/><path d="M100 38c10 13 13 22 13 29a13 13 0 0 1-26 0c0-7 4-15 13-29z" class="flame"/><path d="M100 55c4 6 5 10 5 13a5 5 0 0 1-10 0c0-3 1-7 5-13z" class="ink"/><rect x="86" y="84" width="28" height="44" rx="2" class="ln"/><path d="M100 80v4" class="ln"/><path d="M60 128h80" class="ln"/><path d="M52 70h-14M162 70h-14M100 18v-8M64 34l-8-8M136 34l8-8" class="ln thin"/></svg>''',
 'neighbor': '''<svg viewBox="0 0 200 150" aria-hidden="true"><ellipse cx="100" cy="122" rx="70" ry="8" class="glow"/><path d="M48 66h40v34a16 16 0 0 1-16 16h-8a16 16 0 0 1-16-16z" class="ln fillm"/><path d="M88 74h6a9 9 0 0 1 0 18h-6" class="ln"/><path d="M112 66h40v34a16 16 0 0 1-16 16h-8a16 16 0 0 1-16-16z" class="ln fillm"/><path d="M112 74h-6a9 9 0 0 0 0 18h6" class="ln"/><path d="M60 56c-4-8 4-10 0-18M72 56c-4-8 4-10 0-18M128 56c-4-8 4-10 0-18M140 56c-4-8 4-10 0-18" class="ln thin"/><path d="M100 46c-4-5-12-3-12 4 0 6 12 12 12 12s12-6 12-12c0-7-8-9-12-4z" class="flame"/></svg>''',
 'humility': '''<svg viewBox="0 0 200 150" aria-hidden="true"><ellipse cx="100" cy="124" rx="74" ry="8" class="glow"/><path d="M44 84h112l-12 32a8 8 0 0 1-8 6H64a8 8 0 0 1-8-6z" class="ln fillm"/><ellipse cx="100" cy="84" rx="56" ry="8" class="ln water"/><path d="M118 30h22a6 6 0 0 1 6 6v34" class="ln"/><path d="M130 36v40c0 5 6 7 10 4" class="ln fillm"/><path d="M134 46h8M134 56h8M134 66h8" class="ln thin"/><path d="M70 66c6-4 6-10 0-14M84 66c6-4 6-10 0-14" class="ln thin"/></svg>''',
 'multiply': '''<svg viewBox="0 0 200 150" aria-hidden="true"><ellipse cx="100" cy="128" rx="64" ry="7" class="glow"/><path d="M100 128V60" class="ln"/><path d="M100 96c-18-2-30-12-34-28 16 0 30 10 34 28zM100 84c18-2 30-12 34-28-16 0-30 10-34 28zM100 66c-12-2-20-10-22-22 11 1 20 9 22 22zM100 60c10-4 16-12 16-24-10 3-16 12-16 24z" class="ln leaf"/><circle cx="58" cy="118" r="5" class="seed"/><circle cx="142" cy="118" r="5" class="seed"/><circle cx="40" cy="124" r="3" class="seed"/><circle cx="160" cy="124" r="3" class="seed"/><path d="M58 113v-8c-4-2-6-6-6-10M142 113v-8c4-2 6-6 6-10" class="ln thin"/></svg>''',
}
VOWS = [('god', '01', 'A place to encounter God', 'Prayer, reflection and Jesus, amid the noise.', 'In a neighborhood that never goes quiet, we make room to slow down, pray, sit with Scripture and meet Jesus. Not as a lesson to learn, but as a Person to know.'),
        ('neighbor', '02', 'A place of peace in the Tenderloin', 'Not an escape from the neighborhood. A steady presence within it.', 'Someone should be able to walk through our doors in grief, uncertainty or crisis and know they will be loved and received. That’s the kind of place we’re becoming.'),
        ('humility', '03', 'A way of life rooted in Jesus', 'Love God. Love your neighbor.', 'Mercy, humility, forgiveness and friendship. Loving people in the realities of their everyday lives is how Jesus made disciples, and it’s how we learn to follow Him.'),
        ('multiply', '04', 'Formed here, sent out', 'You don’t just learn compassion. You practice it.', 'Neighbors, students, volunteers, churches and staff all share this way of life. What you learn here won’t stay in San Francisco: you’ll carry it wherever God leads you next.')]
vows = ''.join(f'''<div class="vow5 rv" role="button" tabindex="0" aria-pressed="false" aria-label="{t}: turn the card over"><span class="vin"><span class="vf"><span class="art glass"><img class="lit" src="../assets/img/vow-{k}.jpg" alt="Stained-glass illustration: {t}" loading="lazy" width="900" height="900"></span><small>{n}</small><b>{t}</b><span class="sub">{sub}</span><span class="turn">Turn over</span><span class="fold"></span></span><span class="vb"><img class="vbimg" src="../assets/img/vow-{k}.jpg" alt="" aria-hidden="true" loading="lazy"><small>What it looks like</small><span class="bt">{back}</span><span class="turn back">Turn back</span></span></span></div>''' for k, n, t, sub, back in VOWS)
HOURS = [("7:00", 420, "Quiet Time", "Before the neighborhood wakes", "Time alone with God: Scripture, silence and prayer. We get rooted before we go out."),
         ("8:00", 480, "Breakfast", "One table", "Someone burns the toast, someone makes coffee for everyone. Shared meals are where community happens."),
         ("9:00", 540, "Teaching", "Speaker of the week", "Worship, then a new teacher each week on the character of God, identity, hearing His voice, the nations, justice and mercy."),
         ("12:30", 750, "Lunch", "Lunch and chores", "Dishes, floors, pantry boxes. Humility learned with a mop in your hand."),
         ("13:30", 810, "Ministry", "On the street", "The food pantry, the Ellis Room, hot chocolate on the corner. Mostly you listen, learn names and pray when asked."),
         ("17:30", 1050, "Dinner", "Back at the table", "The funny stories and the heavy ones get told here. Nobody carries the day alone."),
         ("19:00", 1140, "Reflection", "Small groups", "Where did you see God today? Small groups, mentorship and honest prayer close the day."),
         ("21:00", 1260, "Rest", "…or the night shift", "Most nights, rest. Some rain nights the Ellis Room stays lit until morning.")]
day = ''.join(f'<button type="button" class="hr" style="--x:{i/(len(HOURS)-1)*100:.2f}%" data-i="{i}"><span class="dot"></span><b>{t}</b><span class="nm">{n}</span></button>' for i, (t, m, n, s2, d) in enumerate(HOURS))
day_data = js([{'t': t, 'n': n, 's': s2, 'd': d} for t, m, n, s2, d in HOURS])
PHASE_ALT = {'local:phase-training': 'Students listening to a teaching session in a brick-walled classroom', 'team': 'An outreach team with backpacks on a city sidewalk', 'local:phase-debrief': 'Four students laughing together on a bench outdoors'}
PHASES = [('01', 'Training', 'About 3 months · San Francisco', 'local:phase-training', 'Weekly teaching and worship, small groups, one-on-one mentorship and local ministry in the Tenderloin, with a new speaker every week.'),
          ('02', 'Outreach', 'About 2 months · the cities of the world', 'team', 'Travel as a team to put what you’ve learned into practice, serving alongside local churches and ministries in urban centers.'),
          ('03', 'Debrief', 'The final days', 'local:phase-debrief', 'Reflect on all God has done and prepare for your next season, whether that’s work, college, joining YWAM or wherever He leads.')]
def pimg(k): return '../assets/img/' + k[6:] + '.jpg' if k.startswith('local:') else ph(k, 900)
phases = ''.join(f'<div class="phase rv"><div class="pimg"><img src="{pimg(img)}" alt="{PHASE_ALT.get(img, "")}" loading="lazy"><span>{n}</span></div><h3>{t}</h3><small>{w}</small><p>{d}</p></div>' for n, t, w, img, d in PHASES)
TESTI_REAL = [x for x in load('testimonials.json').get('testimonials', []) if t(x.get('quote'))]
TESTI = [('Student story', 'DTS alumni quote goes here: one or two sentences in their own words about what changed.', 'Name · DTS year'),
         ('Student story', 'A second voice. Ideally someone who came unsure and left with a clearer sense of who God is.', 'Name · DTS year'),
         ('Student story', 'A third voice, perhaps from outreach: what they learned serving alongside a local church abroad.', 'Name · DTS year')]
testi = ''.join('<figure class="testi rv"><blockquote>“%s”</blockquote><figcaption>%s</figcaption></figure>' % (t(x.get('quote')).strip('“”"'), ' · '.join(v for v in (t(x.get('name')), t(x.get('detail'))) if v)) for x in TESTI_REAL) if TESTI_REAL else ''.join(f'<figure class="testi rv placeholder"><span class="ph-badge">{k}</span><blockquote>“{q}”</blockquote><figcaption>{c}</figcaption></figure>' for k, q, c in TESTI)
COACH = 'mailto:' + DEMAIL + '?subject=I%E2%80%99d%20like%20to%20talk%20to%20a%20DTS%20coach'
def _row(x):
    st = 'In session' if x['_s'] <= TODAY else (t(x.get('status')) or 'Applications open')
    href = 'apply/'   # YWAM 7: the embedded application page
    return '  <tr data-days="" data-href="%s"><td><span class="flap">%s</span></td><td><span class="flap">%s</span></td><td>%s</td><td class="seats">%s</td><td><span class="status">%s</span></td></tr>' % (href, x['_s'].strftime('%b ').upper() + str(x['_s'].day) + ' ' + str(x['_s'].year), t(x.get('name') or 'Discipleship Training School').upper(), x['_e'].strftime('%b ').upper() + str(x['_e'].day) + ' ' + str(x['_e'].year), ('<span class="flap">%d LEFT</span>' % int(num(x.get('spots')))) if num(x.get('spots')) > 0 and x['_s'] > TODAY else '—', st)
DTS_ROWS = '\n'.join(_row(x) for x in ACTIVE) or '  <tr data-days=""><td><span class="flap">COMING SOON</span></td><td><span class="flap">DISCIPLESHIP TRAINING SCHOOL</span></td><td></td><td class="seats">—</td><td><span class="status">Dates TBA</span></td></tr>'
if NX:
    _hm = re.fullmatch(r'(\d{1,2}):(\d{2})', str(NX.get('start_time') or '09:00').strip()) or re.fullmatch(r'(\d+):(\d+)', '09:00')
    _start = datetime.datetime(NX['_s'].year, NX['_s'].month, NX['_s'].day, int(_hm.group(1)), int(_hm.group(2)), tzinfo=SF)
    COUNTDOWN_OPEN = '<div class="countdown" data-countdown="%s" aria-live="off">' % _start.isoformat()
    COUNTDOWN_CLOSE = ''
else:
    COUNTDOWN_OPEN = '<div class="countdown" hidden aria-live="off">'; COUNTDOWN_CLOSE = ''
BOARD_NOTE = ('Tap a school to apply.' if len(UPCOMING) > 1 else 'Tap the school to apply. More dates coming soon.') if UPCOMING else 'New dates coming soon. Email ' + DEMAIL + ' to hear first.'
_FQ = load('faq.json')
PARENTS = ''.join('<details><summary>%s</summary><p>%s</p></details>' % (t(q.get('question')), t(q.get('answer'))) for q in _FQ.get('parents', []) if t(q.get('question')))
PARENTS_INTRO = t(_FQ.get('parents_intro'))
_LIFE = load('dts_life.json') if os.path.exists(os.path.join(CONTENT, 'dts_life.json')) else {}
LIFE = ''.join('<div class="phase rv">%s<h3>%s</h3><p>%s</p></div>' % (('<div class="pimg"><img src="%s" alt="%s" loading="lazy"></div>' % (img(x.get('photo'), '../', 900), t(x.get('title')))) if img(x.get('photo'), '../', 900) else '', t(x.get('title')), t(x.get('text'))) for x in _LIFE.get('places', []) if t(x.get('title')))
LIFE_INTRO = t(_LIFE.get('intro'))
# YWAM 7: the shared questions (content/faq.json) plus answers from the DTS team (Nov 2026). Overrides replace a shared answer.
FAQ_OVERRIDE = {'Can I work or go to school during DTS?': ('Can I keep working or studying during DTS?', 'No. DTS is a full-time commitment for the whole school, so there isn’t room for a job or classes alongside it. That’s true for people who already live in San Francisco too.')}
FAQ_EXTRA_TOP = [
    ('Can I have my own room?', 'No. Community living is part of the package. You’ll share a room with a few other students in an apartment on site.'),
    ('Does the %s cover my travel to San Francisco?' % money(DTS_COST), 'No. You’re responsible for organizing your own travel to San Francisco, whether you’re coming from across the country or from overseas.'),
    ('How long is the DTS?', 'About five months: around three months of training here in San Francisco, about two months of outreach in cities around the world, then a few days of debrief.'),
    ('What does it cost, and do I have to pay it all myself?', 'The school is %s USD. We believe finances shouldn’t stop someone from saying yes: most students raise some or all of it through friends, family and churches, and our team will help you explore fundraising and support options. %s' % (money(DTS_COST), t(_DTS.get('cost_note') or ''))),
    ('Do I need ministry experience?', 'No. You don’t need years of ministry experience. You do need a heart that’s ready to learn, a faith you’re willing to put into practice and a desire to love people well.')]
FAQ_EXTRA_END = [
    ('What happens on outreach?', 'You travel as a team for about two months to put what you’ve learned into practice, serving alongside local churches and ministries in cities around the world.'),
    ('How do I apply?', 'Apply online. Set aside about 30–40 minutes: there are 7 short sections, and it helps to have your passport details, a pastor’s or church leader’s contact details, an emergency contact and your health insurance information ready. Not ready yet? Send an inquiry first and a DTS staff member will be in touch.')]
_fq = [(t(x.get('question')), t(x.get('answer'))) for x in load('faq.json').get('questions', []) if t(x.get('question'))]
_fq = [FAQ_OVERRIDE.get(q, (q, a)) for q, a in _fq]
_fq = _fq[:1] + [x for x in FAQ_EXTRA_TOP if x[0] not in dict(_fq)] + _fq[1:] + [x for x in FAQ_EXTRA_END if x[0] not in dict(_fq)]
FAQ_LIST = _fq
def _faqcol(items): return ''.join('<details><summary>%s</summary><p>%s</p></details>' % (q, a) for q, a in items)
_half = (len(FAQ_LIST) + 1) // 2
FAQ = '<div class="faq2"><div class="faq5">%s</div><div class="faq5">%s</div></div>' % (_faqcol(FAQ_LIST[:_half]), _faqcol(FAQ_LIST[_half:]))
DTS_INFO = {'range': drange(NX['_s'], NX['_e']) if NX else 'over five months', 'cost': money(DTS_COST), 'month': (NX['_s'].strftime('%B ') + str(NX['_s'].year)) if NX else 'the next school', 'start': md(NX['_s']) if NX else 'soon', 'apply': NX_APPLY, 'email': DEMAIL}
_sp = int(num(NX.get('spots'))) if NX and num(NX.get('spots')) > 0 else 0
SPOTS = ('%d spots' % _sp) if _sp else ''

# YWAM 7: one tabbed section for home, the neighborhood (and the hard parts), the rhythm, FAQ and parents
_places = [x for x in _LIFE.get('places', []) if t(x.get('title'))]
def _place(x):
    im = img(x.get('photo'), '../', 900)
    return '<div class="phase rv">%s<h3>%s</h3><p>%s</p></div>' % (('<div class="pimg"><img src="%s" alt="%s" loading="lazy"></div>' % (im, t(x.get('title')))) if im else '', t(x.get('title')), t(x.get('text')))
_hood_places = [x for x in _places if 'neighbo' in (x.get('title') or '').lower()]
_home_places = [x for x in _places if x not in _hood_places]
RHYTHM7 = [('pray', 'Pray', 'Weekly prayer walks around our neighborhood and intercessory prayer throughout the week.', 'Students worshipping with a guitar in a city park', '58% 50%'),
           ('study', 'Reflect', 'At the end of your day, sit or go on a walk with God as you reflect on your day.', 'Two students talking together at a table', '42% 50%'),
           ('serve', 'Serve', 'Whether it’s playing a game of pool, handing out a cup of coffee or being a listening ear, your presence is making a difference.', 'A student kneeling to talk with a neighbor wrapped in a blanket', '52% 40%'),
           ('rest', 'Sabbath &amp; Rest', 'Enjoy your day off by doing what brings you to a place of rest.', 'Students on a coastal trail looking out at the Golden Gate Bridge', '33% 60%')]
_rhythm = ''.join(f'<figure><div class="rph"><img src="../assets/img/rhythm-{k}.jpg" alt="{alt}" loading="lazy" style="object-position:{pos}"></div><figcaption><b>{n}</b><span>{d}</span></figcaption></figure>' for k, n, d, alt, pos in RHYTHM7)
_parents_html = PARENTS.replace('See “What it’s like” above', 'See the “Your home” tab above')
_REAL = ('<div class="real2">'
    '<div><h3>What you’ll see</h3><ul><li>Neighbors living on the street, in single-room hotels and in crisis.</li><li>Addiction, mental illness and poverty, up close and by name.</li><li>Noise, mess and a city that doesn’t slow down.</li><li>Grief and hard stories, alongside a lot of joy, humor and resilience.</li></ul></div>'
    '<div><h3>What holds you</h3><ul><li>You never serve alone: always in teams, alongside staff who know these blocks.</li><li>A weekly mentor, a small group and a community that prays together.</li><li>Rhythms of rest: Sabbath, free time and days off to explore the city.</li><li>A purpose: becoming a steady, caring presence in the lives of people others pass by.</li></ul></div>'
    '</div>')
KTABS = [('home', 'Your home', '<p class="lede">' + (LIFE_INTRO or 'Five months is a long time to be somewhere new. Here’s the place you’ll call home.') + '</p><div class="phases life6">' + ''.join(_place(x) for x in _home_places) + '</div>'),
         ('neighborhood', 'The neighborhood', '<p class="lede">San Francisco is a city of breathtaking beauty, rich culture and striking contrasts. In the heart of it lies the Tenderloin: often overlooked, and full of people, stories and opportunities for connection. We’re honest about the hard parts.</p><div class="hood7">' + ''.join(_place(x) for x in _hood_places) + _REAL + '</div>'),
         ('rhythm', 'The rhythm', '<p class="lede">We’re becoming a community shaped by the way of Jesus, whose presence brings peace to the people and the place around it. Over five months you learn that stillness isn’t somewhere you go. It’s Someone you stay close to, and carry with you wherever you are.</p><div class="rhythm" aria-label="The rhythm of a DTS week">' + _rhythm + '</div>'),
         ('faq', 'Common questions', FAQ + '<p class="faq-more">Still wondering about something? Ask in the chat, or email <a href="mailto:' + DEMAIL + '">' + DEMAIL + '</a>.</p>'),
         ('parents', 'For parents', '<div class="numbers5"><div>' + ('<p class="lede">' + PARENTS_INTRO + '</p>' if PARENTS_INTRO else '') + '<div class="price5 pcontact"><p><b>Talk with our DTS team</b></p><p><a href="mailto:' + DEMAIL + '">' + DEMAIL + '</a><br><a href="' + TEL + '">' + PHONE + '</a></p></div></div><div class="faq5">' + _parents_html + '</div></div>')]
KTABS = [k for k in KTABS if not (k[0] == 'parents' and not PARENTS)]
KNOW = ('<section class="pad know7" id="know" style="background:var(--mist)"><div class="wrap">'
        '<div class="rv know-head"><span class="kick">Before you come</span><h2>Everything you’re wondering.</h2><p>Your home, the neighborhood, the rhythm of the week, and the questions people ask most.</p></div>'
        '<div class="ktabs rv" data-tabs><div class="ktab-list" role="tablist" aria-label="Life on the DTS">'
        + ''.join('<button type="button" role="tab" id="kt-%s" aria-controls="%s" aria-selected="%s">%s</button>' % (k, k, 'true' if i == 0 else 'false', n) for i, (k, n, _) in enumerate(KTABS))
        + '</div>' + ''.join('<div class="kpanel" role="tabpanel" id="%s" aria-labelledby="kt-%s"%s>%s</div>' % (k, k, '' if i == 0 else ' hidden', body) for i, (k, n, body) in enumerate(KTABS))
        + '</div></div></section>')

dts = f'''
<section class="dts-top" aria-label="Next DTS departures">
  <div class="wrap dts-board-wrap">
  <div class="board"><div class="board-head"><span>DTS departures · 357 Ellis St</span><span class="clock"></span></div>
  <table><thead><tr><th>Departs</th><th>School</th><th>Returns</th><th>Spots</th><th>Status</th></tr></thead><tbody>
{DTS_ROWS}
  </tbody></table>
  {COUNTDOWN_OPEN}<span class="cd-lab">Departs in</span><div class="cd-units"><div><b data-u="d">--</b><small>Days</small></div><div><b data-u="h">--</b><small>Hours</small></div><div><b data-u="m">--</b><small>Minutes</small></div><div><b data-u="s">--</b><small>Seconds</small></div></div><a class="cd-cta" href="{NX_APPLY}">Apply now →</a></div>{COUNTDOWN_CLOSE}</div>
  <p class="board-note">{BOARD_NOTE}</p>

  </div>
</section>

<section class="pad heart"><div class="wrap heart-grid">
  <div class="rv"><span class="kick">DTS · The 5 Month Course{(' · ' + drange(NX['_s'], NX['_e'])) if NX else ''}</span>
    <h1>What if your faith was meant to be <em>lived?</em></h1>
    <p class="more"><span>{(SPOTS + '.') if SPOTS else ''}</span> <span>One neighborhood.</span> <span>A faith that gets lived out.</span></p></div>
  <div class="rv heart-copy">
    <p class="lede">You love Jesus. You want your life to count for something. And you want more than knowing what you believe. You want to live it.</p>
    <p>A Discipleship Training School (DTS) is five months to grow in your relationship with God by putting your faith into practice: three months of training here in the Tenderloin, two months of outreach in the cities of the world, then a debrief to send you into whatever comes next.</p>
    <p>This is discipleship with your feet on the ground. You’ll learn alongside people who have spent years serving this neighborhood, and discover what it means to live the way of Jesus in the everyday moments of life.</p>
    <div class="links-row"><a class="btn" href="{NX_APPLY}">Apply for DTS</a><a class="btn ghost" href="inquire/">Inquire</a><button class="btn ghost" type="button" data-survey>Am I ready?</button><button class="btn ghost" type="button" data-film="lH3BLHA6dhI">▶ Watch the DTS film</button></div>
    <dl class="facts">{('<div><dt>Spots</dt><dd>' + str(_sp) + ' available</dd></div>') if _sp else ''}<div><dt>Dates</dt><dd>{drange(NX['_s'], NX['_e']) if NX else 'Coming soon'}</dd></div><div><dt>Length</dt><dd>About 5 months</dd></div><div><dt>Cost</dt><dd>{money(DTS_COST)} USD</dd></div><div><dt>Where</dt><dd>{ADDR}</dd></div></dl>
  </div>
</div></section>



<section class="pad monastery" id="monastery"><div class="wrap">
  <div class="mon-head rv"><h2>A monastery without walls</h2><p class="mon-sub">Peace in the middle of the chaos, not an escape from it.</p></div>
  <div class="mon-copy mon-one rv"><p class="lede">Monks used to build their monasteries far from the noise. We built ours in the middle of it. Sirens, shouting on the corner, a neighbor who needs to talk: the city doesn’t go quiet for us, and we don’t want it to.</p>
  <p class="mon-hint">A place to find peace in the midst of life, encounter Jesus through community, and be formed to carry that peace into the world. Turn a card over to see what it looks like.</p></div>
  <div class="vows5">{vows}</div>
  <figure class="return5 rv"><span class="kick">05 · A presence people can return to</span><blockquote>“[Story placeholder] A man who’d been part of our community for years came back through our doors on the worst day of his life. He said he came because he knew the people here would love him.”</blockquote><figcaption>The Monastery isn’t just what happens during a program. It’s becoming a trusted place of refuge and relationship, over years. <em>Story to be replaced with a real one.</em></figcaption></figure>
</div></section>

<section class="pad rule5" style="background:var(--mist)"><div class="wrap">
  <div class="daybar rv" id="day"><div class="daybar-head"><span class="kick">A day in the life</span><span class="hint">Tap an hour</span></div>
    <div class="sky"><div class="sun"></div>{day}</div>
    <div class="hour5" aria-live="polite"><small data-h="t"></small><h3 data-h="n"></h3><p data-h="d"></p></div>
    <p class="note-small">A sample day. Rhythms shift week to week, and every week has free time and a Sabbath.</p></div>

</div></section>


<section class="pad"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Three parts, one journey</span><h2>From the neighborhood to the nations.</h2></div>
  <div class="phases">{phases}</div></div></section>

{KNOW}

<section class="pad fit5" style="background:var(--mist)"><div class="wrap fit-grid"><div class="rv"><span class="kick">Is this for you?</span><h2>You don’t need years of ministry experience.</h2></div>
  <div class="rv"><p class="lede">You do need a heart that’s ready to learn, a faith you’re willing to put into practice, and a desire to love people well.</p>
  <p>If you’re serious about following Jesus, exploring a call to ministry, or wanting to understand what it means to love your neighbor in practical, everyday ways, we’d love to hear from you.</p>
  <p class="spots-line">{('Only ' + SPOTS + ' for this school. ') if SPOTS else ''}<a href="{NX_APPLY}">Apply now to reserve your spot →</a> <span class="or-inq">Not ready yet? <a href="inquire/">Send us an inquiry</a>.</span></p></div></div></section>

<section class="pad"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">In their words</span><h2>Stories from past students.</h2></div>
  <div class="testis">{testi}</div></div></section>

<section class="pad cost7" id="cost"><div class="wrap numbers5">
  <div class="rv"><span class="kick">Cost</span><h2>Clear numbers. No surprises.</h2><p class="lede">One price for the school, and a team to help you get there.</p><p>Questions about cost? See the <a href="#faq">common questions</a>, or email <a href="mailto:{DEMAIL}">{DEMAIL}</a>.</p></div>
  <div class="price5 rv"><div class="amt">{money(DTS_COST)} <small>USD*</small></div><p>We believe finances shouldn’t stop someone from saying yes. Our team will help you explore fundraising and support options.</p><p class="fine">*{t(_DTS.get('cost_note') or 'Cost may vary for international applicants; please ask about alternative pricing.')} Travel to San Francisco isn’t included.</p></div>
</div></section>

<section class="ready pad"><div class="wrap">
  <div class="rv ready-head"><span class="kick">The door is open</span><h2>How do I know I’m ready for a DTS?</h2><p>You don’t have to figure it out alone. Start wherever feels right.</p></div>
  <div class="ready3">
    <button class="rcard rv" type="button" data-survey><small>01 · Reflect</small><b>Take the 3-minute check-in</b><span>Seven honest questions with a gentle, personal read on where you are.</span><em>Start →</em></button>
    <a class="rcard rv" href="{COACH}"><small>02 · Talk</small><b>Talk to a DTS coach</b><span>A real conversation with someone from our DTS staff. Ask anything, no pressure.</span><em>Email a coach →</em></a>
    <a class="rcard rv solid" href="{NX_APPLY}"><small>03 · Apply</small><b>{('Apply for ' + NX['_s'].strftime('%B')) if NX else 'Apply for DTS'}</b><span>{('Applications are open for the ' + NX['_s'].strftime('%B ') + str(NX['_s'].day) + ', ' + str(NX['_s'].year) + ' school' + (', with ' + SPOTS + '.' if SPOTS else '.')) if NX else 'New school dates are coming soon. Get in touch and we’ll let you know.'}</span><em>Apply now →</em></a>
  </div>
  <p class="ready-foot rv">Want to see the place first? <a href="../volunteer/">Serve a shift on Ellis Street</a> or <a href="../teams/">come with a team</a>.</p>
</div></section>

{DTS_RES}

<div class="modal" id="modal" aria-hidden="true"><div class="modal-box"><button class="modal-x" aria-label="Close">✕</button><div id="survey"></div></div></div>
<div class="lightbox" role="dialog" aria-modal="true" aria-label="DTS film"><div class="box"><iframe title="YWAM San Francisco DTS film" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><button class="x" aria-label="Close film">✕</button></div>
'''
dts_scripts = f'<script>window.YWAM_DAY={day_data};window.YWAM_DTS={js(DTS_INFO)};</script><script src="../assets/survey.js?v={VER}"></script>'
dts_head = f'<link rel="stylesheet" href="../assets/survey.css?v={VER}">'
os.makedirs(os.path.join(OUT, 'course'), exist_ok=True)
open(os.path.join(OUT, 'course/index.html'), 'w').write(page('DTS (5 Month Course) — YWAM San Francisco', 'course', '../', '../../', dts, extra_head=dts_head, scripts=dts_scripts))

# ---------------------------------------------------------------- ABOUT SECTION (Who We Are + History · Staff & Board · News & Events)
CDN = C
def subnav(cur, ab):
    """ab = relative path from the current page to the about/ folder"""
    items = [(ab, 'Who We Are', 'who'), (ab + 'people/', 'Staff & Board', 'people'), (ab + 'news/', 'News & Events', 'news'), (ab + 'resources/', 'Resources', 'resources'), (ab + '../contact/', 'Contact', 'contact')]
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
 ('2008', 'A full house', 'Two DTSes a year, Mission Adventures teams, Oakdale Youth House, the Street Team, a Discipleship Training Program and an Urban Internship.'),
 ('Today', 'Presence that restores', 'The Ellis Room, the food pantry, showers and haircuts, Bible study, Pop-Up Church and the DTS, all from the same 100-year-old building on Ellis Street.'),
]
VALUES = [('Love of God', 'We draw life from Jesus through worship, Scripture, prayer, and healthy relationships.', 'We stay rooted in God.'),
          ('Love of Neighbor', 'We show up for our neighbors through listening, welcome, and shared life.', 'We practice compassionate presence.'),
          ('Humility in Action', 'We embrace every task as sacred and serve with joy and humility.', 'We look first to the interests of others.'),
          ('Formation that Multiplies', 'We grow as followers of Jesus and help others do the same.', 'We form disciples who form disciples.')]
VALS = ''.join(f'<li><h3>{a}</h3><p>{b}</p><p><b>{c}</b></p></li>' for a, b, c in VALUES)
PILLARS = ''.join(f'<div><small>{a}</small><h3>{b}</h3><p>{c}</p></div>' for a, b, c in [
    ('Community', 'Building relationships', 'We create spaces where neighbors experience belonging and friendship.'),
    ('Resources', 'Connecting to support', 'We help neighbors access practical services and long-term pathways.'),
    ('Church', 'Equipping &amp; mobilizing believers', 'We prepare and empower the Church for compassionate ministry in the Tenderloin.')])
EXPR = ''.join(f'<a class="card5 rv" href="{h}"><h3>{a}</h3><p>{b}</p><span class="go">{g} →</span></a>' for a, b, h, g in [
    ('Neighborhood engagement', 'The relational heart of the mission: presence, outreach, spaces and connections.', '../ellis-room/', 'The Ellis Room'),
    ('Hosting &amp; hospitality', 'We welcome and equip teams, volunteers and guests as partners in ministry.', '../teams/', 'Bring a team'),
    ('Training programs', 'We form disciples who live, serve and grow in the Tenderloin.', '../course/', 'The DTS')])
tl = ''.join(f'<li class="rv"><span class="yr">{y}</span><div><h3>{t}</h3><p>{d}</p></div></li>' for y, t, d in TIMELINE)
who = subnav('who', '') + f'''
<section class="pad" id="mission"><div class="wrap"><span class="kick" style="text-align:center">Our mission</span><p class="lit" data-lit>Rooted in the way of Jesus, we seek to restore lives, form whole persons, and equip believers to be a compassionate and courageous presence in the world.</p>
<div class="vision2 rv"><span class="kick">Our vision</span><p>We envision a Tenderloin where neighbors and the neighborhood are <em>renewed</em>, and where the Church is mobilized to share the love of Christ.</p></div></div></section>
<section class="pad" id="values" style="background:var(--mist)"><div class="wrap"><div class="rv" style="max-width:760px;margin-bottom:30px"><span class="kick">Our values</span><h2>Four movements that shape us.</h2><p class="lede">They shape our life with God, our posture toward neighbors, and our commitment to multiply disciples.</p></div>
<ol class="vals rv">{VALS}</ol></div></section>
<section class="pad" id="engage"><div class="wrap"><div class="rv" style="max-width:760px;margin-bottom:30px"><span class="kick">How we live the mission</span><h2>Three pillars.</h2></div>
<div class="pillars3 rv">{PILLARS}</div>
<div class="rv" style="margin:clamp(48px,6vw,72px) 0 22px"><span class="kick">Where it happens</span><h3>Three ways to be part of it.</h3></div>
<div class="phases expr3">{EXPR}</div></div></section>
<section class="pad heart" style="background:var(--mist)"><div class="wrap"><span class="kick" style="text-align:center">Our heart</span><p class="lit" data-lit>We believe Jesus is renewing the Tenderloin: one person, one relationship, one act of love at a time.</p></div></section>
<section class="pad" id="history"><div class="wrap hist"><div class="hist-head rv"><span class="kick">Our history</span><h2>Since 1987.</h2><blockquote>“The city of San Francisco is only 47 square miles in size, but its potential to reach the nations is endless.”</blockquote></div>
<ol class="timeline">{tl}</ol></div></section>
<section class="pad" id="family" style="background:var(--mist)"><div class="wrap family"><div class="rv"><span class="kick">Our family</span><h2>Part of something bigger.</h2><p class="lede">YWAM San Francisco is a non-profit and part of the YWAM San Francisco Bay Area family of ministries, which belongs to Youth With A Mission, a global, interdenominational movement of Christians from many cultures and churches.</p><div class="links-row"><a class="btn" href="https://ywamsfbayarea.org/" target="_blank" rel="noopener">YWAM SF Bay Area</a><a class="btn ghost" href="https://ywam.org/" target="_blank" rel="noopener">YWAM International</a></div></div>
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
people = subnav('people', '../') + f'''
<section class="pad" id="staff"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Leadership</span><h2>Our directors.</h2></div>
<div class="people4">{lead}</div>
<div class="crews">{teams_html}</div></div></section>
<section class="pad" style="background:var(--mist)" id="board"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Board of directors</span><h2>Guiding and stewarding the ministry.</h2><p class="lede">Our board brings decades of experience in missions, leadership and finance.</p></div>
<div class="board-grid">{board}</div></div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Join the staff.</h2><p>Most of our staff first came for a DTS. If you’re sensing a call to serve in the city, start a conversation with us.</p><div class="row"><a class="btn light" href="../../join-staff/">Join staff</a><a class="btn ghost-light" href="../../contact/">Get in touch</a></div></div></section>
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
posts = ''.join(f'<a class="story rv" href="{LIVE}{u}" target="_blank" rel="noopener"><div class="ph"><img src="{ph(k,900)}" alt="{ALT_PH.get(k, "")}" loading="lazy"></div><small class="date">{d}</small><h3>{t}</h3><p>{x}</p></a>' for k, d, t, x, u in POSTS)
news = subnav('news', '../') + f'''
<section class="pad" id="updates"><div class="wrap"><div class="update rv"><img src="{ph('timkarol',900)}" alt="Tim and Karol" loading="lazy"><div><span class="kick">Leadership update</span><h2>Thank you, Tim and Karol.</h2><p class="lede">After 18 faithful years leading YWAM in the Tenderloin, Tim and Karol are transitioning out of their leadership role. We’re deeply grateful for their years of love and service on Ellis Street.</p><a class="btn ghost" href="{LIVE}/blog" target="_blank" rel="noopener">Read the update</a></div></div></div></section>
<section class="pad" id="events" style="background:var(--mist)"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">Gatherings</span><h2>Come and join us.</h2><p class="lede">Everyone is welcome at 357 Ellis Street.</p></div>
<div class="events">
{EVENTS}
</div><div class="links-row"><a class="btn" href="{LIVE}/events" target="_blank" rel="noopener">See the events calendar</a></div></div></section>
<section class="pad" id="blog"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:30px"><span class="kick">From the blog</span><h2>Stories from the street.</h2></div>
<div class="stories news-grid">{posts}</div>
<div class="links-row"><a class="btn" href="{LIVE}/blog" target="_blank" rel="noopener">Read the blog</a><a class="btn ghost" href="../resources/">Resources</a></div></div></section>
<section class="cta-band pad"><div class="wrap rv"><h2>Be part of the next story.</h2><p>Serve a shift, bring a team, or give toward the work on Ellis Street.</p><div class="row"><a class="btn light" href="../../volunteer/">Volunteer</a><a class="btn ghost-light" href="../../give/">Give</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'about/news'), exist_ok=True)
open(os.path.join(OUT, 'about/news/index.html'), 'w').write(page('News & Events — YWAM San Francisco', 'about', '../../', '../../../', news))


# resources
res_sections = ''.join('<section class="pad res-sec" id="%s"%s><div class="wrap res-grid"><div class="rv res-head"><span class="kick">%02d</span><h2>%s</h2><p>%s</p></div><ul class="rlist rv">%s</ul></div></section>' % (gid(g), ' style="background:var(--mist)"' if i % 2 == 0 else '', i + 1, t(g['title']), t(g.get('intro')), res_items(g)) for i, g in enumerate(RES_GROUPS))
resources = subnav('resources', '../') + f'''
<section class="pad yt-sec" id="youtube"><div class="wrap"><div class="yt-card rv">
  <div class="yt-ic" aria-hidden="true">{YT_SVG}</div>
  <div class="yt-copy"><span class="kick">Watch</span><h2>YWAM San Francisco on YouTube.</h2><p>Films from Ellis Street, stories from the neighborhood, DTS life and teaching on urban mission.</p></div>
  <a class="btn" href="{YT_CHANNEL}" target="_blank" rel="noopener">Visit our YouTube channel ↗</a>
</div>
<nav class="res-jump rv" aria-label="Resource sections">{"".join('<a href="#%s">%s</a>' % (gid(g), t(g['title'])) for g in RES_GROUPS)}</nav></div></section>
{res_sections}
<section class="cta-band pad"><div class="wrap rv"><h2>Learn it on the streets, too.</h2><p>The best way to understand the city is to serve in it.</p><div class="row"><a class="btn light" href="../../course/">DTS (5 Month Course)</a><a class="btn ghost-light" href="../../volunteer/">Come volunteer</a></div></div></section>
'''
os.makedirs(os.path.join(OUT, 'about/resources'), exist_ok=True)
open(os.path.join(OUT, 'about/resources/index.html'), 'w').write(page('Resources — YWAM San Francisco', 'about', '../../', '../../../', resources))

# ---------------------------------------------------------------- PAY (placeholder until a payment processor is connected)
pay = f'''
<section class="pay-sec"><div class="wrap pay-grid">
  <div class="pay-intro rv"><span class="kick">Pay fees · students &amp; teams</span><h1>Make a payment.</h1>
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
<section class="pad give-top" id="give-online"><div class="wrap give-form-grid">
  <aside class="give-side rv">
    <span class="kick">Give online</span><h2>Give once or monthly.</h2>
    <p>Give by credit card through Click &amp; Pledge. Monthly gifts help us plan ahead for the pantry, showers and outreach.</p>
    <ul class="give-facts">
      <li>Click &amp; Pledge charges a small fee per transaction.</li>
      <li>Your receipt comes by email. Tax receipts are issued to U.S. residents only.</li>
      <li>YWAM San Francisco is a 501(c)(3) non-profit. Tax ID #94-3218675.</li>
      <li>Giving to a staff member’s ministry? You can give here too. Gifts for students can’t be sent to YWAM SF directly.</li>
    </ul>
    <p class="form-help">Questions? Email <a href="mailto:{EMAIL}">{EMAIL}</a> or call <a href="{TEL}">{PHONE}</a>.</p>
  </aside>
  <div class="form-frame cnp-frame">
    <iframe id="CnP_inlineiframe" class="cnp-iframe" src="{CNP_FORM}" title="Click and Pledge giving form" allow="payment" scrolling="no" loading="eager"></iframe>
    <p class="form-fallback">Form not showing? <a href="{CNP_FORM}" target="_blank" rel="noopener">Open the giving form in a new tab ↗</a></p>
  </div>
</div></section>
<script src="https://resources.connect.clickandpledge.com/Library/iframeResizer.min.js"></script>
<script>(function(){{var f=document.getElementById('CnP_inlineiframe');function go(){{if(window.iFrameResize)iFrameResize({{log:false,checkOrigin:['https://connect.clickandpledge.com']}},f);}}if(f.contentWindow&&document.readyState!=='loading')go();f.addEventListener('load',go);}})();</script>
<section class="pad give-ways" style="padding-top:0"><div class="wrap"><div class="rv" style="max-width:720px;margin-bottom:26px"><span class="kick">Other ways to give</span><h2>However you’d like to help.</h2></div>
<div class="gw-grid"><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 22h60v34H10z"/><path pathLength="1" d="M10 22l30 20 30-20"/><path pathLength="1" class="r" d="M54 14h12v12"/><path pathLength="1" class="r" d="M48 32l18-18"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M10 22h60v34H10z"/><path pathLength="1" d="M10 22l30 20 30-20"/><path pathLength="1" class="r" d="M54 14h12v12"/><path pathLength="1" class="r" d="M48 32l18-18"/></svg></span><h3>By check</h3><p>Payable to YWAM San Francisco, mailed to {ADDR}, {CITY}.</p></div><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M12 30L40 14l28 16"/><path pathLength="1" d="M12 60h56M16 56h48"/><path pathLength="1" d="M22 34v20M34 34v20M46 34v20M58 34v20"/><path pathLength="1" class="r" d="M30 24h20"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M12 30L40 14l28 16"/><path pathLength="1" d="M12 60h56M16 56h48"/><path pathLength="1" d="M22 34v20M34 34v20M46 34v20M58 34v20"/><path pathLength="1" class="r" d="M30 24h20"/></svg></span><h3>Recurring bank transfer</h3><p>Give monthly straight from your bank account (ACH). We’ll send you a short form.</p><a class="go" href="mailto:{EMAIL}?subject=ACH%20giving%20form">Request the form →</a></div><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M14 32h52v28H14z"/><path pathLength="1" d="M10 24h60v8H10z"/><path pathLength="1" d="M40 24v36"/><path pathLength="1" class="r" d="M40 24c-6-10-18-10-16-2 2 5 16 2 16 2zM40 24c6-10 18-10 16-2-2 5-16 2-16 2z"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M14 32h52v28H14z"/><path pathLength="1" d="M10 24h60v8H10z"/><path pathLength="1" d="M40 24v36"/><path pathLength="1" class="r" d="M40 24c-6-10-18-10-16-2 2 5 16 2 16 2zM40 24c6-10 18-10 16-2-2 5-16 2-16 2z"/></svg></span><h3>In-kind gifts</h3><p>New socks, toiletries and more for neighbors who visit the Ellis Room.</p><a class="go" href="{LIVE}/give" target="_blank" rel="noopener">See what we need →</a></div><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M8 42l10-10c3-3 7-3 10 0l6 6"/><path pathLength="1" d="M72 42L62 32c-3-3-7-3-10 0L38 46c-3 3 1 7 4 4l6-6"/><path pathLength="1" d="M18 50l10 10M26 46l10 10"/><path pathLength="1" class="r" d="M40 8v12M34 14h12"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M8 42l10-10c3-3 7-3 10 0l6 6"/><path pathLength="1" d="M72 42L62 32c-3-3-7-3-10 0L38 46c-3 3 1 7 4 4l6-6"/><path pathLength="1" d="M18 50l10 10M26 46l10 10"/><path pathLength="1" class="r" d="M40 8v12M34 14h12"/></svg></span><h3>Employer matching</h3><p>Many employers match gifts, so yours could go twice as far.</p></div><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M40 62a26 26 0 1 0 0-52 26 26 0 0 0 0 52z"/><path pathLength="1" d="M14 36h52M40 10c-10 12-10 40 0 52M40 10c10 12 10 40 0 52"/><path pathLength="1" class="r" d="M58 14l10-4-4 10M68 10L52 26"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M40 62a26 26 0 1 0 0-52 26 26 0 0 0 0 52z"/><path pathLength="1" d="M14 36h52M40 10c-10 12-10 40 0 52M40 10c10 12 10 40 0 52"/><path pathLength="1" class="r" d="M58 14l10-4-4 10M68 10L52 26"/></svg></span><h3>Wire transfer</h3><p>Domestic or international. Ask us for the instructions.</p><a class="go" href="mailto:{EMAIL}?subject=Wire%20transfer%20instructions">Ask for instructions →</a></div><div class="card5 draw gw rv"><span class="drw"><svg class="dr ghost" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M12 12v48h56"/><path pathLength="1" d="M22 50V40M34 50V32M46 50V36M58 50V24"/><path pathLength="1" class="r" d="M20 36l12-10 12 6 18-16"/><path pathLength="1" class="r" d="M54 16h8v8"/></svg><svg class="dr" viewBox="0 0 80 72" aria-hidden="true"><path pathLength="1" d="M12 12v48h56"/><path pathLength="1" d="M22 50V40M34 50V32M46 50V36M58 50V24"/><path pathLength="1" class="r" d="M20 36l12-10 12 6 18-16"/><path pathLength="1" class="r" d="M54 16h8v8"/></svg></span><h3>Stocks & securities</h3><p>Contact our finance office to give appreciated stock.</p><a class="go" href="{TEL}">{PHONE} →</a></div></div>
<p class="taxnote">YWAM San Francisco is a 501(c)(3) non-profit (Tax ID #94-3218675). Tax receipts are issued to U.S. residents only. Contributions are tax-deductible as allowed by IRS guidelines; the IRS decides what is deductible. Student donations and school fees are not tax-deductible; to pay fees, use the <a href="../pay/">Pay page</a>.</p></div></section>
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

# ---------------------------------------------------------------- CHAT ASSISTANT KNOWLEDGE (YWAM 7)
# The "Ask us" chat answers from this list only: no AI, nothing sent anywhere. Everything here comes from the
# site's own copy and content/*.json, so admin edits (FAQ, shifts, dates, hours) flow into the chat on the next build.
# Each entry: topic, question shown to people, extra keywords, answer text (plain text), links [(label, href)].
# hrefs are site paths (relative to the site root) or https/mailto/tel.
def U(v): return html.unescape(re.sub(r'<[^>]+>', '', str(v or ''))).strip()
_hours = {U(h.get('label')): U(h.get('text')) for h in S.get('hours', []) if U(h.get('label'))}
_shifts = [x for x in load('shifts.json').get('shifts', []) if U(x.get('title'))]
_mins = [x for x in load('ministries.json').get('ministries', []) if U(x.get('title'))]
_events = [x for x in load('events.json').get('events', []) if U(x.get('title'))]
_ew = {}
for e in load('ellis_week.json').get('entries', []):
    if U(e.get('title')): _ew.setdefault(U(e.get('title')), []).append(U(e.get('day')) + ' ' + U(e.get('label')))
_dates = ('The next school runs %s.' % U(drange(NX['_s'], NX['_e']))) if NX else 'New school dates are coming soon.'
_spots = (' There are %d spots for this school.' % _sp) if _sp else ''
_up = [U(drange(x['_s'], x['_e'])) for x in UPCOMING]
E, DE, VE, OE, PH = U(EMAIL), U(DEMAIL), U(VEMAIL), U(OEMAIL), U(PHONE)
L_APPLY, L_INQ, L_DTS = ('Apply for the DTS', 'course/apply/'), ('Send an inquiry', 'course/inquire/'), ('The DTS page', 'course/')
L_DMAIL, L_MAIL, L_CALL = ('Email ' + DE, 'mailto:' + DE), ('Email ' + E, 'mailto:' + E), ('Call ' + PH, TEL)
KB = []
def kb(topic, q, keys, a, links=(), phrases=()): KB.append({'t': topic, 'q': q, 'k': keys, 'a': a, 'l': [list(x) for x in links], 'p': list(phrases)})

# DTS: the page's own FAQ (shared content + the DTS team's answers) and parents' questions
FAQ_KEYS = {'Can I have my own room?': ('room own private bedroom share roommate single', ['own room', 'my own room', 'private room']),
            'What does it cost, and do I have to pay it all myself?': ('cost price much expensive afford fundraising fundraise support', ['how much', 'cost']),
            'Can I keep working or studying during DTS?': ('work job studying class keep', ['my job', 'keep working', 'part time', 'part-time'])}
for q, a in FAQ_LIST:
    k, ph = FAQ_KEYS.get(U(q), ('', []))
    kb('dts', U(q), k, U(a), [L_DTS], ph)
for q in _FQ.get('parents', []):
    if U(q.get('question')): kb('parents', U(q.get('question')), 'parent mom dad son daughter child kid family', U(q.get('answer')).replace('See “What it’s like” above', 'The “Your home” tab on the DTS page shows it'), [('For parents', 'course/#parents'), L_DMAIL])
kb('dts', 'What is a DTS?', 'dts discipleship training school what is about course program', 'A Discipleship Training School (DTS) is five months to grow in your relationship with God by putting your faith into practice: about three months of training here in the Tenderloin, about two months of outreach in cities around the world, then a debrief to send you into whatever comes next. ' + _dates, [L_DTS, L_APPLY])
kb('dts', 'When is the next DTS?', 'date dates when start begin next school january session calendar deadline', _dates + _spots + ((' Upcoming schools: ' + '; '.join(_up) + '.') if len(_up) > 1 else ''), [L_APPLY, L_DTS])
kb('dts', 'What does a day look like?', 'day schedule daily routine timetable typical morning evening', 'A sample day: ' + '; '.join('%s %s' % (h[0], U(h[2])) for h in HOURS) + '. Rhythms shift week to week, and every week has free time and a Sabbath.', [('A day in the life', 'course/#day')])
kb('dts', 'What is the weekly rhythm?', 'rhythm week pray reflect serve sabbath rest weekly prayer walk', ' '.join('%s: %s' % (U(n), U(d)) for k, n, d, alt, pos in RHYTHM7), [('The rhythm', 'course/#rhythm')])
kb('dts', 'What do you learn in the teaching?', 'teach teaching learn lecture speaker class topics curriculum', 'Worship, then a new teacher each week on topics like the character of God, identity, hearing His voice, the nations, justice and mercy. Then you work it out on the street, in small groups and with a weekly mentor.', [L_DTS])
kb('dts', 'Where will I live and eat?', 'live housing accommodation apartment eat food meals kitchen stay', 'You’ll live on site at ' + U(ADDR) + ' with the rest of your school, sharing a room with a few other students. Meals are planned and shared at the base around one table with YWAM staff, and everyone takes a turn in the kitchen.', [('Your home', 'course/#home')])
kb('dts', 'What is the Monastery?', 'monastery without walls peace vision', 'The Monastery is how we describe the DTS: a place of peace in the middle of the Tenderloin, not an escape from it. A place to encounter God, a place of peace in the neighborhood, a way of life rooted in Jesus, and being formed here and sent out.', [('The Monastery', 'course/#monastery')])
kb('dts', 'Am I ready for a DTS?', 'ready readiness sure unsure quiz check-in right for me should i', 'Take the 3-minute check-in on the DTS page: seven honest questions with a gentle, personal read on where you are. Or talk to someone from our DTS staff, with no pressure.', [L_DTS, ('Email a DTS coach', 'mailto:' + DE)])
kb('dts', 'Can international students come?', 'international overseas visa foreign country abroad passport', 'We welcome students from overseas. You’re responsible for organizing your own travel to San Francisco. For visas and anything specific to your country, please email our DTS team. ' + U(_DTS.get('cost_note') or ''), [L_DMAIL])
kb('dts', 'How do I pay my DTS fees?', 'pay fees payment deposit invoice', 'Use the Pay Fees page: choose what the payment is for and who it’s for, and our finance team makes sure it reaches the right account.', [('Pay fees', 'pay/')])
kb('dts', 'Who are the DTS staff?', 'staff leaders directors who runs team', 'Our staff teach, eat and serve alongside students every day, and several have lived and served on Ellis Street for years. You can meet the directors and board on the Staff & Board page.', [('Staff & Board', 'about/people/')])

# Volunteers
for x in _shifts:
    _su = SIGNUP_LINKS.get(U(x.get('title')).lower())
    kb('volunteer', 'What is the %s shift?' % U(x.get('title')), U(x.get('title')) + ' shift volunteer ' + U(x.get('when')), '%s, %s. %s' % (U(x.get('when')), U(x.get('time')), U(x.get('description'))), ([('Sign up for ' + U(x.get('title')), _su)] if _su else []) + [('Volunteer shifts', 'volunteer/'), ('Email ' + VE, 'mailto:' + VE)], [U(x.get('title')).lower()])
kb('volunteer', 'How do I volunteer?', 'volunteer serve help sign up shift join bay area local', 'Pick a shift on the Volunteer page and sign up, or email our volunteer team. Weekly shifts: ' + '; '.join('%s (%s, %s)' % (U(x.get('title')), U(x.get('when')), U(x.get('time'))) for x in _shifts) + '.', [('Volunteer shifts', 'volunteer/'), ('Email ' + VE, 'mailto:' + VE)])
kb('volunteer', 'I don’t live in the Bay Area. Can I still serve?', 'summer season long term outside bay area mission builders skills maintenance cooking room board', 'Yes. Join our Summer of Service, or come as a Mission Builder: use your skills in maintenance, cooking, administration or photo and video, in exchange for free or subsidized room and board.', [('Summer of Service', 'https://www.ywamsanfrancisco.org/summerservice'), ('Mission Builders', 'https://www.missionbuilders.org/location/?LID=149')])
kb('volunteer', 'Can I volunteer with my group or church?', 'group church friends youth together volunteer team', 'Teams are welcome at the Thursday food pantry. For a weekend, a week or longer with your church or youth group, look at Mission Adventures on the Bring a Team page.', [('Bring a team', 'teams/'), ('Email ' + VE, 'mailto:' + VE)])

# Churches & teams
kb('teams', 'What is a Mission Adventure?', 'mission adventure trip church youth group school short term outreach team', 'A weekend, a week or longer serving in the Tenderloin with your church, youth or school group. We plan the orientation, ministry, meals and housing at our base so your team can focus on loving God and loving people.', [('Bring a team', 'teams/'), ('Book a Mission Adventure', U(TEAM_FORM))])
kb('teams', 'How much does a Mission Adventure cost?', 'cost price per day per person team trip fee budget', '$%d per participant per day, including food, accommodation and ministry supplies. The Bring a Team page has a calculator to estimate your trip.' % MA_RATE, [('Estimate your trip', 'teams/'), ('Book today', U(TEAM_FORM))])
kb('teams', 'Can our YWAM school or team visit?', 'ywam school team visit lecture week outreach launch base', 'Yes. We host schools and outreach teams from other YWAM locations: a final lecture week in the Tenderloin, a local city outreach, or a launch point on your way overseas.', [('Bring a team', 'teams/'), ('Email ' + OE, 'mailto:' + OE + '?subject=YWAM%20team%20visit')])
kb('teams', 'How can our church partner with you?', 'church partner partnership pastor congregation leader together', 'We love working with churches: part of our mission is to prepare and empower the Church for compassionate ministry in the Tenderloin. Bring your church or youth group on a Mission Adventure, serve a volunteer shift together, or get in touch to talk about partnering.', [('Bring a team', 'teams/'), L_MAIL], ['partner', 'pastor', 'our church'])
kb('teams', 'Where does our team stay?', 'stay housing sleep accommodation team base', 'Your team stays at the YWAM San Francisco base at ' + U(ADDR) + ', shares meals and space with YWAM staff, and gathers for devotion and worship each day.', [('Bring a team', 'teams/')])

# Giving
kb('give', 'How can I give?', 'give donate donation support money gift online card monthly', 'Give once or monthly by credit card on our Give page (through Click & Pledge). You can also give by check, recurring bank transfer, wire, stock or in-kind gifts.', [('Give', 'give/')])
kb('give', 'Is my gift tax-deductible?', 'tax deductible receipt 501c3 ein tax id irs', 'YWAM San Francisco is a 501(c)(3) non-profit, Tax ID #94-3218675. Tax receipts are issued to U.S. residents only, and contributions are deductible as allowed by IRS guidelines. Student donations and school fees are not tax-deductible.', [('Give', 'give/')])
kb('give', 'Can I give by check or bank transfer?', 'check cheque mail bank transfer ach wire stock securities employer matching', 'Checks: payable to YWAM San Francisco, mailed to ' + U(ADDR) + ', ' + U(CITY) + '. For a recurring bank transfer (ACH) or wire, email us and we’ll send the form or instructions. For stocks, call our finance office on ' + PH + '.', [('Other ways to give', 'give/'), L_MAIL])
kb('give', 'Can I give to a staff member or a student?', 'support staff member missionary student sponsor someone', 'Gifts toward a staff member’s ministry can be given through our Give page. Gifts for students can’t be sent to YWAM SF as donations; to pay a student’s fees, use the Pay Fees page.', [('Give', 'give/'), ('Pay fees', 'pay/')])
kb('give', 'What items can I donate?', 'in-kind donate items socks toiletries clothes supplies', 'In-kind gifts like new socks and toiletries help neighbors who visit the Ellis Room. The Give page links to our current list of needs.', [('Give', 'give/')])

# Ellis Room, neighbors, staff, about, visiting
kb('ellis', 'When is the Ellis Room open?', 'ellis room open hours times when drop in', 'Ellis Room: ' + _hours.get('Ellis Room', 'Mon, Tue, Wed and Fri, 10:30 am–4:30 pm') + '. Coffee, pool, conversation and a welcome for anyone who walks in.', [('The Ellis Room', 'ellis-room/')])
kb('ellis', 'When is the food pantry?', 'food pantry groceries food bank thursday hungry', 'Food pantry: ' + _hours.get('Food pantry', 'Thursdays, 1–4 pm') + '.', [('The Ellis Room', 'ellis-room/')])
for x in _mins:
    if x.get('title') in ('Food Pantry', 'The Ellis Room'): continue
    kb('ellis', 'What is %s?' % U(x.get('title')), U(x.get('title')), '%s (%s)' % (U(x.get('description')), U(x.get('when'))), [('The Ellis Room', 'ellis-room/')])
if _ew.get('Showers & hygiene') or _ew.get('Free haircuts'):
    kb('ellis', 'Can I get a shower or a haircut?', 'shower showers hygiene haircut haircuts barber', 'Showers & hygiene: ' + ', '.join(_ew.get('Showers & hygiene', [])) + '. Free haircuts: ' + (', '.join(_ew.get('Free haircuts', [])) or 'ask at the Ellis Room') + '.', [('The Ellis Room', 'ellis-room/')])
if _hours.get('Pop-Up Church'): kb('ellis', 'When is Pop-Up Church?', 'church sunday worship service pop-up', 'Pop-Up Church: ' + _hours['Pop-Up Church'] + '. Worship, a simple message and prayer, right on the sidewalk.', [('The Ellis Room', 'ellis-room/')])
for x in _events: kb('about', 'What is %s?' % U(x.get('title')), U(x.get('title')) + ' event', '%s (%s %s)' % (U(x.get('description')), U(x.get('when')), U(x.get('when_detail'))), [('News & Events', 'about/news/')])
kb('staff', 'How do I join staff?', 'join staff long term career work for ywam serve full time missionary', 'Three steps: complete a DTS (here or at any YWAM location), start a conversation with us about roles, timing and fit, then come and spend time on Ellis Street before you commit. Like all YWAM staff, our team raises personal support, and we’ll help you build yours.', [('Join staff', 'join-staff/'), L_MAIL])
kb('about', 'Who is YWAM San Francisco?', 'about who ywam youth with a mission history since mission vision values', 'We’ve been in San Francisco since 1987, with our first DTS in 1991 and our home on Ellis Street since the mid-1990s. Our mission: rooted in the way of Jesus, we seek to restore lives, form whole persons, and equip believers to be a compassionate and courageous presence in the world. We’re part of Youth With A Mission, a global, interdenominational Christian movement.', [('About us', 'about/')])
kb('about', 'Where are you located?', 'where address location find directions map parking visit', 'We’re at ' + U(ADDR) + ', ' + U(CITY) + ', in the Tenderloin, a few blocks from Union Square.', [('Contact & map', 'contact/')], ['where are you', 'where is', 'address', 'located', 'location', 'directions'])
kb('about', 'How do I contact you?', 'contact email phone call talk human person reach', 'Email ' + E + ' or call ' + PH + '. DTS questions: ' + DE + '. Volunteering: ' + VE + '. Teams: ' + OE + '.', [L_MAIL, L_CALL, ('Contact page', 'contact/')])
kb('about', 'Can I visit before I commit?', 'visit come see tour stop by before', 'Yes. The easiest way to see the place is to serve a volunteer shift on Ellis Street or come with a team. Email us to plan a visit.', [('Volunteer shifts', 'volunteer/'), L_MAIL])

KB_TOPICS = [('dts', 'Thinking about a DTS'), ('parents', 'I’m a parent'), ('volunteer', 'I want to volunteer'), ('teams', 'Churches & teams'), ('give', 'Giving'), ('ellis', 'The Ellis Room'), ('about', 'About & contact'), ('staff', 'Joining staff')]
_kb = {'topics': KB_TOPICS, 'items': KB, 'contact': {'email': E, 'phone': PH, 'tel': TEL}}
open(os.path.join(OUT, 'assets', 'chat-kb.js'), 'w').write('window.YWAM_KB=' + js(_kb) + ';')

print('built', V, VER, len(KB), 'chat answers')
