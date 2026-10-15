import { jsPDF } from 'jspdf';
import { AccountMode, LineItem, Transaction, TxnType } from '../ml/categorizer';

export const KEY2 = 'finsense.v2';
export const KEY1 = 'ledgerease.v2';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MODE_LABEL: Record<AccountMode, string> = { personal: 'Personal', shop: 'Shop' };
export const METHODS: Array<[string, string]> = [
  ['upi', 'UPI'],
  ['cash', 'Cash'],
  ['card', 'Card'],
  ['bank', 'Bank'],
];
export const RATES = [0, 5, 12, 18, 28];
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const DOTS = '••••';

export interface Goal {
  id: string;
  name: string;
  target: number;
  deadline: string;
  sample?: boolean;
}

export interface Policy {
  limit: number;
  cap: number;
  bill: number;
}

export interface Book {
  txns: Transaction[];
  goals: Goal[];
  monthlyTarget: number;
  policy: Policy;
}

export interface AppState {
  v: number;
  mode: AccountMode;
  ym: string;
  rseq: number;
  name: Record<AccountMode, string>;
  gstin: Record<AccountMode, string>;
  opts: {
    bills: boolean;
    categories: boolean;
    gst: boolean;
    savings: boolean;
  };
  personal: Book;
  shop: Book;
}

export const pad = (n: number | string) => String(n).padStart(2, '0');
export const uid = () => Math.random().toString(36).slice(2, 9);
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const parseAmt = (s: string | number | null | undefined) => {
  const v = parseFloat(String(s == null ? '' : s).replace(/,/g, ''));
  return isFinite(v) ? v : 0;
};
export const fmt = (n: number, d: number) =>
  Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: 2 });
export const inr = (n: number) => (n < 0 ? '−' : '') + '₹' + fmt(n, Number.isInteger(Math.abs(n)) ? 0 : 2);
export const inr2 = (n: number) => (n < 0 ? '−' : '') + '₹' + fmt(n, 2);
export const signed = (n: number) => (n > 0 ? '+' : '') + inr(n);
export const rs = (n: number) => (n < 0 ? '-Rs. ' : 'Rs. ') + fmt(n, 2);

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const ymOf = (ds: string) => ds.slice(0, 7);
export const monthLabel = (ym: string) => {
  const p = ym.split('-');
  return `${MONTHS[+p[1] - 1]} ${p[0]}`;
};
export const shiftYm = (ym: string, n: number) => {
  const p = ym.split('-').map(Number);
  let y = p[0];
  let m = p[1] + n;
  while (m > 12) {
    m -= 12;
    y++;
  }
  while (m < 1) {
    m += 12;
    y--;
  }
  return `${y}-${pad(m)}`;
};
export const lastDay = (ym: string) => {
  const p = ym.split('-').map(Number);
  return new Date(p[0], p[1], 0).getDate();
};
export const dLong = (ds: string) => {
  const p = ds.split('-').map(Number);
  return `${MON3[p[1] - 1]} ${p[2]}, ${p[0]}`;
};
export const dShort = (ds: string) => {
  const p = ds.split('-').map(Number);
  return `${pad(p[2])} ${MON3[p[1] - 1]}`;
};
export const dFull = (ds: string) => {
  const p = ds.split('-').map(Number);
  return `${pad(p[2])} ${MON3[p[1] - 1]} ${p[0]}`;
};
export const tFmt = (t?: string) => {
  if (!t) return '';
  const p = t.split(':').map(Number);
  return `${pad(p[0] % 12 || 12)}:${pad(p[1])} ${p[0] >= 12 ? 'PM' : 'AM'}`;
};
export const dtLine = (t: { date: string; time?: string }) =>
  dLong(t.date) + (t.time ? ' · ' + tFmt(t.time) : '');

const LET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const makeRid = (n: number) => `RC-${n}${LET[(n * 7) % LET.length]}`;

export function calc(t: { type: TxnType; amount: number; rate?: number; tip?: number }) {
  const tip = t.type === 'debit' ? t.tip || 0 : 0;
  const rate = t.type === 'save' ? 0 : t.rate || 0;
  const pre = r2(t.amount - tip);
  const taxable = rate ? r2(pre / (1 + rate / 100)) : pre;
  const gst = rate ? r2(pre - taxable) : 0;
  const cgst = r2(gst / 2);
  return {
    rate,
    taxable,
    gst,
    cgst,
    sgst: r2(gst - cgst),
    tip,
    total: t.amount,
  };
}

