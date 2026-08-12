# Audit evidence harness

Executable acceptance evidence for the independent finance audit
(rounds 1–11 + the closing follow-up, plus Codex's clean-slate batch A —
v4.14 – v4.26).

## Run it

```bash
npm install          # once — needs the repo's own devDependencies
node audit/evidence.mjs   # pure-logic evidence (384 checks)
npm run test:ui           # MOUNTED component tests (59)
```

`npm run test:ui` covers four files:
`audit/ui/importer.test.jsx` (41 — CSVImporter orchestration, rounds 6–11 +
batch A B6/B7/B11), `audit/ui/finance-batch-c.test.jsx` (9),
`audit/ui/balances.test.jsx` (3 — the real `FinanceView` page, batch A B4) and
`audit/ui/tax-planner.test.jsx` (6 — the real `TaxPlanner` page, v4.28).

## Tax planner (v4.28) — `cases.mjs` § D

`src/lib/taxTH.js` is pure and dependency-free, so § D1–D12 call it directly:
every bracket boundary (and one baht past each), the ฿100,000 expense cap,
each deduction cap both where the absolute limit binds and where the
percentage one does, the shared ฿100,000 life+health and ฿500,000 retirement
ceilings, the 2× education donation under the 10% rule, payable vs refund,
and the headroom/marginal-rate advice — including the case where the room
crosses a bracket and the honest saving is *less* than `room × marginal rate`.

§ D13–D14 drive `src/lib/api/tax.js` against the mock: D13 **deletes**
`__tables.tax_profiles` to reproduce the database as it is before the owner
runs `migration_add_tax_planner.sql` (reads return a `missingTable` flag,
writes throw a Thai "go run the SQL" message), and D14 exercises the real
save / copy-previous-year / delete paths, including a failed save surfacing
rather than being swallowed.

## Batch A (v4.26) — Codex clean-slate review

| # | Claim | Where the evidence lives |
|---|---|---|
| B1 | same-month balance rewind | `cases.mjs` § `A · B1` — instant compare + `user` > `import` tie-break |
| B4 | effective-balance failure shown as truth | `cases.mjs` § `A · B4` + `ui/balances.test.jsx` |
| B6 | debt auto-link crosses scope | `cases.mjs` § `A · B6` + `ui/importer.test.jsx` (B6, B6b) |
| B7 | history-load failure read as "no payments" | `ui/importer.test.jsx` (B7, B7b, B7c) |
| B10 | "Bangkok today" follows the device TZ | `cases.mjs` § `A · B10` — `withFrozenNow`, identical under all three TZs |
| B11 | missing/unparseable CSV dates become now() | `cases.mjs` § `A · B11` + `ui/importer.test.jsx` (B11, B11b) |

Batch A also extended the rig: the vitest supabase alias now covers `src/pages`
(so a whole page can mount), the mock gained `financial_goals` /
`recurring_expenses` and `__config.opFailurePredicate` (fail ONE read of a
table while the rest of the page loads), and `parseCSV` reports `rowLines`.

`npm run test:ui` renders the real `CSVImporter` under jsdom (vitest +
Testing Library, config in `audit/ui/vitest.config.mjs`) against the same
mock PostgREST, with the import RPC simulated at **v8** semantics
(`audit/import-rpc-sim.mjs`: per-ord outcome receipts, complete response
reconstruction, reopen-on-force, wipe-forced-off after a receipt, and the
read-only `p_probe`) plus scriptable pre-execution failures and post-commit
response loss — covering retry idempotency, selection-driven account side
effects, exact-id debt links, the modal close guards and the round-8
recovery paths, none of which pure-logic tests can reach.

The mock also emulates the v8 foreign key
`import_receipts.transaction_id → transactions(id) ON DELETE SET NULL`, so
the "delete an imported transaction" acceptance case runs for real, and the
round-9 receipt retention purge (own rows, `created_at` older than 90 days,
never this call's key).

The closing follow-up (Z1–Z2) pins the quota boundary. Z1 calibrates against a
successful run to learn how large the FINAL record is, then sets the quota one
byte under it: the pre-flight must refuse before a single account shell is
created, which it can only do if it measured account ids at their real width.
Z2 shows the placeholder never escapes — it is replaced as soon as the shells
exist, and a record still holding it reads back as `account_id: null`.

Round-11 cases (Y1–Y3) cover the tab's GRIP on the record: ownership released
in one place and only when the owned session cannot still be needed (Y1 walks
the auditor's six-step repro; Y1b proves a session the server may hold
receipts for survives the release as an un-adopted pending record), a
pre-flight that writes the real record before any side effect rather than
probing with a token byte (Y2), and an abort message that names what already
committed instead of claiming a clean slate (Y3).

Round-10 cases (X1–X5b) cover the recovery record itself: two importers are
mounted at once (two tabs sharing one `localStorage`) and a `storage` event is
dispatched by hand, exactly as a browser notifies another document. They prove
one namespaced slot per session key with no cross-tab clobbering, the picker
that appears when several records are pending, a resumed run that repeats the
persisted per-group `wipe`/`dedup` instead of re-deriving defaults, an import
that refuses to start when `localStorage.setItem` throws, and the staleness
rule measured from an immutable `startedAt`. Each of the seven fails against
v4.22's component and passes against v4.23's.

Round-9 cases (R1–R7) drive the cross-reload path end to end by unmounting the
component while keeping `localStorage` and the server tables — a real page
reload. They cover: a probe that resolves ZERO outcomes (no finalisation, no
success screen), a PARTIAL probe (stays pending, resume finishes it), a
multi-group reload (all mappings restored, balances + debt links applied,
force-imported ambiguities keep category/type/account), the new-file block
while a stored session exists, a NULL receipt mapping excluded from the
account pass and the debt links, and the corrupt / unversioned stored-record
handling.

Exit code `0` = every check passed. Run under different timezones to verify
device-TZ independence:

```bash
TZ=Asia/Bangkok     node audit/evidence.mjs
TZ=America/New_York node audit/evidence.mjs
TZ=UTC              node audit/evidence.mjs
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
