import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCondition, deleteCondition, getConditions } from '../api/client.js';

const TYPES = [
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

const CHANNELS = [
  { value: 'dashboard', label: 'Dashboard only' },
  { value: 'email',     label: 'Email' },
  { value: 'telegram',  label: 'Telegram' },
  { value: 'both',      label: 'Email + Telegram' },
];

const NEEDS_THRESHOLD = [
  'price_above','price_below','pct_change_above','pct_change_below','rsi_above','rsi_below'
];

export default function ConditionModal({ stock, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: 'price_above', threshold: '', channel: 'dashboard', label: '' });

  const { data: conditions = [] } = useQuery({
    queryKey: ['conditions', stock.symbol],
    queryFn:  () => getConditions(stock.symbol),
  });

  const addMut = useMutation({
    mutationFn: createCondition,
    onSuccess: () => {
      qc.invalidateQueries(['conditions', stock.symbol]);
      setForm({ type: 'price_above', threshold: '', channel: 'dashboard', label: '' });
    },
  });

  const delMut = useMutation({
    mutationFn: deleteCondition,
    onSuccess: () => qc.invalidateQueries(['conditions', stock.symbol]),
  });

  function handleSubmit(e) {
    e.preventDefault();
    addMut.mutate({
      symbol:    stock.symbol,
      type:      form.type,
      threshold: form.threshold !== '' ? parseFloat(form.threshold) : null,
      channel:   form.channel,
      label:     form.label || null,
    });
  }

  const needsThreshold = NEEDS_THRESHOLD.includes(form.type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Conditions — <span className="text-brand-light">{stock.symbol}</span>
            <span className="text-gray-400 text-sm ml-2">{stock.name}</span>
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Existing conditions */}
        {conditions.length > 0 && (
          <div className="mb-4 space-y-2">
            {conditions.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 text-sm">
                <span>
                  <span className="text-blue-400">{TYPES.find((t) => t.value === c.type)?.label ?? c.type}</span>
                  {c.threshold != null && <span className="text-gray-300 ml-1">@ {c.threshold}</span>}
                  <span className="text-gray-500 ml-2">→ {c.channel}</span>
                  {c.label && <span className="text-gray-500 ml-2 italic">{c.label}</span>}
                </span>
                <button
                  onClick={() => delMut.mutate(c.id)}
                  className="text-red-500 hover:text-red-400 ml-3 text-xs"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add condition form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Condition type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Alert channel</label>
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {needsThreshold && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Threshold value</label>
              <input
                type="number"
                step="any"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                required
                placeholder={form.type.startsWith('rsi') ? '0–100' : form.type.includes('pct') ? 'e.g. 5 for 5%' : 'Price in MYR'}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Label (optional)</label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Support level"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          <button
            type="submit"
            disabled={addMut.isPending}
            className="w-full bg-brand hover:bg-brand-light text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {addMut.isPending ? 'Adding…' : 'Add Condition'}
          </button>
          {addMut.isError && (
            <p className="text-red-400 text-xs">{addMut.error?.response?.data?.error ?? 'Error adding condition'}</p>
          )}
        </form>
      </div>
    </div>
  );
}