export function sampleReceipt(
  name: string,
  lines: Array<[string, string]>,
  total: string,
  taxLine?: string
): { url: string; w: number; h: number } | null {
  try {
    const c = document.createElement('canvas');
    const n = lines.length + (taxLine ? 1 : 0);
    const H = Math.max(230, 150 + n * 22 + 60);
    c.width = 300;
    c.height = H;
    const g = c.getContext('2d');
    if (!g || typeof c.toDataURL !== 'function') return null;
    g.fillStyle = '#1c1d26';
    g.fillRect(0, 0, 300, H);
    g.fillStyle = '#f6f2e8';
    g.fillRect(34, 14, 232, H - 28);
    g.fillStyle = '#2b2b2b';
    g.textAlign = 'center';
    g.font = 'bold 15px monospace';
    g.fillText(String(name).toUpperCase().slice(0, 20), 150, 46);
    g.font = '11px monospace';
    g.fillText('SAMPLE RECEIPT', 150, 64);
    g.font = '12px monospace';
    let y = 100;
    lines.forEach((l) => {
      g.textAlign = 'left';
      g.fillText(String(l[0]).slice(0, 17), 48, y);
      g.textAlign = 'right';
      g.fillText(l[1], 252, y);
      y += 22;
    });
    g.fillRect(48, y - 8, 204, 1);
    y += 14;
    if (taxLine) {
      g.textAlign = 'left';
      g.fillText('GST incl.', 48, y);
      g.textAlign = 'right';
      g.fillText(taxLine, 252, y);
      y += 24;
    }
    g.font = 'bold 14px monospace';
    g.textAlign = 'left';
    g.fillText('TOTAL', 48, y);
    g.textAlign = 'right';
    g.fillText(total, 252, y);
    return { url: c.toDataURL('image/jpeg', 0.72), w: 300, h: H };
  } catch {
    return null;
  }
}

export const defaultPolicy = (m: AccountMode): Policy =>
  m === 'shop' ? { limit: 60000, cap: 25000, bill: 2000 } : { limit: 15000, cap: 5000, bill: 1000 };

export const blankBook = (m: AccountMode): Book => ({
  txns: [],
  goals: [{ id: 'general', name: 'General savings', target: 0, deadline: '' }],
  monthlyTarget: 0,
  policy: defaultPolicy(m),
});

