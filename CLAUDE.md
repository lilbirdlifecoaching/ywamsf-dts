# YWAM San Francisco website — guide for Claude (and anyone taking over)

This repo is the concept site for the YWAM San Francisco refresh, published with GitHub Pages at
https://ywamembers.org (a **test domain**; the site moves to ywamsanfrancisco.org after approval).
The full build document, including the list of assets and copy still needed, is in the
Claude project **"Ange YWAM"** as `claude/ywam-sf-website-work-log.md`. Read it first.

## Who and what

- Owners: Luke Haythorpe and Angela (Ange) Haythorpe. Ange presents the site to YWAM SF
  (director: Steve). A creative director gives design feedback.
- **YWAM 6 (`ywam6/`) is the chosen site.** YWAM 5 (`ywam5/`) is its twin: every change goes
  to both, *except colours* (YWAM 6 is white/cyan/teal; YWAM 5 keeps the older fog/red look so
  the team can compare). `ywam1/`–`ywam4/` are frozen early explorations: don't touch them.
- Direction: "a place to learn the way of Jesus by living it". The DTS is framed around
  **the Monastery**: a place of peace in the middle of the Tenderloin, not an escape from it.

## Never do

- Never ask for, paste, print or store the GitHub token. Editors enter it only in the admin page.
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
| `admin/` | The admin page (pure JS; commits to this repo through the GitHub API) |
| `.github/workflows/build.yml` | Rebuilds `ywam5/` and `ywam6/` on every push to `src/` or `content/`, and nightly (~1 am SF) |
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

- **Colours (YWAM 6):** `html.tb` class. Variables in the `round 48` block of `site5.css`:
  page white, `--cyan #24AFBE` (buttons, hairlines; dark teal text on cyan buttons),
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
- **SEO:** every page is `noindex` until launch. `SITE_BASE` env sets canonical URLs.
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
