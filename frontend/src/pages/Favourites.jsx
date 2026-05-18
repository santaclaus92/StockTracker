import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFavourites, removeFavourite, getAlerts, dismissAlert, dismissAll } from '../api/client.js';
import ConditionModal from '../components/ConditionModal.jsx';

const fmt  = (v, d = 3) => v != null ? Number(v).toFixed(d) : '—';
const fmtV = (v) => v != null ? Number(v).toLocaleString() : '—';

function PctBadge({ value }) {
  if (value == null) return <span className="text-gray-500">—</span>;
  const cls = value >= 0 ? 'positive' : 'negative';
  return <span className={cls}>{value >= 0 ? '+' : ''}{Number(value).toFixed(2)}%</span>;
}

export default function Favourites() {
  const qc = useQueryClient();
  const [selectedStock, setSelectedStock] = useState(null);

  const { data: favs = [], isFetching } = useQuery({
    queryKey: ['favourites'],
    queryFn:  getFavourites,
    refetchInterval: 60_000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn:  () => getAlerts({ limit: 100 }),
    refetchInterval: 30_000,
  });

  const removeMut = useMutation({
    mutationFn: removeFavourite,
    onSuccess: () => {
      qc.invalidateQueries(['favourites']);
      qc.invalidateQueries(['stocks']);
    },
  });

  const dismissMut    = useMutation({ mutationFn: dismissAlert,   onSuccess: () => qc.invalidateQueries(['alerts']) });
  const dismissAllMut = useMutation({ mutationFn: dismissAll,     onSuccess: () => qc.invalidateQueries(['alerts']) });

  // Group alerts by stock
  const alertsByStock = alerts.reduce((acc, a) => {
    if (!acc[a.stock_id]) acc[a.stock_id] = [];
    acc[a.stock_id].push(a);
    return acc;
  }, {});

  return (
    <div>
      {/* Alerts panel */}
      {alerts.length > 0 && (
        <div className="mb-6 bg-gray-900 border border-yellow-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-yellow-400">Active Alerts ({alerts.length})</h3>
            <button
              onClick={() => dismissAllMut.mutate()}
              className="text-xs text-gray-400 hover:text-white underline"
            >
              Dismiss all
            </button>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm bg-gray-800 rounded-lg px-3 py-2">
                <span>
                  <span className="text-yellow-400 font-mono mr-2">{a.symbol}</span>
                  <span className="text-gray-300">{a.message}</span>
                </span>
                <button
                  onClick={() => dismissMut.mutate(a.id)}
                  className="text-gray-600 hover:text-gray-400 ml-3 text-xs shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Favourites grid */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm text-gray-400">
          {favs.length} favourite{favs.length !== 1 ? 's' : ''} {isFetching && '· updating…'}
        </h2>
      </div>

      {favs.length === 0 && (
        <div className="text-center py-24 text-gray-600">
          Star stocks on the Market Overview page to add them here.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {favs.map((stock) => {
          const stockAlerts = alertsByStock[stock.id] ?? [];
          return (
            <div key={stock.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-blue-400 font-semibold">{stock.symbol}</span>
                    {stockAlerts.length > 0 && (
                      <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5">
                        {stockAlerts.length}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[180px]">{stock.name}</div>
                </div>
                <button
                  onClick={() => removeMut.mutate(stock.symbol)}
                  className="text-yellow-400 hover:text-gray-500 text-lg leading-none"
                  title="Remove from favourites"
                >
                  ★
                </button>
              </div>

              {/* Price row */}
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-mono font-semibold">
                    {stock.price != null ? fmt(stock.price) : <span className="text-gray-600">—</span>}
                  </div>
                  <div className="text-sm mt-0.5">
                    <PctBadge value={stock.pct_change} />
                  </div>
                </div>
                <div className="text-right text-xs text-gray-600">
                  <div>H {fmt(stock.high)}</div>
                  <div>L {fmt(stock.low)}</div>
                </div>
              </div>

              {/* 52w */}
              <div className="flex justify-between text-xs text-gray-600">
                <span>52w H: {fmt(stock.week52_high)}</span>
                <span>52w L: {fmt(stock.week52_low)}</span>
              </div>

              {/* Vol */}
              <div className="text-xs text-gray-600">Vol: {fmtV(stock.volume)}</div>

              {/* Actions */}
              <button
                onClick={() => setSelectedStock(stock)}
                className="mt-auto w-full text-xs border border-brand text-brand-light hover:bg-brand hover:text-white py-1.5 rounded-lg transition-colors"
              >
                Set Conditions
              </button>
            </div>
          );
        })}
      </div>

      {selectedStock && (
        <ConditionModal stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </div>
  );
}