export function sampleData(): { personal: Book; shop: Book; rseq: number } {
  const now = todayStr();
  const ym = ymOf(now);
  const tDay = +now.slice(8);
  let seq = 1000;
  const day = (d: number) => `${ym}-${pad(Math.min(d, tDay))}`;

  const T = (o: Partial<Transaction> & { date: string; type: TxnType; amount: number }): Transaction => {
    seq++;
    const base: Transaction = {
      id: uid(),
      rid: makeRid(seq),
      time: '',
      vendor: '',
      category: 'Other',
      note: '',
      rate: 0,
      gstin: '',
      tip: 0,
      method: 'upi',
      last4: '',
      items: [],
      receipt: null,
      rw: 0,
      rh: 0,
      flagged: false,
      cleared: false,
      sample: true,
      mlAuto: true,
      mlConfidence: 92,
      ...o,
    };
    return base;
  };

  const withBill = (t: Transaction): Transaction => {
    const lines: Array<[string, string]> = t.items.length
      ? t.items.map((i) => [i.n, i.a.toFixed(2)])
      : [[t.category, (t.amount - (t.tip || 0)).toFixed(2)]];
    if (t.tip) lines.push(['Tip', t.tip.toFixed(2)]);
    const c = calc(t);
    const r = sampleReceipt(t.vendor || t.category, lines, 'Rs.' + t.amount.toFixed(2), c.gst ? c.gst.toFixed(2) : '');
    if (r) {
      t.receipt = r.url;
      t.rw = r.w;
      t.rh = r.h;
    }
    return t;
  };

  const P: Transaction[] = [];
  const Sh: Transaction[] = [];

  for (let i = 5; i >= 1; i--) {
    const pm = shiftYm(ym, -i);
    const pd = (d: number) => `${pm}-${pad(Math.min(d, lastDay(pm)))}`;
    P.push(T({ date: pd(2), time: '09:00', type: 'credit', amount: 8000, category: 'Pocket money', vendor: 'From home' }));
    P.push(T({ date: pd(5), time: '10:00', type: 'debit', amount: 3500, category: 'Rent', vendor: 'Sunrise Boys Hostel' }));
    P.push(T({ date: pd(9), time: '13:00', type: 'debit', amount: 1800 + i * 40, category: 'Food', vendor: 'Hostel Mess', method: 'cash' }));
    P.push(T({ date: pd(14), time: '18:00', type: 'debit', amount: 450 + i * 25, category: 'Travel', vendor: 'City Metro Smart Card' }));
    P.push(T({ date: pd(20), time: '12:00', type: 'save', amount: 500, category: 'Savings', goalId: 'general' }));

    Sh.push(T({ date: pd(3), time: '19:00', type: 'credit', amount: 28000 + i * 1500, category: 'Sales', vendor: 'Counter sales', method: 'cash' }));
    Sh.push(T({ date: pd(6), time: '11:00', type: 'debit', amount: 11000 + i * 400, category: 'Stock', vendor: 'Sharma Traders', method: 'bank' }));
    Sh.push(T({ date: pd(10), time: '10:00', type: 'debit', amount: 6000, category: 'Rent', vendor: 'Gupta Properties', method: 'bank' }));
  }

  P.push(T({ date: day(1), time: '09:10', type: 'credit', amount: 8000, category: 'Pocket money', vendor: 'From home', mlConfidence: 96 }));
  P.push(withBill(T({ date: day(1), time: '10:30', type: 'debit', amount: 3500, category: 'Rent', vendor: 'Sunrise Boys Hostel', note: 'Hostel room, monthly', mlConfidence: 98 })));
  P.push(T({ date: day(2), time: '13:05', type: 'debit', amount: 1800, category: 'Food', vendor: 'Hostel Mess', method: 'cash', note: 'Mess fee', mlConfidence: 95 }));
  P.push(T({ date: day(3), time: '08:42', type: 'debit', amount: 500, category: 'Travel', vendor: 'City Metro Smart Card', note: 'Card recharge', mlConfidence: 97 }));
  P.push(T({ date: day(3), time: '08:50', type: 'debit', amount: 500, category: 'Travel', vendor: 'City Metro Smart Card', note: 'Possible duplicate. Check the receipt.', flagged: true, mlConfidence: 97 }));
  P.push(withBill(T({ date: day(4), time: '17:20', type: 'debit', amount: 640, category: 'Study', vendor: 'Pustak Bhandar', note: 'Engineering Mathematics', items: [{ n: 'Engg Mathematics Vol 1', a: 640 }], mlConfidence: 94 })));
  P.push(T({ date: day(5), time: '12:00', type: 'save', amount: 500, category: 'Savings', goalId: 'general' }));
  P.push(T({ date: day(5), time: '18:30', type: 'credit', amount: 4000, category: 'Salary', vendor: 'Weekend tutoring', note: 'Two students, October', mlConfidence: 93 }));
  P.push(withBill(T({ date: day(6), time: '19:40', type: 'debit', amount: 1299, category: 'Shopping', vendor: 'Metro Electronics', method: 'card', last4: '4088', rate: 18, note: 'Earphones', items: [{ n: 'Wired earphones', a: 1299 }], mlConfidence: 96 })));
  P.push(T({ date: day(7), time: '11:15', type: 'save', amount: 1000, category: 'Savings', goalId: 'laptop' }));
  P.push(T({ date: day(8), time: '20:05', type: 'debit', amount: 299, category: 'Bills', vendor: 'Mobile prepaid recharge', rate: 18, mlConfidence: 95 }));
  P.push(withBill(T({ date: day(9), time: '21:10', type: 'debit', amount: 840, category: 'Food', vendor: 'Campus Café', method: 'card', last4: '4088', rate: 5, tip: 40, note: 'Dinner with friends', items: [{ n: 'Cold coffee', a: 180 }, { n: 'Paneer wrap', a: 320 }, { n: 'Brownie', a: 300 }], mlConfidence: 98 })));
  P.push(T({ date: day(10), time: '22:00', type: 'debit', amount: 210, category: 'Food', vendor: 'Roommates dinner (split)', method: 'cash', mlConfidence: 91 }));

  Sh.push(withBill(T({ date: day(1), time: '09:00', type: 'debit', amount: 6000, category: 'Rent', vendor: 'Gupta Properties', method: 'bank', note: 'Shop rent', mlConfidence: 98 })));
  Sh.push(T({ date: day(2), time: '18:30', type: 'credit', amount: 4200, category: 'Sales', vendor: 'Counter sales', method: 'cash', rate: 5, note: 'Daily sales', mlConfidence: 97 }));
  Sh.push(withBill(T({ date: day(3), time: '11:00', type: 'debit', amount: 9800, category: 'Stock', vendor: 'Sharma Traders', method: 'bank', rate: 5, gstin: '07ABCDE1234F1Z5', note: 'Monthly wholesale order', items: [{ n: 'Basmati rice 25 kg', a: 4200 }, { n: 'Mustard oil 15 L', a: 3150 }, { n: 'Toor dal 30 kg', a: 2450 }], mlConfidence: 99 })));
  Sh.push(T({ date: day(4), time: '16:00', type: 'debit', amount: 850, category: 'Udhaar given', vendor: 'Verma ji', method: 'cash', note: 'Groceries on credit', mlConfidence: 94 }));
  Sh.push(T({ date: day(5), time: '19:00', type: 'credit', amount: 5100, category: 'Sales', vendor: 'Counter sales', method: 'cash', rate: 5, mlConfidence: 97 }));
  Sh.push(T({ date: day(6), time: '10:20', type: 'debit', amount: 1240, category: 'Electricity', vendor: 'City Power Distribution', note: 'Monthly bill', mlConfidence: 96 }));
  Sh.push(T({ date: day(7), time: '15:40', type: 'credit', amount: 500, category: 'Udhaar received', vendor: 'Verma ji', method: 'cash', note: 'Part payment', mlConfidence: 93 }));
  Sh.push(T({ date: day(7), time: '17:10', type: 'debit', amount: 1180, category: 'Other', vendor: 'Shree Stationers', rate: 18, gstin: '27AAACS1234B1Z8', note: 'Billing paper rolls', mlConfidence: 88 }));
  Sh.push(T({ date: day(8), time: '09:30', type: 'debit', amount: 3000, category: 'Wages', vendor: 'Raju (helper)', method: 'cash', note: 'Cash paid above ₹2,000. Get a signed receipt.', flagged: true, mlConfidence: 95 }));
  Sh.push(T({ date: day(8), time: '20:10', type: 'credit', amount: 4650, category: 'Sales', vendor: 'Counter sales', method: 'cash', rate: 5, mlConfidence: 97 }));
  Sh.push(T({ date: day(9), time: '12:30', type: 'debit', amount: 2950, category: 'Stock', vendor: 'Packwell Supplies', rate: 18, note: 'Packaging material. Vendor GSTIN missing.', mlConfidence: 93 }));
  Sh.push(T({ date: day(9), time: '14:00', type: 'debit', amount: 300, category: 'Transport', vendor: 'Goods tempo', method: 'cash', mlConfidence: 95 }));
  Sh.push(T({ date: day(10), time: '10:00', type: 'save', amount: 2000, category: 'Savings', goalId: 'reno' }));
  Sh.push(T({ date: day(10), time: '10:05', type: 'save', amount: 1000, category: 'Savings', goalId: 'general' }));

  const pb = blankBook('personal');
  const sb = blankBook('shop');
  pb.txns = P;
  sb.txns = Sh;
  pb.monthlyTarget = 2000;
  sb.monthlyTarget = 5000;
  pb.goals.push({ id: 'laptop', name: 'Laptop', target: 40000, deadline: shiftYm(ym, 5) + '-28', sample: true });
  sb.goals.push({ id: 'reno', name: 'Shop renovation', target: 60000, deadline: '', sample: true });

  return { personal: pb, shop: sb, rseq: seq };
}

