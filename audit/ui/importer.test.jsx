// Mounted-component tests for CSVImporter orchestration (audit round 6, B5).
// The supabase client is the same mock PostgREST as audit/evidence.mjs
// (aliased in vitest.config.mjs); the import RPC is simulated at v6 semantics
// (receipts + ord→id mapping) ON TOP of the mock tables, with scriptable
// per-call failures — so retry/idempotency behaviour is exercised end to end
// through the real mounted component.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

import { CSVImporter } from '../../src/components/CSVImporter.jsx';
import { classifyImportRows } from '../../src/lib/api/finance.js';
import { __tables, __config } from '../mock-supabase.mjs';

let seq = 0;
const rpcCalls = [];

/** Simulated import_transactions v6 over the mock tables (receipts incl.). */
function installV6({ failPredicate } = {}) {
  let call = 0;
  __config.rpcHandlers.import_transactions = (args) => {
    call++;
    rpcCalls.push({ call, key: args.p_import_key, month: args.p_month, scope: args.p_scope, n: (args.p_rows || []).length });
    if (failPredicate?.(call, args)) {
      return { data: null, error: { code: '500', message: 'simulated network failure' } };
    }
    const uid = 'user-1';
    const key = args.p_import_key;
    const receipts = __tables.import_receipts.filter(r => r.user_id === uid && r.import_key === key);
    const receipted = new Set(receipts.map(r => r.ord));
    const insertedOut = receipts.map(r => ({ ord: r.ord, transaction_id: r.transaction_id }));

    const batch = (args.p_rows || [])
      .filter(r => !receipted.has(r.ord))
      .map(r => ({ ...r, _rid: r.ord, _synthetic: r.synthetic, _force: r.force }));
    const existing = __tables.transactions.filter(t => t.scope === args.p_scope);
    const cls = classifyImportRows(batch, existing);

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
    return {
      data: {
        v: 6,
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

async function uploadCsv(container, csvText) {
  const input = container.querySelector('input[type="file"]');
  const file = new File([csvText], 'report.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText(/ตัวเลือก IMPORT/);
}

function importButton() {
  return screen.getByRole('button', { name: /Import \d+ รายการ/ });
}

beforeEach(() => {
  cleanup();
  for (const k of Object.keys(__tables)) __tables[k] = [];
  __config.rpcHandlers = {};
  __config.missingColumns = {};
  rpcCalls.length = 0;
  seq = 0;
  vi.stubGlobal('alert', vi.fn());
});

describe('CSVImporter orchestration (round 6)', () => {

  it('(i) multi-group partial failure → retry inserts only uncommitted rows, same import_key, no duplicates', async () => {
    installV6({ failPredicate: (call) => call === 2 });   // group 2 fails once
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/07/2026,ค่าโน้ตบุ๊ก,-100\n' +
      '06/07/2026,ค่าเน็ต,-200\n' +
      '05/08/2026,ค่าหนังสือ,-300\n');

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);          // partial failure surfaced
    expect(__tables.transactions).toHaveLength(2);        // group 1 committed
    expect(__tables.import_receipts).toHaveLength(2);

    fireEvent.click(importButton());                      // RETRY
    await screen.findByText(/Import สำเร็จ!/);

    expect(__tables.transactions).toHaveLength(3);        // no duplicates
    expect(new Set(__tables.transactions.map(t => t.title)).size).toBe(3);
    expect(__tables.import_receipts).toHaveLength(3);     // receipts complete
    const keys = new Set(rpcCalls.map(c => c.key));
    expect(keys.size).toBe(1);                            // ONE key, all calls
    expect([...keys][0]).toBeTruthy();
    // Retry sent only the uncommitted group (1 row), not the committed two.
    expect(rpcCalls[rpcCalls.length - 1].n).toBe(1);
  });

  it('(ii) deselected pocket rows cause NO account mutation; balances land only after success', async () => {
    installV6();
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Time,Cloud Pocket,Type,Txn,CP Bal,Category,Memo,Note\n' +
      '05/08/2026,09:15,Cashbox,Payment,-65,1000,ชา กาแฟ,,ร้านกาแฟ\n' +
      '05/08/2026,10:00,กองทุนครอบครัว,Payment,-500,2000,อื่นๆ,,ของบ้าน\n');

    // Deselect every FAMILY row via the scope chip.
    const familyChip = screen.getAllByRole('button')
      .find(b => b.textContent.replace(/\s/g, '') === 'ครอบครัว1/1');
    expect(familyChip).toBeTruthy();
    fireEvent.click(familyChip);

    fireEvent.click(importButton());
    await screen.findByText(/Import สำเร็จ!/);

    // Only the selected pocket produced an account — and its balance was
    // applied in the post-success pass with import provenance.
    expect(__tables.accounts.map(a => a.name)).toEqual(['Cashbox']);
    const cashbox = __tables.accounts[0];
    expect(cashbox.balance).toBe(1000);
    expect(cashbox.balance_anchor_source).toBe('import');
    expect(__tables.transactions).toHaveLength(1);        // family row not imported
  });

  it('(iii) debt links only for accepted+inserted rows, with the exact inserted transaction_id', async () => {
    installV6();
    __tables.debts.push(
      { id: 'dd2', user_id: 'user-1', name: 'KTC บัตรเครดิต', creditor: 'KTC Krungthai', monthly_payment: 5200, months_paid: 0, total_months: 12, scope: 'personal', is_active: true },
      { id: 'dd3', user_id: 'user-1', name: 'Home Loan', creditor: '', monthly_payment: 9999, months_paid: 0, total_months: 120, scope: 'personal', is_active: true },
    );
    const { container } = render(
      <CSVImporter scope="personal" debts={__tables.debts} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/08/2026,KTC Krung ชำระบัตร,-5200\n' +      // creditor evidence ≥80 → auto-checked
      '06/08/2026,Home Loan งวดบ้าน,-9999\n');        // name-only 60–79 → default UNchecked

    await screen.findByText(/AUTO-LINK/);              // suggestions computed
    fireEvent.click(importButton());
    await screen.findByText(/Import สำเร็จ!/);

    expect(__tables.debt_payments).toHaveLength(1);    // unchecked one NOT linked
    const link = __tables.debt_payments[0];
    expect(link.debt_id).toBe('dd2');
    const ktcTxn = __tables.transactions.find(t => t.title.includes('KTC'));
    expect(link.transaction_id).toBe(ktcTxn.id);       // EXACT inserted id, no re-query
  });

  it('(iv) resolve step blocks closing until the pending ambiguity is decided', async () => {
    installV6();
    const onClose = vi.fn();
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={onClose} />);
    await uploadCsv(container,
      'Date,Description,Amount\n05/08/2026,กาแฟ,-65\n');

    // Concurrent write AFTER the preview classification: a :00 twin lands in
    // the ledger, so only the authoritative execution run can see it.
    await waitFor(() => {});   // let the preview classification effect settle
    __tables.transactions.push({
      id: 'tx-prior', user_id: 'user-1', scope: 'personal',
      title: 'กาแฟ', amount: -65, note: null, type: 'food', category: 'อาหาร',
      occurred_at: new Date('2026-08-05T12:00:00+07:00').toISOString(),
    });

    fireEvent.click(importButton());
    await screen.findByText(/พบรายการกำกวมตอนบันทึกจริง/);   // decision step reopened

    // × is disabled and the backdrop is inert while the decision is pending.
    const closeX = screen.getByRole('button', { name: 'ปิด' });
    expect(closeX.disabled).toBe(true);
    fireEvent.click(closeX);
    const backdrop = [...container.querySelectorAll('div')]
      .find(d => (d.getAttribute('style') || '').includes('--dim'));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/พบรายการกำกวมตอนบันทึกจริง/)).toBeTruthy();

    // Decide (default skip) → import completes → closing works again.
    fireEvent.click(screen.getByRole('button', { name: /ยืนยัน/ }));
    await screen.findByText(/Import สำเร็จ!/);
    fireEvent.click(screen.getByRole('button', { name: /ปิดและดูรายการ/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
