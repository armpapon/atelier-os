// Mounted-component tests for CSVImporter orchestration (audit rounds 6–7).
// The supabase client is the same mock PostgREST as audit/evidence.mjs
// (aliased in vitest.config.mjs); the import RPC is simulated at v8
// semantics (receipts-FIRST for EVERY outcome + complete reconstruction +
// wipe-forced-off + ord→id mapping + p_probe) by audit/import-rpc-sim.mjs,
// with scriptable pre-execution failures AND post-commit response loss.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

import { CSVImporter } from '../../src/components/CSVImporter.jsx';
import { __tables, __config, supabase } from '../mock-supabase.mjs';
import { installImportRpcV8, simCalls, resetSim } from '../import-rpc-sim.mjs';

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
  __config.opFailures = {};
  resetSim();
  window.localStorage.clear();
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});

describe('CSVImporter orchestration (round 6)', () => {

  it('(i) multi-group partial failure → retry inserts only uncommitted rows, same import_key, no duplicates', async () => {
    installImportRpcV8({ failPredicate: (call) => call === 2 });   // group 2 fails once
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
    const keys = new Set(simCalls.map(c => c.key));
    expect(keys.size).toBe(1);                            // ONE key, all calls
    expect([...keys][0]).toBeTruthy();
  });

  it('(ii) deselected pocket rows cause NO account mutation; balances land only after success', async () => {
    installImportRpcV8();
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Time,Cloud Pocket,Type,Txn,CP Bal,Category,Memo,Note\n' +
      '05/08/2026,09:15,Cashbox,Payment,-65,1000,ชา กาแฟ,,ร้านกาแฟ\n' +
      '05/08/2026,10:00,กองทุนครอบครัว,Payment,-500,2000,อื่นๆ,,ของบ้าน\n');

    const familyChip = screen.getAllByRole('button')
      .find(b => b.textContent.replace(/\s/g, '') === 'ครอบครัว1/1');
    expect(familyChip).toBeTruthy();
    fireEvent.click(familyChip);

    fireEvent.click(importButton());
    await screen.findByText(/Import สำเร็จ!/);

    expect(__tables.accounts.map(a => a.name)).toEqual(['Cashbox']);
    const cashbox = __tables.accounts[0];
    expect(cashbox.balance).toBe(1000);
    expect(cashbox.balance_anchor_source).toBe('import');
    expect(__tables.transactions).toHaveLength(1);
  });

  it('(iii) debt links only for accepted+inserted rows, with the exact inserted transaction_id', async () => {
    installImportRpcV8();
    __tables.debts.push(
      { id: 'dd2', user_id: 'user-1', name: 'KTC บัตรเครดิต', creditor: 'KTC Krungthai', monthly_payment: 5200, months_paid: 0, total_months: 12, scope: 'personal', is_active: true },
      { id: 'dd3', user_id: 'user-1', name: 'Home Loan', creditor: '', monthly_payment: 9999, months_paid: 0, total_months: 120, scope: 'personal', is_active: true },
    );
    const { container } = render(
      <CSVImporter scope="personal" debts={__tables.debts} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/08/2026,KTC Krung ชำระบัตร,-5200\n' +
      '06/08/2026,Home Loan งวดบ้าน,-9999\n');

    await screen.findByText(/AUTO-LINK/);
    fireEvent.click(importButton());
    await screen.findByText(/Import สำเร็จ!/);

    expect(__tables.debt_payments).toHaveLength(1);
    const link = __tables.debt_payments[0];
    expect(link.debt_id).toBe('dd2');
    const ktcTxn = __tables.transactions.find(t => t.title.includes('KTC'));
    expect(link.transaction_id).toBe(ktcTxn.id);
  });

  it('(iv) resolve step blocks closing until the pending ambiguity is decided', async () => {
    installImportRpcV8();
    const onClose = vi.fn();
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={onClose} />);
    await uploadCsv(container,
      'Date,Description,Amount\n05/08/2026,กาแฟ,-65\n');

    await waitFor(() => {});
    __tables.transactions.push({
      id: 'tx-prior', user_id: 'user-1', scope: 'personal',
      title: 'กาแฟ', amount: -65, note: null, type: 'food', category: 'อาหาร',
      occurred_at: new Date('2026-08-05T12:00:00+07:00').toISOString(),
    });

    fireEvent.click(importButton());
    await screen.findByText(/พบรายการกำกวมตอนบันทึกจริง/);

    const closeX = screen.getByRole('button', { name: 'ปิด' });
    expect(closeX.disabled).toBe(true);
    fireEvent.click(closeX);
    const backdrop = [...container.querySelectorAll('div')]
      .find(d => (d.getAttribute('style') || '').includes('--dim'));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/พบรายการกำกวมตอนบันทึกจริง/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /ยืนยัน/ }));
    await screen.findByText(/Import สำเร็จ!/);
    fireEvent.click(screen.getByRole('button', { name: /ปิดและดูรายการ/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('CSVImporter orchestration (round 7)', () => {

  it('(1) wipe + post-commit response loss → retry same key → month intact, mappings recovered, NO re-wipe', async () => {
    installImportRpcV8({ postCommitFailPredicate: (call) => call === 1 });   // commit, then lose the response
    // Old data in the month that the wipe should clear exactly once.
    __tables.transactions.push({
      id: 'old-1', user_id: 'user-1', scope: 'personal',
      title: 'ของเก่าในเดือน', amount: -999, note: null, type: 'food', category: 'อาหาร',
      occurred_at: new Date('2026-08-01T12:00:00+07:00').toISOString(),
    });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/08/2026,กาแฟ,-65\n' +
      '06/08/2026,ข้าวเที่ยง,-120\n');

    const wipeBox = screen.getAllByRole('checkbox')
      .find(c => c.closest('label')?.textContent.includes('ลบรายการเดิมในเดือนนั้น'));
    expect(wipeBox).toBeTruthy();
    fireEvent.click(wipeBox);

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);            // response lost AFTER commit
    // Server state: wiped once + inserted + receipted.
    expect(__tables.transactions.map(t => t.title).sort()).toEqual(['กาแฟ', 'ข้าวเที่ยง'].sort());
    expect(__tables.import_receipts).toHaveLength(2);

    fireEvent.click(importButton());                        // RETRY, same key
    await screen.findByText(/Import สำเร็จ!/);

    // Month intact: the originally inserted rows SURVIVE (v6 would have
    // re-wiped them and left the month empty), mappings recovered, no dupes.
    expect(__tables.transactions.map(t => t.title).sort()).toEqual(['กาแฟ', 'ข้าวเที่ยง'].sort());
    expect(__tables.transactions.find(t => t.title === 'ของเก่าในเดือน')).toBeUndefined();
    expect(__tables.import_receipts).toHaveLength(2);
    expect(simCalls.filter(c => c.wipe).length).toBe(2);    // asked twice…
    expect(new Set(simCalls.map(c => c.key)).size).toBe(1); // …same key → 2nd was a recovery read
  });

  it('(2) "← กลับ" is blocked while committed work is unfinalized', async () => {
    installImportRpcV8({ failPredicate: (call) => call === 2 });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/07/2026,กาแฟ,-65\n' +
      '05/08/2026,ข้าวเที่ยง,-120\n');

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);            // group 2 failed, group 1 committed

    const back = screen.getByRole('button', { name: /← กลับ/ });
    expect(back.disabled).toBe(true);                       // exit blocked
    fireEvent.click(back);
    expect(screen.getByText(/ตัวเลือก IMPORT/)).toBeTruthy();  // still on preview
    expect(__tables.import_receipts).toHaveLength(1);       // recovery state intact

    fireEvent.click(importButton());                        // resume completes
    await screen.findByText(/Import สำเร็จ!/);
    expect(__tables.transactions).toHaveLength(2);
  });

  it('(3) ×/backdrop stay locked after a partial group failure until resolution', async () => {
    installImportRpcV8({ failPredicate: (call) => call === 2 });
    const onClose = vi.fn();
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={onClose} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/07/2026,กาแฟ,-65\n' +
      '05/08/2026,ข้าวเที่ยง,-120\n');

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);

    const closeX = screen.getByRole('button', { name: 'ปิด' });
    expect(closeX.disabled).toBe(true);
    fireEvent.click(closeX);
    const backdrop = [...container.querySelectorAll('div')]
      .find(d => (d.getAttribute('style') || '').includes('--dim'));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(importButton());                        // resolve by finishing
    await screen.findByText(/Import สำเร็จ!/);
    fireEvent.click(screen.getByRole('button', { name: /ปิดและดูรายการ/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('(4) account-apply failure → done screen warns, retry completes idempotently', async () => {
    installImportRpcV8();
    __config.opFailures['update:accounts'] = 1;             // fail the balance apply once
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Time,Cloud Pocket,Type,Txn,CP Bal,Category,Memo,Note\n' +
      '05/08/2026,09:15,Cashbox,Payment,-65,1000,ชา กาแฟ,,ร้านกาแฟ\n');

    fireEvent.click(importButton());
    await screen.findByText(/ยังอัปเดตยอดบัญชีไม่สำเร็จ 1 บัญชี/);   // shown ON the done screen
    expect(screen.queryByText('Import สำเร็จ!')).toBeNull();       // no false success
    expect(__tables.accounts[0].balance).toBe(0);                  // shell only so far

    fireEvent.click(screen.getByRole('button', { name: /ลองอีกครั้ง/ }));
    await screen.findByText('Import สำเร็จ!');                      // now truly done
    expect(__tables.accounts[0].balance).toBe(1000);
    expect(__tables.accounts[0].balance_anchor_source).toBe('import');
  });

  it('(5) debt-link failure → done screen lists it, retry succeeds with no duplicate payment rows', async () => {
    installImportRpcV8();
    __tables.debts.push({ id: 'dd2', user_id: 'user-1', name: 'KTC บัตรเครดิต', creditor: 'KTC Krungthai',
      monthly_payment: 5200, months_paid: 0, total_months: 12, scope: 'personal', is_active: true });
    __config.opFailures['upsert:debt_payments'] = 1;        // fail the link once
    const { container } = render(
      <CSVImporter scope="personal" debts={__tables.debts} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n05/08/2026,KTC Krung ชำระบัตร,-5200\n');

    await screen.findByText(/AUTO-LINK/);
    fireEvent.click(importButton());
    await screen.findByText(/ผูกงวดหนี้ไม่สำเร็จ 1 รายการ/);
    expect(__tables.debt_payments).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /ลองอีกครั้ง/ }));
    await screen.findByText('Import สำเร็จ!');
    expect(__tables.debt_payments).toHaveLength(1);         // exactly one, no dupes
    expect(__tables.debt_payments[0].transaction_id)
      .toBe(__tables.transactions[0].id);
  });
});

