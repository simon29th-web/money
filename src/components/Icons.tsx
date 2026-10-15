import React from 'react';
import { TxnType } from '../ml/categorizer';
import { ST_LABEL, TxnStatus } from '../utils/ledgerCore';

const SV = (children: React.ReactNode, strokeWidth = 1.8) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const ICON = {
  ledger: SV(<path d="M3 5.5C5.5 4 9 4 12 6c3-2 6.5-2 9-.5V19c-2.5-1.5-6-1.5-9 .5-3-2-6.5-2-9-.5zM12 6v13.5" />),
  chart: SV(<path d="M5 20V11M12 20V5M19 20v-7" />),
  camera: SV(<path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />),
  save: SV(<path d="M12 3v3M5 9h14l-1 10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM9 13h6" />),
  doc: SV(<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6" />),
  shield: SV(<path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6z" />),
  shieldck: SV(<path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5" />),
  plus: SV(<path d="M12 5v14M5 12h14" />, 2.2),
  left: SV(<path d="M15 6l-6 6 6 6" />, 2),
  right: SV(<path d="M9 6l6 6-6 6" />, 2),
  x: SV(<path d="M6 6l12 12M18 6L6 18" />, 2),
  search: SV(
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  sort: SV(<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />),
  download: SV(<path d="M12 4v11M7 11l5 5 5-5M5 20h14" />),
  copy: SV(
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h8" />
    </>
  ),
  expand: SV(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />),
  pen: SV(<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />),
  flag: SV(<path d="M5 21V4M5 4h11l-2 4 2 4H5" />),
  trash: SV(<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6" />),
  clock: SV(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  alert: SV(<path d="M12 4l9 16H3zM12 10v4M12 17h.01" />),
  checkc: SV(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  check: SV(<path d="M5 12l5 5 9-10" />, 2.4),
  dot: SV(<circle cx="12" cy="12" r="3" fill="currentColor" />),
  building: SV(
    <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M4 21h16M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
  ),
  tag: SV(<path d="M3 12V4h8l10 10-8 8zM7.5 8h.01" />),
  card: SV(
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  home: SV(<path d="M4 11l8-7 8 7v9H4zM10 20v-6h4v6" />),
  cup: SV(<path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M12 3v2" />),
  plane: SV(
    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
  ),
  book: SV(<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11" />),
  bolt: SV(<path d="M13 3L5 14h6l-1 7 8-11h-6z" />),
  bag: SV(<path d="M6 8h12l1 12H5zM9 8V6a3 3 0 0 1 6 0v2" />),
  cross: SV(<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" />),
  box: SV(<path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8" />),
  users: SV(
    <path d="M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1a3 3 0 0 0-2-2.8M16 4.3a3.5 3.5 0 0 1 0 6.4" />
  ),
  truck: SV(
    <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7zM7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
  ),
  down: SV(<path d="M17 7L7 17M7 9v8h8" />, 2),
  cpu: SV(
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  sun: SV(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  moon: SV(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />),
  columns: SV(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </>
  ),
  sparkles: SV(
    <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" />
  ),
  soundOn: SV(
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </>
  ),
  soundOff: SV(
    <>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </>
  ),
  fire: SV(
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  trophy: SV(
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.45 1-1 1H7v4h10v-4h-2c-.55 0-1-.45-1-1v-2.34" />
      <path d="M6 4h12v7a6 6 0 0 1-12 0V4z" />
    </>
  ),
};

const CAT_ICON: Record<string, keyof typeof ICON> = {
  Rent: 'home',
  Food: 'cup',
  Travel: 'plane',
  Study: 'book',
  Bills: 'bolt',
  Shopping: 'bag',
  Health: 'cross',
  Stock: 'box',
  Wages: 'users',
  Electricity: 'bolt',
  Transport: 'truck',
  'Udhaar given': 'users',
  Other: 'tag',
};

export function iconFor(t: { type: TxnType; category: string }) {
  if (t.type === 'save') return ICON.save;
  if (t.type === 'credit') return ICON.down;
  return ICON[CAT_ICON[t.category] || 'tag'];
}

export function BrandLogo() {
  return (
    <span
      className="logo"
      style={{
        width: '32px',
        height: '32px',
        borderRadius: '10px',
        background: 'linear-gradient(135deg, #FFB800 0%, #FF8C00 100%)',
        display: 'inline-grid',
        placeItems: 'center',
        boxShadow: '0 3px 8px rgba(255, 140, 0, 0.35)',
        position: 'relative',
        color: '#fff',
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="#FFF" fill="none" />
        <path d="M9.5 8h4.5a2.5 2.5 0 0 1 0 5H9.5v3" stroke="#FFF" />
      </svg>
      <span
        style={{
          position: 'absolute',
          top: '-3px',
          right: '-3px',
          fontSize: '11px',
          lineHeight: 1,
        }}
      >
        ✨
      </span>
    </span>
  );
}

const ST_ICON: Record<TxnStatus, React.ReactNode> = {
  matched: ICON.checkc,
  pending: ICON.clock,
  flagged: ICON.alert,
  recorded: ICON.dot,
  received: ICON.dot,
  saved: ICON.dot,
};

export function StatusPill({ status }: { status: TxnStatus }) {
  return (
    <span className={`st st-${status}`}>
      {ST_ICON[status]}
      {ST_LABEL[status]}
    </span>
  );
}
