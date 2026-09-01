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
| Tax planner | `src/pages/TaxPlanner.jsx` + `src/lib/api/tax.js` + **`src/lib/taxTH.js`** (pure brackets/caps/headroom — put tax rules THERE, never in the page) |
| Version history (sidebar version + changelog UI) | `src/components/VersionHistory.jsx` — **bump `CHANGELOG[0]` on every user-visible commit** |
| Supabase client | `src/lib/supabase.js` |
| SQL migrations | `supabase/migration_*.sql` (run manually in Supabase SQL Editor — no migration runner) |
| SQL seed data | `supabase/seed_*.sql` (e.g. `seed_credit_cards.sql` — idempotent record of rows already inserted via the Supabase MCP; not a pending migration) |
| Standalone HTML | `public/playbook.html` (XAUUSD trading playbook served at `/playbook.html`) |

---

## 3 · Conventions

### Design system — "True Cupertino" (phase 1 shipped v4.52)
- Cool iOS light palette: `--background` #f2f2f7 (systemGray6) ground, white cards,
  iOS system blue `--accent` #007aff.
- **The accent is split by role — they are not interchangeable** (v4.53, audit A10):
  `--accent` #007aff is **graphical only** (borders, focus rings, progress fills,
  icon tints, text ≥24px) because it measures 4.02:1; `--accent-fill` #006ade is
  for a filled control carrying `--text-inverse` text; `--accent-strong` #0058cc
  is for **any normal-size accent text**. Same rule for the `--amber` aliases:
  `--amber` = graphical, `--amber-2` / `--amber-deep` = text.
- Colour claims are **computed, not guessed**: `audit/colorcheck.mjs` (WCAG +
  Viénot/Brettel CVD + CIEDE2000, with reference self-tests) is the single source,
  and `audit/cases.mjs` asserts the whole palette on every harness run. Regenerate
  any ratio you write in a comment — a v4.52 comment claimed a CVD separation that
  was off by 31 ΔE and no test caught it.
  Replaced the "Cupertino Warm" ivory + clay palette in v4.52 — a **value-only**
  swap: every `:root` token name in `src/styles.css` is API consumed by inline
  styles across `src/`, so warm-sounding names (`--paper`, `--surface-warm`,
  `--brass`, `--amber`…) were kept and given cool values in the same role.
  **Never rename or delete a token — retune the value.**
- Custom theme accents live in `src/lib/accents.js`. Each option carries an
  explicit `light` AND `dark` set (`base`/`fill`/`fillHover`/`strong`/`soft`),
  because an inline override on `<html>` beats both stylesheet blocks; `App.jsx`
  applies the set for the active theme and re-applies on toggle. The first
  option is **"ตามธีม"** — it applies by *clearing* the overrides, so it follows
  whichever block is active (blue in light, gold in dark). The harness asserts
  the whole 6 × 2 matrix, so adding an option fails until its numbers are real.
