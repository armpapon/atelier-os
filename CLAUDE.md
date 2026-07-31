# CLAUDE.md

> Auto-loaded by Claude Code when a session starts in this repo.
> Read once at session start. Source of truth for project context.

---

## 1 · TL;DR

- **Project**: **Loop** — personal life OS (Finance, Trading Journal, Learning Hub, Daily Journal, Family).
- **Owner**: Arm (`armpapon@gmail.com`). Solo project, Thai-speaking user.
- **Stack**: React 18 + Vite + Supabase (Postgres + Auth + RLS + Storage). Deployed on Vercel via GitHub auto-deploy.
- **Current version**: bumped in `src/components/VersionHistory.jsx` — `CHANGELOG[0].version`. Sidebar reads this at runtime.
- **Folder**: `Loop/` (renamed from `atelier-os/` at v1.0). GitHub repo is still `armpapon/atelier-os` — keep that as-is for now (Vercel deployment is linked to it).

---

## 2 · Where things live

| Concern | File / Folder |
|---|---|
| Routing + shell | `src/App.jsx`, `src/components/Sidebar.jsx` |
| Design tokens + global CSS | `src/styles.css` (CSS vars: `--accent`, `--ink`, `--line`, `--surface`, `--amber`, `--profit`, `--loss`, …) |
| Shared UI primitives | `src/components/ui/index.js` — `Button, Card, CardHeader, Badge, EmptyState` |
| Finance page (the big one) | `src/pages/Finance.jsx` (1000+ lines, holds TxnForm + InlineEdit + InlineSelect + FinanceView) |
| Finance dashboard widgets | `src/components/dashboard/` — DebtTracker, RecurringTracker, CashFlowForecastCard, EmergencyFundCard, ScopeTransferModal, MonthNav |
| Finance API (CRUD + helpers) | `src/lib/api/finance.js` |
| Trading | `src/pages/Trading.jsx` + `src/components/trading/` (TradingPlaybook, DailyPlanCard) + `src/lib/api/{trades,tradingPlans}.js` |
| Learning Hub | `src/pages/Learning.jsx` + `src/lib/api/learning.js` |
| Family | `src/pages/Family.jsx` + `src/components/family/` + `src/lib/api/family.js` |
| Journal | `src/pages/Journal.jsx` + `src/lib/api/journal.js` |
| Version history (sidebar version + changelog UI) | `src/components/VersionHistory.jsx` — **bump `CHANGELOG[0]` on every user-visible commit** |
| Supabase client | `src/lib/supabase.js` |
| SQL migrations | `supabase/migration_*.sql` (run manually in Supabase SQL Editor — no migration runner) |
| Standalone HTML | `public/playbook.html` (XAUUSD trading playbook served at `/playbook.html`) |

---

## 3 · Conventions

### Design system — "Editorial Minimal OS"
- Warm ivory palette. Fonts: **Anuphan** (Thai display) + **JetBrains Mono** (numbers, labels).
- **Inline styles using CSS variables**. Avoid creating new utility classes — extend `src/styles.css` only when a pattern repeats 3+ times.
- Mono-style small labels: `fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase'`.
- All copy is **Thai**. Commit messages and code comments stay English.

### Data model conventions
- Row-Level Security on every user-owned table: `WHERE user_id = auth.uid()`.
- `scope` enum on Finance tables: `'personal' | 'family'`. Same schema, different bucket.
- Storage: single `avatars` bucket. Paths namespaced: `{user_id}/{feature}_{id}_{ts}.jpg`. Reused for family photos, trading charts, learning covers.
- Custom categories live in `localStorage` (key: `loop:custom-categories`), merged with `DEFAULT_CATEGORIES` at render time. Schema unchanged.

### When running SQL as user (Supabase SQL Editor)
- `auth.uid()` returns NULL in SQL Editor (runs as `postgres` role). Use subquery instead:
  ```sql
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'armpapon@gmail.com')
  ```

---

## 4 · Workflow rules (non-negotiable)

### Build before push — **always**
```bash
npm run build
```
- v0.28 shipped a duplicate-`const` bug → Vercel build failed silently → site stuck on previous version for hours.
- esbuild catches duplicate declarations and unresolved imports. 2 seconds of `npm run build` saves a deploy debugging round-trip.

### Bump version on every user-visible commit
- Add a new entry as `CHANGELOG[0]` in `src/components/VersionHistory.jsx` with `badge: 'Current'`.
- Remove `badge: 'Current'` from the previous entry.
- Sidebar version label updates automatically.

### Commit message style (matches recent history)
```
<type>(<scope>): <short imperative summary>

<one-paragraph reason / what changed>

USER REQUEST  ← if driven by a chat message, quote it
'…verbatim Thai…'

CHANGELOG: vX.Y

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
Types: `feat`, `fix`, `docs`, `refactor`. Scopes are loose: `finance`, `learning`, `trading`, `debt`, etc.

### Deploy is automatic
- `git push` → Vercel auto-deploys to `https://atelier-os-eta.vercel.app`.
- If you need to verify deploy status: `gh api repos/armpapon/atelier-os/deployments` then check `/statuses` on the latest.
- Don't push if you haven't bumped the changelog — user notices.

