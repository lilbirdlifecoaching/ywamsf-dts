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
  var skyW = hero.querySelector('.sky-w'), stars = hero.querySelector('.stars'), fog = hero.querySelector('.fog'), wet = hero.querySelector('.wet'), face = hero.querySelector('.face');
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
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&current=weather_code,cloud_cover,temperature_2m&temperature_unit=fahrenheit&daily=sunrise,sunset&timezone=America%2FLos_Angeles&forecast_days=1';
    return fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.current) return;
      wxReal = wxFrom(j.current.weather_code, j.current.cloud_cover); if (typeof j.current.temperature_2m === 'number') wxReal.temp = Math.round(j.current.temperature_2m); wxReal.storm = j.current.weather_code >= 95;
      try {
        var sr = j.daily.sunrise[0].split('T')[1].split(':'), ss = j.daily.sunset[0].split('T')[1].split(':');
        var a = +sr[0] + sr[1] / 60, b = +ss[0] + ss[1] / 60; if (a > 4 && a < 9 && b > 16 && b < 22) { SR = a; SS = b; }
      } catch (e) {}
    }).catch(function () {});
  }

  /* ---------------------------------------------------------------- rain
     Drops live at different depths: far ones are short, faint and slow; near ones are long,
     soft and fast. The wind gusts, near drops splash on the street, and a light haze softens
     the distance while it rains. */
  var cv = hero.querySelector('.rain'), cx = cv && cv.getContext && cv.getContext('2d'), haze = hero.querySelector('.rainhaze');
  var drops = [], splashes = [], rainAmt = 0, rainNight = 0, rainOn = false, vis = true, lastT = 0;
  function sizeCanvas() { if (!cv) return; var r = 1; cv.width = hero.clientWidth * r; cv.height = hero.clientHeight * r; cx && cx.setTransform(r, 0, 0, r, 0, 0); }
  function newDrop(W, H, anywhere) {
    var z = Math.pow(Math.random(), 1.7);                       // most drops are far away
    return { x: Math.random() * W * 1.4 - W * .2, y: anywhere ? Math.random() * H : -Math.random() * H * .25 - 40, z: z,
      v: 650 + 1500 * z + Math.random() * 200, len: 6 + 46 * Math.pow(z, 1.3), g: H * (.8 + .19 * z) + Math.random() * 18 };
  }
  var BANDS = [[0, .3, .5, .17], [.3, .62, .85, .22], [.62, .85, 1.25, .27], [.85, 1.01, 1.8, .3]];  // depth range, line width, alpha
  function rainLoop(t) {
    if (!cx) return;
    var W = hero.clientWidth, H = hero.clientHeight, dt = Math.min(50, lastT ? t - lastT : 16) / 1000; lastT = t;
    var want = Math.round(rainAmt * (W > 700 ? 950 : 380));
    while (drops.length < want) drops.push(newDrop(W, H, drops.length < want * .9 && !splashes.length));
    if (drops.length > want) drops.length = want;
    var wind = .2 + .11 * Math.sin(t / 2300) + .05 * Math.sin(t / 830 + 1.3);      // gusts tilt the rain
    cx.clearRect(0, 0, W, H);
    var col = rainNight > .5 ? '196,210,232' : '226,232,240', k = Math.min(1, rainAmt * 1.3);
    cx.lineCap = 'round';
    for (var b = 0; b < BANDS.length; b++) {
      var B = BANDS[b], tail = new Path2D(), head = new Path2D();
      for (var i = 0; i < drops.length; i++) {
        var p = drops[i]; if (p.z < B[0] || p.z >= B[1]) continue;
        var dx = -p.len * wind, x2 = p.x + dx, y2 = p.y + p.len;
        tail.moveTo(p.x, p.y); tail.lineTo(x2, y2);
        head.moveTo(p.x + dx * .55, p.y + p.len * .55); head.lineTo(x2, y2);
      }
      cx.lineWidth = B[2]; cx.strokeStyle = 'rgba(' + col + ',' + (B[3] * .55 * k).toFixed(3) + ')'; cx.stroke(tail);
      cx.strokeStyle = 'rgba(' + col + ',' + (B[3] * k).toFixed(3) + ')'; cx.stroke(head);
    }
    for (var n = 0; n < drops.length; n++) {
      var d = drops[n], step = d.v * dt; d.y += step; d.x -= step * wind;
      if (d.z > .45 && d.y + d.len > d.g) { if (splashes.length < 90) splashes.push({ x: d.x - d.len * wind, y: d.g, s: .5 + d.z, t: 0 }); drops[n] = newDrop(W, H, false); }
      else if (d.y > H) drops[n] = newDrop(W, H, false);
    }
    // splashes: a quick ring and two flecks
    for (var m = splashes.length - 1; m >= 0; m--) {
      var sp = splashes[m]; sp.t += dt / .28; if (sp.t >= 1) { splashes.splice(m, 1); continue; }
      var a = (1 - sp.t) * .5 * k, r = (2 + 6 * sp.s) * sp.t;
      cx.strokeStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')'; cx.lineWidth = .7;
      cx.beginPath(); cx.ellipse(sp.x, sp.y, r, r * .28, 0, 0, Math.PI * 2); cx.stroke();
      cx.fillStyle = 'rgba(' + col + ',' + (a * .9).toFixed(3) + ')';
      var hgt = 9 * sp.s * sp.t * (1 - sp.t) * 4;
      cx.fillRect(sp.x - r * .7, sp.y - hgt, 1.1, 1.1); cx.fillRect(sp.x + r * .6, sp.y - hgt * .8, 1, 1);
    }
    if ((rainAmt > .01 || splashes.length) && vis && !reduce) requestAnimationFrame(rainLoop);
    else { rainOn = false; lastT = 0; drops.length = 0; splashes.length = 0; cx.clearRect(0, 0, W, H); }
  }
  function kickRain() {
    if (haze) { haze.style.opacity = Math.min(1, rainAmt * 1.1).toFixed(3); haze.classList.toggle('night', rainNight > .5); }
    if (!rainOn && rainAmt > .01 && vis && cx && !reduce) { rainOn = true; requestAnimationFrame(rainLoop); }
  }
  sizeCanvas(); addEventListener('resize', sizeCanvas);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { vis = e[0].isIntersecting; kickRain(); }).observe(hero);

  /* ---------------------------------------------------------------- render one moment */
  function render(h, w) {
    var L = look(h), cl = Math.max(w.cloud, w.rain * .95);
    var grey = mixc([150, 158, 168], [30, 34, 44], L.night);
    var top = mixc(L.top, grey, cl * .75), bot = mixc(L.bot, mixc(grey, [200, 204, 210], .4 * (1 - L.night)), cl * .7);
    skyC.style.background = 'linear-gradient(180deg,' + rgb(top) + ' 0%,' + rgb(bot) + ' 78%)';
    if (skyW) skyW.style.background = skyC.style.background;
    if (stars) stars.style.opacity = (Math.max(0, Math.min(1, (L.night - .55) / .45)) * (1 - cl) * (1 - Math.min(1, w.fog * 1.4)) * .9).toFixed(3);
    var br = L.br * (1 - .1 * cl) * (1 - .12 * w.rain) * (1 - .06 * w.fog), sat = L.sat * (1 - .25 * cl);
    photo.style.filter = 'brightness(' + br.toFixed(3) + ') saturate(' + sat.toFixed(3) + ') contrast(' + (1.02 + .05 * L.night).toFixed(3) + ')';
    tint.style.background = 'linear-gradient(180deg,' + rgb(L.gc, L.gs) + ',' + rgb(L.gc, L.gs * .35) + ' 60%,' + rgb(L.gc, L.gs * 1.1) + ')';
    var sunA = L.sun * (1 - cl * .9), sx = 2050 - Math.max(0, Math.min(1, (L.ref - 7) / 11.75)) * 1150, sy = 760 - Math.sin(Math.max(0, Math.min(1, (L.ref - 7) / 11.75)) * Math.PI) * 600;
    if (sun) { sun.style.opacity = sunA.toFixed(3); sun.style.transform = 'translate(' + sx.toFixed(0) + 'px,' + sy.toFixed(0) + 'px)'; }
    if (wash) wash.style.opacity = (L.gold * (1 - cl * .8) * .9).toFixed(3);
    if (fog) fog.style.opacity = Math.min(1, w.fog).toFixed(3);
    if (wet) wet.style.opacity = Math.min(1, w.rain * 1.1).toFixed(3);
    setLights(L.night);
    rainAmt = w.rain; rainNight = L.night; kickRain();
    return L;
  }

  /* ---------------------------------------------------------------- clock control */
  var ctl = hero.querySelector('.dayctl'), tEl = ctl && ctl.querySelector('.dc-time'), wEl = ctl && ctl.querySelector('.dc-wx'), rng = ctl && ctl.querySelector('input'), liveB = ctl && ctl.querySelector('.dc-live'), repB = ctl && ctl.querySelector('.dc-replay'), tog = ctl && ctl.querySelector('.dc-pill');
  /* weather icons: thin white line drawings to match the site */
  var ICONS = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    moon: '<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/><path class="tw" d="M17.5 3.5v2M16.5 4.5h2"/>',
    partsun: '<path d="M8.5 6.2V4.6M3.6 11H2M4.9 7.4 3.8 6.3M12.1 7.4l1.1-1.1"/><path d="M5.2 13.2a3.6 3.6 0 1 1 6.6-2.6"/><path d="M8.2 19.5h9.3a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4 2.8 2.8 0 0 0 0 5.6z"/>',
    partmoon: '<path d="M11.8 9.6A4.6 4.6 0 0 1 6 3.8a4.6 4.6 0 1 0 5.8 5.8z"/><path d="M8.2 19.5h9.3a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.4 2.8 2.8 0 0 0 0 5.6z"/>',
    cloud: '<path d="M7 18.5h10.6a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.6A3.2 3.2 0 0 0 7 18.5z"/>',
    fog: '<path d="M7 13.5h10.6a3.6 3.6 0 0 0 .3-7.1 5 5 0 0 0-9.7 1.4A2.9 2.9 0 0 0 7 13.5z"/><path d="M4 17h12M8 20.5h12"/>',
    rain: '<path d="M7 14.5h10.6a3.8 3.8 0 0 0 .4-7.6 5.3 5.3 0 0 0-10.3 1.5A3 3 0 0 0 7 14.5z"/><path d="M8.5 17.2l-1 2.6M12.5 17.2l-1 2.6M16.5 17.2l-1 2.6"/>',
    storm: '<path d="M7 14h10.6a3.8 3.8 0 0 0 .4-7.6 5.3 5.3 0 0 0-10.3 1.5A3 3 0 0 0 7 14z"/><path d="M12.6 15.2 10.4 19h3l-1.8 3.2"/>'
  };
  var icEl = ctl && ctl.querySelector('.dc-ic'), tmpEl = ctl && ctl.querySelector('.dc-tmp'), lastIc = '';
  function iconFor(w, night) {
    var cl = Math.max(w.cloud, w.rain * .95);
    if (w.storm && w.rain > .3) return ['storm', 'Storms'];
    if (w.rain > .3) return ['rain', w.rain < .45 ? 'Drizzle' : w.rain < .7 ? 'Light rain' : 'Rain'];
    if (w.fog > .4) return ['fog', 'Fog'];
    if (cl >= .72) return ['cloud', 'Cloudy'];
    if (cl > .32) return [night ? 'partmoon' : 'partsun', 'Partly cloudy'];
    return [night ? 'moon' : 'sun', 'Clear'];
  }
  function showClock(h, w, live) {
    if (!ctl) return;
    tEl.textContent = fmt(h);
    var ic = iconFor(w, look(h).night > .5);
    if (icEl && ic[0] !== lastIc) { lastIc = ic[0]; icEl.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[ic[0]] + '</svg>'; }
    if (tmpEl) tmpEl.textContent = live && typeof w.temp === 'number' ? w.temp + '°' : '';
    wEl.textContent = ic[1];
    ctl.setAttribute('aria-label', 'Ellis Street, ' + fmt(h) + (live ? ', now' : '') + ': ' + ic[1] + (live && typeof w.temp === 'number' ? ', ' + w.temp + ' degrees' : ''));
    if (rng && document.activeElement !== rng) rng.value = Math.round((((h % 24) + 24) % 24) * 60);
    ctl.classList.toggle('live', !!live);
  }

  /* ---------------------------------------------------------------- the time-lapse */
  var mode = 'intro', raf = 0;
  function nightish(h) { var r = refHour(h); return r < 6 || r > 20.4; }
  function bell(x, c, wdt) { var d = (x - c) / wdt; return Math.exp(-d * d); }
  function intro() {
    cancelAnimationFrame(raf); mode = 'intro'; if (typeof setPlay === 'function') setTimeout(setPlay, 0);
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
    var total = cum[steps], DUR = 50000, t0 = performance.now();
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
    cancelAnimationFrame(raf); mode = 'live'; if (typeof setPlay === 'function') setTimeout(setPlay, 0);
    var h = sfParts(new Date()).h, w = wxReal || WX;
    render(h, w); showClock(h, w, true);
    clearInterval(liveT); liveT = setInterval(function () { if (mode === 'live') { var hh = sfParts(new Date()).h, ww = wxReal || WX; render(hh, ww); showClock(hh, ww, true); } }, 60000);
  }
  function scrub(h) { cancelAnimationFrame(raf); mode = 'scrub'; setTimeout(setPlay, 0); var w = wxReal || WX; render(h, w); showClock(h, w, false); }

  var playB = hero.querySelector('.dc-play');
  function setPlay() { if (!playB) return; var on = mode === 'intro'; playB.classList.toggle('on', on); playB.querySelector('.lbl').textContent = on ? 'Skip to now' : 'Watch the last 24 hours'; playB.setAttribute('aria-pressed', String(on)); }
  if (playB) playB.addEventListener('click', function () { if (mode === 'intro') goLive(); else intro(); setPlay(); });
  if (ctl) {
    if (tog) tog.addEventListener('click', function () { var o = ctl.classList.toggle('open'); tog.setAttribute('aria-expanded', String(o)); });
    if (rng) rng.addEventListener('input', function () { scrub(+rng.value / 60); });
    if (liveB) liveB.addEventListener('click', function () { goLive(); });
    if (repB) repB.addEventListener('click', function () { intro(); });
  }

  /* ---------------------------------------------------------------- go */
  var wxP = loadWeather();
  clearInterval(wxT); wxT = setInterval(function () { loadWeather().then(function () { if (mode === 'live') goLive(); }); }, 15 * 60000);
  // open on the real sky; the 24-hour time-lapse plays only when someone asks for it
  mode = 'live'; render(now0.h, WX); showClock(now0.h, WX, true); setPlay();
  wxP.then(function () { if (mode === 'live') goLive(); });
})();
