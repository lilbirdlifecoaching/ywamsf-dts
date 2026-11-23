/* Blog posts: emoji reactions (all posts) and comments (posts with comments switched on).
   Talks to the YWAM SF admin service. Reactions are counted without sign-in; this browser remembers its own taps.
   Comments wait for an editor to approve them before they appear (the site rebuilds with them). */
(function () {
  var box = document.querySelector('[data-social]'); if (!box || !window.fetch) return;
  var api = box.getAttribute('data-api'), post = box.getAttribute('data-post'), KEY = 'ywamsf.reacted.' + post;
  var mine = {}; try { mine = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
  var btns = [].slice.call(box.querySelectorAll('.react')), counts = {};
  function show(c) {
    if (c) counts = c;
    btns.forEach(function (b) { var e = b.getAttribute('data-e'), n = counts[e] || 0; b.querySelector('.n').textContent = n ? String(n) : ''; b.setAttribute('aria-pressed', mine[e] ? 'true' : 'false'); });
  }
  function post_(path, body) { return fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || d.message || 'Something went wrong. Please try again.'); return d; }); }); }
  show();
  fetch(api + '/public/reactions?post=' + encodeURIComponent(post)).then(function (r) { return r.json(); }).then(function (d) { if (d.counts) show(d.counts); }).catch(function () {});
  btns.forEach(function (b) {
    b.addEventListener('click', function () {
      var e = b.getAttribute('data-e'), on = !mine[e];
      if (on) mine[e] = 1; else delete mine[e];
      try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch (x) {}
      counts[e] = Math.max(0, (counts[e] || 0) + (on ? 1 : -1)); show();
      b.classList.remove('pop'); void b.offsetWidth; if (on) b.classList.add('pop');
      post_('/public/react', { post: post, emoji: e, on: on }).then(function (d) { show(d.counts); }).catch(function () {});
    });
  });
  var f = box.querySelector('.cform'); if (!f) return;
  var st = f.querySelector('.cstatus'), btn = f.querySelector('button[type=submit]');
  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!f.reportValidity || f.reportValidity()) {
      btn.disabled = true; st.className = 'cstatus'; st.textContent = 'Sending…';
      post_('/public/comments', { post: post, name: f.name.value, email: f.email.value, text: f.text.value, website: f.website.value }).then(function (d) {
        st.className = 'cstatus ok'; st.textContent = d.message || 'Thanks! Your comment will appear once our team has read it.';
        f.text.value = ''; btn.disabled = false;
      }).catch(function (e) { st.className = 'cstatus err'; st.textContent = e.message; btn.disabled = false; });
    }
  });
})();