- The `[data-theme="dark"]` espresso block is still the old warm build, but it
  is **live and persisted** — `App.jsx` stores the choice at localStorage
  `'loop:theme'` and sets `data-theme` on `<html>`, with a moon toggle in the
  Sidebar and MobileNav. Only the VISUAL retune (espresso → graphite) is
  phase 5. **Any token you add to `:root` needs a dark value too** — assuming
  dark was unexposed is exactly how `--accent-fill` shipped broken in v4.53
  (light blue on dark's `--text-inverse` at 3.62:1). Typography /
  uppercase-mono label cleanup shipped as phase 2 (v4.56).
- **UI-chrome icons are `<Icon name>` from `src/components/Icon.jsx`**, not
  emoji (v4.56). Emoji stay ONLY where they are data the user owns or picks:
  mood entries, custom-category icons, Life Calendar milestones, note
  templates, and the changelog's own history.
- Fonts: the native system stack (`--f-display` / `--f-body` / `--f-mono`), no webfont.
- **Inline styles using CSS variables**. Avoid creating new utility classes — extend `src/styles.css` only when a pattern repeats 3+ times.
- **Small labels are sentence case** (phase 2, v4.56): `fontSize: 13, fontWeight: 500,
  color: 'var(--text-muted)'` — never `textTransform: 'uppercase'`, never positive
  `letterSpacing`, never `--f-mono` on text that is not digits. `--f-mono` and
  `fontVariantNumeric: 'tabular-nums'` are for amounts, dates-as-digits and
  counters only; prefer the latter. Section headings are 20px / 700 / -0.02em.
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

**NOTHING IS PENDING.** `migration_add_credit_cards.sql` (v4.36),
`migration_add_credit_cards_face.sql` (v4.41) and
`migration_add_credit_cards_shared_limit.sql` (v4.43) were applied on
2026-08-16 via the Supabase MCP; everything else was confirmed run by the owner
on 2026-08-12 with a `to_regclass`/`to_regprocedure` check returning true for
every one. Each file is idempotent, so re-running is harmless.

| Status | Migration | What it added |
|---|---|---|
| ✅ run | `migration_add_credit_cards_shared_limit.sql` | `credit_cards.shared_limit_card_id` — a self-reference marking a card that spends ANOTHER card's credit line (v4.43). The two KTC cards are one 150,000฿ line: the Mastercard owns it, the Visa points at it and carries `credit_limit = NULL`. Applied 2026-08-16 via the Supabase MCP together with those two row updates (recorded in `seed_credit_cards.sql` §5) |
| ✅ run | `migration_add_credit_cards_face.sql` | `credit_cards.face_url` — the real card-face image shown in the **บัตรเครดิต** tab (v4.41). Applied 2026-08-16 via the Supabase MCP, together with the three seeded rows pointing at `public/cards/*.png`. Empty/unsafe value → the card keeps its coloured monogram |
| ✅ run | `seed_credit_cards.sql` | Not a migration — an idempotent record of the 3 real cards + 2 linked KTC debts + their `face_url` values + the shared KTC credit line (§5: MC `credit_limit = 150000`, Visa `shared_limit_card_id` → MC), applied 2026-08-16 via the Supabase MCP in the same session (v4.42 → v4.43). Kept for reproducibility only |
| ✅ run | `migration_add_credit_cards.sql` | `credit_cards` + owner-only RLS + `updated_at` trigger — powers the **บัตรเครดิต** tab (v4.36). Applied 2026-08-16. The page still degrades to a calm "ยังไม่ได้ติดตั้งตาราง" notice if the table ever goes missing |
| ✅ run | `migration_add_tax_planner.sql` | `tax_profiles` + unique index + owner-only RLS — powers the **วางแผนภาษี** page (v4.28) |
| ✅ run | `migration_add_account_source_key.sql` | `accounts.source_key` + partial unique index + `accounts_upsert_by_source_key()` |
| ✅ run | `migration_add_account_reassign_rpc.sql` | `reassign_and_archive_account()` — move a ledger and archive in one transaction |
| ✅ run | `migration_add_transfer_group.sql` | `transactions.transfer_group_id` + index + legacy pair backfill |
| ✅ run | `migration_add_debt_terms_rpc.sql` | `debt_update_terms()` — term edits recompute `remaining_balance` under a row lock |
| ✅ run | `migration_add_import_rpc.sql` | `import_receipts` + `import_transactions()` v8 (receipts-first recovery, two-tier identity, 90-day purge) |
| ✅ run | `migration_add_month_summary_rpc.sql` | `finance_month_summary()` — server-side monthly aggregate |
| ✅ run | `migration_add_debt_rpc.sql` | `debt_mark_paid()` / `debt_unmark_paid()` — single lock order, no deadlock |
| ✅ run | `migration_add_account_archive.sql` | `balance_anchor_at` + `balance_anchor_source` + `touch_account_anchor` trigger |
| ✅ run | `migration_reconcile_anchor_v416.sql` | one-shot materialising anchor reconciliation |
| ✅ run | `migration_fix_budget_scope_key.sql` | budgets unique key now includes `scope` |

Everything below was run earlier (user confirmed 2026-08-01).

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
