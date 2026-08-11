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
    const stored = JSON.parse(window.localStorage.getItem('loop:import-session'));
    expect(stored.ords).toHaveLength(2);
    expect(stored.month).toBe('2026-08');

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
