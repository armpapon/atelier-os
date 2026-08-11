// Mounted-component tests for CSVImporter orchestration (audit rounds 6–7).
// The supabase client is the same mock PostgREST as audit/evidence.mjs
// (aliased in vitest.config.mjs); the import RPC is simulated at v8
// semantics (receipts-FIRST for EVERY outcome + complete reconstruction +
// wipe-forced-off + ord→id mapping + p_probe) by audit/import-rpc-sim.mjs,
// with scriptable pre-execution failures AND post-commit response loss.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react';
import React from 'react';

import { CSVImporter } from '../../src/components/CSVImporter.jsx';
import { __tables, __config, supabase } from '../mock-supabase.mjs';
import { installImportRpcV8, simCalls, resetSim } from '../import-rpc-sim.mjs';

// ── Recovery-record storage (round 10) ─────────────────────────────────────
// v4.22 kept every session at the single key 'loop:import-session'; v4.23
// namespaces one slot per session key ('loop:import-session:<importKey>') and
// still reads/migrates the legacy key. These helpers therefore address "the
// pending record(s)", not a fixed key — the round 6–9 assertions below are
// unchanged in meaning.
const LEGACY_KEY = 'loop:import-session';
const SLOT_PREFIX = 'loop:import-session:';
function storedSlots() {
  const out = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k === LEGACY_KEY || (k && k.startsWith(SLOT_PREFIX))) {
      out.push([k, window.localStorage.getItem(k)]);
    }
  }
  return out.sort();
}
function storedRaw() {
  const slots = storedSlots();
  return slots.length ? slots[0][1] : null;
}
function storedRecord() {
  const raw = storedRaw();
  return raw ? JSON.parse(raw) : null;
}

async function uploadCsv(container, csvText) {
  const input = container.querySelector('input[type="file"]');
  const file = new File([csvText], 'report.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText(/ตัวเลือก IMPORT/);
}

function importButton(scope = screen) {
  return scope.getByRole('button', { name: /Import \d+ รายการ/ });
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
    const stored = storedRecord();
    expect(stored.v).toBe(3);                    // round 10: namespaced record
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
    expect(storedRaw()).toBeNull();
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
    expect(storedRaw()).toBeNull();
  });

  it('(A5) a stored session survives a page reload → the mount banner runs a read-only probe that restores the outcome', async () => {
    installImportRpcV8({ postCommitFailPredicate: (call) => call === 1 });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container, 'Date,Description,Amount\n05/08/2026,กาแฟ,-65\n');
    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);
    expect(__tables.transactions).toHaveLength(1);
    expect(storedRaw()).toBeTruthy();

    cleanup();                                          // ← the page reload
    const before = simCalls.length;
    render(<CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await screen.findByText(/มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง/);

    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));
    await screen.findByText(/Import สำเร็จ!/);
    expect(simCalls[before].probe).toBe(true);          // read-only reconstruction
    expect(__tables.transactions).toHaveLength(1);      // nothing re-inserted
    expect(__tables.import_receipts).toHaveLength(1);
    expect(storedRaw()).toBeNull();
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
    expect(storedRaw()).toBeTruthy();

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
    expect(storedRaw()).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /เข้าใจแล้ว — ล้างและเริ่มใหม่/ }));
    await waitFor(() =>
      expect(storedRaw()).toBeNull());
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
    const stored = storedRecord();
    expect(stored.groups).toHaveLength(2);               // BOTH groups persisted
    expect(stored.rows).toHaveLength(3);

    reload();                                            // ← the page reload
    await screen.findByText(/มีการนำเข้าค้างอยู่/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));

    await screen.findByText(/นำเข้าไปแล้วบางส่วน — ยังไม่จบ/);
    expect(screen.queryByText('Import สำเร็จ!')).toBeNull();     // never a success
    await screen.findByText(/บันทึกไปแล้ว 2 จาก 3 รายการ/);
    expect(storedRaw()).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /ทำต่อให้จบ/ }));
    await screen.findByText('Import สำเร็จ!');
    expect(__tables.transactions.map(t => t.title).sort())
      .toEqual(['กาแฟ', 'ข้าวเที่ยง', 'ค่าหนังสือ'].sort());     // no duplicates
    expect(__tables.import_receipts).toHaveLength(3);
    expect(new Set(simCalls.map(c => c.key)).size).toBe(1);       // ONE key throughout
    expect(storedRaw()).toBeNull();
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
    const stored = storedRecord();
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
    expect(storedRaw()).toBeNull();
  });

  it('(R4) a new file cannot be uploaded while a stored session exists — only recovery or an explicit informed discard unblocks it', async () => {
    installImportRpcV8({ failPredicate: (call) => call === 1 });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container, 'Date,Description,Amount\n05/08/2026,กาแฟ,-65\n');
    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);
    const before = storedRaw();
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
    expect(storedRaw()).toBe(before);   // intact

    // Explicit informed discard — the confirm names the session and groups.
    fireEvent.click(screen.getByRole('button', { name: /ทิ้งการกู้คืนนี้/ }));
    const msg = String(window.confirm.mock.calls.at(-1)[0]);
    expect(msg).toMatch(/ทิ้งการกู้คืนนี้\?/);
    expect(msg).toMatch(/นำเข้าเมื่อ:/);
    expect(msg).toMatch(/ส่วนตัว 2026-08 \(1 รายการ\)/);
    expect(msg).toMatch(/ยังไม่ได้ตรวจสอบ/);
    await waitFor(() =>
      expect(storedRaw()).toBeNull());

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
      expect(storedRaw()).toBeNull());
  });
});