export function freshState(): AppState {
  const d = sampleData();
  return {
    v: 2,
    mode: 'personal',
    ym: ymOf(todayStr()),
    rseq: d.rseq,
    name: { personal: '', shop: '' },
    gstin: { personal: '', shop: '' },
    opts: { bills: true, categories: true, gst: true, savings: true },
    personal: d.personal,
    shop: d.shop,
  };
}

export function emptyState(): AppState {
  return {
    v: 2,
    mode: 'personal',
    ym: ymOf(todayStr()),
    rseq: 1000,
    name: { personal: '', shop: '' },
    gstin: { personal: '', shop: '' },
    opts: { bills: true, categories: true, gst: true, savings: true },
    personal: blankBook('personal'),
    shop: blankBook('shop'),
  };
}

function loadRaw(k: string): any {
  try {
    const r = localStorage.getItem(k);
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
}

export function loadState(): AppState {
  const s = loadRaw(KEY2) || loadRaw(KEY1);
  if (s && s.v === 2 && s.personal && s.shop) {
    if (!s.gstin) s.gstin = { personal: '', shop: '' };
    if (!s.opts) s.opts = { bills: true, categories: true, gst: true, savings: true };
    if (s.opts.gst === undefined) s.opts.gst = true;
    return s;
  }
  return freshState();
}

export function cmpAsc(a: Transaction, b: Transaction) {
  const ka = `${a.date} ${a.time || '00:00'}`;
  const kb = `${b.date} ${b.time || '00:00'}`;
  return ka < kb ? -1 : ka > kb ? 1 : a.rid < b.rid ? -1 : 1;
}

export function monthTx(S: AppState, mode: AccountMode, ym: string): Transaction[] {
  return S[mode].txns.filter((t) => ymOf(t.date) === ym).sort(cmpAsc);
}

export function totals(list: Transaction[]) {
  const r = { credit: 0, debit: 0, save: 0 };
  list.forEach((t) => {
    r[t.type] = r2(r[t.type] + t.amount);
  });
  return r;
}

export function openingBal(S: AppState, mode: AccountMode, ym: string) {
  const start = `${ym}-01`;
  let n = 0;
  S[mode].txns.forEach((t) => {
    if (t.date < start) n += t.type === 'credit' ? t.amount : -t.amount;
  });
  return r2(n);
}

export function goalSaved(S: AppState, mode: AccountMode, id: string, ym?: string) {
  let n = 0;
  S[mode].txns.forEach((t) => {
    if (t.type === 'save' && t.goalId === id && (!ym || ymOf(t.date) === ym)) n += t.amount;
  });
  return r2(n);
}

export function goalName(S: AppState, mode: AccountMode, id?: string) {
  const g = S[mode].goals.find((x) => x.id === id);
  return g ? g.name : 'General savings';
}

export function byCategory(list: Transaction[]) {
  const m: Record<string, number> = {};
  list.forEach((t) => {
    if (t.type === 'debit') m[t.category] = (m[t.category] || 0) + t.amount;
  });
  return Object.keys(m)
    .map((k) => ({ name: k, amount: r2(m[k]) }))
    .sort((a, b) => b.amount - a.amount);
}

export const overCap = (S: AppState, t: Transaction, mode: AccountMode) => {
  const p = S[mode].policy;
  return t.type === 'debit' && p.cap > 0 && t.amount > p.cap;
};

export const isFlagged = (S: AppState, t: Transaction, mode: AccountMode) =>
  Boolean(t.flagged) || (overCap(S, t, mode) && !t.cleared);

export type TxnStatus = 'matched' | 'pending' | 'flagged' | 'recorded' | 'received' | 'saved';

export function stOf(S: AppState, t: Transaction, mode: AccountMode): TxnStatus {
  if (t.type === 'save') return 'saved';
  if (isFlagged(S, t, mode)) return 'flagged';
  if (t.receipt) return 'matched';
  const p = S[mode].policy;
  if (t.type === 'debit' && p.bill > 0 && t.amount >= p.bill) return 'pending';
  return t.type === 'credit' ? 'received' : 'recorded';
}

export function statusCounts(S: AppState, list: Transaction[]) {
  const c = { matched: 0, pending: 0, flagged: 0 };
  list.forEach((t) => {
    const s = stOf(S, t, S.mode);
    if (s === 'matched' || s === 'pending' || s === 'flagged') c[s]++;
  });
  return c;
}

export function compliance(S: AppState, t: Transaction, mode: AccountMode) {
  const p = S[mode].policy;
  if (t.type !== 'debit') return { ok: true, text: 'Not applicable' };
  if (!(p.cap > 0)) return { ok: true, text: 'No per-entry cap set' };
  return t.amount <= p.cap
    ? { ok: true, text: `Within ${inr(p.cap)} cap` }
    : { ok: false, text: `Over ${inr(p.cap)} cap` };
}

export interface GstRow {
  side: string;
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  gst: number;
}

export function gstSummary(S: AppState, mode: AccountMode, ym: string) {
  const rows: Record<string, GstRow> = {};
  const o = { paid: 0, paidTax: 0, claim: 0, noClaim: 0, out: 0, outTax: 0, rows: [] as GstRow[], net: 0 };
  monthTx(S, mode, ym).forEach((t) => {
    if (t.type === 'save') return;
    const c = calc(t);
    if (!c.rate) return;
    const side = t.type === 'debit' ? (mode === 'shop' ? 'Purchases' : 'Spending') : 'Sales';
    const k = `${side}|${c.rate}`;
    const r = rows[k] || (rows[k] = { side, rate: c.rate, taxable: 0, cgst: 0, sgst: 0, gst: 0 });
    r.taxable = r2(r.taxable + c.taxable);
    r.cgst = r2(r.cgst + c.cgst);
    r.sgst = r2(r.sgst + c.sgst);
    r.gst = r2(r.gst + c.gst);
    if (t.type === 'debit') {
      o.paid = r2(o.paid + c.gst);
      o.paidTax = r2(o.paidTax + c.taxable);
      if (GSTIN_RE.test(t.gstin || '')) o.claim = r2(o.claim + c.gst);
      else o.noClaim = r2(o.noClaim + c.gst);
    } else {
      o.out = r2(o.out + c.gst);
      o.outTax = r2(o.outTax + c.taxable);
    }
  });
  o.rows = Object.keys(rows)
    .map((k) => rows[k])
    .sort((a, b) => (a.side === b.side ? a.rate - b.rate : a.side === 'Sales' ? 1 : -1));
  o.net = r2(o.out - o.claim);
  return o;
}

export function entryTitle(S: AppState, t: Transaction, mode: AccountMode) {
  return t.type === 'save' ? `Saved to ${goalName(S, mode, t.goalId)}` : t.vendor || t.category;
}

export function payLabel(t: { method?: string; last4?: string }) {
  if (t.method === 'card') return `Card ${DOTS}${t.last4 ? ' ' + t.last4 : ''}`;
  return ({ upi: 'UPI', cash: 'Cash', bank: 'Bank transfer' } as Record<string, string>)[t.method || ''] || '';
}

export function stmtRef(S: AppState) {
  return `PP-${S.ym.replace('-', '')}-${S.mode === 'shop' ? 'S' : 'P'}`;
}

export function compact(n: number) {
  if (n >= 100000) {
    const l = n / 100000;
    return `${l % 1 ? l.toFixed(1) : l}L`;
  }
  if (n >= 1000) {
    const k = n / 1000;
    return `${k % 1 ? k.toFixed(1) : k}K`;
  }
  return String(Math.round(n));
}

export function niceMax(v: number) {
  if (!(v > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const m = [1, 1.5, 2, 3, 4, 5, 6, 8, 10];
  for (let i = 0; i < m.length; i++) if (m[i] * mag >= v) return m[i] * mag;
  return 10 * mag;
}

export function shrinkImage(
  file: File,
  cb: (res: { url: string; w: number; h: number } | null) => void
) {
  const fr = new FileReader();
  fr.onerror = () => cb(null);
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => cb(null);
    img.onload = () => {
      const max = 480;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * k);
      const h = Math.round(img.height * k);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      if (!g) {
        cb(null);
        return;
      }
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      cb({ url: c.toDataURL('image/jpeg', 0.7), w, h });
    };
    img.src = fr.result as string;
  };
  fr.readAsDataURL(file);
}

export const ST_LABEL: Record<TxnStatus, string> = {
  matched: 'Matched',
  pending: 'Pending bill',
  flagged: 'Flagged',
  recorded: 'Recorded',
  received: 'Received',
  saved: 'Saved',
};

export async function saveFile(filename: string, data: ArrayBuffer | string, mimeType = 'application/octet-stream') {
  const w = window as any;
  try {
    if (w.claude && typeof w.claude.use === 'function') {
      const dl = await w.claude.use('downloads');
      if (dl && typeof dl.save === 'function') {
        return await dl.save({ filename, data });
      }
    }
  } catch {
    // fallback to standard browser download
  }
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
  return { status: 'saved' };
}

export function buildPdf(S: AppState): ArrayBuffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;
  const M = 16;
  const CW = W - 2 * M;
  const BOTTOM = H - 22;
  const C = {
    ink: [21, 24, 38],
    muted: [91, 97, 120],
    line: [227, 230, 239],
    accent: [59, 47, 214],
    ok: [14, 122, 79],
    bad: [179, 38, 30],
    warn: [138, 82, 0],
    save: [15, 118, 110],
    soft: [241, 243, 248],
    dark: [22, 23, 31],
  };

  const mode = S.mode;
  const ym = S.ym;
  const b = S[mode];
  const list = monthTx(S, mode, ym);
  const t = totals(list);
  const open = openingBal(S, mode, ym);
  const close = r2(open + t.credit - t.debit - t.save);
  const opts = S.opts;
  const p = b.policy;
  const g = gstSummary(S, mode, ym);
  const cnt = statusCounts(S, list);
  let y = 0;
  const shop = mode === 'shop';

  const txt = (s: string | number, x: number, yy: number, o?: any) => doc.text(String(s), x, yy, o);
  const col = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
  const draw = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);
  const font = (st: string, sz: number) => {
    doc.setFont('helvetica', st);
    doc.setFontSize(sz);
  };
  const clip = (s: string, w: number) => {
    const l = doc.splitTextToSize(String(s), w);
    return l[0] + (l.length > 1 ? '...' : '');
  };
  const num = (n: number) => fmt(n, 2);
  const newPage = () => {
    doc.addPage();
    col(C.muted);
    font('normal', 8);
    txt(`FinSense  |  ${S.name[mode] || MODE_LABEL[mode] + ' account'}  |  ${monthLabel(ym)}`, M, 11);
    draw(C.line);
    doc.setLineWidth(0.2);
    doc.line(M, 14, W - M, 14);
    return 24;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) y = newPage();
  };
  const section = (title: string) => {
    ensure(24);
    col(C.ink);
    font('bold', 12);
    txt(title, M, y);
    y += 7;
  };

  // Header
  fill(C.dark);
  doc.roundedRect(M, 12, 10, 10, 2.4, 2.4, 'F');
  draw([255, 255, 255]);
  doc.setLineWidth(0.6);
  doc.line(M + 2.4, 15.4, M + 6, 15.4);
  doc.line(M + 2.4, 17.2, M + 7.6, 17.2);
  doc.line(M + 2.4, 19, M + 5, 19);
  col(C.ink);
  font('bold', 13);
  txt('PennyPop', M + 13, 18.6);
  col(C.muted);
  font('normal', 9);
  txt(`Statement no. ${stmtRef(S)}`, W - M, 18.6, { align: 'right' });
  col(C.ink);
  font('bold', 24);
  txt('Monthly statement', M, 38);
  col(C.muted);
  font('normal', 11);
  txt(`${monthLabel(ym)}  |  ${MODE_LABEL[mode]} account`, M, 46);

  // Account
  y = 58;
  col(C.muted);
  font('bold', 8);
  txt(shop ? 'SHOP' : 'PREPARED FOR', M, y);
  col(C.ink);
  font('bold', 13);
  txt(S.name[mode] || (shop ? 'Shop account' : 'Personal account'), M, y + 6);
  const gi = S.gstin[mode] || '';
  if (shop && GSTIN_RE.test(gi)) {
    col(C.muted);
    font('normal', 9);
    txt(`GSTIN ${gi}`, M, y + 11.5);
  }
  col(C.muted);
  font('normal', 9);
  txt(
    `Period: 01 ${MON3[+ym.slice(5) - 1]} ${ym.slice(0, 4)} to ${lastDay(ym)} ${MON3[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`,
    W - M,
    y,
    { align: 'right' }
  );
  txt(`Generated on ${dFull(todayStr())}`, W - M, y + 5, { align: 'right' });

  // Summary strip
  y = 78;
  fill(C.soft);
  doc.roundedRect(M, y, CW, 22, 4, 4, 'F');
  const cells: Array<[string, number, number[]]> = [
    ['OPENING', open, C.ink],
    ['MONEY IN', t.credit, C.ok],
    [shop ? 'PAID OUT' : 'SPENT', t.debit, C.bad],
    ['SAVED', t.save, C.save],
    ['CLOSING', close, C.accent],
  ];
  const cw = CW / 5;
  cells.forEach((c, i) => {
    const x = M + 5 + i * cw;
    col(C.muted);
    font('bold', 7.5);
    txt(c[0], x, y + 7);
    col(c[2]);
    font('bold', 9.5);
    txt(rs(c[1]).replace('Rs. ', 'Rs.\u00A0'), x, y + 14);
  });
  y += 29;
  col(C.muted);
  font('normal', 8.5);
  const used = p.limit > 0 ? Math.round((t.debit / p.limit) * 100) : null;
  txt(
    `${used !== null ? `Monthly limit ${rs(p.limit)} (${used}% used)    |    ` : ''}Matched ${cnt.matched}    Pending bills ${cnt.pending}    Flagged ${cnt.flagged}`,
    M,
    y
  );
  y += 11;

  // GST
  if (opts.gst) {
    section('GST summary');
    if (!g.rows.length) {
      col(C.muted);
      font('normal', 9.5);
      txt('No GST recorded this month.', M, y);
      y += 9;
    } else {
      const gx = { type: M + 2, rate: M + 44, tax: M + 88, cg: M + 118, sg: M + 146, gst: M + CW - 2 };
      fill(C.soft);
      doc.rect(M, y - 5, CW, 8, 'F');
      col(C.muted);
      font('bold', 7);
      txt(shop ? 'TYPE' : 'SPENDING', gx.type, y);
      txt('RATE', gx.rate, y);
      txt('TAXABLE VALUE', gx.tax, y, { align: 'right' });
      txt('CGST', gx.cg, y, { align: 'right' });
      txt('SGST', gx.sg, y, { align: 'right' });
      txt('TOTAL GST', gx.gst, y, { align: 'right' });
      y += 8;
      g.rows.forEach((r) => {
        ensure(8);
        col(C.ink);
        font('normal', 8.8);
        txt(r.side, gx.type, y);
        txt(`${r.rate}%`, gx.rate, y);
        txt(num(r.taxable), gx.tax, y, { align: 'right' });
        txt(num(r.cgst), gx.cg, y, { align: 'right' });
        txt(num(r.sgst), gx.sg, y, { align: 'right' });
        txt(num(r.gst), gx.gst, y, { align: 'right' });
        draw(C.line);
        doc.setLineWidth(0.15);
        doc.line(M, y + 2.4, W - M, y + 2.4);
        y += 7;
      });
      y += 3;
      const lines: Array<[string, number, number[]]> = shop
        ? [
            ['Input tax credit (vendor GSTIN recorded)', g.claim, C.ok],
            ['GST paid without vendor GSTIN (not claimable)', g.noClaim, C.warn],
            ['Output GST collected on sales', g.out, C.ink],
            [
              g.net >= 0 ? 'Net GST payable (estimate)' : 'Credit to carry forward (estimate)',
              Math.abs(g.net),
              C.accent,
            ],
          ]
        : [['Total GST paid this month', g.paid, C.ink]];
      lines.forEach((l) => {
        ensure(7);
        col(C.muted);
        font('normal', 9);
        txt(l[0], M + 2, y);
        col(l[2]);
        font('bold', 9);
        txt(rs(l[1]), W - M - 2, y, { align: 'right' });
        y += 6;
      });
      col(C.muted);
      font('normal', 7.5);
      txt(
        'Estimate from recorded entries, shown as CGST + SGST. Confirm with your accountant before filing returns.',
        M + 2,
        y + 1
      );
      y += 9;
    }
  }

  // Categories
  const cats = byCategory(list);
  if (opts.categories) {
    section(shop ? 'Where the money went' : 'Spending by category');
    if (!cats.length) {
      col(C.muted);
      font('normal', 9.5);
      txt('No spending recorded this month.', M, y);
      y += 8;
    }
    cats.forEach((c) => {
      ensure(8);
      col(C.ink);
      font('normal', 9.5);
      txt(c.name, M, y);
      const pct = t.debit ? (c.amount / t.debit) * 100 : 0;
      const barX = M + 42;
      const barW = 78;
      fill(C.soft);
      doc.rect(barX, y - 3, barW, 3.4, 'F');
      fill(C.accent);
      doc.rect(barX, y - 3, Math.max(0.6, (barW * c.amount) / cats[0].amount), 3.4, 'F');
      col(C.muted);
      txt(`${pct.toFixed(0)}%`, barX + barW + 6, y);
      col(C.ink);
      txt(rs(c.amount), W - M, y, { align: 'right' });
      y += 6.5;
    });
    y += 6;
  }

  // Entries
  const X = { date: M + 2, id: M + 16, part: M + 38, cr: M + CW - 58, dr: M + CW - 30, bal: M + CW - 2 };
  const ROW = 11;
  const tableHead = () => {
    fill(C.soft);
    doc.rect(M, y - 5, CW, 8, 'F');
    col(C.muted);
    font('bold', 7);
    txt('DATE', X.date, y);
    txt('RECEIPT ID', X.id, y);
    txt('DETAILS', X.part, y);
    txt('CREDIT', X.cr, y, { align: 'right' });
    txt('DEBIT', X.dr, y, { align: 'right' });
    txt('BALANCE', X.bal, y, { align: 'right' });
    y += 8;
  };
  ensure(40);
  col(C.ink);
  font('bold', 12);
  txt('All entries', M, y);
  y += 9;
  tableHead();
  let run = open;
  const plain = (label: string, val: number) => {
    if (y + 8 > BOTTOM) {
      y = newPage() + 4;
      tableHead();
    }
    fill(C.soft);
    doc.rect(M, y - 4.6, CW, 7, 'F');
    col(C.ink);
    font('bold', 8.8);
    txt(label, X.date, y);
    txt(num(val), X.bal, y, { align: 'right' });
    y += 8;
  };
  plain('Opening balance', run);
  list.forEach((x) => {
    if (y + ROW > BOTTOM) {
      y = newPage() + 4;
      tableHead();
    }
    const s = stOf(S, x, mode);
    const title = entryTitle(S, x, mode);
    if (x.type === 'credit') run = r2(run + x.amount);
    else run = r2(run - x.amount);
    col(C.muted);
    font('normal', 8);
    txt(dShort(x.date), X.date, y);
    font('normal', 7);
    txt(x.rid, X.id, y);
    col(C.ink);
    font('bold', 8.6);
    txt(clip(title, X.cr - X.part - 26), X.part, y);
    font('normal', 8.6);
    if (x.type === 'credit') {
      col(C.ok);
      txt(num(x.amount), X.cr, y, { align: 'right' });
    } else {
      col(x.type === 'save' ? C.save : C.bad);
      txt(num(x.amount), X.dr, y, { align: 'right' });
    }
    col(C.ink);
    txt(num(run), X.bal, y, { align: 'right' });
    const c = calc(x);
    const bits = [x.type === 'save' ? 'Savings' : x.category];
    if (payLabel(x)) bits.push(payLabel(x).replace(DOTS, 'ending'));
    if (c.rate) bits.push(`GST ${c.rate}% ${num(c.gst)}`);
    const pre = clip(bits.join('  |  '), X.cr - X.part - 30);
    const stLabel = ST_LABEL[s];
    col(C.muted);
    font('normal', 7);
    txt(pre, X.part, y + 4);
    if (s === 'matched' || s === 'pending' || s === 'flagged') {
      const w = doc.getTextWidth(pre);
      col(s === 'matched' ? C.ok : s === 'pending' ? C.warn : C.bad);
      font('bold', 7);
      txt(`  ${stLabel}`, X.part + w, y + 4);
    }
    draw(C.line);
    doc.setLineWidth(0.15);
    doc.line(M, y + 6.2, W - M, y + 6.2);
    y += ROW;
  });
  plain('Closing balance', close);
  col(C.muted);
  font('normal', 7.5);
  txt('Amounts in Indian rupees. Teal debit figures are money moved into savings, not spending.', M, y + 1);
  y += 10;

  // Savings
  if (opts.savings) {
    section('Savings');
    b.goals.forEach((gl) => {
      ensure(17);
      const tot = goalSaved(S, mode, gl.id);
      const mo = goalSaved(S, mode, gl.id, ym);
      col(C.ink);
      font('bold', 9.5);
      txt(gl.name, M, y);
      col(C.muted);
      font('normal', 8.5);
      txt(
        `This month ${rs(mo)}   |   Total saved ${rs(tot)}${gl.target > 0 ? `   |   Target ${rs(gl.target)}` : ''}`,
        M,
        y + 5
      );
      if (gl.target > 0) {
        fill(C.soft);
        doc.rect(M, y + 8, CW, 2.6, 'F');
        fill(C.save);
        doc.rect(M, y + 8, Math.max(0.6, CW * Math.min(1, tot / gl.target)), 2.6, 'F');
        y += 17;
      } else {
        y += 12;
      }
    });
    ensure(10);
    col(C.ink);
    font('bold', 9.5);
    txt('Saved this month', M, y + 2);
    txt(rs(t.save), W - M, y + 2, { align: 'right' });
    if (b.monthlyTarget > 0) {
      col(C.muted);
      font('normal', 8.5);
      txt(`Monthly target ${rs(b.monthlyTarget)}`, W - M, y + 7, { align: 'right' });
    }
  }

  // Bills
  const withBills = list.filter((x) => x.receipt);
  if (opts.bills && withBills.length) {
    y = newPage();
    col(C.ink);
    font('bold', 12);
    txt('Bills and receipts', M, y);
    y += 9;
    const gap = 6;
    const cellW = (CW - 2 * gap) / 3;
    const maxH = 56;
    let colI = 0;
    let rowTop = y;
    withBills.forEach((x) => {
      if (colI === 3) {
        colI = 0;
        rowTop += maxH + 18;
      }
      if (rowTop + maxH + 14 > BOTTOM + 6) {
        rowTop = newPage();
        colI = 0;
      }
      const k = Math.min(cellW / (x.rw || 1), maxH / (x.rh || 1));
      const w = (x.rw || 1) * k;
      const h = (x.rh || 1) * k;
      const cx = M + colI * (cellW + gap);
      if (x.receipt) {
        try {
          doc.addImage(x.receipt, 'JPEG', cx, rowTop, w, h);
        } catch {
          // skip unreadable image
        }
      }
      draw(C.line);
      doc.setLineWidth(0.2);
      doc.rect(cx, rowTop, w, h);
      col(C.ink);
      font('bold', 8);
      txt(`${x.rid}  ${rs(x.amount)}`, cx, rowTop + h + 4.5);
      col(C.muted);
      font('normal', 7.5);
      txt(clip(entryTitle(S, x, mode), cellW), cx, rowTop + h + 8.5);
      colI++;
    });
  }

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    draw(C.line);
    doc.setLineWidth(0.2);
    doc.line(M, H - 16, W - M, H - 16);
    col(C.muted);
    font('normal', 8);
    txt(`FinSense statement ${stmtRef(S)}  |  ${monthLabel(ym)}`, M, H - 11);
    txt(`Page ${i} of ${n}`, W - M, H - 11, { align: 'right' });
    font('normal', 7);
    txt('Prepared from entries recorded by the account holder. This is not a bank statement or a GST filing.', M, H - 6.5);
  }
  return doc.output('arraybuffer');
}
