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
      if (tr.dataset.href) { tr.classList.add('go'); tr.tabIndex = 0; var goRow = function () { if (tr.dataset.newtab) window.open(tr.dataset.href, '_blank', 'noopener'); else location.href = tr.dataset.href; }; tr.addEventListener('click', goRow); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') goRow(); }); }
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

/* ================= round 6 ================= */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  function sfNow() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })); }
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* DTS video header: sound + pause via the YouTube iframe API (postMessage) */
  var film = $('#dtsfilm');
  if (film) {
    function cmd(f, a) { try { film.contentWindow.postMessage(JSON.stringify({ event: 'command', func: f, args: a || [] }), '*'); } catch (e) {} }
    film.addEventListener('load', function () { setTimeout(function () { film.classList.add('on'); }, 1400); });
    var snd = $('.vsound'), pl = $('.vplay');
    snd.addEventListener('click', function () {
      var on = snd.getAttribute('aria-pressed') !== 'true';
      snd.setAttribute('aria-pressed', on); $('.lbl', snd).textContent = on ? 'Mute' : 'Sound on';
      if (on) { cmd('unMute'); cmd('setVolume', [80]); cmd('playVideo'); pl.setAttribute('aria-pressed', 'false'); pl.setAttribute('aria-label', 'Pause film'); } else cmd('mute');
    });
    pl.addEventListener('click', function () {
      var paused = pl.getAttribute('aria-pressed') !== 'true';
      pl.setAttribute('aria-pressed', paused); pl.setAttribute('aria-label', paused ? 'Play film' : 'Pause film');
      cmd(paused ? 'pauseVideo' : 'playVideo');
    });
    if (reduce) { pl.click(); }
  }

  /* DTS vow cards: turn over */
  $$('.vow5').forEach(function (v) { v.addEventListener('click', function () { v.setAttribute('aria-pressed', v.getAttribute('aria-pressed') !== 'true'); }); });

  /* DTS day bar */
  var sky = $('.sky');
  if (sky && window.YWAM_DAY) {
    var hrs = $$('.hr', sky), card = $('.hour5'), cur = 0, auto;
    function show(i) {
      cur = i; var h = YWAM_DAY[i];
      hrs.forEach(function (b, j) { b.classList.toggle('on', i === j); b.setAttribute('aria-pressed', i === j); });
      sky.style.setProperty('--sx', 'calc(6% + ' + hrs[i].style.getPropertyValue('--x') + ' * .88)');
      sky.classList.toggle('night', i >= hrs.length - 1);
      $('[data-h="t"]', card).textContent = h.t + ' · ' + h.s; $('[data-h="n"]', card).textContent = h.n; $('[data-h="d"]', card).textContent = h.d;
      if (card.animate && !reduce) card.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' });
    }
    hrs.forEach(function (b, i) { b.addEventListener('click', function () { show(i); clearInterval(auto); auto = null; }); });
    show(0);
    if (!reduce && window.IntersectionObserver) new IntersectionObserver(function (es) { es.forEach(function (e) { clearInterval(auto); auto = null; if (e.isIntersecting) auto = setInterval(function () { show((cur + 1) % hrs.length); }, 4800); }); }, { threshold: .5 }).observe(sky);
  }

  /* DTS readiness check-in (survey.js) */
  var modal = $('#modal');
  if (modal) {
    var mounted = false;
    function openS() { if (!mounted && window.mountDtsSurvey) { mountDtsSurvey($('#survey')); mounted = true; } modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; $('.modal-x', modal).focus(); }
    function closeS() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
    $$('[data-survey]').forEach(function (b) { b.addEventListener('click', openS); });
    $('.modal-x', modal).addEventListener('click', closeS);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeS(); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape') closeS(); });
  }

  /* Volunteer: carousel center card drives the shift panel */
  var vstage = $('[data-vol]');
  if (vstage && window.YWAM_IG_POSTS) {
    var P = YWAM_IG_POSTS.slice(0, window.YWAM_VOL_N || YWAM_IG_POSTS.length), panel = $('#shift'), dots = $('.shift-dots');
    P.forEach(function (p, i) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = p.title; b.addEventListener('click', function () { if (!vstage._go) return; var T = YWAM_IG_POSTS.length, c = vstage._center || 0, best = i, bd = 1e9; for (var k = i; k < T; k += P.length) { var dd = Math.abs(k - c); dd = Math.min(dd, T - dd); if (dd < bd) { bd = dd; best = k; } } vstage._go(best); }); dots.appendChild(b); });
    function fill(i) {
      i = i % P.length; var p = P[i]; if (!p) return;
      $('[data-f="when"]', panel).textContent = p.when; $('[data-f="time"]', panel).textContent = p.time || '';
      $('[data-f="title"]', panel).textContent = p.title; $('[data-f="desc"]', panel).textContent = p.desc;
      $('[data-f="meta"]', panel).innerHTML = (p.meta || []).map(function (m) { return '<span>' + m + '</span>'; }).join('');
      $('[data-f="signup"]', panel).href = 'mailto:volunteer@ywamsanfrancisco.org?subject=' + encodeURIComponent(p.subject || p.title);
      [].forEach.call(dots.children, function (b, j) { b.setAttribute('aria-selected', i === j); });
    }
    vstage.addEventListener('igcenter', function (e) { fill(e.detail.index); });
    $$('tr[data-shift]').forEach(function (tr) { tr.addEventListener('click', function () { var b = dots.children[+tr.dataset.shift]; if (b) b.click(); }); });
    fill(0);
    vstage.addEventListener('click', function (e) {
      var c = e.target.closest('.ig-card.is-center'); if (!c) return;
      e.preventDefault(); panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      panel.classList.add('pulse'); setTimeout(function () { panel.classList.remove('pulse'); }, 900);
    });
    panel.addEventListener('mouseenter', function () { vstage._pause && vstage._pause(true); });
    panel.addEventListener('mouseleave', function () { vstage._pause && vstage._pause(false); });
  }

  /* Ellis Room: live "now / next" in San Francisco time */
  var week = $('.week');
  if (week) {
    var nn = $('.nownext'), DN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    function nth(d) { return Math.ceil(d.getDate() / 7); }
    function runsOn(ev, date) { return ev.dataset.rule !== 'nth24' || [2, 4].indexOf(nth(date)) > -1; }
    function fmt(m) { var h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + ' ' + ap; }
    function tick() {
      var now = sfNow(), d = now.getDay(), m = now.getHours() * 60 + now.getMinutes(), live = [], next = null;
      $$('.ev', week).forEach(function (e) { e.classList.remove('now', 'past'); });
      $$('.day', week).forEach(function (col) { col.classList.toggle('today', +col.dataset.d === d); });
      var todayCol = $('.day[data-d="' + d + '"]', week);
      if (todayCol) $$('.ev[data-s]', todayCol).forEach(function (e) {
        if (!runsOn(e, now)) return; var s = +e.dataset.s, en = +e.dataset.e;
        if (m >= s && m < en) { e.classList.add('now'); live.push(e.dataset.t); } else if (m >= en) e.classList.add('past');
      });
      for (var k = 0; k < 8 && !next; k++) {
        var dd = (d + k) % 7, date = new Date(now.getTime() + k * 864e5), col = $('.day[data-d="' + dd + '"]', week);
        if (!col) continue;
        $$('.ev[data-s]', col).forEach(function (e) { var s = +e.dataset.s; if (!runsOn(e, date)) return; if ((k > 0 || s > m) && (!next || s < next.s)) next = { s: s, t: e.dataset.t, k: k, dd: dd }; });
      }
      var html = '';
      if (live.length) html += '<span><span class="tag">Happening now</span><b>' + live.join(' · ') + '</b></span>';
      if (next) html += '<span><span class="tag next">Up next</span><b>' + next.t + '</b> · ' + (next.k === 0 ? 'today' : next.k === 1 ? 'tomorrow' : DN[next.dd]) + ' at ' + fmt(next.s) + '</span>';
      nn.innerHTML = html;
    }
    tick(); setInterval(tick, 60000);
    var tc = $('.day.today', week), wrap = $('.week-wrap');
    if (tc && wrap && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = tc.offsetLeft - 24;
  }

  /* Ellis Room: voices track */
  var vt = $('.vtrack');
  if (vt) $$('.varrows button').forEach(function (b) { b.addEventListener('click', function () { vt.scrollBy({ left: +b.dataset.dir * Math.min(400, vt.clientWidth * .85), behavior: reduce ? 'auto' : 'smooth' }); }); });
})();
