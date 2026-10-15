import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AccountMode,
  CATEGORIES,
  SAMPLE_BILL_TEMPLATES,
  SampleBillTemplate,
  Transaction,
  TxnType,
  parseNaturalExpense,
  predictCategory,
  recordMLTraining,
} from './ml/categorizer';
import {
  AppState,
  DOTS,
  GSTIN_RE,
  KEY2,
  METHODS,
  MODE_LABEL,
  MON3,
  RATES,
  ST_LABEL,
  buildPdf,
  byCategory,
  calc,
  compact,
  compliance,
  dFull,
  dLong,
  dtLine,
  entryTitle,
  goalName,
  goalSaved,
  gstSummary,
  inr,
  inr2,
  isFlagged,
  loadState,
  makeRid,
  monthLabel,
  monthTx,
  niceMax,
  nowTime,
  openingBal,
  parseAmt,
  payLabel,
  r2,
  sampleReceipt,
  saveFile,
  shiftYm,
  shrinkImage,
  signed,
  stOf,
  statusCounts,
  stmtRef,
  todayStr,
  totals,
  uid,
  ymOf,
} from './utils/ledgerCore';
import { BrandLogo, ICON, StatusPill, iconFor } from './components/Icons';
import { MLStudioPanel } from './components/MLStudioPanel';
import type { User } from 'firebase/auth';
import { testConnection } from './firebase/config';
import { subscribeAuth, pushLedgerToCloud, pullLedgerFromCloud } from './firebase/syncService';
import {
  subscribeDriveStatus,
  getDriveStatus,
  syncLedgerToGoogleDrive,
  DriveSyncStatus,
} from './services/googleDriveService';
import { CloudSyncModal } from './components/CloudSyncModal';
import { sound } from './utils/soundEffects';
import { ConfettiEffect } from './components/ConfettiEffect';

export const CAT_EMOJIS: Record<string, string> = {
  Food: '🍔',
  Travel: '🚕',
  Shopping: '🛍️',
  Bills: '💡',
  Rent: '🏠',
  Health: '💊',
  Study: '📚',
  Stock: '📦',
  Wages: '👥',
  Electricity: '⚡',
  Transport: '🚚',
  'Udhaar given': '🤝',
  Sales: '💰',
  Services: '🛠️',
  Savings: '🎯',
  Other: '🏷️',
};

type ViewType = 'ledger' | 'insights' | 'add' | 'savings' | 'statement' | 'policy';

interface DraftItem {
  n: string;
  a: string;
}

interface EntryDraft {
  type: TxnType;
  amount: string;
  vendor: string;
  category: string;
  rate: number;
  gstin: string;
  tip: string;
  method: string;
  last4: string;
  date: string;
  time: string;
  note: string;
  receipt: string | null;
  rw: number;
  rh: number;
  items: DraftItem[];
  goalId: string;
  err: string;
  rid: string;
  manualCat: boolean;
  manualRate: boolean;
}

function createNewDraft(type: TxnType = 'debit'): EntryDraft {
  return {
    type,
    amount: '',
    vendor: '',
    category: '',
    rate: 0,
    gstin: '',
    tip: '',
    method: 'upi',
    last4: '',
    date: todayStr(),
    time: nowTime(),
    note: '',
    receipt: null,
    rw: 0,
    rh: 0,
    items: [],
    goalId: 'general',
    err: '',
    rid: '',
    manualCat: false,
    manualRate: false,
  };
}

function createDraftFromTxn(t: Transaction): EntryDraft {
  return {
    type: t.type,
    amount: String(t.amount),
    vendor: t.vendor || '',
    category: t.category,
    rate: t.rate || 0,
    gstin: t.gstin || '',
    tip: t.tip ? String(t.tip) : '',
    method: t.method || 'upi',
    last4: t.last4 || '',
    date: t.date,
    time: t.time || '',
    note: t.note || '',
    receipt: t.receipt || null,
    rw: t.rw || 0,
    rh: t.rh || 0,
    items: (t.items || []).map((i) => ({ n: i.n, a: String(i.a) })),
    goalId: t.goalId || 'general',
    err: '',
    rid: t.rid,
    manualCat: true,
    manualRate: true,
  };
}

