import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import MarketOverview from './pages/MarketOverview.jsx';
import Favourites from './pages/Favourites.jsx';
import Backtest from './pages/Backtest.jsx';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-screen-2xl">
        <Routes>
          <Route path="/"           element={<MarketOverview />} />
          <Route path="/favourites" element={<Favourites />} />
          <Route path="/backtest"   element={<Backtest />} />
          <Route path="*"           element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