// ── Round 10 ───────────────────────────────────────────────────────────────
// Five acceptance cases named by the auditor. Every one of them fails on
// v4.22 for a different reason: the shared storage key, the resume that
// re-derives its options, and the staleness clock that any patch resets.

/** Simulate the browser telling this document that another tab wrote. */
function fireStorageEvent(key) {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', {
      key, newValue: key ? window.localStorage.getItem(key) : null,
    }));
  });
}
function slotKeys() {
  return storedSlots().map(([k]) => k);
}

describe('CSVImporter cross-tab + resume fidelity (round 10)', () => {

  it('(X1) two tabs never share a recovery slot: tab A\'s whole import leaves tab B\'s pending record byte-identical, and B\'s record never locks A', async () => {
    installImportRpcV8({ postCommitFailPredicate: (call) => call === 1 });

    // Tab A opens first, with nothing pending — it adopts nothing.
    const { container: A } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);

    // Tab B opens and loses the response to its only group → record K_B.
    const { container: B } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    fireEvent.change(B.querySelector('input[type="file"]'), { target: { files: [
      new File(['Date,Description,Amount\n05/08/2026,กาแฟของแท็บบี,-65\n'], 'b.csv', { type: 'text/csv' })] } });
    await within(B).findByText(/ตัวเลือก IMPORT/);
    fireEvent.click(importButton(within(B)));
    await within(B).findByText(/Import ไม่สำเร็จ/);

    expect(slotKeys()).toHaveLength(1);
    const [slotB] = slotKeys();
    expect(slotB.startsWith(SLOT_PREFIX)).toBe(true);          // namespaced, not the shared key
    const recordB = window.localStorage.getItem(slotB);
    expect(JSON.parse(recordB).key).toBe(slotB.slice(SLOT_PREFIX.length));
    expect(__tables.transactions).toHaveLength(1);

    // The browser notifies tab A. A surfaces it — and must NOT be locked by it.
    fireStorageEvent(slotB);
    await within(A).findByText(/มีการนำเข้าค้างที่ยังไม่ได้เลือกกู้คืน/);
    expect(within(A).getByRole('button', { name: /เลือกกู้คืนชุดนี้/ })).toBeTruthy();

    window.alert.mockClear();
    fireEvent.change(A.querySelector('input[type="file"]'), { target: { files: [
      new File(['Date,Description,Amount\n05/09/2026,ของแท็บเอ,-10\n'], 'a.csv', { type: 'text/csv' })] } });
    await within(A).findByText(/ตัวเลือก IMPORT/);             // NOT blocked by B's record
    expect(window.alert).not.toHaveBeenCalled();

    fireEvent.click(importButton(within(A)));
    await within(A).findByText(/Import สำเร็จ!/);

    // v4.22: A's persist overwrote B's record and A's completion deleted it.
    expect(slotKeys()).toEqual([slotB]);
    expect(window.localStorage.getItem(slotB)).toBe(recordB);  // byte-identical
    expect(__tables.transactions.map(t => t.title).sort())
      .toEqual(['กาแฟของแท็บบี', 'ของแท็บเอ'].sort());

    // B's session is still recoverable after a reload.
    cleanup();
    render(<CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await screen.findByText(/มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));
    await screen.findByText(/Import สำเร็จ!/);
    expect(__tables.transactions).toHaveLength(2);             // nothing re-inserted
    expect(storedRaw()).toBeNull();
  });

  it('(X1b) several pending records → none is adopted silently; the user picks which one this tab recovers', async () => {
    installImportRpcV8();
    __tables.transactions.push(
      { id: 'tx-k1', user_id: 'user-1', scope: 'personal', title: 'ชุดที่หนึ่ง', amount: -11,
        note: null, type: 'food', category: 'อาหาร', occurred_at: '2026-08-05T05:00:00.000Z' },
      { id: 'tx-k2', user_id: 'user-1', scope: 'personal', title: 'ชุดที่สอง', amount: -22,
        note: null, type: 'food', category: 'อาหาร', occurred_at: '2026-09-05T05:00:00.000Z' });
    const mkRecord = (key, month, ord, txId) => {
      __tables.import_receipts.push({ user_id: 'user-1', import_key: key, ord,
        transaction_id: txId, outcome: 'inserted', detail: null, created_at: new Date().toISOString() });
      window.localStorage.setItem(SLOT_PREFIX + key, JSON.stringify({
        v: 3, key, at: Date.now(), startedAt: Date.now(),
        groups: [{ scope: 'personal', month, wipe: false, dedup: true, ords: [ord] }],
        rows: [{ _rid: ord, scope: 'personal', month, title: 't' + ord, amount: -1,
          occurred_at: `${month}-05T12:00:00+07:00` }],
        pockets: [], debtLinks: [], createAccts: false, makeFmt: false,
        doneGroups: [], sideEffects: {},
      }));
    };
    mkRecord('key-one', '2026-08', 71, 'tx-k1');
    mkRecord('key-two', '2026-09', 72, 'tx-k2');

    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);

    // Two records → adopt NEITHER, list BOTH.
    await screen.findByText(/มีการนำเข้าค้างที่ยังไม่ได้เลือกกู้คืน · 2 ชุด/);
    expect(screen.queryByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ })).toBeNull();
    const picks = screen.getAllByRole('button', { name: /เลือกกู้คืนชุดนี้/ });
    expect(picks).toHaveLength(2);
    expect(screen.getByText(/ส่วนตัว 2026-08 \(1 รายการ\)/)).toBeTruthy();
    expect(screen.getByText(/ส่วนตัว 2026-09 \(1 รายการ\)/)).toBeTruthy();

    fireEvent.click(picks[0]);                       // adopt the older one
    await screen.findByText(/มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง/);
    // The other one is still listed, and is not touched.
    expect(screen.getAllByRole('button', { name: /เลือกกู้คืนชุดนี้/ })[0].disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));
    await screen.findByText(/Import สำเร็จ!/);
    expect(slotKeys()).toEqual([SLOT_PREFIX + 'key-two']);      // ONLY the adopted slot died
    expect(container).toBeTruthy();
  });

  it('(X2) two-group wipe resume wipes exactly ONCE for the group that never ran, and never re-wipes the committed one', async () => {
    installImportRpcV8({ failPredicate: (call) => call === 2 });   // group 2 fails before mutating
    // Stale rows in BOTH months — "replace the month" must clear each once.
    __tables.transactions.push(
      { id: 'old-jul', user_id: 'user-1', scope: 'personal', title: 'ของเก่า ก.ค.', amount: -777,
        note: null, type: 'food', category: 'อาหาร', occurred_at: '2026-07-02T05:00:00.000Z' },
      { id: 'old-aug', user_id: 'user-1', scope: 'personal', title: 'ของเก่า ส.ค.', amount: -888,
        note: null, type: 'food', category: 'อาหาร', occurred_at: '2026-08-02T05:00:00.000Z' });

    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/07/2026,กาแฟ,-65\n' +
      '05/08/2026,ค่าหนังสือ,-300\n');
    fireEvent.click(screen.getAllByRole('checkbox')
      .find(c => c.closest('label')?.textContent.includes('ลบรายการเดิมในเดือนนั้น')));

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);
    // July wiped + filled; August untouched (the call failed before mutating).
    expect(__tables.transactions.map(t => t.title).sort())
      .toEqual(['กาแฟ', 'ของเก่า ส.ค.'].sort());
    const stored = storedRecord();
    expect(stored.groups.map(g => [g.month, g.wipe]).sort())
      .toEqual([['2026-07', true], ['2026-08', true]]);   // the flag is persisted per group

    reload();                                             // ← the page reload
    await screen.findByText(/มีการนำเข้าค้างอยู่/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));
    await screen.findByText(/นำเข้าไปแล้วบางส่วน — ยังไม่จบ/);

    const beforeResume = simCalls.length;
    fireEvent.click(screen.getByRole('button', { name: /ทำต่อให้จบ/ }));
    await screen.findByText('Import สำเร็จ!');

    const resumeCalls = simCalls.slice(beforeResume).filter(c => !c.probe);
    expect(resumeCalls.map(c => [c.month, c.wipe]).sort())
      .toEqual([['2026-07', false], ['2026-08', true]]);
    // v4.22 sent wipe:false for BOTH — August kept 'ของเก่า ส.ค.' for ever.
    expect(__tables.transactions.map(t => t.title).sort())
      .toEqual(['กาแฟ', 'ค่าหนังสือ'].sort());
    expect(__tables.transactions.filter(t => t.title === 'กาแฟ')).toHaveLength(1);  // no re-wipe, no dupe
    expect(new Set(simCalls.map(c => c.key)).size).toBe(1);
    expect(storedRaw()).toBeNull();
  });

  it('(X3) dedup=false survives the resume — the unstarted group still sends p_dedup=false and imports the near-duplicate', async () => {
    installImportRpcV8({ failPredicate: (call) => call === 2 });
    // An EXACT copy of the August row already sits in the ledger. With
    // "ข้ามรายการซ้ำ" off the user is deliberately importing it again.
    __tables.transactions.push(
      { id: 'dup-aug', user_id: 'user-1', scope: 'personal', title: 'ค่าหนังสือ', amount: -300,
        note: null, type: 'shop', category: 'ช้อปปิ้ง', occurred_at: '2026-08-05T05:00:00.000Z' });

    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/07/2026,กาแฟ,-65\n' +
      '05/08/2026,ค่าหนังสือ,-300\n');
    const dedupBox = screen.getAllByRole('checkbox')
      .find(c => c.closest('label')?.textContent.includes('ข้ามรายการซ้ำ'));
    expect(dedupBox.checked).toBe(true);
    fireEvent.click(dedupBox);                            // dedup OFF
    expect(dedupBox.checked).toBe(false);

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);
    const stored = storedRecord();
    expect(stored.groups.every(g => g.dedup === false)).toBe(true);   // persisted per group

    reload();                                             // ← the page reload
    await screen.findByText(/มีการนำเข้าค้างอยู่/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));
    await screen.findByText(/นำเข้าไปแล้วบางส่วน — ยังไม่จบ/);

    const beforeResume = simCalls.length;
    fireEvent.click(screen.getByRole('button', { name: /ทำต่อให้จบ/ }));
    await screen.findByText('Import สำเร็จ!');

    const resumed = simCalls.slice(beforeResume).filter(c => !c.probe);
    expect(resumed.length).toBeGreaterThan(0);
    expect(resumed.every(c => c.dedup === false)).toBe(true);
    // v4.22 re-derived dedup:true here and skipped the row as a duplicate.
    expect(__tables.transactions.filter(t => t.title === 'ค่าหนังสือ')).toHaveLength(2);
    expect(storedRaw()).toBeNull();
  });

  it('(X4) localStorage.setItem throwing aborts BEFORE any RPC — explicit Thai error, nothing imported, the plan survives for a retry', async () => {
    installImportRpcV8();
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n05/08/2026,กาแฟ,-65\n06/08/2026,ข้าวเที่ยง,-120\n');

    const realSet = window.localStorage.setItem.bind(window.localStorage);
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('exceeded the quota', 'QuotaExceededError');
    });

    fireEvent.click(importButton());
    await screen.findByText(/บันทึกจุดกู้คืนไม่ได้ \(พื้นที่เก็บข้อมูลเต็ม\) — ยังไม่ได้นำเข้าอะไรทั้งสิ้น/);

    // v4.22 swallowed the throw and imported anyway, unrecoverably.
    expect(simCalls).toHaveLength(0);                     // no transaction RPC at all
    expect(__tables.transactions).toHaveLength(0);
    expect(__tables.import_receipts).toHaveLength(0);
    expect(__tables.accounts).toHaveLength(0);
    expect(storedRaw()).toBeNull();
    // The plan is intact: still on preview, still 2 rows selected.
    expect(screen.getByText(/ตัวเลือก IMPORT/)).toBeTruthy();
    expect(importButton().textContent).toMatch(/Import 2 รายการ/);

    setSpy.mockRestore();
    expect(realSet).toBeTruthy();
    fireEvent.click(importButton());                      // space freed → retry works
    await screen.findByText('Import สำเร็จ!');
    expect(__tables.transactions).toHaveLength(2);
    expect(storedRaw()).toBeNull();
  });

  it('(X5) the stale check uses the IMMUTABLE startedAt, not the last patch — a day-0 session patched yesterday is refused, never probed', async () => {
    installImportRpcV8();
    const DAY = 24 * 3600 * 1000;
    __tables.transactions.push({ id: 'tx-old', user_id: 'user-1', scope: 'personal',
      title: 'เก่ามาก', amount: -65, note: null, type: 'food', category: 'อาหาร',
      occurred_at: '2026-08-05T05:00:00.000Z' });
    __tables.import_receipts.push({ user_id: 'user-1', import_key: 'key-aged', ord: 91,
      transaction_id: 'tx-old', outcome: 'inserted', detail: null,
      created_at: new Date(Date.now() - 70 * DAY).toISOString() });
    window.localStorage.setItem(SLOT_PREFIX + 'key-aged', JSON.stringify({
      v: 3, key: 'key-aged',
      startedAt: Date.now() - 70 * DAY,      // the receipts' true age
      at: Date.now() - 1 * DAY,              // …but a patch refreshed this yesterday
      groups: [{ scope: 'personal', month: '2026-08', wipe: false, dedup: true, ords: [91] }],
      rows: [{ _rid: 91, scope: 'personal', month: '2026-08', title: 'เก่ามาก', amount: -65,
        occurred_at: '2026-08-05T12:00:00+07:00' }],
      pockets: [], debtLinks: [], createAccts: false, makeFmt: false,
      doneGroups: [], sideEffects: {},
    }));

    render(<CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await screen.findByText(/มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));

    // v4.22 read `at`, called this 1 day old, probed and finalised.
    await screen.findByText(/การนำเข้าค้างนี้เก่าเกินกว่าจะตรวจสอบได้/);
    expect(screen.queryByText('Import สำเร็จ!')).toBeNull();
    expect(simCalls).toHaveLength(0);                     // not even a probe
    expect(screen.queryByRole('button', { name: /ทำต่อให้จบ/ })).toBeNull();
    expect(storedRaw()).toBeTruthy();                     // kept until an informed discard
  });

  it('(X5b) a v4.22 record with NO startedAt is unknown-age: probe-only, resume refused, and a zero probe is never read as "nothing was imported"', async () => {
    installImportRpcV8();
    const noStamp = (key, ords) => JSON.stringify({
      v: 2, key, at: Date.now(),                          // no startedAt at all
      groups: [{ scope: 'personal', month: '2026-08', wipe: false, ords }],
      rows: ords.map(o => ({ _rid: o, scope: 'personal', month: '2026-08',
        title: 'แถว ' + o, amount: -50, occurred_at: '2026-08-05T12:00:00+07:00' })),
      pockets: [], debtLinks: [], createAccts: false, makeFmt: false,
      doneGroups: [], sideEffects: {},
    });

    // (a) receipts DO exist → report the outcome, but never resume from it.
    __tables.transactions.push({ id: 'tx-u1', user_id: 'user-1', scope: 'personal',
      title: 'แถว 61', amount: -50, note: null, type: 'food', category: 'อาหาร',
      occurred_at: '2026-08-05T05:00:00.000Z' });
    __tables.import_receipts.push({ user_id: 'user-1', import_key: 'key-nostamp', ord: 61,
      transaction_id: 'tx-u1', outcome: 'inserted', detail: null, created_at: new Date().toISOString() });
    window.localStorage.setItem(SLOT_PREFIX + 'key-nostamp', noStamp('key-nostamp', [61, 62]));

    render(<CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await screen.findByText(/มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));
    await screen.findByText(/ตรวจสอบได้ แต่ทำต่ออัตโนมัติไม่ได้/);
    expect(screen.queryByText('Import สำเร็จ!')).toBeNull();
    expect(screen.queryByRole('button', { name: /ทำต่อให้จบ/ })).toBeNull();
    expect(simCalls.every(c => c.probe)).toBe(true);      // read-only throughout
    expect(__tables.transactions).toHaveLength(1);

    // (b) the probe resolves ZERO — with no trustworthy age this cannot be
    // called "nothing was imported": the receipts may simply have been purged.
    cleanup();
    window.localStorage.clear();
    window.localStorage.setItem(SLOT_PREFIX + 'key-empty', noStamp('key-empty', [63]));
    render(<CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));
    await screen.findByText(/ไม่ทราบเวลาของการนำเข้าค้างนี้ — ยืนยันผลให้ไม่ได้/);
    expect(screen.queryByText(/ยังไม่ได้นำเข้า — กรุณานำเข้าใหม่/)).toBeNull();
    expect(storedRaw()).toBeTruthy();
  });
});