export default function App() {
  const [S, setS] = useState<AppState>(() => loadState());
  const [view, setView] = useState<ViewType>('ledger');
  const [openId, setOpenId] = useState<string | null>(null);
  const [noteEdit, setNoteEdit] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [imgBig, setImgBig] = useState(false);
  const [confirmDelGoal, setConfirmDelGoal] = useState<string | null>(null);
  const [armDel, setArmDel] = useState(false);
  const [justId, setJustId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [lf, setLf] = useState<'all' | 'matched' | 'pending' | 'flagged'>('all');
  const [sortBy, setSortBy] = useState<'new' | 'old' | 'high'>('new');
  const [draft, setDraft] = useState<EntryDraft>(() => createNewDraft());
  const [editId, setEditId] = useState<string | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalFormName, setGoalFormName] = useState('');
  const [goalFormTarget, setGoalFormTarget] = useState('');
  const [goalFormDate, setGoalFormDate] = useState('');
  const [goalFormErr, setGoalFormErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [trendSel, setTrendSel] = useState(5);
  const [toastMsg, setToastMsg] = useState('');
  const [quickNlp, setQuickNlp] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [confettiActive, setConfettiActive] = useState(false);
  const [soundMuted, setSoundMuted] = useState(() => sound.isMuted());
  const [showMLStudio, setShowMLStudio] = useState(false);

  // Cloud Sync state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimeoutRef = useRef<number | null>(null);

  // Google Drive state
  const [driveState, setDriveState] = useState<DriveSyncStatus>(getDriveStatus());
  const driveSyncTimeoutRef = useRef<number | null>(null);

  const snapInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const attachTargetRef = useRef<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const warnedStorageRef = useRef(false);

  const showToast = (m: string) => {
    setToastMsg(m);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg('');
    }, 2600);
  };

  const mergeRemoteState = (prev: AppState, remote: Partial<AppState>): AppState => {
    const mergeBook = (prevBook: typeof prev.personal, remBook?: typeof prev.personal) => {
      if (!remBook) return prevBook;
      const mergedTxns = (remBook.txns || []).map((rt) => {
        if (!rt.receipt) {
          const localMatch = prevBook.txns.find((lt) => lt.id === rt.id);
          if (localMatch && localMatch.receipt) {
            return { ...rt, receipt: localMatch.receipt, rw: localMatch.rw, rh: localMatch.rh };
          }
        }
        return rt;
      });
      return {
        ...prevBook,
        ...remBook,
        txns: mergedTxns,
        goals: remBook.goals || prevBook.goals,
        policy: remBook.policy || prevBook.policy,
      };
    };

    return {
      ...prev,
      ...remote,
      personal: mergeBook(prev.personal, remote.personal),
      shop: mergeBook(prev.shop, remote.shop),
    };
  };

  // Firebase Auth initialization & Cloud Ledger check
  useEffect(() => {
    testConnection().catch(console.error);
    const unsub = subscribeAuth((user) => {
      setCurrentUser(user);
      if (user) {
        pullLedgerFromCloud(user.uid)
          .then((remote) => {
            if (remote && remote.state && Object.keys(remote.state).length > 0) {
              setS((prev) => mergeRemoteState(prev, remote.state));
              setLastSyncedAt(remote.updatedAt);
            }
          })
          .catch(console.error);
      }
    });
    return () => unsub();
  }, []);

  // Automatic cloud sync on financial state updates when logged in
  useEffect(() => {
    if (!currentUser) return;
    if (syncTimeoutRef.current) window.clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = window.setTimeout(async () => {
      setIsSyncing(true);
      try {
        const ts = await pushLedgerToCloud(currentUser.uid, S);
        setLastSyncedAt(ts);
      } catch (err) {
        console.warn('Auto cloud sync failed:', err);
      } finally {
        setIsSyncing(false);
      }
    }, 2200);
    return () => {
      if (syncTimeoutRef.current) window.clearTimeout(syncTimeoutRef.current);
    };
  }, [S, currentUser]);

  // Subscribe to Google Drive status
  useEffect(() => {
    const unsub = subscribeDriveStatus((st) => {
      setDriveState(st);
    });
    return unsub;
  }, []);

  // Automatic Google Drive sync on financial state updates
  useEffect(() => {
    if (!driveState.isConnected || !driveState.autoSync) return;
    if (driveSyncTimeoutRef.current) window.clearTimeout(driveSyncTimeoutRef.current);
    driveSyncTimeoutRef.current = window.setTimeout(async () => {
      try {
        await syncLedgerToGoogleDrive(S);
      } catch (err) {
        console.warn('Auto Google Drive sync failed:', err);
      }
    }, 2800);
    return () => {
      if (driveSyncTimeoutRef.current) window.clearTimeout(driveSyncTimeoutRef.current);
    };
  }, [S, driveState.isConnected, driveState.autoSync]);

  // Persist state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(KEY2, JSON.stringify(S));
    } catch {
      if (!warnedStorageRef.current) {
        warnedStorageRef.current = true;
        showToast('This device is not keeping your entries. Try removing some bill photos.');
      }
    }
  }, [S]);

  // Theme management
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Lock body scroll when detail modal is open
  useEffect(() => {
    document.body.classList.toggle('lock', Boolean(openId));
    if (openId && sheetRef.current) {
      sheetRef.current.focus();
    }
  }, [openId]);

  // Escape key closes detail sheet
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openId) {
        setOpenId(null);
        setNoteEdit(false);
        setImgBig(false);
        setArmDel(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openId]);

  // Expose test hook for compatibility
  useEffect(() => {
    const w = window as any;
    if (typeof w.__LE_TEST__ === 'function') {
      w.__LE_TEST__({
        buildPdf: () => buildPdf(S),
        S: () => S,
        calc,
        gstSummary: (m: AccountMode, ym: string) => gstSummary(S, m, ym),
        monthTx: (m: AccountMode, ym: string) => monthTx(S, m, ym),
        totals,
        openingBal: (m: AccountMode, ym: string) => openingBal(S, m, ym),
        stOf: (t: Transaction, m: AccountMode) => stOf(S, t, m),
        statusCounts: (list: Transaction[]) => statusCounts(S, list),
      });
    }
  }, [S]);

  const currentBook = S[S.mode];
  const currentMonthTxns = useMemo(() => monthTx(S, S.mode, S.ym), [S]);
  const monthTotals = useMemo(() => totals(currentMonthTxns), [currentMonthTxns]);
  const monthCounts = useMemo(() => statusCounts(S, currentMonthTxns), [S, currentMonthTxns]);
  const monthGst = useMemo(() => gstSummary(S, S.mode, S.ym), [S]);

  // Live ML Prediction for the Capture (add) draft
  const liveDraftPrediction = useMemo(() => {
    return predictCategory({
      mode: S.mode,
      type: draft.type,
      vendor: draft.vendor,
      note: draft.note,
      items: draft.items,
      amount: parseAmt(draft.amount),
      time: draft.time,
      method: draft.method,
      existingTxns: currentBook.txns,
    });
  }, [
    S.mode,
    draft.type,
    draft.vendor,
    draft.note,
    draft.items,
    draft.amount,
    draft.time,
    draft.method,
    currentBook.txns,
  ]);

  // Active category in draft: either user-overridden or ML-predicted
  const effectiveDraftCategory = useMemo(() => {
    if (draft.type === 'save') return 'Savings';
    const cats = CATEGORIES[S.mode][draft.type as 'debit' | 'credit'];
    if (draft.manualCat && draft.category && cats.includes(draft.category)) {
      return draft.category;
    }
    if (
      liveDraftPrediction.confidence > 0 &&
      cats.includes(liveDraftPrediction.topCategory)
    ) {
      return liveDraftPrediction.topCategory;
    }
    return draft.category || cats[0];
  }, [S.mode, draft.type, draft.manualCat, draft.category, liveDraftPrediction]);

  const closeModal = () => {
    if (openId) sound.playWhoosh();
    setOpenId(null);
    setNoteEdit(false);
    setImgBig(false);
    setArmDel(false);
  };

  const clearTransient = () => {
    setJustId(null);
    setArmDel(false);
    setConfirmDelGoal(null);
    setMsg('');
  };

  const switchView = (v: ViewType) => {
    sound.playPop();
    setView(v);
    closeModal();
    clearTransient();
    window.scrollTo(0, 0);
  };

  const handleModeSwitch = (m: AccountMode) => {
    if (S.mode === m) return;
    setS((prev) => ({ ...prev, mode: m }));
    setDraft(createNewDraft());
    setEditId(null);
    closeModal();
    clearTransient();
    setShowGoalForm(false);
    setLf('all');
    setQ('');
  };

  const handleClearSamples = () => {
    setS((prev) => ({
      ...prev,
      personal: {
        ...prev.personal,
        txns: prev.personal.txns.filter((x) => !x.sample),
        goals: prev.personal.goals.filter((x) => !x.sample),
        monthlyTarget: 0,
      },
      shop: {
        ...prev.shop,
        txns: prev.shop.txns.filter((x) => !x.sample),
        goals: prev.shop.goals.filter((x) => !x.sample),
        monthlyTarget: 0,
      },
    }));
    showToast('Examples cleared');
  };

  const handleSaveEntry = () => {
    const amt = parseAmt(draft.amount);
    const tip = parseAmt(draft.tip);
    const mode = S.mode;
    if (!(amt > 0)) {
      setDraft((d) => ({ ...d, err: 'Enter an amount greater than zero.' }));
      return;
    }
    if (!draft.date) {
      setDraft((d) => ({ ...d, err: 'Pick a date for this entry.' }));
      return;
    }
    if (draft.type === 'debit' && tip >= amt) {
      setDraft((d) => ({ ...d, err: 'The tip must be less than the total.' }));
      return;
    }
    if (draft.method === 'card' && draft.last4 && !/^\d{4}$/.test(draft.last4)) {
      setDraft((d) => ({ ...d, err: 'Card last 4 digits must be exactly 4 numbers.' }));
      return;
    }
    if (
      mode === 'shop' &&
      draft.type === 'debit' &&
      draft.rate > 0 &&
      draft.gstin &&
      !GSTIN_RE.test(draft.gstin)
    ) {
      setDraft((d) => ({
        ...d,
        err: 'Check the vendor GSTIN. It has 15 characters, like 07ABCDE1234F1Z5.',
      }));
      return;
    }

    const isSave = draft.type === 'save';
    const gstOn = draft.type === 'debit' || (draft.type === 'credit' && mode === 'shop');
    const chosenCat = isSave ? 'Savings' : effectiveDraftCategory;
    const cleanItems = draft.items
      .filter((i) => i.n.trim() || parseAmt(i.a) > 0)
      .map((i) => ({ n: i.n.trim() || 'Item', a: r2(parseAmt(i.a)) }));

    // Train ML model on this confirmed transaction
    if (!isSave) {
      const fullText = `${draft.vendor} ${draft.note} ${cleanItems.map((i) => i.n).join(' ')}`.trim();
      if (fullText) {
        recordMLTraining({
          mode,
          type: draft.type as 'debit' | 'credit',
          text: fullText,
          amount: r2(amt),
          time: draft.time,
          method: draft.method,
          category: chosenCat,
          gstRate: gstOn ? draft.rate : 0,
          predicted: liveDraftPrediction.topCategory,
          confidence: liveDraftPrediction.confidence,
        });
      }
    }

    const newId = editId || uid();
    const nextRseq = editId ? S.rseq : S.rseq + 1;
    const nextRid = editId ? draft.rid : makeRid(nextRseq);

    const newTxn: Transaction = {
      id: newId,
      rid: nextRid,
      date: draft.date,
      time: draft.time,
      type: draft.type,
      amount: r2(amt),
      category: chosenCat,
      vendor: isSave ? '' : draft.vendor.trim(),
      note: draft.note.trim(),
      rate: gstOn ? draft.rate : 0,
      gstin: mode === 'shop' && draft.type === 'debit' && draft.rate > 0 ? draft.gstin : '',
      tip: draft.type === 'debit' ? r2(tip) : 0,
      method: isSave ? '' : draft.method,
      last4: draft.method === 'card' ? draft.last4 : '',
      items: isSave ? [] : cleanItems,
      receipt: isSave ? null : draft.receipt,
      rw: draft.rw,
      rh: draft.rh,
      flagged: false,
      cleared: false,
      goalId: isSave ? draft.goalId : undefined,
      mlConfidence: liveDraftPrediction.confidence || 90,
      mlAuto: !draft.manualCat,
    };

    setS((prev) => {
      const book = prev[mode];
      let nextTxns: Transaction[];
      if (editId) {
        nextTxns = book.txns.map((x) =>
          x.id === editId
            ? { ...newTxn, id: x.id, rid: x.rid, flagged: x.flagged, cleared: x.cleared }
            : x
        );
      } else {
        nextTxns = [...book.txns, newTxn];
      }
      return {
        ...prev,
        rseq: nextRseq,
        ym: ymOf(newTxn.date),
        [mode]: {
          ...book,
          txns: nextTxns,
        },
      };
    });

    sound.playCoinSound();
    setConfettiActive(true);
    setJustId(newId);
    setDraft(createNewDraft());
    setEditId(null);
    setView('ledger');
    setLf('all');
    setQ('');
    showToast(
      !isSave && !draft.manualCat
        ? `🎉 Saved! Auto-categorized as ${chosenCat} (${liveDraftPrediction.confidence}%)`
        : '🎉 Saved to PennyPop!'
    );
  };

  // Handle photo upload for Capture
  const handleCapturePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    shrinkImage(file, (r) => {
      if (!r) {
        showToast('That photo could not be read. Try another image.');
        return;
      }
      const fileHint = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b(img|dsc|screenshot|photo|bill|receipt|\d+)\b/gi, '')
        .trim();

      setDraft((prev) => {
        const base = view !== 'add' ? createNewDraft('debit') : { ...prev };
        if (base.type === 'save') base.type = 'debit';
        base.receipt = r.url;
        base.rw = r.w;
        base.rh = r.h;
        base.err = '';
        if (!base.vendor && fileHint.length >= 3) {
          base.vendor = fileHint.charAt(0).toUpperCase() + fileHint.slice(1);
        }
        return base;
      });
      if (view !== 'add') setEditId(null);
      setView('add');
      closeModal();
      showToast('Bill photo attached · ML ready');
    });
  };

  // Handle photo attach to existing entry
  const handleAttachPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const targetId = attachTargetRef.current;
    shrinkImage(file, (r) => {
      if (!r) {
        showToast('That photo could not be read. Try another image.');
        return;
      }
      if (!targetId) return;
      setS((prev) => {
        const book = prev[prev.mode];
        return {
          ...prev,
          [prev.mode]: {
            ...book,
            txns: book.txns.map((x) =>
              x.id === targetId ? { ...x, receipt: r.url, rw: r.w, rh: r.h } : x
            ),
          },
        };
      });
      setJustId(targetId);
      showToast('Bill attached');
    });
  };

  // Handle 1-click Sample Bill Scan with OCR + ML Categorization
  const handleScanSampleBill = (tpl: SampleBillTemplate) => {
    const lines: Array<[string, string]> = tpl.items.map((i) => [i.n, i.a.toFixed(2)]);
    if (tpl.tip) lines.push(['Tip', tpl.tip.toFixed(2)]);
    const c = calc({ type: 'debit', amount: tpl.amount, rate: tpl.rate, tip: tpl.tip });
    const slip = sampleReceipt(
      tpl.vendor,
      lines,
      `Rs.${tpl.amount.toFixed(2)}`,
      c.gst ? c.gst.toFixed(2) : ''
    );

    const pred = predictCategory({
      mode: S.mode,
      type: 'debit',
      vendor: tpl.vendor,
      note: tpl.note,
      items: tpl.items,
      amount: tpl.amount,
      method: tpl.method,
      existingTxns: currentBook.txns,
    });

    setEditId(null);
    setDraft({
      type: 'debit',
      amount: String(tpl.amount),
      vendor: tpl.vendor,
      category: pred.topCategory,
      rate: tpl.rate,
      gstin: tpl.gstin,
      tip: tpl.tip ? String(tpl.tip) : '',
      method: tpl.method,
      last4: tpl.method === 'card' ? '4088' : '',
      date: todayStr(),
      time: nowTime(),
      note: tpl.note,
      receipt: slip ? slip.url : null,
      rw: slip ? slip.w : 0,
      rh: slip ? slip.h : 0,
      items: tpl.items.map((i) => ({ n: i.n, a: String(i.a) })),
      goalId: 'general',
      err: '',
      rid: '',
      manualCat: false,
      manualRate: true,
    });
    setView('add');
    closeModal();
    showToast(`Scanned ${tpl.vendor} · ML predicted ${pred.topCategory} (${pred.confidence}%)`);
  };

  // Quick Natural Language bar handler
  const handleApplyQuickNlp = (parsed: NonNullable<ReturnType<typeof parseNaturalExpense>>) => {
    setEditId(null);
    setDraft({
      ...createNewDraft(parsed.type),
      amount: parsed.amount,
      vendor: parsed.vendor,
      note: parsed.note,
      method: parsed.method,
      rate: parsed.rate,
      category: parsed.category,
      manualCat: false,
      manualRate: parsed.rate > 0,
    });
    setQuickNlp('');
    setView('add');
    closeModal();
    showToast(
      `Parsed expense · ML predicted ${parsed.prediction.topCategory} (${parsed.prediction.confidence}%)`
    );
  };

  // Batch ML Re-categorize across current month
  const handleBatchRecategorize = (): number => {
    let updatedCount = 0;
    setS((prev) => {
      const book = prev[prev.mode];
      const nextTxns = book.txns.map((t) => {
        if (ymOf(t.date) !== prev.ym || t.type === 'save') return t;
        const pred = predictCategory({
          mode: prev.mode,
          type: t.type,
          vendor: t.vendor,
          note: t.note,
          items: t.items,
          amount: t.amount,
          time: t.time,
          method: t.method,
          existingTxns: book.txns.filter((x) => x.id !== t.id),
        });
        if (
          (t.category === 'Other' && pred.topCategory !== 'Other' && pred.confidence >= 60) ||
          !t.mlConfidence
        ) {
          updatedCount++;
          return {
            ...t,
            category: t.category === 'Other' ? pred.topCategory : t.category,
            mlConfidence: pred.confidence,
            mlAuto: true,
          };
        }
        return { ...t, mlConfidence: pred.confidence };
      });
      return {
        ...prev,
        [prev.mode]: {
          ...book,
          txns: nextTxns,
        },
      };
    });
    return updatedCount;
  };

  // Teach custom vendor rule
  const handleTrainCustom = (vendor: string, category: string, gstRate: number) => {
    recordMLTraining({
      mode: S.mode,
      type: 'debit',
      text: `${vendor} ${vendor}`,
      category,
      gstRate,
      predicted: category,
      confidence: 99,
    });
    showToast(`ML learned: "${vendor}" → ${category}`);
  };

  // Export CSV
  const handleExportCsv = async () => {
    const list = monthTx(S, S.mode, S.ym).slice().reverse();
    const mode = S.mode;
    if (!list.length) {
      showToast('No entries to export for this month.');
      return;
    }
    const csvCell = (v: any) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = [
      'Receipt ID',
      'Date',
      'Time',
      'Type',
      'Vendor',
      'Category',
      'ML Confidence %',
      'Payment',
      'Taxable value',
      'GST rate %',
      'GST',
      'CGST',
      'SGST',
      'Tip',
      'Total',
      'Vendor GSTIN',
      'Status',
      'Note',
    ];
    const rows = list.map((t) => {
      const c = calc(t);
      return [
        t.rid,
        t.date,
        t.time,
        { debit: 'Debit', credit: 'Credit', save: 'Savings' }[t.type],
        entryTitle(S, t, mode),
        t.category,
        t.mlConfidence || 92,
        payLabel(t).replace(DOTS, 'xxxx'),
        c.taxable.toFixed(2),
        c.rate,
        c.gst.toFixed(2),
        c.cgst.toFixed(2),
        c.sgst.toFixed(2),
        c.tip.toFixed(2),
        t.amount.toFixed(2),
        t.gstin || '',
        ST_LABEL[stOf(S, t, mode)],
        t.note,
      ];
    });
    const csv =
      '\uFEFF' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    try {
      await saveFile(
        `FinSense-Ledger-${MODE_LABEL[mode]}-${S.ym}.csv`,
        csv,
        'text/csv;charset=utf-8'
      );
      showToast('Ledger CSV downloaded');
    } catch {
      showToast('The CSV could not be saved. Try again.');
    }
  };

  // Download PDF statement
  const handleMakePdf = async () => {
    setMsg('');
    setBusy(true);
    try {
      const buf = buildPdf(S);
      await saveFile(
        `FinSense-${MODE_LABEL[S.mode]}-${S.ym}.pdf`,
        buf,
        'application/pdf'
      );
      setMsg('Statement downloaded.');
      showToast('PDF statement downloaded');
    } catch {
      setMsg('The statement could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // Filtered & sorted ledger entries
  const filteredLedgerList = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = currentMonthTxns.filter((t) => {
      if (lf !== 'all' && stOf(S, t, S.mode) !== lf) return false;
      if (!needle) return true;
      return (
        [
          entryTitle(S, t, S.mode),
          t.vendor,
          t.category,
          t.note,
          t.rid,
          t.gstin,
          payLabel(t),
          t.amount,
        ]
          .join(' ')
          .toLowerCase()
          .indexOf(needle) !== -1
      );
    });
    const copy = [...list];
    if (sortBy === 'new') copy.reverse();
    else if (sortBy === 'high') copy.sort((a, b) => b.amount - a.amount);
    return copy;
  }, [currentMonthTxns, lf, q, sortBy, S]);

  // Open detail modal transaction
  const openTxn = useMemo(
    () => (openId ? currentBook.txns.find((x) => x.id === openId) || null : null),
    [openId, currentBook.txns]
  );

  const openTxnPrediction = useMemo(() => {
    if (!openTxn || openTxn.type === 'save') return null;
    return predictCategory({
      mode: S.mode,
      type: openTxn.type,
      vendor: openTxn.vendor,
      note: openTxn.note,
      items: openTxn.items,
      amount: openTxn.amount,
      time: openTxn.time,
      method: openTxn.method,
      existingTxns: currentBook.txns.filter((x) => x.id !== openTxn.id),
    });
  }, [openTxn, S.mode, currentBook.txns]);

  const hasSample =
    currentBook.txns.some((x) => x.sample) || currentBook.goals.some((x) => x.sample);

  const attentionCount = monthCounts.pending + monthCounts.flagged;

  return (
    <div className={`workspace-shell${showMLStudio ? ' split-active' : ''}`}>
      <div id="app">
        {/* Sticky Top Header */}
        <header className="top">
          <div className="row1">
            <h1
              className="brand"
              onClick={() => switchView('ledger')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <BrandLogo />
              <span>PennyPop</span>
            </h1>
            <div className="r1r">
              {/* Cloud Sync Status & Trigger */}
              <button
                type="button"
                className={`icon-btn cloud-sync-btn${currentUser ? ' on' : ''}`}
                onClick={() => {
                  sound.playPop();
                  setShowCloudModal(true);
                }}
                aria-label="Cloud Sync & Backup"
                title={
                  currentUser
                    ? `Cloud Sync: ${currentUser.displayName || currentUser.email || 'Guest Member'} (${
                        isSyncing ? 'Syncing…' : 'Saved to Cloud'
                      })`
                    : 'Tap to connect Cloud Sync'
                }
                style={{ position: 'relative' }}
              >
                {currentUser?.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt="User"
                    style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={currentUser ? 'var(--ok)' : 'currentColor'}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                    {currentUser && <path d="m9 12 2 2 4-4" stroke="var(--ok)" strokeWidth="2.4" />}
                  </svg>
                )}
                {isSyncing ? (
                  <span className="cloud-syncing-dot" />
                ) : currentUser ? (
                  <span className="cloud-pulse-dot" />
                ) : null}
              </button>

              {/* Sound Effects Toggle */}
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  const m = sound.toggleMute();
                  setSoundMuted(m);
                  showToast(m ? 'Sound muted 🔇' : 'Sound effects on 🔔');
                }}
                aria-label={soundMuted ? 'Unmute sound effects' : 'Mute sound effects'}
                title={soundMuted ? 'Sounds muted (click to unmute)' : 'Sounds active (click to mute)'}
              >
                {soundMuted ? ICON.soundOff : ICON.soundOn}
              </button>

              {/* Theme Toggle */}
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  sound.playPop();
                  setTheme((t) => (t === 'light' ? 'dark' : 'light'));
                }}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                title="Toggle light/dark mode"
              >
                {theme === 'light' ? ICON.moon : ICON.sun}
              </button>

              {/* AI Categorizer Studio Toggle */}
              <button
                type="button"
                className={`icon-btn${showMLStudio ? ' on' : ''}`}
                onClick={() => {
                  sound.playPop();
                  setShowMLStudio((prev) => !prev);
                  showToast(showMLStudio ? 'AI Studio closed' : 'AI Studio opened ✨');
                }}
                aria-label="Toggle ML Categorization Studio"
                title={showMLStudio ? 'Hide AI Studio' : 'Open AI Studio'}
              >
                {ICON.cpu}
              </button>

              {/* Settings / Policy */}
              <button
                type="button"
                className={`icon-btn${view === 'policy' ? ' on' : ''}`}
                onClick={() => {
                  sound.playPop();
                  switchView('policy');
                }}
                aria-label="Policy, GST and Settings"
                title="Policy, GST & Settings"
              >
                {ICON.shieldck}
              </button>
            </div>
          </div>

          <div className="row2">
            <div className="mode" role="group" aria-label="Account mode">
              {(['personal', 'shop'] as AccountMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={S.mode === m}
                  onClick={() => handleModeSwitch(m)}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <div className="mstep">
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setS((prev) => ({ ...prev, ym: shiftYm(prev.ym, -1) }));
                  setTrendSel(5);
                  clearTransient();
                }}
                aria-label="Previous month"
              >
                {ICON.left}
              </button>
              <span className="label">{monthLabel(S.ym)}</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setS((prev) => ({ ...prev, ym: shiftYm(prev.ym, 1) }));
                  setTrendSel(5);
                  clearTransient();
                }}
                aria-label="Next month"
              >
                {ICON.right}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main>
          {/* VIEW 1: LEDGER */}
          {view === 'ledger' && (
            <>
              {hasSample && (
                <div className="banner">
                  <span>These are example entries so you can see how it works.</span>
                  <button type="button" onClick={handleClearSamples}>
                    Clear examples
                  </button>
                </div>
              )}

              {/* Quick Natural Language ML Expense Input */}
              <form
                className="nlp-bar"
                onSubmit={(e) => {
                  e.preventDefault();
                  const parsed = parseNaturalExpense(quickNlp, S.mode, currentBook.txns);
                  if (parsed) handleApplyQuickNlp(parsed);
                }}
              >
                <span style={{ color: 'var(--accent)', display: 'grid', placeItems: 'center' }}>
                  {ICON.cpu}
                </span>
                <input
                  type="text"
                  value={quickNlp}
                  onChange={(e) => setQuickNlp(e.target.value)}
                  placeholder={
                    S.mode === 'personal'
                      ? 'Quick ML add: "Paid 280 at Blue Tokai for coffee"'
                      : 'Quick ML add: "Paid 4200 at Sharma Traders for stock"'
                  }
                  aria-label="Quick ML expense entry"
                />
                {quickNlp.trim() && (
                  <button
                    type="submit"
                    className="btn sm"
                    style={{ height: '32px', padding: '0 12px', fontSize: '12.5px' }}
                  >
                    Auto-Fill
                  </button>
                )}
              </form>

              {/* Monthly Summary Card */}
              {(() => {
                const p = currentBook.policy;
                const pct = p.limit > 0 ? Math.round((monthTotals.debit / p.limit) * 100) : 0;
                const mcls = pct > 100 ? 'bad' : pct >= 80 ? 'warn' : '';
                const left = r2(p.limit - monthTotals.debit);
                return (
                  <>
                    {/* Playful Daily Streak & Budget Cheer Card */}
                    <div className="streak-card">
                      <span style={{ fontSize: '26px', lineHeight: 1 }}>🔥</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <b style={{ fontSize: '13.5px', color: 'var(--ink)' }}>PennyPop Budget Health</b>
                          <span className="pill pos" style={{ fontSize: '10.5px', padding: '2px 8px' }}>
                            {currentMonthTxns.length >= 5 ? 'Top Saver 🌟' : 'Active Track ⚡'}
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginTop: '2px' }}>
                          {currentMonthTxns.length > 0
                            ? `${currentMonthTxns.length} entries tracked this month. PennyPop is keeping you on budget!`
                            : 'No expenses tracked yet this month. Tap + Add to record your first!'}
                        </span>
                      </div>
                    </div>

                    <section className="card sumcard">
                      <div className="kicker">
                        {monthLabel(S.ym)} · {MODE_LABEL[S.mode]} ledger
                      </div>
                      <div className="bigrow">
                        <div>
                          <div className="bigamt">{inr2(monthTotals.debit)}</div>
                          <div className="capline">
                            {p.limit > 0
                              ? `of ${inr2(p.limit)} monthly limit`
                              : S.mode === 'shop'
                              ? 'paid out this month'
                              : 'spent this month'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn sm out"
                            onClick={() => {
                              sound.playPop();
                              switchView('statement');
                            }}
                            title="Generate & download PDF statement"
                          >
                            {ICON.doc}
                            Statement
                          </button>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => {
                              sound.playPop();
                              setEditId(null);
                              setDraft(createNewDraft('debit'));
                              switchView('add');
                            }}
                          >
                            {ICON.plus}
                            Add Expense
                          </button>
                        </div>
                      </div>

                    {p.limit > 0 ? (
                      <>
                        <div
                          className={`meter ${mcls}`}
                          role="progressbar"
                          aria-valuenow={Math.min(100, pct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Monthly limit used"
                        >
                          <i style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <div className="meter-l">
                          <span>{pct}% of monthly limit used</span>
                          <span className={`num ${left < 0 ? 'bad' : 'ok'}`}>
                            {left < 0
                              ? `${inr2(-left)} over limit`
                              : `${inr2(left)} remaining`}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="meter-l">
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => switchView('policy')}
                        >
                          Set a monthly limit
                        </button>
                      </div>
                    )}

                    <div className="counts">
                      {(
                        [
                          ['matched', 'Matched', 'var(--ok)'],
                          ['pending', 'Pending', 'var(--amber)'],
                          ['flagged', 'Flagged', 'var(--bad)'],
                        ] as const
                      ).map(([key, label, dotCol]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setLf(key)}
                        >
                          <b>{monthCounts[key]}</b>
                          <span>
                            <i style={{ background: dotCol }} />
                            {label}
                          </span>
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="pillrow"
                      onClick={() => switchView('policy')}
                    >
                      <span className="l">
                        {ICON.shieldck}
                        {S.mode === 'shop'
                          ? 'Input tax credit (claimable GST)'
                          : 'GST paid this month'}
                      </span>
                      <span className="num">
                        {inr2(S.mode === 'shop' ? monthGst.claim : monthGst.paid)}
                      </span>
                    </button>
                  </section>
                </>
              );
            })()}

              {/* Search, Sort & CSV Export Toolbar */}
              <div className="toolrow">
                <label className="search">
                  {ICON.search}
                  <input
                    id="f-search"
                    type="text"
                    autoComplete="off"
                    placeholder="Search vendor, note, #RC ID"
                    aria-label="Search entries"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 44, height: 44, borderRadius: 14 }}
                  onClick={() => {
                    const next =
                      sortBy === 'new' ? 'old' : sortBy === 'old' ? 'high' : 'new';
                    setSortBy(next);
                    showToast(
                      `Sorted: ${
                        {
                          new: 'newest first',
                          old: 'oldest first',
                          high: 'highest amount first',
                        }[next]
                      }`
                    );
                  }}
                  aria-label={`Sort: ${
                    {
                      new: 'newest first',
                      old: 'oldest first',
                      high: 'highest amount first',
                    }[sortBy]
                  }`}
                >
                  {ICON.sort}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 44, height: 44, borderRadius: 14 }}
                  onClick={handleExportCsv}
                  aria-label="Download ledger as CSV"
                >
                  {ICON.download}
                </button>
              </div>

              {/* Status Filter Chips */}
              <div className="filters" role="group" aria-label="Filter entries">
                {(
                  [
                    ['all', 'All', currentMonthTxns.length],
                    ['matched', 'Matched', monthCounts.matched],
                    ['pending', 'Pending', monthCounts.pending],
                    ['flagged', 'Flagged', monthCounts.flagged],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    className="chip"
                    aria-pressed={lf === key}
                    onClick={() => setLf(key)}
                  >
                    {label} <span>({count})</span>
                  </button>
                ))}
              </div>

              {/* Ledger Transaction Rows */}
              <div id="ledger-list">
                {!filteredLedgerList.length ? (
                  <div className="card empty">
                    {q.trim() || lf !== 'all'
                      ? 'No entries match. Try another filter or search.'
                      : `No entries in ${monthLabel(S.ym)} yet. Tap Capture to add your first one.`}
                  </div>
                ) : (
                  <div className="lcard">
                    <div className="lhead">
                      <span>Transaction &amp; merchant</span>
                      <span>Amount (INR ₹)</span>
                    </div>
                    {filteredLedgerList.map((t) => {
                      const s = stOf(S, t, S.mode);
                      const sub =
                        t.type === 'save'
                          ? 'Savings'
                          : `${t.category}${payLabel(t) ? ' · ' + payLabel(t) : ''}${
                              t.mlAuto ? ` · ML ${t.mlConfidence || 92}%` : ''
                            }`;
                      const sign =
                        t.type === 'credit' ? '+' : t.type === 'debit' ? '−' : '';
                      const cls =
                        t.type === 'credit'
                          ? 'c-credit'
                          : t.type === 'save'
                          ? 'c-save'
                          : '';
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`lrow${justId === t.id ? ' just' : ''}`}
                          onClick={() => {
                            setOpenId(t.id);
                            setNoteEdit(false);
                            setImgBig(false);
                            setArmDel(false);
                          }}
                        >
                          <span className={`tile ${t.type}`}>{iconFor(t)}</span>
                          <span className="lmain">
                            <b>
                              {entryTitle(S, t, S.mode)}
                              {justId === t.id && (
                                <span className="tag-just">Just added</span>
                              )}
                            </b>
                            <small>{sub}</small>
                            <small className="d">{dtLine(t)}</small>
                          </span>
                          <span className="lamt">
                            <span className={`a ${cls}`}>
                              {sign}
                              {inr2(t.amount)}
                            </span>
                            <StatusPill status={s} />
                            <span className="id">#{t.rid}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* VIEW 2: INSIGHTS */}
          {view === 'insights' &&
            (() => {
              const open = openingBal(S, S.mode, S.ym);
              const close = r2(
                open + monthTotals.credit - monthTotals.debit - monthTotals.save
              );
              const net = r2(monthTotals.credit - monthTotals.debit);
              const prev = totals(monthTx(S, S.mode, shiftYm(S.ym, -1)));
              const spentLbl = S.mode === 'shop' ? 'Paid out' : 'Spent';

              const renderDelta = (cur: number, prv: number, upIsGood: boolean) => {
                if (!(prv > 0))
                  return <span className="delta flat">No entries last month</span>;
                const d = ((cur - prv) / prv) * 100;
                if (Math.abs(d) < 0.05)
                  return <span className="delta flat">Same as last month</span>;
                const up = d > 0;
                return (
                  <span className={`delta ${up === upIsGood ? 'good' : 'bad'}`}>
                    <span aria-hidden="true">{up ? '▲' : '▼'}</span>
                    <span className="sr">{up ? 'Up' : 'Down'}</span>{' '}
                    {Math.abs(d).toFixed(1)}% <span className="vs">vs last month</span>
                  </span>
                );
              };

              // 6-month trend data
              const trendData: Array<{ ym: string; credit: number; debit: number }> = [];
              let mx = 0;
              for (let i = 5; i >= 0; i--) {
                const ym = shiftYm(S.ym, -i);
                const tt = totals(monthTx(S, S.mode, ym));
                trendData.push({ ym, credit: tt.credit, debit: tt.debit });
                mx = Math.max(mx, tt.credit, tt.debit);
              }

              const cats = byCategory(currentMonthTxns);
              const topCats = cats.slice(0, 5);
              const restAmt = cats
                .slice(5)
                .reduce((acc, c) => acc + c.amount, 0);
              if (restAmt > 0)
                topCats.push({ name: 'Other categories', amount: r2(restAmt) });

              return (
                <>
                  <h2>Insights</h2>
                  <section className="card">
                    <div className="between">
                      <span className="kicker">{monthLabel(S.ym)}</span>
                      <span className={`pill ${net < 0 ? 'neg' : 'pos'} num`}>
                        Net {signed(net)}
                      </span>
                    </div>
                    <div className="kicker" style={{ marginTop: 12 }}>
                      Closing balance
                    </div>
                    <div className={`bigamt ${close < 0 ? 'c-debit' : ''}`}>
                      {inr2(close)}
                    </div>
                    <div className="kv" style={{ marginTop: 6 }}>
                      <span className="k">Opening balance</span>
                      <span className="k num">{inr2(open)}</span>
                    </div>
                  </section>

                  <div className="kpis">
                    <div className="kpi">
                      <div className="k">{spentLbl}</div>
                      <div className="v c-debit">{inr(monthTotals.debit)}</div>
                      {renderDelta(monthTotals.debit, prev.debit, false)}
                    </div>
                    <div className="kpi">
                      <div className="k">Money in</div>
                      <div className="v c-credit">{inr(monthTotals.credit)}</div>
                      {renderDelta(monthTotals.credit, prev.credit, true)}
                    </div>
                    <div className="kpi">
                      <div className="k">Saved</div>
                      <div className="v c-save">{inr(monthTotals.save)}</div>
                      {renderDelta(monthTotals.save, prev.save, true)}
                    </div>
                    {!(monthTotals.credit > 0) ? (
                      <div className="kpi">
                        <div className="k">Money in used</div>
                        <div className="v">—</div>
                        <span className="delta flat">No money in yet</span>
                      </div>
                    ) : (
                      (() => {
                        const used = Math.round(
                          ((monthTotals.debit + monthTotals.save) /
                            monthTotals.credit) *
                            100
                        );
                        const over = used > 100;
                        const r = 24;
                        const c = 2 * Math.PI * r;
                        const p = Math.min(100, used);
                        return (
                          <div className="kpi ring-kpi">
                            <svg
                              width="64"
                              height="64"
                              viewBox="0 0 64 64"
                              role="img"
                              aria-label={`${used} percent of money in used or saved`}
                            >
                              <circle
                                cx="32"
                                cy="32"
                                r="24"
                                fill="none"
                                style={{ stroke: 'var(--surface-2)' }}
                                strokeWidth="8"
                              />
                              <circle
                                cx="32"
                                cy="32"
                                r="24"
                                fill="none"
                                style={{
                                  stroke: `var(${over ? '--bad' : '--accent'})`,
                                }}
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray={`${r2((p / 100) * c)} ${r2(c)}`}
                                transform="rotate(-90 32 32)"
                              />
                              <text
                                x="32"
                                y="36"
                                textAnchor="middle"
                                fontSize="13"
                                fontWeight="700"
                                style={{
                                  fill: 'var(--ink)',
                                  fontFamily: 'var(--font-num)',
                                }}
                              >
                                {used}%
                              </text>
                            </svg>
                            <div className="tx">
                              <div className="k">Money in used</div>
                              <span className="delta flat">
                                {spentLbl} plus saved
                              </span>
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>

                  {/* 6-month Trend Chart */}
                  <section className="card">
                    <div className="sec-head">
                      <h3>Last 6 months</h3>
                      <span className="sub">
                        Money in and {spentLbl.toLowerCase()}
                      </span>
                    </div>
                    {!(mx > 0) ? (
                      <p className="sub" style={{ marginTop: 10 }}>
                        Entries from the last six months will be charted here.
                      </p>
                    ) : (
                      (() => {
                        const W = 360;
                        const H = 190;
                        const L = 40;
                        const R = 8;
                        const T = 12;
                        const Bm = 28;
                        const cw = W - L - R;
                        const ch = H - T - Bm;
                        const ymax = niceMax(mx);
                        const gw = cw / 6;
                        const bw = 14;
                        const gap = 2;
                        const sy = (v: number) => T + ch - (v / ymax) * ch;
                        const renderBar = (
                          x: number,
                          y: number,
                          w: number,
                          h: number,
                          fillCol: string
                        ) => {
                          if (!(h > 0)) return null;
                          const rx = r2(x);
                          const ry = r2(y);
                          const rw = r2(w);
                          const rh = r2(h);
                          const rad = Math.min(4, rh);
                          return (
                            <path
                              d={`M${rx} ${r2(ry + rh)}V${r2(
                                ry + rad
                              )}a${rad} ${rad} 0 0 1 ${rad} -${rad}H${r2(
                                rx + rw - rad
                              )}a${rad} ${rad} 0 0 1 ${rad} ${rad}V${r2(
                                ry + rh
                              )}Z`}
                              style={{ fill: fillCol }}
                            />
                          );
                        };
                        const selData = trendData[trendSel] || trendData[5];
                        const selNet = r2(selData.credit - selData.debit);
                        return (
                          <>
                            <svg
                              className="chart"
                              viewBox={`0 0 ${W} ${H}`}
                              role="group"
                              aria-label={`Money in and ${spentLbl.toLowerCase()} for the last six months`}
                            >
                              {[0, 0.5, 1].map((f) => {
                                const yy = r2(sy(ymax * f));
                                return (
                                  <React.Fragment key={f}>
                                    <line
                                      className="gl"
                                      x1={L}
                                      x2={W - R}
                                      y1={yy}
                                      y2={yy}
                                    />
                                    <text
                                      className="tk"
                                      x={L - 6}
                                      y={r2(yy + 3.5)}
                                      textAnchor="end"
                                    >
                                      {compact(ymax * f)}
                                    </text>
                                  </React.Fragment>
                                );
                              })}
                              {trendData.map((d, i) => {
                                const gx = L + i * gw;
                                const cx = gx + gw / 2;
                                const sel = i === trendSel;
                                return (
                                  <React.Fragment key={d.ym}>
                                    {sel && (
                                      <rect
                                        className="sel"
                                        x={r2(gx + 2)}
                                        y={T}
                                        width={r2(gw - 4)}
                                        height={ch}
                                        rx="6"
                                      />
                                    )}
                                    {renderBar(
                                      cx - bw - gap / 2,
                                      sy(d.credit),
                                      bw,
                                      (d.credit / ymax) * ch,
                                      'var(--s1)'
                                    )}
                                    {renderBar(
                                      cx + gap / 2,
                                      sy(d.debit),
                                      bw,
                                      (d.debit / ymax) * ch,
                                      'var(--s2)'
                                    )}
                                    <text
                                      className={`ml${sel ? ' on' : ''}`}
                                      x={r2(cx)}
                                      y={H - 8}
                                      textAnchor="middle"
                                    >
                                      {MON3[+d.ym.slice(5) - 1]}
                                    </text>
                                    <rect
                                      className="hit"
                                      x={r2(gx)}
                                      y={0}
                                      width={r2(gw)}
                                      height={H}
                                      tabIndex={0}
                                      role="button"
                                      aria-label={`${monthLabel(
                                        d.ym
                                      )}: money in ${inr(
                                        d.credit
                                      )}, ${spentLbl.toLowerCase()} ${inr(
                                        d.debit
                                      )}`}
                                      onClick={() => setTrendSel(i)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          setTrendSel(i);
                                        }
                                      }}
                                    />
                                  </React.Fragment>
                                );
                              })}
                            </svg>
                            <div className="readout">
                              <b>{monthLabel(selData.ym)}</b>
                              <span>
                                <i
                                  className="sw"
                                  style={{ background: 'var(--s1)' }}
                                />
                                Money in{' '}
                                <span className="num">{inr(selData.credit)}</span>
                              </span>
                              <span>
                                <i
                                  className="sw"
                                  style={{ background: 'var(--s2)' }}
                                />
                                {spentLbl}{' '}
                                <span className="num">{inr(selData.debit)}</span>
                              </span>
                              <span>
                                Net{' '}
                                <span
                                  className={`num ${
                                    selNet < 0 ? 'c-debit' : 'c-credit'
                                  }`}
                                >
                                  {signed(selNet)}
                                </span>
                              </span>
                            </div>
                            <details className="tv">
                              <summary>View as table</summary>
                              <table>
                                <thead>
                                  <tr>
                                    <th>Month</th>
                                    <th>In</th>
                                    <th>{spentLbl}</th>
                                    <th>Net</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {trendData.map((x) => (
                                    <tr key={x.ym}>
                                      <td>
                                        {MON3[+x.ym.slice(5) - 1]}{' '}
                                        {x.ym.slice(0, 4)}
                                      </td>
                                      <td className="num">{inr(x.credit)}</td>
                                      <td className="num">{inr(x.debit)}</td>
                                      <td className="num">
                                        {signed(r2(x.credit - x.debit))}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </details>
                          </>
                        );
                      })()
                    )}
                  </section>

                  {/* Category Breakdown */}
                  {topCats.length > 0 && (
                    <section className="card">
                      <div className="sec-head">
                        <h3>Where the money went</h3>
                        <span className="sub num">{inr(monthTotals.debit)}</span>
                      </div>
                      <div
                        className="stack"
                        style={{ marginTop: 14 }}
                        role="img"
                        aria-label="Spending by category"
                      >
                        {topCats.map((c, i) => {
                          const colIdx =
                            c.name === 'Other categories' ? 6 : i + 1;
                          const tot = monthTotals.debit || 1;
                          return (
                            <i
                              key={c.name}
                              style={{
                                width: `${((c.amount / tot) * 100).toFixed(1)}%`,
                                background: `var(--s${colIdx})`,
                              }}
                            />
                          );
                        })}
                      </div>
                      <div className="legend">
                        {topCats.map((c, i) => {
                          const colIdx =
                            c.name === 'Other categories' ? 6 : i + 1;
                          const tot = monthTotals.debit || 1;
                          return (
                            <div key={c.name} className="li">
                              <span
                                className="sw"
                                style={{ background: `var(--s${colIdx})` }}
                              />
                              <span>{c.name}</span>
                              <span className="num">{inr(c.amount)}</span>
                              <span className="pc num">
                                {((c.amount / tot) * 100).toFixed(1)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              );
            })()}

          {/* VIEW 3: CAPTURE / ADD / EDIT */}
          {view === 'add' &&
            (() => {
              const editing = Boolean(editId);
              const isSave = draft.type === 'save';
              const showGst =
                draft.type === 'debit' ||
                (draft.type === 'credit' && S.mode === 'shop');
              const p = currentBook.policy;
              const cats = isSave ? [] : CATEGORIES[S.mode][draft.type as 'debit' | 'credit'];
              const amtNum = parseAmt(draft.amount);
              const tipNum = parseAmt(draft.tip);
              const gstPreview = !draft.rate
                ? 'No GST on this entry.'
                : !(amtNum > 0)
                ? 'Enter the total to see the GST split.'
                : (() => {
                    const c = calc({
                      type: draft.type,
                      amount: amtNum,
                      rate: draft.rate,
                      tip: tipNum,
                    });
                    return `Taxable ${inr2(c.taxable)} · GST ${inr2(
                      c.gst
                    )} (CGST ${inr2(c.cgst)} + SGST ${inr2(c.sgst)})`;
                  })();
              const itemsTotal = draft.items.reduce(
                (acc, i) => acc + parseAmt(i.a),
                0
              );
              const badGstin =
                S.mode === 'shop' &&
                draft.type === 'debit' &&
                draft.rate > 0 &&
                draft.gstin &&
                !GSTIN_RE.test(draft.gstin);

              const modeSamples = SAMPLE_BILL_TEMPLATES.filter(
                (t) => t.mode === S.mode
              );

              return (
                <>
                  <div className="between">
                    <h2>{editing ? 'Edit entry' : 'Capture a bill'}</h2>
                    <span className="num sub">
                      #{editing ? draft.rid : makeRid(S.rseq + 1)}
                    </span>
                  </div>
                  <p className="sub">
                    {editing
                      ? 'Change anything below, then save.'
                      : 'Add the details from your bill. Machine learning predicts the category and GST automatically.'}
                  </p>

                  {/* Bill Photo + 1-Tap Smart Scanner Presets */}
                  {!isSave && (
                    <section className="card photo">
                      {draft.receipt ? (
                        <>
                          <div className="slip sm">
                            <img
                              src={draft.receipt}
                              alt="Attached bill preview"
                            />
                          </div>
                          <div className="btnrow">
                            <button
                              type="button"
                              className="btn out sm"
                              onClick={() => snapInputRef.current?.click()}
                            >
                              Retake
                            </button>
                            <button
                              type="button"
                              className="btn out sm"
                              onClick={() => galleryInputRef.current?.click()}
                            >
                              Choose another
                            </button>
                            <button
                              type="button"
                              className="btn redsoft sm"
                              onClick={() =>
                                setDraft((d) => ({ ...d, receipt: null }))
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="drop">
                            {ICON.camera}
                            <div>
                              <b>Add a bill photo</b>
                              <span>
                                Optional
                                {p.bill > 0
                                  ? `, but spending of ${inr(
                                      p.bill
                                    )} or more shows as Pending bill without one.`
                                  : '.'}
                              </span>
                            </div>
                          </div>
                          <div className="btnrow">
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => snapInputRef.current?.click()}
                            >
                              {ICON.camera}
                              Take photo
                            </button>
                            <button
                              type="button"
                              className="btn out sm"
                              onClick={() => galleryInputRef.current?.click()}
                            >
                              Choose from gallery
                            </button>
                          </div>
                          <div
                            style={{
                              borderTop: '1px solid var(--line)',
                              paddingTop: 10,
                            }}
                          >
                            <span
                              className="lbl"
                              style={{ display: 'block', marginBottom: 6 }}
                            >
                              Or try 1-tap Smart Bill OCR + ML Auto-Categorizer:
                            </span>
                            <div className="chips">
                              {modeSamples.map((tpl) => (
                                <button
                                  key={tpl.id}
                                  type="button"
                                  className="chip"
                                  onClick={() => handleScanSampleBill(tpl)}
                                >
                                  {tpl.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </section>
                  )}

                  {/* Entry Type Segmented Control */}
                  <div className="seg" role="group" aria-label="Entry type">
                    {(
                      [
                        ['debit', S.mode === 'shop' ? 'Paid out' : 'Spent'],
                        ['credit', 'Money in'],
                        ['save', 'Save'],
                      ] as const
                    ).map(([tKey, tLabel]) => (
                      <button
                        key={tKey}
                        type="button"
                        data-type={tKey}
                        aria-pressed={draft.type === tKey}
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            type: tKey,
                            category: '',
                            manualCat: false,
                            err: '',
                            receipt: tKey === 'save' ? null : d.receipt,
                          }))
                        }
                      >
                        {tLabel}
                      </button>
                    ))}
                  </div>

                  {/* Amount Input */}
                  <div className="field">
                    <span className="lbl">
                      {isSave
                        ? 'Amount to save (₹)'
                        : 'Total on the bill, including GST (₹)'}
                    </span>
                    <div className="amount-wrap">
                      <span>₹</span>
                      <input
                        id="f-amount"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        aria-label="Amount in rupees"
                        value={draft.amount}
                        onChange={(e) => {
                          const c = e.target.value.replace(/[^0-9.]/g, '');
                          setDraft((d) => ({ ...d, amount: c }));
                        }}
                      />
                    </div>
                    {/* Quick amount presets */}
                    <div className="quick-chips-row">
                      {[50, 100, 200, 500, 1000, 2000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className="quick-amount-chip"
                          onClick={() => {
                            sound.playPop();
                            const curr = parseAmt(draft.amount);
                            setDraft((d) => ({ ...d, amount: String(r2(curr + preset)) }));
                          }}
                        >
                          +₹{preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form">
                    {isSave ? (
                      <div className="field">
                        <span className="lbl">Save into</span>
                        <div className="chips">
                          {currentBook.goals.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              className="chip"
                              aria-pressed={draft.goalId === g.id}
                              onClick={() => {
                                sound.playPop();
                                setDraft((d) => ({ ...d, goalId: g.id }));
                              }}
                            >
                              🎯 {g.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Vendor / Merchant Input */}
                        <div className="tf">
                          <input
                            id="f-vendor"
                            type="text"
                            placeholder=" "
                            autoComplete="off"
                            value={draft.vendor}
                            onChange={(e) => {
                              const v = e.target.value;
                              const nextPred = predictCategory({
                                mode: S.mode,
                                type: draft.type,
                                vendor: v,
                                note: draft.note,
                                items: draft.items,
                                amount: parseAmt(draft.amount),
                                time: draft.time,
                                method: draft.method,
                                existingTxns: currentBook.txns,
                              });
                              setDraft((d) => ({
                                ...d,
                                vendor: v,
                                rate: d.manualRate
                                  ? d.rate
                                  : nextPred.suggestedGstRate,
                              }));
                            }}
                          />
                          <label htmlFor="f-vendor">
                            {draft.type === 'credit'
                              ? S.mode === 'shop'
                                ? 'Customer or source'
                                : 'Received from'
                              : S.mode === 'shop'
                              ? 'Vendor or supplier'
                              : 'Shop or merchant'}
                          </label>
                        </div>

                        {/* Duplicate Transaction Warning from ML */}
                        {liveDraftPrediction.duplicateMatch && (
                          <div className="alertbox">
                            {ICON.alert}
                            <div>
                              <b>Possible duplicate detected</b>
                              <span>
                                Matches #{liveDraftPrediction.duplicateMatch.rid}{' '}
                                ({liveDraftPrediction.duplicateMatch.vendor} ·{' '}
                                {inr2(liveDraftPrediction.duplicateMatch.amount)}{' '}
                                on{' '}
                                {dLong(liveDraftPrediction.duplicateMatch.date)}
                                ).
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Category Selection + Live ML Auto-Categorizer Strip */}
                        <div className="field">
                          <div className="between">
                            <span className="lbl">Category</span>
                            <button
                              type="button"
                              className="text-btn"
                              style={{ fontSize: 12 }}
                              onClick={() => {
                                sound.playPop();
                                setDraft((d) => ({
                                  ...d,
                                  manualCat: !d.manualCat,
                                  category: liveDraftPrediction.topCategory,
                                }));
                              }}
                            >
                              {draft.manualCat
                                ? 'Switch to ML Auto-Predict'
                                : `ML Auto-Predict (${
                                    liveDraftPrediction.confidence || 85
                                  }%)`}
                            </button>
                          </div>
                          <div className="chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {cats.map((cname) => {
                              const isAct = effectiveDraftCategory === cname;
                              const emoji = CAT_EMOJIS[cname] || '🏷️';
                              return (
                                <button
                                  key={cname}
                                  type="button"
                                  className={`category-emoji-pill${isAct ? ' active' : ''}`}
                                  aria-pressed={isAct}
                                  onClick={() => {
                                    sound.playPop();
                                    setDraft((d) => ({
                                      ...d,
                                      category: cname,
                                      manualCat: true,
                                    }));
                                  }}
                                >
                                  <span>{emoji}</span>
                                  <span>{cname}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* ML Explainability Panel */}
                          {(draft.vendor.trim() ||
                            draft.note.trim() ||
                            draft.items.length > 0 ||
                            parseAmt(draft.amount) > 0) && (
                            <div className="ml-panel">
                              <div className="between">
                                <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                                  ML Prediction:{' '}
                                  <strong style={{ color: 'var(--accent)' }}>
                                    {liveDraftPrediction.topCategory}
                                  </strong>{' '}
                                  <span className="num">
                                    ({liveDraftPrediction.confidence}% confidence)
                                  </span>
                                </span>
                                <span
                                  style={{
                                    fontSize: 11.5,
                                    color: 'var(--muted)',
                                  }}
                                >
                                  {draft.manualCat
                                    ? 'Manual override'
                                    : 'Auto-selected'}
                                </span>
                              </div>
                              {liveDraftPrediction.rankings.map((rk) => {
                                const pct = Math.round(rk.probability * 100);
                                return (
                                  <div
                                    key={rk.category}
                                    className="ml-prob-row"
                                    onClick={() =>
                                      setDraft((d) => ({
                                        ...d,
                                        category: rk.category,
                                        manualCat: true,
                                      }))
                                    }
                                    style={{ cursor: 'pointer' }}
                                  >
                                    <span>{rk.category}</span>
                                    <div className="ml-prob-track">
                                      <div
                                        className="ml-prob-fill"
                                        style={{ width: `${Math.max(4, pct)}%` }}
                                      />
                                    </div>
                                    <span
                                      className="num"
                                      style={{
                                        textAlign: 'right',
                                        color: 'var(--muted)',
                                      }}
                                    >
                                      {pct}%
                                    </span>
                                  </div>
                                );
                              })}
                              {liveDraftPrediction.matchedSignals.length > 0 && (
                                <div
                                  className="sub"
                                  style={{ fontSize: 11.5 }}
                                >
                                  Signals:{' '}
                                  <span className="num">
                                    {liveDraftPrediction.matchedSignals.join(
                                      ' · '
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* GST Rate */}
                        {showGst && (
                          <>
                            <div className="field">
                              <span className="lbl">GST rate on the bill</span>
                              <div className="chips">
                                {RATES.map((r) => (
                                  <button
                                    key={r}
                                    type="button"
                                    className="chip"
                                    aria-pressed={draft.rate === r}
                                    onClick={() =>
                                      setDraft((d) => ({
                                        ...d,
                                        rate: r,
                                        manualRate: true,
                                        gstin: r ? d.gstin : '',
                                      }))
                                    }
                                  >
                                    {r ? `${r}%` : 'No GST'}
                                  </button>
                                ))}
                              </div>
                              <div id="gst-prev" className="gstprev">
                                {gstPreview}
                              </div>
                            </div>

                            {S.mode === 'shop' &&
                              draft.type === 'debit' &&
                              draft.rate > 0 && (
                                <>
                                  <div className={`tf${badGstin ? ' bad' : ''}`}>
                                    <input
                                      id="f-gstin"
                                      type="text"
                                      placeholder=" "
                                      autoComplete="off"
                                      maxLength={15}
                                      spellCheck={false}
                                      value={draft.gstin}
                                      onChange={(e) =>
                                        setDraft((d) => ({
                                          ...d,
                                          gstin: e.target.value.toUpperCase(),
                                        }))
                                      }
                                    />
                                    <label htmlFor="f-gstin">
                                      Vendor GSTIN (needed for input credit)
                                    </label>
                                  </div>
                                  {badGstin && (
                                    <p className="err" role="alert">
                                      A GSTIN has 15 characters, like
                                      07ABCDE1234F1Z5.
                                    </p>
                                  )}
                                </>
                              )}
                          </>
                        )}

                        {draft.type === 'debit' && (
                          <div className="tf">
                            <input
                              id="f-tip"
                              type="text"
                              placeholder=" "
                              inputMode="decimal"
                              autoComplete="off"
                              value={draft.tip}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  tip: e.target.value.replace(/[^0-9.]/g, ''),
                                }))
                              }
                            />
                            <label htmlFor="f-tip">
                              Tip or service charge (optional)
                            </label>
                          </div>
                        )}

                        <div className="field">
                          <span className="lbl">
                            {draft.type === 'credit'
                              ? 'Received via'
                              : 'Paid with'}
                          </span>
                          <div className="chips">
                            {METHODS.map(([mKey, mLabel]) => (
                              <button
                                key={mKey}
                                type="button"
                                className="chip"
                                aria-pressed={draft.method === mKey}
                                onClick={() =>
                                  setDraft((d) => ({
                                    ...d,
                                    method: mKey,
                                    last4: mKey === 'card' ? d.last4 : '',
                                  }))
                                }
                              >
                                {mLabel}
                              </button>
                            ))}
                          </div>
                        </div>

                        {draft.method === 'card' && (
                          <div className="tf">
                            <input
                              id="f-last4"
                              type="text"
                              placeholder=" "
                              inputMode="numeric"
                              maxLength={4}
                              autoComplete="off"
                              value={draft.last4}
                              onChange={(e) =>
                                setDraft((d) => ({
                                  ...d,
                                  last4: e.target.value
                                    .replace(/\D/g, '')
                                    .slice(0, 4),
                                }))
                              }
                            />
                            <label htmlFor="f-last4">Card last 4 digits</label>
                          </div>
                        )}
                      </>
                    )}

                    {/* Date & Time */}
                    <div className="two">
                      <div className="tf always">
                        <input
                          id="f-date"
                          type="date"
                          placeholder=" "
                          value={draft.date}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, date: e.target.value }))
                          }
                        />
                        <label htmlFor="f-date">Date</label>
                      </div>
                      <div className="tf always">
                        <input
                          id="f-time"
                          type="time"
                          placeholder=" "
                          value={draft.time}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, time: e.target.value }))
                          }
                        />
                        <label htmlFor="f-time">Time</label>
                      </div>
                    </div>

                    {/* Note */}
                    <div className="tf">
                      <input
                        id="f-note"
                        type="text"
                        placeholder=" "
                        autoComplete="off"
                        value={draft.note}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, note: e.target.value }))
                        }
                      />
                      <label htmlFor="f-note">Note (optional)</label>
                    </div>

                    {/* Line Items */}
                    {!isSave && (
                      <div className="field">
                        <span className="lbl">Line items (optional)</span>
                        {draft.items.map((it, idx) => (
                          <div key={idx} className="item-row">
                            <input
                              type="text"
                              autoComplete="off"
                              placeholder="Item"
                              aria-label={`Item ${idx + 1} name`}
                              value={it.n}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDraft((d) => {
                                  const next = [...d.items];
                                  next[idx] = { ...next[idx], n: val };
                                  return { ...d, items: next };
                                });
                              }}
                            />
                            <input
                              className="num"
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder="₹"
                              aria-label={`Item ${idx + 1} amount`}
                              value={it.a}
                              onChange={(e) => {
                                const val = e.target.value.replace(
                                  /[^0-9.]/g,
                                  ''
                                );
                                setDraft((d) => {
                                  const next = [...d.items];
                                  next[idx] = { ...next[idx], a: val };
                                  return { ...d, items: next };
                                });
                              }}
                            />
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={`Remove item ${idx + 1}`}
                              onClick={() =>
                                setDraft((d) => ({
                                  ...d,
                                  items: d.items.filter((_, i) => i !== idx),
                                }))
                              }
                            >
                              {ICON.x}
                            </button>
                          </div>
                        ))}
                        <div className="between">
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                items: [...d.items, { n: '', a: '' }],
                              }))
                            }
                          >
                            + Add item
                          </button>
                          <span id="items-sum" className="sub">
                            {itemsTotal > 0 && (
                              <>
                                Items total{' '}
                                <span className="num">
                                  {inr2(r2(itemsTotal))}
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {draft.err && (
                    <p className="err" role="alert">
                      {draft.err}
                    </p>
                  )}

                  <button
                    type="button"
                    className="btn"
                    onClick={handleSaveEntry}
                  >
                    {editing ? 'Save changes' : 'Add entry'}
                  </button>
                  {editing && (
                    <button
                      type="button"
                      className="btn out"
                      onClick={() => {
                        setDraft(createNewDraft());
                        setEditId(null);
                        switchView('ledger');
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </>
              );
            })()}

          {/* VIEW 4: SAVINGS */}
          {view === 'savings' &&
            (() => {
              const target = currentBook.monthlyTarget || 0;
              const pct =
                target > 0
                  ? Math.min(100, Math.round((monthTotals.save / target) * 100))
                  : 0;
              return (
                <>
                  <h2>Savings</h2>
                  <p className="sub">
                    Money you move into savings is tracked apart from spending
                    and never counts as an expense.
                  </p>

                  <section className="card form">
                    <div className="tf">
                      <input
                        id="f-target"
                        type="text"
                        placeholder=" "
                        inputMode="numeric"
                        value={currentBook.monthlyTarget || ''}
                        onChange={(e) => {
                          const val = parseAmt(
                            e.target.value.replace(/[^0-9.]/g, '')
                          );
                          setS((prev) => ({
                            ...prev,
                            [prev.mode]: {
                              ...prev[prev.mode],
                              monthlyTarget: val,
                            },
                          }));
                        }}
                      />
                      <label htmlFor="f-target">
                        Monthly savings target (₹)
                      </label>
                    </div>
                    {target > 0 ? (
                      <div>
                        <div className="target-line">
                          <span>Saved in {monthLabel(S.ym)}</span>
                          <span className="num">
                            {inr(monthTotals.save)} of {inr(target)}
                          </span>
                        </div>
                        <div
                          className="bar"
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label="Savings target progress"
                        >
                          <i style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    ) : (
                      <p className="sub">
                        Saved in {monthLabel(S.ym)}:{' '}
                        <span className="num c-save">
                          {inr(monthTotals.save)}
                        </span>
                      </p>
                    )}
                  </section>

                  {currentBook.goals.map((g) => {
                    const total = goalSaved(S, S.mode, g.id);
                    const gp =
                      g.target > 0
                        ? Math.min(100, Math.round((total / g.target) * 100))
                        : 0;
                    return (
                      <section key={g.id} className="card goal">
                        <div className="goal-head">
                          <b>{g.name}</b>
                          <span className="num c-save">{inr(total)}</span>
                        </div>
                        {g.target > 0 ? (
                          <>
                            <div
                              className="bar"
                              role="progressbar"
                              aria-valuenow={gp}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label={`${g.name} progress`}
                            >
                              <i style={{ width: `${gp}%` }} />
                            </div>
                            <div className="goal-meta">
                              <span className="num">
                                {gp}% of {inr(g.target)}
                              </span>
                              <span>
                                {g.deadline
                                  ? `By ${dFull(g.deadline)}`
                                  : 'No deadline'}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="goal-meta">
                            <span>
                              Everything you save without picking a goal lands
                              here.
                            </span>
                          </div>
                        )}
                        <div className="goal-actions">
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              const d = createNewDraft('save');
                              d.goalId = g.id;
                              setDraft(d);
                              setEditId(null);
                              switchView('add');
                            }}
                          >
                            Add money
                          </button>
                          {g.id !== 'general' && (
                            <button
                              type="button"
                              className="link-btn danger"
                              onClick={() => {
                                if (confirmDelGoal !== g.id) {
                                  setConfirmDelGoal(g.id);
                                  return;
                                }
                                setS((prev) => {
                                  const b = prev[prev.mode];
                                  return {
                                    ...prev,
                                    [prev.mode]: {
                                      ...b,
                                      goals: b.goals.filter(
                                        (x) => x.id !== g.id
                                      ),
                                      txns: b.txns.map((x) =>
                                        x.type === 'save' && x.goalId === g.id
                                          ? { ...x, goalId: 'general' }
                                          : x
                                      ),
                                    },
                                  };
                                });
                                setConfirmDelGoal(null);
                                showToast(
                                  'Goal removed. Its savings moved to General savings.'
                                );
                              }}
                            >
                              {confirmDelGoal === g.id
                                ? 'Tap again to remove'
                                : 'Remove goal'}
                            </button>
                          )}
                        </div>
                      </section>
                    );
                  })}

                  {showGoalForm ? (
                    <section className="card goal form">
                      <div className="tf">
                        <input
                          id="g-name"
                          type="text"
                          placeholder=" "
                          autoComplete="off"
                          value={goalFormName}
                          onChange={(e) => setGoalFormName(e.target.value)}
                        />
                        <label htmlFor="g-name">
                          {S.mode === 'shop'
                            ? 'Goal name, for example Stock money'
                            : 'Goal name, for example Trip to Goa'}
                        </label>
                      </div>
                      <div className="two">
                        <div className="tf">
                          <input
                            id="g-target"
                            type="text"
                            placeholder=" "
                            inputMode="numeric"
                            value={goalFormTarget}
                            onChange={(e) =>
                              setGoalFormTarget(
                                e.target.value.replace(/[^0-9.]/g, '')
                              )
                            }
                          />
                          <label htmlFor="g-target">Target (₹)</label>
                        </div>
                        <div className="tf always">
                          <input
                            id="g-date"
                            type="date"
                            placeholder=" "
                            value={goalFormDate}
                            onChange={(e) => setGoalFormDate(e.target.value)}
                          />
                          <label htmlFor="g-date">Deadline (optional)</label>
                        </div>
                      </div>
                      {goalFormErr && (
                        <p className="err" role="alert">
                          {goalFormErr}
                        </p>
                      )}
                      <div className="goal-actions">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            setShowGoalForm(false);
                            setGoalFormErr('');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="link-btn"
                          style={{
                            background: 'var(--accent)',
                            color: 'var(--on-accent)',
                            borderColor: 'var(--accent)',
                          }}
                          onClick={() => {
                            const nm = goalFormName.trim();
                            const tg = parseAmt(goalFormTarget);
                            if (!nm) {
                              setGoalFormErr('Give the goal a name.');
                              return;
                            }
                            if (!(tg > 0)) {
                              setGoalFormErr(
                                'Enter a target amount greater than zero.'
                              );
                              return;
                            }
                            setS((prev) => ({
                              ...prev,
                              [prev.mode]: {
                                ...prev[prev.mode],
                                goals: [
                                  ...prev[prev.mode].goals,
                                  {
                                    id: uid(),
                                    name: nm,
                                    target: tg,
                                    deadline: goalFormDate,
                                  },
                                ],
                              },
                            }));
                            setShowGoalForm(false);
                            setGoalFormName('');
                            setGoalFormTarget('');
                            setGoalFormDate('');
                            setGoalFormErr('');
                            showToast('Goal created');
                          }}
                        >
                          Create goal
                        </button>
                      </div>
                    </section>
                  ) : (
                    <button
                      type="button"
                      className="btn out"
                      onClick={() => setShowGoalForm(true)}
                    >
                      New savings goal
                    </button>
                  )}
                </>
              );
            })()}

          {/* VIEW 5: STATEMENT */}
          {view === 'statement' &&
            (() => {
              const open = openingBal(S, S.mode, S.ym);
              const close = r2(
                open + monthTotals.credit - monthTotals.debit - monthTotals.save
              );
              const bills = currentMonthTxns.filter((x) => x.receipt).length;
              const spentLbl = S.mode === 'shop' ? 'Paid out' : 'Spent';
              const gi = S.gstin[S.mode] || '';
              const gbad = Boolean(gi && !GSTIN_RE.test(gi));

              return (
                <>
                  <h2>Statement</h2>
                  <p className="sub">
                    One PDF with every credit, debit, GST amount and saving for{' '}
                    {monthLabel(S.ym)}, ready to share.
                  </p>

                  <div className="form">
                    <div className="tf">
                      <input
                        id="f-name"
                        type="text"
                        placeholder=" "
                        autoComplete="off"
                        value={S.name[S.mode]}
                        onChange={(e) =>
                          setS((prev) => ({
                            ...prev,
                            name: {
                              ...prev.name,
                              [prev.mode]: e.target.value,
                            },
                          }))
                        }
                      />
                      <label htmlFor="f-name">
                        {S.mode === 'shop'
                          ? 'Shop name on statement'
                          : 'Name on statement'}
                      </label>
                    </div>
                    {S.mode === 'shop' && (
                      <>
                        <div className={`tf${gbad ? ' bad' : ''}`}>
                          <input
                            id="f-mgstin"
                            type="text"
                            placeholder=" "
                            autoComplete="off"
                            maxLength={15}
                            spellCheck={false}
                            value={gi}
                            onChange={(e) =>
                              setS((prev) => ({
                                ...prev,
                                gstin: {
                                  ...prev.gstin,
                                  [prev.mode]: e.target.value.toUpperCase(),
                                },
                              }))
                            }
                          />
                          <label htmlFor="f-mgstin">
                            Your GSTIN (optional)
                          </label>
                        </div>
                        {gbad && (
                          <p className="err" role="alert">
                            A GSTIN has 15 characters, like 07ABCDE1234F1Z5.
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <section className="card docprev">
                    <div className="between">
                      <span className="kicker">Preview</span>
                      <span className="sub num">{stmtRef(S)}</span>
                    </div>
                    <p className="title">
                      {monthLabel(S.ym)}
                      <br />
                      Statement
                    </p>
                    <div className="meta">
                      <span>
                        {S.name[S.mode] || `${MODE_LABEL[S.mode]} account`}
                        {S.mode === 'shop' && gi && !gbad
                          ? ` · GSTIN ${gi}`
                          : ''}
                      </span>
                      <span>Generated {dFull(todayStr())}</span>
                    </div>
                    <div className="tiles">
                      <div className="t">
                        <div className="k">
                          Total {spentLbl.toLowerCase()}
                        </div>
                        <div className="v c-debit">
                          {inr2(monthTotals.debit)}
                        </div>
                      </div>
                      <div className="t">
                        <div className="k">Total money in</div>
                        <div className="v c-credit">
                          {inr2(monthTotals.credit)}
                        </div>
                      </div>
                      <div className="t hi">
                        <div className="k">Closing balance</div>
                        <div className="v">{inr2(close)}</div>
                        <div className="sub">Opening {inr2(open)}</div>
                      </div>
                      <div className="t">
                        <div className="k">
                          {S.mode === 'shop'
                            ? 'Input tax credit'
                            : 'GST paid'}
                        </div>
                        <div className="v">
                          {inr2(
                            S.mode === 'shop' ? monthGst.claim : monthGst.paid
                          )}
                        </div>
                        <div className="sub">
                          {bills} {bills === 1 ? 'bill' : 'bills'} attached
                        </div>
                      </div>
                    </div>
                    <p className="sub">
                      {currentMonthTxns.length}{' '}
                      {currentMonthTxns.length === 1 ? 'entry' : 'entries'} ·{' '}
                      {monthCounts.matched} matched · {monthCounts.pending}{' '}
                      pending · {monthCounts.flagged} flagged
                    </p>
                  </section>

                  <section className="card">
                    <h3>PDF settings</h3>
                    <div style={{ marginTop: 6 }}>
                      {(
                        [
                          [
                            'gst',
                            'GST summary',
                            'GST by rate, input credit and output GST',
                          ],
                          [
                            'categories',
                            'Spending by category',
                            'Show a breakdown with percentages',
                          ],
                          [
                            'bills',
                            'Bill photos',
                            'Add every attached bill at the end of the PDF',
                          ],
                          [
                            'savings',
                            'Savings summary',
                            'Show goal progress and total saved',
                          ],
                        ] as const
                      ).map(([k, title, desc]) => (
                        <label key={k} className="switch">
                          <span>
                            <b>{title}</b>
                            <small>{desc}</small>
                          </span>
                          <input
                            type="checkbox"
                            checked={S.opts[k]}
                            onChange={(e) =>
                              setS((prev) => ({
                                ...prev,
                                opts: {
                                  ...prev.opts,
                                  [k]: e.target.checked,
                                },
                              }))
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </section>

                  <button
                    type="button"
                    className="btn"
                    disabled={busy || !currentMonthTxns.length}
                    onClick={handleMakePdf}
                  >
                    {ICON.download}
                    {busy ? 'Preparing PDF…' : 'Download PDF statement'}
                  </button>
                  {!currentMonthTxns.length && (
                    <p className="sub">
                      Add at least one entry for this month to generate a
                      statement.
                    </p>
                  )}
                  {msg && (
                    <p className="status" role="status">
                      {msg}
                    </p>
                  )}
                </>
              );
            })()}

          {/* VIEW 6: POLICY, GST & ML */}
          {view === 'policy' &&
            (() => {
              const p = currentBook.policy;
              const shop = S.mode === 'shop';
              const noGstin = currentMonthTxns.filter(
                (t) =>
                  t.type === 'debit' &&
                  t.rate > 0 &&
                  !GSTIN_RE.test(t.gstin || '')
              ).length;

              return (
                <>
                  <h2>Policy, GST &amp; ML</h2>
                  <p className="sub">
                    Set your spending limits, inspect GST for {monthLabel(S.ym)},
                    and train your on-device ML categorizer.
                  </p>

                  <section className="card form" style={{ background: 'var(--surface)' }}>
                    <div className="between">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: currentUser ? 'var(--ok-soft)' : 'var(--accent-soft)',
                            color: currentUser ? 'var(--ok)' : 'var(--accent)',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                          </svg>
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '15px' }}>Cloud &amp; Google Drive Sync</h3>
                          <p className="sub" style={{ margin: '2px 0 0', fontSize: '12.5px' }}>
                            {currentUser
                              ? `Connected as ${currentUser.displayName || currentUser.email || currentUser.phoneNumber}${
                                  driveState.isConnected ? ' • Google Drive Auto-Sync Active' : ''
                                }`
                              : 'Sign in with Google (Gmail) or Phone number to sync with Google Drive'}
                          </p>
                        </div>
                      </div>
                      <span className={`pill ${currentUser ? 'pos' : 'neu'}`} style={{ fontSize: '11.5px' }}>
                        {currentUser ? (isSyncing || driveState.isSyncing ? 'Syncing…' : 'Backed up') : 'Offline'}
                      </span>
                    </div>

                    <p className="hint" style={{ marginTop: '4px' }}>
                      Automated Google Drive and Firestore synchronization keeps your daily expenses, ML categorizer weights, receipts, and savings goals backed up safely across all devices.
                    </p>

                    <div className="btnrow" style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => setShowCloudModal(true)}
                      >
                        {currentUser ? 'Manage Google Drive & Cloud' : 'Sign In with Google (Drive Sync)'}
                      </button>
                      {currentUser && (
                        <button
                          type="button"
                          className="btn sm out"
                          disabled={isSyncing || driveState.isSyncing}
                          onClick={async () => {
                            setIsSyncing(true);
                            try {
                              const ts = await pushLedgerToCloud(currentUser.uid, S);
                              setLastSyncedAt(ts);
                              if (driveState.isConnected) {
                                await syncLedgerToGoogleDrive(S);
                              }
                              showToast('Cloud & Google Drive backups updated!');
                            } catch {
                              showToast('Failed to sync. Please check internet connection.');
                            } finally {
                              setIsSyncing(false);
                            }
                          }}
                        >
                          {isSyncing || driveState.isSyncing ? 'Syncing…' : 'Sync All Backups Now'}
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="card form">
                    <h3>Spending policy</h3>
                    <div className="tf">
                      <input
                        id="p-limit"
                        type="text"
                        placeholder=" "
                        inputMode="numeric"
                        value={p.limit || ''}
                        onChange={(e) => {
                          const val = parseAmt(
                            e.target.value.replace(/[^0-9.]/g, '')
                          );
                          setS((prev) => ({
                            ...prev,
                            [prev.mode]: {
                              ...prev[prev.mode],
                              policy: {
                                ...prev[prev.mode].policy,
                                limit: val,
                              },
                            },
                          }));
                        }}
                      />
                      <label htmlFor="p-limit">
                        Monthly spending limit (₹)
                      </label>
                    </div>
                    <div className="two">
                      <div className="tf">
                        <input
                          id="p-cap"
                          type="text"
                          placeholder=" "
                          inputMode="numeric"
                          value={p.cap || ''}
                          onChange={(e) => {
                            const val = parseAmt(
                              e.target.value.replace(/[^0-9.]/g, '')
                            );
                            setS((prev) => ({
                              ...prev,
                              [prev.mode]: {
                                ...prev[prev.mode],
                                policy: {
                                  ...prev[prev.mode].policy,
                                  cap: val,
                                },
                              },
                            }));
                          }}
                        />
                        <label htmlFor="p-cap">Per-entry cap (₹)</label>
                      </div>
                      <div className="tf">
                        <input
                          id="p-bill"
                          type="text"
                          placeholder=" "
                          inputMode="numeric"
                          value={p.bill || ''}
                          onChange={(e) => {
                            const val = parseAmt(
                              e.target.value.replace(/[^0-9.]/g, '')
                            );
                            setS((prev) => ({
                              ...prev,
                              [prev.mode]: {
                                ...prev[prev.mode],
                                policy: {
                                  ...prev[prev.mode].policy,
                                  bill: val,
                                },
                              },
                            }));
                          }}
                        />
                        <label htmlFor="p-bill">Bill needed from (₹)</label>
                      </div>
                    </div>
                    <p className="hint">
                      Entries above the cap are flagged. Spending at or above
                      the bill amount shows as Pending bill until you attach a
                      photo. Leave a box empty to turn that rule off.
                    </p>
                  </section>

                  <section className="card">
                    <div className="between">
                      <h3>GST this month</h3>
                      <span className="chip-inr">
                        {shop ? 'Shop' : 'Personal'}
                      </span>
                    </div>
                    <div className="gtiles">
                      {shop ? (
                        <>
                          <div className="t ok">
                            <div className="k">Input credit (claimable)</div>
                            <div className="v">{inr2(monthGst.claim)}</div>
                          </div>
                          <div className="t warn">
                            <div className="k">Not claimable, no GSTIN</div>
                            <div className="v">{inr2(monthGst.noClaim)}</div>
                          </div>
                          <div className="t">
                            <div className="k">Output GST on sales</div>
                            <div className="v">{inr2(monthGst.out)}</div>
                          </div>
                          <div className="t">
                            <div className="k">
                              {monthGst.net >= 0
                                ? 'Net GST payable (est.)'
                                : 'Credit to carry forward'}
                            </div>
                            <div className="v">
                              {inr2(Math.abs(monthGst.net))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="t ok">
                            <div className="k">GST paid</div>
                            <div className="v">{inr2(monthGst.paid)}</div>
                          </div>
                          <div className="t">
                            <div className="k">Taxable value</div>
                            <div className="v">{inr2(monthGst.paidTax)}</div>
                          </div>
                        </>
                      )}
                    </div>

                    {monthGst.rows.length > 0 ? (
                      <div className="tblwrap">
                        <table className="tbl">
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th>Rate</th>
                              <th>Taxable</th>
                              <th>GST</th>
                            </tr>
                          </thead>
                          <tbody>
                            {monthGst.rows.map((r) => (
                              <tr key={`${r.side}-${r.rate}`}>
                                <td>{r.side}</td>
                                <td className="num">{r.rate}%</td>
                                <td className="num">{inr2(r.taxable)}</td>
                                <td className="num">{inr2(r.gst)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="sub" style={{ marginTop: 12 }}>
                        No GST recorded this month. Pick a GST rate when you add
                        an entry.
                      </p>
                    )}
                    <p className="hint" style={{ marginTop: 12 }}>
                      Shown as CGST plus SGST (same-state supply). Purchases
                      from another state carry IGST for the full amount. These
                      are estimates from your entries. Confirm with your
                      accountant before filing returns.
                    </p>
                  </section>

                  <section className="card">
                    <h3 style={{ marginBottom: 6 }}>Compliance checks</h3>
                    <button
                      type="button"
                      className="check"
                      onClick={() => {
                        setLf('pending');
                        setQ('');
                        switchView('ledger');
                      }}
                    >
                      <span
                        className={`ci ${monthCounts.pending ? 'warn' : 'ok'}`}
                      >
                        {monthCounts.pending ? ICON.clock : ICON.checkc}
                      </span>
                      <span className="tx">
                        Pending bills
                        <small>
                          {p.bill > 0
                            ? `Spending of ${inr(p.bill)} or more without a bill`
                            : 'Bill rule is off'}
                        </small>
                      </span>
                      <span className="num">{monthCounts.pending}</span>
                    </button>

                    <button
                      type="button"
                      className="check"
                      onClick={() => {
                        setLf('flagged');
                        setQ('');
                        switchView('ledger');
                      }}
                    >
                      <span
                        className={`ci ${monthCounts.flagged ? 'bad' : 'ok'}`}
                      >
                        {monthCounts.flagged ? ICON.alert : ICON.checkc}
                      </span>
                      <span className="tx">
                        Flagged entries
                        <small>Over the cap or flagged by you</small>
                      </span>
                      <span className="num">{monthCounts.flagged}</span>
                    </button>

                    {shop && (
                      <button
                        type="button"
                        className="check"
                        onClick={() => {
                          setLf('all');
                          setQ('');
                          switchView('ledger');
                        }}
                      >
                        <span className={`ci ${noGstin ? 'warn' : 'ok'}`}>
                          {noGstin ? ICON.alert : ICON.checkc}
                        </span>
                        <span className="tx">
                          GST charged, no vendor GSTIN
                          <small>
                            These purchases are not counted as input credit
                          </small>
                        </span>
                        <span className="num">{noGstin}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="check"
                      onClick={() => {
                        setLf('matched');
                        setQ('');
                        switchView('ledger');
                      }}
                    >
                      <span className="ci ok">{ICON.checkc}</span>
                      <span className="tx">
                        Matched entries
                        <small>Bill attached and within policy</small>
                      </span>
                      <span className="num">{monthCounts.matched}</span>
                    </button>
                  </section>

                  {/* Mobile / Inline ML Studio in Policy view */}
                  <MLStudioPanel
                    mode={S.mode}
                    txns={currentBook.txns}
                    monthTxns={currentMonthTxns}
                    onQuickAddParsed={handleApplyQuickNlp}
                    onScanSampleBill={handleScanSampleBill}
                    onBatchRecategorize={handleBatchRecategorize}
                    onTrainCustom={handleTrainCustom}
                  />
                </>
              );
            })()}
        </main>

        {/* Bottom Navigation Bar */}
        <nav className="tabs" aria-label="Sections">
          {(
            [
              ['ledger', 'Expenses', ICON.ledger, attentionCount],
              ['insights', 'Insights', ICON.chart, 0],
              ['add', 'Add', ICON.plus, 0],
              ['savings', 'Vault', ICON.save, 0],
              ['statement', 'Statement', ICON.doc, 0],
            ] as const
          ).map(([key, label, icon, badge]) => (
            <button
              key={key}
              type="button"
              className={key === 'add' ? 'cap-btn' : ''}
              aria-current={view === key ? 'page' : undefined}
              onClick={() => {
                if (key === 'add' && view !== 'add') {
                  setEditId(null);
                  setDraft(createNewDraft());
                }
                switchView(key);
              }}
            >
              <span className="pb">{icon}</span>
              {label}
              {badge > 0 && (
                <span
                  className="badge"
                  aria-label={`${badge} need attention`}
                >
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Detail Modal Sheet */}
        {openTxn &&
          (() => {
            const t = openTxn;
            const mode = S.mode;
            const c = calc(t);
            const s = stOf(S, t, mode);
            const isDeb = t.type === 'debit';
            const isCr = t.type === 'credit';
            const isSave = t.type === 'save';
            const comp = compliance(S, t, mode);
            const fl = isFlagged(S, t, mode);
            const p = currentBook.policy;

            return (
              <div
                className="backdrop"
                onClick={(e) => {
                  if (e.target === e.currentTarget) closeModal();
                }}
              >
                <div
                  ref={sheetRef}
                  className="sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="m-title"
                  tabIndex={-1}
                >
                  <div className="sheet-h">
                    <div className="idrow">
                      <h2 id="m-title" className="rid num">
                        #{t.rid}
                      </h2>
                      <StatusPill status={s} />
                    </div>
                    <div className="hbtns">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Copy receipt ID"
                        onClick={() => {
                          try {
                            navigator.clipboard
                              .writeText(`#${t.rid}`)
                              .then(
                                () => showToast('Receipt ID copied'),
                                () => showToast('Copy is not available here')
                              );
                          } catch {
                            showToast('Copy is not available here');
                          }
                        }}
                      >
                        {ICON.copy}
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Close"
                        onClick={closeModal}
                      >
                        {ICON.x}
                      </button>
                    </div>
                  </div>

                  <div className="sheet-b">
                    <p className="sub">{dtLine(t)}</p>

                    {fl && (
                      <div className="alertbox">
                        {ICON.alert}
                        <div>
                          <b>Flagged for review</b>
                          <span>
                            {t.flagged
                              ? 'You flagged this entry. Clear the flag once it is checked.'
                              : `This entry is above your ${inr2(
                                  p.cap
                                )} per-entry cap.`}
                          </span>
                        </div>
                      </div>
                    )}

                    {t.receipt ? (
                      <div className={`slip${imgBig ? ' big' : ''}`}>
                        <img
                          src={t.receipt}
                          alt={`Bill photo for ${entryTitle(S, t, mode)}`}
                        />
                        <button
                          type="button"
                          className="insp"
                          onClick={() => setImgBig((b) => !b)}
                        >
                          {ICON.expand}
                          {imgBig ? 'Shrink' : 'Inspect slip'}
                        </button>
                      </div>
                    ) : (
                      !isSave && (
                        <div className="noslip">
                          <div>
                            <b>No bill attached</b>
                            <span>
                              {s === 'pending'
                                ? `A bill is needed for entries of ${inr2(
                                    p.bill
                                  )} or more.`
                                : 'Attach a photo to keep it with this entry.'}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => {
                              attachTargetRef.current = t.id;
                              attachInputRef.current?.click();
                            }}
                          >
                            {ICON.camera}
                            Attach
                          </button>
                        </div>
                      )
                    )}

                    <div className="tot">
                      <div>
                        <div className="kicker">
                          {isSave
                            ? 'Amount saved'
                            : isCr
                            ? 'Total received'
                            : 'Total paid'}
                        </div>
                        <div
                          className={`big ${
                            isCr ? 'c-credit' : isSave ? 'c-save' : ''
                          }`}
                        >
                          {inr2(t.amount)}
                        </div>
                      </div>
                      {!isSave && (
                        <div className="r">
                          {c.rate ? (
                            <>
                              <span className="g">
                                {inr2(c.gst)} GST ({c.rate}%)
                              </span>
                              <span>Taxable: {inr2(c.taxable)}</span>
                              <span>
                                CGST {inr2(c.cgst)} · SGST {inr2(c.sgst)}
                              </span>
                            </>
                          ) : (
                            <span>No GST on this entry</span>
                          )}
                          {c.tip > 0 && <span>Tip: {inr2(c.tip)}</span>}
                        </div>
                      )}
                    </div>

                    <div className="info-grid">
                      {isSave ? (
                        <>
                          <div className="info">
                            {ICON.save}
                            <div style={{ minWidth: 0 }}>
                              <div className="k">Savings goal</div>
                              <div className="v">
                                {goalName(S, mode, t.goalId)}
                              </div>
                            </div>
                          </div>
                          <div className="info">
                            {ICON.clock}
                            <div style={{ minWidth: 0 }}>
                              <div className="k">Saved on</div>
                              <div className="v">{dLong(t.date)}</div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="info">
                            {ICON.building}
                            <div style={{ minWidth: 0 }}>
                              <div className="k">
                                {isCr ? 'Customer' : 'Vendor'}
                              </div>
                              <div className="v">
                                {t.vendor || 'Not recorded'}
                              </div>
                              {isDeb &&
                                c.rate > 0 &&
                                (t.gstin ? (
                                  <div className="s">GSTIN {t.gstin}</div>
                                ) : mode === 'shop' ? (
                                  <div className="s">GSTIN not recorded</div>
                                ) : null)}
                            </div>
                          </div>
                          <div className="info">
                            {ICON.tag}
                            <div style={{ minWidth: 0 }}>
                              <div className="k">Category</div>
                              <div className="v">{t.category}</div>
                              <div className="s">
                                ML {t.mlConfidence || 92}% confidence
                              </div>
                            </div>
                          </div>
                          <div className="info">
                            {ICON.card}
                            <div style={{ minWidth: 0 }}>
                              <div className="k">
                                {isCr ? 'Received via' : 'Payment'}
                              </div>
                              <div className="v">
                                {payLabel(t) || 'Not recorded'}
                              </div>
                            </div>
                          </div>
                          {isDeb ? (
                            <div className="info">
                              {ICON.shieldck}
                              <div style={{ minWidth: 0 }}>
                                <div className="k">Policy compliance</div>
                                <div className={`v ${comp.ok ? 'ok' : 'bad'}`}>
                                  {comp.text}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="info">
                              {ICON.shieldck}
                              <div style={{ minWidth: 0 }}>
                                <div className="k">GST collected</div>
                                <div className={`v ${c.rate ? 'ok' : ''}`}>
                                  {c.rate ? inr2(c.gst) : 'None'}
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Quick ML Re-categorize Chips inside Detail Sheet */}
                    {!isSave && openTxnPrediction && (
                      <div className="ml-panel">
                        <div className="between">
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                            ML Category Signals ({openTxnPrediction.confidence}%
                            match)
                          </span>
                          <span className="sub" style={{ fontSize: 11.5 }}>
                            Tap to retrain
                          </span>
                        </div>
                        <div className="chips">
                          {CATEGORIES[mode][t.type as 'debit' | 'credit'].map((cat: string) => (
                            <button
                              key={cat}
                              type="button"
                              className="chip"
                              style={{ height: 30, fontSize: 12 }}
                              aria-pressed={t.category === cat}
                              onClick={() => {
                                if (t.category === cat) return;
                                recordMLTraining({
                                  mode,
                                  type: t.type as 'debit' | 'credit',
                                  text: `${t.vendor} ${t.note}`,
                                  amount: t.amount,
                                  time: t.time,
                                  method: t.method,
                                  category: cat,
                                  gstRate: t.rate,
                                  predicted: t.category,
                                  confidence: 98,
                                });
                                setS((prev) => {
                                  const book = prev[mode];
                                  return {
                                    ...prev,
                                    [mode]: {
                                      ...book,
                                      txns: book.txns.map((x) =>
                                        x.id === t.id
                                          ? {
                                              ...x,
                                              category: cat,
                                              mlConfidence: 98,
                                              mlAuto: false,
                                            }
                                          : x
                                      ),
                                    },
                                  };
                                });
                                showToast(
                                  `Recategorized to ${cat} · ML updated`
                                );
                              }}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {t.items && t.items.length > 0 && (
                      <div>
                        <h3 style={{ marginBottom: 8 }}>
                          Line items (INR ₹)
                        </h3>
                        <div className="items">
                          {t.items.map((it, idx) => (
                            <div key={idx} className="it">
                              <span>{it.n || 'Item'}</span>
                              <span className="num">{inr2(it.a)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="between" style={{ marginBottom: 8 }}>
                        <h3>Notes</h3>
                        {!noteEdit && (
                          <button
                            type="button"
                            className="text-btn"
                            onClick={() => {
                              setNoteDraft(t.note || '');
                              setNoteEdit(true);
                            }}
                          >
                            {t.note ? 'Edit note' : 'Add note'}
                          </button>
                        )}
                      </div>
                      {noteEdit ? (
                        <>
                          <textarea
                            id="m-note"
                            className="ta"
                            aria-label="Note"
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                          />
                          <div className="btnrow" style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => {
                                setS((prev) => {
                                  const b = prev[mode];
                                  return {
                                    ...prev,
                                    [mode]: {
                                      ...b,
                                      txns: b.txns.map((x) =>
                                        x.id === t.id
                                          ? { ...x, note: noteDraft.trim() }
                                          : x
                                      ),
                                    },
                                  };
                                });
                                setNoteEdit(false);
                                showToast('Note saved');
                              }}
                            >
                              Save note
                            </button>
                            <button
                              type="button"
                              className="btn sm out"
                              onClick={() => setNoteEdit(false)}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className={`notebox${t.note ? '' : ' empty'}`}>
                          {t.note ? t.note : 'No notes yet.'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="sheet-f">
                    <button
                      type="button"
                      className="btn out"
                      onClick={() => {
                        setDraft(createDraftFromTxn(t));
                        setEditId(t.id);
                        closeModal();
                        setView('add');
                      }}
                    >
                      {ICON.pen}
                      Edit
                    </button>

                    {!isSave ? (
                      <button
                        type="button"
                        className={`btn grow ${fl ? 'out' : 'amber'}`}
                        onClick={() => {
                          setS((prev) => {
                            const b = prev[mode];
                            return {
                              ...prev,
                              [mode]: {
                                ...b,
                                txns: b.txns.map((x) =>
                                  x.id === t.id
                                    ? fl
                                      ? { ...x, flagged: false, cleared: true }
                                      : { ...x, flagged: true, cleared: false }
                                    : x
                                ),
                              },
                            };
                          });
                          showToast(fl ? 'Flag cleared' : 'Flagged for review');
                        }}
                      >
                        {ICON.flag}
                        {fl ? 'Clear flag' : 'Flag for review'}
                      </button>
                    ) : (
                      <span style={{ flex: 1 }} />
                    )}

                    <button
                      type="button"
                      className={`btn redsoft${armDel ? ' arm' : ''}`}
                      onClick={() => {
                        if (!armDel) {
                          setArmDel(true);
                          return;
                        }
                        setS((prev) => {
                          const b = prev[mode];
                          return {
                            ...prev,
                            [mode]: {
                              ...b,
                              txns: b.txns.filter((x) => x.id !== t.id),
                            },
                          };
                        });
                        closeModal();
                        showToast('Entry deleted');
                      }}
                    >
                      {ICON.trash}
                      {armDel ? 'Confirm' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>

      {/* Desktop Companion Workspace (ML Categorizer Studio & Live Sandbox) */}
      {showMLStudio && (
        <aside className="desktop-companion" aria-label="Machine Learning Categorization Studio">
          <MLStudioPanel
            mode={S.mode}
            txns={currentBook.txns}
            monthTxns={currentMonthTxns}
            onQuickAddParsed={handleApplyQuickNlp}
            onScanSampleBill={handleScanSampleBill}
            onBatchRecategorize={handleBatchRecategorize}
            onTrainCustom={handleTrainCustom}
          />
        </aside>
      )}

      {/* Confetti & Coin celebration effect */}
      <ConfettiEffect
        active={confettiActive}
        onDone={() => setConfettiActive(false)}
      />

      {/* Toast Notification */}
      <div
        id="toast"
        className="toast"
        role="status"
        aria-live="polite"
        hidden={!toastMsg}
      >
        {toastMsg}
      </div>

      {/* Cloud Sync & Backup Modal */}
      <CloudSyncModal
        isOpen={showCloudModal}
        onClose={() => setShowCloudModal(false)}
        currentUser={currentUser}
        lastSyncedAt={lastSyncedAt}
        isSyncing={isSyncing}
        appState={S}
        onStateRestored={(newState) => {
          setS((prev) => mergeRemoteState(prev, newState));
        }}
        onSyncSuccess={(timestamp) => {
          setLastSyncedAt(timestamp);
        }}
        showToast={showToast}
        onTriggerConfetti={() => setConfettiActive(true)}
      />

      {/* Hidden File Inputs for Camera / Gallery / Attach */}
      <input
        ref={snapInputRef}
        id="snap-input"
        className="vh"
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleCapturePhoto}
      />
      <input
        ref={galleryInputRef}
        id="gallery-input"
        className="vh"
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleCapturePhoto}
      />
      <input
        ref={attachInputRef}
        id="attach-input"
        className="vh"
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleAttachPhoto}
      />
    </div>
  );
}
