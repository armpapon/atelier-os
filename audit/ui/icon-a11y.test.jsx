// Mounted acceptance for icon accessibility (v4.57 · audit A11 Major 1).
//
// A11 found three icon-only controls whose accessible name computed to "" once
// their `×` / `👁` text was replaced by an unnamed <svg>. A static grep cannot
// prove the fix: the accessible name is the product of the AccName algorithm
// over the RENDERED tree, so these cases mount the real components and ask for
// the control BY ITS NAME. If someone drops an aria-label, or lets <Icon> stop
// being aria-hidden and start leaking its own text into the name, the query
// finds nothing and the test fails.
//
// Proven here:
//   1. <Icon> is decorative by default — aria-hidden, not focusable, and it
//      contributes nothing to an ancestor's accessible name.
//   2. <Icon label> flips to role="img" + aria-label and DOES contribute.
//   3. TweaksPanel's close button is reachable as "ปิด".
//   4. TradeForm's close button is reachable as "ปิดฟอร์ม Trade".
//   5. The importer's PDF-password reveal is named for the state it moves TO,
//      and that name + aria-pressed both flip on click.
//   6. The Tweaks launcher in the app shell has EXACTLY ONE name (v4.58): the
//      r1 sweep added a second aria-label without removing the first, which
//      made the build warn and left the source ambiguous about which wins.
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// The app shell renders behind an auth gate and asks the platform for a media
// query; both are stubbed so the Tweaks launcher is actually reachable.
vi.mock('../../src/lib/useAuth.js', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'armpapon@gmail.com' },
    loading: false, passwordRecovery: false, clearPasswordRecovery: () => {},
  }),
}));
beforeAll(() => {
  window.matchMedia = window.matchMedia || (q => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
});

import { Icon } from '../../src/components/Icon.jsx';
import { TweaksPanel } from '../../src/components/TweaksPanel.jsx';
import { TradeForm } from '../../src/components/TradeForm.jsx';
import { CSVImporter } from '../../src/components/CSVImporter.jsx';
import App from '../../src/App.jsx';

afterEach(cleanup);

describe('ไอคอน · การเข้าถึงด้วย screen reader (v4.57)', () => {

  it('is decorative by default, so it never pollutes a control name', () => {
    const { container } = render(
      <button aria-label="รีเฟรช"><Icon name="refresh" size={15} /></button>,
    );
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('role')).toBeNull();
    // The name comes from the button, and ONLY from the button.
    expect(screen.getByRole('button', { name: 'รีเฟรช' })).toBeTruthy();
  });

  it('becomes an img with a name when the icon IS the message', () => {
    const { container } = render(<Icon name="pin" size={11} label="ปักหมุดไว้" />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('ปักหมุดไว้');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(screen.getByRole('img', { name: 'ปักหมุดไว้' })).toBeTruthy();
  });

  it('gives the Tweaks close button a name, not an empty <svg>', () => {
    render(
      <TweaksPanel open onClose={() => {}} accent="blue" setAccent={() => {}}
        density="comfortable" setDensity={() => {}} active="dashboard"
        setActive={() => {}} user={{ email: 'a@b.c' }} />,
    );
    expect(screen.getByRole('button', { name: 'ปิด' })).toBeTruthy();
  });

  it('gives the Trade form close button a name of its own', () => {
    render(<TradeForm open onClose={() => {}} onSaved={() => {}} />);
    // "ปิด" alone would also match a stray generic close — ask for the real one.
    expect(screen.getByRole('button', { name: 'ปิดฟอร์ม Trade' })).toBeTruthy();
  });

  it('names the PDF-password reveal for the state it moves to, and flips both', async () => {
    render(<CSVImporter scope="personal" debts={[]} onImported={() => {}} onClose={() => {}} />);

    // Reach the PDF pane, where the password field lives.
    fireEvent.click(await screen.findByText(/PDF Statement/));

    const show = await screen.findByRole('button', { name: 'แสดงรหัส' });
    expect(show.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(show);

    const hide = await screen.findByRole('button', { name: 'ซ่อนรหัส' });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    // and the old name is gone — the control renamed itself, it did not duplicate
    expect(screen.queryByRole('button', { name: 'แสดงรหัส' })).toBeNull();
  });

  it('names the Tweaks launcher exactly once, with the name we chose', async () => {
    render(<App />);
    // pinned: r1 shipped BOTH "เปิดแผง Tweaks" and "เปิด Tweaks" on this button
    const btn = await screen.findByRole('button', { name: 'เปิดแผง Tweaks' });
    expect(btn.getAttribute('aria-label')).toBe('เปิดแผง Tweaks');
    expect(screen.queryByRole('button', { name: 'เปิด Tweaks' })).toBeNull();
  });
});
