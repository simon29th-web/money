export type AccountMode = 'personal' | 'shop';
export type TxnType = 'debit' | 'credit' | 'save';

export interface LineItem {
  n: string;
  a: number;
}

export interface Transaction {
  id: string;
  rid: string;
  date: string;
  time: string;
  type: TxnType;
  amount: number;
  category: string;
  vendor: string;
  note: string;
  rate: number;
  gstin: string;
  tip: number;
  method: string;
  last4: string;
  items: LineItem[];
  receipt: string | null;
  rw: number;
  rh: number;
  flagged: boolean;
  cleared: boolean;
  goalId?: string;
  sample?: boolean;
  mlConfidence?: number;
  mlAuto?: boolean;
}

export interface MLPrediction {
  topCategory: string;
  confidence: number; // 0 to 100
  rankings: Array<{ category: string; probability: number }>;
  matchedSignals: string[];
  suggestedGstRate: number;
  suggestedMethod: string;
  duplicateMatch?: Transaction | null;
}

export interface TrainingSample {
  mode: AccountMode;
  type: 'debit' | 'credit';
  text: string;
  amount?: number;
  time?: string;
  method?: string;
  category: string;
  gstRate?: number;
}

export interface MLModelStats {
  totalTrainedSamples: number;
  userCorrections: number;
  vocabularySize: number;
  lastTrainedAt: string;
  recentLogs: Array<{
    id: string;
    timestamp: string;
    input: string;
    predicted: string;
    finalCategory: string;
    confidence: number;
    wasCorrected: boolean;
  }>;
}

export const CATEGORIES: Record<AccountMode, { debit: string[]; credit: string[] }> = {
  personal: {
    debit: ['Food', 'Rent', 'Travel', 'Study', 'Bills', 'Shopping', 'Health', 'Other'],
    credit: ['Pocket money', 'Salary', 'Gift', 'Refund', 'Other'],
  },
  shop: {
    debit: ['Stock', 'Rent', 'Wages', 'Electricity', 'Transport', 'Udhaar given', 'Other'],
    credit: ['Sales', 'Udhaar received', 'Other income'],
  },
};

