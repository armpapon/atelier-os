// Simulated import_transactions v7 over the mock PostgREST tables.
// Lives beside (not inside) mock-supabase.mjs because it reuses the REAL
// classifier from src — importing that from the mock itself would create a
// supabase.js → finance.js → supabase.js alias cycle. Semantics match the
// SQL v7 function 1:1:
//   1. receipts for (key, THIS call's ords) load FIRST;
//   2. any receipt ⇒ group already committed ⇒ return mappings, NO wipe,
//      NO processing (response-recovery read);
//   3. zero receipts ⇒ wipe-if-requested + classify + insert + receipt.
// Failure scripting:
//   failPredicate(call, args)           → fail BEFORE any state mutation
//   postCommitFailPredicate(call, args) → mutate state fully, then return a
//                                         network error (lost response)
import { classifyImportRows, bangkokMonth } from '../src/lib/api/finance.js';
import { __tables, __config } from './mock-supabase.mjs';

let seq = 0;
export const simCalls = [];

export function resetSim() { seq = 0; simCalls.length = 0; }

export function installImportRpcV7({ failPredicate, postCommitFailPredicate } = {}) {
  let call = 0;
  __config.rpcHandlers.import_transactions = (args) => {
    call++;
    simCalls.push({ call, key: args.p_import_key, month: args.p_month, scope: args.p_scope,
      wipe: !!args.p_wipe, n: (args.p_rows || []).length });
    if (failPredicate?.(call, args)) {
      return { data: null, error: { code: '500', message: 'simulated network failure' } };
    }

    const uid = 'user-1';
    const key = args.p_import_key;
    const payloadOrds = new Set((args.p_rows || []).map(r => r.ord));

    // v7 STEP 1+2 — receipts FIRST, scoped to this call's ords; any hit =
    // committed group → recovery read, no wipe, no processing.
    if (key) {
      const mine = __tables.import_receipts
        .filter(r => r.user_id === uid && r.import_key === key && payloadOrds.has(r.ord));
      if (mine.length) {
        return { data: { v: 7, recovered: true, dup_skipped: 0, ambiguous: [],
          inserted: mine.map(r => ({ ord: r.ord, transaction_id: r.transaction_id })) }, error: null };
      }
    }

    // v7 STEP 3 — wipe-if-requested, then classify + insert + receipt.
    if (args.p_wipe) {
      __tables.transactions = __tables.transactions.filter(t =>
        !(t.scope === args.p_scope && bangkokMonth(t.occurred_at) === args.p_month));
    }

    const batch = (args.p_rows || [])
      .map(r => ({ ...r, _rid: r.ord, _synthetic: r.synthetic, _force: r.force }));
    const existing = args.p_wipe ? [] : __tables.transactions.filter(t => t.scope === args.p_scope);
    const cls = args.p_dedup && !args.p_wipe
      ? classifyImportRows(batch, existing)
      : { toImport: batch, duplicates: [], ambiguous: [] };

    const insertedOut = [];
    for (const r of cls.toImport) {
      const id = 'tx-' + (++seq);
      __tables.transactions.push({
        id, user_id: uid, scope: args.p_scope,
        title: r.title, amount: r.amount, note: r.note ?? null,
        category: r.category, type: r.type,
        occurred_at: r.occurred_at, account_id: r.account_id ?? null,
      });
      if (key) __tables.import_receipts.push({ user_id: uid, import_key: key, ord: r._rid, transaction_id: id });
      insertedOut.push({ ord: r._rid, transaction_id: id });
    }

    if (postCommitFailPredicate?.(call, args)) {
      // State fully mutated (rows + receipts committed) — response lost.
      return { data: null, error: { code: '504', message: 'simulated response loss after commit' } };
    }

    return {
      data: {
        v: 7, recovered: false,
        inserted: insertedOut,
        dup_skipped: cls.duplicates.length,
        ambiguous: cls.ambiguous.map(a => ({
          ord: a.row._rid,
          incoming: { occurred_at: a.row.occurred_at, title: a.row.title, amount: a.row.amount, note: a.row.note ?? null },
          existing: { occurred_at: a.existing.occurred_at, title: a.existing.title, amount: a.existing.amount, note: a.existing.note ?? null },
        })),
      },
      error: null,
    };
  };
}
