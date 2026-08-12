// Mounted acceptance for the tax planner (v4.28).
//
// The pure arithmetic is pinned in audit/cases.mjs § D. What only a MOUNTED
// page can prove is the rest of the promise: that the page survives a database
// where the migration has not been run, that typing actually reaches the
// table, and that a failed save is shown rather than swallowed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

import { TaxPlanner } from '../../src/pages/TaxPlanner.jsx';
import { __tables, __config } from '../mock-supabase.mjs';

const salaryField = () => screen.getByLabelText('เงินเดือนต่อเดือน');
const whtField    = () => screen.getByLabelText('ภาษีหัก ณ ที่จ่าย');

beforeEach(() => {
  cleanup();
  for (const k of Object.keys(__tables)) __tables[k] = [];
  __config.rpcHandlers = {};
  __config.missingColumns = {};
  __config.opFailures = {};
  __config.opFailurePredicate = null;
  vi.stubGlobal('matchMedia', (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => { __config.opFailures = {}; });

describe('วางแผนภาษี · the SQL has not been run yet', () => {
  it('shows the Thai "ยังไม่ได้รันไฟล์ SQL" state instead of crashing', async () => {
    const saved = __tables.tax_profiles;
    delete __tables.tax_profiles;              // exactly production before the migration
    try {
      render(<TaxPlanner />);
      const card = await screen.findByText(/ยังไม่ได้รันไฟล์ SQL/);
      expect(card).toBeTruthy();
      expect(document.body.textContent).toContain('migration_add_tax_planner.sql');
      expect(document.body.textContent).toContain('loop_tax_planner');
      // …and it says the rest of the app is fine, so nobody panics.
      expect(document.body.textContent).toContain('หน้าอื่นในแอปใช้งานได้ตามปกติ');
      // No empty-state CTA that would only produce another error.
      expect(screen.queryByText('เริ่มด้วย อาร์ม + แพท')).toBeNull();
    } finally {
      __tables.tax_profiles = saved || [];
    }
  });
});

describe('วางแผนภาษี · filling it in for the household', () => {
  it('seeds อาร์ม + แพท, computes live, autosaves, and totals the household', async () => {
    render(<TaxPlanner />);

    fireEvent.click(await screen.findByText('เริ่มด้วย อาร์ม + แพท'));
    await screen.findByText('แพท');
    expect(__tables.tax_profiles).toHaveLength(2);
    expect(__tables.tax_profiles[0].is_self).toBe(true);

    // ── Type a salary. ฿150,000/เดือน → ฿1,800,000/ปี → ภาษี ฿275,000 ────
    fireEvent.change(salaryField(), { target: { value: '150000' } });

    // ฿1,800,000 appears in several places at once (household total, the
    // card meta, the ×12 hint, the results line) — that is the point.
    expect((await screen.findAllByText('฿1,800,000')).length).toBeGreaterThan(1);
    await waitFor(() => expect(screen.getAllByText('฿1,640,000').length).toBeGreaterThan(0)); // สุทธิ
    expect(screen.getAllByText('฿275,000').length).toBeGreaterThan(0);

    // The bracket breakdown is shown line by line, not as one number.
    expect(document.body.textContent).toContain('ภาษีตามขั้นบันได');
    expect(document.body.textContent).toContain('฿1,000,000–฿2,000,000');

    // ── The autosave actually reaches the table ─────────────────────────
    await waitFor(() => {
      expect(__tables.tax_profiles[0].income.salaryMonthly).toBe(150000);
    }, { timeout: 4000 });
    await screen.findByText('บันทึกแล้ว ✓');

    // ── Household total = everyone's tax, แพท still at zero ─────────────
    expect(document.body.textContent).toContain('รวมทั้งบ้าน');
    expect(screen.getAllByText('฿275,000').length).toBeGreaterThanOrEqual(2); // person + household

    // ── หัก ณ ที่จ่าย flips payable → refund, colour-coded either way ────
    expect(document.body.textContent).toContain('ต้องจ่ายเพิ่ม');
    fireEvent.change(whtField(), { target: { value: '300000' } });
    await screen.findByText('ขอคืนได้');
    expect(screen.getAllByText('฿25,000').length).toBeGreaterThan(0);
  });

  it('shows deduction headroom priced at the real marginal rate', async () => {
    render(<TaxPlanner />);
    fireEvent.click(await screen.findByText('เริ่มด้วย อาร์ม + แพท'));
    await screen.findByText('แพท');
    fireEvent.change(salaryField(), { target: { value: '150000' } });

    // สุทธิ ฿1,640,000 → ขั้นสูงสุด 25%. SSF ห้องเต็ม ฿200,000 (30% ของ 1.8M
    // ไม่บีบ, เพดานรวมเกษียณยังว่าง) → ประหยัดจริง ฿50,000.
    await screen.findByText(/ขั้นภาษีสูงสุดที่เสียอยู่คือ 25%/);
    await waitFor(() => {
      expect(document.body.textContent).toContain('SSF เพิ่มได้อีก ฿200,000');
    });
    expect(document.body.textContent).toContain('ประหยัด ~฿50,000');
    // Every headroom line is priced, and the biggest saving leads.
    expect(document.body.textContent).toContain('RMF เพิ่มได้อีก ฿500,000');
    expect(document.body.textContent).toContain('ประหยัด ~฿125,000');

    // Informational, never a product pitch: the only occurrence of the phrase
    // "แนะนำให้ซื้อ" on the page is the one negating it.
    const body = document.body.textContent;
    expect(body).toMatch(/ไม่ใช่คำแนะนำให้ซื้อผลิตภัณฑ์ใด/);
    expect(body).not.toMatch(/ควรซื้อ/);
    expect(body.match(/แนะนำให้ซื้อ/g)).toHaveLength(1);
    expect(body).not.toMatch(/(?<!ไม่ใช่คำ)แนะนำให้ซื้อ/);
  });

  it('enforces a cap in the UI and says how much is actually deductible', async () => {
    render(<TaxPlanner />);
    fireEvent.click(await screen.findByText('เริ่มด้วย อาร์ม + แพท'));
    await screen.findByText('แพท');
    fireEvent.change(salaryField(), { target: { value: '150000' } });

    // Tick ประกันสังคม, then over-claim it. The typed figure is kept (we do not
    // silently rewrite what the user entered) but the row says what is allowed.
    fireEvent.click(screen.getByLabelText('ใช้ลดหย่อน ประกันสังคม'));
    fireEvent.change(screen.getByLabelText('จำนวน ประกันสังคม'), { target: { value: '12000' } });

    await screen.findByText(/เกินเพดาน · หักได้ ฿9,000/);
    // สุทธิ 1,640,000 − 9,000
    await waitFor(() => expect(screen.getAllByText('฿1,631,000').length).toBeGreaterThan(0));
  });

  it('the permanent honesty note is always on the page', async () => {
    render(<TaxPlanner />);
    await screen.findByText(/ยังไม่มีใครในปีภาษี/);
    expect(document.body.textContent).toMatch(/ต้องตรวจสอบกับกรมสรรพากรของปีภาษีที่จะยื่นทุกครั้ง/);
    expect(document.body.textContent).toMatch(/แต่ละคนต้องยื่นตามเงินได้ที่ตัวเองได้รับจริง/);
    // Year-specific schemes are named as the user's job, not the app's.
    expect(document.body.textContent).toContain('Easy E-Receipt');
  });
});

describe('วางแผนภาษี · a failed save is never silent', () => {
  it('surfaces the error in Thai and keeps the patch for a retry', async () => {
    render(<TaxPlanner />);
    fireEvent.click(await screen.findByText('เริ่มด้วย อาร์ม + แพท'));
    await screen.findByText('แพท');

    __config.opFailures['update:tax_profiles'] = 1;
    fireEvent.change(salaryField(), { target: { value: '80000' } });

    await screen.findByText(/บันทึกไม่สำเร็จ/, {}, { timeout: 4000 });
    expect(__tables.tax_profiles[0].income?.salaryMonthly).toBeUndefined();

    // The unsent patch survived — retrying resends it, and it lands.
    fireEvent.click(screen.getByText('ลองบันทึกอีกครั้ง'));
    await waitFor(() => {
      expect(__tables.tax_profiles[0].income.salaryMonthly).toBe(80000);
    }, { timeout: 4000 });
    await screen.findByText('บันทึกแล้ว ✓');
  });
});
