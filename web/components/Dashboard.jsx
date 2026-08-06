'use client';
import { useState } from 'react';

const ACCEPT = 0.62;
const needsReview = m => m.confidence < 0.70 || m.pcr > 200 || m.pcr < 10;
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('en-AE', { maximumFractionDigits: 2 }));
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const i = Math.floor(s.length / 2); return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const idxColor = v => v == null ? 'var(--faint)' : v < 98 ? 'var(--good)' : v > 102 ? 'var(--bad)' : 'var(--watch)';

function LineChart({ values, labels, baseline = 100 }) {
  const W = 880, H = 260, padL = 42, padR = 16, padT = 14, padB = 30;
  if (!values.length) return <div className="empty"><p>No history yet — the trend line fills in as the weekly scrape runs.</p></div>;
  const single = values.length < 2;
  const all = values.concat(baseline);
  let lo = Math.min(...all), hi = Math.max(...all); const span = (hi - lo) || 1; lo -= span * 0.12; hi += span * 0.12;
  const x = i => padL + (W - padL - padR) * (single ? 0.5 : i / (values.length - 1));
  const y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const grid = [], ylabs = [];
  for (let k = 0; k <= 4; k++) { const val = lo + (hi - lo) * k / 4, yy = y(val);
    grid.push(<line key={'g' + k} className="gline" x1={padL} y1={yy} x2={W - padR} y2={yy} />);
    ylabs.push(<text key={'yl' + k} className="glab" x={padL - 8} y={yy + 3.5} textAnchor="end">{val.toFixed(0)}</text>); }
  const by = y(baseline);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const area = `M${x(0).toFixed(1)},${y(lo).toFixed(1)} L${pts.join(' L')} L${x(values.length - 1).toFixed(1)},${y(lo).toFixed(1)} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="price index trend">
      <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      {grid}
      <line className="baseline" x1={padL} y1={by} x2={W - padR} y2={by} />
      <text className="glab" x={W - padR} y={by - 6} textAnchor="end">parity 100</text>
      {ylabs}
      {labels.map((l, i) => (!single && labels.length > 7 && i % 2 === 1) ? null :
        <text key={'xl' + i} className="glab" x={x(i)} y={H - 10} textAnchor="middle">{l}</text>)}
      {!single && <path d={area} fill="url(#ga)" />}
      {!single && <path d={`M${pts.join(' L')}`} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="4.5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.4" />
    </svg>
  );
}

function Kpi({ val, label, color, delta, dir }) {
  return (
    <div className="kpi">
      {color && <span className="strip" style={{ background: color }} />}
      <b style={color ? { color } : undefined}>{val}</b>
      <small>{label}</small>
      {delta != null && <span style={{ fontSize: '11.5px', fontWeight: 600, color: dir === 'up' ? 'var(--good)' : 'var(--bad)' }}>{delta}</span>}
    </div>
  );
}

function rollup(matches, keyFn) {
  const g = {}; for (const m of matches) { const k = keyFn(m); (g[k] = g[k] || []).push(m); }
  return Object.entries(g).map(([name, ms]) => ({
    name, n: ms.length, index: median(ms.map(m => m.pcr)),
    win: Math.round(ms.filter(m => m.we_cheaper).length / ms.length * 100),
    review: ms.filter(needsReview).length,
  })).sort((a, b) => (a.index ?? 999) - (b.index ?? 999));
}

export default function Dashboard({ data }) {
  const [selected, setSelected] = useState('__all__');
  const [view, setView] = useState('item');
  const [hideReview, setHideReview] = useState(false);
  const { summary, competitors } = data;
  const live = competitors.filter(c => c.status === 'live');
  const cur = competitors.find(c => c.slug === selected);
  const stamp = new Date(data.generated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="wrap">
      <header className="mast">
        <div className="brand">
          <span className="kicker">Competitor Price Radar</span>
          <h1>Casinetto <em>vs</em> the UAE shelf</h1>
        </div>
        <div className="ctl">
          <span className="stamp"><span className="dot" /> Updated {stamp}</span>
          <span className="selwrap">
            <select value={selected} onChange={e => setSelected(e.target.value)} aria-label="Select view">
              <option value="__all__">All competitors (roll-up)</option>
              {competitors.map(c => <option key={c.slug} value={c.slug}>{c.name}{c.status !== 'live' ? ` — ${c.status}` : ''}</option>)}
              <option value="__gaps__">🔍 What to launch (assortment gaps)</option>
            </select>
          </span>
        </div>
      </header>

      {selected === '__gaps__'
        ? <GapsView gaps={data.gaps} />
        : selected === '__all__'
        ? <AllView summary={summary} competitors={competitors} live={live} onPick={setSelected} />
        : <OneView c={cur} view={view} setView={setView} hideReview={hideReview} setHideReview={setHideReview} />}

      <p className="note">
        <b>How to read it.</b> <b>Price Index</b> is the median of <code>our price ÷ their price × 100</code> across
        matched items — below 100 means Casinetto is cheaper on the typical shared product. Switch competitor with the
        dropdown; every panel updates. Rows flagged <span className="review">review</span> have low match confidence or
        an implausible ratio and are excluded from the headline until confirmed. Data refreshes from the weekly scrape.
      </p>
    </div>
  );
}

function AllView({ summary, competitors, live, onPick }) {
  const avgIndex = live.length ? Math.round(live.reduce((s, c) => s + (c.price_index || 0), 0) / live.length * 10) / 10 : null;
  const totalMatches = live.reduce((s, c) => s + c.matches.length, 0);
  const totalReview = live.reduce((s, c) => s + c.matches.filter(needsReview).length, 0);
  const avgWin = live.length ? Math.round(live.reduce((s, c) => s + (c.win_rate_pct || 0), 0) / live.length) : null;
  // average index history across live competitors, aligned by index position
  const maxLen = Math.max(0, ...live.map(c => c.hist_index.length));
  const avgHist = [];
  for (let i = 0; i < maxLen; i++) {
    const vals = live.map(c => c.hist_index[c.hist_index.length - maxLen + i]).filter(v => v != null && !Number.isNaN(v));
    if (vals.length) avgHist.push(Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10);
  }
  const labels = (live[0]?.hist_labels || []).slice(-maxLen);
  const rows = [...competitors].sort((a, b) => (a.price_index ?? 999) - (b.price_index ?? 999));

  return (
    <>
      <section className="kpis">
        <Kpi val={competitors.length} label="Competitors tracked" />
        <Kpi val={live.length} label="Live now" color="var(--good)" />
        <Kpi val={competitors.filter(c => c.status === 'pending').length} label="Pending first run" />
        <Kpi val={avgIndex ?? '—'} label="Avg price index" color={idxColor(avgIndex)} />
        <Kpi val={avgWin != null ? avgWin + '%' : '—'} label="Avg win rate" color="var(--good)" />
        <Kpi val={totalMatches} label="Items matched" />
        <Kpi val={totalReview} label="Need review" color={totalReview ? 'var(--watch)' : undefined} />
        <Kpi val={summary.priced_items != null ? summary.priced_items.toLocaleString() : '—'} label="Priced catalogue" />
      </section>

      <section className="panel">
        <div className="phead"><h2>Average price index over time</h2></div>
        <div className="chartbox"><LineChart values={avgHist} labels={labels} /></div>
        <div className="legendrow">
          <span><span className="lg" style={{ background: 'var(--accent)' }} /> Avg index across live sites</span>
          <span><span className="lg" style={{ background: 'var(--faint)' }} /> Parity (100)</span>
          <span>Below 100 = we&apos;re cheaper on the typical shared item</span>
        </div>
      </section>

      <section className="panel">
        <div className="phead"><h2>Competitor benchmark</h2><span className="hint">Ranked by price index — most competitive at top. Click a live row to drill in.</span></div>
        <div className="tblwrap"><table><thead><tr>
          <th>Competitor</th><th className="num">Price index</th><th className="num">Coverage</th>
          <th className="num">We win</th><th className="num">Items</th><th className="num">Review</th>
        </tr></thead><tbody>
          {rows.map(c => {
            const isLive = c.status === 'live';
            const col = idxColor(c.price_index);
            const barPct = c.price_index != null ? Math.max(4, Math.min(100, c.price_index > 200 ? 100 : c.price_index)) : 0;
            const rev = isLive ? c.matches.filter(needsReview).length : null;
            const tag = isLive ? <span className="tag live">Live</span> : c.status === 'disabled' ? <span className="tag">No catalogue</span> : <span className="tag">Pending</span>;
            return (
              <tr key={c.slug} className={isLive ? 'clk' : ''} onClick={isLive ? () => { onPick(c.slug); window.scrollTo({ top: 0, behavior: 'smooth' }); } : undefined}>
                <td><div className="cname">{c.name} {tag}</div></td>
                <td className="num">{isLive
                  ? <span className="pcrcell"><span className="bar"><i style={{ width: barPct + '%', background: col }} /></span><span className="pcrval" style={{ color: col }}>{c.price_index.toFixed(1)}</span></span>
                  : <span className="dash">—</span>}</td>
                <td className="num">{isLive && c.coverage_pct != null ? c.coverage_pct + '%' : <span className="dash">—</span>}</td>
                <td className="num">{isLive && c.win_rate_pct != null ? <span className={'chip ' + (c.win_rate_pct >= 50 ? 'g' : 'b')}>{c.win_rate_pct}%</span> : <span className="dash">—</span>}</td>
                <td className="num">{isLive ? c.items_found : <span className="dash">—</span>}</td>
                <td className="num">{isLive ? (rev ? <span className="review">{rev}</span> : <span className="dash">0</span>) : <span className="dash">—</span>}</td>
              </tr>
            );
          })}
        </tbody></table></div>
      </section>
    </>
  );
}

function OneView({ c, view, setView, hideReview, setHideReview }) {
  if (!c) return null;
  if (c.status !== 'live') {
    return (
      <>
        <section className="kpis"><Kpi val={c.name} label="Competitor" /><Kpi val={c.status === 'disabled' ? 'No shop' : 'Pending'} label="Status" color="var(--watch)" /></section>
        <div className="panel"><div className="empty">
          <h3>{c.name} — {c.status === 'disabled' ? 'no first-party online shop' : 'waiting on first scrape'}</h3>
          <p>{c.status === 'disabled'
            ? 'Viva sells through Talabat and noon rather than its own storefront, so there is no catalogue to match against.'
            : 'The scraper for this site is built. Once it runs, this fills with its price index, trend and the item / brand / category breakdowns.'}</p>
        </div></div>
      </>
    );
  }
  const rev = c.matches.filter(needsReview).length;
  const cheapest = [...c.matches].sort((a, b) => a.pcr - b.pcr)[0];

  return (
    <>
      <section className="kpis">
        <Kpi val={c.price_index != null ? c.price_index.toFixed(1) : '—'} label="Price index" color={idxColor(c.price_index)} />
        <Kpi val={c.coverage_pct != null ? c.coverage_pct + '%' : '—'} label="Coverage of catalogue" />
        <Kpi val={c.win_rate_pct != null ? c.win_rate_pct + '%' : '—'} label="Where we win" color="var(--good)" />
        <Kpi val={c.items_found} label="Items matched" />
        <Kpi val={rev} label="Need review" color={rev ? 'var(--watch)' : undefined} />
        {cheapest && <Kpi val={cheapest.pcr.toFixed(0) + '%'} label="Our best deal" color="var(--good)" />}
      </section>

      <section className="panel">
        <div className="phead"><h2>{c.name} — price index over time</h2></div>
        <div className="chartbox"><LineChart values={c.hist_index} labels={c.hist_labels} /></div>
        <div className="legendrow">
          <span><span className="lg" style={{ background: 'var(--accent)' }} /> Price index</span>
          <span><span className="lg" style={{ background: 'var(--faint)' }} /> Parity (100)</span>
        </div>
      </section>

      <section className="panel">
        <div className="controls">
          <div className="seg" role="group" aria-label="Group by">
            {['item', 'brand', 'category'].map(v =>
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>By {v}</button>)}
          </div>
          {view === 'item' && <label className="toggle"><input type="checkbox" checked={hideReview} onChange={e => setHideReview(e.target.checked)} /><span className="track" /> Hide rows needing review</label>}
        </div>
        <div className="tblwrap">
          {view === 'item' ? <ItemTable c={c} hideReview={hideReview} /> : <RollupTable c={c} view={view} />}
        </div>
      </section>
    </>
  );
}

function ItemTable({ c, hideReview }) {
  const rows = c.matches.filter(m => !(hideReview && needsReview(m))).sort((a, b) => a.pcr - b.pcr);
  return (
    <table><thead><tr>
      <th>Our item</th><th className="num">Our price</th><th className="num">Their price</th>
      <th className="num">Price index</th><th className="num">Gap</th><th>Confidence</th>
    </tr></thead><tbody>
      {rows.map((m, i) => {
        const r = needsReview(m), barPct = Math.max(4, Math.min(100, m.pcr > 200 ? 100 : m.pcr));
        const col = m.pcr < 98 ? 'var(--good)' : m.pcr > 102 ? 'var(--bad)' : 'var(--watch)';
        return (
          <tr key={m.item_code + i}>
            <td><div className="ours">{m.our_item}</div><div className="theirs">↳ <a href={m.url} target="_blank" rel="noopener noreferrer">{m.their_item}</a></div></td>
            <td className="num">{fmt(m.our_price)}</td><td className="num">{fmt(m.their_price)}</td>
            <td className="num"><span className="pcrcell"><span className="bar"><i style={{ width: barPct + '%', background: col }} /></span><span className="pcrval">{m.pcr > 200 ? m.pcr.toFixed(0) : m.pcr.toFixed(1)}</span></span></td>
            <td className="num"><span className={'chip ' + (m.we_cheaper ? 'g' : 'b')}>{(m.gap_pct > 0 ? '+' : '') + m.gap_pct}%</span></td>
            <td>{r ? <span className="review">Review</span> : <span className="conf"><span className="cbar"><i style={{ width: Math.round(m.confidence * 100) + '%' }} /></span>{Math.round(m.confidence * 100)}%</span>}</td>
          </tr>
        );
      })}
    </tbody></table>
  );
}

function GapsView({ gaps }) {
  if (!gaps || !gaps.brands) {
    return <div className="panel"><div className="empty"><h3>No gap data yet</h3><p>Run a competitor scrape first.</p></div></div>;
  }
  const { total_gap_skus, brands, categories, per_competitor, sample_products } = gaps;
  const strong = brands.filter(b => b.competitors >= 2).length;

  return (
    <>
      <section className="kpis">
        <Kpi val={brands.length} label="Brands you could add" color="var(--accent)" />
        <Kpi val={strong} label="Backed by 2+ rivals" color="var(--good)" />
        <Kpi val={categories.length} label="Gap categories" />
        <Kpi val={total_gap_skus.toLocaleString()} label="Products they carry, you don't" />
        <Kpi val={per_competitor.length} label="Competitors analysed" />
      </section>

      <p className="note" style={{ marginTop: 0, marginBottom: 18 }}>
        These are products your competitors stock that don&apos;t match anything in your catalogue — i.e. launch
        candidates. Brands <b>backed by 2+ competitors</b> are the safest bets (validated demand). Based on{' '}
        {per_competitor.map(p => `${p.name} ${p.scraped}`).join(', ')} products scraped so far — Waitrose &amp; Spinneys
        full ranges are still being expanded, so treat their counts as indicative for now.
      </p>

      <section className="panel">
        <div className="phead"><h2>Brands to consider launching</h2><span className="hint">Ranked by how many competitors carry them, then range depth.</span></div>
        <div className="tblwrap"><table><thead><tr>
          <th>Brand</th><th className="num">Carried by</th><th className="num">Their SKUs</th><th>Mostly in</th>
        </tr></thead><tbody>
          {brands.slice(0, 40).map(b => (
            <tr key={b.brand}>
              <td><div className="cname">{b.brand}</div></td>
              <td className="num"><span className={'chip ' + (b.competitors >= 2 ? 'g' : '')} style={b.competitors < 2 ? { background: 'var(--surface-2)', color: 'var(--muted)' } : undefined}>{b.competitors} of {per_competitor.length}</span></td>
              <td className="num">{b.skus}</td>
              <td>{b.top_category}</td>
            </tr>
          ))}
        </tbody></table></div>
      </section>

      <section className="panel">
        <div className="phead"><h2>Gap by category</h2><span className="hint">Where the biggest range gaps sit.</span></div>
        <div className="tblwrap"><table><thead><tr>
          <th>Category</th><th className="num">Products missing</th><th className="num">Across competitors</th>
        </tr></thead><tbody>
          {categories.map(c => (
            <tr key={c.category}>
              <td><div className="cname">{c.category}</div></td>
              <td className="num">{c.skus}</td>
              <td className="num">{c.competitors}</td>
            </tr>
          ))}
        </tbody></table></div>
      </section>

      <section className="panel">
        <div className="phead"><h2>Example products</h2><span className="hint">Specific branded items competitors carry that you don&apos;t.</span></div>
        <div className="tblwrap"><table><thead><tr>
          <th>Product</th><th>Brand</th><th>Category</th><th>Seen at</th><th className="num">Their price</th>
        </tr></thead><tbody>
          {sample_products.slice(0, 60).map((p, i) => (
            <tr key={i}>
              <td>{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer">{p.title}</a> : p.title}</td>
              <td>{p.brand}</td>
              <td className="theirs">{p.category}</td>
              <td className="theirs">{p.competitor_name}</td>
              <td className="num">{fmt(p.price)}</td>
            </tr>
          ))}
        </tbody></table></div>
      </section>
    </>
  );
}

function RollupTable({ c, view }) {
  const label = view === 'brand' ? 'Brand' : 'Category';
  const rows = rollup(c.matches, m => view === 'brand' ? m.brand : m.category);
  return (
    <table><thead><tr>
      <th>{label}</th><th className="num">Items matched</th><th className="num">Price index</th><th className="num">Where we win</th><th className="num">Review</th>
    </tr></thead><tbody>
      {rows.map((r, i) => {
        const col = idxColor(r.index), barPct = Math.max(4, Math.min(100, r.index > 200 ? 100 : r.index));
        return (
          <tr key={r.name + i}>
            <td><div className="cname">{r.name}</div></td>
            <td className="num">{r.n}</td>
            <td className="num"><span className="pcrcell"><span className="bar"><i style={{ width: barPct + '%', background: col }} /></span><span className="pcrval" style={{ color: col }}>{r.index != null ? (r.index > 200 ? r.index.toFixed(0) : r.index.toFixed(1)) : '—'}</span></span></td>
            <td className="num"><span className={'chip ' + (r.win >= 50 ? 'g' : 'b')}>{r.win}%</span></td>
            <td className="num">{r.review ? <span className="review">{r.review}</span> : <span className="dash">0</span>}</td>
          </tr>
        );
      })}
    </tbody></table>
  );
}