// ── Round 11 ───────────────────────────────────────────────────────────────
// The recovery record is only as good as the tab's grip on it. One blocker
// (ownership outliving its session) and two ways the abort path lied.

/** A definitive pre-commit rejection: the server answered, nothing was written. */
const DEFINITIVE_ERROR = { code: '23505', message: 'duplicate key value violates unique constraint' };

/** Make localStorage.setItem throw for anything bigger than a token probe. */
function breakStorage({ minLength = 0 } = {}) {
  const real = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
    if (String(v).length <= minLength) return real.call(this, k, v);
    throw new DOMException('exceeded the quota', 'QuotaExceededError');
  });
}

describe('CSVImporter session ownership + honest aborts (round 11)', () => {

  it('(Y1) definitive failure → Back → new file: the second session is recorded and recoverable (v4.23 left it invisible)', async () => {
    installImportRpcV8({
      failPredicate: (call) => call === 1, failError: DEFINITIVE_ERROR,   // K1 rejected outright
      postCommitFailPredicate: (call) => call === 2,                      // K2 commits, response lost
    });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);

    // (1)+(2) K1 is recorded before the first call; the call is definitively rejected.
    await uploadCsv(container, 'Date,Description,Amount\n05/08/2026,ของรอบแรก,-65\n');
    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);
    expect(__tables.transactions).toHaveLength(0);
    expect(__tables.import_receipts).toHaveLength(0);
    const k1Slots = slotKeys();
    expect(k1Slots).toHaveLength(1);

    // (3) Back is open — nothing committed, no unanswered write. Releasing here
    // deletes K1's record on purpose: the server provably holds no receipt for
    // it, so keeping it would only show a phantom pending import.
    const back = screen.getByRole('button', { name: /← กลับ/ });
    expect(back.disabled).toBe(false);
    fireEvent.click(back);
    await waitFor(() => expect(slotKeys()).toHaveLength(0));

    // (4) A new file → K2. v4.23 still "owned" K1, so persistSession returned
    // silently and this whole import went unrecorded.
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [
      new File(['Date,Description,Amount\n09/09/2026,ของรอบสอง,-42\n'], 'two.csv', { type: 'text/csv' })] } });
    await screen.findByText(/ตัวเลือก IMPORT/);
    fireEvent.click(importButton());

    // (5) K2 commits and loses its response.
    await screen.findByText(/Import ไม่สำเร็จ/);
    expect(__tables.transactions.map(t => t.title)).toEqual(['ของรอบสอง']);
    const k2Slots = slotKeys();
    expect(k2Slots).toHaveLength(1);
    expect(k2Slots[0]).not.toBe(k1Slots[0]);          // its OWN slot, not K1's
    const k2 = storedRecord();
    expect(k2.rows.map(r => r.title)).toEqual(['ของรอบสอง']);
    expect(k2.groups[0].month).toBe('2026-09');

    // (6) Reload: K2 is there and recovers. v4.23 showed nothing at all.
    reload();
    await screen.findByText(/มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));
    await screen.findByText(/Import สำเร็จ!/);
    expect(__tables.transactions).toHaveLength(1);    // nothing re-inserted
    expect(storedRaw()).toBeNull();
  });

  it('(Y1b) a released session whose group DID answer keeps its record — handed back to the picker, never deleted', async () => {
    // Group 1 answers with an AMBIGUITY: a receipt is written while
    // committedRef stays empty — so committedRef alone cannot decide whether
    // the server holds state. Group 2 is then definitively rejected.
    installImportRpcV8({ failPredicate: (call) => call === 2, failError: DEFINITIVE_ERROR });

    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/07/2026,ค่าเน็ต,-599\n' +
      '05/08/2026,ค่าหนังสือ,-300\n');

    // A legacy :00 row appears AFTER the preview classified → the July row can
    // only be found ambiguous at execution time.
    await waitFor(() => {});
    __tables.transactions.push({ id: 'tx-prior', user_id: 'user-1', scope: 'personal',
      title: 'ค่าเน็ต', amount: -599, note: null, type: 'bills', category: 'บิล',
      occurred_at: new Date('2026-07-05T12:00:00+07:00').toISOString() });

    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);
    expect(__tables.import_receipts.map(r => r.outcome)).toEqual(['ambiguous']);  // receipts exist…
    expect(__tables.transactions).toHaveLength(1);                                 // …nothing inserted
    const slot = slotKeys()[0];
    expect(slot).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /← กลับ/ }));
    // Released, NOT discarded: the server may hold receipts for this key.
    await waitFor(() => expect(slotKeys()).toEqual([slot]));
    await screen.findByText(/มีการนำเข้าค้างที่ยังไม่ได้เลือกกู้คืน/);
    expect(screen.getByRole('button', { name: /เลือกกู้คืนชุดนี้/ }).disabled).toBe(false);

    // And it can be picked back up.
    fireEvent.click(screen.getByRole('button', { name: /เลือกกู้คืนชุดนี้/ }));
    await screen.findByText(/มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง/);
  });

  it('(Y2) the writability probe was a proxy: a full-record write that fails must leave ZERO account shells behind', async () => {
    installImportRpcV8();
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Time,Cloud Pocket,Type,Txn,CP Bal,Category,Memo,Note\n' +
      '05/08/2026,09:15,Cashbox,Payment,-65,1000,ชา กาแฟ,,ร้านกาแฟ\n' +
      '05/08/2026,10:00,Wallet,Payment,-500,7000,อื่นๆ,,ของบ้าน\n');
    expect(screen.getByText(/💼 บัญชี \/ Cloud Pockets · 2/)).toBeTruthy();

    // A 1-byte probe would sail through this; the real record cannot.
    const spy = breakStorage({ minLength: 8 });
    expect(window.localStorage.setItem('probe-sized', '1')).toBeUndefined();   // short write: fine

    fireEvent.click(importButton());
    await screen.findByText(/บันทึกจุดกู้คืนไม่ได้ \(พื้นที่เก็บข้อมูลเต็ม\) — ยังไม่ได้นำเข้าอะไรทั้งสิ้น/);

    // v4.23 created the shells first and only then failed writing the record.
    expect(__tables.accounts).toHaveLength(0);
    expect(simCalls).toHaveLength(0);
    expect(__tables.transactions).toHaveLength(0);
    expect(storedRaw()).toBeNull();
    expect(screen.getByText(/ตัวเลือก IMPORT/)).toBeTruthy();     // plan intact

    spy.mockRestore();
    fireEvent.click(importButton());
    await screen.findByText('Import สำเร็จ!');
    expect(__tables.accounts.map(a => a.name).sort()).toEqual(['Cashbox', 'Wallet']);
    expect(__tables.transactions).toHaveLength(2);
  });

  it('(Y3) after a partial commit the abort must NOT claim a clean slate — it names what landed and keeps the session pending', async () => {
    installImportRpcV8();
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container,
      'Date,Description,Amount\n' +
      '05/08/2026,กาแฟ,-65\n' +
      '06/08/2026,ข้าวเที่ยง,-120\n');

    // A legacy :00 row lands AFTER the preview classified → 'กาแฟ' can only be
    // found ambiguous at execution time, while 'ข้าวเที่ยง' commits.
    await waitFor(() => {});
    __tables.transactions.push({ id: 'tx-prior', user_id: 'user-1', scope: 'personal',
      title: 'กาแฟ', amount: -65, note: null, type: 'food', category: 'อาหาร',
      occurred_at: new Date('2026-08-05T12:00:00+07:00').toISOString() });

    fireEvent.click(importButton());
    await screen.findByText(/พบรายการกำกวมตอนบันทึกจริง · 1 รายการ/);
    expect(__tables.transactions.map(t => t.title).sort()).toEqual(['กาแฟ', 'ข้าวเที่ยง'].sort());
    const slotBefore = slotKeys()[0];
    const recordBefore = window.localStorage.getItem(slotBefore);

    // Storage dies exactly at the force-decision patch.
    const spy = breakStorage();
    fireEvent.click(screen.getAllByRole('checkbox')
      .find(c => c.closest('label')?.textContent.includes('ในระบบ')));
    fireEvent.click(screen.getByRole('button', { name: /ยืนยัน/ }));

    await screen.findByText(/มี 1 รายการที่บันทึกลงระบบไปแล้ว/);
    // v4.23 printed the clean-slate copy here — with a row already in the ledger.
    expect(screen.queryByText(/ยังไม่ได้นำเข้าอะไรทั้งสิ้น/)).toBeNull();
    expect(screen.getByText(/งานนี้ยังไม่จบ/)).toBeTruthy();
    expect(screen.getByText(/ไม่ได้ล้างทิ้ง/)).toBeTruthy();
    // Nothing was forced through, and the session is still pending + intact.
    expect(__tables.transactions.filter(t => t.title === 'กาแฟ')).toHaveLength(1);
    expect(window.localStorage.getItem(slotBefore)).toBe(recordBefore);
    expect(screen.getByRole('button', { name: /ยืนยัน/ })).toBeTruthy();   // still on resolve

    spy.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: /ยืนยัน/ }));
    await screen.findByText('Import สำเร็จ!');
    expect(__tables.transactions.filter(t => t.title === 'กาแฟ')).toHaveLength(2);
    expect(storedRaw()).toBeNull();
  });
});