---

## 5 · User preferences (learned)

### Language & tone
- Reply in **Thai**. Tight bullets > paragraphs. Tables for comparisons.
- User says "ตั้งสติใหม่" / "ผิดไปหมดเลย" = stop over-engineering. Simplify hard.
- When user says "เอาแบบนี้ก็ได้" — they're suggesting their own simpler take. Listen.

### How user works
- Prefers **ready-to-run SQL** over instructions ("go run this query and adjust").
- Tries things in production. Will hit DB errors → expects me to read the error + give the SQL fix immediately, not lecture.
- Asks for plan first when the change is broad — has said "ขอแผนก่อน" explicitly. Default to **short plan + go/no-go question** on multi-file changes.

### UI rules user has decided
- **Edit popup near the clicked row** — not viewport-centered, not side-drawer, not auto-scrolled. v0.27 logic: `popupCenter = rowCenter, clamped to viewport`.
- **Inline edits in tables** — click any cell to edit (Enter saves, Esc cancels). Built in `<InlineEdit/>` and `<InlineSelect/>` in Finance.jsx.
- **Default to today on page open** (v0.29). No sticky-month persistence in localStorage.
- **Date defaults = today** in any new-entry form.
- **Cover images** for learning sources are uploaded to `avatars` bucket, fall back to YouTube thumbnail, last fallback is the letter glyph.

### Anti-patterns user dislikes
- Side-drawer modals that slide from the right.
- Auto-scrolling forms ("don't make me look elsewhere").
- Asking clarifying questions when context is obvious from screenshot/error.
- Speculative new tables/files. If something doesn't exist yet, point it out before writing.

---

## 6 · Current state

### Open SQL migrations user must run in Supabase
Each is idempotent — safe to re-run.

All of these have now been run (user confirmed 2026-08-01). Nothing is pending.

| Status | Migration | Reason |
|---|---|---|
| ✅ run | `migration_drop_txn_type_check.sql` | unblock custom categories |
| ✅ run | `migration_add_recurring_forecast.sql` | adds `recurring_expenses` table + `accounts.is_emergency_fund` |
| ✅ run | `migration_add_source_cover.sql` | adds `learning_sources.cover_url` — book cover upload works |
| ✅ run | `migration_add_learning_insights.sql` | v1.1 — adds `learning_insights` table + `learning_sources.reading_goal_min`. Insights Bank tab |
| ✅ run | `migration_add_trades_ha50.sql` | v3.78 — adds `trades.exit_price / r_multiple / followed_rules / rule_broken / system`. HA-50 mission card + trade form |
| ✅ run | `migration_add_trades_ict.sql` | adds the ICT trade columns — evidenced by daily use of the trade log |

### Pending product ideas (user said "เดี๋ยวจะกลับมาคุย")
- **Income vs Expense separation**: user wants to model finance as two separate buckets/accounts instead of in-and-out from one. Currently exploring by entering May manually. Will return with a model proposal.
- **Smart Budget Builder**: discussed earlier, not yet executed.
- **Edit cover** for existing learning sources (current form only allows on creation).
- **Data recovery for debt months_paid**: user opted to fill in manually rather than auto-recover from `start_date`. Done.

### Known caveats
- `transactions` table check constraint was dropped — `type` is now free-form text. Don't add it back.
- Local folder is `Loop/`. GitHub repo + Vercel project are still named `atelier-os` — production URL stays `atelier-os-eta.vercel.app`. Don't try to rename the remote.
- v0.21's auto-scroll-to-top in TxnForm was reverted in v0.22 — user explicitly didn't want it. Don't re-add.

---

## 7 · Anti-patterns / don'ts

- ❌ Don't create new `.md` files unless asked (this one is the exception).
- ❌ Don't add side-drawer modals. Use centered or anchor-positioned popups.
- ❌ Don't add `scrollIntoView` or `scrollTo({top:0})` to forms.
- ❌ Don't introduce a CSS framework or utility lib (Tailwind etc.). Inline styles + CSS vars only.
- ❌ Don't create a migration runner. User runs SQL manually in Supabase.
- ❌ Don't push without `npm run build`. Don't push without bumping `CHANGELOG[0]`.
- ❌ Don't refactor unrelated code while fixing a bug. Single concern per commit.
- ❌ Don't speculate on table/column names — read the migration files first.
- ❌ Don't write `console.log` in shipping code.
- ❌ Don't ship emojis in commit-message subject lines (body is fine).

---

## 8 · Quick orient — when you take over a fresh session

1. `git log --oneline -10` to see recent direction.
2. `head -25 src/components/VersionHistory.jsx` to read latest 1-2 changelog entries.
3. Skim section 6 above for pending work.
4. Reply to the user in Thai. Get going.
