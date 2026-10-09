/* YWAM SF refresh — a side-on cable car that carries the next DTS dates across the page.
   Built from the creative director's poster car (assets/cablecar/car-side.webp + wheel.webp).
   Markup: <div data-cablecar data-panels="NEXT|DTS|JAN|18|→|JUN|4|2027" data-board="YWAM San Francisco · Next DTS"
                data-flag="Now boarding · Apply for January" data-href="..."></div>
   Colors (CSS vars): --cc-road --cc-rail --cc-flag --cc-flag-ink --cc-flag-edge --cc-panel-ink --cc-panel-num */
(function () {
  var here = (document.currentScript && document.currentScript.src) || '';
  var DIR = here ? here.replace(/[^\/]*$/, '') + 'cablecar/' : 'cablecar/';
  // geometry of car-55.webp (pixels): car #55 cut out of the painting, true side view
  var IW = 1300, IH = 493;
  // painted city from the car #55 painting: Golden Gate pinned right, Transamerica on the left, painted skyline repeating between
  var SKYLINE = '<div class="cc-sky" aria-hidden="true" style="background-image:url(\'' + DIR + 'city-right.webp\'),url(\'' + DIR + 'city-mid.webp\'),url(\'' + DIR + 'city-ta.webp\')"></div>';
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
    var cta = el.getAttribute('data-flag-cta') || '';
    var label = el.getAttribute('aria-label') || ('Next DTS: ' + plates.join(' to '));
    el.classList.add('cc');
    el.innerHTML =
      SKYLINE + '<div class="cc-street" aria-hidden="true"><i class="cc-rail a"></i><i class="cc-slot"></i><i class="cc-rail b"></i></div>' +
      '<a class="cc-car" href="' + esc(href) + '" aria-label="' + esc(label) + '">' +
        '<span class="cc-banner" aria-hidden="true"><span class="cc-flag">' + esc(flag) + (cta ? '<b>' + esc(cta) + '</b>' : '') + '</span><span class="cc-tow"><i></i><i></i></span></span>' +
        '<span class="cc-body">' +
          '<img class="cc-img" src="' + DIR + 'car-55.webp" alt="" draggable="false">' +
          '<span class="cc-ding" aria-hidden="true"><i></i><i></i></span>' +
        '</span>' +
      '</a>';
    var car = el.querySelector('.cc-car');
    var W, H, ch, cw, xStart, xMid, sky;
    function layout() {
      W = el.clientWidth; H = el.clientHeight;
      ch = Math.min(H * 0.74, (W - 32) * IH / IW, parseFloat(getComputedStyle(el).getPropertyValue('--cc-car-max')) || 1e9); cw = ch * IW / IH;
      car.style.height = ch + 'px'; car.style.width = cw + 'px';
      el.style.setProperty('--ch', ch + 'px');
      var flagEl = el.querySelector('.cc-flag'); if (flagEl) flagEl.style.maxWidth = Math.max(200, W - cw - ch * 0.1 - 48) + 'px';
      var bannerW = (el.querySelector('.cc-banner').offsetWidth || 0);
      xStart = -cw - bannerW - 20; xMid = Math.min(Math.max(W * 0.76 - cw / 2, bannerW + 24), W - cw - 16);
      sky = el.querySelector('.cc-sky');
    }
    // rolls in once when the strip comes into view, rings its bell, and stays where it lands (hover never pauses it)
    var T_IN = 7.5, t = reduce ? T_IN + 2 : 0, last = 0, running = false, visible = true;
    function easeOut(a) { return 1 - Math.pow(1 - a, 3); }
    function posAt(tt) { return tt < T_IN ? xStart + (xMid - xStart) * easeOut(tt / T_IN) : xMid; }
    function draw() {
      var x = posAt(t);
      car.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
      el.classList.toggle('cc-dinging', t > T_IN + 0.2 && t < T_IN + 1.5 && ((t * 4) % 1) < 0.55);
    }
    function frame(now) {
      if (!running) return;
      var dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
      t += dt; draw();
      if (t < T_IN + 1.6) requestAnimationFrame(frame); else running = false;
    }
    function start() { if (!running && visible && t < T_IN + 1.6) { running = true; last = 0; requestAnimationFrame(frame); } }
    layout(); draw();
    if (window.ResizeObserver) new ResizeObserver(function () { layout(); draw(); }).observe(el); else addEventListener('resize', function () { layout(); draw(); });
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { es.forEach(function (e) { visible = e.isIntersecting; if (visible) start(); }); }).observe(el);
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
  '.cc-img{position:absolute;inset:0;width:100%;height:100%;display:block;filter:drop-shadow(0 6px 5px rgba(20,30,50,.22))}' +
  '.cc-w{position:absolute;height:auto;aspect-ratio:1;will-change:transform}' +
  '.cc-board{position:absolute;display:grid;place-items:center;background:linear-gradient(#4a1c28,#3b1623);color:#E8C76E;border-radius:2px;font:600 calc(var(--ch) * .042)/1 Georgia,"Times New Roman",serif;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;overflow:hidden}' +
  '.cc-plate{position:absolute;display:flex;align-items:baseline;justify-content:center;gap:.3em;background:#cbb245;color:#8E6A24;white-space:nowrap;border-radius:3px}' +
  '.cc-plate small{font:700 calc(var(--ch) * .042)/1 Georgia,serif;letter-spacing:.06em}' +
  '.cc-plate b{font:700 calc(var(--ch) * .062)/1 Georgia,serif}' +
  '.cc-band{position:absolute;display:grid;place-items:center;background:#dde9f4;color:#2A2E38;font:600 calc(var(--ch) * .046)/1 var(--label,system-ui);letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;overflow:hidden}' +
  '.cc-ding{position:absolute;left:36.5%;top:-6%;width:5%;height:5%}' +
  '.cc-ding i{position:absolute;top:30%;width:calc(var(--ch) * .05);height:2px;border-radius:2px;background:var(--cc-panel-num,#9A1E14);opacity:0;transition:opacity .08s}' +
  '.cc-ding i:first-child{right:115%;transform:rotate(-24deg)}.cc-ding i:last-child{left:115%;transform:rotate(24deg)}' +
  '.cc-dinging .cc-ding i{opacity:1}' +
  '.cc-banner{position:absolute;right:100%;top:44%;width:max-content;display:flex;align-items:center;transform-origin:100% 50%;animation:ccFlap 3.4s ease-in-out infinite alternate}' +
  '.cc-tow{position:relative;width:calc(var(--ch) * .1);height:calc(var(--ch) * .07);flex:none}.cc-tow i{position:absolute;left:0;right:-2px;height:2px;background:#3a3f46;border-radius:2px}.cc-tow i:first-child{top:18%}.cc-tow i:last-child{bottom:18%}' +
  '.cc-flag{padding:.8em 1.3em .8em 1.5em;background:var(--cc-flag,#F7F2E6);color:var(--cc-flag-ink,#1E2A4B);font:800 calc(var(--ch) * .042)/1 var(--label,system-ui);letter-spacing:.14em;text-transform:uppercase;white-space:normal;line-height:1.25;border-top:3px solid var(--cc-flag-edge,#9A1E14);border-bottom:3px solid var(--cc-flag-edge,#9A1E14);box-shadow:0 8px 16px -10px rgba(0,0,0,.4)}' +
  '.cc-car:hover .cc-flag,.cc-car:focus-visible .cc-flag{background:var(--cc-flag-edge,#9A1E14);color:#fff}' +
  '@keyframes ccFlap{from{transform:rotate(-.25deg)}to{transform:rotate(.25deg)}}' +
  '.cc-sky{position:absolute;left:-3%;width:106%;bottom:12%;height:88%;pointer-events:none;will-change:transform;background:center bottom/auto 100% no-repeat;opacity:var(--cc-sky-o,.34);-webkit-mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);mask-image:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent)}' +
  '@media (max-width:640px){.cc{--cc-h:230px}.cc-banner{display:none}}' +
  '@media (prefers-reduced-motion:reduce){.cc-banner{animation:none}}';
  var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  function init() { document.querySelectorAll('[data-cablecar]').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
