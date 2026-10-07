/* YWAM 5 — shared interactions */
(function () {
  document.documentElement.classList.add('js');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var VIDEO = 'esouyuxQv8M';

  /* nav */
  var nav = $('.y5-nav');
  if (nav) {
    addEventListener('scroll', function () { nav.classList.toggle('shadow', nav.getBoundingClientRect().top <= 0 && scrollY > 120); }, { passive: true });
    var bg = $('.y5-burger'); if (bg) bg.addEventListener('click', function () { var o = nav.classList.toggle('open'); bg.setAttribute('aria-expanded', o); });
  }

  /* reveal + counters */
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return; e.target.classList.add('in'); io.unobserve(e.target);
      $$('[data-count]', e.target).concat(e.target.matches('[data-count]') ? [e.target] : []).forEach(function (el) {
        var n = +el.dataset.count, suf = el.dataset.suffix || '', t0 = null;
        if (reduce) { el.textContent = n.toLocaleString() + suf; return; }
        (function f(t) { t0 = t0 || t; var p = Math.min((t - t0) / 1500, 1); el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))).toLocaleString() + suf; if (p < 1) requestAnimationFrame(f); })(performance.now());
      });
    });
  }, { threshold: .15 });
  $$('.rv,.opp,.stats5').forEach(function (el) { io.observe(el); });

  /* neon hero: scale the 2500×1424 frame to cover, keeping the sign in view */
  $$('.neon-hero').forEach(function (h) {
    var f = $('.frame', h), IW = 2500, IH = 1424;
    function fit() {
      var W = h.clientWidth, H = h.clientHeight, s = Math.max(W / IW, H / IH);
      var fx = W < 700 ? 0.12 : 0.32, fy = 0.38;
      f.style.transform = 'translate(' + ((W - IW * s) * fx) + 'px,' + ((H - IH * s) * fy) + 'px) scale(' + s + ')';
    }
    fit(); addEventListener('resize', fit);
  });

  /* words that light up as you scroll */
  function splitWords(el) {
    el.innerHTML = el.innerHTML.replace(/(<em>)?([^<\s]+)(<\/em>)?/g, function (m, a, w, b) { return '<span class="w' + (a ? ' r' : '') + '">' + w + '</span>'; });
    return $$('.w', el);
  }
  $$('[data-lit]').forEach(function (el) {
    var ws = splitWords(el);
    function upd() {
      var r = el.getBoundingClientRect(), vh = innerHeight;
      var p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      var k = Math.round(p * ws.length);
      ws.forEach(function (w, i) { w.classList.toggle('on', reduce || i < k); });
    }
    upd(); addEventListener('scroll', upd, { passive: true });
  });
  $$('[data-verse]').forEach(function (el) {
    var ws = splitWords(el);
    new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) ws.forEach(function (w, i) { setTimeout(function () { w.classList.add('on'); }, reduce ? 0 : i * 90); }); }); }, { threshold: .4 }).observe(el);
  });

  /* believe slideshow */
  $$('.believe').forEach(function (b) {
    var figs = $$('.slides figure', b), bar = $('.bar', b), where = $('.where', b), i = 0, tm;
    figs.forEach(function (_, k) { var btn = document.createElement('button'); btn.setAttribute('aria-label', 'Photo ' + (k + 1)); btn.onclick = function () { show(k); }; bar.appendChild(btn); });
    var btns = $$('button', bar);
    function show(k) {
      i = (k + figs.length) % figs.length;
      figs.forEach(function (f, j) { f.classList.toggle('on', j === i); });
      btns.forEach(function (x, j) { x.classList.remove('on'); if (j === i) { void x.offsetWidth; x.classList.add('on'); } });
      if (where) where.textContent = figs[i].dataset.where || '';
      clearTimeout(tm); if (!reduce) tm = setTimeout(function () { show(i + 1); }, 6000);
    }
    show(0);
  });

  /* engagement strips */
  $$('.strips').forEach(function (g) {
    var ss = $$('.strip', g);
    ss.forEach(function (s) {
      s.addEventListener('mouseenter', function () { ss.forEach(function (x) { x.classList.toggle('on', x === s); }); });
      s.addEventListener('focus', function () { ss.forEach(function (x) { x.classList.toggle('on', x === s); }); });
      s.addEventListener('click', function (e) { if (!s.classList.contains('on')) { e.preventDefault(); ss.forEach(function (x) { x.classList.toggle('on', x === s); }); } });
    });
  });

  /* living wall video */
  var lb = $('.lightbox');
  function openFilm() {
    if (!lb) return;
    $('iframe', lb).src = 'https://www.youtube-nocookie.com/embed/' + VIDEO + '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
    lb.classList.add('open'); document.body.style.overflow = 'hidden'; $('.x', lb).focus();
  }
  function closeFilm() { if (!lb) return; lb.classList.remove('open'); $('iframe', lb).src = 'about:blank'; document.body.style.overflow = ''; }
  if (lb) { $('.x', lb).onclick = closeFilm; lb.addEventListener('click', function (e) { if (e.target === lb) closeFilm(); }); addEventListener('keydown', function (e) { if (e.key === 'Escape') closeFilm(); }); }
  $$('[data-film]').forEach(function (b) { b.addEventListener('click', openFilm); });
  $$('.wall').forEach(function (w) {
    var scr = $('.screen', w), loaded = false;
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !loaded && !reduce) {
          loaded = true;
          var fr = document.createElement('iframe');
          fr.title = 'YWAM San Francisco film, playing in the window';
          fr.allow = 'autoplay; encrypted-media; picture-in-picture';
          fr.tabIndex = -1;
          fr.src = 'https://www.youtube-nocookie.com/embed/' + VIDEO + '?autoplay=1&mute=1&loop=1&playlist=' + VIDEO + '&controls=0&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1';
          scr.appendChild(fr);
        }
      });
    }, { threshold: .25 }).observe(w);
  });

  /* curved words along the bridge cable in the Instagram carousel */
  function curve() {
    var plate = $('.ig5 .ig-plate'); if (!plate || $('.ig-curve', plate)) return;
    plate.insertAdjacentHTML('beforeend', '<svg class="ig-curve" viewBox="0 0 1774 887" preserveAspectRatio="none" aria-hidden="true"><defs><path id="cablePath" d="M1066,246 C1250,242 1420,204 1620,96"/></defs><text><textPath href="#cablePath" startOffset="0">Bring your heart to San Francisco</textPath></text></svg>');
  }
  setTimeout(curve, 50); addEventListener('load', curve);

  /* departures board */
  function sfNow() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })); }
  var DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  $$('.board').forEach(function (bd) {
    var clk = $('.clock', bd);
    function tick() { var d = sfNow(); if (clk) clk.textContent = DAYS[d.getDay()] + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' · SAN FRANCISCO'; }
    tick(); setInterval(tick, 20000);
    var today = DAYS[sfNow().getDay()];
    $$('tr[data-days]', bd).forEach(function (tr) {
      var st = $('.status', tr); if (tr.dataset.days.split(' ').indexOf(today) > -1) { st.textContent = 'Today'; st.classList.add('today'); }
      if (tr.dataset.href) { tr.classList.add('go'); tr.addEventListener('click', function () { location.href = tr.dataset.href; }); }
    });
    var flaps = $$('.flap', bd);
    flaps.forEach(function (f) { var t = f.textContent; f.dataset.t = t; f.innerHTML = t.split('').map(function (c) { return '<i>' + (c === ' ' ? '&nbsp;' : c) + '</i>'; }).join(''); });
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting || reduce) return;
        flaps.forEach(function (f, fi) {
          var cs = $$('i', f), A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:–';
          cs.forEach(function (c, ci) {
            var fin = f.dataset.t[ci]; if (fin === ' ') return; var n = 6 + ((ci + fi) % 9);
            (function roll(k) { c.textContent = k <= 0 ? fin : A[(Math.random() * A.length) | 0]; if (k > 0) setTimeout(function () { roll(k - 1); }, 45); })(n);
          });
        });
      });
    }, { threshold: .3 }).observe(bd);
  });

  /* week calendar */
  $$('.week').forEach(function (w) { var d = sfNow().getDay(); var col = $('.day[data-d="' + d + '"]', w); if (col) col.classList.add('today'); });

  /* flip pillars */
  $$('.pillar').forEach(function (p) { p.tabIndex = 0; p.setAttribute('role', 'button'); p.addEventListener('click', function () { p.classList.toggle('flip'); }); p.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.classList.toggle('flip'); } }); });

  /* team cost calculator */
  $$('.calc').forEach(function (c) {
    var p = $('#calcPeople', c), d = $('#calcDays', c), op = $('#outPeople', c), od = $('#outDays', c), tot = $('#calcTotal', c), per = $('#calcPer', c);
    function upd() { var n = +p.value, k = +d.value; op.textContent = n; od.textContent = k; tot.textContent = '$' + (n * k * 100).toLocaleString(); per.textContent = n + ' people × ' + k + ' day' + (k > 1 ? 's' : '') + ' × $100 · food, housing & ministry supplies included'; }
    p.addEventListener('input', upd); d.addEventListener('input', upd); upd();
  });
})();
/* greatest-hits reel */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  [].forEach.call(document.querySelectorAll('.reel'), function (reel) {
    var hits = [].slice.call(reel.querySelectorAll('.hit')), sec = reel.parentNode, dots = sec.querySelector('.reel-dots'), cur = 0, paused = false, visible = false, lock = 0, settle;
    hits.forEach(function (_, i) { var d = document.createElement('i'); d.onclick = function () { go(i); }; dots.appendChild(d); });
    var ds = [].slice.call(dots.children);
    function mark(i) { cur = i; hits.forEach(function (h, k) { h.classList.toggle('on', k === i); }); ds.forEach(function (d, k) { d.classList.toggle('on', k === i); }); }
    function nearest() {
      var r = reel.getBoundingClientRect(), mid = r.left + r.width / 2, best = 0, bd = 1e9;
      hits.forEach(function (h, i) { var b = h.getBoundingClientRect(), d = Math.abs(b.left + b.width / 2 - mid); if (d < bd) { bd = d; best = i; } });
      return best;
    }
    function offsetFor(h) { var r = reel.getBoundingClientRect(), b = h.getBoundingClientRect(); return reel.scrollLeft + (b.left + b.width / 2) - (r.left + r.width / 2); }
    function go(i, instant) {
      i = (i + hits.length) % hits.length; mark(i);
      lock = Date.now() + 900;
      reel.scrollTo({ left: offsetFor(hits[i]), behavior: (reduce || instant) ? 'auto' : 'smooth' });
    }
    reel.addEventListener('scroll', function () {
      clearTimeout(settle);
      settle = setTimeout(function () { lock = 0; var n = nearest(); if (n !== cur) mark(n); }, 140);
      if (Date.now() > lock) { var n = nearest(); if (n !== cur) mark(n); }
    }, { passive: true });
    hits.forEach(function (h, i) { h.addEventListener('click', function (e) { if (i !== cur) { e.preventDefault(); go(i); } }); });
    sec.querySelector('.reel-prev').onclick = function () { go(cur - 1); };
    sec.querySelector('.reel-next').onclick = function () { go(cur + 1); };
    reel.addEventListener('mouseenter', function () { paused = true; });
    reel.addEventListener('mouseleave', function () { paused = false; });
    reel.addEventListener('touchstart', function () { paused = true; }, { passive: true });
    reel.addEventListener('focusin', function () { paused = true; });
    [sec.querySelector('.reel-prev'), sec.querySelector('.reel-next'), dots].forEach(function (b) { b.addEventListener('click', function () { paused = true; clearTimeout(b._r); b._r = setTimeout(function () { paused = false; }, 8000); }); });
    function tick() { if (!paused && visible && !reduce && Date.now() > lock) go(cur + 1); }
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: .4 }).observe(reel);
    mark(0); setTimeout(function () { go(0, true); }, 60);
    window.addEventListener('resize', function () { go(cur, true); });
    setInterval(tick, 3800);
  });
})();
