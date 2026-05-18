import { useState, useEffect, useRef, useCallback } from 'react';
import {
  createChart, CrosshairMode, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries,
} from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { getChart, searchStocks } from '../api/client.js';

// ── Colour palette ─────────────────────────────────────────────────────────
const C = {
  bgPane:    '#0d1117',
  grid:      '#161b22',
  border:    '#21262d',
  text:      '#8b949e',
  up:        '#26a641',
  down:      '#f85149',
  sma20:     '#e3b341',
  sma50:     '#58a6ff',
  ema20:     '#bc8cff',
  bbUpper:   '#388bfd55',
  bbLower:   '#388bfd55',
  bbMid:     '#388bfd88',
  macdLine:  '#58a6ff',
  macdSig:   '#f0883e',
  macdHUp:   '#26a641',
  macdHDown: '#f85149',
  rsi:       '#d2a8ff',
};

const CHART_OPT = (h, showTime = true) => ({
  height:    h,
  layout:    { background: { color: C.bgPane }, textColor: C.text },
  grid:      { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: C.border },
  timeScale: { borderColor: C.border, timeVisible: showTime, secondsVisible: false, visible: showTime },
});

function syncCharts(charts) {
  charts.forEach((src) => {
    src.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      charts.forEach((tgt) => { if (tgt !== src) tgt.timeScale().setVisibleLogicalRange(range); });
    });
  });
}

