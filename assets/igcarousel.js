/* YWAM SF refresh — bridge carousel built from the creative director's artwork.
   The bridge is the original illustration (assets/carousel/bridge.webp, cards removed, transparent paper).
   Cards sit in the artwork's seven exact positions and glide between them.
   Markup: <div class="ig-stage" data-ig></div>
   Content: window.YWAM_IG_POSTS = [{img, caption, href}]  — defaults to the seven photos from the artwork.
            window.YWAM_IG_SOURCE = 'instagram' swaps in recent YWAM SF images instead.            */
(function () {
  var here = (document.currentScript && document.currentScript.src) || '';
  var BASE = here ? here.replace(/[^\/]*$/, '') + 'carousel/' : 'carousel/';
  var IW = 1774, IH = 887, BW = 480, BH = 576;
  // corner positions (TL, TR, BR, BL) of each card in the artwork, in artwork pixels
  var SLOTS = [
    [[122, 309], [300, 272], [300, 625], [122, 598]],
    [[310, 320], [490, 294], [490, 632], [310, 607]],
    [[502, 292], [705, 272], [705, 623], [502, 600]],
    [[721, 237], [1052, 237], [1052, 636], [721, 636]],
    [[1069, 272], [1271, 292], [1271, 600], [1069, 623]],
    [[1284, 294], [1464, 320], [1464, 607], [1284, 632]],
    [[1473, 272], [1651, 309], [1651, 598], [1473, 625]]
  ];
  var CENTER = 3, NS = SLOTS.length;
  function extrap(a, b, k) { return a.map(function (p, i) { return [p[0] + (p[0] - b[i][0]) * k, p[1] + (p[1] - b[i][1]) * k]; }); }
  var VLEFT = extrap(SLOTS[0], SLOTS[1], 0.9), VRIGHT = extrap(SLOTS[NS - 1], SLOTS[NS - 2], 0.9);

  var PROFILE = 'https://www.instagram.com/ywamsf/';
  var CDN = 'https://images.squarespace-cdn.com/content/v1/56e87b56d51cd42c04a4fd37/';
  function artworkPosts() {
    var a = [];
    for (var r = 0; r < 2; r++) for (var i = 1; i <= 7; i++) a.push({ img: BASE + 'photo' + i + '.jpg', caption: '', href: PROFILE });
    return a;
  }
  function instagramPosts() {
    return [
      ['1771366341447-7MIV5OVDBE35181IZ7D8/image-asset.jpeg', 'When it rains in the Tenderloin, the Ellis Room barely closes.'],
      ['4ddbffe2-014d-4194-a26e-e5fba257edad/Community%2520Lunch_VSCO.jpg', 'Community lunch — one long table, everyone welcome.'],
      ['1766710261599-3RJVQTYVZHFWL6GK280D/image-asset.jpeg', 'Christmas Day lunch: 209 of our neighbors served.'],
      ['1767778466252-U9HEDNEUX7JRPHIDTQR6/image-asset.jpeg', 'DTS: a season where Jesus shapes your heart and sends you out.'],
      ['3aac1bb8-94e7-49d4-be92-e9dad686c355/MKMR8140.jpg', 'Packed and sent — outreach teams heading to the cities of the world.'],
      ['1770318794175-4VCIPMH2PCKUT82R229Z/image-asset.jpeg', 'Tim & Karol — 18 years of faithful leadership.'],
      ['1779917437619-RYYYTGIULLW693NTZRZI/image-asset.jpeg', 'Morning on Ellis Street.'],
      ['1766567952786-QPICPYUWHEXT8ZH6U7TP/image-asset.jpeg', 'DTS is an open door.'],
      ['1769593256040-0U6YPD4NR114UECZ4YAA/image-asset.jpeg', 'Where profit and purpose meet.'],
      ['1765359753745-AHQHPSR7FQ6M0RH719N0/image-asset.jpeg', 'Serve people with excellence.']
    ].map(function (p) { return { img: CDN + p[0] + '?format=750w', caption: p[1], href: PROFILE }; });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // homography mapping the card rectangle onto a quad -> CSS matrix3d
  function matrix3d(q) {
    var src = [[0, 0], [BW, 0], [BW, BH], [0, BH]], A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], u = q[i][0], v = q[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (var c = 0; c < 8; c++) { // gaussian elimination
      var piv = c; for (var r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      var t = A[c]; A[c] = A[piv]; A[piv] = t; t = b[c]; b[c] = b[piv]; b[piv] = t;
      for (var r2 = 0; r2 < 8; r2++) if (r2 !== c) { var f = A[r2][c] / A[c][c]; for (var k = c; k < 8; k++) A[r2][k] -= f * A[c][k]; b[r2] -= f * b[c]; }
    }
    var h = b.map(function (v, i) { return v / A[i][i]; });
    return 'matrix3d(' + [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1].map(function (v) { return +v.toFixed(8); }).join(',') + ')';
  }
  function lerpQ(a, b, t) { return a.map(function (p, i) { return [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]; }); }
  function quadAt(e) { // e: -1 .. NS (fractional slot position)
    if (e < 0) return lerpQ(VLEFT, SLOTS[0], e + 1);
    if (e > NS - 1) return lerpQ(SLOTS[NS - 1], VRIGHT, e - (NS - 1));
    var i = Math.floor(e), f = e - i; return i >= NS - 1 ? SLOTS[NS - 1] : lerpQ(SLOTS[i], SLOTS[i + 1], f);
  }

  function mount(stage) {
    var posts = window.YWAM_IG_POSTS || (window.YWAM_IG_SOURCE === 'instagram' ? instagramPosts() : artworkPosts());
    stage.innerHTML = '<div class="ig-plate" aria-hidden="true"></div><div class="ig-track" role="list"></div>' +
      '<div class="ig-nav"><button type="button" class="ig-prev" aria-label="Previous">←</button><button type="button" class="ig-next" aria-label="Next">→</button></div>';
    var plate = stage.querySelector('.ig-plate'), track = stage.querySelector('.ig-track');
    plate.style.backgroundImage = 'url("' + BASE + 'bridge.webp")';
    var cards = posts.map(function (p) {
      var a = document.createElement('a');
      a.className = 'ig-card'; a.href = p.href || PROFILE; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('role', 'listitem');
      a.style.width = BW + 'px'; a.style.height = BH + 'px';
      a.innerHTML = '<img src="' + esc(p.img) + '" alt="' + esc(p.caption || 'Photo from YWAM San Francisco') + '" draggable="false" decoding="async">' +
        (p.caption ? '<span class="ig-cap"><b>@ywamsf</b>' + esc(p.caption) + '</span>' : '');
      track.appendChild(a); return a;
    });
    var N = cards.length;
    var s = 1, ox = 0, oy = 0, pos = 0, target = 0, drag = null, hover = false, last = 0, running = false, visible = true, timer = 0;

    function layout() {
      var W = stage.clientWidth, H;
      if (W >= 760) {            // desktop: the artwork edge to edge, trimming empty paper above and below
        s = W / IW; H = (IH - 215) * s; ox = 0; oy = -70 * s;
      } else {                   // phones: zoom toward the centre cards
        H = Math.max(W * 0.78, 300); s = H / (IH * 0.56); ox = (W - IW * s) / 2; oy = (H - IH * s) / 2 - 12 * s;
      }
      stage.style.height = H + 'px';
      plate.style.cssText += ';left:' + ox + 'px;top:' + oy + 'px;width:' + IW * s + 'px;height:' + IH * s + 'px';
      render();
    }
    function toStage(q) { return q.map(function (p) { return [ox + p[0] * s, oy + p[1] * s]; }); }
    function render() {
      for (var i = 0; i < N; i++) {
        var d = ((i - pos) % N + N) % N, e = d > N - 1.5 ? d - N : d, c = cards[i];
        if (e < -1 || e > NS) { if (c._v !== 0) { c.style.visibility = 'hidden'; c._v = 0; } continue; }
        if (c._v !== 1) { c.style.visibility = 'visible'; c._v = 1; }
        c.style.transform = matrix3d(toStage(quadAt(e)));
        c.style.opacity = e < 0 ? Math.max(0, 1 + e) : e > NS - 1 ? Math.max(0, NS - e) : 1;
        c.style.zIndex = 100 - Math.round(Math.abs(e - CENTER) * 10);
        var isC = Math.abs(e - CENTER) < 0.5; c.classList.toggle('is-center', isC); c.tabIndex = isC ? 0 : -1;
      }
    }
    function frame(t) {
      if (!running) return;
      var dt = Math.min((t - (last || t)) / 1000, 0.05); last = t;
      if (!drag) {
        var diff = target - pos;
        if (Math.abs(diff) > 0.0008) { pos += diff * Math.min(1, dt * 4.2); render(); }
        else if (pos !== target) { pos = target; render(); }
        if (!hover && !reduce) { timer += dt; if (timer > 3.8) { timer = 0; target += 1; } }
      }
      requestAnimationFrame(frame);
    }
    function start() { if (!running && visible) { running = true; last = 0; requestAnimationFrame(frame); } }
    function go(dir) { target = Math.round(target) + dir; timer = 0; }

    stage.addEventListener('mouseenter', function () { hover = true; });
    stage.addEventListener('mouseleave', function () { hover = false; timer = 0; });
    stage.addEventListener('pointerdown', function (e) { if (!e.target.closest('.ig-nav')) drag = { x: e.clientX, p: pos, moved: 0, lx: e.clientX, lt: performance.now(), v: 0 }; });
    addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x; drag.moved = Math.max(drag.moved, Math.abs(dx)); if (drag.moved < 4) return;
      var step = 200 * s; pos = drag.p - dx / step; render();
      var now = performance.now(), dtt = (now - drag.lt) / 1000; if (dtt > 0) drag.v = -(e.clientX - drag.lx) / step / dtt; drag.lx = e.clientX; drag.lt = now;
    });
    function end() { if (!drag) return; if (drag.moved >= 4) target = Math.round(pos + Math.max(-2, Math.min(2, drag.v * 0.2))); stage._moved = drag.moved; drag = null; timer = 0; }
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    stage.addEventListener('click', function (e) {
      if (stage._moved > 6) { e.preventDefault(); e.stopPropagation(); stage._moved = 0; return; }
      var card = e.target.closest('.ig-card');
      if (card && !card.classList.contains('is-center')) {
        e.preventDefault(); var i = cards.indexOf(card), d = ((i - target - CENTER) % N + N) % N; if (d > N / 2) d -= N; target += d; timer = 0;
      }
    }, true);
    stage.querySelector('.ig-prev').addEventListener('click', function () { go(-1); });
    stage.querySelector('.ig-next').addEventListener('click', function () { go(1); });
    stage.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });

    layout();
    if (window.ResizeObserver) new ResizeObserver(layout).observe(stage); else addEventListener('resize', layout);
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { es.forEach(function (en) { visible = en.isIntersecting; if (visible) start(); else running = false; }); }, { rootMargin: '100px' }).observe(stage);
    else start();
  }

  var css = '.ig-stage{position:relative;overflow:hidden;touch-action:pan-y;user-select:none;-webkit-user-select:none;outline:none}' +
    '.ig-plate{position:absolute;background:center/100% 100% no-repeat;pointer-events:none;z-index:1}' +
    '.ig-track{position:absolute;inset:0;z-index:2}' +
    '.ig-card{position:absolute;left:0;top:0;transform-origin:0 0;border-radius:19px;overflow:hidden;background:#e9e2d4;box-shadow:0 26px 40px -22px rgba(40,30,20,.45);will-change:transform,opacity;cursor:pointer;color:#fff;text-decoration:none;backface-visibility:hidden}' +
    '.ig-card img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}' +
    '.ig-cap{position:absolute;left:0;right:0;bottom:0;padding:70px 26px 22px;background:linear-gradient(transparent,rgba(0,0,0,.72));font:500 20px/1.4 var(--label,system-ui);opacity:0;transition:opacity .35s}' +
    '.ig-cap b{display:block;font-size:15px;letter-spacing:.06em;opacity:.85;margin-bottom:6px}' +
    '.ig-card.is-center:hover .ig-cap,.ig-card.is-center:focus-visible .ig-cap{opacity:1}' +
    '.ig-nav{position:absolute;left:50%;bottom:4%;transform:translateX(-50%);z-index:5;display:flex;gap:10px}' +
    '.ig-nav button{width:46px;height:46px;border-radius:50%;border:1px solid rgba(30,42,75,.18);background:rgba(255,255,255,.9);color:#1E2A4B;font:500 18px/1 var(--label,system-ui);cursor:pointer;transition:border-color .15s,color .15s}' +
    '.ig-nav button:hover{border-color:#D9413A;color:#D9413A}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  function init() { document.querySelectorAll('[data-ig]').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