// Pre-trained domain corpus for Indian Personal & Shop expenses
const SEED_CORPUS: TrainingSample[] = [
  // PERSONAL - DEBIT: Food
  { mode: 'personal', type: 'debit', text: 'hostel mess fee monthly lunch dinner canteen tiffin', amount: 1800, category: 'Food', gstRate: 0 },
  { mode: 'personal', type: 'debit', text: 'campus cafe cold coffee paneer wrap brownie snacks', amount: 840, category: 'Food', gstRate: 5 },
  { mode: 'personal', type: 'debit', text: 'swiggy zomato food delivery biryani pizza burger momos', amount: 350, category: 'Food', gstRate: 5 },
  { mode: 'personal', type: 'debit', text: 'chai samosa point tea tapri nasta breakfast', amount: 45, category: 'Food', gstRate: 0 },
  { mode: 'personal', type: 'debit', text: 'blue tokai starbucks third wave coffee latte espresso', amount: 280, category: 'Food', gstRate: 5 },
  { mode: 'personal', type: 'debit', text: 'haldiram bikanervala darshini dosa idli thali restaurant', amount: 420, category: 'Food', gstRate: 5 },
  { mode: 'personal', type: 'debit', text: 'roommates dinner split dhaba paratha lassi', amount: 210, category: 'Food', gstRate: 0 },
  { mode: 'personal', type: 'debit', text: 'amul milk bread eggs grocery blinkit zepto instamart', amount: 190, category: 'Food', gstRate: 0 },
  { mode: 'personal', type: 'debit', text: 'dominos kfc mcdonalds subway taco bell', amount: 499, category: 'Food', gstRate: 5 },

  // PERSONAL - DEBIT: Rent
  { mode: 'personal', type: 'debit', text: 'sunrise boys hostel room rent monthly accommodation pg', amount: 3500, category: 'Rent', gstRate: 0 },
  { mode: 'personal', type: 'debit', text: 'flat rent house owner landlord deposit maintenance', amount: 8500, category: 'Rent', gstRate: 0 },
  { mode: 'personal', type: 'debit', text: 'stanza living zolo pg paying guest bed rent', amount: 6500, category: 'Rent', gstRate: 0 },

  // PERSONAL - DEBIT: Travel
  { mode: 'personal', type: 'debit', text: 'city metro smart card recharge dmrc bmrcl token', amount: 500, category: 'Travel', gstRate: 0 },
  { mode: 'personal', type: 'debit', text: 'uber ola rapido auto cab ride bike taxi', amount: 180, category: 'Travel', gstRate: 5 },
  { mode: 'personal', type: 'debit', text: 'irctc train ticket railway sleeper ac bus redbus', amount: 750, category: 'Travel', gstRate: 5 },
  { mode: 'personal', type: 'debit', text: 'indian oil hp bharat petroleum petrol fuel scooty bike', amount: 300, category: 'Travel', gstRate: 0 },
  { mode: 'personal', type: 'debit', text: 'indigo air india flight ticket airport bus pass', amount: 3200, category: 'Travel', gstRate: 5 },

  // PERSONAL - DEBIT: Study
  { mode: 'personal', type: 'debit', text: 'pustak bhandar engineering mathematics book textbook notebook', amount: 640, category: 'Study', gstRate: 0 },
  { mode: 'personal', type: 'debit', text: 'xerox photocopy printout spiral binding thesis lab manual', amount: 120, category: 'Study', gstRate: 12 },
  { mode: 'personal', type: 'debit', text: 'coursera udemy gate exam fee tuition coaching classes', amount: 1500, category: 'Study', gstRate: 18 },
  { mode: 'personal', type: 'debit', text: 'stationery pen pencil highlighter calculator casio', amount: 450, category: 'Study', gstRate: 18 },

  // PERSONAL - DEBIT: Bills
  { mode: 'personal', type: 'debit', text: 'mobile prepaid recharge jio airtel vi bsnl data pack', amount: 299, category: 'Bills', gstRate: 18 },
  { mode: 'personal', type: 'debit', text: 'act fibernet jiofiber airtel xstream wifi broadband internet', amount: 799, category: 'Bills', gstRate: 18 },
  { mode: 'personal', type: 'debit', text: 'electricity bill power discom bescom water gas cylinder', amount: 950, category: 'Bills', gstRate: 0 },
  { mode: 'personal', type: 'debit', text: 'spotify netflix youtube premium icloud subscription', amount: 149, category: 'Bills', gstRate: 18 },

  // PERSONAL - DEBIT: Shopping
  { mode: 'personal', type: 'debit', text: 'metro electronics wired earphones headphones charger cable', amount: 1299, category: 'Shopping', gstRate: 18 },
  { mode: 'personal', type: 'debit', text: 'amazon flipkart myntra ajio shirt jeans shoes sneakers', amount: 1499, category: 'Shopping', gstRate: 12 },
  { mode: 'personal', type: 'debit', text: 'decathlon backpack water bottle gym tshirt', amount: 899, category: 'Shopping', gstRate: 12 },
  { mode: 'personal', type: 'debit', text: 'dmart reliance smart bazaar toiletries detergent soap', amount: 650, category: 'Shopping', gstRate: 18 },

  // PERSONAL - DEBIT: Health
  { mode: 'personal', type: 'debit', text: 'apollo pharmacy medplus 1mg paracetamol tablets medicine', amount: 240, category: 'Health', gstRate: 12 },
  { mode: 'personal', type: 'debit', text: 'doctor consultation clinic dental eye checkup blood test lab', amount: 600, category: 'Health', gstRate: 0 },
  { mode: 'personal', type: 'debit', text: 'gym membership cult fit protein supplement', amount: 1200, category: 'Health', gstRate: 18 },

  // PERSONAL - CREDIT
  { mode: 'personal', type: 'credit', text: 'from home parents allowance monthly pocket money dad mom', amount: 8000, category: 'Pocket money', gstRate: 0 },
  { mode: 'personal', type: 'credit', text: 'weekend tutoring stipend internship salary freelance payout', amount: 4000, category: 'Salary', gstRate: 0 },
  { mode: 'personal', type: 'credit', text: 'birthday festival diwali shagun gift relative', amount: 1500, category: 'Gift', gstRate: 0 },
  { mode: 'personal', type: 'credit', text: 'amazon refund cancelled ticket cashback return', amount: 500, category: 'Refund', gstRate: 0 },

  // SHOP - DEBIT: Stock
  { mode: 'shop', type: 'debit', text: 'sharma traders wholesale basmati rice mustard oil toor dal', amount: 9800, category: 'Stock', gstRate: 5 },
  { mode: 'shop', type: 'debit', text: 'packwell supplies packaging material carry bags boxes', amount: 2950, category: 'Stock', gstRate: 18 },
  { mode: 'shop', type: 'debit', text: 'distributor inventory FMCG biscuits snacks cold drinks crates', amount: 6400, category: 'Stock', gstRate: 12 },
  { mode: 'shop', type: 'debit', text: 'mandi wholesale wheat flour atta sugar spices pulses', amount: 11200, category: 'Stock', gstRate: 5 },

  // SHOP - DEBIT: Rent
  { mode: 'shop', type: 'debit', text: 'gupta properties shop rent godown store lease monthly', amount: 6000, category: 'Rent', gstRate: 0 },

  // SHOP - DEBIT: Wages
  { mode: 'shop', type: 'debit', text: 'raju helper staff salary daily wage cleaner boy', amount: 3000, category: 'Wages', gstRate: 0 },
  { mode: 'shop', type: 'debit', text: 'delivery boy helper advance mazdoori loading unloading', amount: 1500, category: 'Wages', gstRate: 0 },

  // SHOP - DEBIT: Electricity
  { mode: 'shop', type: 'debit', text: 'city power distribution electricity bill meter commercial', amount: 1240, category: 'Electricity', gstRate: 0 },
  { mode: 'shop', type: 'debit', text: 'inverter battery diesel generator fuel power backup', amount: 900, category: 'Electricity', gstRate: 18 },

  // SHOP - DEBIT: Transport
  { mode: 'shop', type: 'debit', text: 'goods tempo transport rickshaw freight cartage delivery', amount: 300, category: 'Transport', gstRate: 0 },
  { mode: 'shop', type: 'debit', text: 'porter mini truck pickup mandi transport भाड़ा', amount: 550, category: 'Transport', gstRate: 5 },

  // SHOP - DEBIT: Udhaar given
  { mode: 'shop', type: 'debit', text: 'verma ji groceries on credit udhaar khata customer due', amount: 850, category: 'Udhaar given', gstRate: 0 },
  { mode: 'shop', type: 'debit', text: 'sharma aunty monthly ration khata credit given', amount: 1400, category: 'Udhaar given', gstRate: 0 },

  // SHOP - DEBIT: Other
  { mode: 'shop', type: 'debit', text: 'shree stationers billing paper rolls thermal printer ink', amount: 1180, category: 'Other', gstRate: 18 },
  { mode: 'shop', type: 'debit', text: 'tea snacks for customers shop cleaning broom phenyl', amount: 220, category: 'Other', gstRate: 0 },

  // SHOP - CREDIT
  { mode: 'shop', type: 'credit', text: 'counter sales daily cash upi collection customer billing', amount: 4500, category: 'Sales', gstRate: 5 },
  { mode: 'shop', type: 'credit', text: 'verma ji part payment udhaar received khata settled recovery', amount: 500, category: 'Udhaar received', gstRate: 0 },
  { mode: 'shop', type: 'credit', text: 'empty cartons scrap raddi sale commission incentive', amount: 350, category: 'Other income', gstRate: 0 },
];

