# Deploying the Price Radar (always-on, no laptop, no Claude)

Three moving parts, all self-hosted:

```
GitHub Actions (weekly cron)  →  scrape + match + metrics  →  Supabase
                                                                 ↓
                          Vercel (Next.js dashboard, always on) ← reads
                                                                 ↓
                                                       your team opens the URL
```

## 1. Push the repo (one-time)

```bash
git push -u origin main
```

The remote is already set to `https://github.com/giovannicasinetto/automations`.
`.env`, data files, and `web/.env.local` are git-ignored — no secrets get pushed.

## 2. GitHub Actions — the weekly scrape

The workflow is at `.github/workflows/scrape.yml` (runs Mondays 06:00 UTC, and
on-demand from the Actions tab). It needs two repository secrets:

1. On GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
2. Add `SUPABASE_URL` = `https://ahsgibfjwvqinyitruix.supabase.co`
3. Add `SUPABASE_SERVICE_ROLE_KEY` = your service role key.

Then **Actions tab → Weekly competitor scrape → Run workflow** to test it once.

## 3. Vercel — the dashboard

1. On [vercel.com](https://vercel.com) → **Add New → Project** → import
   `giovannicasinetto/automations`.
2. Set **Root Directory** to `web`.
3. Add Environment Variables (same two values as above):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. You get a URL like `automations-xxx.vercel.app`.

The service key is only used server-side (never shipped to the browser).

### Team access (password)

Simplest: Vercel **Project → Settings → Deployment Protection → Password
Protection** (Pro plan), or Vercel Authentication (SSO) on any plan. Either gates
the whole site behind a login you share with the team.

## Catalogue refresh

The weekly job scrapes + matches + recomputes metrics. It does **not** re-import
the catalogue (that comes from a PIM/pricing export). When your catalogue or
prices change, re-run locally:

```bash
npm run import -- "path/to/Pricing.xlsx"
```

(or we can add a second scheduled job once the export lives somewhere fetchable).
