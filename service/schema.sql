-- YWAM SF admin service: Cloudflare D1 (SQLite) database.
-- Create once:  npx wrangler d1 execute ywamsf-admin --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,            -- stored lower-case
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'contributor')),
  pw_hash TEXT,                          -- PBKDF2-SHA256, base64; NULL until the invite is accepted
  pw_salt TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,     -- failed sign-ins in a row
  locked_until INTEGER NOT NULL DEFAULT 0,
  toured INTEGER NOT NULL DEFAULT 0,     -- has seen the guided tour
  created INTEGER NOT NULL
);

-- Sign-in sessions and one-time links. Only a SHA-256 of each token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('invite', 'reset')),
  expires INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

-- Changes waiting for approval (contributors), and the decisions on them.
CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,                 -- the whole new file (JSON text)
  summary TEXT NOT NULL DEFAULT '',
  base_sha TEXT,                         -- the file version it was based on
  reviewers TEXT NOT NULL,               -- 'editor' (posts, resources) or 'admin' (everything else)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'sent_back', 'withdrawn')),
  reviewer_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  decided INTEGER
);
CREATE INDEX IF NOT EXISTS changes_status ON changes (status, created);

-- Blog comments. Email addresses stay here (for replies); only name, text and date are published.
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ip_hash TEXT NOT NULL DEFAULT '',
  reviewer_id INTEGER,
  created INTEGER NOT NULL,
  decided INTEGER
);
CREATE INDEX IF NOT EXISTS comments_status ON comments (status, created);

-- Who did what (sign-ins, invites, publishes, approvals). Shown to administrators.
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
