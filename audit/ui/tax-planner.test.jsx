// Mounted acceptance for the tax planner (v4.28 · v4.29).
//
// The pure arithmetic is pinned in audit/cases.mjs § D and § E. What only a
// MOUNTED page can prove is the rest of the promise: that the page survives a
// database where the migration has not been run, that typing actually reaches
// the table, that the เดือน/ปี switch changes only how a figure is TYPED, and
// that a failed save is shown rather than swallowed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';

import { TaxPlanner } from '../../src/pages/TaxPlanner.jsx';
import { __tables, __config } from '../mock-supabase.mjs';

const salaryField    = () => screen.getByLabelText('เงินเดือนต่อเดือน');
const whtField       = () => screen.getByLabelText('ภาษีหัก ณ ที่จ่าย');
const slipWhtField   = () => screen.getByLabelText('ภาษีหัก ณ ที่จ่ายต่อเดือน');
const slipSsoField   = () => screen.getByLabelText('ประกันสังคมต่อเดือน');

/** Seed the household and land in the payslip panel (the default for new people). */
async function seedHousehold() {
  render(<TaxPlanner />);
  fireEvent.click(await screen.findByText('เริ่มด้วย อาร์ม + แพท'));
  await screen.findByText('แพท');
}

/** …then switch อาร์ม to the full form. */
async function openFullForm() {
  fireEvent.click(screen.getByText('กรอกแบบละเอียด →'));
  await screen.findByText('ค่าลดหย่อน');
}

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
    await seedHousehold();
    expect(__tables.tax_profiles).toHaveLength(2);
    expect(__tables.tax_profiles[0].is_self).toBe(true);

    // ── Type a salary. ฿150,000/เดือน → ฿1,800,000/ปี ────────────────────
    // ประกันสังคมถูกคำนวณให้เอง ฿10,500 → สุทธิ ฿1,629,500 → ภาษี ฿272,375.
    fireEvent.change(salaryField(), { target: { value: '150000' } });

    // ฿1,800,000 appears in several places at once (household total, the
    // results line) — that is the point.
    expect((await screen.findAllByText('฿1,800,000')).length).toBeGreaterThan(1);
    await waitFor(() => expect(screen.getAllByText('฿1,629,500').length).toBeGreaterThan(0)); // สุทธิ
    expect(screen.getAllByText('฿272,375').length).toBeGreaterThan(0);

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
    expect(screen.getAllByText('฿272,375').length).toBeGreaterThanOrEqual(2); // person + household

    // ── หัก ณ ที่จ่าย flips payable → refund, colour-coded either way ────
    // Typed per MONTH, from the slip: ฿25,000 × 12 = ฿300,000 > ภาษี.
    expect(document.body.textContent).toContain('ต้องจ่ายเพิ่ม');
    fireEvent.change(slipWhtField(), { target: { value: '25000' } });
    await screen.findByText('ขอคืนได้');
    expect(screen.getAllByText('฿27,625').length).toBeGreaterThan(0);
    await waitFor(() => expect(__tables.tax_profiles[0].income.wht).toBe(300000), { timeout: 4000 });
  });

  it('shows deduction headroom priced at the real marginal rate', async () => {
    await seedHousehold();
    fireEvent.change(salaryField(), { target: { value: '150000' } });

    // สุทธิ ฿1,629,500 → ขั้นสูงสุด 25%. SSF ห้องเต็ม ฿200,000 (30% ของ 1.8M
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
    await seedHousehold();
    fireEvent.change(salaryField(), { target: { value: '150000' } });
    await openFullForm();

    // ประกันสังคม starts CALCULATED. Take the manual override, then over-claim
    // it. The typed figure is kept (we do not silently rewrite what the user
    // entered) but the row says what is allowed — and the ceiling is the one
    // derived from ฿17,500 × 5% × 12, not the stale ฿9,000 v4.28 hardcoded.
    fireEvent.click(screen.getByText('กรอกเอง'));
    fireEvent.change(await screen.findByLabelText('จำนวน ประกันสังคม'), { target: { value: '12000' } });

    await screen.findByText(/เกินเพดาน · หักได้ ฿10,500/);
    expect(document.body.textContent).not.toContain('หักได้ ฿9,000');
    // สุทธิ 1,800,000 − 100,000 − 60,000 − 10,500
    await waitFor(() => expect(screen.getAllByText('฿1,629,500').length).toBeGreaterThan(0));

    // …and the amber note says so in words, without blocking anything.
    expect(document.body.textContent).toMatch(/สูงกว่าเพดานทั้งปี ฿10,500/);
    expect(screen.getByLabelText('จำนวน ประกันสังคม').value).toBe('12000');
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

// ── v4.29 · กรอกจากสลิป ─────────────────────────────────────────────────────

describe('วางแผนภาษี · กรอกจากสลิป (v4.29)', () => {
  it('opens on the payslip panel and turns the real slip into a whole year', async () => {
    await seedHousehold();

    // The default view for a new person is the four boxes of a payslip.
    expect(document.body.textContent).toContain('สลิปเงินเดือนของ อาร์ม');
    expect(salaryField()).toBeTruthy();
    expect(slipSsoField()).toBeTruthy();
    expect(slipWhtField()).toBeTruthy();
    expect(screen.getByLabelText('โบนัสทั้งปี')).toBeTruthy();
    // …and the WHT box says where to find it on the slip.
    expect(document.body.textContent).toContain('ในสลิปมักอยู่ในช่อง "อื่นๆ" ของฝั่งรายการหัก');

    // ── The owner's actual slip: มิ.ย. 2569, อเดลล่า กรุ๊ป ───────────────
    fireEvent.change(salaryField(), { target: { value: '90000' } });
    fireEvent.change(slipWhtField(), { target: { value: '5410.42' } });

    // ประกันสังคม was never typed — it is calculated, and it shows its working.
    expect(slipSsoField().value).toBe('875');
    expect(document.body.textContent).toContain('5% ของ ฿17,500 × 12 เดือน = ฿10,500/ปี');

    // Every annual figure was derived, not multiplied by the owner.
    expect(document.body.textContent).toContain('90,000 × 12 = ฿1,080,000');
    await waitFor(() => expect(screen.getAllByText('฿909,500').length).toBeGreaterThan(0));  // สุทธิ
    expect(screen.getAllByText('฿96,900').length).toBeGreaterThan(0);                        // ภาษี
    expect(document.body.textContent).toContain('ต้องจ่ายเพิ่ม');
    expect(screen.getAllByText('฿31,975').length).toBeGreaterThan(0);
    // …and the satang survive the ×12: ฿64,925.04, not ฿64,925.
    expect(document.body.textContent).toContain('5,410.42 × 12 = ฿64,925/ปี');

    // What lands in the table is annual, with the chosen units alongside it.
    await waitFor(() => {
      expect(__tables.tax_profiles[0].income.salaryMonthly).toBe(90000);
      expect(__tables.tax_profiles[0].income.wht).toBe(64925.04);
    }, { timeout: 4000 });
    expect(__tables.tax_profiles[0].income.periods).toEqual({ salary: 'month', wht: 'month' });
    expect(__tables.tax_profiles[0].income.entryMode).toBe('slip');
    expect(__tables.tax_profiles[0].deductions.ssoMode).toBe('auto');
  });

  it('warns — in amber, without blocking — that this slip under-withholds', async () => {
    await seedHousehold();
    fireEvent.change(salaryField(), { target: { value: '90000' } });
    fireEvent.change(slipWhtField(), { target: { value: '5410.42' } });

    await screen.findByText(/หัก ณ ที่จ่ายทั้งปี ฿64,925 น้อยกว่าภาษีที่คำนวณได้ ฿96,900/);
    expect(document.body.textContent).toContain('ต้องจ่ายเพิ่มอีก ฿31,975');
    // Nothing is disabled by a warning — he can keep typing.
    expect(slipWhtField().disabled).toBe(false);

    // Withhold the right amount and the warning goes away by itself.
    fireEvent.change(slipWhtField(), { target: { value: '8075' } });
    await waitFor(() => {
      expect(screen.queryByText(/น้อยกว่าภาษีที่คำนวณได้/)).toBeNull();
    });
  });

  it('switches to the detailed form and back, keeping every figure', async () => {
    await seedHousehold();
    fireEvent.change(salaryField(), { target: { value: '90000' } });

    await openFullForm();
    expect(document.body.textContent).toContain('เงินได้ของ อาร์ม');
    expect(salaryField().value).toBe('90,000');
    expect(document.body.textContent).toContain('เงินเดือน 90,000 × 12 = ฿1,080,000');
    await waitFor(() => expect(__tables.tax_profiles[0].income.entryMode).toBe('full'), { timeout: 4000 });

    fireEvent.click(screen.getByText('← กลับไปกรอกจากสลิป'));
    await screen.findByText('สลิปเงินเดือนของ อาร์ม');
    expect(salaryField().value).toBe('90,000');
  });
});

describe('วางแผนภาษี · สวิตช์ เดือน/ปี (v4.29)', () => {
  it('changes only how a figure is typed — never what it means', async () => {
    await seedHousehold();
    fireEvent.change(salaryField(), { target: { value: '90000' } });
    await openFullForm();

    // The salary box came from the slip, so it is in เดือน.
    expect(screen.getByLabelText('เงินเดือน เป็นรายเดือน').getAttribute('aria-pressed')).toBe('true');
    expect(salaryField().value).toBe('90,000');

    // Flip it to ปี: the SAME money, shown as the annual figure.
    fireEvent.click(screen.getByLabelText('เงินเดือน เป็นรายปี'));
    await waitFor(() => expect(salaryField().value).toBe('1,080,000'));
    expect(document.body.textContent).toContain('1,080,000 ÷ 12 = ฿90,000/เดือน');
    // Nothing moved in the database except the chosen unit.
    await waitFor(() => {
      expect(__tables.tax_profiles[0].income.salaryMonthly).toBe(90000);
      expect(__tables.tax_profiles[0].income.periods.salary).toBe('year');
    }, { timeout: 4000 });

    // Typing in ปี stores the monthly figure — the division is the app's job.
    fireEvent.change(salaryField(), { target: { value: '1200000' } });
    await waitFor(() => expect(__tables.tax_profiles[0].income.salaryMonthly).toBe(100000), { timeout: 4000 });

    // …and the unit survives a reload of the page (which also reopens on the
    // detailed form, because that is the panel he was last using).
    cleanup();
    render(<TaxPlanner />);
    await screen.findByText('ค่าลดหย่อน');
    expect(screen.getByLabelText('เงินเดือน เป็นรายปี').getAttribute('aria-pressed')).toBe('true');
    expect(salaryField().value).toBe('1,200,000');
  });

  it('gives the monthly-paid deduction rows the same switch', async () => {
    await seedHousehold();
    fireEvent.change(salaryField(), { target: { value: '90000' } });
    await openFullForm();

    fireEvent.click(screen.getByLabelText('ใช้ลดหย่อน ประกันชีวิตตนเอง'));
    fireEvent.click(await screen.findByLabelText('ประกันชีวิตตนเอง เป็นรายเดือน'));
    fireEvent.change(screen.getByLabelText('จำนวน ประกันชีวิตตนเอง'), { target: { value: '2500' } });

    await screen.findByText('2,500 × 12 = ฿30,000/ปี');
    await waitFor(() => {
      expect(__tables.tax_profiles[0].deductions.lifeInsurance).toBe(30000);
      expect(__tables.tax_profiles[0].deductions.periods.lifeInsurance).toBe('month');
    }, { timeout: 4000 });

    // คู่สมรส is a lump-sum allowance, never a monthly payment — no switch.
    expect(screen.queryByLabelText('คู่สมรสไม่มีเงินได้ เป็นรายเดือน')).toBeNull();
  });
});

describe('วางแผนภาษี · ประกันสังคมคำนวณให้ (v4.29)', () => {
  it('derives it from the salary, lets him override, and offers คำนวณใหม่', async () => {
    await seedHousehold();
    fireEvent.change(salaryField(), { target: { value: '90000' } });
    await openFullForm();

    // Calculated, with the formula on screen — no magic ฿10,500.
    expect(document.body.textContent).toContain('คำนวณให้จากเงินเดือน · 5% ของ ฿17,500 × 12 เดือน');
    expect(screen.getAllByText('฿10,500').length).toBeGreaterThan(0);

    // Override wins the moment he types.
    fireEvent.click(screen.getByText('กรอกเอง'));
    fireEvent.change(await screen.findByLabelText('จำนวน ประกันสังคม'), { target: { value: '9000' } });
    await screen.findByText('กรอกเอง (ทับค่าที่คำนวณ)');
    await waitFor(() => {
      expect(__tables.tax_profiles[0].deductions.socialSecurity).toBe(9000);
      expect(__tables.tax_profiles[0].deductions.ssoMode).toBe('manual');
    }, { timeout: 4000 });

    // …and one link puts it back.
    fireEvent.click(screen.getByText('คำนวณใหม่'));
    await waitFor(() => expect(__tables.tax_profiles[0].deductions.ssoMode).toBe('auto'), { timeout: 4000 });
    expect(screen.queryByText('กรอกเอง (ทับค่าที่คำนวณ)')).toBeNull();
  });

  it('lets him edit the government parameters, and says they need checking', async () => {
    await seedHousehold();
    fireEvent.change(salaryField(), { target: { value: '90000' } });
    await openFullForm();

    fireEvent.click(screen.getByText('เกณฑ์ประกันสังคม'));
    const ceiling = await screen.findByLabelText('ฐานค่าจ้างสูงสุดของประกันสังคม');
    expect(ceiling.value).toBe('17,500');
    expect(screen.getByLabelText('อัตราประกันสังคมเป็นเปอร์เซ็นต์').value).toBe('5');
    expect(document.body.textContent).toMatch(/พารามิเตอร์ที่รัฐกำหนดและเปลี่ยนได้/);
    expect(document.body.textContent).toMatch(/ตรวจกับประกาศของสำนักงานประกันสังคมทุกปีก่อนยื่น/);

    // Part of a year: joined in June, seven months of contributions.
    fireEvent.change(screen.getByLabelText('จำนวนเดือนที่ส่งเงินสมทบ'), { target: { value: '7' } });
    await screen.findByText('คำนวณให้จากเงินเดือน · 5% ของ ฿17,500 × 7 เดือน');
    expect(screen.getAllByText('฿6,125').length).toBeGreaterThan(0);
  });
});

describe('วางแผนภาษี · a v4.28 row still means what it meant', () => {
  it('opens the detailed form, keeps the typed ประกันสังคม, and reads ปี everywhere', async () => {
    // Exactly the shape v4.28 wrote: no `periods`, no `ssoMode`, no entryMode.
    __tables.tax_profiles = [{
      id: 'legacy-1', user_id: 'u1', tax_year: new Date().getFullYear(),
      person_name: 'อาร์ม', is_self: true, sort_order: 0,
      income: { salaryMonthly: 150000, bonus: 300000, wht: 180000 },
      deductions: { ssf: 200000, rmf: 300000, socialSecurity: 9000 },
      notes: null,
    }];

    render(<TaxPlanner />);
    await screen.findByText('เงินได้ของ อาร์ม');       // …the FULL form, not the slip panel

    // The salary box was always monthly; the WHT box was always annual.
    expect(salaryField().value).toBe('150,000');
    expect(whtField().value).toBe('180,000');
    expect(screen.getByLabelText('เงินเดือน เป็นรายเดือน').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('ภาษีหัก ณ ที่จ่าย เป็นรายปี').getAttribute('aria-pressed')).toBe('true');

    // ประกันสังคม is NOT recalculated behind his back — ฿9,000 stays ฿9,000,
    // even though the calculator would have said ฿10,500.
    expect(screen.getByLabelText('จำนวน ประกันสังคม').value).toBe('9,000');
    expect(document.body.textContent).not.toContain('คำนวณให้จากเงินเดือน');

    // …so the whole return is bit-for-bit what v4.28 showed him.
    expect(screen.getAllByText('฿1,431,000').length).toBeGreaterThan(0);  // สุทธิ
    expect(screen.getAllByText('฿222,750').length).toBeGreaterThan(0);    // ภาษี
    expect(screen.getAllByText('฿42,750').length).toBeGreaterThan(0);     // ต้องจ่ายเพิ่ม
  });
});

describe('วางแผนภาษี · a failed save is never silent', () => {
  it('surfaces the error in Thai and keeps the patch for a retry', async () => {
    await seedHousehold();

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
