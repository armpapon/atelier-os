export function Icon({ name, size = 16, strokeWidth = 1.7, style }) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    // Icons sit inline in prose as often as they sit in flex rows: the optical
    // shift keeps a glyph on the text baseline, and flex containers ignore it.
    style: { verticalAlign: '-0.15em', flex: 'none', ...style },
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

    // ── Status & feedback (v4.56 — replaces the ⚠️ ✅ ❌ ⛔ ℹ️ emoji markers) ──
    case 'warning':    return <svg {...props}><path d="M12 4.2 21 19.5H3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/></svg>;
    case 'help':       return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.7.6-.7 1.1v.6"/><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"/></svg>;
    case 'x':          return <svg {...props}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case 'ban':        return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>;
    case 'flag':       return <svg {...props}><path d="M5 21V4"/><path d="M5 5h11l-2 3.5L16 12H5z"/></svg>;
    case 'bulb':       return <svg {...props}><path d="M9 17h6"/><path d="M10 20.5h4"/><path d="M12 3a6 6 0 0 0-3.4 10.9c.5.4.9 1 .9 1.6h5c0-.6.4-1.2.9-1.6A6 6 0 0 0 12 3z"/></svg>;
    case 'bolt':       return <svg {...props}><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>;
    case 'star':       return <svg {...props}><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/></svg>;
    case 'flame':      return <svg {...props}><path d="M12 3c3 3.4 5.5 5.6 5.5 9a5.5 5.5 0 0 1-11 0c0-1.7.7-3 1.8-4.3.3 1.2 1 2 2 2.3C10.5 7.6 11 5.2 12 3z"/></svg>;
    case 'gem':        return <svg {...props}><path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3l-3 6 6 12 6-12-3-6"/></svg>;
    case 'gift':       return <svg {...props}><rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M3 12.5h18M12 8v13"/><path d="M12 8c-3.5 0-5-1-5-2.5S8.5 3 12 8zM12 8c3.5 0 5-1 5-2.5S15.5 3 12 8z"/></svg>;

    // ── Actions ───────────────────────────────────────────────────────────
    case 'save':       return <svg {...props}><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7V3M8 21v-6h8v6"/></svg>;
    case 'edit':       return <svg {...props}><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5 16.5 9.5"/></svg>;
    case 'trash':      return <svg {...props}><path d="M4 6.5h16"/><path d="M9 6.5V4h6v2.5"/><path d="M6.5 6.5 7.5 21h9l1-14.5"/></svg>;
    case 'refresh':    return <svg {...props}><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4h-4"/></svg>;
    case 'gear':       return <svg {...props}><circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 0 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z"/></svg>;
    case 'download':   return <svg {...props}><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/><path d="M12 4v12M7.5 11.5 12 16l4.5-4.5"/></svg>;
    case 'import':     return <svg {...props}><path d="M3 7.5V19a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8H12L9.5 5H4a1 1 0 0 0-1 1z"/></svg>;
    case 'pause':      return <svg {...props}><path d="M9 5v14M15 5v14"/></svg>;
    case 'transfer':   return <svg {...props}><path d="M4 8.5h13M13.5 5 17 8.5 13.5 12"/><path d="M20 15.5H7M10.5 12 7 15.5 10.5 19"/></svg>;
    case 'link':       return <svg {...props}><path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1.4 1.4"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0L5 13.3a4 4 0 1 0 5.7 5.7l1.4-1.4"/></svg>;
    case 'lock':       return <svg {...props}><rect x="4.5" y="10" width="15" height="11" rx="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
    case 'eye':        return <svg {...props}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'eye-off':    return <svg {...props}><path d="M4 4l16 16"/><path d="M9.9 5.9A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.5 4.2"/><path d="M6.3 8A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1 0 2-.2 2.8-.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>;

    // ── Objects & places ──────────────────────────────────────────────────
    case 'chart':      return <svg {...props}><path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 17v-5M12.5 17V7.5M17 17v-8"/></svg>;
    case 'clipboard':  return <svg {...props}><rect x="5" y="4.5" width="14" height="16.5" rx="1.5"/><path d="M9 4.5V3.2A1.2 1.2 0 0 1 10.2 2h3.6A1.2 1.2 0 0 1 15 3.2v1.3z"/><path d="M8.5 11h7M8.5 15h5"/></svg>;
    case 'file':       return <svg {...props}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 16.5h4"/></svg>;
    case 'archive':    return <svg {...props}><rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M4.8 8.5V19a1 1 0 0 0 1 1h12.4a1 1 0 0 0 1-1V8.5"/><path d="M10 12h4"/></svg>;
    case 'card':       return <svg {...props}><rect x="2.5" y="5" width="19" height="14" rx="2.2"/><path d="M2.5 10h19M6 15h3"/></svg>;
    case 'bank':       return <svg {...props}><path d="M3 9.5 12 4l9 5.5"/><path d="M5 9.5V18M9.7 9.5V18M14.3 9.5V18M19 9.5V18"/><path d="M3 20.5h18"/></svg>;
    case 'building':   return <svg {...props}><path d="M4 21V4.5A1.5 1.5 0 0 1 5.5 3h8A1.5 1.5 0 0 1 15 4.5V21"/><path d="M15 10h3.5A1.5 1.5 0 0 1 20 11.5V21"/><path d="M3 21h18"/><path d="M7.5 7h4M7.5 11h4M7.5 15h4"/></svg>;
    case 'camera':     return <svg {...props}><path d="M3 8.5h3.5L8 6h8l1.5 2.5H21V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>;
    case 'mail':       return <svg {...props}><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>;
    case 'pin':        return <svg {...props}><path d="M14.5 2.5 21.5 9.5l-3.2.6-3.4 3.4.5 4-8.9-8.9 4-.5 3.4-3.4z"/><path d="m7.5 16.5-4 4"/></svg>;
    case 'location':   return <svg {...props}><path d="M12 21.5S5 15 5 10a7 7 0 1 1 14 0c0 5-7 11.5-7 11.5z"/><circle cx="12" cy="10" r="2.6"/></svg>;
    case 'globe':      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>;
    case 'route':      return <svg {...props}><circle cx="6" cy="6.5" r="2.5"/><circle cx="18" cy="17.5" r="2.5"/><path d="M8.5 6.5H14a3.5 3.5 0 0 1 0 7h-4a3.5 3.5 0 0 0 0 7h5.5"/></svg>;
    case 'users':      return <svg {...props}><circle cx="9.5" cy="8" r="3.3"/><path d="M3 20c0-3.6 2.9-6.5 6.5-6.5S16 16.4 16 20"/><path d="M16.5 5.2a3.3 3.3 0 0 1 0 6.4M17.5 13.9c2 .7 3.5 2.6 3.5 5"/></svg>;
    case 'user':       return <svg {...props}><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-4 3.4-7 7.5-7s7.5 3 7.5 7"/></svg>;
    case 'checkbox':   return <svg {...props}><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="m8.5 12 2.5 2.5L16 9.5"/></svg>;
    case 'history':    return <svg {...props}><path d="M3.5 12a8.5 8.5 0 1 0 2.7-6.2"/><path d="M3.5 4.5V9H8"/><path d="M12 7.5V12l3 1.8"/></svg>;
    case 'clock':      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 6.8V12l3.4 2"/></svg>;

    // ── Family & health ───────────────────────────────────────────────────
    case 'health':     return <svg {...props}><path d="M12 20.5S4 14.8 4 9.7A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8 3.3c0 5.1-8 10.8-8 10.8z"/></svg>;
    case 'ruler':      return <svg {...props}><rect x="2.5" y="8.5" width="19" height="7" rx="1.2"/><path d="M6.5 8.5v3M10 8.5v4M13.5 8.5v3M17 8.5v4"/></svg>;
    case 'scale':      return <svg {...props}><path d="M12 4v16M7 20h10"/><path d="M4 9h16M6.5 8 4 14h5zM17.5 8 15 14h5z"/></svg>;
    case 'drop':       return <svg {...props}><path d="M12 3.5c3 3.8 5 6.3 5 8.8a5 5 0 0 1-10 0c0-2.5 2-5 5-8.8z"/></svg>;
    case 'pill':       return <svg {...props}><rect x="2.8" y="8.5" width="18.4" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9 9l6 6"/></svg>;
    case 'syringe':    return <svg {...props}><path d="m14 4 6 6M17.5 6.5 12 12"/><path d="m10.5 7.5 6 6L11 19H5.5v-5.5z"/><path d="m4 20 2.5-2.5"/></svg>;
    case 'shield':     return <svg {...props}><path d="M12 3 5 6v6c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6z"/></svg>;
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
