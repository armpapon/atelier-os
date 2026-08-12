export function Icon({ name, size = 16, strokeWidth = 1.7 }) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (name) {
    // ── Shell chrome ──────────────────────────────────────────────────────
    case 'menu':       return <svg {...props}><path d="M4 6.5h16M4 12h16M4 17.5h16"/></svg>;
    case 'moon':       return <svg {...props}><path d="M21 13A8.5 8.5 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg>;
    case 'sun':        return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
    case 'more':       return <svg {...props}><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>;
    case 'sign-out':   return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>;
    case 'home':       return <svg {...props}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>;
    case 'trade':      return <svg {...props}><path d="M3 18l5-6 4 4 8-10"/><path d="M14 6h6v6"/></svg>;
    case 'book':       return <svg {...props}><path d="M4 4h7a3 3 0 0 1 3 3v13"/><path d="M20 4h-7a3 3 0 0 0-3 3v13"/></svg>;
    case 'journal':    return <svg {...props}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>;
    case 'money':      return <svg {...props}><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/></svg>;
    case 'family':     return <svg {...props}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M14 20c.4-2.2 2-4 4-4s3 1 3 2.5"/></svg>;
    case 'target':     return <svg {...props}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>;
    case 'brain':      return <svg {...props}><path d="M9 4a3 3 0 0 0-3 3v0a3 3 0 0 0-2 5v0a3 3 0 0 0 2 5v0a3 3 0 0 0 3 3"/><path d="M15 4a3 3 0 0 1 3 3v0a3 3 0 0 1 2 5v0a3 3 0 0 1-2 5v0a3 3 0 0 1-3 3"/><path d="M9 4v16M15 4v16"/></svg>;
    case 'spark':      return <svg {...props}><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z"/></svg>;
    case 'plus':       return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'search':     return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>;
    case 'filter':     return <svg {...props}><path d="M3 6h18M6 12h12M10 18h4"/></svg>;
    case 'arrow-up':   return <svg {...props}><path d="M12 19V5M5 12l7-7 7 7"/></svg>;
    case 'arrow-down': return <svg {...props}><path d="M12 5v14M5 12l7 7 7-7"/></svg>;
    case 'chevron':    return <svg {...props}><path d="M9 6l6 6-6 6"/></svg>;
    case 'play':       return <svg {...props}><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>;
    case 'check':      return <svg {...props}><path d="M5 12l5 5L20 7"/></svg>;
    case 'calendar':   return <svg {...props}><rect x="4" y="5" width="16" height="16" rx="1"/><path d="M4 9h16M8 3v4M16 3v4"/></svg>;
    case 'mood':       return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M8 15c1 1.3 2.4 2 4 2s3-.7 4-2"/></svg>;
    case 'tweak':      return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M12 1v6M12 17v6M4.2 4.2l4.3 4.3M15.5 15.5l4.3 4.3M1 12h6M17 12h6M4.2 19.8l4.3-4.3M15.5 8.5l4.3-4.3"/></svg>;
    case 'hourglass':  return <svg {...props}><path d="M6 3h12M6 21h12M8 3v3.5l4 4 4-4V3M8 21v-3.5l4-4 4 4V21"/></svg>;
    case 'work':       return <svg {...props}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/></svg>;
    case 'tax':        return <svg {...props}><path d="M6 3h9l4 4v14H6z"/><path d="M9 16.5 15 9.5"/><circle cx="9.6" cy="10.1" r="1.1"/><circle cx="14.4" cy="15.9" r="1.1"/></svg>;
    default: return null;
  }
}

/**
 * Square icon button for shell chrome (sidebar header, mobile sheet, the
 * floating cluster shown when the sidebar is collapsed). Ghost by default,
 * fills with --fill-2 on hover.
 */
export function IconButton({ icon, label, onClick, size = 30, iconSize = 17 }) {
  return (
    <button
      onClick={onClick} title={label} aria-label={label}
      className="focus-ring"
      style={{
        width: size, height: size, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 0, borderRadius: 9,
        color: 'var(--text-secondary)', cursor: 'pointer',
        transition: 'background 150ms, color 150ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--fill-2)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
      <Icon name={icon} size={iconSize} strokeWidth={1.8} />
    </button>
  );
}
