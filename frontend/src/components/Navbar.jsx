import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAlertCount, refreshAll } from '../api/client.js';
import { useState } from 'react';

export default function Navbar() {
  const { data } = useQuery({
    queryKey: ['alertCount'],
    queryFn:  getAlertCount,
    refetchInterval: 30_000,
  });
  const count = data?.count ?? 0;
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try { await refreshAll(); } finally { setRefreshing(false); }
  }

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
      <span className="text-brand font-bold text-lg tracking-wide select-none">
        Bursa Monitor
      </span>

      <div className="flex gap-4 flex-1">
        {[['/', 'Market'], ['/favourites', 'Favourites'], ['/backtest', 'Backtest']].map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `text-sm font-medium px-3 py-1.5 rounded transition-colors ${
                isActive
                  ? 'bg-brand text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`
            }
          >
            {label}
            {label === 'Favourites' && count > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {count}
              </span>
            )}
          </NavLink>
        ))}
      </div>

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
      >
        {refreshing ? 'Refreshing…' : 'Refresh All'}
      </button>
    </nav>
  );
}
