/* YWAM SF refresh — a side-on cable car that carries the next DTS dates across the page.
   Built from the creative director's poster car (assets/cablecar/car-side.webp + wheel.webp).
   Markup: <div data-cablecar data-panels="NEXT|DTS|JAN|18|→|JUN|4|2027" data-board="YWAM San Francisco · Next DTS"
                data-flag="Now boarding · Apply for January" data-href="..."></div>
   Colors (CSS vars): --cc-road --cc-rail --cc-flag --cc-flag-ink --cc-flag-edge --cc-panel-ink --cc-panel-num */
(function () {
  var here = (document.currentScript && document.currentScript.src) || '';
  var DIR = here ? here.replace(/[^\/]*$/, '') + 'cablecar/' : 'cablecar/';
  // geometry of car-side.webp (pixels)
  var IW = 2136, IH = 800, R = 44;
  var WHEELS = [[430, 742], [610, 742], [1510, 742], [1690, 742]];
  var BOARD = [574, 101, 1548, 139];
  var PLATES = [[896, 490, 1060, 550], [1600, 490, 1764, 550]];
  var BAND = [884, 594, 1792, 660];
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pct(v, of) { return (v / of * 100).toFixed(3) + '%'; }
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function mount(el) {
    var plates = (el.getAttribute('data-plates') || 'JAN 18|JUN 4').split('|');
    var board = el.getAttribute('data-board') || 'YWAM San Francisco · Next DTS';
    var band = el.getAttribute('data-band') || 'Tenderloin → the nations · 2027';
    var flag = el.getAttribute('data-flag') || 'Now boarding · Apply for January';
    var href = el.getAttribute('data-href') || '#';
    var label = el.getAttribute('aria-label') || ('Next DTS: ' + plates.join(' to '));
    el.classList.add('cc');
    function box(b, cls, html) { return '<span class="' + cls + '" style="left:' + pct(b[0], IW) + ';top:' + pct(b[1], IH) + ';width:' + pct(b[2] - b[0], IW) + ';height:' + pct(b[3] - b[1], IH) + '">' + html + '</span>'; }
    var panels = PLATES.map(function (b, i) { var t = (plates[i] || '').split(' '); return box(b, 'cc-plate', '<small>' + esc(t[0] || '') + '</small><b>' + esc(t.slice(1).join(' ')) + '</b>'); }).join('') +
      box(BAND, 'cc-band', esc(band));
    var wheels = WHEELS.map(function (w) {
      return '<img class="cc-w" src="' + DIR + 'wheel.webp" alt="" draggable="false" style="left:' + pct(w[0] - R, IW) + ';top:' + pct(w[1] - R, IH) + ';width:' + pct(2 * R, IW) + '">';
    }).join('');
    el.innerHTML =
      '<div class="cc-street" aria-hidden="true"><i class="cc-rail a"></i><i class="cc-slot"></i><i class="cc-rail b"></i></div>' +
      '<a class="cc-car" href="' + esc(href) + '" aria-label="' + esc(label) + '">' +
        '<span class="cc-banner" aria-hidden="true"><span class="cc-flag">' + esc(flag) + '</span><span class="cc-rope"></span></span>' +
        wheels +
        '<span class="cc-body">' +
          '<img class="cc-img" src="' + DIR + 'car-side.webp" alt="" draggable="false">' +
          box(BOARD, 'cc-board', esc(board)) +
          panels +
          '<span class="cc-ding" aria-hidden="true"><i></i><i></i></span>' +
        '</span>' +
      '</a>';
    var car = el.querySelector('.cc-car'), body = el.querySelector('.cc-body'), ws = [].slice.call(el.querySelectorAll('.cc-w'));
    var W, H, ch, cw, rpx, xStart, xMid, xEnd;
    function layout() {
      W = el.clientWidth; H = el.clientHeight;
      ch = Math.min(H * 0.74, (W - 32) * IH / IW); cw = ch * IW / IH; rpx = R / IH * ch;
      car.style.height = ch + 'px'; car.style.width = cw + 'px';
      el.style.setProperty('--ch', ch + 'px');
      var bannerW = (el.querySelector('.cc-banner').offsetWidth || 0);
      xStart = -cw - bannerW - 20; xMid = (W - cw) / 2; xEnd = W + 20;
    }
    // timeline (seconds): roll in, dwell, roll out, rest
    var T_IN = 5.2, T_DWELL = 4.6, T_OUT = 5.2, T_REST = 1.6, T = T_IN + T_DWELL + T_OUT + T_REST;
    var t = reduce ? T_IN + 1 : 0, last = 0, running = false, hover = false, visible = true;
    function posAt(tt) {
      if (tt < T_IN) return xStart + (xMid - xStart) * (1 - Math.pow(1 - tt / T_IN, 3));
      if (tt < T_IN + T_DWELL) return xMid;
      if (tt < T_IN + T_DWELL + T_OUT) { var k = (tt - T_IN - T_DWELL) / T_OUT; return xMid + (xEnd - xMid) * Math.pow(k, 2.4); }
      return xEnd;
    }
    function draw() {
      var x = posAt(t), moving = t < T_IN - 0.15 || (t > T_IN + T_DWELL && t < T_IN + T_DWELL + T_OUT);
      car.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
      var ang = (x - xStart) / rpx * 180 / Math.PI;
      ws.forEach(function (w) { w.style.transform = 'rotate(' + ang.toFixed(1) + 'deg)'; });
      body.style.transform = moving ? 'translateY(' + (Math.sin(t * 22) * 1.1).toFixed(2) + 'px)' : 'none';
      var dingOn = t > T_IN + 0.3 && t < T_IN + 1.6 && ((t * 4) % 1) < 0.55;
      el.classList.toggle('cc-dinging', dingOn);
    }
    function frame(now) {
      if (!running) return;
      var dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
      if (!hover && !reduce) { t += dt; if (t >= T) t = 0; }
      draw(); requestAnimationFrame(frame);
    }
    function start() { if (!running && visible) { running = true; last = 0; requestAnimationFrame(frame); } }
    el.addEventListener('mouseenter', function () { hover = true; });
    el.addEventListener('mouseleave', function () { hover = false; });
    layout(); draw();
    if (window.ResizeObserver) new ResizeObserver(function () { layout(); draw(); }).observe(el); else addEventListener('resize', function () { layout(); draw(); });
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { es.forEach(function (e) { visible = e.isIntersecting; if (visible) start(); else running = false; }); }).observe(el);
    else start();
  }

  var css =
  '.cc{position:relative;height:var(--cc-h,390px);overflow:hidden}' +
  '.cc-street{position:absolute;left:0;right:0;bottom:0;height:13%;background:var(--cc-road,#465361)}' +
  '.cc-street:before{content:"";position:absolute;left:0;right:0;top:0;height:5px;background:rgba(255,255,255,.16)}' +
  '.cc-rail{position:absolute;left:0;right:0;height:3px;background:var(--cc-rail,#EAEDF0);opacity:.7}.cc-rail.a{top:22%}.cc-rail.b{top:72%}' +
  '.cc-slot{position:absolute;left:0;right:0;top:47%;height:2px;opacity:.4;background:repeating-linear-gradient(90deg,var(--cc-rail,#EAEDF0) 0 22px,transparent 22px 34px)}' +
  '.cc-car{position:absolute;left:0;bottom:calc(13% - var(--ch) * .03);display:block;text-decoration:none;color:inherit;will-change:transform;outline-offset:6px}' +
  '.cc-body{position:absolute;inset:0}' +
  '.cc-img{position:absolute;inset:0;width:100%;height:100%;display:block;filter:drop-shadow(0 10px 8px rgba(20,30,50,.2))}' +
  '.cc-w{position:absolute;height:auto;aspect-ratio:1;will-change:transform}' +
  '.cc-board{position:absolute;display:grid;place-items:center;background:linear-gradient(#4a1c28,#3b1623);color:#E8C76E;border-radius:2px;font:600 calc(var(--ch) * .042)/1 Georgia,"Times New Roman",serif;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;overflow:hidden}' +
  '.cc-plate{position:absolute;display:flex;align-items:baseline;justify-content:center;gap:.3em;background:#cbb245;color:#8E6A24;white-space:nowrap;border-radius:3px}' +
  '.cc-plate small{font:700 calc(var(--ch) * .042)/1 Georgia,serif;letter-spacing:.06em}' +
  '.cc-plate b{font:700 calc(var(--ch) * .062)/1 Georgia,serif}' +
  '.cc-band{position:absolute;display:grid;place-items:center;background:#dde9f4;color:#2A2E38;font:600 calc(var(--ch) * .046)/1 var(--label,system-ui);letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;overflow:hidden}' +
  '.cc-ding{position:absolute;left:47.5%;top:-3%;width:5%;height:4%}' +
  '.cc-ding i{position:absolute;top:30%;width:calc(var(--ch) * .05);height:2px;border-radius:2px;background:var(--cc-panel-num,#9A1E14);opacity:0;transition:opacity .08s}' +
  '.cc-ding i:first-child{right:115%;transform:rotate(-24deg)}.cc-ding i:last-child{left:115%;transform:rotate(24deg)}' +
  '.cc-dinging .cc-ding i{opacity:1}' +
  '.cc-banner{position:absolute;right:99%;top:40%;display:flex;align-items:center;transform-origin:100% 50%;animation:ccFlap 1.3s ease-in-out infinite alternate}' +
  '.cc-rope{width:calc(var(--ch) * .12);height:2px;background:var(--cc-flag-edge,#9A1E14);opacity:.8}' +
  '.cc-flag{padding:.8em 1.3em .8em 1.5em;background:var(--cc-flag,#F7F2E6);color:var(--cc-flag-ink,#1E2A4B);font:800 calc(var(--ch) * .042)/1 var(--label,system-ui);letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;border-top:3px solid var(--cc-flag-edge,#9A1E14);border-bottom:3px solid var(--cc-flag-edge,#9A1E14);clip-path:polygon(0 0,100% 0,100% 100%,0 100%,5% 50%);box-shadow:0 8px 16px -10px rgba(0,0,0,.4)}' +
  '.cc-car:hover .cc-flag,.cc-car:focus-visible .cc-flag{background:var(--cc-flag-edge,#9A1E14);color:#fff}' +
  '@keyframes ccFlap{from{transform:rotate(-1.4deg) skewY(-.8deg)}to{transform:rotate(1.4deg) skewY(.8deg)}}' +
  '@media (max-width:640px){.cc{--cc-h:230px}.cc-banner{display:none}}' +
  '@media (prefers-reduced-motion:reduce){.cc-banner{animation:none}}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  function init() { document.querySelectorAll('[data-cablecar]').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
