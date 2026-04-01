# Contributing & branch strategy

## Branch structure

```
main          ← production (v2 — all features)
v1            ← stable Phase 1 release (manual phone, no AI/WhatsApp)
feature/*     ← new features (branch from main, PR back to main)
fix/*         ← bug fixes
```

## How to add a feature

```bash
git checkout main
git pull
git checkout -b feature/your-feature-name
# ... make changes ...
git push origin feature/your-feature-name
# Open a PR to main
# GitHub Actions will build a Vercel preview automatically
```

## How to fix a bug

```bash
git checkout -b fix/description-of-bug
# ... fix it ...
git push origin fix/description-of-bug
# PR to main
```

## Keeping v1 in sync with fixes

If a bug fix applies to both versions:
```bash
git checkout v1
git cherry-pick <commit-hash>
git push origin v1
```

## Environment variable rule

**Never hardcode credentials.** Always:
- Local: `.env` file (git-ignored)
- CI: GitHub Secrets
- Railway: Variables panel
- Vercel: Environment Variables panel

## File naming convention

One file, one responsibility:
- Backend: `snake_case.py`
- Frontend: `PascalCase.jsx` for components, `camelCase.js` for hooks/stores
- SQL: `schema.sql`, `schema_v2_additions.sql`

## Rate limit changes

The rate limit default (45s) is in `backend/dialer/rate_limiter.py`:
```python
DEFAULT_INTERVAL_SECONDS = 45
```
Change the default here. Per-org and per-campaign overrides are set in the database, not in code.
