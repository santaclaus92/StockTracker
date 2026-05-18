import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStocks, getSectors, addFavourite, removeFavourite } from '../api/client.js';

const fmt  = (v, d = 2) => v != null ? Number(v).toFixed(d) : '—';
const fmtV = (v) => v != null ? Number(v).toLocaleString() : '—';

function PctBadge({ value }) {
  if (value == null) return <span className="text-gray-500">—</span>;
  const cls = value >= 0 ? 'positive' : 'negative';
  return <span className={cls}>{value >= 0 ? '+' : ''}{fmt(value)}%</span>;
}

export default function MarketOverview() {
  const qc = useQueryClient();
  const [page,   setPage]   = useState(1);
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['stocks', page, search, sector],
    queryFn:  () => getStocks({ page, limit: 50, search: search || undefined, sector: sector || undefined }),
    keepPreviousData: true,
    refetchInterval:  60_000,
  });

  const { data: sectors = [] } = useQuery({ queryKey: ['sectors'], queryFn: getSectors });

  const favMut = useMutation({
    mutationFn: ({ symbol, isFav }) =>
      isFav ? removeFavourite(symbol) : addFavourite(symbol),
    onSuccess: () => {
      qc.invalidateQueries(['stocks']);
      qc.invalidateQueries(['favourites']);
    },
  });

  const rows  = data?.data  ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search symbol or name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <select
          value={sector}
          onChange={(e) => { setSector(e.target.value); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">All sectors</option>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="ml-auto text-sm text-gray-500 self-center">
          {total.toLocaleString()} stocks {isFetching && '· updating…'}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 w-8"></th>
              <th className="text-left px-4 py-3">Symbol</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Sector</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">Change</th>
              <th className="text-right px-4 py-3">High</th>
              <th className="text-right px-4 py-3">Low</th>
              <th className="text-right px-4 py-3">52w H</th>
              <th className="text-right px-4 py-3">52w L</th>
              <th className="text-right px-4 py-3">Volume</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center py-12 text-gray-600">
                  {isFetching ? 'Loading…' : 'No stocks found'}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-800 hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-2.5 text-center">
                  <button
                    onClick={() => favMut.mutate({ symbol: row.symbol, isFav: !!row.is_favourite })}
                    className={`text-lg leading-none transition-colors ${
                      row.is_favourite ? 'text-yellow-400' : 'text-gray-700 hover:text-yellow-400'
                    }`}
                    title={row.is_favourite ? 'Remove favourite' : 'Add to favourites'}
                  >
                    ★
                  </button>
                </td>
                <td className="px-4 py-2.5 font-mono text-blue-400">{row.symbol}</td>
                <td className="px-4 py-2.5 text-gray-200">{row.name}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{row.sector ?? '—'}</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-100">{row.price != null ? fmt(row.price, 3) : <span className="text-gray-600">—</span>}</td>
                <td className="px-4 py-2.5 text-right"><PctBadge value={row.pct_change} /></td>
                <td className="px-4 py-2.5 text-right text-gray-400">{fmt(row.high, 3)}</td>
                <td className="px-4 py-2.5 text-right text-gray-400">{fmt(row.low, 3)}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{fmt(row.week52_high, 3)}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{fmt(row.week52_low, 3)}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{fmtV(row.volume)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
        <span>Page {page} of {pages}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded border border-gray-700 hover:border-gray-500 disabled:opacity-30"
          >
            ← Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-3 py-1.5 rounded border border-gray-700 hover:border-gray-500 disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
