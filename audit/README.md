# Audit evidence harness

Executable acceptance evidence for the independent finance audit
(rounds 1 + 2, closed in v4.14 / v4.15).

## Run it

```bash
npm install          # once — needs the repo's own devDependencies (esbuild via vite)
node audit/evidence.mjs
```

Exit code `0` = every check passed. Run under different timezones to verify
device-TZ independence:

```bash
TZ=Asia/Bangkok    node audit/evidence.mjs
TZ=America/New_York node audit/evidence.mjs
```

## What it does

- `evidence.mjs` uses the repo's esbuild to bundle `cases.mjs` **against the
  real shipped modules** — `src/lib/api/finance.js`, `src/lib/api/lifeOS.js`,
  `src/lib/dates.js`. Nothing is copied or reimplemented except where a case
  explicitly says it replicates inline JSX handler logic (with file:line
  references in the audit report).
- The ONLY substitution is `src/lib/supabase.js` → `mock-supabase.mjs`,
  a mock PostgREST that reproduces the production failure modes under test:
  - response cap of **1000 rows** (Supabase's default `max-rows`),
  - **every `rpc()` fails with PGRST202** — i.e. the SQL migrations are NOT
    run, so every fallback path is what actually executes,
  - `budgets` has only the OLD unique key (pre-scope), so the 42P10
    fallback + cross-scope guard is exercised,
  - configurable missing columns (`balance_anchor_at`) to prove the
    column-migration fallbacks.
- The MULTISET import dedup cases additionally assert that the client plan
  (`multisetDedupRows`) is identical to the SQL formula used by
  `supabase/migration_add_import_rpc.sql` (`rn > existing_count`) on the same
  inputs.

UI-only items (transfer cells rendered read-only, the Thai wipe-refusal
notice in the importer) cannot execute in Node; the audit report covers them
with file:line references and a live-browser check description.
