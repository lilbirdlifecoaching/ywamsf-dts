# YWAM San Francisco website — guide for Claude (and anyone taking over)

This repo is the concept site for the YWAM San Francisco refresh, published with GitHub Pages at
https://ywamembers.org (a **test domain**; the site moves to ywamsanfrancisco.org after approval).
The full build document, including the list of assets and copy still needed, is in the
Claude project **"Ange YWAM"** as `claude/ywam-sf-website-work-log.md`. Read it first.

## Who and what

- Owners: Luke Haythorpe and Angela (Ange) Haythorpe. Ange presents the site to YWAM SF
  (director: Steve). A creative director gives design feedback.
- **The main site is YWAM 7, published at the top of https://ywamembers.org/ (since Nov 14 2026).** Build it with
  `ROOT_SITE=1 OUT=.site7 python3 src7/build.py && python3 tools/publish_root.py`: the site is built into `.site7/` (not
  committed) and copied to the repo root; `site-files.txt` lists the published files so stale ones are removed and nothing
  else at the root is touched. `ywam7/` and `course/` now only hold redirect pages (old addresses → new). The DTS page
  is at **/dts/** (was /course/). Large photos get 600/960px copies and a srcset automatically (`phone_sizes()` in
  `src7/build.py`) so phones don't run out of memory; the home hero has a light phone version (`.lite`, dayhero.js).
  Archive: `ywam0/` (the original first page, formerly at the root), `ywam1/`–`ywam6/`; `legacy/` holds the assets
  `ywam1`–`ywam4` and `am-i-ready/` share (formerly `/assets/`).
- **YWAM 7 (built from `src7/`, Nov 2026) is a copy of YWAM 6 for the big simplification after the org's feedback.**
  It has its own generator and assets in `src7/` (`python3 src7/build.py`) and shares `content/` (and so
  the admin page) with 5 and 6. Changes for the simpler direction go in `src7/` only; leave `src/` alone unless
  the user asks for a change on 5/6 too.
  YWAM 7 extras: the "Ask us anything" chat (`src7/assets/chat7.js`) answers only from a knowledge list built at the
  end of `src7/build.py` (`KB`, written to `assets/chat-kb.js`; no AI, nothing leaves the browser). Shifts with their
  own sign-up form are in `SIGNUP_LINKS`. The DTS FAQ adds the team's answers in `FAQ_OVERRIDE`/`FAQ_EXTRA_*`.
- **YWAM 6 (`ywam6/`) is the current approved-direction site.** YWAM 5 (`ywam5/`) is its twin: every change goes
  to both, *except colours* (YWAM 6 is white/cyan/teal; YWAM 5 keeps the older fog/red look so
  the team can compare). `ywam1/`–`ywam4/` are frozen early explorations: don't touch them.
- Direction: "a place to learn the way of Jesus by living it": a place of peace in the middle of the
  Tenderloin, not an escape from it. **Don't use "Monastery" language in YWAM 7** (Nov 2026: the org isn't ready
  to introduce it; it was removed from the DTS page, Join Staff, the chat and the readiness quiz).

- **Blog (Nov 23 2026):** the 78 Squarespace posts live in `content/blog/*.json` (one file per post, plain safe HTML in
  `body`), photos in `content/uploads/blog-*`. Every post keeps its **old Squarespace address** (`path`, e.g.
  `blog/2026/1/19/church-that-shows-up/`), as do `blog/category/<name>/` and `blog/tag/<name>/`, so Google results carry
  over at the domain move. Built by the BLOG section of `src7/build.py` (post pages, list pages 18 per page, RSS
  `blog/feed.xml`, BlogPosting data), which also writes `sitemap.xml` and `robots.txt`. Links anywhere on the site to
  `ywamsanfrancisco.org/blog/...` are rewritten to the local copy (`wire()`). Raw import: `design-src/squarespace-blog/`;
  re-import with the "Import blog from Squarespace" Action, then `python3 tools/convert_blog.py` (overwrites content/blog/).
  Admin → Blog posts (Nov 23 2026) writes and edits these files: list from `blog-index.json` (written by the build, drafts
  included), editor output serialized to the same allow-listed HTML (`blogSerialize` in admin.js; the build re-checks it in
  `blog_body`), `hidden: true` = draft, future `date` = scheduled, `path` fixed at first save. File names must match
  `[a-z0-9][a-z0-9-]{0,80}.json` (service `BLOG_PATH`).
- **Old Squarespace addresses (Nov 23 2026):** `tools/old_addresses.txt` (pages) and `tools/old_events.txt` (70 past events →
  News & Events) get instant redirect pages from `tools/publish_root.py` (no noindex, canonical = new page). At the domain
  move set `SITE_BASE=https://ywamsanfrancisco.org/` for both the build and publish_root (build.yml), remove `noindex`, add `CNAME`.

- **Visual editor (Nov 23 2026):** admin → Visual editor shows the real page in a frame. `edit_hooks()` in `src7/build.py`
  marks text/photos that come from `content/*.json` (`data-edit="file|path"`, `data-edit-img`; only values unique to one
  field and shown whole in one element). Edits autosave as a per-browser draft (localStorage) and publish through the
  normal `store.save` path (history, undo, approvals, practice mode, conflict check). Search titles/descriptions per page:
  `content/seo.json` (admin → Search & sharing), applied in `meta_for()`. Analytics/verification IDs: settings.json
  (`analytics_ga4_id`, `analytics_cloudflare_token`, `google_site_verification`, `bing_site_verification`), off when empty.
- **Editable wording (Nov 23 2026):** `text_layer()` in `src7/build.py` gives every template text block (headings, paragraphs,
  labels, buttons, menu/footer; inline <em>/<strong>/<br> allowed, no links inside) `data-pt="<scope>|<sha1 of original>"`
  (scope = page path or `site` for header/footer) and template photos with alt text `data-pt-img="<scope>|img:<file>"`.
  Overrides live in `content/page_text.json` (`text[id] = {v, o, page, by, at}`, `img[id] = {v: "uploads/…"}`), applied at
  build (sanitized by `pt_clean`). Admin → Visual editor edits them (B/I toolbar, Reset to original, list of all changes).
  If you reword template text in code, an existing override for the old wording simply stops applying (its key changes).
  Don't name other attributes `data-pt*`. Emails/phones/URLs are excluded (they come from Settings).
- **"How it's going" dashboard (Nov 23 2026):** admin → How it's going (any signed-in person). `service/src/analytics.js`
  (`GET /analytics?days=7|30|90`, cached an hour in D1 `analytics_cache`) reads GA4 (Data API) + Search Console with one Google
  service account (Worker secrets `GOOGLE_SA_KEY` = whole JSON key, `GA4_PROPERTY_ID` = the numeric property ID) and Cloudflare
  Web Analytics via GraphQL (`CF_ANALYTICS_TOKEN` Account Analytics:Read, `CF_ACCOUNT_ID`). `/health` → `analytics` says which are
  set (never values). Not set up → labelled sample numbers. Drawn by `renderStats` in admin.js (hand-made SVG chart, no libraries).
- **LAUNCHED Nov 23 2026:** DNS for ywamsanfrancisco.org moved to GitHub Pages (Webstix) and `launch-switch` was merged: CNAME
  `ywamsanfrancisco.org`, build.yml `MAIN_SITE=https://ywamsanfrancisco.org/`, `MAIN_INDEXING='1'` (pages indexable, canonical on the
  real domain), service ADMIN_URL/SITE_URL on the real domain. ywamembers.org no longer serves the site. Squarespace kept for a while as a fallback.
  Nov 23: Luke verified the domain in GitHub (account Settings → Pages, TXT record at Webstix) against takeover, and dealt with
  ywamembers.org's DNS. The sign-in service accepts only the ywamsanfrancisco.org origins. `tools/check_launch.py` runs in build.yml
  and mirror.yml before every publish and refuses a build that is noindex, off-domain or missing CNAME.
- **Site check (Nov 23 2026):** `.github/workflows/site-check.yml` runs `tools/site_check.mjs` Mon/Wed/Fri ~5:20 am SF (and on demand):
  every sitemap page and internal link, old addresses, desktop+phone browser checks (script errors, CSP blocks, overflow), CSP/noindex/
  canonical, sign-in service, certificate, DNS, MX/SPF/DKIM, plus repo checks. Report → `site-checks/latest.md` on branch `site-checks`.
  A scheduled Claude task ("YWAM SF site check", Mon/Wed/Fri 10:37 am SF) reads it, fixes small mechanical problems and pushes Luke a summary.
  If you add an outside service, add it to the CSP in `page()` or the browser check will fail.
- **Admin sign-in (Nov 23 2026): service mode is live** — `admin/index.html` points at https://ywamsf-admin.angela-95e.workers.dev
  (Cloudflare account angela-95e; deployed by `.github/workflows/deploy-service.yml`; secrets SETUP_KEY, GITHUB_TOKEN set
  in the Cloudflare dashboard on the `ywamsf-admin` worker; RESEND_KEY set Nov 23, Resend domain ywamsanfrancisco.org verified,
  sending via Resend Forge: CNAME `send` → send.forge.rmta.net, DKIM `resend._domainkey`; DNS on GoDaddy nameservers via Webstix). `admin/keys.json` was removed. Forgotten
  password: "Forgot password?" on the sign-in screen (email works). If the service is down, the
  fallback is key mode (empty the admin-service meta and set up a new key).
- **Levels (Nov 23 2026):** administrators do everything. Editors publish and approve the day-to-day sections (`EDITOR_FILES` in
  service/src/index.js and admin.js `canPublishFile`: blog posts, dts.json, events.json, shifts.json, ellis_week.json, banner.json,
  instagram.json, resources.json), moderate comments, can view History, and can invite contributors (and resend invites / turn
  contributors off). Their changes to approved site copy and design (page_text.json, seo.json, settings.json, faq, staff, board,
  testimonials, ministries, dts_life) wait for an administrator. Only admins restore old versions, remove people or see the activity log.
  Contributors: everything waits for approval.
- **Admin access recovery (key mode, before Nov 23 2026):** forgotten password → another editor removes and re-adds you (Editors & security).
  Everyone locked out or the GitHub key expired → the repo owner makes a new fine-grained token (this repo only, Contents
  read/write, Actions read, 1-year expiry), empties `users` in `admin/keys.json` on github.com, opens /admin/ (setup screen)
  and re-adds the editors. Always run `node -e "new Function(require('fs').readFileSync('admin/admin.js','utf8'))"`
  before pushing admin changes (a syntax error locks everyone out of the admin).

## Never do

- Never ask for, paste, print or store the GitHub token or any Cloudflare/Resend key. Editors enter them only in the admin page or the Cloudflare dashboard.
- Never overwrite `admin/keys.json` with test data (it holds the editors' encrypted keys). If a
  local test changes it, restore it with `git checkout admin/keys.json` before committing.
- Never edit `ywam5/` or `ywam6/` by hand: they are generated. Edit `src/` or `content/`.
- Never send the owners' email addresses to outside services.
- Don't invent facts about the ministry (housing, policies, numbers, stories). Write general
  copy, mark placeholders clearly, and list what the team must confirm.

## Layout

| Path | What |
|---|---|
| `src/build.py` | The whole site generator: every page's HTML, page titles/SEO, and the YWAM 6 colour swap |
| `src/assets/site5.css` | All styles. Written in "rounds": later rules at the bottom override earlier ones. Add new rules at the end under a `/* round NN: … */` comment |
| `src/assets/site5.js` | Menus, tabs, flip cards, calendar, boards, carousels, calculator |
| `src/assets/dayhero.js` | Home hero: real SF time/weather, the "last 24 hours" replay (real hourly data from Open-Meteo) |
| `src/assets/cablecar.js` | Home cable car strip (car + banner + painted skyline layers) |
| `src/assets/igcarousel.js` | The Golden Gate "bridge" carousels (Instagram, volunteer shifts) |
| `src/assets/survey.js/.css` | The DTS "Am I ready?" check-in quiz |
| `src/assets/img/`, `src/assets/cablecar/` | Site images |
| `content/*.json` | Everything editable in the admin page (DTS schools, FAQ, parents FAQ, staff, board, shifts, ministries, Ellis Room week, events, Instagram, resources, banner, settings, "What it's like") |
| `content/uploads/` | Photos uploaded in the admin page (and some added by Claude) |
| `admin/` | The admin page (pure JS). Two modes, set by `<meta name="admin-service">` in `admin/index.html`: empty = key mode (each editor unlocks the GitHub key in `admin/keys.json` with their password); set = service mode (signs in to `service/`). Has the guided tour, How-this-works panels (`HOWTO`), practice mode, help guide and history/undo |
| `service/` | The admin sign-in & approval service (Cloudflare Worker + D1): accounts, invites, password reset by email, levels (admin/editor/contributor), approvals, comment moderation, Resend emails. Setup guide: `service/README.md`. Tests: `cd service && npm install && node test/run.mjs` |
| `.github/workflows/build.yml` | Rebuilds `ywam5/`, `ywam6/` and the main site (root, from `src7/`) on every push to `src/`, `src7/` or `content/`, and nightly (~1 am SF) |
| `tools/publish_root.py` | Copies the built main site (`.site7/`) to the repo root and writes the redirect pages |
| `design-src/` | Source artwork and the scripts that produced generated images (see below) |
| `tools/` | Screenshot helpers for checking pages |

`src/build.py` is organised by page, with `# ----` banners: HOME, VOLUNTEER, BRING A TEAM,
JOIN STAFF, SERVING OUR NEIGHBORS (the Ellis Room page), DTS, ABOUT (who we are, staff & board,
news, resources), PAY, GIVE, CONTACT. Page titles/descriptions are in the `META` table near the top;
navigation is `NAV`, `TOP` and `ABOUT_MENU`.

## Build, check, publish

```bash
pip install --break-system-packages pillow playwright   # once; then: playwright install chromium
python3 src/build.py            # builds ywam5 (V defaults to 5)
V=6 python3 src/build.py        # builds ywam6
TODAY=2027-02-01 V=6 python3 src/build.py   # preview how dates roll over
python3 tools/screenshot_pages.py check ",course/"   # full-page screenshots of home + DTS
```

Always build **both** versions, look at screenshots (desktop 1440px and phone 390px) before
pushing, then commit and push to `main`. The Action rebuilds and GitHub Pages publishes in about
two minutes. Check the run succeeded:
`gh api "repos/lilbirdlifecoaching/ywamsf-dts/actions/runs?per_page=2" --jq '.workflow_runs[] | [.name,.conclusion,.head_sha[0:7]] | @tsv'`
If "pages build and deployment" fails with a GitHub server error, re-run it:
`gh api -X POST repos/lilbirdlifecoaching/ywamsf-dts/actions/runs/<id>/rerun-failed-jobs`.

CSS/JS are cache-busted automatically (a hash of `src/assets` is added to every link). The admin
page's own files use `?v=N` in `admin/index.html`: bump it when you change `admin.js`/`admin.css`.

## Conventions

- **Brand (YWAM SF Branding & Style Guide, applied Nov 16 2026; main site + admin):** Primary Blue `#01BCDE` (Pantone 311)
  for buttons/accents, Accent Navy `#24373D` for dark bands, headings and the footer, Accent Gray `#E2DFDE` (bands use
  the lighter `#F4F2F1`), black. `#00738B` (a deeper shade of the primary blue) only where text must be readable on white.
  Fonts: Gotham (primary: menus, buttons, body) and Adobe Caslon Pro (secondary: headings). Both need paid web licences, so
  the CSS asks for them first and falls back to Montserrat and Libre Caslon Text from Google Fonts (`FONTS` in
  `src7/build.py`, round 7-46 in `src7/assets/site5.css`). The look: "clean, bright and natural"; "our blue is a happy blue".

- **Colours (YWAM 6):** `html.tb` class. Variables in the `round 48` block of `site5.css`:
  page white, `--cyan #00BDDE` (the exact blue of the YWAM SF logo) (buttons, hairlines; dark teal text on cyan buttons),
  `--red` is remapped to teal `#0B7E90` for links/accent words, `--slate/--deep #08404F`
  for dark bands. Brand red `#C81D1B` only for tiny "Today" tags. `TB_SWAP` in `build.py`
  swaps a few hard-coded colour literals in YWAM 6's copy of the CSS.
- **Copy:** use the YWAM SF vocabulary from Steve's brief and the Dec 2025 vision outline
  (mission, vision, values, Monastery). "DTSes" is the plural. Numbers are 01/02/03, never roman
  numerals. Footer tagline: "Presence that restores."
- **Escaping:** anything from `content/` goes through `t()` (text), `lnk()` (links: only
  https/mailto/tel), `img()` (only `uploads/…` or the Squarespace image server). Data for scripts
  goes through `js()`. Keep it that way: the admin page is edited by non-developers.
- **Security:** the pages have a strict Content-Security-Policy. New outside services (fonts,
  APIs, embeds) must be added to it in `page()` or they will be blocked.
- **Editable vs coded:** if the team will want to change something often (dates, people, photos,
  FAQs, cards), put it in `content/*.json` and add a matching section in `admin/admin.js`
  (`SECTIONS` list; field helpers `F.text`, `F.area`, `F.photo`).
- **SEO:** since launch the build defaults to `SITE_BASE=https://ywamsanfrancisco.org/` and `INDEXING=1` for the main site (set
  `INDEXING=0` to hide it). Any workflow that rebuilds the site (build.yml, mirror.yml) must keep these; on Nov 23 mirror.yml once
  republished the site as noindex with test-domain canonicals because it built without them.
- **Testing animations:** the hero weather comes from Open-Meteo; in local tests, mock it with a
  Playwright route on `**/api.open-meteo.com/**`.

## Generated images (design-src/)

- `design-src/cablecar/build_skyline.py` rebuilds the painted skyline behind the cable car from the
  creative director's paintings in the same folder. Run it twice: once plain (grey mist, YWAM 5)
  and once with `BG=255,255,255 SUF=-w` (white mist, YWAM 6). `car55-cutout.png` was made with
  `rembg` (isnet-general-use model); the site's `src/assets/cablecar/car-55.webp` is that cutout
  trimmed and resized to 1300px wide.
- Other images (hero sky masks, light masks, neon/sign cut-outs) were made by hand-tuned
  scripts that were not kept; edit the existing PNGs if they need changes.

## Open work

See section 1 of the build document ("Needed from the team before launch") and the domain
migration checklist there. Placeholders currently on the site: home "Stories from Ellis Street",
the DTS "presence people can return to" story, and the DTS student testimonials.
