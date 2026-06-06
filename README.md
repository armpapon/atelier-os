# Loop

Personal life OS — **Finance** · **Trading Journal** · **Learning Hub** · **Daily Journal** · **Family**

Built with React 18 + Vite, backed by Supabase, deployed on Vercel.

> The repo directory is `atelier-os/` for historical reasons; the product is **Loop**.

---

## Local development

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # required before every push — catches deploy-blocking bugs
```

## Deploy

`git push` to `main` → Vercel auto-deploys to https://atelier-os-eta.vercel.app

## Database

Supabase project. Auth + Postgres + Storage (single `avatars` bucket).
SQL migrations live in `supabase/migration_*.sql` — **run them manually in the Supabase SQL Editor** when pulling a new feature. No migration runner.

---

## Modules

| Module | Page | Highlights |
|---|---|---|
| Finance | `src/pages/Finance.jsx` | Personal + Family scopes, CSV import (Make/KBank), inline-edit table, debt tracker with payment recording, cash-flow forecast, recurring bills, scope transfers |
| Trading | `src/pages/Trading.jsx` | ICT-style trade journal, daily plan with chart upload, DST-aware killzone schedule, standalone HTML playbook at `/playbook.html` |
| Learning | `src/pages/Learning.jsx` | YouTube + book + course tracking, note-taking with translation, page/video progress, cover image upload |
| Journal | `src/pages/Journal.jsx` | Daily bullet logging |
| Family | `src/pages/Family.jsx` | Member profiles with health info, growth records, milestones, photos |

---

## Project structure (high level)

```
src/
├── App.jsx                  # routing + global state
├── styles.css               # design tokens + global CSS
├── pages/                   # one file per top-level module
├── components/
│   ├── ui/                  # shared primitives (Button, Card, Badge, EmptyState)
│   ├── dashboard/           # finance widgets
│   ├── trading/             # trading widgets
│   ├── family/, learning/
│   └── VersionHistory.jsx   # changelog + sidebar version label
└── lib/
    ├── supabase.js
    └── api/                 # one file per domain (finance, trades, learning, …)

supabase/
├── schema.sql               # initial schema
└── migration_*.sql          # additive migrations (run manually)

public/
└── playbook.html            # standalone trading playbook
```

For Claude Code session context, see [`CLAUDE.md`](./CLAUDE.md).