// ── Round-11 follow-up ─────────────────────────────────────────────────────
// The pre-flight has to measure the payload that actually has to fit. It is
// written before the account shells exist, so the only field that differs from
// the final record is rows[].account_id (null → an account uuid) — which is
// exactly the field that can push the final write over quota.

const MAKE_CSV_2_POCKETS =
  'Date,Time,Cloud Pocket,Type,Txn,CP Bal,Category,Memo,Note\n' +
  '05/08/2026,09:15,Cashbox,Payment,-65,1000,ชา กาแฟ,,ร้านกาแฟ\n' +
  '05/08/2026,10:00,Wallet,Payment,-500,7000,อื่นๆ,,ของบ้าน\n';

describe('CSVImporter quota boundary (round-11 follow-up)', () => {

  it('(Z1) the record that must fit does NOT fit: the pre-flight refuses before a single account shell exists', async () => {
    // ── Phase 1 · calibrate ────────────────────────────────────────────────
    // Run the import with storage wide open and record the largest payload it
    // writes. That is the FINAL record — rows carrying real account ids — i.e.
    // precisely what has to fit for the import to be recoverable.
    installImportRpcV8();
    let widest = 0;
    const realSet = Storage.prototype.setItem;
    let spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      if (String(k).startsWith(SLOT_PREFIX)) widest = Math.max(widest, String(v).length);
      return realSet.call(this, k, v);
    });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container, MAKE_CSV_2_POCKETS);
    fireEvent.click(importButton());
    await screen.findByText('Import สำเร็จ!');
    spy.mockRestore();
    expect(widest).toBeGreaterThan(0);
    const accountIds = __tables.accounts.map(a => a.id);
    expect(accountIds).toHaveLength(2);

    // ── Phase 2 · the boundary ─────────────────────────────────────────────
    cleanup();
    for (const k of Object.keys(__tables)) __tables[k] = [];
    window.localStorage.clear();
    resetSim();
    installImportRpcV8();

    // Quota sits ONE byte under the record that has to fit. v4.24's pre-flight
    // measured the same rows with `account_id: null` — smaller — so it passed,
    // both shells were created, and only then did the real write blow up.
    const budget = widest - 1;
    spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
      if (String(v).length > budget) throw new DOMException('exceeded the quota', 'QuotaExceededError');
      return realSet.call(this, k, v);
    });

    const { container: c2 } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(c2, MAKE_CSV_2_POCKETS);
    fireEvent.click(importButton());
    await screen.findByText(/บันทึกจุดกู้คืนไม่ได้ \(พื้นที่เก็บข้อมูลเต็ม\)/);

    expect(__tables.accounts).toHaveLength(0);        // ← the follow-up: ZERO shells
    expect(simCalls).toHaveLength(0);                 // and nothing was sent
    expect(__tables.transactions).toHaveLength(0);
    expect(storedRaw()).toBeNull();
    // With nothing created, the clean-slate wording is literally true again.
    expect(screen.getByText(/ยังไม่ได้นำเข้าอะไรทั้งสิ้น/)).toBeTruthy();
    expect(screen.queryByText(/เตรียมบัญชีไว้แล้ว/)).toBeNull();
    expect(screen.getByText(/ตัวเลือก IMPORT/)).toBeTruthy();     // plan intact

    spy.mockRestore();
    fireEvent.click(importButton());
    await screen.findByText('Import สำเร็จ!');
    expect(__tables.accounts.map(a => a.name).sort()).toEqual(['Cashbox', 'Wallet']);
    expect(__tables.transactions).toHaveLength(2);
  });

  it('(Z2) the pre-flight record reserves the account ids at full width and never leaks the placeholder', async () => {
    // Fail the group so the pre-flight record stays on disk to be inspected.
    installImportRpcV8({ failPredicate: (call) => call === 1 });
    const { container } = render(
      <CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);
    await uploadCsv(container, MAKE_CSV_2_POCKETS);
    fireEvent.click(importButton());
    await screen.findByText(/Import ไม่สำเร็จ/);

    // By the time the run reaches the RPC the placeholders are gone: the ids
    // write happens as soon as the shells exist, still before the first call.
    const stored = storedRecord();
    const ids = __tables.accounts.map(a => a.id);
    expect(ids).toHaveLength(2);
    expect(stored.rows.map(r => r.account_id).sort()).toEqual([...ids].sort());
    expect(JSON.stringify(stored)).not.toContain('00000000-0000-0000-0000-000000000000');

    // And a record still holding the placeholder (an abort between the two
    // writes) reads back as `account_id: null`, never as an account.
    const slot = slotKeys()[0];
    const padded = JSON.parse(window.localStorage.getItem(slot));
    padded.rows = padded.rows.map(r => ({ ...r, account_id: '00000000-0000-0000-0000-000000000000' }));
    window.localStorage.setItem(slot, JSON.stringify(padded));

    reload();
    await screen.findByText(/มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง/);
    fireEvent.click(screen.getByRole('button', { name: /ตรวจสอบผลอีกครั้ง/ }));
    await screen.findByText(/ยังไม่ได้นำเข้า — กรุณานำเข้าใหม่/);
    expect(__tables.transactions).toHaveLength(0);
  });
});
