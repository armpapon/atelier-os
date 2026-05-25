export function toneColor(tone) {
  return {
    profit: '#6cbf83', loss: '#e07a6e', amber: '#d4a574',
    blue: '#7ba7d4', violet: '#a78fcc', rose: '#d49aa5',
  }[tone] || '#d4a574';
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
