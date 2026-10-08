# ywamsf-dts
YWAM San Francisco site concepts, published at https://ywamembers.org

- `ywam6/` — the chosen direction (backlit sign)
- `ywam5/` — twin concept (neon sign)
- `ywam1/`–`ywam4/` — earlier palette and style explorations

## Editing the site (admin)

- Admin page: https://ywamembers.org/admin/ (password login per editor).
- Editable content lives in `content/*.json`, with uploaded photos in `content/uploads/`.
- `src/build.py` builds `ywam5/` and `ywam6/` from `src/assets` and `content/`.
- `.github/workflows/build.yml` rebuilds automatically when content changes, and every night so DTS dates roll over.
- Run locally: `V=6 python3 src/build.py` (set `TODAY=YYYY-MM-DD` to preview another date).
