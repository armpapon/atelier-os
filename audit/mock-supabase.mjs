// Mock PostgREST/Supabase client that reproduces the production constraints:
//  - max-rows response cap = 1000 (like Supabase's default)
//  - ALL rpc() calls fail with PGRST202 (migrations NOT run yet)
//  - budgets table only has the OLD unique (user_id, category, month)
//  - optional per-table missing columns (simulate an unrun column migration)
// Used (via esbuild alias) in place of src/lib/supabase.js so the evidence
// cases run the REAL finance.js / lifeOS.js code paths.

const MAX_ROWS = 1000;
let idSeq = 1;

export const __tables = {
  transactions:    [],
  debts:           [],
  debt_payments:   [],
  budgets:         [],
  accounts:        [],
  import_receipts: [],
  // The remaining finance tables — needed once a whole PAGE is mounted
  // (audit batch A / B4 renders FinanceView, which loads all of them).
  financial_goals:    [],
  recurring_expenses: [],
  // v4.28 · tax planner. Deleting this key simulates the state the owner's
  // database is actually in until he runs migration_add_tax_planner.sql —
  // PostgREST answers 42P01 and the page must degrade, not crash.
  tax_profiles:       [],
  // v4.36 · บัตรเครดิต. Same trick as tax_profiles: deleting this key is
  // production before migration_add_credit_cards.sql has been run, and the
  // tab must degrade to its setup notice rather than crash.
  credit_cards:       [],
};

export const __config = {
  // e.g. { accounts: ['balance_anchor_at'] } → any read/write touching that
  // column errors with PGRST204, like PostgREST before the migration runs.
  missingColumns: {},
  // { fn_name: (args) => ({ data, error }) } — simulate a DEPLOYED RPC
  // (round 5: used to exercise the v5/v4/v3 return-shape normalisation).
  rpcHandlers: {},
  // Scripted table-op failures (round 7): { 'update:accounts': 2 } fails the
  // next 2 UPDATEs on accounts with a 500, then behaves normally.
  opFailures: {},
  // Batch A / B4: a predicate for when a COUNT is too blunt — several reads
  // hit the same table in one page load and only one of them must fail.
  //   ({ op, table, selectCols }) => boolean
  opFailurePredicate: null,
};

const UNIQUES = {
  budgets:       [['user_id', 'category', 'month']],          // old key only
  debt_payments: [['debt_id', 'pay_month']],
};

export const __stats = { rpcCalls: [], selectRequests: 0 };