describe('CSVImporter orchestration (round 8)', () => {

  it('(A1) mixed clean+ambiguous + lost response → retry reconstructs BOTH; force-import completes', async () => {
    installImportRpcV8({ postCommitFailPredicate: (call) => call === 1 });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/08/2026,กาแฟ,-65\n' +
      '06/08/2026,ข้าวเที่ยง,-120\n');

    // A concurrent legacy :00 row appears AFTER the preview classified — so
    // the ambiguity can only be discovered at execution time.
    await waitFor(() => {});
    __tables.transactions.push({
      id: 'tx-prior', user_id: 'user-1', scope: 'personal',
      title: 'กาแฟ', amount: -65, note: null, type: 'food', category: 'อาหาร',
      occurred_at: new Date('2026-08-05T12:00:00+07:00').toISOString(),
    });

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);        // committed, response lost

    // Server truth: the clean row inserted, and BOTH ords are receipted —
    // one 'inserted', one 'ambiguous' with its {incoming, existing} snapshot.
    expect(__tables.transactions.map(t => t.title).sort())
      .toEqual(['กาแฟ', 'ข้าวเที่ยง'].sort());          // กาแฟ = the prior row only
    expect(__tables.import_receipts).toHaveLength(2);
    expect(__tables.import_receipts.map(r => r.outcome).sort())
      .toEqual(['ambiguous', 'inserted']);
    expect(__tables.import_receipts.find(r => r.outcome === 'ambiguous').detail.existing.title)
      .toBe('กาแฟ');

    fireEvent.click(importButton());                    // RETRY, same key
    // v7 replayed { inserted, ambiguous: [] } and the ambiguity vanished.
    // v8 must reopen the decision UI for exactly that row.
    await screen.findByText(/พบรายการกำกวมตอนบันทึกจริง · 1 รายการ/);
    expect(__tables.transactions).toHaveLength(2);      // recovery read wrote nothing

    const box = screen.getAllByRole('checkbox')
      .find(c => c.closest('label')?.textContent.includes('ในระบบ'));
    expect(box).toBeTruthy();
    fireEvent.click(box);                               // "นำเข้าเป็นรายการใหม่"
    fireEvent.click(screen.getByRole('button', { name: /ยืนยัน/ }));
    await screen.findByText(/Import สำเร็จ!/);

    // The clean row is mapped (not re-inserted) and the ambiguous row landed.
    expect(__tables.transactions).toHaveLength(3);
    expect(__tables.transactions.filter(t => t.title === 'กาแฟ')).toHaveLength(2);
    expect(__tables.transactions.filter(t => t.title === 'ข้าวเที่ยง')).toHaveLength(1);
    expect(new Set(simCalls.map(c => c.key)).size).toBe(1);
  });

  it('(A2) post-commit response loss with EMPTY committedRef → ×/backdrop/"← กลับ" all blocked by pendingRecovery; the recovery read restores state', async () => {
    installImportRpcV8({ postCommitFailPredicate: (call) => call === 1 });
    const onClose = vi.fn();
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={onClose} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/08/2026,กาแฟ,-65\n' +
      '06/08/2026,ข้าวเที่ยง,-120\n');

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);

    // The rows ARE committed server-side, but the response never arrived, so
    // committedRef learned nothing — the round-7 gate (committed && !done)
    // was false here and every exit unlocked. pendingRecovery is what holds.
    expect(__tables.transactions).toHaveLength(2);
    expect(__tables.import_receipts).toHaveLength(2);
    // Round 9 (M2): the record is now the COMPLETE session — every group plus
    // the row payloads needed to finish the job — not just the group in flight.
    const stored = JSON.parse(window.localStorage.getItem('loop:import-session'));
    expect(stored.v).toBe(2);
    expect(stored.groups).toHaveLength(1);
    expect(stored.groups[0].ords).toHaveLength(2);
    expect(stored.groups[0].month).toBe('2026-08');
    expect(stored.rows).toHaveLength(2);

    const closeX = screen.getByRole('button', { name: 'ปิด' });
    expect(closeX.disabled).toBe(true);
    fireEvent.click(closeX);
    const backdrop = [...container.querySelectorAll('div')]
      .find(d => (d.getAttribute('style') || '').includes('--dim'));
    fireEvent.click(backdrop);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    const back = screen.getByRole('button', { name: /← กลับ/ });
    expect(back.disabled).toBe(true);
    fireEvent.click(back);
    expect(screen.getByText(/ตัวเลือก IMPORT/)).toBeTruthy();   // still on preview

    fireEvent.click(importButton());                    // the recovery read
    await screen.findByText(/Import สำเร็จ!/);
    expect(__tables.transactions).toHaveLength(2);      // no duplicates
    expect(window.localStorage.getItem('loop:import-session')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ปิดและดูรายการ/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('(A3) retrySideEffects success → onImported is called so Finance refreshes', async () => {
    installImportRpcV8();
    const onImported = vi.fn();
    __config.opFailures['update:accounts'] = 1;
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={onImported} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Time,Cloud Pocket,Type,Txn,CP Bal,Category,Memo,Note\n' +
      '05/08/2026,09:15,Cashbox,Payment,-65,1000,ชา กาแฟ,,ร้านกาแฟ\n');

    fireEvent.click(importButton());
    await screen.findByText(/ยังอัปเดตยอดบัญชีไม่สำเร็จ 1 บัญชี/);
    expect(onImported).toHaveBeenCalledTimes(1);        // primary path

    fireEvent.click(screen.getByRole('button', { name: /ลองอีกครั้ง/ }));
    await screen.findByText('Import สำเร็จ!');
    expect(__tables.accounts[0].balance).toBe(1000);
    expect(onImported).toHaveBeenCalledTimes(2);        // retry path — consistent
  });

  it('(A4) delete an imported transaction → receipt mapping nulled, no resurrection on a same-key retry, finalisation skips it', async () => {
    installImportRpcV8({ postCommitFailPredicate: (call) => call === 1 });
    __tables.debts.push({ id: 'dd2', user_id: 'user-1', name: 'KTC บัตรเครดิต', creditor: 'KTC Krungthai',
      monthly_payment: 5200, months_paid: 0, total_months: 12, scope: 'personal', is_active: true });
    const { container } = render(
      <CSVImporter scope="personal" debts={__tables.debts} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n05/08/2026,KTC Krung ชำระบัตร,-5200\n');
    await screen.findByText(/AUTO-LINK/);

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);        // committed, response lost
    expect(__tables.transactions).toHaveLength(1);
    const imported = __tables.transactions[0];
    expect(__tables.import_receipts[0].transaction_id).toBe(imported.id);

    // The user deletes the imported transaction before finishing the import.
    await supabase.from('transactions').delete().eq('id', imported.id);
    expect(__tables.transactions).toHaveLength(0);
    // ON DELETE SET NULL — the receipt SURVIVES (so the ord still counts as
    // processed) but its now-meaningless mapping is cleared.
    expect(__tables.import_receipts).toHaveLength(1);
    expect(__tables.import_receipts[0].transaction_id).toBeNull();

    fireEvent.click(importButton());                    // same-key retry
    await screen.findByText(/Import สำเร็จ!/);
    expect(__tables.transactions).toHaveLength(0);      // NOT resurrected
    expect(__tables.debt_payments).toHaveLength(0);     // no link to a dead id
    expect(window.localStorage.getItem('loop:import-session')).toBeNull();
  });

  it('(A5) a stored session survives a page reload → the mount banner runs a read-only probe that restores the outcome', async () => {
    installImportRpcV8({ postCommitFailPredicate: (call) => call === 1 });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container, 'Date,Description,Amount\n05/08/2026,กาแฟ,-65\n');
    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);
    expect(__tables.transactions).toHaveLength(1);
    expect(window.localStorage.getItem('loop:import-session')).toBeTruthy();

    cleanup();                                          // ← the page reload
    const before = simCalls.length;
    render(<CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await screen.findByText(/มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง/);

    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));
    await screen.findByText(/Import สำเร็จ!/);
    expect(simCalls[before].probe).toBe(true);          // read-only reconstruction
    expect(__tables.transactions).toHaveLength(1);      // nothing re-inserted
    expect(__tables.import_receipts).toHaveLength(1);
    expect(window.localStorage.getItem('loop:import-session')).toBeNull();
  });
});

