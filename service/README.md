# YWAM SF admin service: setup guide

This small service sits between the admin page and GitHub. It holds the only GitHub key, keeps
everyone's sign-in (email + password, invites and "Forgot password?" by email), enforces the three
levels (administrator, editor, contributor), keeps blog comments until they're approved, and sends the
notification emails. It runs free on Cloudflare Workers; emails go through Resend (free tier).

Everything below is done in the Cloudflare, Resend, GitHub and GoDaddy websites. No programs to install.
Allow about 45 minutes. **Never paste any key into a chat or an email**: each key goes only into the box
named here.

## 1. Accounts

1. **Cloudflare:** sign up at https://dash.cloudflare.com/sign-up, ideally with a shared YWAM SF email
   (for example web@ywamsanfrancisco.org) so the account never depends on one person. Turn on two-factor
   sign-in (Profile → Authentication).
2. **Resend:** sign up at https://resend.com with the same shared email.

## 2. The database

1. Cloudflare dashboard → **Storage & Databases → D1 SQL Database → Create**. Name it `ywamsf-admin`.
2. Open it → **Console**. Open `service/schema.sql` from this repository on GitHub, copy all of it,
   paste it into the console and press **Execute**. You should see the tables created.

## 3. The service (Worker)

1. Cloudflare dashboard → **Compute (Workers) → Workers & Pages → Create → Create Worker**.
   Name it `ywamsf-admin` and press **Deploy** (it deploys a "Hello World" first; that's fine).
2. Press **Edit code**. Delete everything in the editor, then open `service/src/index.js` from this
   repository on GitHub, copy all of it and paste it in. Press **Deploy**.
3. Go to the Worker's **Settings → Bindings → Add → D1 database**. Variable name: `DB`. Database:
   `ywamsf-admin`. Save.
4. **Settings → Variables and Secrets → Add**, as **Text**:

   | Name | Value |
   |---|---|
   | `REPO` | `lilbirdlifecoaching/ywamsf-dts` |
   | `BRANCH` | `main` |
   | `ALLOWED_ORIGINS` | `https://ywamembers.org,https://www.ywamembers.org,https://ywamsanfrancisco.org,https://www.ywamsanfrancisco.org` |
   | `ADMIN_URL` | `https://ywamembers.org/admin/` |
   | `MAIL_FROM` | `YWAM SF website <website@ywamsanfrancisco.org>` |

5. Still in **Variables and Secrets**, add these as **Secret** (type: Secret):
   - `SETUP_KEY`: make up a long phrase (five or more random words). You'll type it once, in step 6.
   - `GITHUB_TOKEN`: on github.com, signed in as the account that owns the site: Settings → Developer
     settings → Personal access tokens → **Fine-grained tokens → Generate new token**. Name "YWAM SF admin
     service", expiry 1 year, Repository access **Only select repositories → ywamsf-dts**, Permissions
     **Contents: Read and write** and **Actions: Read-only**. Generate, copy, paste it straight into this
     Cloudflare box. Put a reminder in your calendar 11 months from now to replace it.
   - `RESEND_KEY`: from step 4 below (come back and add it).
6. Note the Worker's address, shown at the top of its page, like
   `https://ywamsf-admin.<your-name>.workers.dev`. Opening `…workers.dev/health` in a browser should show
   `{"ok":true,"setup":true}`.

## 4. Email (Resend)

1. Resend → **Domains → Add domain** → `ywamsanfrancisco.org`.
2. Resend shows three or four DNS records (on `send.ywamsanfrancisco.org` and `resend._domainkey`).
   They don't touch the existing email (Google Workspace) records.
3. In GoDaddy (Wild West Domains) → the domain's **DNS** → **Add record** for each one, copying the type,
   name and value exactly. Back in Resend press **Verify** (it can take up to an hour).
4. Resend → **API Keys → Create API key**, permission "Sending access", domain `ywamsanfrancisco.org`.
   Copy it and paste it into the Worker's `RESEND_KEY` secret (step 3.5).

## 5. Switch the admin page over

Tell Claude (or whoever looks after the site) the Worker's address from step 3.6. It isn't secret. They'll
set it in `admin/index.html` (the `admin-service` meta tag and the `connect-src` line) and publish.

## 6. First sign-in

1. Open https://ywamembers.org/admin/. It shows **Create the first administrator**.
2. Enter the `SETUP_KEY` phrase, your email, your name and a password. You're signed in, and the tour starts.
3. **People → Invite someone** for everyone else. They get an email to choose their own password.
4. Delete the old GitHub key used by the previous admin (GitHub → Fine-grained tokens), and Claude will
   remove `admin/keys.json`.

## Day to day

- **Forgot password:** "Forgot password?" on the sign-in screen emails a reset link (valid 2 hours).
- **Someone leaves:** People → Turn off.
- **The GitHub key expires** (yearly): make a new one as in 3.5 and replace the `GITHUB_TOKEN` secret.
  Nobody needs to be re-added.
- **Updating the service code:** paste the new `service/src/index.js` into the Worker editor and Deploy.
  If `schema.sql` changed, run the new lines in the D1 console.

## For developers

- `node test/run.mjs` (from `service/`, after `npm install`) runs 59 end-to-end checks locally with a fake
  GitHub and mailbox.
- `node test/dev.mjs` runs the service on http://127.0.0.1:8787 with the real content, for trying the admin
  page (set its `admin-service` meta to that address in a local copy).
- Levels: `policy()` and `canPublish()` in `src/index.js`. Blog posts (`content/blog/*.json`) and
  `resources.json` go to editors for approval; everything else to administrators; `show_*` keys in
  `settings.json` (section switches) are administrator-only.
- Blog comments are stored in D1; approved ones are written to `content/comments/<post>.json` (name, text,
  date only) for the site build to show. The public endpoint is `POST /public/comments`.
