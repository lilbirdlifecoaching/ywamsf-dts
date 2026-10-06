/* YWAM SF refresh — animated Golden Gate scene with rolling fog.
   Pure SVG, recolored with CSS custom properties on the host element:
   --sc-sky1 --sc-sky2 --sc-hillfar --sc-hill --sc-hill2 --sc-water --sc-water2
   --sc-bridge --sc-shade --sc-dark --sc-fog --sc-line --sc-ground
   Usage: <div data-scene="flat|soft" data-focus="0.5"></div>  */
(function () {
  var G = '', uid = 0, W = 1600, H = 900, DECK = 505, TOP = 150, WATER = 596;
  var TX = [520, 1180];

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function f(n) { return Math.round(n * 10) / 10; }

  // quadratic cable helpers
  function quad(p0, c, p2, t) { return (1 - t) * (1 - t) * p0 + 2 * t * (1 - t) * c + t * t * p2; }

  function tower(x, flat) {
    var o = '', legW = 17, half = 30, topHalf = 26;
    var legs = [-1, 1];
    // legs (tapered) from pier to top
    legs.forEach(function (s) {
      var xb = x + s * half, xt = x + s * topHalf;
      var inB = xb - s * legW, inT = xt - s * (legW - 3);
      o += '<path class="b" d="M' + xb + ',' + WATER + ' L' + xt + ',' + TOP + ' L' + inT + ',' + TOP + ' L' + inB + ',' + WATER + 'Z"/>';
      // shaded inner face for depth
      var mB = xb - s * legW * 0.42, mT = xt - s * (legW - 3) * 0.42;
      o += '<path class="bs" d="M' + mB + ',' + WATER + ' L' + mT + ',' + TOP + ' L' + inT + ',' + TOP + ' L' + inB + ',' + WATER + 'Z"/>';
      // stepped ledges on the outer face at strut levels
      [255, 340, 425].forEach(function (y) {
        var k = (WATER - y) / (WATER - TOP), xo = xb + (xt - xb) * k;
        o += '<rect class="b" x="' + f(s > 0 ? xo - 1 : xo - 3) + '" y="' + (y - 14) + '" width="4" height="30"/>';
      });
      // crown
      o += '<rect class="b" x="' + f(Math.min(xt, inT) - 1) + '" y="' + (TOP - 14) + '" width="' + f(legW - 1) + '" height="16" rx="1"/>';
      o += '<rect class="b" x="' + f(Math.min(xt, inT) + 3) + '" y="' + (TOP - 22) + '" width="' + f(legW - 9) + '" height="10"/>';
    });
    // portal struts with art-deco recesses
    [[TOP + 6, 18], [255, 16], [340, 16], [425, 14], [560, 18]].forEach(function (s) {
      var y = s[0], h = s[1];
      o += '<rect class="b" x="' + (x - 22) + '" y="' + y + '" width="44" height="' + h + '"/>';
      o += '<rect class="bs" x="' + (x - 15) + '" y="' + (y + 4) + '" width="30" height="' + (h - 8) + '"/>';
      if (flat) o += '<rect class="b" x="' + (x - 2) + '" y="' + (y + 4) + '" width="4" height="' + (h - 8) + '"/>';
    });
    // pier
    o += '<path class="dk" d="M' + (x - 52) + ',' + (WATER + 22) + ' L' + (x - 46) + ',' + (WATER - 10) + ' L' + (x + 46) + ',' + (WATER - 10) + ' L' + (x + 52) + ',' + (WATER + 22) + 'Z"/>';
    o += '<rect class="b" x="' + (x - 48) + '" y="' + (WATER - 14) + '" width="96" height="6"/>';
    return o;
  }

  function cables() {
    var o = '', mid = (TX[0] + TX[1]) / 2, cy = (4 * 482 - 2 * (TOP + 8)) / 2, y0 = TOP + 8;
    // main span
    o += '<path class="cab" d="M' + TX[0] + ',' + y0 + ' Q' + mid + ',' + cy + ' ' + TX[1] + ',' + y0 + '"/>';
    var s = '';
    for (var x = TX[0] + 16; x < TX[1] - 8; x += 17) {
      var t = (x - TX[0]) / (TX[1] - TX[0]); var y = quad(y0, cy, y0, t);
      s += 'M' + x + ',' + f(y) + 'V' + (DECK - 6);
    }
    // side spans
    [[TX[0], 120], [TX[1], 1480]].forEach(function (p) {
      var ax = p[1], ay = DECK - 12, cxp = (p[0] + ax) / 2, cyp = (y0 + ay) / 2 + 46;
      o += '<path class="cab" d="M' + p[0] + ',' + y0 + ' Q' + cxp + ',' + cyp + ' ' + ax + ',' + ay + '"/>';
      var dir = ax > p[0] ? 1 : -1;
      for (var x2 = p[0] + dir * 16; dir > 0 ? x2 < ax - 6 : x2 > ax + 6; x2 += dir * 17) {
        var t2 = (x2 - p[0]) / (ax - p[0]); var y2 = quad(y0, cyp, ay, t2);
        if (DECK - 6 - y2 > 3) s += 'M' + x2 + ',' + f(y2) + 'V' + (DECK - 6);
      }
    });
    o += '<path class="hang" d="' + s + '"/>';
    return o;
  }

  function deck(flat) {
    var o = '';
    // anchorage blocks + approach piers
    [120, 1480].forEach(function (x) {
      o += '<path class="dk" d="M' + (x - 34) + ',' + (WATER + 30) + ' L' + (x - 28) + ',' + (DECK - 16) + ' L' + (x + 28) + ',' + (DECK - 16) + ' L' + (x + 34) + ',' + (WATER + 30) + 'Z"/>';
      o += '<rect class="b" x="' + (x - 30) + '" y="' + (DECK - 20) + '" width="60" height="8"/>';
    });
    [300, 1360, 30, 1570].forEach(function (x) { o += '<rect class="dk" x="' + (x - 7) + '" y="' + DECK + '" width="14" height="' + (WATER + 20 - DECK) + '"/>'; });
    // truss under deck
    o += '<rect class="dk" x="-20" y="' + (DECK + 7) + '" width="1640" height="22"/>';
    if (flat) {
      var p = '';
      for (var x = -20; x < 1620; x += 26) p += 'M' + x + ',' + (DECK + 9) + 'L' + (x + 13) + ',' + (DECK + 27) + 'L' + (x + 26) + ',' + (DECK + 9);
      o += '<path class="truss" d="' + p + '"/>';
    }
    // roadway + rail
    o += '<rect class="b" x="-20" y="' + (DECK - 6) + '" width="1640" height="14"/>';
    o += '<rect class="bs" x="-20" y="' + (DECK + 4) + '" width="1640" height="4"/>';
    o += '<path class="rail" d="M-20,' + (DECK - 9) + 'H1620"/>';
    // lamps
    var l = '';
    for (var x3 = 40; x3 < 1600; x3 += 92) l += 'M' + x3 + ',' + (DECK - 6) + 'V' + (DECK - 22) + 'h5';
    o += '<path class="lamp" d="' + l + '"/>';
    return o;
  }

  function hills() {
    var o = '';
    o += '<path class="hf" d="M0,500 C120,440 250,410 380,425 C500,440 600,490 700,520 L700,600 L0,600Z"/>';
    o += '<path class="hf" d="M860,520 C1000,420 1150,370 1320,380 C1450,390 1540,430 1600,450 L1600,600 L860,600Z" opacity=".8"/>';
    o += '<path class="h1" d="M720,604 C820,540 940,455 1080,425 C1220,398 1340,425 1450,472 C1520,502 1570,522 1600,532 L1600,604Z"/>';
    o += '<path class="h2" d="M960,505 C1040,460 1120,435 1200,432 C1160,455 1100,485 1040,510Z M1250,430 C1330,425 1410,450 1470,485 C1400,475 1330,460 1260,457Z M840,585 C890,560 950,540 1000,532 C960,556 910,578 860,594Z"/>';
    o += '<path class="h1" d="M0,604 L0,566 C70,556 150,552 240,560 C300,566 350,580 400,604Z"/>';
    return o;
  }

  function fogLayer(r, opt, flat) {
    // returns markup for one tile [0..1600]; caller duplicates at +1600
    var o = '';
    if (flat) {
      for (var i = 0; i < opt.n; i++) {
        var w = 160 + r() * 420, h = opt.h0 + r() * opt.h1, x = r() * W, y = opt.y + (r() - .5) * opt.spread;
        o += '<rect x="' + f(x - w / 2) + '" y="' + f(y - h / 2) + '" width="' + f(w) + '" height="' + f(h) + '" rx="' + f(h / 2) + '"/>';
        if (r() < .45) { var cr = h * (0.9 + r() * .8); o += '<circle cx="' + f(x - w * (r() * .3)) + '" cy="' + f(y - h / 2) + '" r="' + f(cr) + '"/>'; }
      }
    } else {
      for (var j = 0; j < opt.n; j++) {
        var rx = 120 + r() * 260, ry = opt.h0 + r() * opt.h1, cx = r() * W, cy = opt.y + (r() - .5) * opt.spread;
        o += '<ellipse cx="' + f(cx) + '" cy="' + f(cy) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="url(#' + G + 'fogG)"/>';
      }
    }
    return o;
  }
  function fogGroup(seed, opt, flat, cls) {
    var tile = fogLayer(rng(seed), opt, flat);
    return '<g class="fog ' + cls + '" style="animation-duration:' + opt.dur + 's;opacity:' + opt.op + '"><g class="bob"><g>' + tile + '</g><g transform="translate(1600 0)">' + tile + '</g></g></g>';
  }

  function water(flat, r) {
    var o = '<rect class="w" x="0" y="' + WATER + '" width="1600" height="' + (1600 - WATER) + '"/>';
    var s = '';
    for (var i = 0; i < 70; i++) {
      var y = WATER + 14 + Math.pow(r(), 1.3) * (H - WATER - 20), w = 30 + r() * (flat ? 260 : 120) * (0.4 + (y - WATER) / (H - WATER));
      var x = r() * W;
      s += 'M' + f(x) + ',' + f(y) + 'h' + f(w);
    }
    o += '<g class="shimmer"><path class="wl" d="' + s + '"/><path class="wl" transform="translate(1600 0)" d="' + s + '"/></g>';
    // bridge reflection / shadow stripe
    o += '<path class="w2" d="M' + (TX[1] - 40) + ',' + (WATER + 26) + ' L' + (TX[1] + 40) + ',' + (WATER + 26) + ' L' + (TX[1] + 110) + ',900 L' + (TX[1] - 10) + ',900Z" opacity=".55"/>';
    o += '<path class="w2" d="M' + (TX[0] - 40) + ',' + (WATER + 26) + ' L' + (TX[0] + 40) + ',' + (WATER + 26) + ' L' + (TX[0] + 110) + ',900 L' + (TX[0] - 10) + ',900Z" opacity=".55"/>';
    return o;
  }

  function sky(flat, r) {
    var o = '<rect x="0" y="-700" width="1600" height="700" style="fill:var(--sc-sky1)"/><rect x="0" y="0" width="1600" height="' + (WATER + 4) + '" fill="url(#' + G + 'skyG)"/>';
    // high wisps, slow
    var w = '';
    for (var i = 0; i < 7; i++) {
      var x = r() * W, y = 40 + r() * 230, len = 180 + r() * 380, h = flat ? 10 + r() * 16 : 18 + r() * 26;
      w += flat ? '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(len) + '" height="' + f(h) + '" rx="' + f(h / 2) + '"/>'
                : '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(len / 2) + '" ry="' + f(h) + '" fill="url(#' + G + 'fogG)"/>';
    }
    o += '<g class="wisps" style="animation-duration:240s"><g>' + w + '</g><g transform="translate(1600 0)">' + w + '</g></g>';
    return o;
  }

  function gulls() {
    var g = '';
    [[300, 150, 1], [345, 175, .8], [1350, 110, .9]].forEach(function (p, i) {
      g += '<g class="gull" style="animation-delay:' + (-i * 3) + 's"><g transform="translate(' + p[0] + ' ' + p[1] + ') scale(' + p[2] + ')"><path class="gl" d="M-12,0 Q-6,-7 0,0 Q6,-7 12,0"/></g></g>';
    });
    return g;
  }

  function boat() {
    return '<g class="boat"><g transform="translate(0 ' + (WATER + 70) + ')"><path class="dk" d="M-26,0 L26,0 L18,9 L-18,9Z"/><path class="sail" d="M-2,-2 L-2,-44 L20,-4Z"/><path class="sail2" d="M-6,-2 L-6,-32 L-22,-4Z"/></g></g>';
  }

  function foreground(flat) {
    if (!flat) return '';
    return '<path class="dk" d="M0,900 L0,760 C40,745 70,730 110,738 C130,712 160,705 185,722 C210,700 245,708 255,735 C290,740 320,770 340,800 C380,840 420,880 470,900Z"/>' +
      '<path class="dk" d="M1600,900 L1600,800 C1560,790 1530,805 1500,830 C1470,850 1440,880 1420,900Z"/>';
  }

  function build(el) {
    G = 's' + (++uid);
    var flat = (el.getAttribute('data-scene') || 'soft') === 'flat';
    var r = rng(7);
    var defs = '<defs>' +
      '<linearGradient id="' + G + 'skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sc-sky1)"/><stop offset="1" style="stop-color:var(--sc-sky2)"/></linearGradient>' +
      '<radialGradient id="' + G + 'fogG"><stop offset="0" style="stop-color:var(--sc-fog);stop-opacity:.95"/><stop offset=".55" style="stop-color:var(--sc-fog);stop-opacity:.55"/><stop offset="1" style="stop-color:var(--sc-fog);stop-opacity:0"/></radialGradient>' +
      '</defs>';
    var backFog = flat ? { n: 16, y: 535, spread: 70, h0: 14, h1: 22, dur: 150, op: .9 } : { n: 26, y: 540, spread: 70, h0: 34, h1: 44, dur: 170, op: .8 };
    var lowFog = flat ? { n: 13, y: 592, spread: 110, h0: 12, h1: 24, dur: 95, op: 1 } : { n: 46, y: 585, spread: 100, h0: 26, h1: 44, dur: 110, op: 1 };
    var frontFog = flat ? { n: 12, y: 470, spread: 60, h0: 12, h1: 18, dur: 70, op: .95 } : { n: 22, y: 490, spread: 80, h0: 30, h1: 40, dur: 80, op: .7 };
    var floorFog = flat ? { n: 14, y: 700, spread: 80, h0: 14, h1: 22, dur: 120, op: .6 } : { n: 22, y: 690, spread: 100, h0: 40, h1: 50, dur: 140, op: .5 };
    var svg = '<svg class="scene-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' + defs +
      sky(flat, r) + gulls() + hills() +
      fogGroup(11, backFog, flat, 'f-back') +
      water(flat, r) + boat() +
      '<g class="bridge">' + deck(flat) + cables() + tower(TX[0], flat) + tower(TX[1], flat) + '</g>' +
      fogGroup(23, lowFog, flat, 'f-low') +
      fogGroup(31, frontFog, flat, 'f-front') +
      fogGroup(47, floorFog, flat, 'f-floor') +
      foreground(flat) +
      '</svg>';
    el.insertAdjacentHTML('afterbegin', svg);
    el.classList.add('scene', flat ? 'scene-flat' : 'scene-soft');
    var s = el.querySelector('svg');
    function fit() {
      var w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      var a = w / h, focus = parseFloat(el.getAttribute('data-focus') || '0.72');
      if (a < W / H) { // narrow: crop sides around focus point
        var vw = Math.max(H * a, 420), x0 = Math.min(Math.max(focus * W - vw / 2, 0), W - vw);
        var anc = parseFloat(el.getAttribute('data-anchor-m') || el.getAttribute('data-anchor') || 0.58), vh = vw / a, y0 = Math.min(Math.max(DECK - vh * anc, -700), 1600 - vh);
        s.setAttribute('viewBox', f(x0) + ' ' + f(y0) + ' ' + f(vw) + ' ' + f(vh));
        s.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      } else { // wide: crop top/bottom, keep tower tops
        var vh2 = W / a, yy = Math.min(Math.max(TOP - 60 - (vh2 * 0.06), 0), Math.max(H - vh2, 0));
        if (parseFloat(el.getAttribute('data-anchor') || 0)) yy = Math.min(Math.max(DECK - vh2 * parseFloat(el.getAttribute('data-anchor')), -700), 1600 - vh2);
        s.setAttribute('viewBox', '0 ' + f(yy) + ' 1600 ' + f(vh2));
        s.setAttribute('preserveAspectRatio', 'none');
      }
    }
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(el); else addEventListener('resize', fit);
    // pause animation when off-screen
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { es.forEach(function (e) { el.classList.toggle('paused', !e.isIntersecting); }); }).observe(el);
  }

  var css = '.scene{position:relative;overflow:hidden;background:var(--sc-sky1)}' +
    '.scene-svg{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '.scene .b{fill:var(--sc-bridge)}.scene .bs{fill:var(--sc-shade)}.scene .dk{fill:var(--sc-dark)}' +
    '.scene .cab{fill:none;stroke:var(--sc-bridge);stroke-width:4.5;stroke-linecap:round}' +
    '.scene .hang{fill:none;stroke:var(--sc-bridge);stroke-width:1.3;opacity:.9}' +
    '.scene .truss{fill:none;stroke:var(--sc-bridge);stroke-width:2.2;opacity:.85}' +
    '.scene .rail{fill:none;stroke:var(--sc-bridge);stroke-width:2}.scene .lamp{fill:none;stroke:var(--sc-dark);stroke-width:2}' +
    '.scene .hf{fill:var(--sc-hillfar)}.scene .h1{fill:var(--sc-hill)}.scene .h2{fill:var(--sc-hill2)}' +
    '.scene .w{fill:var(--sc-water)}.scene .w2{fill:var(--sc-water2)}.scene .wl{fill:none;stroke:var(--sc-line);stroke-width:2.2;stroke-linecap:round;opacity:.55}' +
    '.scene-flat .wl{stroke-width:3;opacity:.7}' +
    '.scene .fog rect,.scene .fog circle,.scene .wisps rect{fill:var(--sc-fog)}' +
    '.scene .wisps{opacity:.75}.scene-flat .wisps{opacity:.9}' +
    '.scene .sail{fill:var(--sc-fog)}.scene .sail2{fill:var(--sc-bridge)}' +
    '.scene .gl{fill:none;stroke:var(--sc-dark);stroke-width:2.4;stroke-linecap:round}' +
    '.scene .fog,.scene .wisps,.scene .shimmer{animation:scDrift linear infinite}' +
    '.scene .bob{animation:scBob 14s ease-in-out infinite alternate}' +
    '.scene .shimmer{animation-duration:120s}' +
    '.scene .boat{animation:scBoat 95s linear infinite}' +
    '.scene .gull{animation:scGull 26s ease-in-out infinite alternate}.scene .gull path{animation:scFlap 1.6s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:center}' +
    '@keyframes scDrift{from{transform:translateX(0)}to{transform:translateX(-1600px)}}' +
    '@keyframes scBob{from{transform:translateY(-5px)}to{transform:translateY(6px)}}' +
    '@keyframes scBoat{from{transform:translateX(1700px)}to{transform:translateX(-100px)}}' +
    '@keyframes scGull{from{transform:translate(0,0)}to{transform:translate(90px,-24px)}}' +
    '@keyframes scFlap{from{transform:scaleY(1)}to{transform:scaleY(.55)}}' +
    '.scene.paused *{animation-play-state:paused!important}' +
    '@media (prefers-reduced-motion:reduce){.scene *{animation:none!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function init() { document.querySelectorAll('[data-scene]').forEach(build); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
