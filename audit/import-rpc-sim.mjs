// Simulated import_transactions v8 over the mock PostgREST tables.
// Lives beside (not inside) mock-supabase.mjs because it reuses the REAL
// classifier from src — importing that from the mock itself would create a
// supabase.js → finance.js → supabase.js alias cycle. Semantics match the
// SQL v8 function 1:1:
//   1. receipts for (key, THIS call's ords) load FIRST, before any write;
//   2. the SETTLED outcomes (inserted / dup / ambiguous, with the persisted
//      {incoming, existing} detail) are reconstructed from them — a lost
//      response replays COMPLETELY, ambiguities included;
//   3. a receipt whose outcome is 'ambiguous' is REOPENED when the incoming
//      row now carries force=true (the user answered) and is processed;
//   4. any receipt at all ⇒ the group committed ⇒ p_wipe is forced OFF for
//      the rest of the call, and only unreceipted/reopened ords are
//      processed, then merged into the reconstruction;
//   5. every processed ord gets a receipt (upsert), in the same "transaction".
//   p_probe = read-only reconstruction: never wipes, processes or writes.
//   Round-9 F2: a non-probe call first purges the caller's OWN receipts older
//   than RETENTION_DAYS (90), excluding this call's key.
// Failure scripting:
//   failPredicate(call, args)           → fail BEFORE any state mutation
//   postCommitFailPredicate(call, args) → mutate state fully, then return a
//                                         network error (lost response)
import { classifyImportRows, bangkokMonth } from '../src/lib/api/finance.js';
import { __tables, __config } from './mock-supabase.mjs';

let seq = 0;
export const simCalls = [];
export const RETENTION_MS = 90 * 24 * 3600 * 1000;

export function resetSim() { seq = 0; simCalls.length = 0; }

export function installImportRpcV8({ failPredicate, postCommitFailPredicate } = {}) {
  let call = 0;
  __config.rpcHandlers.import_transactions = (args) => {
    call++;
    const probe = !!args.p_probe;
    simCalls.push({ call, key: args.p_import_key, month: args.p_month, scope: args.p_scope,
      wipe: !!args.p_wipe, probe, n: (args.p_rows || []).length });
    if (failPredicate?.(call, args)) {
      return { data: null, error: { code: '500', message: 'simulated network failure' } };
    }

    const uid = 'user-1';
    const key = args.p_import_key;
    const payload = args.p_rows || [];
    const forceByOrd = new Map(payload.map(r => [r.ord, !!r.force]));

    // ── STEP 1+2 — receipts FIRST, then reconstruct the settled outcomes ──
    const mine = key
      ? __tables.import_receipts.filter(r =>
          r.user_id === uid && r.import_key === key && forceByOrd.has(r.ord))
      : [];
    const isReopen = (r) => r.outcome === 'ambiguous' && forceByOrd.get(r.ord) === true;
    const settled  = mine.filter(r => !isReopen(r));
    const seen     = mine.length > 0;

    const insertedOut = settled
      .filter(r => r.outcome === 'inserted')
      .sort((a, b) => a.ord - b.ord)
      .map(r => ({ ord: r.ord, transaction_id: r.transaction_id }));
    let dupOut = settled.filter(r => r.outcome === 'dup').length;
    const ambOut = settled
      .filter(r => r.outcome === 'ambiguous')
      .sort((a, b) => a.ord - b.ord)
      .map(r => ({ ord: r.ord, incoming: r.detail?.incoming ?? null, existing: r.detail?.existing ?? null }));

    if (probe) {
      return { data: { v: 8, recovered: true, inserted: insertedOut,
        dup_skipped: dupOut, ambiguous: ambOut }, error: null };
    }

    // ── RETENTION (round-9 F2) — own rows, age-based, never this key ──────
    const cutoff = Date.now() - RETENTION_MS;
    __tables.import_receipts = __tables.import_receipts.filter(r =>
      !(r.user_id === uid
        && r.created_at != null && Date.parse(r.created_at) < cutoff
        && (key == null || r.import_key !== key)));

    // ── STEP 3+4 — a receipt proves the month was already wiped once ──────
    const wipeEff = !!args.p_wipe && !seen;
    if (wipeEff) {
      __tables.transactions = __tables.transactions.filter(t =>
        !(t.scope === args.p_scope && bangkokMonth(t.occurred_at) === args.p_month));
    }

    // ── STEP 5 — process unsettled ords only, receipt every one of them ───
    const receiptOf = (ord) => (key
      ? __tables.import_receipts.find(r => r.user_id === uid && r.import_key === key && r.ord === ord)
      : null);
    const putReceipt = (ord, outcome, transaction_id, detail) => {
      if (!key) return;
      const ex = receiptOf(ord);
      if (ex) { ex.outcome = outcome; ex.transaction_id = transaction_id; ex.detail = detail; }
      else __tables.import_receipts.push({
        user_id: uid, import_key: key, ord, transaction_id, outcome, detail,
        created_at: new Date().toISOString(),   // retention clock (round-9 F2)
      });
    };

    const toProcess = payload.filter(r => {
      const rc = receiptOf(r.ord);
      return !rc || (rc.outcome === 'ambiguous' && !!r.force);
    });

    const batch = toProcess.map(r => ({ ...r, _rid: r.ord, _synthetic: r.synthetic, _force: r.force }));
    const existing = wipeEff ? [] : __tables.transactions.filter(t => t.scope === args.p_scope);
    const cls = args.p_dedup && !wipeEff
      ? classifyImportRows(batch, existing)
      : { toImport: batch, duplicates: [], ambiguous: [] };

    for (const r of cls.toImport) {
      const id = 'tx-' + (++seq);
      __tables.transactions.push({
        id, user_id: uid, scope: args.p_scope,
        title: r.title, amount: r.amount, note: r.note ?? null,
        category: r.category, type: r.type,
        occurred_at: r.occurred_at, account_id: r.account_id ?? null,
      });
      putReceipt(r._rid, 'inserted', id, null);
      insertedOut.push({ ord: r._rid, transaction_id: id });
    }
    for (const r of cls.duplicates) {
      putReceipt(r._rid, 'dup', null, null);
      dupOut++;
    }
    for (const a of cls.ambiguous) {
      const detail = {
        incoming: { occurred_at: a.row.occurred_at, title: a.row.title, amount: a.row.amount, note: a.row.note ?? null },
        existing: { occurred_at: a.existing.occurred_at, title: a.existing.title, amount: a.existing.amount, note: a.existing.note ?? null },
      };
      putReceipt(a.row._rid, 'ambiguous', null, detail);
      ambOut.push({ ord: a.row._rid, incoming: detail.incoming, existing: detail.existing });
    }

    if (postCommitFailPredicate?.(call, args)) {
      // State fully mutated (rows + receipts committed) — response lost.
      return { data: null, error: { code: '504', message: 'simulated response loss after commit' } };
    }

    return {
      data: { v: 8, recovered: seen, inserted: insertedOut, dup_skipped: dupOut, ambiguous: ambOut },
      error: null,
    };
  };
}
