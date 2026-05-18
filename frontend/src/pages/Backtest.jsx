import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getFavourites, runBacktest } from '../api/client.js';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const CONDITION_TYPES = [
  { value: 'price_above',      label: 'Price above' },
  { value: 'price_below',      label: 'Price below' },
  { value: 'pct_change_above', label: '% Change above' },
  { value: 'pct_change_below', label: '% Change below' },
  { value: 'rsi_above',        label: 'RSI above' },
  { value: 'rsi_below',        label: 'RSI below' },
  { value: 'macd_crossover',   label: 'MACD crossover (bullish)' },
  { value: 'macd_crossunder',  label: 'MACD crossunder (bearish)' },
  { value: '52w_high',         label: '52-week high hit' },
  { value: '52w_low',          label: '52-week low hit' },
];

const NEEDS_THRESHOLD = new Set([
  'price_above','price_below','pct_change_above','pct_change_below','rsi_above','rsi_below'
]);

const BLANK_COND = { type: 'price_above', threshold: '', logic: 'AND' };

function ConditionRow({ cond, onChange, onRemove }) {
  return (
    <div className="flex gap-2 items-center">
      <select
        value={cond.type}
        onChange={(e) => onChange({ ...cond, type: e.target.value })}
        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-brand"
      >
        {CONDITION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      {NEEDS_THRESHOLD.has(cond.type) && (
        <input
          type="number" step="any" value={cond.threshold}
          onChange={(e) => onChange({ ...cond, threshold: e.target.value })}
          placeholder="value"
          className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-brand"
        />
      )}
      <select
        value={cond.logic}
        onChange={(e) => onChange({ ...cond, logic: e.target.value })}
        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-brand"
      >
        <option value="AND">AND</option>
        <option value="OR">OR</option>
      </select>
      <button onClick={onRemove} className="text-red-500 hover:text-red-400 px-1">✕</button>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-mono font-semibold ${color ?? 'text-gray-100'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

const fmt = (v, d = 2) => v != null ? Number(v).toFixed(d) : '—';
const fmtMYR = (v) => v != null ? `RM ${Number(v).toLocaleString('en-MY', { minimumFractionDigits: 2 })}` : '—';

export default function Backtest() {
  const { data: favs = [] } = useQuery({ queryKey: ['favourites'], queryFn: getFavourites });

  const [symbol,   setSymbol]   = useState('');
  const [startDate, setStart]   = useState('2023-01-01');
  const [endDate,   setEnd]     = useState(new Date().toISOString().slice(0, 10));
  const [capital,   setCapital] = useState('10000');
  const [stopLoss,  setSL]      = useState('');
  const [takeProfit, setTP]     = useState('');
  const [entryConditions, setEntry] = useState([{ ...BLANK_COND }]);
  const [exitConditions,  setExit]  = useState([]);

  const backtestMut = useMutation({ mutationFn: runBacktest });

  function handleRun() {
    if (!symbol) return;
    backtestMut.mutate({
      symbol,
      startDate,
      endDate,
      capital:    parseFloat(capital),
      stopLoss:   stopLoss   ? parseFloat(stopLoss)   : null,
      takeProfit: takeProfit ? parseFloat(takeProfit) : null,
      entryConditions: entryConditions.map((c) => ({
        type: c.type, threshold: c.threshold !== '' ? parseFloat(c.threshold) : null, logic: c.logic,
      })),
      exitConditions: exitConditions.map((c) => ({
        type: c.type, threshold: c.threshold !== '' ? parseFloat(c.threshold) : null, logic: c.logic,
      })),
    });
  }

  const result  = backtestMut.data;
  const summary = result?.summary;
  const equity  = result?.equity ?? [];
  const trades  = result?.trades ?? [];

  const equityData = equity.map((e) => ({
    date:  new Date(e.date).toLocaleDateString('en-MY', { month: 'short', day: 'numeric', year: '2-digit' }),
    value: e.value,
  }));

  return (
    <div className="space-y-6">
      {/* Config panel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-200">Backtest Configuration</h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-xs text-gray-500 mb-1 block">Stock (favourites)</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">Select…</option>
              {favs.map((f) => (
                <option key={f.symbol} value={f.symbol}>{f.symbol} — {f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">End date</label>
            <input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Capital (MYR)</label>
            <input type="number" value={capital} onChange={(e) => setCapital(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Stop-loss %</label>
              <input type="number" value={stopLoss} onChange={(e) => setSL(e.target.value)} placeholder="—"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Take-profit %</label>
              <input type="number" value={takeProfit} onChange={(e) => setTP(e.target.value)} placeholder="—"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
          </div>
        </div>

        {/* Entry conditions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Entry Conditions</span>
            <button onClick={() => setEntry([...entryConditions, { ...BLANK_COND }])}
              className="text-xs text-brand-light hover:underline">+ Add</button>
          </div>
          <div className="space-y-2">
            {entryConditions.map((c, i) => (
              <ConditionRow key={i} cond={c}
                onChange={(nc) => setEntry(entryConditions.map((x, j) => j === i ? nc : x))}
                onRemove={() => setEntry(entryConditions.filter((_, j) => j !== i))} />
            ))}
          </div>
        </div>

        {/* Exit conditions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
              Exit Conditions <span className="text-gray-600 normal-case">(optional — use stop-loss / take-profit instead)</span>
            </span>
            <button onClick={() => setExit([...exitConditions, { ...BLANK_COND }])}
              className="text-xs text-brand-light hover:underline">+ Add</button>
          </div>
          <div className="space-y-2">
            {exitConditions.map((c, i) => (
              <ConditionRow key={i} cond={c}
                onChange={(nc) => setExit(exitConditions.map((x, j) => j === i ? nc : x))}
                onRemove={() => setExit(exitConditions.filter((_, j) => j !== i))} />
            ))}
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={!symbol || backtestMut.isPending}
          className="bg-brand hover:bg-brand-light text-white font-medium px-8 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {backtestMut.isPending ? 'Running…' : 'Run Backtest'}
        </button>
        {backtestMut.isError && (
          <p className="text-red-400 text-sm">{backtestMut.error?.response?.data?.error ?? 'Error running backtest'}</p>
        )}
        {result?.error && <p className="text-red-400 text-sm">{result.error}</p>}
      </div>

      {/* Results */}
      {summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatCard label="Start Capital" value={fmtMYR(summary.startCapital)} />
            <StatCard label="End Capital"   value={fmtMYR(summary.endCapital)}
              color={summary.endCapital >= summary.startCapital ? 'text-emerald-400' : 'text-red-400'} />
            <StatCard label="Total Return"  value={`${fmt(summary.totalReturn)}%`}
              color={summary.totalReturn >= 0 ? 'positive' : 'negative'} />
            <StatCard label="Total P&L"     value={fmtMYR(summary.totalPnl)}
              color={summary.totalPnl >= 0 ? 'positive' : 'negative'} />
            <StatCard label="Trades"        value={summary.numTrades} />
            <StatCard label="Win Rate"      value={`${fmt(summary.winRate)}%`}
              color={summary.winRate >= 50 ? 'positive' : 'negative'} />
            <StatCard label="Max Drawdown"  value={`${fmt(summary.maxDrawdown)}%`} color="text-red-400" />
          </div>

          {/* Equity curve */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-sm font-medium text-gray-400 mb-4">Equity Curve</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={equityData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => `RM${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(v) => [`RM ${Number(v).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`, 'Portfolio']}
                />
                <ReferenceLine y={summary.startCapital} stroke="#374151" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="value" stroke="#1a6fb5" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Trades table */}
          {trades.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-gray-500 tracking-wide border-b border-gray-800">
                  <tr>
                    <th className="text-left px-4 py-3">#</th>
                    <th className="text-left px-4 py-3">Entry</th>
                    <th className="text-left px-4 py-3">Exit</th>
                    <th className="text-right px-4 py-3">Entry px</th>
                    <th className="text-right px-4 py-3">Exit px</th>
                    <th className="text-right px-4 py-3">Shares</th>
                    <th className="text-right px-4 py-3">P&L</th>
                    <th className="text-right px-4 py-3">Return</th>
                    <th className="text-left px-4 py-3">Exit reason</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => (
                    <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-gray-600">{i + 1}</td>
                      <td className="px-4 py-2 text-gray-400">{new Date(t.entryDate).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-gray-400">{new Date(t.exitDate).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-right font-mono">{fmt(t.entryPrice, 3)}</td>
                      <td className="px-4 py-2 text-right font-mono">{fmt(t.exitPrice, 3)}</td>
                      <td className="px-4 py-2 text-right text-gray-400">{t.shares}</td>
                      <td className={`px-4 py-2 text-right font-mono ${t.pnl >= 0 ? 'positive' : 'negative'}`}>
                        {t.pnl >= 0 ? '+' : ''}{fmt(t.pnl, 2)}
                      </td>
                      <td className={`px-4 py-2 text-right ${t.pnlPct >= 0 ? 'positive' : 'negative'}`}>
                        {t.pnlPct >= 0 ? '+' : ''}{fmt(t.pnlPct)}%
                      </td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{t.exitReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
