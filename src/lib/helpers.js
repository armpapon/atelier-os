// Account/alert tone swatches. `amber` tracks the palette's --amber alias, which
// True Cupertino repointed from clay to iOS system blue; the rest stay as the
// user-pickable tone data they always were.
export function toneColor(tone) {
  return {
    profit: '#6cbf83', loss: '#e07a6e', amber: '#007aff',
    blue: '#7ba7d4', violet: '#a78fcc', rose: '#d49aa5',
  }[tone] || '#007aff';
}

export function thumbBg(src) {
  switch (src) {
    case 'YOUTUBE': return 'linear-gradient(135deg, #2a1a1f, #1a1714)';
    case 'UDEMY':   return 'linear-gradient(135deg, #1a2a3a, #15202b)';
    case 'PODCAST': return 'linear-gradient(135deg, #2a1f3a, #1f1a2a)';
    case 'BLOG':    return 'linear-gradient(135deg, #2a2620, #1a1714)';
    default: return 'var(--bg-2)';
  }
}
