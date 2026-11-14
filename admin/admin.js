/* YWAM San Francisco · site admin
   Content lives in /content/*.json in the GitHub repo; saving it rebuilds the site.

   Two ways to run, chosen by <meta name="admin-service"> in index.html:
   1. Service mode (the meta has the service's address). Everyone signs in with email + password to the
      YWAM SF admin service (a Cloudflare Worker, see /service). The service holds the only GitHub key and
      enforces the three levels: administrators and editors publish, contributors submit changes for
      approval. Invites and "Forgot password?" work by email. Comments, approvals, people and history
      are managed here.
   2. Key mode (the meta is empty; the original setup). Each editor unlocks the site's GitHub key with
      their own password (AES-256-GCM, PBKDF2-SHA256 600,000 rounds, copies in admin/keys.json). Everyone
      can publish everything.

   Everything shown on screen is built with textContent / DOM APIs, never innerHTML with editable values,
   and the page's CSP blocks any other script or connection. */
(function () {
  'use strict';
  if (window.top !== window.self) { document.body.textContent = ''; return; }   // no framing

  var REPO = 'lilbirdlifecoaching/ywamsf-dts', BRANCH = 'main', API = 'https://api.github.com';
  var KEYS_PATH = 'admin/keys.json', ITER = 600000, IDLE_MS = 30 * 60 * 1000, MIN_PW = 14;
  var SITE = 'https://ywamembers.org/ywam7/';
  var SERVICE = ((document.querySelector('meta[name="admin-service"]') || {}).content || '').replace(/\/+$/, '');
  var LS = { get: function (k) { try { return localStorage.getItem('ywamadmin.' + k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem('ywamadmin.' + k, v); } catch (e) {} } };
  var SS = { get: function (k) { try { return sessionStorage.getItem('ywamadmin.' + k); } catch (e) { return null; } }, set: function (k, v) { try { if (v == null) sessionStorage.removeItem('ywamadmin.' + k); else sessionStorage.setItem('ywamadmin.' + k, v); } catch (e) {} } };

  /* ------------------------------------------------------------------ tiny DOM helper */
  function h(tag, attrs) {
    var el = document.createElement(tag), kids = [].slice.call(arguments, 2);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'style') el.style.cssText = v;   // CSSOM, allowed by the CSP
      else el.setAttribute(k, v === true ? '' : v);
    });
    kids.forEach(function add(c) { if (c == null || c === false) return; if (Array.isArray(c)) return c.forEach(add); el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  }
  var app = document.getElementById('app');
  function mount(node) { app.className = ''; app.textContent = ''; app.appendChild(node); }
  var toastEl;
  function toast(msg, bad) {
    if (!toastEl) { toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.className = 'toast'; }, bad ? 6500 : 3400);
  }

  /* ------------------------------------------------------------------ base64 + crypto (key mode) */
  function b64(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { var bin = atob(s), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
  function utf8b64(str) { return b64(new TextEncoder().encode(str)); }
  function b64utf8(s) { return new TextDecoder().decode(unb64(s.replace(/\s/g, ''))); }
  var enc = new TextEncoder();
  function norm(name) { return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  function deriveKey(pw, salt, iter) {
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function sealToken(token, name, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(pw, salt, ITER).then(function (key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: enc.encode(norm(name)) }, key, enc.encode(token));
    }).then(function (ct) { return { name: String(name).trim(), iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct), added: new Date().toISOString().slice(0, 10) }; });
  }
  function openToken(u, pw) {
    return deriveKey(pw, unb64(u.salt), u.iter || ITER).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(u.iv), additionalData: enc.encode(norm(u.name)) }, key, unb64(u.ct));
    }).then(function (pt) { return new TextDecoder().decode(pt); });
  }

  /* ------------------------------------------------------------------ GitHub API (key mode) */
  var TOKEN = null, ME = null, KEYS = null, KEYS_SHA = null, TOKEN_EXPIRES = null, CAN_ACTIONS = true;
  function gh(method, path, body) {
    return fetch(API + path, {
      method: method, cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      var exp = r.headers.get('github-authentication-token-expiration'); if (exp) TOKEN_EXPIRES = exp;
      if (r.status === 204) return null;
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error((j && j.message) || ('GitHub error ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function readFile(path) { return gh('GET', '/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH + '&t=' + Date.now()).then(function (j) { return { text: b64utf8(j.content || ''), sha: j.sha }; }); }
  function commitFiles(files, message) {   // one commit containing several files: [{path, text} | {path, base64}]
    var base, tree;
    return gh('GET', '/repos/' + REPO + '/git/ref/heads/' + BRANCH).then(function (ref) {
      base = ref.object.sha; return gh('GET', '/repos/' + REPO + '/git/commits/' + base);
    }).then(function (c) {
      tree = c.tree.sha;
      return Promise.all(files.map(function (f) {
        return gh('POST', '/repos/' + REPO + '/git/blobs', { content: f.base64 != null ? f.base64 : utf8b64(f.text), encoding: 'base64' }).then(function (b) { return { path: f.path, mode: '100644', type: 'blob', sha: b.sha }; });
      }));
    }).then(function (entries) { return gh('POST', '/repos/' + REPO + '/git/trees', { base_tree: tree, tree: entries }); })
      .then(function (t) { return gh('POST', '/repos/' + REPO + '/git/commits', { message: message, tree: t.sha, parents: [base] }); })
      .then(function (c) { return gh('PATCH', '/repos/' + REPO + '/git/refs/heads/' + BRANCH, { sha: c.sha, force: false }).then(function () { return c.sha; }); });
  }
  function currentSha(path) { return gh('GET', '/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH + '&t=' + Date.now()).then(function (j) { return j.sha; }, function (e) { if (e.status === 404) return null; throw e; }); }
  function loadPublicKeys() { return fetch('keys.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : { users: [] }; }).catch(function () { return { users: [] }; }); }
  function saveKeys(newKeys, msg) {
    return currentSha(KEYS_PATH).then(function (sha) {
      return gh('PUT', '/repos/' + REPO + '/contents/' + KEYS_PATH, { message: msg, content: utf8b64(JSON.stringify(newKeys, null, 2) + '\n'), sha: sha || undefined, branch: BRANCH });
    }).then(function (r) { KEYS = newKeys; KEYS_SHA = r.content.sha; });
  }
  function loadKeysFresh() { return readFile(KEYS_PATH).then(function (f) { KEYS = JSON.parse(f.text); KEYS_SHA = f.sha; }, function () {}); }

  /* ------------------------------------------------------------------ admin service (service mode) */
  var STOKEN = null, USER = null, WAITING = {};
  function api(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (STOKEN) headers.Authorization = 'Bearer ' + STOKEN;
    return fetch(SERVICE + path, { method: method, headers: headers, cache: 'no-store', referrerPolicy: 'no-referrer', body: body ? JSON.stringify(body) : undefined })
      .catch(function () { var e = new Error('Couldn’t reach the admin service. Check your internet connection.'); e.status = 0; throw e; })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) {
            var e = new Error(j.error || ('Error ' + r.status)); e.status = r.status; e.data = j;
            if (r.status === 401 && STOKEN && path !== '/auth/logout') { STOKEN = null; SS.set('token', null); DIRTY = false; setTimeout(function () { showLogin(e.message); }, 0); }
            throw e;
          }
          return j;
        });
      });
  }
  function startSession(r) { STOKEN = r.token; SS.set('token', STOKEN); USER = r.user; ME = USER.name; touch(); }

  /* One interface for both modes. */
  var PRACTICE = false;
  var store = {
    read: function (path) {
      if (SERVICE) return api('GET', '/content?path=' + encodeURIComponent(path)).then(function (r) { return { text: r.content, sha: r.sha, pending: r.pending }; });
      return readFile(path);
    },
    save: function (path, text, summary, sha, photos) {
      if (PRACTICE) return new Promise(function (res) { setTimeout(function () { res({ published: !SERVICE || ROLE() !== 'contributor', practice: true }); }, 700); });
      if (SERVICE) {
        var up = Promise.resolve();
        Object.keys(photos).forEach(function (p) { up = up.then(function () { return api('POST', '/upload', { name: p.replace(/^uploads\//, ''), data: photos[p] }).catch(function (e) { if (e.status !== 409) throw e; }); }); });
        return up.then(function () { return api('PUT', '/content', { path: path, content: text, summary: summary, base_sha: sha }); });
      }
      return currentSha(path).then(function (cur) {
        if (cur && sha && cur !== sha) { var e = new Error('Someone else changed this section while you were editing. Copy anything you need, then reload the section.'); e.conflict = true; throw e; }
        var files = [{ path: path, text: text }].concat(Object.keys(photos).map(function (p) { return { path: 'content/' + p, base64: photos[p] }; }));
        return commitFiles(files, summary + ': updated by ' + ME + ' (site admin)');
      }).then(function (commit) { return { published: true, commit: commit }; });
    },
    history: function (path) {
      if (SERVICE) return api('GET', '/history?path=' + encodeURIComponent(path)).then(function (r) { return r.versions; });
      return gh('GET', '/repos/' + REPO + '/commits?sha=' + BRANCH + '&path=' + encodeURIComponent(path) + '&per_page=30').then(function (list) { return list.map(function (c) { return { sha: c.sha, message: c.commit.message.split('\n')[0], who: c.commit.author.name, date: c.commit.author.date }; }); });
    },
    version: function (path, sha) {
      if (SERVICE) return api('GET', '/history?path=' + encodeURIComponent(path) + '&sha=' + sha).then(function (r) { return r.content; });
      return gh('GET', '/repos/' + REPO + '/contents/' + path + '?ref=' + sha).then(function (j) { return b64utf8(j.content || ''); });
    },
    restore: function (path, sha, label) {
      if (PRACTICE) return Promise.resolve();
      if (SERVICE) return api('POST', '/history/restore', { path: path, sha: sha });
      return store.version(path, sha).then(function (text) { return commitFiles([{ path: path, text: text }], label + ': restored an earlier version by ' + ME + ' (site admin)'); });
    },
    recent: function () {
      if (SERVICE) return Promise.resolve(null);
      return gh('GET', '/repos/' + REPO + '/commits?sha=' + BRANCH + '&path=content&per_page=10');
    }
  };
  function ROLE() { return SERVICE ? (USER && USER.role) : 'admin'; }
  function ROLE_LABEL() { return SERVICE ? (USER && USER.roleName) : 'Editor'; }
  function isReviewer() { return SERVICE && USER && USER.role !== 'contributor'; }

  /* ------------------------------------------------------------------ session */
  var idleT;
  function touch() { clearTimeout(idleT); if (TOKEN || STOKEN) idleT = setTimeout(function () { logout('You were signed out after 30 minutes without activity.'); }, IDLE_MS); }
  ['click', 'keydown', 'pointermove', 'scroll'].forEach(function (ev) { document.addEventListener(ev, touch, { passive: true }); });
  function logout(msg) {
    if (SERVICE && STOKEN) api('POST', '/auth/logout').catch(function () {});
    TOKEN = null; STOKEN = null; SS.set('token', null); USER = null; ME = null; DIRTY = false; PRACTICE = false; clearTimeout(idleT); showLogin(msg);
  }
  window.addEventListener('beforeunload', function (e) { if (DIRTY && !PRACTICE) { e.preventDefault(); e.returnValue = ''; } });

  /* ------------------------------------------------------------------ sign-in screens */
  function gate(cardKids, wide) { return h('div', { class: 'gate' }, h('div', { class: 'gate-card' + (wide ? ' wide' : '') }, h('div', { class: 'gate-mark', text: 'YWAM SAN FRANCISCO' }), cardKids)); }
  function field(label, input, hint) { return h('label', { class: 'fld' }, h('span', { text: label }), input, hint ? h('small', { text: hint }) : null); }
  function pwCheck(pw, name, min) {
    min = min || MIN_PW;
    if (pw.length < min) return 'Use at least ' + min + ' characters. A short sentence or four random words works well.';
    if (norm(name) && norm(pw).indexOf(norm(name)) >= 0) return 'Please don’t include your name in the password.';
    if (/^(.)\1+$/.test(pw) || /^(password|ywam|letmein|1234)/i.test(pw)) return 'That password is too easy to guess.';
    return '';
  }
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }

  function boot() {
    if (!window.crypto || !crypto.subtle) { mount(gate([h('h1', { text: 'Secure connection needed' }), h('p', { text: 'Open this page over https (ywamembers.org/admin/) in an up-to-date browser.' })])); return; }
    if (!SERVICE) { loadPublicKeys().then(function (k) { KEYS = k && Array.isArray(k.users) ? k : { version: 1, users: [] }; if (KEYS.users.length) showLogin(); else showSetup(); }); return; }
    var m = /^#(invite|reset)=([A-Za-z0-9_-]{20,})$/.exec(location.hash);
    if (m) { history.replaceState(null, '', location.pathname); return m[1] === 'invite' ? showInvite(m[2]) : showReset(m[2]); }
    var saved = SS.get('token');
    if (saved) { STOKEN = saved; return api('GET', '/me').then(function (r) { USER = r.user; ME = USER.name; WAITING = r.waiting || {}; touch(); showApp('overview'); }).catch(function () { STOKEN = null; SS.set('token', null); boot(); }); }
    api('GET', '/health').then(function (r) { if (r.setup) showServiceSetup(); else showLogin(); }).catch(function (e) { mount(gate([h('h1', { text: 'Can’t reach the admin' }), h('p', { text: e.message + ' If this keeps happening, tell the site manager.' }), h('button', { class: 'btn', type: 'button', text: 'Try again', onclick: boot })])); });
  }

  function showLogin(msg) {
    if (SERVICE) return showServiceLogin(msg);
    var name = h('input', { autocomplete: 'username', required: true, autocapitalize: 'words' });
    var pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    var err = h('p', { class: 'err', role: 'alert', text: msg || '' });
    var btn = h('button', { class: 'btn', type: 'submit', text: 'Log in' });
    var form = h('form', { onsubmit: function (e) {
      e.preventDefault(); err.textContent = '';
      var u = KEYS.users.filter(function (x) { return norm(x.name) === norm(name.value); })[0];
      busy(btn, true, 'Checking…');
      var fail = function () { busy(btn, false, 'Log in'); err.textContent = 'That name and password don’t match.'; pw.value = ''; pw.focus(); };
      if (!u) { setTimeout(fail, 900); return; }
      openToken(u, pw.value).then(function (tok) {
        TOKEN = tok; ME = u.name; pw.value = '';
        return gh('GET', '/repos/' + REPO).then(function () { touch(); showApp('overview'); });
      }, fail).catch(function (e) {
        TOKEN = null; busy(btn, false, 'Log in');
        err.textContent = (e.status === 401 || e.status === 403) ? 'The site’s GitHub key has expired or been revoked. Ask whoever set up the admin to replace it.' : 'Couldn’t reach GitHub: ' + e.message;
      });
    } }, field('Your name', name), field('Password', pw), err, btn);
    mount(gate([h('span', { class: 'kick', text: 'Site admin' }), h('h1', { text: 'Welcome back.' }), h('p', { text: 'Log in to update staff, DTS dates, shifts, events and more.' }), form,
      h('p', { class: 'gate-foot', text: 'Forgotten your password? Ask another editor to remove you and add you again.' })]));
    name.focus();
  }
  function showServiceLogin(msg) {
    var email = h('input', { type: 'email', autocomplete: 'username', required: true, autocapitalize: 'off', spellcheck: 'false' });
    var pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    var err = h('p', { class: 'err', role: 'alert', text: msg || '' });
    var btn = h('button', { class: 'btn', type: 'submit', text: 'Sign in' });
    var form = h('form', { onsubmit: function (e) {
      e.preventDefault(); err.textContent = ''; busy(btn, true, 'Signing in…');
      api('POST', '/auth/login', { email: email.value, password: pw.value }).then(function (r) { pw.value = ''; startSession(r); return api('GET', '/me'); })
        .then(function (r) { WAITING = r.waiting || {}; showApp('overview'); })
        .catch(function (e) { busy(btn, false, 'Sign in'); err.textContent = e.message; pw.value = ''; pw.focus(); });
    } }, field('Email', email), field('Password', pw), err, btn);
    mount(gate([h('span', { class: 'kick', text: 'Site admin' }), h('h1', { text: 'Welcome back.' }), h('p', { text: 'Sign in to update the YWAM San Francisco website.' }), form,
      h('p', { class: 'gate-foot' }, h('button', { class: 'link', type: 'button', text: 'Forgot password?', onclick: function () { showForgot(email.value); } }))]));
    email.focus();
  }
  function showForgot(prefill) {
    var email = h('input', { type: 'email', autocomplete: 'username', required: true, value: prefill || '' });
    var err = h('p', { class: 'err', role: 'alert' }), btn = h('button', { class: 'btn', type: 'submit', text: 'Email me a reset link' });
    var body = h('div', null, h('form', { onsubmit: function (e) {
      e.preventDefault(); err.textContent = ''; busy(btn, true, 'Sending…');
      api('POST', '/auth/forgot', { email: email.value }).then(function () {
        body.textContent = ''; body.appendChild(h('p', { class: 'okmsg', text: 'Check your email.' })); body.appendChild(h('p', { text: 'If ' + email.value + ' has access, a link to choose a new password is on its way. It works for 2 hours. (Check your spam folder too.)' }));
      }).catch(function (e) { busy(btn, false, 'Email me a reset link'); err.textContent = e.message; });
    } }, field('Your email', email), err, btn));
    mount(gate([h('span', { class: 'kick', text: 'Forgot password' }), h('h1', { text: 'Reset your password.' }), h('p', { text: 'We’ll email you a link to choose a new one.' }), body,
      h('p', { class: 'gate-foot' }, h('button', { class: 'link', type: 'button', text: '← Back to sign in', onclick: function () { showLogin(); } }))]));
    email.focus();
  }
  function newPasswordForm(intro, btnText, submit, withName) {
    var name = withName ? h('input', { autocomplete: 'name', value: withName }) : null;
    var pw = h('input', { type: 'password', autocomplete: 'new-password', required: true }), pw2 = h('input', { type: 'password', autocomplete: 'new-password', required: true });
    var err = h('p', { class: 'err', role: 'alert' }), btn = h('button', { class: 'btn', type: 'submit', text: btnText });
    return h('form', { onsubmit: function (e) {
      e.preventDefault(); err.textContent = '';
      var bad = pwCheck(pw.value, name ? name.value : '', 10); if (bad) { err.textContent = bad; return; }
      if (pw.value !== pw2.value) { err.textContent = 'The two passwords don’t match.'; return; }
      busy(btn, true, 'Saving…');
      submit(pw.value, name ? name.value : '').catch(function (e) { busy(btn, false, btnText); err.textContent = e.message; });
    } }, intro, name ? field('Your name', name, 'Shown on every change you make.') : null, field('New password', pw, 'At least 10 characters. A short sentence or four random words works well.'), field('New password again', pw2), err, btn);
  }
  function afterSignIn(r, msg) { startSession(r); return api('GET', '/me').then(function (m) { WAITING = m.waiting || {}; showApp('overview'); toast(msg); }); }
  function showReset(token) {
    mount(gate([h('span', { class: 'kick', text: 'New password' }), h('h1', { text: 'Choose a new password.' }),
      newPasswordForm(null, 'Save and sign in', function (pw) { return api('POST', '/auth/reset', { token: token, password: pw }).then(function (r) { return afterSignIn(r, 'Password changed. You’re signed in.'); }); })]));
  }
  function showInvite(token) {
    mount(gate([h('p', { class: 'loading', text: 'Checking your invitation…' })]));
    api('POST', '/auth/invite-info', { token: token }).then(function (inf) {
      mount(gate([h('span', { class: 'kick', text: 'Welcome' }), h('h1', { text: 'Set up your account.' }),
        h('p', { text: 'You’ve been given ' + inf.roleName + ' access to the YWAM San Francisco website, as ' + inf.email + '. Choose a password to finish.' }),
        newPasswordForm(null, 'Create my account', function (pw, name) { return api('POST', '/auth/accept', { token: token, password: pw, name: name }).then(function (r) { return afterSignIn(r, 'Welcome, ' + r.user.name.split(' ')[0] + '!'); }); }, inf.name)]));
    }).catch(function (e) { mount(gate([h('h1', { text: 'This link doesn’t work' }), h('p', { text: e.message }), h('button', { class: 'btn', type: 'button', text: 'Go to sign in', onclick: function () { showLogin(); } })])); });
  }
  function showServiceSetup() {
    var key = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false' }), name = h('input', { autocomplete: 'name' }), email = h('input', { type: 'email', autocomplete: 'username' });
    var form = newPasswordForm(h('div', null, field('Setup key', key, 'The SETUP_KEY you saved on Cloudflare.'), field('Your email', email)), 'Finish setup', function (pw, nm) {
      return api('POST', '/setup', { setup_key: key.value, email: email.value, name: nm, password: pw }).then(function (r) { key.value = ''; return afterSignIn(r, 'Setup complete. Welcome, ' + r.user.name.split(' ')[0] + '.'); });
    }, ' ');
    mount(gate([h('span', { class: 'kick', text: 'First-time setup' }), h('h1', { text: 'Create the first administrator.' }), h('p', { text: 'This is a one-time step. After this, invite everyone else from People.' }), form]));
  }
  function showSetup() {   // key mode
    var tok = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'github_pat_…' });
    var name = h('input', { autocomplete: 'name' }), pw = h('input', { type: 'password', autocomplete: 'new-password' }), pw2 = h('input', { type: 'password', autocomplete: 'new-password' });
    var err = h('p', { class: 'err', role: 'alert' }), btn = h('button', { class: 'btn', type: 'submit', text: 'Finish setup' });
    var form = h('form', { onsubmit: function (e) {
      e.preventDefault(); err.textContent = '';
      var t = tok.value.trim();
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) { err.textContent = 'That doesn’t look like a GitHub token. It should start with github_pat_.'; return; }
      if (!name.value.trim()) { err.textContent = 'Add your name.'; return; }
      var bad = pwCheck(pw.value, name.value); if (bad) { err.textContent = bad; return; }
      if (pw.value !== pw2.value) { err.textContent = 'The two passwords don’t match.'; return; }
      busy(btn, true, 'Encrypting and saving…'); TOKEN = t;
      gh('GET', '/repos/' + REPO + '/contents/content/settings.json?ref=' + BRANCH).then(function () { return sealToken(t, name.value, pw.value); })
        .then(function (u) { return saveKeys({ version: 1, repo: REPO, users: [u] }, 'Admin setup: add editor ' + u.name); })
        .then(function () { ME = name.value.trim(); tok.value = ''; pw.value = ''; pw2.value = ''; touch(); showApp('overview'); toast('Setup complete. Welcome, ' + ME + '.'); })
        .catch(function (e) { TOKEN = null; busy(btn, false, 'Finish setup'); err.textContent = (e.status === 401) ? 'GitHub didn’t accept that token.' : (e.status === 403 || e.status === 404) ? 'That token can’t write to the site. Check it has Contents: Read and write on ' + REPO + '.' : 'Something went wrong: ' + e.message; });
    } },
      field('GitHub token', tok, 'Used once to set things up. It’s stored only in encrypted form.'), field('Your name', name, 'Shown on every change you make.'),
      field('Choose a password', pw, 'At least ' + MIN_PW + ' characters. A short sentence or four random words works well.'), field('Password again', pw2), err, btn);
    mount(gate([h('span', { class: 'kick', text: 'First-time setup' }), h('h1', { text: 'Set up the site admin.' }),
      h('p', { text: 'This is a one-time step for whoever looks after the site. You’ll create a GitHub key that can only edit this one website, then lock it with your password.' }),
      h('ol', null,
        h('li', null, 'On GitHub, open Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.'),
        h('li', null, 'Resource owner: ', h('code', { text: REPO.split('/')[0] }), '. Repository access: Only select repositories → ', h('code', { text: REPO.split('/')[1] }), '.'),
        h('li', null, 'Permissions: Contents → Read and write. Optionally Actions → Read-only, so the admin can show when changes are live.'),
        h('li', null, 'Set an expiry (up to a year), generate it, and paste it below.')),
      form], true));
  }

  /* ------------------------------------------------------------------ content schemas */
  var DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  var CATS = [['room', 'Ellis Room'], ['word', 'Church & Bible study'], ['care', 'Showers, haircuts & care'], ['food', 'Food'], ['out', 'Street & SRO outreach']];
  var COLOURS = ['#C99634', '#465361', '#8A5A3C', '#9A1E14', '#2E7D6B', '#95A7AD', '#6E9CBF', '#26313B'];
  var F = {
    text: function (k, l, o) { return Object.assign({ k: k, l: l, t: 'text' }, o); },
    area: function (k, l, o) { return Object.assign({ k: k, l: l, t: 'area', full: true }, o); },
    photo: function (k, l, o) { return Object.assign({ k: k, l: l || 'Photo', t: 'photo', full: true }, o); }
  };
  var SECTIONS = [
    { id: 'overview', grp: '', title: 'Overview' },
    { id: 'dts', grp: 'DTS', file: 'dts.json', title: 'DTS schools', page: 'course/',
      intro: 'Add each school once. The site always features the next school to start, everywhere it mentions DTS dates or cost: the cable car on the home page, the DTS page, the departures board and countdown, the check-in quiz and the Pay page. When a school starts, the next one takes over automatically overnight.',
      fields: [
        { k: 'schools', l: 'Schools', t: 'list', add: 'Add a school', title: function (x) { return x.start ? fmtRange(x.start, x.end) : 'New school'; }, sub: function (x) { return (x.name || 'Discipleship Training School') + (x.status ? ' · ' + x.status : ''); },
          blank: { name: 'Discipleship Training School', start: '', end: '', start_time: '09:00', cost: 8000, spots: '', status: 'Applications open', apply_url: '' },
          fields: [F.text('name', 'School name'), { k: 'start', l: 'First day', t: 'date', req: true }, { k: 'end', l: 'Last day', t: 'date', req: true }, { k: 't', l: '', t: 'none' },
            { k: 'start_time', l: 'Start time (for the countdown)', t: 'time' }, { k: 'cost', l: 'Cost (USD)', t: 'number' },
            { k: 'spots', l: 'Spots available', t: 'number', hint: 'Shown as “15 spots” on the DTS page and “15 LEFT” on the departures board. Update it as places fill. Leave blank to hide.' },
            { k: 'status', l: 'Status on the board', t: 'select', opts: ['Applications open', 'Now boarding', 'Almost full', 'Full', 'Waitlist'] },
            { k: 'apply_url', l: 'Application link (optional)', t: 'url', hint: 'Leave blank to use the main DTS application link from Settings.', full: true }] },
        F.area('cost_note', 'Small print under the cost')] },
    { id: 'testimonials', grp: 'DTS', file: 'testimonials.json', title: 'Testimonials', page: 'course/',
      intro: 'Student stories on the DTS page. Until you add some, three marked placeholders are shown.',
      fields: [{ k: 'testimonials', l: 'Testimonials', t: 'list', add: 'Add a testimonial', title: function (x) { return x.name || 'New testimonial'; }, sub: function (x) { return x.detail || ''; }, blank: { quote: '', name: '', detail: '' }, fields: [F.area('quote', 'Quote', { req: true }), F.text('name', 'Name'), F.text('detail', 'Detail', { hint: 'e.g. DTS 2024' })] }] },
    { id: 'faq', grp: 'DTS', file: 'faq.json', title: 'DTS FAQ', page: 'course/#cost',
      fields: [{ k: 'questions', l: 'Questions', t: 'list', add: 'Add a question', title: function (x) { return x.question || 'New question'; }, blank: { question: '', answer: '' }, fields: [F.text('question', 'Question', { req: true, full: true }), F.area('answer', 'Answer')] },
        F.area('parents_intro', 'For parents: intro'),
        { k: 'parents', l: 'For parents: questions', t: 'list', add: 'Add a question', title: function (x) { return x.question || 'New question'; }, blank: { question: '', answer: '' }, fields: [F.text('question', 'Question', { req: true, full: true }), F.area('answer', 'Answer')] }] },
    { id: 'dts_life', grp: 'DTS', file: 'dts_life.json', title: 'What it’s like', page: 'course/#life',
      intro: 'The “What it’s like” cards on the DTS page: the city, the building, where students live, eat and learn.',
      fields: [F.area('intro', 'Intro'), { k: 'places', l: 'Cards', t: 'list', add: 'Add a card', title: function (x) { return x.title || 'New card'; }, blank: { title: '', text: '', photo: '' }, fields: [F.text('title', 'Title', { req: true }), F.area('text', 'Text'), F.photo('photo', 'Photo', { hint: 'Landscape works best. It’s cropped to 4:3.' })] }] },
    { id: 'staff', grp: 'People', file: 'staff.json', title: 'Staff', page: 'about/people/',
      intro: 'Directors appear with a large photo. Everyone else is grouped by team with a small round photo. Without a photo, initials are shown.',
      fields: [
        { k: 'directors', l: 'Directors', t: 'list', add: 'Add a director', blank: { name: '', role: '', photo: '' }, fields: [F.text('name', 'Name', { req: true }), F.text('role', 'Role'), F.photo('photo', 'Photo', { hint: 'A portrait works best. It’s cropped to 4:5.' })] },
        { k: 'teams', l: 'Teams', t: 'list', add: 'Add a team', blank: { name: '', members: [] }, sub: function (x) { return (x.members || []).length + ' people'; },
          fields: [F.text('name', 'Team name', { req: true, full: true }), { k: 'members', l: 'People on this team', t: 'list', add: 'Add a person', blank: { name: '', photo: '' }, fields: [F.text('name', 'Name', { req: true }), F.photo('photo', 'Photo', { hint: 'Shown as a small circle, so a head-and-shoulders shot is best.' })] }] }] },
    { id: 'board', grp: 'People', file: 'board.json', title: 'Board', page: 'about/people/#board',
      fields: [{ k: 'members', l: 'Board members', t: 'list', add: 'Add a board member', blank: { name: '', role: '', photo: '', bio: '' }, fields: [F.text('name', 'Name', { req: true }), F.text('role', 'Role'), F.photo('photo'), F.area('bio', 'Short bio')] }] },
    { id: 'shifts', grp: 'Serve', file: 'shifts.json', title: 'Volunteer shifts', page: 'volunteer/',
      intro: 'These fill the departures board and the “Pick a shift” carousel on Come Volunteer. Days you tick light up as “Today” on those days.',
      fields: [{ k: 'shifts', l: 'Shifts', t: 'list', add: 'Add a shift', sub: function (x) { return [x.when, x.time].filter(Boolean).join(' · '); },
        blank: { title: '', when: '', time: '', days: [], every: 'every', photo: '', description: '', tags: [], colour: '#465361' },
        fields: [F.text('title', 'Shift name', { req: true }), F.text('when', 'When (shown on the board)', { hint: 'e.g. Thursdays, or Mon, Tue, Wed & Fri' }), F.text('time', 'Time', { hint: 'e.g. 1–4 pm' }),
          { k: 'every', l: 'How often', t: 'select', opts: [['every', 'Every week'], ['2nd & 4th', '2nd & 4th week of the month']] },
          { k: 'days', l: 'Days it runs', t: 'days', full: true }, F.area('description', 'What volunteers do'), { k: 'tags', l: 'Details shown as tags', t: 'tags', full: true, hint: 'Press Enter after each one, e.g. 18+ or Teams welcome.' },
          { k: 'colour', l: 'Card colour', t: 'colour', full: true }, F.photo('photo')] }] },
    { id: 'ministries', grp: 'Serve', file: 'ministries.json', title: 'Ministries', page: '#',
      intro: 'The “Neighborhood engagement” reel on the home page.',
      fields: [{ k: 'ministries', l: 'Ministries', t: 'list', add: 'Add a ministry', sub: function (x) { return x.when || ''; }, blank: { title: '', when: '', description: '', photo: '' }, fields: [F.text('title', 'Name', { req: true }), F.text('when', 'When', { hint: 'e.g. Thursdays or Friday nights' }), F.area('description', 'One-line description'), F.photo('photo')] }] },
    { id: 'ellis', grp: 'Serve', file: 'ellis_week.json', title: 'Ellis Room week', page: 'ellis-room/',
      intro: 'The weekly calendar on the Ellis Room page. It highlights today and anything happening right now, in San Francisco time.',
      fields: [{ k: 'entries', l: 'Weekly programs', t: 'list', add: 'Add a program', sort: true, title: function (x) { return (x.day || '?') + ' · ' + (x.title || 'New program'); }, sub: function (x) { return x.label || ''; },
        blank: { day: 'Mon', category: 'room', title: '', label: '', start: '10:00', end: '11:00', every: 'every' },
        fields: [{ k: 'day', l: 'Day', t: 'select', opts: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }, F.text('title', 'Program', { req: true }), { k: 'category', l: 'Type (sets the colour)', t: 'select', opts: CATS },
          { k: 'start', l: 'Starts', t: 'time' }, { k: 'end', l: 'Ends', t: 'time' }, F.text('label', 'Time as shown', { hint: 'e.g. 1:30–4 pm' }), { k: 'every', l: 'How often', t: 'select', opts: [['every', 'Every week'], ['2nd & 4th', '2nd & 4th week only']] }] }] },
    { id: 'events', grp: 'News', file: 'events.json', title: 'Events', page: 'about/news/',
      intro: 'Gatherings on News & Events. Give an event a date and it disappears from the site the day after.',
      fields: [{ k: 'events', l: 'Events', t: 'list', add: 'Add an event', sub: function (x) { return x.date ? 'On ' + fmtDate(x.date) : [x.when, x.when_detail].filter(Boolean).join(' '); }, blank: { title: '', when: '', when_detail: '', date: '', description: '' },
        fields: [F.text('title', 'Event', { req: true }), { k: 'date', l: 'Date (for one-off events)', t: 'date', hint: 'Leave blank for regular events.' }, F.text('when', 'Big label', { hint: 'e.g. Mon, or leave blank to use the date' }), F.text('when_detail', 'Small label', { hint: 'e.g. 5–9 pm' }), F.area('description', 'Description')] }] },
    { id: 'instagram', grp: 'News', file: 'instagram.json', title: 'Instagram cards', page: '#',
      intro: 'The Instagram carousel on the home page. Save a photo from a post, upload it here, and paste the post’s link.',
      fields: [{ k: 'posts', l: 'Posts', t: 'list', add: 'Add a post', title: function (x) { return x.caption || 'New post'; }, blank: { photo: '', caption: '', url: '' }, fields: [F.photo('photo', 'Photo', { req: true }), F.text('caption', 'Short caption', { full: true }), { k: 'url', l: 'Link to the post', t: 'url', full: true }] }] },
    { id: 'resources', grp: 'News', file: 'resources.json', title: 'Resources', page: 'about/resources/',
      intro: 'The resource library on About → Resources. The same groups appear as tabs at the bottom of the DTS page.',
      fields: [{ k: 'youtube_url', l: 'YouTube channel link', t: 'url', full: true },
        { k: 'groups', l: 'Groups', t: 'list', add: 'Add a group', sub: function (x) { return (x.items || []).length + ' links'; }, blank: { title: '', intro: '', items: [] },
          fields: [F.text('title', 'Group title', { req: true, full: true }), F.area('intro', 'One-line introduction'),
            { k: 'items', l: 'Links', t: 'list', add: 'Add a link', title: function (x) { return x.title || 'New link'; }, sub: function (x) { return x.by || ''; }, blank: { title: '', by: '', url: '' },
              fields: [F.text('title', 'Title', { req: true, full: true }), F.text('by', 'By (optional)'), { k: 'url', l: 'Link', t: 'url', req: true, hint: 'YouTube, Vimeo and PDF links are labelled automatically.' }] }] }] },
    { id: 'banner', grp: 'Site', file: 'banner.json', title: 'Announcement bar', page: '#',
      intro: 'A slim red bar across the top of every page, for things like closures or a big event.',
      fields: [{ k: 'show', l: 'Show the announcement bar', t: 'bool' }, F.text('text', 'Message', { full: true }), F.text('link_text', 'Link text (optional)'), { k: 'link_url', l: 'Link (optional)', t: 'url' }, { k: 'hide_after', l: 'Hide automatically after', t: 'date', hint: 'Optional. The bar disappears the day after this date.' }] },
    { id: 'settings', grp: 'Site', file: 'settings.json', title: 'Settings', page: 'contact/',
      intro: 'Contact details, key links and prices used across the site.',
      fields: [F.text('phone', 'Phone'), { k: 'email', l: 'Main email', t: 'email' }, { k: 'volunteer_email', l: 'Volunteering email', t: 'email' }, { k: 'outreach_email', l: 'Teams & outreach email', t: 'email' }, { k: 'dts_email', l: 'DTS email', t: 'email' }, { k: 'finance_email', l: 'Finance email (Give page: check, ACH, matching, wire, stock)', t: 'email' },
        F.text('address', 'Street address'), F.text('city', 'City, state & ZIP'),
        { k: 'dts_apply_url', l: 'DTS application link', t: 'url', full: true }, { k: 'team_booking_url', l: 'Mission Adventures booking link', t: 'url', full: true }, { k: 'give_online_url', l: 'Online giving link (Click & Pledge)', t: 'url', full: true },
        { k: 'ma_price_per_day', l: 'Mission Adventures price per person per day (USD)', t: 'number' },
        { k: 'hours', l: 'Opening hours (Contact page)', t: 'list', add: 'Add a line', title: function (x) { return x.label || 'New line'; }, sub: function (x) { return x.text || ''; }, blank: { label: '', text: '' }, fields: [F.text('label', 'Label', { req: true }), F.text('text', 'Hours')] }] },
    { id: 'editors', grp: 'Site', title: 'Editors & security' }
  ];
  // Show or hide whole sections of the website (administrators; others' changes wait for approval).
  SECTIONS.splice(SECTIONS.length - 1, 0, { id: 'switches', grp: 'Site', file: 'settings.json', title: 'Show or hide sections', page: '#',
    intro: 'Turn any section of any page on or off. A hidden section keeps its content, so you can turn it back on any time.',
    fields: [{ k: 'show_testimonial_placeholders', l: 'DTS page: show the student testimonials section even before real testimonials are added', t: 'bool' },
      { k: 'show_ellis_stories', l: 'Ellis Room page: show the example neighbor stories', t: 'bool' }] });
  SECTIONS.forEach(function (s) { if (s.id === 'settings') s.fields = s.fields.filter(function (f) { return !/^show_/.test(f.k); }); if (s.id === 'banner') s.intro = 'A slim bar that scrolls across the top of every page, for closures, big events or a call for volunteers.'; });
  SECTIONS = SECTIONS.filter(function (s) { return s.id !== 'editors'; });

  /* "How this works" panels: the exact steps for each section. */
  var HOWTO = {
    overview: ['Pick what you want to change in the menu on the left. It follows the order of the website.', 'Make your changes, then press the button at the bottom of the screen.', 'Changes go live on the website about two minutes after they’re published.'],
    dts: ['To add a school, press “Add a school” and fill in the first and last day. Everything else has a sensible starting value.', 'Update “Spots available” as places fill. Leave it blank to hide the number.', 'The site always features the next school to start. When a school begins, the next one takes over overnight.', 'Remove a school that was cancelled with the ✕ on its row.'],
    testimonials: ['Press “Add a testimonial”, paste the student’s words and add their name and school (for example “DTS 2025”).', 'Ask the student first; their name is shown on the website.', 'Until you add some, this section stays hidden (see Show or hide sections).'],
    faq: ['Each question opens and closes on the DTS page. Keep answers short and friendly.', 'Use the arrows to change the order. The first few are the ones people see first.', 'The “For parents” questions appear in their own tab.'],
    dts_life: ['Each card has a title, a sentence or two and a photo.', 'Landscape photos work best; they’re cropped to 4:3.'],
    staff: ['Directors appear first with a larger photo. Everyone else is listed under their team.', 'To add someone, open their team and press “Add a person”.', 'Photos: a head-and-shoulders shot works best. Without a photo, their initials are shown.'],
    board: ['Add each board member with their role and a short bio.'],
    shifts: ['Each shift is a row on the departures board and a card on the Come Volunteer page.', 'Tick the days it runs so it lights up as “Today” on those days.', '“Details shown as tags” are the small labels like “18+”. Press Enter after each one.'],
    ministries: ['These are the photo cards that scroll across the home page.', 'Keep the description to one line.'],
    ellis: ['Each program is one block in the weekly calendar on the Ellis Room page.', 'Set the start and end times; the page highlights what’s happening right now.', '“Time as shown” is the friendly label, like “1:30–4 pm”.'],
    events: ['For a one-off event, set its date: it disappears from the site the day after.', 'For regular gatherings, leave the date empty and write the day in “Big label”.'],
    instagram: ['Save a photo from an Instagram post, upload it here, and paste the link to the post.', 'Six to eight posts is plenty.'],
    resources: ['Resources are grouped. Each group becomes a tab.', 'Paste the link to a video, PDF or article. YouTube, Vimeo and PDF links are labelled automatically.'],
    banner: ['Tick “Show the announcement bar”, write a short message, and add a link if people should click through.', 'Set “Hide automatically after” so you don’t have to remember to turn it off.', 'The message scrolls across the top of every page.'],
    switches: ['Every section of every page is listed here, page by page. Switch one off to hide it from the website; its content is kept, so you can switch it back on any time.', 'Press Publish at the bottom. The page updates in about two minutes.', 'The header photo at the top of each page always shows.'],
    settings: ['Contact details, key links and prices used all over the site.', 'Change these carefully: they appear on many pages.'],
    approvals: ['Each card is a change someone submitted. “See what changed” shows the old and new text side by side.', 'Approve it to publish it, or Send back with a short note saying what to change.', 'They get an email either way.'],
    mine: ['Changes you submitted that are waiting for approval, and ones that were sent back with a note.', 'To fix a sent-back change, open that section: your version is still there. Make the change and submit it again.'],
    comments: ['New blog comments wait here until someone approves them.', 'Approve to show it under the post. Remove takes it down, even after it was approved.', 'The commenter’s email is only shown here, never on the website.'],
    people: ['Invite someone with their name, email and level. They get an email to choose their own password.', 'Administrators: everything, including people. Editors: publish anything except section switches, approve posts and comments. Contributors: everything waits for approval.', 'Turn someone off when they leave; you can turn them back on later.'],
    account: ['Change your password here. Forgot it? Use “Forgot password?” on the sign-in screen.'],
    guide: ['This page lists every “How this works” panel in one place. Press Print to keep a copy.']
  };
  function howto(id, open) {
    var steps = HOWTO[id]; if (!steps) return null;
    var seen = +(LS.get('howto.' + id) || 0); LS.set('howto.' + id, seen + 1);
    var d = h('details', { class: 'howto', 'data-tour': 'howto' }, h('summary', null, h('span', { class: 'q', 'aria-hidden': 'true', text: '?' }), 'How this works'), h('ol', null, steps.map(function (s) { return h('li', { text: s }); })));
    if (open || seen < 2) d.open = true;
    return d;
  }

  /* ------------------------------------------------------------------ formatting */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function fmtDate(s) { var d = pd(s); return d ? MON[d.m - 1] + ' ' + d.d + ', ' + d.y : (s || ''); }
  function fmtRange(a, b) { var x = pd(a), y = pd(b); if (!x) return 'New school'; if (!y) return fmtDate(a); return MON[x.m - 1] + ' ' + x.d + (x.y !== y.y ? ', ' + x.y : '') + ' – ' + MON[y.m - 1] + ' ' + y.d + ', ' + y.y; }
  function todaySF() { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function ago(t) { var ms = typeof t === 'number' ? t * 1000 : new Date(t).getTime(), s = (Date.now() - ms) / 1000; if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function chip(status) { var L = { pending: 'Waiting for approval', sent_back: 'Sent back', approved: 'Published', withdrawn: 'Withdrawn', rejected: 'Removed' }; return h('span', { class: 'chip ' + status, text: L[status] || status }); }

  /* ------------------------------------------------------------------ app shell */
  var CUR = null, DATA = null, SHA = null, DIRTY = false, PENDING = {}, PREVIEW = {};
  var shellEls = {};
  function extraNav() {
    var x = [];
    if (SERVICE) {
      if (isReviewer()) x.push({ id: 'approvals', title: 'Waiting for approval', badge: WAITING.changes });
      x.push({ id: 'mine', title: 'My submitted changes', badge: WAITING.sent_back, hide: ROLE() !== 'contributor' && !WAITING.mine });
      if (isReviewer()) x.push({ id: 'comments', title: 'Blog comments', badge: WAITING.comments });
      if (ROLE() === 'admin') x.push({ id: 'people', title: 'People' });
      x.push({ id: 'account', title: 'My account' });
    } else x.push({ id: 'editors', title: 'Editors & security' });
    x.push({ id: 'guide', title: 'Help guide' });
    return x.filter(function (i) { return !i.hide; });
  }
  function showApp(id) {
    var nav = h('nav', { 'aria-label': 'Sections', 'data-tour': 'nav' }), lastGrp = null;
    nav.appendChild(h('button', { class: 'nav', type: 'button', 'data-id': 'overview', onclick: function () { go('overview'); } }, 'Home'));
    if (SERVICE) {
      var tasks = extraNav().filter(function (i) { return ['approvals', 'mine', 'comments'].indexOf(i.id) >= 0; });
      if (tasks.length) { nav.appendChild(h('div', { class: 'grp', text: 'To do' })); tasks.forEach(navBtn); }
    }
    function navBtn(s) { nav.appendChild(h('button', { class: 'nav', type: 'button', 'data-id': s.id, onclick: function () { go(s.id); } }, s.title, s.badge ? h('span', { class: 'badge', text: String(s.badge), 'aria-label': s.badge + ' waiting' }) : null)); }
    SECTIONS.forEach(function (s) {
      if (s.id === 'overview') return;
      if (s.grp !== lastGrp && s.grp) nav.appendChild(h('div', { class: 'grp', text: s.grp }));
      lastGrp = s.grp; navBtn(s);
    });
    var tail = extraNav().filter(function (i) { return ['approvals', 'mine', 'comments'].indexOf(i.id) < 0; });
    nav.appendChild(h('div', { class: 'grp', text: 'You' })); tail.forEach(navBtn);
    var helpBtn = h('button', { class: 'help-btn', type: 'button', 'data-tour': 'help', onclick: function () { openHelp(helpBtn); } }, h('span', { class: 'q', 'aria-hidden': 'true', text: '?' }), 'Help & tour');
    var side = h('aside', { class: 'side' }, h('div', { class: 'brand' }, 'YWAM SAN FRANCISCO', h('small', { text: 'Site admin' })), nav, helpBtn,
      h('div', { class: 'who' }, 'Signed in as', h('b', { text: ME }), h('small', { class: 'lvl', text: ROLE_LABEL() }), h('button', { class: 'link', type: 'button', text: 'Sign out', onclick: function () { if (!DIRTY || PRACTICE || confirm('You have unsaved changes. Sign out anyway?')) logout('You’ve been signed out.'); } })));
    var main = h('main', { class: 'main', id: 'main' });
    var saveSt = h('span', { class: 'st' }), saveBtn = h('button', { class: 'btn', type: 'button', 'data-tour': 'save', text: 'Publish', onclick: save }), undoBtn = h('button', { class: 'btn ghost', type: 'button', text: 'Discard changes', onclick: function () { if (confirm('Discard your unsaved changes?')) go(CUR, true); } });
    var bar = h('div', { class: 'savebar', role: 'region', 'aria-label': 'Unsaved changes' }, saveSt, h('div', { class: 'acts' }, undoBtn, saveBtn));
    var practiceBar = h('div', { class: 'practice-bar', role: 'status' }, h('b', { text: 'Practice mode' }), ' Nothing you do here changes the website. ', h('button', { class: 'link', type: 'button', text: 'Leave practice mode', onclick: function () { setPractice(false); } }));
    shellEls = { side: side, nav: nav, main: main, bar: bar, saveSt: saveSt, saveBtn: saveBtn, practiceBar: practiceBar };
    mount(h('div', { class: 'shell' + (PRACTICE ? ' practicing' : '') }, practiceBar, side, main, bar));
    go(id, true);
    var toured = SERVICE ? (USER && USER.toured) : LS.get('toured.' + norm(ME));
    if (!toured) setTimeout(function () { startTour(); }, 600);
  }
  function refreshWaiting() { if (!SERVICE) return; api('GET', '/me').then(function (r) { WAITING = r.waiting || {}; USER = r.user; var keep = CUR; var d = DIRTY; if (!d) showAppKeep(keep); }).catch(function () {}); }
  function showAppKeep(id) { var y = window.scrollY; showApp(id); window.scrollTo(0, y); }
  function setDirty(v) { DIRTY = v; shellEls.bar.classList.toggle('on', v); shellEls.saveSt.textContent = v ? (PRACTICE ? 'Practice: you have unsaved changes.' : 'You have unsaved changes.') : ''; }
  function saveLabel(s) {
    if (!SERVICE) return 'Save & publish';
    var r = ROLE();
    if (r === 'admin') return 'Publish';
    if (r === 'editor' && s.id !== 'switches') return 'Publish';
    return 'Submit for approval';
  }
  function go(id, force) {
    if (!force && DIRTY && id !== CUR && !PRACTICE && !confirm('You have unsaved changes on this page. Leave without saving?')) return;
    CUR = id; DATA = null; SHA = null; PENDING = {}; setDirty(false);
    [].forEach.call(shellEls.nav.querySelectorAll('button.nav'), function (b) { if (b.getAttribute('data-id') === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    shellEls.side.classList.remove('open');
    var s = SECTIONS.filter(function (x) { return x.id === id; })[0];
    shellEls.main.textContent = '';
    shellEls.main.appendChild(h('p', { class: 'loading', text: 'Loading…' }));
    window.scrollTo(0, 0);
    var screens = { overview: renderOverview, editors: renderEditors, approvals: renderApprovals, mine: renderMine, comments: renderComments, people: renderPeople, account: renderAccount, guide: renderGuide };
    if (screens[id]) return screens[id]();
    shellEls.saveBtn.textContent = saveLabel(s);
    store.read('content/' + s.file).then(function (f) {
      DATA = JSON.parse(f.text || '{}'); SHA = f.sha;
      var note = null;
      if (f.pending) {
        try { DATA = JSON.parse(f.pending.content); } catch (e) {}
        note = f.pending.status === 'sent_back'
          ? h('div', { class: 'notice warn' }, h('b', { text: 'Sent back with a note: ' }), f.pending.note || '', h('br'), 'This is your version. Make the changes and submit it again.')
          : h('div', { class: 'notice' }, h('b', { text: 'Waiting for approval. ' }), 'You’re seeing the version you submitted ' + ago(f.pending.created) + '. Any new changes you submit replace it.');
      }
      renderSection(s, note);
    }).catch(function (e) { shellEls.main.textContent = ''; shellEls.main.appendChild(h('p', { class: 'err', text: 'Couldn’t load this section: ' + e.message })); });
  }
  function top(title, intro, acts) {
    return h('div', { class: 'mtop' }, h('div', null, h('button', { class: 'btn ghost small menu-btn', type: 'button', text: '☰ Menu', onclick: function () { shellEls.side.classList.add('open'); } }), h('h1', { text: title }), intro ? h('p', { text: intro }) : null), acts ? h('div', { class: 'acts' }, acts) : null);
  }

  /* ------------------------------------------------------------------ home */
  function renderOverview() {
    var main = shellEls.main; main.textContent = '';
    main.appendChild(top('Hello, ' + String(ME).split(' ')[0] + '.', SERVICE && ROLE() === 'contributor' ? 'Pick a section on the left. Your changes are sent to an editor or administrator to approve before they go live.' : 'Pick a section on the left to make changes. Published changes go live on the website in about two minutes.', [h('a', { class: 'btn ghost', href: SITE, target: '_blank', rel: 'noopener', text: 'View the site ↗' })]));
    main.appendChild(howto('overview'));
    var cards = h('div', { class: 'cards' }); main.appendChild(cards);
    if (SERVICE) {
      if (isReviewer()) {
        cards.appendChild(h('div', { class: 'card' + (WAITING.changes ? ' alert' : '') }, h('small', { class: 'kick', text: 'Waiting for your approval' }), h('b', { text: String(WAITING.changes || 0) }), h('p', { text: WAITING.changes ? 'Changes from contributors.' : 'Nothing waiting. 🎉' }), WAITING.changes ? h('button', { class: 'link', type: 'button', text: 'Review them', onclick: function () { go('approvals'); } }) : null));
        cards.appendChild(h('div', { class: 'card' + (WAITING.comments ? ' alert' : '') }, h('small', { class: 'kick', text: 'Blog comments' }), h('b', { text: String(WAITING.comments || 0) }), h('p', { text: 'waiting to be approved.' }), WAITING.comments ? h('button', { class: 'link', type: 'button', text: 'Moderate', onclick: function () { go('comments'); } }) : null));
      }
      if (WAITING.mine) cards.appendChild(h('div', { class: 'card' + (WAITING.sent_back ? ' alert' : '') }, h('small', { class: 'kick', text: 'Your submitted changes' }), h('b', { text: String(WAITING.mine) }), h('p', { text: WAITING.sent_back ? WAITING.sent_back + ' sent back with a note.' : 'Waiting for approval.' }), h('button', { class: 'link', type: 'button', text: 'See them', onclick: function () { go('mine'); } })));
    }
    store.read('content/dts.json').then(function (f) {
      var d = JSON.parse(f.text || '{}'), t = todaySF(), up = (d.schools || []).filter(function (x) { return x.start > t; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
      var nx = up[0];
      cards.appendChild(h('div', { class: 'card' + (nx ? '' : ' alert') }, h('small', { class: 'kick', text: 'Next DTS' }), h('b', { text: nx ? fmtRange(nx.start, nx.end) : 'No dates yet' }), h('p', { text: nx ? (up.length > 1 ? up.length - 1 + ' more school' + (up.length > 2 ? 's' : '') + ' after this.' : 'Add the following school when you have dates.') : 'The site shows no DTS dates. Add a school.' }), h('button', { class: 'link', type: 'button', text: 'Edit DTS schools', onclick: function () { go('dts'); } })));
    }).catch(function () {});
    store.read('content/banner.json').then(function (f) {
      var b = JSON.parse(f.text || '{}'), on = b.show && b.text && !(b.hide_after && b.hide_after < todaySF());
      cards.appendChild(h('div', { class: 'card' }, h('small', { class: 'kick', text: 'Announcement bar' }), h('b', { text: on ? 'Showing' : 'Off' }), h('p', { text: on ? b.text : 'Turn it on for closures or big news.' }), h('button', { class: 'link', type: 'button', text: 'Edit announcement', onclick: function () { go('banner'); } })));
    }).catch(function () {});
    if (!SERVICE) {
      var exp = TOKEN_EXPIRES ? new Date(TOKEN_EXPIRES.replace(' UTC', 'Z').replace(' ', 'T')) : null;
      if (exp && !isNaN(exp)) {
        var days = Math.round((exp - Date.now()) / 864e5);
        cards.appendChild(h('div', { class: 'card' + (days < 30 ? ' alert' : '') }, h('small', { class: 'kick', text: 'GitHub key' }), h('b', { text: days < 0 ? 'Expired' : 'Expires in ' + days + ' days' }), h('p', { text: days < 30 ? 'Replace it soon under Editors & security, or the admin will stop working.' : 'On ' + exp.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) + '.' })));
      }
      var hist = h('ul', { class: 'hist' });
      main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Recent changes' }), h('p', { class: 'hint', text: 'Every save is kept, so anything can be rolled back with the History button on each section.' }), hist));
      store.recent().then(function (list) {
        if (!list.length) hist.appendChild(h('li', null, h('span', { class: 'empty', text: 'No changes yet.' })));
        list.forEach(function (c) { hist.appendChild(h('li', null, h('span', { text: c.commit.message.split('\n')[0] }), h('time', { datetime: c.commit.author.date, text: ago(c.commit.author.date) }))); });
      }).catch(function () { hist.appendChild(h('li', null, h('span', { class: 'empty', text: 'Couldn’t load the history.' }))); });
    }
    main.appendChild(h('div', { class: 'panel tipbox' }, h('h2', { text: 'New here?' }), h('p', { class: 'hint', text: 'Take the two-minute tour, or switch on practice mode to try everything without changing the website.' }),
      h('div', { class: 'row' }, h('button', { class: 'btn slate', type: 'button', text: 'Take the tour', onclick: function () { startTour(); } }), h('button', { class: 'btn ghost', type: 'button', text: PRACTICE ? 'Leave practice mode' : 'Practice mode', onclick: function () { setPractice(!PRACTICE); } }))));
  }

  /* ------------------------------------------------------------------ generic editor */
  function renderSection(s, note) {
    var main = shellEls.main; main.textContent = '';
    var view = h('a', { class: 'btn ghost', href: SITE + (s.page && s.page !== '#' ? s.page : ''), target: '_blank', rel: 'noopener', text: 'View on site ↗' });
    var canHist = !SERVICE || ROLE() !== 'contributor';
    var histBtn = canHist ? h('button', { class: 'btn ghost', type: 'button', 'data-tour': 'history', text: 'History', onclick: function () { showHistory(s); } }) : null;
    main.appendChild(top(s.title, s.intro, [histBtn, view]));
    main.appendChild(howto(s.id));
    if (note) main.appendChild(note);
    main.appendChild(h('div', { id: 'pubstatus' }));
    if (s.id === 'switches') { renderSwitches(s, main); return; }
    var panel = h('div', { class: 'panel', 'data-tour': 'form' });
    panel.appendChild(fieldsFor(s.fields, DATA));
    main.appendChild(panel);
  }
  /* Show or hide sections: one switch per section of every page (the list comes from the site build). */
  function renderSwitches(s, main) {
    if (!Array.isArray(DATA.hidden_sections)) DATA.hidden_sections = [];
    var hidden = DATA.hidden_sections;
    var ph = h('div', { class: 'panel', 'data-tour': 'form' }, h('h2', { text: 'Placeholders' }), h('p', { class: 'hint', text: 'Sections that are hidden until real stories are ready.' }), fieldsFor(s.fields, DATA));
    main.appendChild(ph);
    var box = h('div', null, h('p', { class: 'loading', text: 'Loading the list of sections…' })); main.appendChild(box);
    fetch(SITE.replace(/^https:\/\/[^/]+/, '..') + 'sections.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      box.textContent = '';
      var hiddenCount = 0;
      d.pages.forEach(function (pg) {
        var list = h('div', { class: 'switches' });
        pg.sections.forEach(function (sec) {
          var on = hidden.indexOf(sec.id) < 0; if (!on) hiddenCount++;
          var cb = h('input', { type: 'checkbox', checked: on });
          var row = h('label', { class: 'toggle swrow' + (on ? '' : ' off') }, cb, h('span', { class: 'sw', 'aria-hidden': 'true' }), h('span', { class: 'swl' }, h('span', { text: sec.label }), h('small', { text: on ? 'Showing' : 'Hidden' })));
          cb.addEventListener('change', function () {
            var i = hidden.indexOf(sec.id);
            if (cb.checked && i >= 0) hidden.splice(i, 1);
            if (!cb.checked && i < 0) hidden.push(sec.id);
            row.classList.toggle('off', !cb.checked); row.querySelector('small').textContent = cb.checked ? 'Showing' : 'Hidden';
            changed();
          });
          list.appendChild(row);
        });
        box.appendChild(h('div', { class: 'panel' }, h('div', { class: 'swhead' }, h('h2', { text: pg.page }), h('a', { class: 'link', href: SITE + pg.path, target: '_blank', rel: 'noopener', text: 'View page ↗' })), list));
      });
      if (hiddenCount) box.insertBefore(h('div', { class: 'notice warn' }, hiddenCount + (hiddenCount === 1 ? ' section is' : ' sections are') + ' hidden right now.'), box.firstChild);
      box.appendChild(h('p', { class: 'hint', text: 'The page header (the photo at the top of each page) always shows. If a section’s heading is reworded, its switch starts again as “Showing”.' }));
    }).catch(function () { box.textContent = ''; box.appendChild(h('p', { class: 'err', text: 'Couldn’t load the list of sections. Try again in a minute.' })); });
  }
  function changed() { setDirty(true); }
  function fieldsFor(fields, obj) {
    var wrap = h('div', { class: 'grid' });
    fields.forEach(function (f) { if (f.t === 'none') return; var el = renderField(f, obj); if (f.full || f.t === 'list' || f.t === 'area' || f.t === 'photo' || f.t === 'bool') el.classList.add('full'); wrap.appendChild(el); });
    return wrap;
  }
  function inputFor(f, obj, type) {
    var i = h('input', { type: type, value: obj[f.k] == null ? '' : String(obj[f.k]), required: f.req || null });
    if (type === 'number') { i.min = '0'; i.step = '1'; i.inputMode = 'numeric'; }
    i.addEventListener('input', function () { obj[f.k] = type === 'number' ? (i.value === '' ? '' : +i.value) : i.value; changed(); i.dispatchEvent(new CustomEvent('retitle', { bubbles: true })); });
    return i;
  }
  function renderField(f, obj) {
    var t = f.t;
    if (t === 'text' || t === 'url' || t === 'email' || t === 'date' || t === 'time' || t === 'number') return field(f.l, inputFor(f, obj, t === 'text' ? 'text' : t), f.hint);
    if (t === 'area') { var a = h('textarea', { required: f.req || null }); a.value = obj[f.k] || ''; a.addEventListener('input', function () { obj[f.k] = a.value; changed(); a.dispatchEvent(new CustomEvent('retitle', { bubbles: true })); }); return field(f.l, a, f.hint); }
    if (t === 'select') {
      var sel = h('select'); f.opts.forEach(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; sel.appendChild(h('option', { value: v, text: l })); });
      if (obj[f.k] != null) sel.value = obj[f.k]; if (sel.value !== obj[f.k]) obj[f.k] = sel.value;
      sel.addEventListener('change', function () { obj[f.k] = sel.value; changed(); sel.dispatchEvent(new CustomEvent('retitle', { bubbles: true })); });
      return field(f.l, sel, f.hint);
    }
    if (t === 'bool') { var cb = h('input', { type: 'checkbox', checked: !!obj[f.k] }); cb.addEventListener('change', function () { obj[f.k] = cb.checked; changed(); }); return h('label', { class: 'toggle' }, cb, h('span', { class: 'sw', 'aria-hidden': 'true' }), h('span', { text: f.l })); }
    if (t === 'days') {
      var cur = (obj[f.k] || []).map(function (d) { return String(d).toUpperCase().slice(0, 3); });
      var box = h('div', { class: 'days' });
      DAYS.forEach(function (d) { var c = h('input', { type: 'checkbox', checked: cur.indexOf(d) >= 0 }); c.addEventListener('change', function () { obj[f.k] = DAYS.filter(function (x, i) { return box.querySelectorAll('input')[i].checked; }); changed(); }); box.appendChild(h('label', null, c, d.charAt(0) + d.slice(1).toLowerCase())); });
      return h('div', { class: 'fld' }, h('span', { text: f.l }), box, f.hint ? h('small', { text: f.hint }) : null);
    }
    if (t === 'tags') {
      if (!Array.isArray(obj[f.k])) obj[f.k] = [];
      var tw = h('div', { class: 'tags' }), ti = h('input', { placeholder: 'Add a tag…', 'aria-label': f.l });
      var draw = function () { tw.textContent = ''; obj[f.k].forEach(function (v, i) { tw.appendChild(h('span', { class: 'tag' }, v, h('button', { type: 'button', 'aria-label': 'Remove ' + v, text: '×', onclick: function () { obj[f.k].splice(i, 1); changed(); draw(); } }))); }); tw.appendChild(ti); };
      ti.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ',') && ti.value.trim()) { e.preventDefault(); obj[f.k].push(ti.value.trim().slice(0, 40)); ti.value = ''; changed(); draw(); ti.focus(); } });
      draw();
      return h('div', { class: 'fld' }, h('span', { text: f.l }), tw, f.hint ? h('small', { text: f.hint }) : null);
    }
    if (t === 'colour') {
      var cw = h('div', { class: 'colors', role: 'group', 'aria-label': f.l });
      COLOURS.forEach(function (c) { var b = h('button', { type: 'button', style: 'background:' + c, 'aria-label': 'Colour ' + c, 'aria-pressed': String(String(obj[f.k]).toUpperCase() === c) }); b.addEventListener('click', function () { obj[f.k] = c; changed(); [].forEach.call(cw.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }); cw.appendChild(b); });
      return h('div', { class: 'fld' }, h('span', { text: f.l }), cw);
    }
    if (t === 'photo') return photoField(f, obj);
    if (t === 'list') return listField(f, obj);
    return h('div');
  }

  function photoSrc(v) {
    if (!v) return '';
    if (PREVIEW[v]) return PREVIEW[v];
    if (/^uploads\/[A-Za-z0-9._-]+$/.test(v)) return '../content/' + v;
    if (/^https:\/\/images\.squarespace-cdn\.com\//.test(v)) return v.replace(/\?.*$/, '') + '?format=300w';
    return '';
  }
  function photoField(f, obj) {
    var pv, file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif' }), note = h('span', { class: 'new' });
    function draw() { var src = photoSrc(obj[f.k]); var n = src ? h('img', { class: 'pv', src: src, alt: '' }) : h('div', { class: 'pv none', text: 'No photo' }); if (pv) pv.replaceWith(n); pv = n; }
    draw();
    file.addEventListener('change', function () {
      var fl = file.files && file.files[0]; file.value = ''; if (!fl) return;
      note.textContent = 'Preparing photo…';
      resizeImage(fl, 1600).then(function (r) {
        var base = String(obj.name || obj.title || obj.caption || 'photo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'photo';
        var path = 'uploads/' + base + '-' + todaySF().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6) + '.jpg';
        PENDING[path] = r.base64; PREVIEW[path] = r.dataUrl; obj[f.k] = path; changed(); draw(); note.textContent = 'New photo, saved when you publish.';
        pv.dispatchEvent(new CustomEvent('retitle', { bubbles: true }));
      }).catch(function (e) { note.textContent = ''; toast(e.message, true); });
    });
    var pick = h('button', { class: 'btn slate small', type: 'button', text: obj[f.k] ? 'Replace photo' : 'Upload photo', onclick: function () { file.click(); } });
    var rm = h('button', { class: 'link', type: 'button', text: 'Remove photo', onclick: function () { obj[f.k] = ''; changed(); draw(); note.textContent = ''; pv.dispatchEvent(new CustomEvent('retitle', { bubbles: true })); } });
    return h('div', { class: 'fld' }, h('span', { text: f.l }), h('div', { class: 'photo' }, pv, h('div', { class: 'pa' }, pick, rm, note, file)), f.hint ? h('small', { text: f.hint }) : null);
  }
  function resizeImage(file, max) {
    if (file.size > 25 * 1024 * 1024) return Promise.reject(new Error('That photo is over 25 MB. Please choose a smaller one.'));
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var w = im.naturalWidth, hh = im.naturalHeight, s = Math.min(1, max / Math.max(w, hh));
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(hh * s);
        var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var dataUrl = c.toDataURL('image/jpeg', 0.85);
        res({ dataUrl: dataUrl, base64: dataUrl.split(',')[1] });
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('This browser can’t read that photo. Try a JPEG or PNG (on iPhone, Safari can convert HEIC photos).')); };
      im.src = url;
    });
  }

  function listField(f, obj) {
    if (!Array.isArray(obj[f.k])) obj[f.k] = [];
    var arr = obj[f.k], list = h('div', { class: 'list' });
    function itemTitle(x) { return f.title ? f.title(x) : (x.name || x.title || x.question || x.label || 'New item'); }
    function draw(openIdx) {
      list.textContent = '';
      if (!arr.length) list.appendChild(h('p', { class: 'empty', text: 'Nothing here yet.' }));
      arr.forEach(function (x, i) {
        var thumbF = f.fields.filter(function (q) { return q.t === 'photo'; })[0];
        var ttl = h('span', { class: 'ttl' }), thumb = null;
        function retitle() {
          ttl.textContent = ''; ttl.appendChild(document.createTextNode(itemTitle(x) || 'New item'));
          var sb = f.sub ? f.sub(x) : ''; if (sb) ttl.appendChild(h('small', { text: sb }));
          if (thumbF) { var src = photoSrc(x[thumbF.k]); var n = src ? h('img', { class: 'thumb', src: src, alt: '' }) : h('span', { class: 'thumb ini', text: (itemTitle(x) || '?').split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase() }); if (thumb) thumb.replaceWith(n); thumb = n; }
        }
        var up = h('button', { class: 'ib', type: 'button', 'aria-label': 'Move up', text: '↑', disabled: i === 0 || null, onclick: function (e) { e.stopPropagation(); arr.splice(i - 1, 0, arr.splice(i, 1)[0]); changed(); draw(); } });
        var dn = h('button', { class: 'ib', type: 'button', 'aria-label': 'Move down', text: '↓', disabled: i === arr.length - 1 || null, onclick: function (e) { e.stopPropagation(); arr.splice(i + 1, 0, arr.splice(i, 1)[0]); changed(); draw(); } });
        var del = h('button', { class: 'ib del', type: 'button', 'aria-label': 'Delete', text: '✕', onclick: function (e) { e.stopPropagation(); if (confirm('Delete “' + (itemTitle(x) || 'this item') + '”? It disappears from the site when you publish.')) { arr.splice(i, 1); changed(); draw(); } } });
        var item = h('div', { class: 'item' + (i === openIdx ? '' : ' closed') });
        var header = h('header', { role: 'button', tabindex: '0', 'aria-expanded': String(i === openIdx), onclick: function () { var c = item.classList.toggle('closed'); header.setAttribute('aria-expanded', String(!c)); }, onkeydown: function (e) { if (e.target === header && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); header.click(); } } });
        retitle();
        header.appendChild(h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }));
        if (thumb) header.appendChild(thumb);
        header.appendChild(ttl); header.appendChild(h('span', { class: 'tools' }, up, dn, del));
        var body = h('div', { class: 'body' }, fieldsFor(f.fields, x));
        body.addEventListener('retitle', function () { var old = thumb; retitle(); if (old && old !== thumb && !old.parentNode) header.insertBefore(thumb, ttl); });
        item.appendChild(header); item.appendChild(body); list.appendChild(item);
      });
    }
    draw();
    var add = h('button', { class: 'btn ghost small add', type: 'button', 'data-tour': 'add', text: '+ ' + (f.add || 'Add'), onclick: function () { arr.push(JSON.parse(JSON.stringify(f.blank || {}))); changed(); draw(arr.length - 1); var last = list.lastChild; if (last) { var inp = last.querySelector('input,textarea,select'); if (inp) inp.focus(); last.scrollIntoView({ block: 'nearest' }); } } });
    return h('div', { class: ((f.k === 'members' && obj.name !== undefined) || (f.k === 'items' && obj.title !== undefined)) ? 'sublist' : '' }, h('div', { class: 'fld', style: 'margin-bottom:8px' }, h('span', { text: f.l })), list, add);
  }

  /* ------------------------------------------------------------------ validation + save */
  function validate(fields, obj, path, errs) {
    fields.forEach(function (f) {
      var v = obj[f.k];
      if (f.t === 'list') { (v || []).forEach(function (x, i) { validate(f.fields, x, (f.title ? f.title(x) : (x.name || x.title || x.question || x.label || (f.l + ' #' + (i + 1)))), errs); }); return; }
      if (f.req && (v == null || String(v).trim() === '')) errs.push(path + ': “' + f.l + '” is required.');
      if (f.t === 'url' && v && !/^https?:\/\/[^\s<>"]+$/i.test(String(v).trim())) errs.push(path + ': “' + f.l + '” must be a web link starting with https://');
      if (f.t === 'email' && v && !/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(String(v).trim())) errs.push(path + ': “' + f.l + '” isn’t a valid email address.');
      if (f.t === 'number' && v !== '' && v != null && (isNaN(+v) || +v < 0)) errs.push(path + ': “' + f.l + '” must be a number.');
    });
    if (obj.start && obj.end && /^\d{4}-/.test(obj.start) && obj.end < obj.start && obj.cost !== undefined) errs.push(path + ': the last day is before the first day.');
    return errs;
  }
  function usedPhotos(o, out) { if (Array.isArray(o)) o.forEach(function (x) { usedPhotos(x, out); }); else if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { var v = o[k]; if (typeof v === 'string' && PENDING[v]) out[v] = 1; else usedPhotos(v, out); }); return out; }
  function save() {
    var s = SECTIONS.filter(function (x) { return x.id === CUR; })[0]; if (!s || !s.file) return;
    var errs = validate(s.fields, DATA, s.title, []);
    if (errs.length) { toast(errs[0], true); return; }
    var btn = shellEls.saveBtn, label = saveLabel(s); busy(btn, true, PRACTICE ? 'Practising…' : (label === 'Submit for approval' ? 'Submitting…' : 'Publishing…'));
    var photos = {}; Object.keys(usedPhotos(DATA, {})).forEach(function (p) { photos[p] = PENDING[p]; });
    store.save('content/' + s.file, JSON.stringify(DATA, null, 2) + '\n', s.title, SHA, photos).then(function (r) {
      PENDING = {}; setDirty(false); busy(btn, false, label);
      if (r.practice) { toast(r.published ? 'Practice: this would now be published.' : 'Practice: this would now be sent for approval.'); return; }
      if (!r.published) { toast('Sent for approval. ' + (r.reviewers ? 'We’ll email ' + r.reviewers + '.' : '')); refreshWaiting(); return; }
      toast('Published. It’ll be live in about two minutes.');
      return store.read('content/' + s.file).then(function (f) { SHA = f.sha; watchBuild(r.commit); });
    }).catch(function (e) {
      busy(btn, false, label);
      if (!SERVICE && e.status === 401) { logout('The GitHub key was rejected. It may have expired. Log in again, or ask the admin owner to replace the key.'); return; }
      if (e.status === 401) return;
      toast(e.conflict || e.status === 409 ? e.message : 'Couldn’t save: ' + e.message, true);
    });
  }
  function watchBuild(sha) {
    var box = document.getElementById('pubstatus'); if (!box) return;
    var st = h('div', { class: 'status', role: 'status' }, h('span', { class: 'sp' }), h('span', { text: 'Publishing your change…' }));
    box.textContent = ''; box.appendChild(st);
    var tries = 0, t0 = Date.now();
    function done(ok, msg) { st.className = 'status ' + (ok ? 'done' : 'fail'); st.lastChild.textContent = msg; }
    function poll() {
      var req = SERVICE ? api('GET', '/build').then(function (r) { var b = r.build; return b && new Date(b.at).getTime() > t0 - 5000 ? b : null; })
        : (!CAN_ACTIONS ? Promise.resolve('skip') : gh('GET', '/repos/' + REPO + '/actions/runs?head_sha=' + sha + '&per_page=1').then(function (r) { var run = r.workflow_runs && r.workflow_runs[0]; return run ? { status: run.status, conclusion: run.conclusion } : null; }));
      req.then(function (run) {
        if (run === 'skip') { setTimeout(function () { done(true, 'Saved. Your change should be live now (refresh the site to see it).'); }, 75000); return; }
        if (run && run.status === 'completed') {
          if (run.conclusion === 'success') setTimeout(function () { done(true, 'Live on the site. (Refresh the page to see it; it can take a minute to update everywhere.)'); }, 30000);
          else done(false, 'The site couldn’t rebuild with this change. Your edit is saved; let the site manager know.');
          return;
        }
        if (++tries < 40) setTimeout(poll, 6000); else done(true, 'Saved. It’s taking a while to publish; check the site in a few minutes.');
      }).catch(function (e) { if (!SERVICE && (e.status === 403 || e.status === 404)) { CAN_ACTIONS = false; poll(); } else if (++tries < 40) setTimeout(poll, 8000); });
    }
    setTimeout(poll, 8000);
  }

  /* ------------------------------------------------------------------ history and undo */
  function flatten(o, pre, out) {
    out = out || {};
    if (Array.isArray(o)) o.forEach(function (x, i) { flatten(x, pre + ' › ' + (x && (x.name || x.title || x.question || x.label) || '#' + (i + 1)), out); });
    else if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { flatten(o[k], pre ? pre + ' › ' + k : k, out); });
    else out[pre] = o == null ? '' : String(o);
    return out;
  }
  function diffView(oldText, newText) {
    var a = {}, b = {}; try { a = flatten(JSON.parse(oldText || '{}'), ''); } catch (e) {} try { b = flatten(JSON.parse(newText || '{}'), ''); } catch (e) {}
    var keys = Object.keys(Object.assign({}, a, b)).filter(function (k) { return a[k] !== b[k]; });
    if (!keys.length) return h('p', { class: 'empty', text: 'No differences.' });
    var t = h('table', { class: 'diff' }, h('thead', null, h('tr', null, h('th', { text: 'Where' }), h('th', { text: 'Before' }), h('th', { text: 'After' }))));
    var tb = h('tbody'); t.appendChild(tb);
    keys.slice(0, 60).forEach(function (k) { tb.appendChild(h('tr', null, h('td', { class: 'k', text: k }), h('td', { class: 'old', text: a[k] == null ? '—' : a[k] }), h('td', { class: 'new', text: b[k] == null ? '(removed)' : b[k] }))); });
    if (keys.length > 60) tb.appendChild(h('tr', null, h('td', { colspan: '3', class: 'empty', text: '…and ' + (keys.length - 60) + ' more differences.' })));
    return h('div', { class: 'diffwrap' }, t);
  }
  function showHistory(s) {
    var main = shellEls.main; main.textContent = '';
    main.appendChild(top('History: ' + s.title, 'Every published version is kept. Look at what changed, and put an earlier version back if something went wrong.', [h('button', { class: 'btn ghost', type: 'button', text: '← Back to editing', onclick: function () { go(s.id, true); } })]));
    var list = h('div', { class: 'list' }); main.appendChild(h('div', { class: 'panel' }, list));
    list.appendChild(h('p', { class: 'loading', text: 'Loading…' }));
    var path = 'content/' + s.file, canRestore = !SERVICE || ROLE() === 'admin';
    Promise.all([store.history(path), store.read(path)]).then(function (res) {
      var versions = res[0], live = res[1].text; list.textContent = '';
      if (!versions.length) list.appendChild(h('p', { class: 'empty', text: 'No history yet.' }));
      versions.forEach(function (v, i) {
        var box = h('div', { class: 'body' }), item = h('div', { class: 'item closed' });
        var header = h('header', { role: 'button', tabindex: '0', onclick: function () {
          var closed = item.classList.toggle('closed'); if (closed || box.childNodes.length) return;
          box.appendChild(h('p', { class: 'loading', text: 'Loading…' }));
          store.version(path, v.sha).then(function (text) {
            box.textContent = '';
            box.appendChild(h('p', { class: 'hint', text: i === 0 ? 'This is the version on the website now.' : 'Differences between this version and the one on the website now:' }));
            if (i) box.appendChild(diffView(live, text));
            if (i && canRestore) box.appendChild(h('button', { class: 'btn slate small', type: 'button', text: 'Put this version back', onclick: function (e) {
              if (!confirm('Put back the version from ' + ago(v.date) + '? The current version stays in the history, so you can undo this too.')) return;
              busy(e.target, true, 'Restoring…');
              store.restore(path, v.sha, s.title).then(function () { toast(PRACTICE ? 'Practice: this version would now be restored.' : 'Restored. It’ll be live in about two minutes.'); go(s.id, true); }).catch(function (er) { busy(e.target, false, 'Put this version back'); toast(er.message, true); });
            } }));
            if (i && !canRestore) box.appendChild(h('p', { class: 'hint', text: 'Only administrators can put an old version back.' }));
          }).catch(function (e) { box.textContent = ''; box.appendChild(h('p', { class: 'err', text: e.message })); });
        }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.click(); } } },
          h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }), h('span', { class: 'ttl' }, v.message.replace(/ \(site admin\)$/, ''), h('small', { text: (v.who ? v.who + ' · ' : '') + ago(v.date) })), i === 0 ? h('span', { class: 'chip approved', text: 'Live now' }) : null);
        item.appendChild(header); item.appendChild(box); list.appendChild(item);
      });
    }).catch(function (e) { list.textContent = ''; list.appendChild(h('p', { class: 'err', text: 'Couldn’t load the history: ' + e.message })); });
  }

  /* ------------------------------------------------------------------ approvals (service mode) */
  function sectionFor(path) { var f = path.replace(/^content\//, ''); return SECTIONS.filter(function (s) { return s.file === f; })[0]; }
  function renderApprovals() {
    var main = shellEls.main; main.textContent = '';
    main.appendChild(top('Waiting for approval', ROLE() === 'admin' ? 'Changes from contributors (and editors’ section switches). Approve to publish, or send back with a note.' : 'Blog posts and resources from contributors. Approve to publish, or send back with a note.'));
    main.appendChild(howto('approvals'));
    var wrap = h('div'); main.appendChild(wrap); wrap.appendChild(h('p', { class: 'loading', text: 'Loading…' }));
    api('GET', '/changes').then(function (r) {
      wrap.textContent = '';
      var pending = r.changes.filter(function (c) { return c.status === 'pending'; }), done = r.changes.filter(function (c) { return c.status !== 'pending'; });
      if (!pending.length) wrap.appendChild(h('div', { class: 'panel' }, h('p', { class: 'empty', text: 'Nothing is waiting. 🎉' })));
      pending.forEach(function (c) { wrap.appendChild(changeCard(c, true)); });
      if (done.length) { wrap.appendChild(h('h2', { class: 'subhead', text: 'Decided in the last two weeks' })); done.forEach(function (c) { wrap.appendChild(changeCard(c, false)); }); }
    }).catch(function (e) { wrap.textContent = ''; wrap.appendChild(h('p', { class: 'err', text: e.message })); });
  }
  function changeCard(c, actions) {
    var s = sectionFor(c.path), name = c.summary || (s && s.title) || c.path;
    var diffBox = h('div'), note = h('textarea', { placeholder: 'A short note for ' + c.who + ' (required to send back, optional to approve)', 'aria-label': 'Note' });
    var card = h('div', { class: 'panel change' },
      h('div', { class: 'chead' }, h('div', null, h('h3', { text: name }), h('p', { class: 'hint', text: 'From ' + c.who + ' · ' + ago(c.created) + (c.reviewer ? ' · ' + (c.status === 'approved' ? 'approved' : 'reviewed') + ' by ' + c.reviewer : '') })), chip(c.status)),
      c.note && !actions ? h('p', { class: 'cnote', text: '“' + c.note + '”' }) : null,
      h('button', { class: 'link', type: 'button', text: 'See what changed', onclick: function (e) {
        if (diffBox.childNodes.length) { diffBox.textContent = ''; e.target.textContent = 'See what changed'; return; }
        e.target.textContent = 'Hide changes'; diffBox.appendChild(h('p', { class: 'loading', text: 'Loading…' }));
        store.read(c.path).then(function (f) { diffBox.textContent = ''; diffBox.appendChild(diffView(f.text, c.content)); }).catch(function (er) { diffBox.textContent = er.message; });
      } }), diffBox);
    if (actions) {
      var ap = h('button', { class: 'btn', type: 'button', text: 'Approve & publish' }), sb = h('button', { class: 'btn ghost', type: 'button', text: 'Send back' });
      ap.addEventListener('click', function () {
        if (PRACTICE) { toast('Practice: this would be approved and published.'); return; }
        busy(ap, true, 'Publishing…');
        var go_ = function (force) { return api('POST', '/changes/' + c.id + '/approve', { note: note.value, force: force }); };
        go_(false).catch(function (e) {
          if (e.status === 409 && confirm('This section has changed since ' + c.who + ' submitted this. Approving will replace those newer changes with this version. Approve anyway?')) return go_(true);
          throw e;
        }).then(function (r) { if (r) { toast('Approved. It’ll be live in about two minutes.'); refreshWaiting(); renderApprovals(); } else busy(ap, false, 'Approve & publish'); })
          .catch(function (e) { busy(ap, false, 'Approve & publish'); toast(e.message, true); });
      });
      sb.addEventListener('click', function () {
        if (!note.value.trim()) { note.focus(); toast('Add a short note so ' + c.who + ' knows what to change.', true); return; }
        if (PRACTICE) { toast('Practice: this would be sent back with your note.'); return; }
        busy(sb, true, 'Sending…');
        api('POST', '/changes/' + c.id + '/send-back', { note: note.value }).then(function () { toast('Sent back. ' + c.who + ' will get your note by email.'); refreshWaiting(); renderApprovals(); }).catch(function (e) { busy(sb, false, 'Send back'); toast(e.message, true); });
      });
      card.appendChild(h('div', { class: 'fld' }, note));
      card.appendChild(h('div', { class: 'row' }, ap, sb));
    }
    return card;
  }
  function renderMine() {
    var main = shellEls.main; main.textContent = '';
    main.appendChild(top('My submitted changes', 'What you’ve sent for approval, and what happened to it.'));
    main.appendChild(howto('mine'));
    var wrap = h('div'); main.appendChild(wrap);
    api('GET', '/changes?mine=1').then(function (r) {
      if (!r.changes.length) { wrap.appendChild(h('div', { class: 'panel' }, h('p', { class: 'empty', text: 'You haven’t submitted anything yet.' }))); return; }
      r.changes.forEach(function (c) {
        var s = sectionFor(c.path);
        wrap.appendChild(h('div', { class: 'panel change' }, h('div', { class: 'chead' }, h('div', null, h('h3', { text: c.summary || (s && s.title) || c.path }), h('p', { class: 'hint', text: 'Submitted ' + ago(c.created) + (c.reviewer ? ' · ' + c.reviewer : '') })), chip(c.status)),
          c.note ? h('p', { class: 'cnote', text: '“' + c.note + '”' }) : null,
          h('div', { class: 'row' }, s && (c.status === 'pending' || c.status === 'sent_back') ? h('button', { class: 'btn slate small', type: 'button', text: c.status === 'sent_back' ? 'Fix and resubmit' : 'Open it', onclick: function () { go(s.id); } }) : null,
            (c.status === 'pending' || c.status === 'sent_back') ? h('button', { class: 'link', type: 'button', text: 'Withdraw', onclick: function () { if (!confirm('Withdraw this change? It won’t be published.')) return; api('POST', '/changes/' + c.id + '/withdraw').then(function () { toast('Withdrawn.'); refreshWaiting(); renderMine(); }).catch(function (e) { toast(e.message, true); }); } }) : null)));
      });
    }).catch(function (e) { wrap.appendChild(h('p', { class: 'err', text: e.message })); });
  }

  /* ------------------------------------------------------------------ comments (service mode) */
  function renderComments(status) {
    status = status || 'pending';
    var main = shellEls.main; main.textContent = '';
    main.appendChild(top('Blog comments', 'Comments appear under a post only after someone approves them.'));
    main.appendChild(howto('comments'));
    var tabs = h('div', { class: 'tabs', role: 'tablist' }, [['pending', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Removed']].map(function (t) { return h('button', { type: 'button', role: 'tab', 'aria-selected': String(t[0] === status), onclick: function () { renderComments(t[0]); } }, t[1]); }));
    var wrap = h('div'); main.appendChild(tabs); main.appendChild(wrap);
    api('GET', '/comments?status=' + status).then(function (r) {
      if (!r.comments.length) { wrap.appendChild(h('div', { class: 'panel' }, h('p', { class: 'empty', text: status === 'pending' ? 'No comments waiting.' : 'None.' }))); return; }
      r.comments.forEach(function (c) {
        var ap = status !== 'approved' ? h('button', { class: 'btn small', type: 'button', text: 'Approve', onclick: function () { if (PRACTICE) return toast('Practice: this comment would be approved.'); busy(ap, true); api('POST', '/comments/' + c.id + '/approve').then(function () { toast('Approved. It’ll appear under the post in about two minutes.'); refreshWaiting(); renderComments(status); }).catch(function (e) { busy(ap, false); toast(e.message, true); }); } }) : null;
        var rm = status !== 'rejected' ? h('button', { class: 'btn ghost small', type: 'button', text: 'Remove', onclick: function () { if (PRACTICE) return toast('Practice: this comment would be removed.'); if (status === 'approved' && !confirm('Take this comment down from the website?')) return; busy(rm, true); api('POST', '/comments/' + c.id + '/reject').then(function () { toast('Removed.'); refreshWaiting(); renderComments(status); }).catch(function (e) { busy(rm, false); toast(e.message, true); }); } }) : null;
        wrap.appendChild(h('div', { class: 'panel change' }, h('div', { class: 'chead' }, h('div', null, h('h3', { text: c.name }), h('p', { class: 'hint' }, 'On “' + c.post + '” · ' + ago(c.created) + ' · ', c.email ? h('a', { href: 'mailto:' + c.email, text: c.email }) : 'no email given'))),
          h('p', { class: 'ctext', text: c.text }), h('div', { class: 'row' }, ap, rm)));
      });
    }).catch(function (e) { wrap.appendChild(h('p', { class: 'err', text: e.message })); });
  }

  /* ------------------------------------------------------------------ people + account (service mode) */
  var LEVELS = [['admin', 'Administrator'], ['editor', 'Editor'], ['contributor', 'Contributor']];
  function renderPeople() {
    var main = shellEls.main; main.textContent = '';
    main.appendChild(top('People', 'Everyone who can sign in to this admin, and what they can do.'));
    main.appendChild(howto('people'));
    var tb = h('tbody'), tbl = h('table', { class: 'users' }, h('thead', null, h('tr', null, h('th', { text: 'Name' }), h('th', { text: 'Level' }), h('th', { text: 'Status' }), h('th', { text: '' }))), tb);
    main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Who has access' }), tbl));
    function draw() {
      api('GET', '/users').then(function (r) {
        tb.textContent = '';
        r.users.forEach(function (u) {
          var me = u.id === USER.id, sel = h('select', { 'aria-label': 'Level for ' + u.name, disabled: me || null });
          LEVELS.forEach(function (l) { sel.appendChild(h('option', { value: l[0], text: l[1] })); }); sel.value = u.role;
          sel.addEventListener('change', function () { api('PATCH', '/users/' + u.id, { role: sel.value }).then(function () { toast(u.name + ' is now ' + sel.options[sel.selectedIndex].text + '.'); }).catch(function (e) { sel.value = u.role; toast(e.message, true); }); });
          var acts = h('td', { class: 'acts' });
          if (!u.active && !u.disabled) acts.appendChild(h('button', { class: 'link', type: 'button', text: 'Resend invite', onclick: function () { api('PATCH', '/users/' + u.id, { resend_invite: true }).then(function () { toast('Invitation sent again to ' + u.email + '.'); }).catch(function (e) { toast(e.message, true); }); } }));
          if (!me) acts.appendChild(h('button', { class: 'link', type: 'button', text: u.disabled ? 'Turn on' : 'Turn off', onclick: function () { api('PATCH', '/users/' + u.id, { disabled: !u.disabled }).then(function () { toast(u.name + (u.disabled ? ' can sign in again.' : ' can no longer sign in.')); draw(); }).catch(function (e) { toast(e.message, true); }); } }));
          if (!me) acts.appendChild(h('button', { class: 'link danger', type: 'button', text: 'Remove', onclick: function () { if (!confirm('Remove ' + u.name + ' completely? (To keep their history but stop them signing in, use Turn off.)')) return; api('DELETE', '/users/' + u.id).then(function () { toast(u.name + ' was removed.'); draw(); }).catch(function (e) { toast(e.message, true); }); } }));
          tb.appendChild(h('tr', null, h('td', null, h('b', { text: u.name }), me ? h('small', { text: ' (you)' }) : null, h('br'), h('small', { class: 'muted', text: u.email })), h('td', null, sel), h('td', null, h('span', { class: 'chip ' + (u.disabled ? 'rejected' : u.active ? 'approved' : 'pending'), text: u.disabled ? 'Off' : u.active ? 'Active' : 'Invited' })), acts));
        });
      }).catch(function (e) { tb.appendChild(h('tr', null, h('td', { colspan: '4', class: 'err', text: e.message }))); });
    }
    draw();
    var nn = h('input', { autocomplete: 'off' }), ne = h('input', { type: 'email', autocomplete: 'off' }), nr = h('select');
    LEVELS.forEach(function (l) { nr.appendChild(h('option', { value: l[0], text: l[1] })); }); nr.value = 'contributor';
    var err = h('p', { class: 'err', role: 'alert' }), btn = h('button', { class: 'btn', type: 'submit', text: 'Send invitation' });
    main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Invite someone' }), h('p', { class: 'hint', text: 'They’ll get an email with a link to choose their own password. The link works for 7 days.' }),
      h('form', { onsubmit: function (e) {
        e.preventDefault(); err.textContent = ''; busy(btn, true, 'Sending…');
        api('POST', '/users', { name: nn.value, email: ne.value, role: nr.value }).then(function () { toast('Invitation sent to ' + ne.value + '.'); nn.value = ne.value = ''; busy(btn, false, 'Send invitation'); draw(); })
          .catch(function (e2) { busy(btn, false, 'Send invitation'); err.textContent = e2.message; });
      } }, h('div', { class: 'grid' }, field('Name', nn), field('Email', ne), field('Level', nr)), err, btn),
      h('details', { class: 'levels' }, h('summary', { text: 'What can each level do?' }),
        h('ul', null, h('li', null, h('b', { text: 'Administrator: ' }), 'everything, including inviting people, turning sections on or off, approving page changes and putting old versions back.'),
          h('li', null, h('b', { text: 'Editor: ' }), 'publishes changes straight away (except section switches), approves contributors’ blog posts and resources, and moderates comments.'),
          h('li', null, h('b', { text: 'Contributor: ' }), 'can change anything, but nothing goes live until an editor or administrator approves it.')))));
    var log = h('ul', { class: 'hist' });
    main.appendChild(h('details', { class: 'panel' }, h('summary', { class: 'sumh', text: 'Activity log' }), log));
    api('GET', '/audit').then(function (r) { r.entries.slice(0, 60).forEach(function (a) { log.appendChild(h('li', null, h('span', { text: (a.name || 'Someone') + ': ' + a.action.replace(/-/g, ' ') + (a.detail ? ' (' + a.detail + ')' : '') }), h('time', { text: ago(a.at) }))); }); }).catch(function () {});
  }
  function renderAccount() {
    var main = shellEls.main; main.textContent = '';
    main.appendChild(top('My account', USER.email + ' · ' + USER.roleName));
    main.appendChild(howto('account'));
    var cur = h('input', { type: 'password', autocomplete: 'current-password' }), pw = h('input', { type: 'password', autocomplete: 'new-password' }), pw2 = h('input', { type: 'password', autocomplete: 'new-password' });
    var err = h('p', { class: 'err', role: 'alert' }), btn = h('button', { class: 'btn slate', type: 'submit', text: 'Change my password' });
    main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Change your password' }), h('form', { onsubmit: function (e) {
      e.preventDefault(); err.textContent = '';
      var bad = pwCheck(pw.value, ME, 10); if (bad) { err.textContent = bad; return; }
      if (pw.value !== pw2.value) { err.textContent = 'The two new passwords don’t match.'; return; }
      busy(btn, true);
      api('POST', '/me/password', { current: cur.value, password: pw.value }).then(function () { cur.value = pw.value = pw2.value = ''; busy(btn, false); toast('Password changed. You’ve been signed out on your other devices.'); }).catch(function (e2) { busy(btn, false); err.textContent = e2.message; });
    } }, h('div', { class: 'grid' }, field('Current password', cur), field('New password', pw, 'At least 10 characters.'), field('New password again', pw2)), err, btn)));
  }

  /* ------------------------------------------------------------------ editors & security (key mode) */
  function renderEditors() {
    var main = shellEls.main; main.textContent = '';
    main.appendChild(top('Editors & security', 'Everyone who can log in to this admin. Each person has their own password, and every change is saved with their name.'));
    var tbl = h('table', { class: 'users' }, h('thead', null, h('tr', null, h('th', { text: 'Name' }), h('th', { text: 'Added' }), h('th', { text: '' }))));
    var tb = h('tbody'); tbl.appendChild(tb);
    function draw() {
      tb.textContent = '';
      KEYS.users.forEach(function (u, i) {
        var me = norm(u.name) === norm(ME);
        tb.appendChild(h('tr', null, h('td', null, u.name, me ? h('small', { class: 'muted', text: ' (you)' }) : null), h('td', { text: u.added ? fmtDate(u.added) : '' }),
          h('td', { style: 'text-align:right' }, me ? null : h('button', { class: 'link', type: 'button', text: 'Remove', onclick: function () {
            if (!confirm('Remove ' + u.name + '? They won’t be able to log in any more.')) return;
            var nk = JSON.parse(JSON.stringify(KEYS)); nk.users.splice(i, 1);
            saveKeys(nk, 'Admin: remove editor ' + u.name + ' (by ' + ME + ')').then(function () { toast(u.name + ' was removed.'); draw(); }).catch(function (e) { toast('Couldn’t remove: ' + e.message, true); });
          } }))));
      });
    }
    loadKeysFresh().then(draw);
    main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Who can log in' }), h('p', { class: 'hint', text: 'Removing someone stops them logging in here. If they might have kept a copy of the site’s key, also replace the key below.' }), tbl));
    var nn = h('input', { autocomplete: 'off' }), np = h('input', { type: 'password', autocomplete: 'new-password' }), np2 = h('input', { type: 'password', autocomplete: 'new-password' }), ne = h('p', { class: 'err', role: 'alert' });
    var nb = h('button', { class: 'btn', type: 'submit', text: 'Add editor' });
    main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Add an editor' }), h('p', { class: 'hint', text: 'Choose a starting password together, in person or by phone. Don’t send it by email or text.' }),
      h('form', { onsubmit: function (e) {
        e.preventDefault(); ne.textContent = '';
        var name = nn.value.trim(); if (!name) { ne.textContent = 'Add their name.'; return; }
        if (KEYS.users.some(function (u) { return norm(u.name) === norm(name); })) { ne.textContent = 'There’s already an editor with that name.'; return; }
        var bad = pwCheck(np.value, name); if (bad) { ne.textContent = bad; return; }
        if (np.value !== np2.value) { ne.textContent = 'The two passwords don’t match.'; return; }
        busy(nb, true, 'Encrypting…');
        sealToken(TOKEN, name, np.value).then(function (u) {
          return loadKeysFresh().then(function () { var nk = JSON.parse(JSON.stringify(KEYS)); nk.users.push(u); return saveKeys(nk, 'Admin: add editor ' + name + ' (by ' + ME + ')'); });
        }).then(function () { nn.value = np.value = np2.value = ''; busy(nb, false, 'Add editor'); toast(name + ' can now log in.'); draw(); })
          .catch(function (e) { busy(nb, false, 'Add editor'); ne.textContent = 'Couldn’t add: ' + e.message; });
      } }, h('div', { class: 'grid' }, field('Name', nn), field('Password', np, 'At least ' + MIN_PW + ' characters.'), field('Password again', np2)), ne, nb)));
    var cp = h('input', { type: 'password', autocomplete: 'new-password' }), cp2 = h('input', { type: 'password', autocomplete: 'new-password' }), ce = h('p', { class: 'err', role: 'alert' });
    var cb = h('button', { class: 'btn slate', type: 'submit', text: 'Change my password' });
    main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Change your password' }),
      h('form', { onsubmit: function (e) {
        e.preventDefault(); ce.textContent = '';
        var bad = pwCheck(cp.value, ME); if (bad) { ce.textContent = bad; return; }
        if (cp.value !== cp2.value) { ce.textContent = 'The two passwords don’t match.'; return; }
        cb.disabled = true;
        sealToken(TOKEN, ME, cp.value).then(function (u) {
          return loadKeysFresh().then(function () { var nk = JSON.parse(JSON.stringify(KEYS)); var i = nk.users.findIndex(function (x) { return norm(x.name) === norm(ME); }); u.added = (nk.users[i] || {}).added || u.added; if (i >= 0) nk.users[i] = u; else nk.users.push(u); return saveKeys(nk, 'Admin: ' + ME + ' changed their password'); });
        }).then(function () { cp.value = cp2.value = ''; cb.disabled = false; toast('Password changed.'); }).catch(function (e) { cb.disabled = false; ce.textContent = 'Couldn’t change it: ' + e.message; });
      } }, h('div', { class: 'grid' }, field('New password', cp), field('New password again', cp2)), ce, cb)));
    var rk = h('input', { type: 'password', autocomplete: 'off', placeholder: 'github_pat_…' }), rp = h('input', { type: 'password', autocomplete: 'current-password' }), re = h('p', { class: 'err', role: 'alert' });
    var rb = h('button', { class: 'btn ghost', type: 'submit', text: 'Replace the key' });
    var expTxt = TOKEN_EXPIRES ? 'The current key expires on ' + new Date(TOKEN_EXPIRES.replace(' UTC', 'Z').replace(' ', 'T')).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) + '. ' : '';
    main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Replace the GitHub key' }),
      h('p', { class: 'hint', text: expTxt + 'Do this before the key expires, or if someone who left might have a copy. Make the new key the same way as at setup, then delete the old one on GitHub. Because each editor’s copy is locked with their own password, everyone else will need to be added again afterwards.' }),
      h('form', { onsubmit: function (e) {
        e.preventDefault(); re.textContent = '';
        var t = rk.value.trim(); if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) { re.textContent = 'That doesn’t look like a GitHub token.'; return; }
        var bad = pwCheck(rp.value, ME); if (bad) { re.textContent = bad; return; }
        if (!confirm('Replace the key? Everyone except you will need to be added again.')) return;
        rb.disabled = true; var old = TOKEN; TOKEN = t;
        gh('GET', '/repos/' + REPO + '/contents/content/settings.json?ref=' + BRANCH).then(function () { return sealToken(t, ME, rp.value); })
          .then(function (u) { return saveKeys({ version: 1, repo: REPO, users: [u] }, 'Admin: key replaced by ' + ME); })
          .then(function () { rk.value = rp.value = ''; rb.disabled = false; toast('Key replaced. Now delete the old key on GitHub, and re-add the other editors.'); renderEditors(); })
          .catch(function (e) { TOKEN = old; rb.disabled = false; re.textContent = 'That key didn’t work: ' + e.message; });
      } }, h('div', { class: 'grid' }, field('New GitHub key', rk), field('Your password (new or current)', rp)), re, rb)));
  }

  /* ------------------------------------------------------------------ help: guide, practice mode, tour */
  function renderGuide() {
    var main = shellEls.main; main.textContent = '';
    main.appendChild(top('Help guide', 'Every “How this works” panel in one place. Print it or save it as a PDF to keep a copy.', [h('button', { class: 'btn ghost', type: 'button', text: 'Print', onclick: function () { window.print(); } }), h('button', { class: 'btn slate', type: 'button', text: 'Take the tour', onclick: function () { startTour(); } })]));
    var levels = SERVICE ? { admin: 'Administrator', editor: 'Editor', contributor: 'Contributor' }[ROLE()] : 'Editor';
    main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Your level: ' + levels }), h('p', { class: 'hint', text: SERVICE ? (ROLE() === 'contributor' ? 'Everything you change is sent to an editor or administrator to approve. You’ll get an email when it’s approved or sent back.' : ROLE() === 'editor' ? 'You publish changes straight away (except section switches). You also approve contributors’ blog posts and resources, and moderate comments.' : 'You can do everything, including inviting people, approving changes and putting old versions back.') : 'Every editor can publish every section. Changes go live in about two minutes.' }),
      h('ol', { class: 'basics' }, h('li', { text: 'Choose a section in the menu (on a phone, tap ☰ Menu).' }), h('li', { text: 'Make your changes. Nothing is saved until you press the button at the bottom.' }), h('li', { text: SERVICE && ROLE() === 'contributor' ? 'Press “Submit for approval”.' : 'Press “Publish”. Watch the message at the top: it tells you when it’s live.' }), h('li', { text: 'Made a mistake? Open the section and press History to see or put back an earlier version.' }))));
    var order = ['overview'].concat(SECTIONS.map(function (s) { return s.id; }), SERVICE ? ['approvals', 'mine', 'comments', 'people', 'account'] : []);
    order.forEach(function (id) {
      if (!HOWTO[id]) return;
      var s = SECTIONS.filter(function (x) { return x.id === id; })[0];
      var title = s ? s.title : { overview: 'Getting started', approvals: 'Approving changes', mine: 'Your submitted changes', comments: 'Blog comments', people: 'People and levels', account: 'Your account' }[id];
      main.appendChild(h('div', { class: 'panel guide-item' }, h('h2', { text: title }), h('ol', null, HOWTO[id].map(function (t) { return h('li', { text: t }); }))));
    });
  }
  function setPractice(on) {
    PRACTICE = on; DIRTY = false;
    showAppKeep(CUR || 'overview');
    toast(on ? 'Practice mode is on. Try anything: nothing will change on the website.' : 'Practice mode is off. Changes now go to the website.');
  }
  function openHelp(anchor) {
    var old = document.querySelector('.help-menu'); if (old) { old.remove(); return; }
    var m = h('div', { class: 'help-menu', role: 'menu' },
      h('button', { type: 'button', role: 'menuitem', text: 'Take the tour', onclick: function () { m.remove(); startTour(); } }),
      h('button', { type: 'button', role: 'menuitem', text: PRACTICE ? 'Leave practice mode' : 'Practice mode (nothing goes live)', onclick: function () { m.remove(); setPractice(!PRACTICE); } }),
      h('button', { type: 'button', role: 'menuitem', text: 'Help guide (printable)', onclick: function () { m.remove(); go('guide'); } }));
    anchor.parentNode.insertBefore(m, anchor);
    setTimeout(function () { document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }); }, 0);
  }

  var TOUR = null;
  function tourSteps() {
    var r = ROLE(), contrib = SERVICE && r === 'contributor';
    var steps = [
      { title: 'Welcome to the site admin 👋', text: 'This is where you keep the YWAM San Francisco website up to date. This quick tour shows you around. It takes about a minute.' },
      { sel: '[data-tour="nav"]', title: 'The menu', text: 'Everything you can change is listed here, grouped the same way as the website: DTS, People, Serve, News and Site.', side: 'right', mobileMenu: true },
      { go: 'dts', sel: '[data-tour="howto"]', title: '“How this works”', text: 'Every section starts with the exact steps for that task. Open it whenever you’re unsure.' },
      { sel: '[data-tour="form"]', title: 'Make your changes', text: 'Edit the text, dates and photos here. Use the arrows to reorder items, ✕ to delete one, and “+ Add” to add a new one. Nothing changes on the website yet.' },
      { sel: '[data-tour="save"]', showBar: true, title: contrib ? 'Submit for approval' : 'Publish', text: contrib ? 'When you’re happy, press “Submit for approval”. An editor or administrator checks it, and you get an email when it’s approved or sent back with a note.' : 'When you’re happy, press “Publish”. Your change is live on the website about two minutes later, and a message at the top tells you when.' },
      !contrib ? { sel: '[data-tour="history"]', title: 'History and undo', text: 'Every published version is kept. Press History to see what changed and who changed it' + (r === 'admin' ? ', and to put an earlier version back in one click.' : '. An administrator can put an earlier version back.') } : null,
      SERVICE && r !== 'contributor' ? { go: 'overview', sel: '.side .grp', title: 'Your to-do list', text: 'Changes waiting for your approval and new blog comments appear under “To do”, with a number when something is waiting. You’ll also get an email.', side: 'right', mobileMenu: true } : null,
      { sel: '[data-tour="help"]', title: 'Help is always here', text: 'Replay this tour, open the printable guide, or switch on practice mode to try everything without changing the website.', side: 'right', mobileMenu: true },
      { go: 'overview', title: 'You’re ready!', text: 'Tip: start in practice mode if you want to experiment. When you’re ready, pick a section and make your first change.', final: true }
    ];
    return steps.filter(Boolean);
  }
  function startTour() {
    endTour();
    var steps = tourSteps(), i = 0;
    var shade = h('div', { class: 'tour-shade' }), ring = h('div', { class: 'tour-ring' }), card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-t' });
    document.body.appendChild(shade); document.body.appendChild(ring); document.body.appendChild(card);
    TOUR = { shade: shade, ring: ring, card: card };
    function finish() {
      endTour();
      if (SERVICE) { if (USER && !USER.toured) { USER.toured = true; api('POST', '/me/toured').catch(function () {}); } }
      else LS.set('toured.' + norm(ME), '1');
    }
    function show() {
      var st = steps[i];
      shellEls.bar.classList.toggle('tour-show', !!st.showBar);
      var mobile = window.matchMedia('(max-width:860px)').matches;
      shellEls.side.classList.toggle('open', !!(st.mobileMenu && mobile));
      var ready = st.go && st.go !== CUR ? new Promise(function (res) { go(st.go, true); var n = 0; (function wait() { if ((!st.sel || document.querySelector(st.sel)) || n++ > 40) return res(); setTimeout(wait, 100); })(); }) : Promise.resolve();
      ready.then(function () {
        var el = st.sel ? document.querySelector(st.sel) : null;
        card.textContent = '';
        card.appendChild(h('small', { class: 'kick', text: 'Step ' + (i + 1) + ' of ' + steps.length }));
        card.appendChild(h('h2', { id: 'tour-t', text: st.title }));
        card.appendChild(h('p', { text: st.text }));
        var next = h('button', { class: 'btn', type: 'button', text: st.final ? 'Finish' : 'Next', onclick: function () { if (st.final) return finish(); i++; show(); } });
        card.appendChild(h('div', { class: 'row' }, i ? h('button', { class: 'btn ghost small', type: 'button', text: 'Back', onclick: function () { i--; show(); } }) : null, next, !st.final ? h('button', { class: 'link', type: 'button', text: 'Skip tour', onclick: finish }) : null,
          st.final && !PRACTICE ? h('button', { class: 'btn ghost small', type: 'button', text: 'Try practice mode', onclick: function () { finish(); setPractice(true); } }) : null));
        if (el) {
          var tall = el.getBoundingClientRect().height > window.innerHeight * 0.45, docked = mobile || tall;
          el.scrollIntoView({ block: docked ? 'start' : 'center', behavior: 'instant' });
          if (docked && !(st.mobileMenu && mobile)) window.scrollBy(0, -16);
          setTimeout(function () {
            var r = el.getBoundingClientRect(), pad = 6;
            if (docked) {
              var maxH = window.innerHeight - card.offsetHeight - 40;
              ring.style.cssText = 'display:block;top:' + Math.max(4, r.top - pad) + 'px;left:' + (r.left - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + Math.max(40, Math.min(r.height + pad * 2, maxH)) + 'px';
              shade.classList.add('ringed');
              card.style.cssText = mobile ? 'left:12px;right:12px;bottom:12px' : 'right:24px;bottom:24px;width:360px';
              return;
            }
            ring.style.cssText = 'display:block;top:' + (r.top - pad) + 'px;left:' + (r.left - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + Math.min(r.height + pad * 2, window.innerHeight - 20) + 'px';
            shade.classList.add('ringed');
            var cw = Math.min(360, window.innerWidth - 32), ch = card.offsetHeight, x, y;
            if (st.side === 'right' && r.right + cw + 24 < window.innerWidth) { x = r.right + 18; y = Math.max(16, Math.min(r.top, window.innerHeight - ch - 16)); }
            else if (r.bottom + ch + 24 < window.innerHeight) { x = Math.max(16, Math.min(r.left, window.innerWidth - cw - 16)); y = r.bottom + 14; }
            else { x = Math.max(16, Math.min(r.left, window.innerWidth - cw - 16)); y = Math.max(16, r.top - ch - 14); }
            card.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + cw + 'px';
          }, 60);
        } else { ring.style.cssText = 'display:none'; shade.classList.remove('ringed'); card.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%);width:' + Math.min(420, window.innerWidth - 32) + 'px'; }
        next.focus();
      });
    }
    card.addEventListener('keydown', function (e) { if (e.key === 'Escape') finish(); });
    show();
  }
  function endTour() {
    if (!TOUR) return;
    TOUR.shade.remove(); TOUR.ring.remove(); TOUR.card.remove(); TOUR = null;
    if (shellEls.bar) shellEls.bar.classList.remove('tour-show');
    if (shellEls.side) shellEls.side.classList.remove('open');
  }
  window.addEventListener('resize', function () { if (TOUR) endTour(); });

  boot();
})();