// ── Round 9 ────────────────────────────────────────────────────────────────
// Cross-reload honesty: a probe may only claim what the receipts prove, the
// persisted record must describe the WHOLE job, and an unrecovered record
// blocks new work until it is recovered or explicitly discarded.

/** A page reload: unmount, keep localStorage + server tables. */
function reload(props = {}) {
  cleanup();
  return render(<CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} {...props} />);
}

describe('CSVImporter cross-reload recovery (round 9)', () => {

  it('(R1) probe resolves ZERO outcomes → no finalize, no success screen, Thai "ยังไม่ได้นำเข้า", session cleared only on the explicit action', async () => {
    // Fails BEFORE any mutation, with a non-definitive error → the record is
    // written (the outcome is unknown) but the server holds NOTHING.
    installImportRpcV8({ failPredicate: (call) => call === 1 });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n05/08/2026,กาแฟ,-65\n06/08/2026,ข้าวเที่ยง,-120\n');

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);
    expect(__tables.transactions).toHaveLength(0);
    expect(__tables.import_receipts).toHaveLength(0);
    expect(window.localStorage.getItem('loop:import-session')).toBeTruthy();

    reload();                                            // ← the page reload
    await screen.findByText(/มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));

    // v4.21 finalised on an EMPTY probe and showed "Import สำเร็จ!". It must
    // now say the opposite — and mean it.
    await screen.findByText(/ยังไม่ได้นำเข้า — กรุณานำเข้าใหม่/);
    expect(screen.queryByText('Import สำเร็จ!')).toBeNull();
    expect(screen.queryByText(/รายการใหม่/)).toBeNull();       // no stats, no done screen
    expect(__tables.transactions).toHaveLength(0);
    // NOT cleared by the probe — only the explicit, informed action clears it.
    expect(window.localStorage.getItem('loop:import-session')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /เข้าใจแล้ว — ล้างและเริ่มใหม่/ }));
    await waitFor(() =>
      expect(window.localStorage.getItem('loop:import-session')).toBeNull());
    expect(screen.queryByText(/ยังไม่ได้นำเข้า/)).toBeNull();
  });

  it('(R2) probe resolves PARTIAL outcomes → stays pending, no success, resume completes the rest', async () => {
    // Group 1 commits and loses its response → group 2 is never sent. The
    // record (written before the first write) covers BOTH groups.
    installImportRpcV8({ postCommitFailPredicate: (call) => call === 1 });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/07/2026,กาแฟ,-65\n' +
      '06/07/2026,ข้าวเที่ยง,-120\n' +
      '05/08/2026,ค่าหนังสือ,-300\n');

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);
    expect(__tables.transactions).toHaveLength(2);       // July committed
    const stored = JSON.parse(window.localStorage.getItem('loop:import-session'));
    expect(stored.groups).toHaveLength(2);               // BOTH groups persisted
    expect(stored.rows).toHaveLength(3);

    reload();                                            // ← the page reload
    await screen.findByText(/มีการนำเข้าค้างอยู่/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));

    await screen.findByText(/นำเข้าไปแล้วบางส่วน — ยังไม่จบ/);
    expect(screen.queryByText('Import สำเร็จ!')).toBeNull();     // never a success
    await screen.findByText(/บันทึกไปแล้ว 2 จาก 3 รายการ/);
    expect(window.localStorage.getItem('loop:import-session')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /ทำต่อให้จบ/ }));
    await screen.findByText('Import สำเร็จ!');
    expect(__tables.transactions.map(t => t.title).sort())
      .toEqual(['กาแฟ', 'ข้าวเที่ยง', 'ค่าหนังสือ'].sort());     // no duplicates
    expect(__tables.import_receipts).toHaveLength(3);
    expect(new Set(simCalls.map(c => c.key)).size).toBe(1);       // ONE key throughout
    expect(window.localStorage.getItem('loop:import-session')).toBeNull();
  });

  it('(R3) multi-group reload → every group\'s mappings restored, balances + debt links applied, force-imported ambiguity keeps category/type/account', async () => {
    // Group 1 answers normally; group 2 commits and loses its response. Under
    // the round-8 record only group 2 survived the reload, stats.plan was
    // empty and no side effect could run.
    installImportRpcV8({ postCommitFailPredicate: (call) => call === 2 });
    const debts = [{ id: 'dd2', user_id: 'user-1', name: 'KTC บัตรเครดิต', creditor: 'KTC Krungthai',
      monthly_payment: 5200, months_paid: 0, total_months: 12, scope: 'personal', is_active: true }];
    __tables.debts.push(...debts);

    const { container } = render(
      <CSVImporter scope="personal" debts={__tables.debts} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Time,Cloud Pocket,Type,Txn,CP Bal,Category,Memo,Note\n' +
      '05/07/2026,09:15,Cashbox,Payment,-65,1000,ชา กาแฟ,,ร้านกาแฟ\n' +
      '05/08/2026,10:00,Wallet,Payment,-5200,7000,จ่ายหนี้,,KTC Krung ชำระบัตร\n');
    await screen.findByText(/AUTO-LINK/);

    // A legacy :00 row appears AFTER the preview classified, so the July row
    // can only be found ambiguous at EXECUTION time (call 1, answered), while
    // August (call 2) commits and loses its response.
    await waitFor(() => {});
    __tables.transactions.push({
      id: 'tx-prior', user_id: 'user-1', scope: 'personal',
      title: 'ร้านกาแฟ', amount: -65, note: null, type: 'food', category: 'กาแฟ',
      occurred_at: new Date('2026-07-05T09:15:00+07:00').toISOString(),
    });

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);
    const stored = JSON.parse(window.localStorage.getItem('loop:import-session'));
    expect(stored.groups.map(g => g.month).sort()).toEqual(['2026-07', '2026-08']);
    expect(stored.rows).toHaveLength(2);
    expect(stored.debtLinks).toHaveLength(1);
    expect(stored.createAccts).toBe(true);

    reload({ debts: __tables.debts });                   // ← the page reload
    await screen.findByText(/มีการนำเข้าค้างอยู่/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));

    // Both groups are fully described → the July ambiguity reopens.
    await screen.findByText(/พบรายการกำกวมตอนบันทึกจริง · 1 รายการ/);
    const box = screen.getAllByRole('checkbox')
      .find(c => c.closest('label')?.textContent.includes('ในระบบ'));
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: /ยืนยัน/ }));
    await screen.findByText('Import สำเร็จ!');

    // The force-imported row kept its metadata (round-8 rebuilt it from the
    // sparse {title, amount, date} snapshot: category/type/account_id null).
    const forced = __tables.transactions.find(t => t.title === 'ร้านกาแฟ' && t.id !== 'tx-prior');
    expect(forced).toBeTruthy();
    expect(forced.category).toBe('กาแฟ');
    expect(forced.type).toBe('food');
    expect(forced.account_id).toBe(__tables.accounts.find(a => a.name === 'Cashbox').id);

    // Side effects ran for BOTH groups, from the persisted plan.
    const cashbox = __tables.accounts.find(a => a.name === 'Cashbox');
    const wallet  = __tables.accounts.find(a => a.name === 'Wallet');
    expect(cashbox.balance).toBe(1000);
    expect(wallet.balance).toBe(7000);
    expect(wallet.balance_anchor_source).toBe('import');
    expect(__tables.debt_payments).toHaveLength(1);
    expect(__tables.debt_payments[0].transaction_id)
      .toBe(__tables.transactions.find(t => t.title === 'KTC Krung ชำระบัตร').id);
    expect(window.localStorage.getItem('loop:import-session')).toBeNull();
  });

  it('(R4) a new file cannot be uploaded while a stored session exists — only recovery or an explicit informed discard unblocks it', async () => {
    installImportRpcV8({ failPredicate: (call) => call === 1 });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container, 'Date,Description,Amount\n05/08/2026,กาแฟ,-65\n');
    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);
    const before = window.localStorage.getItem('loop:import-session');
    expect(before).toBeTruthy();

    const { container: c2 } = reload();                  // ← the page reload
    await screen.findByText(/มีการนำเข้าค้างอยู่/);

    // Dropping a new file must NOT start a new plan: the next write would
    // overwrite the only record of the previous session's rows.
    const input = c2.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [
      new File(['Date,Description,Amount\n09/09/2026,ของใหม่,-10\n'], 'new.csv', { type: 'text/csv' })] } });
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(String(window.alert.mock.calls.at(-1)[0])).toMatch(/มีการนำเข้าค้างอยู่จากครั้งก่อน/);
    expect(screen.queryByText(/ตัวเลือก IMPORT/)).toBeNull();       // never reached preview
    expect(window.localStorage.getItem('loop:import-session')).toBe(before);   // intact

    // Explicit informed discard — the confirm names the session and groups.
    fireEvent.click(screen.getByRole('button', { name: /ทิ้งการกู้คืนนี้/ }));
    const msg = String(window.confirm.mock.calls.at(-1)[0]);
    expect(msg).toMatch(/ทิ้งการกู้คืนนี้\?/);
    expect(msg).toMatch(/นำเข้าเมื่อ:/);
    expect(msg).toMatch(/ส่วนตัว 2026-08 \(1 รายการ\)/);
    expect(msg).toMatch(/ยังไม่ได้ตรวจสอบ/);
    await waitFor(() =>
      expect(window.localStorage.getItem('loop:import-session')).toBeNull());

    // Now a new file is accepted.
    fireEvent.change(c2.querySelector('input[type="file"]'), { target: { files: [
      new File(['Date,Description,Amount\n09/09/2026,ของใหม่,-10\n'], 'new.csv', { type: 'text/csv' })] } });
    await screen.findByText(/ตัวเลือก IMPORT/);
  });

  it('(R5) an inserted receipt whose mapping is NULL (transaction deleted) is excluded from the account pass AND the debt links, and reported as skipped', async () => {
    installImportRpcV8({ postCommitFailPredicate: (call) => call === 1 });
    __tables.debts.push({ id: 'dd2', user_id: 'user-1', name: 'KTC บัตรเครดิต', creditor: 'KTC Krungthai',
      monthly_payment: 5200, months_paid: 0, total_months: 12, scope: 'personal', is_active: true });
    const { container } = render(
      <CSVImporter scope="personal" debts={__tables.debts} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Time,Cloud Pocket,Type,Txn,CP Bal,Category,Memo,Note\n' +
      '05/08/2026,10:00,Wallet,Payment,-5200,7000,จ่ายหนี้,,KTC Krung ชำระบัตร\n');
    await screen.findByText(/AUTO-LINK/);

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);        // committed, response lost
    const imported = __tables.transactions[0];
    expect(__tables.import_receipts[0].transaction_id).toBe(imported.id);

    // The user deletes the imported transaction before the import finishes.
    await supabase.from('transactions').delete().eq('id', imported.id);
    expect(__tables.import_receipts[0].transaction_id).toBeNull();   // FK SET NULL

    fireEvent.click(importButton());                    // same-key retry
    await screen.findByText('Import สำเร็จ!');

    // `committed.has()` would have fed this row to the balance pass.
    const wallet = __tables.accounts.find(a => a.name === 'Wallet');
    expect(wallet).toBeTruthy();                        // the shell still exists
    expect(wallet.balance).toBe(0);                     // …but was NEVER anchored
    expect(wallet.balance_anchor_source).toBeUndefined();
    expect(__tables.debt_payments).toHaveLength(0);     // no link to a dead id
    await screen.findByText(/ข้ามเพราะรายการถูกลบ/);    // reported, not hidden
    await screen.findByText(/ไม่ได้นำไปอัปเดตยอดบัญชีและไม่ได้ผูกงวดหนี้/);
  });

  it('(R6) a corrupt or unknown-version stored record is ignored safely — no banner, no gate, no crash', async () => {
    installImportRpcV8();
    for (const junk of ['{not json', '{"v":99,"key":"k","groups":[]}', '"a string"', '{"v":2}']) {
      cleanup();
      window.localStorage.setItem('loop:import-session', junk);
      const { container } = render(
        <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
      expect(screen.queryByText(/มีการนำเข้าค้างอยู่/)).toBeNull();
      // The gate must not latch on a record it cannot act on.
      await uploadCsv(container, 'Date,Description,Amount\n05/08/2026,กาแฟ,-65\n');
    }
  });

  it('(R7) the unversioned v4.21 record is UPGRADED, not dropped — probe still reports the truth, resume stays disabled', async () => {
    installImportRpcV8();
    // Exactly what v4.21 wrote, plus the receipt it refers to.
    __tables.transactions.push({ id: 'tx-old', user_id: 'user-1', scope: 'personal',
      title: 'กาแฟ', amount: -65, note: null, type: 'food', category: 'อาหาร',
      occurred_at: new Date('2026-08-05T12:00:00+07:00').toISOString() });
    __tables.import_receipts.push({ user_id: 'user-1', import_key: 'legacy-key', ord: 1,
      transaction_id: 'tx-old', outcome: 'inserted', detail: null,
      created_at: new Date().toISOString() });
    window.localStorage.setItem('loop:import-session', JSON.stringify({
      key: 'legacy-key', ords: [1], scope: 'personal', month: '2026-08', at: Date.now(),
    }));

    render(<CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await screen.findByText(/มีการนำเข้าค้างอยู่/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));

    // It carries no row payload → report the outcome, refuse to invent side
    // effects, and never claim success.
    await screen.findByText(/ตรวจสอบได้ แต่ทำต่ออัตโนมัติไม่ได้/);
    expect(screen.queryByText('Import สำเร็จ!')).toBeNull();
    await screen.findByText(/บันทึกไปแล้ว 1 จาก 1 รายการ/);
    expect(__tables.transactions).toHaveLength(1);      // probe wrote nothing
    expect(screen.queryByRole('button', { name: /ทำต่อให้จบ/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /ทิ้งการกู้คืนนี้/ }));
    await waitFor(() =>
      expect(window.localStorage.getItem('loop:import-session')).toBeNull());
  });
});
