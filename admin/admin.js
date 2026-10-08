/* YWAM San Francisco · site admin
   A self-contained admin for a static site. Content lives in /content/*.json in the
   GitHub repo; saving commits the change, and a GitHub Action rebuilds the site.

   Security model
   - The page talks only to api.github.com, with a fine-grained GitHub token limited
     to this one repository (Contents: read & write; Actions: read, optional).
   - That token is never stored in readable form. Each editor has their own password;
     the token is encrypted per editor with AES-256-GCM using a key derived from their
     password (PBKDF2-SHA256, 600,000 iterations, random salt). The encrypted copies
     live in admin/keys.json.
   - The decrypted token is kept in memory only, and is dropped on log out, on page
     reload and after 30 minutes without activity.
   - Everything shown on screen is built with textContent / DOM APIs, never innerHTML
     with editable values, and the page's CSP blocks any other script or connection.
*/
(function () {
  'use strict';
  if (window.top !== window.self) { document.body.textContent = ''; return; }   // no framing

  var REPO = 'lilbirdlifecoaching/ywamsf-dts', BRANCH = 'main', API = 'https://api.github.com';
  var KEYS_PATH = 'admin/keys.json', ITER = 600000, IDLE_MS = 30 * 60 * 1000, MIN_PW = 14;
  var SITE = 'https://ywamembers.org/ywam6/';

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
    clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.className = 'toast'; }, bad ? 6000 : 3200);
  }

  /* ------------------------------------------------------------------ base64 + crypto */
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

  /* ------------------------------------------------------------------ GitHub API */
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
  function readFile(path) {   // -> {text, sha}
    return gh('GET', '/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH + '&t=' + Date.now()).then(function (j) { return { text: b64utf8(j.content || ''), sha: j.sha }; });
  }
  /* one commit containing several files: [{path, text} | {path, base64}] */
  function commitFiles(files, message) {
    var base, tree;
    return gh('GET', '/repos/' + REPO + '/git/ref/heads/' + BRANCH).then(function (ref) {
      base = ref.object.sha; return gh('GET', '/repos/' + REPO + '/git/commits/' + base);
    }).then(function (c) {
      tree = c.tree.sha;
      return Promise.all(files.map(function (f) {
        return gh('POST', '/repos/' + REPO + '/git/blobs', { content: f.base64 != null ? f.base64 : utf8b64(f.text), encoding: 'base64' }).then(function (b) { return { path: f.path, mode: '100644', type: 'blob', sha: b.sha }; });
      }));
    }).then(function (entries) {
      return gh('POST', '/repos/' + REPO + '/git/trees', { base_tree: tree, tree: entries });
    }).then(function (t) {
      return gh('POST', '/repos/' + REPO + '/git/commits', { message: message, tree: t.sha, parents: [base] });
    }).then(function (c) {
      return gh('PATCH', '/repos/' + REPO + '/git/refs/heads/' + BRANCH, { sha: c.sha, force: false }).then(function () { return c.sha; });
    });
  }
  function currentSha(path) { return gh('GET', '/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH + '&t=' + Date.now()).then(function (j) { return j.sha; }, function (e) { if (e.status === 404) return null; throw e; }); }

  /* ------------------------------------------------------------------ keys.json */
  function loadPublicKeys() {
    return fetch('keys.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : { users: [] }; }).catch(function () { return { users: [] }; });
  }
  function saveKeys(newKeys, msg) {
    return currentSha(KEYS_PATH).then(function (sha) {
      return gh('PUT', '/repos/' + REPO + '/contents/' + KEYS_PATH, { message: msg, content: utf8b64(JSON.stringify(newKeys, null, 2) + '\n'), sha: sha || undefined, branch: BRANCH });
    }).then(function (r) { KEYS = newKeys; KEYS_SHA = r.content.sha; });
  }

  /* ------------------------------------------------------------------ session */
  var idleT;
  function touch() { clearTimeout(idleT); if (TOKEN) idleT = setTimeout(function () { logout('You were logged out after 30 minutes without activity.'); }, IDLE_MS); }
  ['click', 'keydown', 'pointermove', 'scroll'].forEach(function (ev) { document.addEventListener(ev, touch, { passive: true }); });
  function logout(msg) { TOKEN = null; ME = null; DIRTY = false; clearTimeout(idleT); showLogin(msg); }
  window.addEventListener('beforeunload', function (e) { if (DIRTY) { e.preventDefault(); e.returnValue = ''; } });

  /* ------------------------------------------------------------------ login / setup screens */
  function gate(cardKids, wide) { return h('div', { class: 'gate' }, h('div', { class: 'gate-card' + (wide ? ' wide' : '') }, h('div', { class: 'gate-mark', text: 'YWAM SAN FRANCISCO' }), cardKids)); }
  function field(label, input, hint) { return h('label', { class: 'fld' }, h('span', { text: label }), input, hint ? h('small', { text: hint }) : null); }
  function pwCheck(pw, name) {
    if (pw.length < MIN_PW) return 'Use at least ' + MIN_PW + ' characters. A short sentence or four random words works well.';
    if (norm(pw).indexOf(norm(name)) >= 0 && norm(name)) return 'Please don’t include your name in the password.';
    if (/^(.)\1+$/.test(pw) || /^(password|ywam|letmein|1234)/i.test(pw)) return 'That password is too easy to guess.';
    return '';
  }

  function boot() {
    if (!window.crypto || !crypto.subtle) { mount(gate([h('h1', { text: 'Secure connection needed' }), h('p', { text: 'Open this page over https (ywamembers.org/admin/) in an up-to-date browser.' })])); return; }
    loadPublicKeys().then(function (k) { KEYS = k && Array.isArray(k.users) ? k : { version: 1, users: [] }; if (KEYS.users.length) showLogin(); else showSetup(); });
  }

  function showLogin(msg) {
    var name = h('input', { autocomplete: 'username', required: true, autocapitalize: 'words' });
    var pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    var err = h('p', { class: 'err', role: 'alert', text: msg || '' });
    var btn = h('button', { class: 'btn', type: 'submit', text: 'Log in' });
    var form = h('form', { onsubmit: function (e) {
      e.preventDefault(); err.textContent = '';
      var u = KEYS.users.filter(function (x) { return norm(x.name) === norm(name.value); })[0];
      btn.disabled = true; btn.textContent = 'Checking…';
      var fail = function () { btn.disabled = false; btn.textContent = 'Log in'; err.textContent = 'That name and password don’t match.'; pw.value = ''; pw.focus(); };
      if (!u) { setTimeout(fail, 900); return; }
      openToken(u, pw.value).then(function (tok) {
        TOKEN = tok; ME = u.name; pw.value = '';
        return gh('GET', '/repos/' + REPO).then(function () { touch(); showApp('overview'); });
      }, fail).catch(function (e) {
        TOKEN = null; btn.disabled = false; btn.textContent = 'Log in';
        err.textContent = (e.status === 401 || e.status === 403) ? 'The site’s GitHub key has expired or been revoked. Ask whoever set up the admin to replace it.' : 'Couldn’t reach GitHub: ' + e.message;
      });
    } }, field('Your name', name), field('Password', pw), err, btn);
    mount(gate([h('span', { class: 'kick', text: 'Site admin' }), h('h1', { text: 'Welcome back.' }), h('p', { text: 'Log in to update staff, DTS dates, shifts, events and more.' }), form,
      h('p', { class: 'gate-foot', text: 'Forgotten your password? Ask another editor to remove you and add you again.' })]));
    name.focus();
  }

  function showSetup() {
    var tok = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'github_pat_…' });
    var name = h('input', { autocomplete: 'name' });
    var pw = h('input', { type: 'password', autocomplete: 'new-password' });
    var pw2 = h('input', { type: 'password', autocomplete: 'new-password' });
    var err = h('p', { class: 'err', role: 'alert' });
    var btn = h('button', { class: 'btn', type: 'submit', text: 'Finish setup' });
    var form = h('form', { onsubmit: function (e) {
      e.preventDefault(); err.textContent = '';
      var t = tok.value.trim();
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) { err.textContent = 'That doesn’t look like a GitHub token. It should start with github_pat_.'; return; }
      if (!name.value.trim()) { err.textContent = 'Add your name.'; return; }
      var bad = pwCheck(pw.value, name.value); if (bad) { err.textContent = bad; return; }
      if (pw.value !== pw2.value) { err.textContent = 'The two passwords don’t match.'; return; }
      btn.disabled = true; btn.textContent = 'Encrypting and saving…';
      TOKEN = t;
      gh('GET', '/repos/' + REPO + '/contents/content/settings.json?ref=' + BRANCH).then(function () {
        return sealToken(t, name.value, pw.value);
      }).then(function (u) {
        return saveKeys({ version: 1, repo: REPO, users: [u] }, 'Admin setup: add editor ' + u.name);
      }).then(function () {
        ME = name.value.trim(); tok.value = ''; pw.value = ''; pw2.value = ''; touch(); showApp('overview'); toast('Setup complete. Welcome, ' + ME + '.');
      }).catch(function (e) {
        TOKEN = null; btn.disabled = false; btn.textContent = 'Finish setup';
        err.textContent = (e.status === 401) ? 'GitHub didn’t accept that token.' : (e.status === 403 || e.status === 404) ? 'That token can’t write to the site. Check it has Contents: Read and write on ' + REPO + '.' : 'Something went wrong: ' + e.message;
      });
    } },
      field('GitHub token', tok, 'Used once to set things up. It’s stored only in encrypted form.'),
      field('Your name', name, 'Shown on every change you make.'),
      field('Choose a password', pw, 'At least ' + MIN_PW + ' characters. A short sentence or four random words works well.'),
      field('Password again', pw2), err, btn);
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
          blank: { name: 'Discipleship Training School', start: '', end: '', start_time: '09:00', cost: 8000, status: 'Applications open', apply_url: '' },
          fields: [F.text('name', 'School name'), { k: 'start', l: 'First day', t: 'date', req: true }, { k: 'end', l: 'Last day', t: 'date', req: true }, { k: 't', l: '', t: 'none' },
            { k: 'start_time', l: 'Start time (for the countdown)', t: 'time' }, { k: 'cost', l: 'Cost (USD)', t: 'number' },
            { k: 'status', l: 'Status on the board', t: 'select', opts: ['Applications open', 'Now boarding', 'Almost full', 'Full', 'Waitlist'] },
            { k: 'apply_url', l: 'Application link (optional)', t: 'url', hint: 'Leave blank to use the main DTS application link from Settings.', full: true }] },
        F.area('cost_note', 'Small print under the cost')] },
    { id: 'testimonials', grp: 'DTS', file: 'testimonials.json', title: 'Testimonials', page: 'course/',
      intro: 'Student stories on the DTS page. Until you add some, three marked placeholders are shown.',
      fields: [{ k: 'testimonials', l: 'Testimonials', t: 'list', add: 'Add a testimonial', title: function (x) { return x.name || 'New testimonial'; }, sub: function (x) { return x.detail || ''; }, blank: { quote: '', name: '', detail: '' }, fields: [F.area('quote', 'Quote', { req: true }), F.text('name', 'Name'), F.text('detail', 'Detail', { hint: 'e.g. DTS 2024' })] }] },
    { id: 'faq', grp: 'DTS', file: 'faq.json', title: 'DTS FAQ', page: 'course/#cost',
      fields: [{ k: 'questions', l: 'Questions', t: 'list', add: 'Add a question', title: function (x) { return x.question || 'New question'; }, blank: { question: '', answer: '' }, fields: [F.text('question', 'Question', { req: true, full: true }), F.area('answer', 'Answer')] }] },
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
      fields: [F.text('phone', 'Phone'), { k: 'email', l: 'Main email', t: 'email' }, { k: 'volunteer_email', l: 'Volunteering email', t: 'email' }, { k: 'outreach_email', l: 'Teams & outreach email', t: 'email' }, { k: 'dts_email', l: 'DTS email', t: 'email' },
        F.text('address', 'Street address'), F.text('city', 'City, state & ZIP'),
        { k: 'dts_apply_url', l: 'DTS application link', t: 'url', full: true }, { k: 'team_booking_url', l: 'Mission Adventures booking link', t: 'url', full: true }, { k: 'give_online_url', l: 'Online giving link (Click & Pledge)', t: 'url', full: true },
        { k: 'ma_price_per_day', l: 'Mission Adventures price per person per day (USD)', t: 'number' },
        { k: 'hours', l: 'Opening hours (Contact page)', t: 'list', add: 'Add a line', title: function (x) { return x.label || 'New line'; }, sub: function (x) { return x.text || ''; }, blank: { label: '', text: '' }, fields: [F.text('label', 'Label', { req: true }), F.text('text', 'Hours')] }] },
    { id: 'editors', grp: 'Site', title: 'Editors & security' }
  ];

  /* ------------------------------------------------------------------ formatting */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function fmtDate(s) { var d = pd(s); return d ? MON[d.m - 1] + ' ' + d.d + ', ' + d.y : (s || ''); }
  function fmtRange(a, b) { var x = pd(a), y = pd(b); if (!x) return 'New school'; if (!y) return fmtDate(a); return MON[x.m - 1] + ' ' + x.d + (x.y !== y.y ? ', ' + x.y : '') + ' – ' + MON[y.m - 1] + ' ' + y.d + ', ' + y.y; }
  function todaySF() { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function ago(iso) { var s = (Date.now() - new Date(iso)) / 1000; if (s < 90) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago'; if (s < 86400) return Math.round(s / 3600) + ' h ago'; return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }

  /* ------------------------------------------------------------------ app shell */
  var CUR = null, DATA = null, SHA = null, DIRTY = false, PENDING = {}, PREVIEW = {};
  var shellEls = {};
  function showApp(id) {
    var nav = h('nav', { 'aria-label': 'Sections' }), lastGrp = null;
    SECTIONS.forEach(function (s) {
      if (s.grp !== lastGrp && s.grp) nav.appendChild(h('div', { class: 'grp', text: s.grp }));
      lastGrp = s.grp;
      nav.appendChild(h('button', { class: 'nav', type: 'button', 'data-id': s.id, onclick: function () { go(s.id); } }, s.title));
    });
    var side = h('aside', { class: 'side' }, h('div', { class: 'brand' }, 'YWAM SAN FRANCISCO', h('small', { text: 'Site admin' })), nav,
      h('div', { class: 'who' }, 'Logged in as', h('b', { text: ME }), h('button', { class: 'link', type: 'button', text: 'Log out', onclick: function () { if (!DIRTY || confirm('You have unsaved changes. Log out anyway?')) logout('You’ve been logged out.'); } })));
    var main = h('main', { class: 'main', id: 'main' });
    var saveSt = h('span', { class: 'st' }), saveBtn = h('button', { class: 'btn', type: 'button', text: 'Save & publish', onclick: save }), undoBtn = h('button', { class: 'btn ghost', type: 'button', text: 'Discard changes', onclick: function () { if (confirm('Discard your unsaved changes?')) go(CUR, true); } });
    var bar = h('div', { class: 'savebar', role: 'region', 'aria-label': 'Unsaved changes' }, saveSt, h('div', { class: 'acts', style: 'display:flex;gap:10px' }, undoBtn, saveBtn));
    shellEls = { side: side, nav: nav, main: main, bar: bar, saveSt: saveSt, saveBtn: saveBtn };
    mount(h('div', { class: 'shell' }, side, main, bar));
    go(id, true);
  }
  function setDirty(v) { DIRTY = v; shellEls.bar.classList.toggle('on', v); shellEls.saveSt.textContent = v ? 'You have unsaved changes.' : ''; }
  function go(id, force) {
    if (!force && DIRTY && id !== CUR && !confirm('You have unsaved changes on this page. Leave without saving?')) return;
    CUR = id; DATA = null; SHA = null; PENDING = {}; setDirty(false);
    [].forEach.call(shellEls.nav.querySelectorAll('button.nav'), function (b) { if (b.getAttribute('data-id') === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    shellEls.side.classList.remove('open');
    var s = SECTIONS.filter(function (x) { return x.id === id; })[0];
    shellEls.main.textContent = '';
    shellEls.main.appendChild(h('p', { class: 'loading', text: 'Loading…' }));
    window.scrollTo(0, 0);
    if (id === 'overview') return renderOverview();
    if (id === 'editors') return renderEditors();
    readFile('content/' + s.file).then(function (f) { DATA = JSON.parse(f.text); SHA = f.sha; renderSection(s); }).catch(function (e) { shellEls.main.textContent = ''; shellEls.main.appendChild(h('p', { class: 'err', text: 'Couldn’t load this section: ' + e.message })); });
  }
  function top(title, intro, acts) {
    return h('div', { class: 'mtop' }, h('div', null, h('button', { class: 'btn ghost small menu-btn', type: 'button', text: '☰ Menu', onclick: function () { shellEls.side.classList.add('open'); } }), h('h1', { text: title }), intro ? h('p', { text: intro }) : null), acts ? h('div', { class: 'acts' }, acts) : null);
  }

  /* ------------------------------------------------------------------ overview */
  function renderOverview() {
    var main = shellEls.main; main.textContent = '';
    main.appendChild(top('Hello, ' + ME.split(' ')[0] + '.', 'Pick a section on the left to make changes. Each save goes live on the site in about a minute.', [h('a', { class: 'btn ghost', href: SITE, target: '_blank', rel: 'noopener', text: 'View the site ↗' })]));
    var cards = h('div', { class: 'cards' }); main.appendChild(cards);
    var hist = h('ul', { class: 'hist' });
    main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Recent changes' }), h('p', { class: 'hint', text: 'Every save is kept, so anything can be rolled back if needed.' }), hist));
    readFile('content/dts.json').then(function (f) {
      var d = JSON.parse(f.text), t = todaySF(), up = (d.schools || []).filter(function (x) { return x.start > t; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
      var nx = up[0];
      cards.appendChild(h('div', { class: 'card' + (nx ? '' : ' alert') }, h('small', { class: 'kick', text: 'Next DTS' }), h('b', { text: nx ? fmtRange(nx.start, nx.end) : 'No dates yet' }), h('p', { text: nx ? (up.length > 1 ? up.length - 1 + ' more school' + (up.length > 2 ? 's' : '') + ' after this.' : 'Add the following school when you have dates.') : 'The site says “dates coming soon”. Add a school.' }), h('button', { class: 'link', type: 'button', text: 'Edit DTS schools', onclick: function () { go('dts'); } })));
    }).catch(function () {});
    readFile('content/banner.json').then(function (f) {
      var b = JSON.parse(f.text);
      cards.appendChild(h('div', { class: 'card' }, h('small', { class: 'kick', text: 'Announcement bar' }), h('b', { text: b.show && b.text ? 'Showing' : 'Off' }), h('p', { text: b.show && b.text ? b.text : 'Turn it on for closures or big news.' }), h('button', { class: 'link', type: 'button', text: 'Edit announcement', onclick: function () { go('banner'); } })));
    }).catch(function () {});
    var exp = TOKEN_EXPIRES ? new Date(TOKEN_EXPIRES.replace(' UTC', 'Z').replace(' ', 'T')) : null;
    if (exp && !isNaN(exp)) {
      var days = Math.round((exp - Date.now()) / 864e5);
      cards.appendChild(h('div', { class: 'card' + (days < 30 ? ' alert' : '') }, h('small', { class: 'kick', text: 'GitHub key' }), h('b', { text: days < 0 ? 'Expired' : 'Expires in ' + days + ' days' }), h('p', { text: days < 30 ? 'Replace it soon under Editors & security, or the admin will stop working.' : 'On ' + exp.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) + '.' })));
    }
    gh('GET', '/repos/' + REPO + '/commits?sha=' + BRANCH + '&path=content&per_page=10').then(function (list) {
      if (!list.length) hist.appendChild(h('li', null, h('span', { class: 'empty', text: 'No changes yet.' })));
      list.forEach(function (c) { hist.appendChild(h('li', null, h('span', { text: c.commit.message.split('\n')[0] }), h('time', { datetime: c.commit.author.date, text: ago(c.commit.author.date) }))); });
    }).catch(function () { hist.appendChild(h('li', null, h('span', { class: 'empty', text: 'Couldn’t load the history.' }))); });
  }

  /* ------------------------------------------------------------------ generic editor */
  function renderSection(s) {
    var main = shellEls.main; main.textContent = '';
    var view = s.page && s.page !== '#' ? h('a', { class: 'btn ghost', href: SITE + s.page, target: '_blank', rel: 'noopener', text: 'View on site ↗' }) : h('a', { class: 'btn ghost', href: SITE, target: '_blank', rel: 'noopener', text: 'View on site ↗' });
    main.appendChild(top(s.title, s.intro, [view]));
    main.appendChild(h('div', { id: 'pubstatus' }));
    var panel = h('div', { class: 'panel' });
    panel.appendChild(fieldsFor(s.fields, DATA));
    main.appendChild(panel);
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
    if (t === 'bool') { var cb = h('input', { type: 'checkbox', checked: !!obj[f.k] }); cb.addEventListener('change', function () { obj[f.k] = cb.checked; changed(); }); return h('label', { class: 'toggle' }, cb, f.l); }
    if (t === 'days') {
      var cur = (obj[f.k] || []).map(function (d) { return String(d).toUpperCase().slice(0, 3); });
      var box = h('div', { class: 'days' });
      DAYS.forEach(function (d) { var c = h('input', { type: 'checkbox', checked: cur.indexOf(d) >= 0 }); c.addEventListener('change', function () { obj[f.k] = DAYS.filter(function (x, i) { return box.querySelectorAll('input')[i].checked; }); changed(); }); box.appendChild(h('label', null, c, d.charAt(0) + d.slice(1).toLowerCase())); });
      return h('div', { class: 'fld' }, h('span', { text: f.l }), box, f.hint ? h('small', { text: f.hint }) : null);
    }
    if (t === 'tags') {
      if (!Array.isArray(obj[f.k])) obj[f.k] = [];
      var tw = h('div', { class: 'tags' }), ti = h('input', { placeholder: 'Add a tag…', 'aria-label': f.l });
      function draw() { tw.textContent = ''; obj[f.k].forEach(function (v, i) { tw.appendChild(h('span', { class: 'tag' }, v, h('button', { type: 'button', 'aria-label': 'Remove ' + v, text: '×', onclick: function () { obj[f.k].splice(i, 1); changed(); draw(); } }))); }); tw.appendChild(ti); }
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
    var add = h('button', { class: 'btn ghost small add', type: 'button', text: '+ ' + (f.add || 'Add'), onclick: function () { arr.push(JSON.parse(JSON.stringify(f.blank || {}))); changed(); draw(arr.length - 1); var last = list.lastChild; if (last) { var inp = last.querySelector('input,textarea,select'); if (inp) inp.focus(); last.scrollIntoView({ block: 'nearest' }); } } });
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
    var btn = shellEls.saveBtn; btn.disabled = true; btn.textContent = 'Publishing…';
    var used = Object.keys(usedPhotos(DATA, {}));
    currentSha('content/' + s.file).then(function (sha) {
      if (sha && SHA && sha !== SHA) { var e = new Error('Someone else changed this section while you were editing. Copy anything you need, then reload the section.'); e.conflict = true; throw e; }
      var files = [{ path: 'content/' + s.file, text: JSON.stringify(DATA, null, 2) + '\n' }].concat(used.map(function (p) { return { path: 'content/' + p, base64: PENDING[p] }; }));
      return commitFiles(files, s.title + ': updated by ' + ME + ' (site admin)');
    }).then(function (commit) {
      return currentSha('content/' + s.file).then(function (sha) { SHA = sha; PENDING = {}; setDirty(false); btn.disabled = false; btn.textContent = 'Save & publish'; toast('Saved. It’ll be live in about a minute.'); watchBuild(commit); });
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Save & publish';
      if (e.status === 401) { logout('The GitHub key was rejected. It may have expired. Log in again, or ask the admin owner to replace the key.'); return; }
      toast(e.conflict ? e.message : 'Couldn’t save: ' + e.message, true);
    });
  }
  function watchBuild(sha) {
    var box = document.getElementById('pubstatus'); if (!box) return;
    var st = h('div', { class: 'status', role: 'status' }, h('span', { class: 'sp' }), h('span', { text: 'Publishing your change…' }));
    box.textContent = ''; box.appendChild(st);
    var tries = 0, t0 = Date.now();
    function done(ok, msg) { st.className = 'status ' + (ok ? 'done' : 'fail'); st.lastChild.textContent = msg; }
    function poll() {
      if (!CAN_ACTIONS) { setTimeout(function () { done(true, 'Saved. Your change should be live now (refresh the site to see it).'); }, 75000); return; }
      gh('GET', '/repos/' + REPO + '/actions/runs?head_sha=' + sha + '&per_page=1').then(function (r) {
        var run = r.workflow_runs && r.workflow_runs[0];
        if (run && run.status === 'completed') {
          if (run.conclusion === 'success') setTimeout(function () { done(true, 'Live on the site. (Refresh the page to see it; it can take a minute to update everywhere.)'); }, 30000);
          else done(false, 'The site couldn’t rebuild with this change. Your edit is saved; let the site manager know.');
          return;
        }
        if (++tries < 40) setTimeout(poll, 6000); else done(true, 'Saved. It’s taking a while to publish; check the site in a few minutes.');
      }).catch(function (e) { if (e.status === 403 || e.status === 404) { CAN_ACTIONS = false; poll(); } else if (++tries < 40) setTimeout(poll, 8000); });
    }
    setTimeout(poll, 5000);
  }

  /* ------------------------------------------------------------------ editors & security */
  function renderEditors() {
    var main = shellEls.main; main.textContent = '';
    main.appendChild(top('Editors & security', 'Everyone who can log in to this admin. Each person has their own password, and every change is saved with their name.'));
    var tbl = h('table', { class: 'users' }, h('thead', null, h('tr', null, h('th', { text: 'Name' }), h('th', { text: 'Added' }), h('th', { text: '' }))));
    var tb = h('tbody'); tbl.appendChild(tb);
    function draw() {
      tb.textContent = '';
      KEYS.users.forEach(function (u, i) {
        var me = norm(u.name) === norm(ME);
        tb.appendChild(h('tr', null, h('td', null, u.name, me ? h('small', { style: 'color:var(--muted)', text: ' (you)' }) : null), h('td', { text: u.added ? fmtDate(u.added) : '' }),
          h('td', { style: 'text-align:right' }, me ? null : h('button', { class: 'link', type: 'button', text: 'Remove', onclick: function () {
            if (!confirm('Remove ' + u.name + '? They won’t be able to log in any more.')) return;
            var nk = JSON.parse(JSON.stringify(KEYS)); nk.users.splice(i, 1);
            saveKeys(nk, 'Admin: remove editor ' + u.name + ' (by ' + ME + ')').then(function () { toast(u.name + ' was removed.'); draw(); }).catch(function (e) { toast('Couldn’t remove: ' + e.message, true); });
          } }))));
      });
    }
    loadKeysFresh().then(draw);
    main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Who can log in' }), h('p', { class: 'hint', text: 'Removing someone stops them logging in here. If they might have kept a copy of the site’s key, also replace the key below.' }), tbl));

    // add editor
    var nn = h('input', { autocomplete: 'off' }), np = h('input', { type: 'password', autocomplete: 'new-password' }), np2 = h('input', { type: 'password', autocomplete: 'new-password' }), ne = h('p', { class: 'err', role: 'alert' });
    var nb = h('button', { class: 'btn', type: 'submit', text: 'Add editor' });
    main.appendChild(h('div', { class: 'panel' }, h('h2', { text: 'Add an editor' }), h('p', { class: 'hint', text: 'Choose a starting password together, in person or by phone. Don’t send it by email or text.' }),
      h('form', { onsubmit: function (e) {
        e.preventDefault(); ne.textContent = '';
        var name = nn.value.trim(); if (!name) { ne.textContent = 'Add their name.'; return; }
        if (KEYS.users.some(function (u) { return norm(u.name) === norm(name); })) { ne.textContent = 'There’s already an editor with that name.'; return; }
        var bad = pwCheck(np.value, name); if (bad) { ne.textContent = bad; return; }
        if (np.value !== np2.value) { ne.textContent = 'The two passwords don’t match.'; return; }
        nb.disabled = true; nb.textContent = 'Encrypting…';
        sealToken(TOKEN, name, np.value).then(function (u) {
          return loadKeysFresh().then(function () { var nk = JSON.parse(JSON.stringify(KEYS)); nk.users.push(u); return saveKeys(nk, 'Admin: add editor ' + name + ' (by ' + ME + ')'); });
        }).then(function () { nn.value = np.value = np2.value = ''; nb.disabled = false; nb.textContent = 'Add editor'; toast(name + ' can now log in.'); draw(); })
          .catch(function (e) { nb.disabled = false; nb.textContent = 'Add editor'; ne.textContent = 'Couldn’t add: ' + e.message; });
      } }, h('div', { class: 'grid' }, field('Name', nn), field('Password', np, 'At least ' + MIN_PW + ' characters.'), field('Password again', np2)), ne, nb)));

    // change my password
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

    // replace key
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
  function loadKeysFresh() { return readFile(KEYS_PATH).then(function (f) { KEYS = JSON.parse(f.text); KEYS_SHA = f.sha; }, function () {}); }

  boot();
})();
