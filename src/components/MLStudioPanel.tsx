import React, { useState, useMemo } from 'react';
import {
  AccountMode,
  CATEGORIES,
  SAMPLE_BILL_TEMPLATES,
  SampleBillTemplate,
  Transaction,
  getMLStats,
  parseNaturalExpense,
  predictCategory,
} from '../ml/categorizer';
import { inr2 } from '../utils/ledgerCore';
import { ICON } from './Icons';

interface MLStudioPanelProps {
  mode: AccountMode;
  txns: Transaction[];
  monthTxns: Transaction[];
  onQuickAddParsed: (parsed: NonNullable<ReturnType<typeof parseNaturalExpense>>) => void;
  onScanSampleBill: (tpl: SampleBillTemplate) => void;
  onBatchRecategorize: () => number;
  onTrainCustom: (vendor: string, category: string, gstRate: number) => void;
}

export const MLStudioPanel: React.FC<MLStudioPanelProps> = ({
  mode,
  txns,
  monthTxns,
  onQuickAddParsed,
  onScanSampleBill,
  onBatchRecategorize,
  onTrainCustom,
}) => {
  const [sandboxText, setSandboxText] = useState(
    mode === 'personal'
      ? 'Paid 340 at Blue Tokai for cold brew via UPI'
      : 'Bought 6800 basmati rice stock from Sharma Traders 5% GST'
  );
  const [customVendor, setCustomVendor] = useState('');
  const [customCat, setCustomCat] = useState(CATEGORIES[mode].debit[0]);
  const [customGst, setCustomGst] = useState(0);
  const [trainFeedback, setTrainFeedback] = useState('');

  const stats = useMemo(() => getMLStats(txns), [txns, trainFeedback]);

  const liveParsed = useMemo(
    () => parseNaturalExpense(sandboxText, mode, txns),
    [sandboxText, mode, txns]
  );

  // Compute average ML confidence across this month's debit/credit entries
  const mlCoverage = useMemo(() => {
    const eligible = monthTxns.filter((t) => t.type !== 'save');
    if (!eligible.length) return { count: 0, avgConfidence: 94, otherCount: 0 };
    let totalConf = 0;
    let otherCount = 0;
    eligible.forEach((t) => {
      if (t.category === 'Other') otherCount++;
      const pred = predictCategory({
        mode,
        type: t.type,
        vendor: t.vendor,
        note: t.note,
        items: t.items,
        amount: t.amount,
        time: t.time,
        method: t.method,
        existingTxns: txns,
      });
      totalConf += t.mlConfidence || pred.confidence || 88;
    });
    return {
      count: eligible.length,
      avgConfidence: Math.round(totalConf / eligible.length),
      otherCount,
    };
  }, [monthTxns, mode, txns]);

  const templates = SAMPLE_BILL_TEMPLATES.filter((t) => t.mode === mode);

  const handleTeach = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customVendor.trim()) return;
    onTrainCustom(customVendor.trim(), customCat, customGst);
    setTrainFeedback(`Learned "${customVendor.trim()}" → ${customCat}`);
    setCustomVendor('');
    setTimeout(() => setTrainFeedback(''), 3000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Model Telemetry Summary Card */}
      <section className="card">
        <div className="between">
          <div>
            <span className="kicker">On-Device ML Classifier</span>
            <h2 style={{ fontSize: '18px', marginTop: '2px' }}>
              Naive Bayes + TF-IDF Auto-Categorizer
            </h2>
          </div>
          <span className="chip-inr num">{mlCoverage.avgConfidence}% avg confidence</span>
        </div>
        <p className="sub" style={{ marginTop: '6px' }}>
          Automatically predicts expense categories, GST slabs, and payment methods from vendor names, item lines, amounts, and time of day. Retrains incrementally whenever you log or recategorize an entry.
        </p>

        <div className="gtiles" style={{ marginTop: '12px' }}>
          <div className="t ok">
            <div className="k">Trained samples</div>
            <div className="v num">{stats.totalTrainedSamples}</div>
          </div>
          <div className="t">
            <div className="k">Learned n-grams</div>
            <div className="v num">{stats.vocabularySize}</div>
          </div>
          <div className="t">
            <div className="k">Categorized this month</div>
            <div className="v num">{mlCoverage.count} entries</div>
          </div>
          <div className="t">
            <div className="k">Active corrections</div>
            <div className="v num">{stats.userCorrections}</div>
          </div>
        </div>

        <div className="btnrow" style={{ marginTop: '12px' }}>
          <button
            type="button"
            className="btn sm out"
            onClick={() => {
              const updated = onBatchRecategorize();
              setTrainFeedback(
                updated > 0
                  ? `Re-categorized ${updated} ${updated === 1 ? 'entry' : 'entries'} with updated ML weights.`
                  : 'All entries this month already match highest-confidence ML predictions.'
              );
              setTimeout(() => setTrainFeedback(''), 3500);
            }}
          >
            {ICON.cpu}
            Re-run ML across month ({mlCoverage.count})
          </button>
        </div>
        {trainFeedback && (
          <p className="status" style={{ marginTop: '10px', padding: '8px 12px', fontSize: '12.5px' }}>
            {trainFeedback}
          </p>
        )}
      </section>

      {/* Live Natural Language Expense Parser & Classifier Sandbox */}
      <section className="card">
        <div className="sec-head">
          <h3>Natural Language Expense Parser &amp; Live Classifier</h3>
          <span className="sub">Real-time inference</span>
        </div>
        <p className="sub" style={{ marginTop: '4px' }}>
          Type a plain-English expense below to inspect live category probabilities, or add it directly to your ledger.
        </p>

        <div className="nlp-bar" style={{ marginTop: '10px' }}>
          {ICON.cpu}
          <input
            type="text"
            value={sandboxText}
            onChange={(e) => setSandboxText(e.target.value)}
            placeholder={
              mode === 'personal'
                ? 'e.g. Paid 260 at Swiggy for masala dosa via UPI'
                : 'e.g. Paid 4200 to Sharma Traders for mustard oil stock'
            }
            aria-label="Natural language expense input"
          />
          {liveParsed && liveParsed.amount && (
            <button
              type="button"
              className="btn sm"
              style={{ height: '34px', padding: '0 12px', fontSize: '12.5px' }}
              onClick={() => onQuickAddParsed(liveParsed)}
            >
              Use in Capture
            </button>
          )}
        </div>

        {liveParsed && (
          <div className="ml-panel" style={{ marginTop: '10px' }}>
            <div className="between" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <span className="kicker">Predicted Category</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent)' }}>
                  {liveParsed.prediction.topCategory}{' '}
                  <span className="num" style={{ fontSize: '13px', fontWeight: 600 }}>
                    ({liveParsed.prediction.confidence}% confidence)
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--muted)' }}>
                <div>
                  Amount:{' '}
                  <strong className="num" style={{ color: 'var(--ink)' }}>
                    {liveParsed.amount ? inr2(parseFloat(liveParsed.amount)) : '—'}
                  </strong>{' '}
                  · GST:{' '}
                  <strong className="num" style={{ color: 'var(--ink)' }}>
                    {liveParsed.rate}%
                  </strong>
                </div>
                <div>
                  Vendor: <strong style={{ color: 'var(--ink)' }}>{liveParsed.vendor || '—'}</strong> · Via:{' '}
                  <strong style={{ color: 'var(--ink)', textTransform: 'uppercase' }}>
                    {liveParsed.method}
                  </strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              {liveParsed.prediction.rankings.map((r) => {
                const pct = Math.round(r.probability * 100);
                return (
                  <div key={r.category} className="ml-prob-row">
                    <span style={{ fontWeight: r.category === liveParsed.prediction.topCategory ? 700 : 500 }}>
                      {r.category}
                    </span>
                    <div className="ml-prob-track">
                      <div className="ml-prob-fill" style={{ width: `${Math.max(4, pct)}%` }} />
                    </div>
                    <span className="num" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>

            {liveParsed.prediction.matchedSignals.length > 0 && (
              <div className="sub" style={{ fontSize: '12px' }}>
                Matched signals:{' '}
                <span className="num" style={{ color: 'var(--ink)' }}>
                  {liveParsed.prediction.matchedSignals.join(' · ')}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* One-Click Smart Receipt OCR & Auto-Categorization Presets */}
      <section className="card">
        <div className="sec-head">
          <h3>Smart Bill Scanner Presets</h3>
          <span className="sub">1-tap OCR + ML demo</span>
        </div>
        <p className="sub" style={{ marginTop: '4px' }}>
          Pick a sample Indian bill below to generate its receipt slip, extract line items &amp; GST, and auto-categorize it in Capture.
        </p>
        <div className="chips" style={{ marginTop: '10px' }}>
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="chip"
              onClick={() => onScanSampleBill(tpl)}
            >
              {ICON.camera}
              {tpl.label}
            </button>
          ))}
        </div>
      </section>

      {/* Teach the Model (Online Active Learning Form) */}
      <section className="card">
        <div className="sec-head">
          <h3>Teach Custom Vendor Rule</h3>
          <span className="sub">Online active learning</span>
        </div>
        <p className="sub" style={{ marginTop: '4px' }}>
          Add a recurring merchant or keyword to update the Naive Bayes token weights immediately.
        </p>
        <form onSubmit={handleTeach} className="form" style={{ marginTop: '10px' }}>
          <div className="two">
            <div className="tf always">
              <input
                id="ml-teach-vendor"
                type="text"
                placeholder="e.g. Namma Filter Coffee"
                value={customVendor}
                onChange={(e) => setCustomVendor(e.target.value)}
              />
              <label htmlFor="ml-teach-vendor">Vendor or keyword</label>
            </div>
            <div className="tf always">
              <select
                id="ml-teach-cat"
                value={customCat}
                onChange={(e) => setCustomCat(e.target.value)}
                style={{
                  height: '52px',
                  width: '100%',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                  borderRadius: '14px',
                  padding: '0 14px',
                  fontSize: '15px',
                  outline: 'none',
                }}
              >
                {CATEGORIES[mode].debit.map((c) => (
                  <option key={c} value={c}>
                    {c} (Debit)
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="between">
            <div className="chips">
              {[0, 5, 12, 18].map((r) => (
                <button
                  key={r}
                  type="button"
                  className="chip"
                  aria-pressed={customGst === r}
                  onClick={() => setCustomGst(r)}
                >
                  {r ? `${r}% GST` : 'No GST'}
                </button>
              ))}
            </div>
            <button type="submit" className="btn sm">
              Train Model
            </button>
          </div>
        </form>

        {stats.recentLogs.length > 0 && (
          <div style={{ marginTop: '14px', borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
            <h3 style={{ marginBottom: '8px' }}>Recent Active Learning Updates</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {stats.recentLogs.slice(0, 4).map((log) => (
                <div
                  key={log.id}
                  className="between"
                  style={{ fontSize: '12.5px', color: 'var(--muted)' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong style={{ color: 'var(--ink)' }}>{log.input}</strong> → {log.finalCategory}
                  </span>
                  <span className="num" style={{ flex: 'none' }}>
                    {log.wasCorrected ? 'User refined' : `${log.confidence}% ML`} · {log.timestamp}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