function cmp(a, b) {
  const da = Date.parse(a), db = Date.parse(b);
  if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

function columnError(col) {
  return { code: 'PGRST204', message: `Could not find the '${col}' column in the schema cache` };
}

class Query {
  constructor(table) {
    this.table = table;
    this.op = 'select';
    this.rowsIn = null;
    this.patch = null;
    this.filters = [];
    this.selectCols = null;
    this.orderBy = null;
    this._range = null;
    this._limit = null;
    this._single = false;
    this._maybe = false;
    this._onConflict = null;
    this._ignoreDup = false;
  }
  select(cols) {
    if (this.op === 'select') this.selectCols = cols || null;
    return this;
  }
  insert(rows) { this.op = 'insert'; this.rowsIn = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows, opts = {}) {
    this.op = 'upsert';
    this.rowsIn = Array.isArray(rows) ? rows : [rows];
    this._onConflict = opts.onConflict || null;
    this._ignoreDup = !!opts.ignoreDuplicates;
    return this;
  }
  update(patch) { this.op = 'update'; this.patch = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(col, val)  { this.filters.push(r => r[col] === val); return this; }
  neq(col, val) { this.filters.push(r => r[col] !== val); return this; }
  gt(col, val)  { this.filters.push(r => cmp(r[col], val) > 0);  return this; }
  gte(col, val) { this.filters.push(r => cmp(r[col], val) >= 0); return this; }
  lt(col, val)  { this.filters.push(r => cmp(r[col], val) < 0);  return this; }
  lte(col, val) { this.filters.push(r => cmp(r[col], val) <= 0); return this; }
  in(col, vals) { this.filters.push(r => vals.includes(r[col])); return this; }
  order(col, opts = {}) { this.orderBy = { col, asc: opts.ascending !== false }; return this; }
  range(from, to) { this._range = [from, to]; return this; }
  limit(n) { this._limit = n; return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybe = true; return this; }

  _missingCol() {
    const missing = __config.missingColumns[this.table] || [];
    if (!missing.length) return null;
    const touches = (obj) => obj && Object.keys(obj).some(k => missing.includes(k));
    if ((this.op === 'insert' || this.op === 'upsert') && (this.rowsIn || []).some(touches)) {
      return missing.find(c => (this.rowsIn || []).some(r => c in r));
    }
    if (this.op === 'update' && touches(this.patch)) {
      return missing.find(c => c in this.patch);
    }
    if (this.op === 'select' && this.selectCols && this.selectCols !== '*') {
      const asked = this.selectCols.split(',').map(s => s.trim());
      return missing.find(c => asked.includes(c));
    }
    return null;
  }

  _matched() {
    let rows = __tables[this.table] || [];
    for (const f of this.filters) rows = rows.filter(f);
    return rows;
  }

  _exec() {
    const t = __tables[this.table];
    if (!t) return { data: null, error: { message: `relation "${this.table}" does not exist`, code: '42P01' } };

    const badCol = this._missingCol();
    if (badCol) return { data: null, error: columnError(badCol) };

    const opKey = `${this.op}:${this.table}`;
    if ((__config.opFailures[opKey] || 0) > 0) {
      __config.opFailures[opKey]--;
      return { data: null, error: { code: '500', message: `simulated ${opKey} failure` } };
    }
    if (typeof __config.opFailurePredicate === 'function'
        && __config.opFailurePredicate({ op: this.op, table: this.table, selectCols: this.selectCols })) {
      return { data: null, error: { code: '500', message: `simulated ${opKey} failure (predicate)` } };
    }

    if (this.op === 'insert' || this.op === 'upsert') {
      if (this.op === 'upsert') {
        const key = (this._onConflict || '').split(',').map(s => s.trim()).filter(Boolean).sort();
        const known = (UNIQUES[this.table] || []).some(u => u.slice().sort().join(',') === key.join(','));
        if (!known) {
          return { data: null, error: { code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' } };
        }
        const out = [];
        for (const row of this.rowsIn) {
          const cols = (this._onConflict || '').split(',').map(s => s.trim());
          const existing = t.find(r => cols.every(k => r[k] === row[k]));
          if (existing) {
            if (!this._ignoreDup) { Object.assign(existing, row); out.push(existing); }
            // ignoreDuplicates → DO NOTHING: not returned
          } else {
            const nr = { id: 'id-' + (idSeq++), ...row }; t.push(nr); out.push(nr);
          }
        }
        return this._pick(out);
      }
      const out = this.rowsIn.map(r => ({ id: 'id-' + (idSeq++), ...r }));
      t.push(...out);
      return this._pick(out);
    }

    if (this.op === 'update') {
      const rows = this._matched();
      rows.forEach(r => Object.assign(r, this.patch));
      return this._pick(rows);
    }

    if (this.op === 'delete') {
      const rows = this._matched();
      __tables[this.table] = t.filter(r => !rows.includes(r));
      // Round-8: emulate the DB constraint
      //   import_receipts.transaction_id → transactions(id) ON DELETE SET NULL
      // (migration_add_import_rpc.sql v8). Deleting an imported transaction
      // clears the receipt's mapping without deleting the receipt, so the ord
      // still counts as processed and a same-key retry cannot resurrect it.
      if (this.table === 'transactions') {
        const gone = new Set(rows.map(r => r.id));
        for (const r of __tables.import_receipts) {
          if (r.transaction_id != null && gone.has(r.transaction_id)) r.transaction_id = null;
        }
      }
      return this._pick(rows);
    }

    // select
    __stats.selectRequests++;
    let rows = this._matched().slice();
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      rows.sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]));
    }
    if (this._range) {
      const [from, to] = this._range;
      rows = rows.slice(from, to + 1);
    } else if (this._limit != null) {
      rows = rows.slice(0, this._limit);
    }
    if (rows.length > MAX_ROWS) rows = rows.slice(0, MAX_ROWS);   // PostgREST max-rows cap
    return this._pick(rows);
  }

  _pick(rows) {
    if (this._single || this._maybe) {
      if (rows.length === 0) {
        return this._maybe ? { data: null, error: null }
                           : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      }
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null };
  }

  then(resolve, reject) { return Promise.resolve(this._exec()).then(resolve, reject); }
}

export const supabase = {
  from(table) { return new Query(table); },
  rpc(name, args) {
    __stats.rpcCalls.push(name);
    const handler = __config.rpcHandlers[name];
    if (handler) return Promise.resolve(handler(args));
    // Migrations not run → every function is missing.
    return Promise.resolve({
      data: null,
      error: { code: 'PGRST202', message: `Could not find the function public.${name} in the schema cache` },
    });
  },
  auth: {
    async getUser() { return { data: { user: { id: 'user-1' } } }; },
    // Enough of the auth surface for useAuth() to run when a test mounts the
    // whole App shell (sidebar-subnav). No session — those tests drive App in
    // preview mode, where the login gate is bypassed by design.
    async getSession() { return { data: { session: null }, error: null }; },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
  },
};

export const isSupabaseConfigured = true;