// ── Drag-to-resize handle between panes ────────────────────────────────────
function ResizeHandle({ onResize }) {
  const lastY = useRef(null);
  const onMouseDown = (e) => {
    e.preventDefault();
    lastY.current = e.clientY;
    const onMove = (me) => {
      const dy = me.clientY - lastY.current;
      lastY.current = me.clientY;
      onResize(dy);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return (
    <div
      onMouseDown={onMouseDown}
      className="h-2 bg-gray-800 hover:bg-blue-600/40 cursor-ns-resize transition-colors flex items-center justify-center group select-none"
    >
      <div className="w-10 h-px rounded bg-gray-600 group-hover:bg-blue-400 transition-colors" />
    </div>
  );
}

function PaneLabel({ children }) {
  return (
    <div className="text-xs text-gray-500 font-medium px-3 pt-2 pb-1 uppercase tracking-wide border-b border-gray-800">
      {children}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm font-mono font-semibold mt-0.5 ${color ?? 'text-gray-100'}`}>{value}</div>
    </div>
  );
}

const fmt  = (v, d = 3) => v != null ? Number(v).toFixed(d) : '—';
const fmtV = (v)        => v != null ? Number(v).toLocaleString() : '—';

// ── Analysis page ──────────────────────────────────────────────────────────
export default function Analysis() {
  // ── Autocomplete state
  const [input,       setInput]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showDrop,    setShowDrop]    = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(-1);
  const inputRef    = useRef(null);
  const dropRef     = useRef(null);
  const debounceRef = useRef(null);

  const [interval, setInterval] = useState('1h');
  const [days,     setDays]     = useState(90);
  const [queried,  setQueried]  = useState(null);
  const reloadTimerRef = useRef(null);

  // Auto-reload when interval or days change (if a symbol is already loaded)
  useEffect(() => {
    if (!queried) return;
    clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      setQueried((prev) => prev ? { ...prev, interval, days } : null);
    }, 400);
    return () => clearTimeout(reloadTimerRef.current);
  }, [interval, days]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pane heights (resizable)
  const [paneH, setPaneH] = useState({ main: 400, rsi: 100, macd: 120 });
  const resizePane = useCallback((key, dy) => {
    setPaneH((prev) => ({ ...prev, [key]: Math.max(80, prev[key] + dy) }));
  }, []);

  // ── Autocomplete handlers
  const handleInputChange = (val) => {
    setInput(val);
    setActiveIdx(-1);
    clearTimeout(debounceRef.current);
    if (val.trim().length < 1) { setSuggestions([]); setShowDrop(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchStocks(val.trim());
        setSuggestions(results ?? []);
        setShowDrop(true);
      } catch { setSuggestions([]); }
    }, 220);
  };

  const pickSuggestion = useCallback((s) => {
    const sym = s.symbol.toUpperCase();
    setInput(sym);
    setSuggestions([]);
    setShowDrop(false);
    setActiveIdx(-1);
    // Load chart immediately when a counter is selected
    setQueried((prev) => ({ symbol: sym, interval: prev?.interval ?? interval, days: prev?.days ?? days }));
  }, [interval, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e) => {
    if (!showDrop || !suggestions.length) {
      if (e.key === 'Enter') { setShowDrop(false); handleLoad(); }
      return;
    }
    if (e.key === 'ArrowDown')                    { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp')                 { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); pickSuggestion(suggestions[activeIdx]); }
    else if (e.key === 'Escape')                  { setShowDrop(false); }
    else if (e.key === 'Enter')                   { setShowDrop(false); handleLoad(); }
  };

  useEffect(() => {
    const onDown = (e) => {
      if (!dropRef.current?.contains(e.target) && !inputRef.current?.contains(e.target))
        setShowDrop(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // ── Chart DOM refs
  const candleEl = useRef(null);
  const rsiEl    = useRef(null);
  const macdEl   = useRef(null);
  const chartInst = useRef([]);

  // ── Tooltip DOM refs
  const mainTipRef = useRef(null);
  const rsiTipRef  = useRef(null);
  const macdTipRef = useRef(null);

  // ── Data fetch
  const enabled = queried !== null;
  const { data, isFetching, error } = useQuery({
    queryKey: ['chart', queried?.symbol, queried?.interval, queried?.days],
    queryFn:  () => getChart(queried.symbol, { interval: queried.interval, days: queried.days }),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // ── Apply height to existing chart instances when paneH changes
  useEffect(() => {
    const [cc, rc, mc] = chartInst.current;
    if (cc) cc.applyOptions({ height: paneH.main });
    if (rc) rc.applyOptions({ height: paneH.rsi });
    if (mc) mc.applyOptions({ height: paneH.macd });
  }, [paneH]);

  // ── Build / refresh charts whenever data arrives
  useEffect(() => {
    chartInst.current.forEach((c) => { try { c.remove(); } catch {} });
    chartInst.current = [];
    if (!data || !candleEl.current) return;

    const { ohlcv, indicators } = data;
    const { rsi, macd, bb, sma20, sma50, ema20 } = indicators;

    // 1 ── Main: Volume + Candlestick + overlays
    const cc = createChart(candleEl.current, CHART_OPT(paneH.main));

    const vs = cc.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: 'vol',
      lastValueVisible: false, priceLineVisible: false,
    });
    cc.priceScale('vol').applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
    vs.setData(ohlcv.map((b) => ({
      time: b.time, value: b.volume ?? 0,
      color: (b.close >= b.open ? C.up : C.down) + '44',
    })));

    const cs = cc.addSeries(CandlestickSeries, {
      upColor: C.up, downColor: C.down,
      borderUpColor: C.up, borderDownColor: C.down,
      wickUpColor: C.up, wickDownColor: C.down,
    });
    cs.setData(ohlcv.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));

    const bbU = cc.addSeries(LineSeries, { color: C.bbUpper, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
    const bbM = cc.addSeries(LineSeries, { color: C.bbMid,   lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
    const bbL = cc.addSeries(LineSeries, { color: C.bbLower, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
    bbU.setData(bb.map((b) => ({ time: b.time, value: b.upper  })));
    bbM.setData(bb.map((b) => ({ time: b.time, value: b.middle })));
    bbL.setData(bb.map((b) => ({ time: b.time, value: b.lower  })));

    const s20 = cc.addSeries(LineSeries, { color: C.sma20, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const s50 = cc.addSeries(LineSeries, { color: C.sma50, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const e20 = cc.addSeries(LineSeries, { color: C.ema20, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    s20.setData(sma20.map((p) => ({ time: p.time, value: p.value })));
    s50.setData(sma50.map((p) => ({ time: p.time, value: p.value })));
    e20.setData(ema20.map((p) => ({ time: p.time, value: p.value })));

    cc.subscribeCrosshairMove((param) => {
      const tip = mainTipRef.current;
      if (!tip) return;
      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        tip.style.display = 'none'; return;
      }
      const candle = param.seriesData?.get(cs);
      const volPt  = param.seriesData?.get(vs);
      if (!candle) { tip.style.display = 'none'; return; }
      const chg  = candle.close - candle.open;
      const pct  = ((chg / candle.open) * 100).toFixed(2);
      const cCol = chg >= 0 ? '#26a641' : '#f85149';
      const containerW = candleEl.current?.clientWidth ?? 500;
      const tipW = 170;
      const x = param.point.x + 16 + tipW > containerW ? param.point.x - tipW - 8 : param.point.x + 16;
      const y = Math.max(4, param.point.y - 50);
      tip.style.display = 'block';
      tip.style.left    = `${x}px`;
      tip.style.top     = `${y}px`;
      tip.innerHTML = `
        <table class="border-separate border-spacing-x-2 border-spacing-y-px">
          <tr><td class="text-gray-500">O</td><td>${fmt(candle.open)}</td></tr>
          <tr><td class="text-gray-500">H</td><td style="color:#26a641">${fmt(candle.high)}</td></tr>
          <tr><td class="text-gray-500">L</td><td style="color:#f85149">${fmt(candle.low)}</td></tr>
          <tr><td class="text-gray-500">C</td><td style="color:${cCol}">${fmt(candle.close)}&nbsp;<span style="opacity:.7">${chg >= 0 ? '+' : ''}${pct}%</span></td></tr>
          <tr><td class="text-gray-500">Vol</td><td>${fmtV(volPt?.value)}</td></tr>
        </table>`;
    });

    // 2 ── RSI
    const rc = createChart(rsiEl.current, CHART_OPT(paneH.rsi, false));
    const rs = rc.addSeries(LineSeries, { color: C.rsi, lineWidth: 1, priceLineVisible: false });
    rs.setData(rsi.map((p) => ({ time: p.time, value: p.value })));
    rc.addSeries(LineSeries, { color: '#f8514966', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false })
      .setData(rsi.map((p) => ({ time: p.time, value: 70 })));
    rc.addSeries(LineSeries, { color: '#26a64166', lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false })
      .setData(rsi.map((p) => ({ time: p.time, value: 30 })));
    rc.priceScale('right').applyOptions({ autoScale: false, minimum: 0, maximum: 100 });

    rc.subscribeCrosshairMove((param) => {
      const tip = rsiTipRef.current;
      if (!tip) return;
      if (!param.time || !param.point) { tip.style.display = 'none'; return; }
      const val = param.seriesData?.get(rs);
      if (val == null) { tip.style.display = 'none'; return; }
      const v = val.value;
      const col = v >= 70 ? '#f85149' : v <= 30 ? '#26a641' : '#d2a8ff';
      tip.style.display = 'block';
      tip.style.left = `${Math.min(param.point.x + 10, (rsiEl.current?.clientWidth ?? 200) - 90)}px`;
      tip.style.top  = '6px';
      tip.innerHTML  = `RSI&nbsp;<span style="color:${col};font-weight:600">${fmt(v, 1)}</span>`;
    });

    // 3 ── MACD
    const mc = createChart(macdEl.current, CHART_OPT(paneH.macd));
    const ml = mc.addSeries(LineSeries,      { color: C.macdLine, lineWidth: 1, priceLineVisible: false });
    const sl = mc.addSeries(LineSeries,      { color: C.macdSig,  lineWidth: 1, priceLineVisible: false });
    const mh = mc.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
    ml.setData(macd.map((m) => ({ time: m.time, value: m.macd    })));
    sl.setData(macd.map((m) => ({ time: m.time, value: m.signal  })));
    mh.setData(macd.map((m) => ({ time: m.time, value: m.histogram, color: m.histogram >= 0 ? C.macdHUp : C.macdHDown })));

    mc.subscribeCrosshairMove((param) => {
      const tip = macdTipRef.current;
      if (!tip) return;
      if (!param.time || !param.point) { tip.style.display = 'none'; return; }
      const mv = param.seriesData?.get(ml);
      const sv = param.seriesData?.get(sl);
      const hv = param.seriesData?.get(mh);
      if (mv == null) { tip.style.display = 'none'; return; }
      const hVal = hv?.value ?? 0;
      const hCol = hVal >= 0 ? '#26a641' : '#f85149';
      tip.style.display = 'block';
      tip.style.left = `${Math.min(param.point.x + 10, (macdEl.current?.clientWidth ?? 200) - 240)}px`;
      tip.style.top  = '6px';
      tip.innerHTML  =
        `MACD&nbsp;<span style="color:${C.macdLine}">${fmt(mv.value, 4)}</span>` +
        `&ensp;Sig&nbsp;<span style="color:${C.macdSig}">${fmt(sv?.value, 4)}</span>` +
        `&ensp;Hist&nbsp;<span style="color:${hCol}">${hVal >= 0 ? '+' : ''}${fmt(hVal, 4)}</span>`;
    });

    chartInst.current = [cc, rc, mc];
    syncCharts(chartInst.current);
    cc.timeScale().fitContent();

    const obs = new ResizeObserver(() => {
      const w = candleEl.current?.clientWidth ?? 0;
      if (w) chartInst.current.forEach((c) => c.applyOptions({ width: w }));
    });
    obs.observe(candleEl.current);
    return () => {
      obs.disconnect();
      chartInst.current.forEach((c) => { try { c.remove(); } catch {} });
      chartInst.current = [];
    };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoad = () => setQueried({ symbol: input.trim().toUpperCase(), interval, days });
  const s = data?.summary;

  return (
    <div className="space-y-4">

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">

        {/* Symbol autocomplete */}
        <div className="relative">
          <label className="text-xs text-gray-500 block mb-1">Symbol</label>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => input.length >= 1 && suggestions.length && setShowDrop(true)}
            placeholder="Search name or code…"
            autoComplete="off"
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm w-52 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {showDrop && suggestions.length > 0 && (
            <ul ref={dropRef} className="absolute z-50 mt-1 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
              {suggestions.map((s, i) => (
                <li
                  key={s.symbol}
                  onMouseDown={() => pickSuggestion(s)}
                  className={`flex items-baseline justify-between gap-2 px-3 py-2 cursor-pointer text-sm transition-colors
                    ${i === activeIdx ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-200'}`}
                >
                  <span className="font-mono text-xs text-gray-400 shrink-0">{s.symbol}</span>
                  <span className="truncate text-right">{s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Interval */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">Interval</label>
          <select value={interval} onChange={(e) => {
              const v = e.target.value;
              setInterval(v);
              if (v === '15m') setDays((d) => Math.min(d, 55));
              if (v === '1h')  setDays((d) => Math.min(d, 730));
            }}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="15m">15 Minutes</option>
            <option value="1h">1 Hour</option>
            <option value="1d">1 Day</option>
          </select>
        </div>

        {/* Range slider */}
        <div className="flex flex-col gap-1 min-w-[200px]">
          <label className="text-xs text-gray-500">
            Range —&nbsp;
            <span className="text-gray-300 font-mono">
              {days >= 365 ? `${(days / 365).toFixed(days % 365 === 0 ? 0 : 1)}y` : `${days}d`}
            </span>
            <span className="text-gray-600 ml-1">
              ({interval === '15m' ? `≈${Math.round(days * 32).toLocaleString()} bars`
               : interval === '1h' ? `≈${Math.round(days * 8).toLocaleString()} bars`
               : `≈${days} bars`})
            </span>
          </label>
          <input
            type="range" min={7}
            max={interval === '15m' ? 55 : interval === '1h' ? 730 : 1825}
            step={1} value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full accent-blue-500 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-gray-600 select-none">
            <span>7d</span>
            {interval === '15m'
              ? <><span>2w</span><span>1m</span><span>6w</span><span>55d</span></>
              : interval === '1h'
              ? <><span>3m</span><span>6m</span><span>1y</span><span>2y</span></>
              : <><span>6m</span><span>1y</span><span>2y</span><span>5y</span></>}
          </div>
        </div>

        <button onClick={handleLoad} disabled={isFetching}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors">
          {isFetching ? 'Loading…' : 'Load'}
        </button>

        {data && (
          <span className="text-xs text-gray-500 self-center">
            {data.totalBars.toLocaleString()} bars · {data.from?.slice(0, 10)} → {data.to?.slice(0, 10)}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
          {error?.response?.data?.error ?? error.message}
        </div>
      )}

      {/* Stats */}
      {s && (
        <div className="flex flex-wrap gap-2 items-center">
          <Stat label="Last Close"  value={`MYR ${fmt(s.lastClose)}`} />
          <Stat label="Change"      value={`${s.pctChange >= 0 ? '+' : ''}${fmt(s.pctChange, 2)}%`}
            color={s.pctChange >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          <Stat label="Period High" value={`MYR ${fmt(s.periodHigh)}`} color="text-emerald-400" />
          <Stat label="Period Low"  value={`MYR ${fmt(s.periodLow)}`}  color="text-red-400" />
          <Stat label="Last Volume" value={fmtV(s.lastVolume)} />
          <div className="flex items-center gap-3 ml-auto text-xs text-gray-600 flex-wrap">
            <span><span style={{ color: C.sma20 }}>━</span> SMA20</span>
            <span><span style={{ color: C.sma50 }}>━</span> SMA50</span>
            <span><span style={{ color: C.ema20 }}>━</span> EMA20</span>
            <span><span style={{ color: C.bbMid }}>╌</span> BB(20,2)</span>
            <span><span style={{ color: C.macdLine }}>━</span> MACD</span>
            <span><span style={{ color: C.macdSig }}>━</span> Signal</span>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isFetching && (
        <div className="rounded-xl border border-gray-800 overflow-hidden divide-y divide-gray-800 animate-pulse">
          {[40, paneH.main, paneH.rsi, paneH.macd].map((h, i) => (
            <div key={i} className="bg-gray-900" style={{ height: h }} />
          ))}
        </div>
      )}

      {/* Placeholder before first load */}
      {!queried && !isFetching && (
        <div className="text-center py-24 text-gray-700">
          Enter a symbol and click Load to begin.
        </div>
      )}

      {/* Chart container */}
      <div className={`rounded-xl border border-gray-800 overflow-hidden flex flex-col ${(!data || isFetching) ? 'hidden' : ''}`}>

        <PaneLabel>{queried?.symbol} · Candlestick + Volume + Bollinger Bands + SMA20 / SMA50 / EMA20</PaneLabel>
        <div className="relative">
          <div ref={candleEl} />
          <div ref={mainTipRef}
            className="absolute z-40 pointer-events-none hidden bg-gray-950/95 border border-gray-700 rounded-lg px-2.5 py-2 text-xs font-mono shadow-xl leading-relaxed" />
        </div>

        <ResizeHandle onResize={(dy) => resizePane('main', dy)} />

        <PaneLabel>RSI (14) — Overbought 70 · Oversold 30</PaneLabel>
        <div className="relative">
          <div ref={rsiEl} />
          <div ref={rsiTipRef}
            className="absolute z-40 pointer-events-none hidden bg-gray-950/95 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono shadow-xl whitespace-nowrap" />
        </div>

        <ResizeHandle onResize={(dy) => resizePane('rsi', dy)} />

        <PaneLabel>MACD (12, 26, 9)</PaneLabel>
        <div className="relative">
          <div ref={macdEl} />
          <div ref={macdTipRef}
            className="absolute z-40 pointer-events-none hidden bg-gray-950/95 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono shadow-xl whitespace-nowrap" />
        </div>

      </div>
    </div>
  );
}
