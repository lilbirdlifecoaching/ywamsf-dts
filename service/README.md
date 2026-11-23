# YWAM SF admin service: setup guide

This small service sits between the admin page and GitHub. It holds the only GitHub key, keeps
everyone's sign-in (email + password, invites and "Forgot password?" by email), enforces the three
levels (administrator, editor, contributor), keeps blog comments until they're approved, and sends the
notification emails. It runs free on Cloudflare Workers; emails go through Resend (free tier).

Everything below is done in the Cloudflare, Resend, GitHub and Webstix websites. No programs to install.
Allow about 30 minutes, plus up to an hour for the email check. **Never paste any key into a chat or an email**: each key goes only into the box
named here.

## 1. Cloudflare account

1. Sign up at https://dash.cloudflare.com/sign-up (a shared YWAM SF email is best long-term; a personal one is fine to
   start, and more members can be added later under Manage account → Members). Turn on two-factor sign-in
   (My Profile → Authentication).
2. Open **Workers & Pages** once. If it asks you to choose a `workers.dev` subdomain, pick one (for example `ywamsf`).
3. Copy your **Account ID** (Workers & Pages overview, right-hand side, or the ⋯ menu next to the account name).

## 2. Let GitHub deploy the service

1. Cloudflare → My Profile → **API Tokens → Create Token** → template **Edit Cloudflare Workers** → Use template.
   Under Permissions press **+ Add more** and add **Account · D1 · Edit**. Account Resources: your account.
   Zone Resources: All zones (the template needs it; the site doesn't use any zone). Continue → Create Token → copy it.
2. GitHub → the `ywamsf-dts` repository → **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN`: the token from step 1.
   - `CLOUDFLARE_ACCOUNT_ID`: the Account ID.
3. GitHub → **Actions → Deploy admin service → Run workflow**. It creates the database and the tables, deploys the
   service and shows its address (like `https://ywamsf-admin.ywamsf.workers.dev`). Later changes to `service/` deploy
   themselves.

## 3. The service's secrets (Cloudflare dashboard)

Workers & Pages → **ywamsf-admin → Settings → Variables and Secrets → Add**, type **Secret**:

- `SETUP_KEY`: make up a long phrase (five or more random words). You'll type it once, at first sign-in.
- `GITHUB_TOKEN`: on github.com, signed in as the account that owns the site: Settings → Developer settings → Personal
  access tokens → **Fine-grained tokens → Generate new token**. Name "YWAM SF admin service", expiry 1 year, Repository
  access **Only select repositories → ywamsf-dts**, Permissions **Contents: Read and write** and **Actions: Read-only**.
  Generate, copy, paste it straight into this box. Put a reminder in your calendar 11 months from now to replace it.
- `RESEND_KEY`: from step 4 below (add it when email is ready; until then the admin shows invitation links to copy).

Deploying again never removes these secrets.

## 4. Email (Resend)

1. Resend → **Domains → Add domain** → `ywamsanfrancisco.org`.
2. Resend shows three or four DNS records (on `send.ywamsanfrancisco.org` and `resend._domainkey`).
   They don't touch the existing email (Google Workspace) records.
3. In Webstix (where the domain is managed) → the domain’s **DNS** → **Add record** for each one, copying the type,
   name and value exactly. Back in Resend press **Verify** (it can take up to an hour).
4. Resend → **API Keys → Create API key**, permission "Sending access", domain `ywamsanfrancisco.org`.
   Copy it and paste it into the Worker's `RESEND_KEY` secret (step 3.5).

## 5. Switch the admin page over

Tell Claude (or whoever looks after the site) the service's address from step 2.3. It isn't secret. They'll
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
- **Updating the service code:** push to `service/`; the Deploy admin service Action deploys it and updates the tables.

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
