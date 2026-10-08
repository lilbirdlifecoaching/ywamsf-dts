/* YWAM SF · "a full day on Ellis Street" for the home hero.
   On load the street plays the last 24 hours as a short time-lapse (fog in the morning,
   sun, a passing shower, golden hour, neon at night) and settles on the real time and
   weather in San Francisco. After that it stays live. A small clock lets anyone scrub
   through the day or replay it. Weather: Open-Meteo (free, no key). */
(function () {
  'use strict';
  var hero = document.querySelector('.neon-hero');
  if (!hero || !window.requestAnimationFrame) return;
  var frame = hero.querySelector('.frame'), photo = hero.querySelector('.photo'), tint = hero.querySelector('.tint');
  var skyC = hero.querySelector('.sky-c'), sun = hero.querySelector('.sun'), wash = hero.querySelector('.sunwash');
  var fog = hero.querySelector('.fog'), wet = hero.querySelector('.wet'), face = hero.querySelector('.face');
  if (!frame || !photo || !skyC) return;
  hero.classList.add('dc');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TZ = 'America/Los_Angeles', LAT = 37.785, LON = -122.413;

  /* ---------------------------------------------------------------- time helpers */
  function sfParts(d) {
    try {
      var p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(d), o = {};
      p.forEach(function (x) { o[x.type] = +x.value; });
      return { y: o.year, mo: o.month, d: o.day, h: (o.hour % 24) + o.minute / 60 + o.second / 3600 };
    } catch (e) { return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours() + d.getMinutes() / 60 }; }
  }
  var now0 = sfParts(new Date());
  var doy = Math.round((Date.UTC(now0.y, now0.mo - 1, now0.d) - Date.UTC(now0.y, 0, 0)) / 864e5);
  var c = Math.cos(2 * Math.PI * (doy - 172) / 365);
  var SR = 6.6 - 0.8 * c, SS = 18.7 + 1.85 * c;          // rough SF sunrise/sunset (local), replaced by real values when weather loads
  function fmt(h) { h = ((h % 24) + 24) % 24; var H = Math.floor(h), M = Math.floor((h - H) * 60); return ((H + 11) % 12 + 1) + ':' + (M < 10 ? '0' : '') + M + ' ' + (H < 12 ? 'AM' : 'PM'); }
  /* map real clock time onto a reference day (sunrise 7:00, sunset 18:45) */
  function refHour(h) {
    h = ((h % 24) + 24) % 24;
    if (h < SR) return h * 7 / SR;
    if (h < SS) return 7 + (h - SR) * 11.75 / (SS - SR);
    return 18.75 + (h - SS) * 5.25 / (24 - SS);
  }

  /* ---------------------------------------------------------------- the look of each hour (reference day) */
  // hour, sky top, sky bottom, photo brightness, saturation, grade colour (multiply) + strength, night 0–1, sun 0–1, golden 0–1
  var K = [
    [0, '#0b1430', '#1a2646', .43, .74, '#24305c', .66, 1, 0, 0],
    [5.4, '#0f193a', '#273358', .45, .76, '#273461', .62, 1, 0, 0],
    [6.3, '#2a3966', '#b98a8f', .62, .84, '#6a5a7a', .4, .78, 0, .2],
    [7.0, '#5d7db3', '#f1b48c', .8, .92, '#f0b08a', .3, .3, .55, .8],
    [8.2, '#8eb1d8', '#efe3d2', .96, 1, '#f4e0c8', .14, 0, .5, .25],
    [12, '#7ea8d9', '#dfeaf6', 1.04, 1.06, '#ffffff', 0, 0, .35, 0],
    [16, '#86a8d2', '#f0e0c2', 1.01, 1.06, '#f6dcc0', .12, 0, .5, .3],
    [17.9, '#6582b4', '#f6ad72', .93, 1.1, '#f1a86e', .3, .05, .8, 1],
    [18.75, '#4a5a96', '#f2855c', .8, 1.06, '#de825c', .38, .35, .55, .85],
    [19.45, '#24305f', '#7a5f86', .6, .88, '#45467a', .52, .82, 0, .2],
    [20.6, '#111b3d', '#26304e', .46, .76, '#26325e', .64, 1, 0, 0],
    [24, '#0b1430', '#1a2646', .43, .74, '#24305c', .66, 1, 0, 0]
  ];
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  K.forEach(function (k) { k[1] = hex(k[1]); k[2] = hex(k[2]); k[5] = hex(k[5]); });
  function mix(a, b, t) { return a + (b - a) * t; }
  function mixc(a, b, t) { return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
  function rgb(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a.toFixed(3)) + ')'; }
  function look(h) {
    var r = refHour(h), i = 0;
    while (i < K.length - 2 && K[i + 1][0] <= r) i++;
    var a = K[i], b = K[i + 1], t = (r - a[0]) / (b[0] - a[0]); t = t * t * (3 - 2 * t);
    return { top: mixc(a[1], b[1], t), bot: mixc(a[2], b[2], t), br: mix(a[3], b[3], t), sat: mix(a[4], b[4], t), gc: mixc(a[5], b[5], t), gs: mix(a[6], b[6], t), night: mix(a[7], b[7], t), sun: mix(a[8], b[8], t), gold: mix(a[9], b[9], t), ref: r };
  }

  /* ---------------------------------------------------------------- night lights */
  var lights = [].slice.call(hero.querySelectorAll('.night > *')).map(function (el) {
    var d = parseFloat(el.style.getPropertyValue('--d')) || 3.5;
    return { el: el, thr: .22 + Math.min(1, Math.max(0, (d - 2.6) / 2.6)) * .5, on: false };
  });
  [['.lit', .5], ['.tube.wave', .5], ['.tube.text', .6], ['.spill', .52]].forEach(function (s) {
    [].forEach.call(hero.querySelectorAll(s[0]), function (el) { if (el.closest('.night')) return; lights.push({ el: el, thr: s[1], on: false }); });
  });
  function setLights(n) {
    lights.forEach(function (L) {
      var want = L.on ? n > L.thr - .08 : n > L.thr;
      if (want !== L.on) { L.on = want; L.el.classList.toggle('on', want); }
    });
    if (face) face.style.opacity = Math.max(0, Math.min(1, (n - .15) / .5)).toFixed(3);
  }

  /* ---------------------------------------------------------------- weather */
  var WX = { cloud: .3, rain: 0, fog: 0, label: '' }, wxReal = null;
  function wxFrom(code, cover) {
    var w = { cloud: Math.min(1, (cover || 0) / 100), rain: 0, fog: 0, label: 'Clear' };
    if (cover > 30) w.label = 'Partly cloudy';
    if (cover > 75) w.label = 'Cloudy';
    if (code === 45 || code === 48) { w.fog = .85; w.cloud = Math.max(w.cloud, .7); w.label = 'Foggy'; }
    if ((code >= 51 && code <= 57)) { w.rain = .35; w.label = 'Drizzle'; }
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) { w.rain = code === 61 || code === 80 ? .55 : .85; w.label = code === 61 || code === 80 ? 'Light rain' : 'Rain'; }
    if (code >= 95) { w.rain = 1; w.label = 'Storms'; }
    if (w.rain) w.cloud = Math.max(w.cloud, .85);
    return w;
  }
  function loadWeather() {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&current=weather_code,cloud_cover&daily=sunrise,sunset&timezone=America%2FLos_Angeles&forecast_days=1';
    return fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.current) return;
      wxReal = wxFrom(j.current.weather_code, j.current.cloud_cover);
      try {
        var sr = j.daily.sunrise[0].split('T')[1].split(':'), ss = j.daily.sunset[0].split('T')[1].split(':');
        var a = +sr[0] + sr[1] / 60, b = +ss[0] + ss[1] / 60; if (a > 4 && a < 9 && b > 16 && b < 22) { SR = a; SS = b; }
      } catch (e) {}
    }).catch(function () {});
  }

  /* ---------------------------------------------------------------- rain canvas */
  var cv = hero.querySelector('.rain'), cx = cv && cv.getContext && cv.getContext('2d'), drops = [], rainAmt = 0, rainNight = 0, rainOn = false, vis = true;
  function sizeCanvas() { if (!cv) return; var r = Math.min(2, window.devicePixelRatio || 1); cv.width = hero.clientWidth * r; cv.height = hero.clientHeight * r; cx && cx.setTransform(r, 0, 0, r, 0, 0); }
  function rainLoop() {
    if (!cx) return;
    var W = hero.clientWidth, H = hero.clientHeight, want = Math.round(rainAmt * (W > 700 ? 260 : 120));
    while (drops.length < want) drops.push({ x: Math.random() * W * 1.2, y: Math.random() * H, l: 10 + Math.random() * 18, v: 9 + Math.random() * 7, a: .25 + Math.random() * .45 });
    if (drops.length > want) drops.length = want;
    cx.clearRect(0, 0, W, H);
    if (want) {
      cx.lineWidth = 1; cx.lineCap = 'round';
      var col = rainNight > .5 ? '205,215,235' : '235,240,246';
      for (var i = 0; i < drops.length; i++) {
        var p = drops[i];
        cx.strokeStyle = 'rgba(' + col + ',' + (p.a * Math.min(1, rainAmt * 1.4)).toFixed(3) + ')';
        cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - p.l * .28, p.y + p.l); cx.stroke();
        p.y += p.v; p.x -= p.v * .28;
        if (p.y > H) { p.y = -20; p.x = Math.random() * W * 1.2; }
      }
    }
    if ((rainAmt > .01 || drops.length) && vis && !reduce) requestAnimationFrame(rainLoop); else { rainOn = false; cx.clearRect(0, 0, W, H); }
  }
  function kickRain() { if (!rainOn && rainAmt > .01 && vis && cx && !reduce) { rainOn = true; requestAnimationFrame(rainLoop); } }
  sizeCanvas(); addEventListener('resize', sizeCanvas);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { vis = e[0].isIntersecting; kickRain(); }).observe(hero);

  /* ---------------------------------------------------------------- render one moment */
  function render(h, w) {
    var L = look(h), cl = Math.max(w.cloud, w.rain * .95);
    var grey = mixc([150, 158, 168], [30, 34, 44], L.night);
    var top = mixc(L.top, grey, cl * .75), bot = mixc(L.bot, mixc(grey, [200, 204, 210], .4 * (1 - L.night)), cl * .7);
    skyC.style.background = 'linear-gradient(180deg,' + rgb(top) + ' 0%,' + rgb(bot) + ' 78%)';
    var br = L.br * (1 - .1 * cl) * (1 - .12 * w.rain) * (1 - .06 * w.fog), sat = L.sat * (1 - .25 * cl);
    photo.style.filter = 'brightness(' + br.toFixed(3) + ') saturate(' + sat.toFixed(3) + ') contrast(' + (1.02 + .05 * L.night).toFixed(3) + ')';
    tint.style.background = 'linear-gradient(180deg,' + rgb(L.gc, L.gs) + ',' + rgb(L.gc, L.gs * .35) + ' 60%,' + rgb(L.gc, L.gs * 1.1) + ')';
    var sunA = L.sun * (1 - cl * .9), sx = 2050 - Math.max(0, Math.min(1, (L.ref - 7) / 11.75)) * 1150, sy = 760 - Math.sin(Math.max(0, Math.min(1, (L.ref - 7) / 11.75)) * Math.PI) * 600;
    if (sun) { sun.style.opacity = sunA.toFixed(3); sun.style.transform = 'translate(' + sx.toFixed(0) + 'px,' + sy.toFixed(0) + 'px)'; }
    if (wash) wash.style.opacity = (L.gold * (1 - cl * .8) * .9).toFixed(3);
    if (fog) fog.style.opacity = Math.min(1, w.fog).toFixed(3);
    if (wet) { wet.style.opacity = Math.min(1, w.rain * 1.2).toFixed(3); wet.classList.toggle('lit', L.night > .5); }
    setLights(L.night);
    rainAmt = w.rain; rainNight = L.night; kickRain();
    return L;
  }

  /* ---------------------------------------------------------------- clock control */
  var ctl = hero.querySelector('.dayctl'), tEl = ctl && ctl.querySelector('.dc-time'), wEl = ctl && ctl.querySelector('.dc-wx'), rng = ctl && ctl.querySelector('input'), liveB = ctl && ctl.querySelector('.dc-live'), repB = ctl && ctl.querySelector('.dc-replay'), tog = ctl && ctl.querySelector('.dc-pill');
  function showClock(h, w, live) {
    if (!ctl) return;
    tEl.textContent = fmt(h);
    wEl.textContent = live ? 'Now' + (w.label ? ' · ' + w.label : '') : (w.rain > .3 ? 'Rain' : w.fog > .4 ? 'Fog' : '');
    if (rng && document.activeElement !== rng) rng.value = Math.round((((h % 24) + 24) % 24) * 60);
    ctl.classList.toggle('live', !!live);
  }

  /* ---------------------------------------------------------------- the time-lapse */
  var mode = 'intro', raf = 0;
  function nightish(h) { var r = refHour(h); return r < 6 || r > 20.4; }
  function bell(x, c, wdt) { var d = (x - c) / wdt; return Math.exp(-d * d); }
  function intro() {
    cancelAnimationFrame(raf); mode = 'intro';
    var H = sfParts(new Date()).h, span = 22, start = H - span, steps = 440, cum = [0];
    // a shower: prefer the evening (neon on, wet street), else the afternoon or late morning
    var showerAt = null;
    [[20.4, 22.6], [14, 16.5], [9.5, 13]].some(function (win) {
      for (var j = 0; j <= steps; j++) { var pj = j / steps, rj = refHour(start + span * pj); if (pj > .08 && pj < .78 && rj > win[0] && rj < win[1]) { showerAt = pj + .025; return true; } }
      return false;
    });
    if (showerAt == null) showerAt = .45;
    // time runs slower through dawn, dusk and the shower, faster through the dead of night
    for (var i = 1; i <= steps; i++) { var pi = i / steps, hh = start + span * pi; var rr = refHour(hh); cum.push(cum[i - 1] + (nightish(hh) ? .6 : 1) + 2.4 * bell(rr, 19.6, .75) + 3.2 * bell(pi, showerAt, .055)); }
    var total = cum[steps], DUR = 24000, t0 = performance.now();
    function frameAt(now) {
      var u = Math.min(1, (now - t0) / DUR), e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      var target = e * total, k = 0; while (k < steps && cum[k + 1] < target) k++;
      var frac = k < steps ? (target - cum[k]) / (cum[k + 1] - cum[k] || 1) : 0, pos = (k + frac) / steps, h = start + span * pos;
      var r = refHour(h);
      var scripted = { cloud: .25 + .6 * bell(pos, showerAt, .08), rain: .9 * bell(pos, showerAt, .055), fog: .8 * bell(r, 8.1, 1.4) + .3 * bell(r, 21.5, 1.2) };
      var real = wxReal || WX, b = Math.max(0, (pos - .84) / .16);
      var w = { cloud: mix(scripted.cloud, real.cloud, b), rain: mix(scripted.rain, real.rain, b), fog: mix(scripted.fog, real.fog, b), label: real.label };
      render(h, w); showClock(h, w, false);
      if (u < 1) raf = requestAnimationFrame(frameAt); else goLive();
    }
    raf = requestAnimationFrame(frameAt);
  }
  var liveT = 0, wxT = 0, fromW = null, wxBlendT = 0;
  function goLive() {
    cancelAnimationFrame(raf); mode = 'live';
    var h = sfParts(new Date()).h, w = wxReal || WX;
    render(h, w); showClock(h, w, true);
    clearInterval(liveT); liveT = setInterval(function () { if (mode === 'live') { var hh = sfParts(new Date()).h, ww = wxReal || WX; render(hh, ww); showClock(hh, ww, true); } }, 60000);
  }
  function scrub(h) { cancelAnimationFrame(raf); mode = 'scrub'; var w = wxReal || WX; render(h, w); showClock(h, w, false); }

  if (ctl) {
    if (tog) tog.addEventListener('click', function () { var o = ctl.classList.toggle('open'); tog.setAttribute('aria-expanded', String(o)); });
    if (rng) rng.addEventListener('input', function () { scrub(+rng.value / 60); });
    if (liveB) liveB.addEventListener('click', function () { goLive(); });
    if (repB) repB.addEventListener('click', function () { intro(); });
  }

  /* ---------------------------------------------------------------- go */
  var wxP = loadWeather();
  clearInterval(wxT); wxT = setInterval(function () { loadWeather().then(function () { if (mode === 'live') goLive(); }); }, 15 * 60000);
  if (reduce) { render(now0.h, WX); wxP.then(goLive); showClock(now0.h, WX, true); }
  else {
    render(now0.h - 22, { cloud: .25, rain: 0, fog: 0 });
    // give the photo a moment to appear, then roll the day
    setTimeout(intro, 700);
    wxP.then(function () { if (mode === 'live') goLive(); });
  }
})();