const ML_STORAGE_KEY = 'finsense.ml.v1';

interface StoredMLData {
  userSamples: TrainingSample[];
  stats: MLModelStats;
}

function loadStoredML(): StoredMLData {
  try {
    const raw = localStorage.getItem(ML_STORAGE_KEY) || localStorage.getItem('ledgerease.ml.v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.userSamples)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage read error
  }
  return {
    userSamples: [],
    stats: {
      totalTrainedSamples: SEED_CORPUS.length,
      userCorrections: 0,
      vocabularySize: 0,
      lastTrainedAt: new Date().toISOString(),
      recentLogs: [],
    },
  };
}

function saveStoredML(data: StoredMLData) {
  try {
    localStorage.setItem(ML_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'paid', 'rs', 'inr', 'bill', 'payment', 'to', 'in', 'on', 'at', 'of', 'by', 'a', 'an',
]);

export function tokenize(rawText: string): string[] {
  const clean = (rawText || '')
    .toLowerCase()
    .replace(/[^\w\s₹]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const words = clean.split(' ').filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  const tokens: string[] = [...words];
  // Add informative bigrams
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]}_${words[i + 1]}`);
  }
  return tokens;
}

function contextFeatures(amount?: number, time?: string, method?: string): string[] {
  const feats: string[] = [];
  if (amount && amount > 0) {
    if (amount <= 100) feats.push('ctx_amt_micro');
    else if (amount <= 450) feats.push('ctx_amt_small');
    else if (amount <= 1500) feats.push('ctx_amt_medium');
    else if (amount <= 4500) feats.push('ctx_amt_large');
    else feats.push('ctx_amt_xlarge');
  }
  if (time) {
    const hr = parseInt(time.split(':')[0], 10);
    if (!isNaN(hr)) {
      if (hr >= 7 && hr <= 10) feats.push('ctx_time_morning');
      else if (hr >= 12 && hr <= 15) feats.push('ctx_time_lunch');
      else if (hr >= 16 && hr <= 19) feats.push('ctx_time_evening');
      else if (hr >= 20 && hr <= 23) feats.push('ctx_time_dinner');
    }
  }
  if (method) {
    feats.push(`ctx_method_${method}`);
  }
  return feats;
}

export function predictCategory(params: {
  mode: AccountMode;
  type: TxnType;
  vendor: string;
  note: string;
  items?: Array<{ n: string; a: string | number }>;
  amount?: number;
  time?: string;
  method?: string;
  existingTxns?: Transaction[];
}): MLPrediction {
  const { mode, type, vendor, note, items = [], amount = 0, time = '', method = '', existingTxns = [] } = params;

  if (type === 'save') {
    return {
      topCategory: 'Savings',
      confidence: 100,
      rankings: [{ category: 'Savings', probability: 1 }],
      matchedSignals: ['Savings transfer'],
      suggestedGstRate: 0,
      suggestedMethod: 'upi',
      duplicateMatch: null,
    };
  }

  const allowedCats = CATEGORIES[mode][type];
  const stored = loadStoredML();

  // Combine seed corpus + historical ledger transactions + user explicit training samples
  const ledgerSamples: TrainingSample[] = existingTxns
    .filter((t) => t.type === type && allowedCats.includes(t.category))
    .map((t) => ({
      mode,
      type,
      text: `${t.vendor} ${t.vendor} ${t.note} ${(t.items || []).map((i) => i.n).join(' ')}`,
      amount: t.amount,
      time: t.time,
      method: t.method,
      category: t.category,
      gstRate: t.rate,
    }));

  const trainingSet = [
    ...SEED_CORPUS.filter((s) => s.mode === mode && s.type === type),
    ...ledgerSamples,
    // Weight user-corrected samples 2x so active learning adapts immediately
    ...stored.userSamples.filter((s) => s.mode === mode && s.type === type),
    ...stored.userSamples.filter((s) => s.mode === mode && s.type === type),
  ];

  // Build Multinomial Naive Bayes counts with TF weighting
  const catDocCounts: Record<string, number> = {};
  const catTokenCounts: Record<string, Record<string, number>> = {};
  const catTotalTokens: Record<string, number> = {};
  const vocab = new Set<string>();

  allowedCats.forEach((c) => {
    catDocCounts[c] = 1; // Laplace prior
    catTokenCounts[c] = {};
    catTotalTokens[c] = 0;
  });

  trainingSet.forEach((s) => {
    if (!catDocCounts[s.category]) return;
    catDocCounts[s.category] += 1;
    const tks = [...tokenize(s.text), ...contextFeatures(s.amount, s.time, s.method)];
    tks.forEach((tk) => {
      vocab.add(tk);
      const weight = tk.startsWith('ctx_') ? 0.45 : tk.includes('_') ? 1.8 : 1.3;
      catTokenCounts[s.category][tk] = (catTokenCounts[s.category][tk] || 0) + weight;
      catTotalTokens[s.category] += weight;
    });
  });

  const itemNames = items.map((i) => i.n).join(' ');
  // Vendor tokens get double emphasis
  const queryTextTokens = [...tokenize(vendor), ...tokenize(vendor), ...tokenize(note), ...tokenize(itemNames)];
  const queryCtxTokens = contextFeatures(amount, time, method);
  const allQueryTokens = [...queryTextTokens, ...queryCtxTokens];

  const totalDocs = Object.values(catDocCounts).reduce((a, b) => a + b, 0);
  const vocabSize = Math.max(vocab.size, 20);

  const logScores: Record<string, number> = {};
  const tokenContributions: Record<string, Array<{ token: string; score: number }>> = {};

  allowedCats.forEach((cat) => {
    // Prior log probability
    let score = Math.log(catDocCounts[cat] / totalDocs) * 0.6;
    tokenContributions[cat] = [];
    const denom = catTotalTokens[cat] + vocabSize * 0.5;

    allQueryTokens.forEach((tk) => {
      const count = catTokenCounts[cat][tk] || 0;
      const logProb = Math.log((count + 0.5) / denom);
      score += logProb;
      if (count > 0 && !tk.startsWith('ctx_')) {
        tokenContributions[cat].push({ token: tk.replace('_', ' '), score: count });
      }
    });
    logScores[cat] = score;
  });

  // Convert log-likelihoods to calibrated probabilities via temperature softmax
  const maxLog = Math.max(...Object.values(logScores));
  const temperature = queryTextTokens.length > 0 ? 1.35 : 2.2;
  const expScores: Record<string, number> = {};
  let sumExp = 0;

  allowedCats.forEach((cat) => {
    const e = Math.exp((logScores[cat] - maxLog) / temperature);
    expScores[cat] = e;
    sumExp += e;
  });

  const rankings = allowedCats
    .map((cat) => ({
      category: cat,
      probability: sumExp > 0 ? expScores[cat] / sumExp : 1 / allowedCats.length,
    }))
    .sort((a, b) => b.probability - a.probability);

  const top = rankings[0] || { category: allowedCats[0], probability: 0.5 };

  // Deduplicate matched signals for explainability
  const seenSignals = new Set<string>();
  const matchedSignals: string[] = [];
  (tokenContributions[top.category] || [])
    .sort((a, b) => b.score - a.score)
    .forEach((item) => {
      if (!seenSignals.has(item.token) && matchedSignals.length < 4) {
        seenSignals.add(item.token);
        matchedSignals.push(item.token);
      }
    });

  if (matchedSignals.length === 0 && amount > 0) {
    matchedSignals.push(`amount ₹${amount}`);
  }

  // Suggest GST rate from historical vendor matches or category rules
  let suggestedGstRate = 0;
  const vendorLower = vendor.trim().toLowerCase();
  const prevVendorTxn = existingTxns.find(
    (t) => t.vendor && vendorLower && t.vendor.toLowerCase() === vendorLower
  );
  if (prevVendorTxn) {
    suggestedGstRate = prevVendorTxn.rate || 0;
  } else {
    const matchingSeed = trainingSet.find(
      (s) => s.category === top.category && queryTextTokens.some((tk) => s.text.includes(tk))
    );
    if (matchingSeed && matchingSeed.gstRate !== undefined) {
      suggestedGstRate = matchingSeed.gstRate;
    } else if (top.category === 'Food' && amount >= 250) {
      suggestedGstRate = 5;
    } else if (top.category === 'Stock' || top.category === 'Sales') {
      suggestedGstRate = 5;
    } else if (top.category === 'Shopping' || top.category === 'Bills') {
      suggestedGstRate = 18;
    }
  }

  const suggestedMethod = prevVendorTxn?.method || (amount >= 5000 ? 'bank' : 'upi');

  // Check duplicate risk in same month/date
  let duplicateMatch: Transaction | null = null;
  if (amount > 0 && vendorLower.length >= 3) {
    duplicateMatch =
      existingTxns.find(
        (t) =>
          t.type === type &&
          Math.abs(t.amount - amount) < 0.01 &&
          t.vendor.toLowerCase() === vendorLower
      ) || null;
  }

  const hasStrongSignal = matchedSignals.some((s) => !s.startsWith('amount'));
  const rawConf = Math.round(top.probability * 100);
  const confidence =
    queryTextTokens.length === 0 && amount === 0
      ? 0
      : hasStrongSignal
      ? Math.min(99, Math.max(64, rawConf + 18))
      : Math.min(78, Math.max(35, rawConf));

  return {
    topCategory: top.category,
    confidence,
    rankings: rankings.slice(0, 3),
    matchedSignals,
    suggestedGstRate,
    suggestedMethod,
    duplicateMatch,
  };
}

export function recordMLTraining(sample: TrainingSample & { predicted?: string; confidence?: number }) {
  const stored = loadStoredML();
  const cleanText = sample.text.trim();
  if (!cleanText) return;

  stored.userSamples.push({
    mode: sample.mode,
    type: sample.type,
    text: cleanText,
    amount: sample.amount,
    time: sample.time,
    method: sample.method,
    category: sample.category,
    gstRate: sample.gstRate,
  });

  // Keep most recent 250 user training samples
  if (stored.userSamples.length > 250) {
    stored.userSamples = stored.userSamples.slice(-250);
  }

  const wasCorrected = Boolean(sample.predicted && sample.predicted !== sample.category);
  stored.stats.totalTrainedSamples = SEED_CORPUS.length + stored.userSamples.length;
  if (wasCorrected) {
    stored.stats.userCorrections += 1;
  }
  stored.stats.lastTrainedAt = new Date().toISOString();

  const allVocab = new Set<string>();
  [...SEED_CORPUS, ...stored.userSamples].forEach((s) => {
    tokenize(s.text).forEach((t) => allVocab.add(t));
  });
  stored.stats.vocabularySize = allVocab.size;

  stored.stats.recentLogs.unshift({
    id: Math.random().toString(36).slice(2, 9),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    input: cleanText.slice(0, 48),
    predicted: sample.predicted || sample.category,
    finalCategory: sample.category,
    confidence: sample.confidence || 85,
    wasCorrected,
  });
  stored.stats.recentLogs = stored.stats.recentLogs.slice(0, 12);

  saveStoredML(stored);
}

export function getMLStats(existingTxns: Transaction[]): MLModelStats {
  const stored = loadStoredML();
  const vocab = new Set<string>();
  [...SEED_CORPUS, ...stored.userSamples].forEach((s) => {
    tokenize(s.text).forEach((t) => vocab.add(t));
  });
  existingTxns.forEach((t) => {
    tokenize(`${t.vendor} ${t.note}`).forEach((tk) => vocab.add(tk));
  });
  return {
    ...stored.stats,
    totalTrainedSamples: SEED_CORPUS.length + stored.userSamples.length + existingTxns.length,
    vocabularySize: vocab.size,
  };
}

// Natural-language expense parser ("Paid 340 at Blue Tokai for cold brew via UPI")
export function parseNaturalExpense(
  input: string,
  mode: AccountMode,
  existingTxns: Transaction[]
): {
  type: TxnType;
  amount: string;
  vendor: string;
  note: string;
  method: string;
  rate: number;
  category: string;
  prediction: MLPrediction;
} | null {
  const raw = input.trim();
  if (!raw) return null;

  // Detect amount (e.g., ₹450, Rs 450, 450.50)
  const amtMatch = raw.match(/(?:₹|rs\.?\s*)?(\d+(?:,\d{3})*(?:\.\d{1,2})?)/i);
  const amountNum = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : 0;

  // Detect type
  let type: TxnType = 'debit';
  if (/\b(received|credited|got|salary|pocket money|sales|sold|income|refund)\b/i.test(raw)) {
    type = 'credit';
  } else if (/\b(save|saved|saving|deposit to goal)\b/i.test(raw)) {
    type = 'save';
  }

  // Detect payment method
  let method = 'upi';
  if (/\b(cash)\b/i.test(raw)) method = 'cash';
  else if (/\b(card|visa|mastercard|rupay|credit card|debit card)\b/i.test(raw)) method = 'card';
  else if (/\b(bank|neft|rtgs|imps|transfer)\b/i.test(raw)) method = 'bank';

  // Detect explicit GST rate if mentioned
  const gstMatch = raw.match(/\b(0|5|12|18|28)\s*%\s*(?:gst|tax)?/i);
  const explicitGst = gstMatch ? parseInt(gstMatch[1], 10) : null;

  // Extract vendor / note
  let cleaned = raw
    .replace(/(?:₹|rs\.?\s*)?\d+(?:,\d{3})*(?:\.\d{1,2})?/i, '')
    .replace(/\b(paid|spent|bought|received|got|via|by|using|upi|cash|card|bank|at|to|from|for|on|gst)\b/gi, ' ')
    .replace(/\b(0|5|12|18|28)\s*%/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Split vendor and note if "for" was present in original text
  let vendor = cleaned;
  let note = '';
  const atForMatch = raw.match(/(?:at|from|to)\s+([A-Za-z0-9\s&']+?)(?:\s+for\s+([A-Za-z0-9\s,&']+?))?(?:\s+via|\s+by|\s+on|$)/i);
  if (atForMatch) {
    vendor = atForMatch[1].replace(/\b(upi|cash|card|bank|\d+)\b/gi, '').trim();
    if (atForMatch[2]) {
      note = atForMatch[2].replace(/\b(upi|cash|card|bank|\d+)\b/gi, '').trim();
    }
  }
  if (!vendor) {
    vendor = cleaned.split(' ').slice(0, 3).join(' ');
    note = cleaned.split(' ').slice(3).join(' ');
  }

  // Capitalize vendor nicely
  if (vendor) {
    vendor = vendor.charAt(0).toUpperCase() + vendor.slice(1);
  }

  const prediction = predictCategory({
    mode,
    type,
    vendor,
    note: note || raw,
    amount: amountNum,
    method,
    existingTxns,
  });

  return {
    type,
    amount: amountNum > 0 ? String(amountNum) : '',
    vendor,
    note,
    method,
    rate: explicitGst !== null ? explicitGst : prediction.suggestedGstRate,
    category: prediction.topCategory,
    prediction,
  };
}

// Pre-built realistic Indian receipts for 1-click ML OCR + Categorization demo
export interface SampleBillTemplate {
  id: string;
  mode: AccountMode;
  label: string;
  vendor: string;
  amount: number;
  rate: number;
  gstin: string;
  tip: number;
  method: string;
  note: string;
  items: LineItem[];
}

export const SAMPLE_BILL_TEMPLATES: SampleBillTemplate[] = [
  {
    id: 'bluetokai',
    mode: 'personal',
    label: 'Blue Tokai Coffee (₹380)',
    vendor: 'Blue Tokai Coffee Roasters',
    amount: 380,
    rate: 5,
    gstin: '07AABCB1234F1Z2',
    tip: 20,
    method: 'upi',
    note: 'Iced Pour Over & Almond Croissant',
    items: [
      { n: 'Iced Pour Over', a: 190 },
      { n: 'Almond Croissant', a: 170 },
    ],
  },
  {
    id: 'apollo',
    mode: 'personal',
    label: 'Apollo Pharmacy (₹465)',
    vendor: 'Apollo Pharmacy',
    amount: 465,
    rate: 12,
    gstin: '27AAACA5678D1Z5',
    tip: 0,
    method: 'card',
    note: 'Vitamin D3 & Paracetamol',
    items: [
      { n: 'Cholecalciferol 60k', a: 285 },
      { n: 'Dolo 650 Strip', a: 180 },
    ],
  },
  {
    id: 'dmrc',
    mode: 'personal',
    label: 'Delhi Metro Recharge (₹600)',
    vendor: 'Delhi Metro Rail Corp',
    amount: 600,
    rate: 0,
    gstin: '',
    tip: 0,
    method: 'upi',
    note: 'Smart card top-up at Rajiv Chowk',
    items: [{ n: 'Smart Card Top-up', a: 600 }],
  },
  {
    id: 'croma',
    mode: 'personal',
    label: 'Croma Electronics (₹2,499)',
    vendor: 'Croma Electronics',
    amount: 2499,
    rate: 18,
    gstin: '27AAACI9876K1Z9',
    tip: 0,
    method: 'card',
    note: 'Logitech Wireless Mouse & USB-C Hub',
    items: [
      { n: 'Logitech M331 Silent Mouse', a: 1199 },
      { n: 'Type-C 4-in-1 Hub', a: 1300 },
    ],
  },
  {
    id: 'haldiram_wholesale',
    mode: 'shop',
    label: 'Bikaner Wholesale Stock (₹7,560)',
    vendor: 'Bikaner Agro & FMCG Distributors',
    amount: 7560,
    rate: 5,
    gstin: '07AABCB9988L1Z4',
    tip: 0,
    method: 'bank',
    note: 'Namkeen & Bhujia cartons for counter',
    items: [
      { n: 'Bhujia 1kg x 12 packs', a: 4320 },
      { n: 'Moong Dal 500g x 18 packs', a: 3240 },
    ],
  },
  {
    id: 'porter_freight',
    mode: 'shop',
    label: 'Porter Mini-Truck (₹480)',
    vendor: 'Porter Logistics Tempo',
    amount: 480,
    rate: 5,
    gstin: '07AAECP4512N1Z1',
    tip: 0,
    method: 'upi',
    note: 'Mandi to shop stock unloading trip',
    items: [{ n: 'Tata Ace Mini-Truck Trip', a: 480 }],
  },
];
