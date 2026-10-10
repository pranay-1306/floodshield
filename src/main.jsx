import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, ChevronRight, CloudRain, Clock3, Droplets, Flag, Gauge, MapPin, Menu, Navigation, Plus, Route, ShieldCheck, Siren, Sparkles, Wind, X } from 'lucide-react';
import './styles.css';
import { createAction, createReport, getLocations, getQueue, getReports, getRisk, getWeather } from './api';

const hotspotPositions = {
  'mandi-house': { left: '31%', top: '42%' },
  'iit-gate': { left: '65%', top: '32%' },
  'saket-metro': { left: '61%', top: '72%' },
  'lajpat-ring': { left: '42%', top: '66%' }
};
const fallbackPlaces = [
  'DTU, Rohini', 'Rohini West Metro', 'Kashmere Gate ISBT', 'Connaught Place', 'Mandi House',
  'Mandi House Underpass', 'ITO', 'Hauz Khas', 'IIT Delhi', 'IIT Gate Crossing', 'Saket',
  'Saket Metro Approach', 'Lajpat Nagar', 'Lajpat Nagar Ring Road', 'Dwarka Sector 21', 'Vasant Kunj'
];
const seedHotspots = [
  { id: 'mandi-house', name: 'Mandi House Underpass', ward: 'New Delhi', risk: 91, reports: 18, action: 'Deploy pump crew', actionStatus: 'Unassigned' },
  { id: 'iit-gate', name: 'IIT Gate Crossing', ward: 'Hauz Khas', risk: 76, reports: 11, action: 'Inspect drain', actionStatus: 'Unassigned' },
  { id: 'saket-metro', name: 'Saket Metro Approach', ward: 'Saket', risk: 62, reports: 7, action: 'Clear debris', actionStatus: 'Unassigned' },
  { id: 'lajpat-ring', name: 'Lajpat Nagar Ring Road', ward: 'South East', risk: 42, reports: 3, action: 'Monitor', actionStatus: 'Unassigned' }
];
const seedReports = [
  { place: 'Mandi House Underpass', detail: 'Knee-deep water. Two-wheelers turning back.', time: '8 min ago', level: 'Severe' },
  { place: 'IIT Gate Crossing', detail: 'Water collecting near the bus stop.', time: '14 min ago', level: 'Moderate' },
  { place: 'Saket Metro Approach', detail: 'Drain cover blocked by leaves.', time: '22 min ago', level: 'Moderate' }
];

function RiskBadge({ risk }) {
  const value = Number(risk);
  if (!Number.isFinite(value)) return <span className="risk-badge medium">Checking</span>;
  const state = value >= 75 ? 'high' : value >= 50 ? 'medium' : 'low';
  return <span className={`risk-badge ${state}`}>{state === 'high' ? 'High risk' : state === 'medium' ? 'Caution' : 'Low risk'}</span>;
}

function formatObserved(value) {
  if (!value) return 'No observation time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}

function App() {
  const [page, setPage] = useState('home');
  const [menu, setMenu] = useState(false);
  const [origin, setOrigin] = useState('DTU, Rohini');
  const [destination, setDestination] = useState('Mandi House');
  const [places, setPlaces] = useState(fallbackPlaces);
  const [reports, setReports] = useState(seedReports);
  const [liveHotspots, setLiveHotspots] = useState(seedHotspots);
  const [weather, setWeather] = useState({ rainfallMmHr: 0, next3hRainfallMm: 0, next3hPeakMmHr: 0, peakProbability: 0, trend: 'unknown', source: 'Waiting for forecast', stale: true, observedAt: null });
  const [modal, setModal] = useState(false);
  const [reportPlace, setReportPlace] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiReady, setApiReady] = useState(true);
  const [risk, setRisk] = useState(null);

  const openReport = (place = '') => {
    setReportPlace(place);
    setModal(true);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const [nextReports, nextQueue, nextWeather, nextPlaces] = await Promise.all([getReports(), getQueue(), getWeather(), getLocations().catch(() => [])]);
      setReports(nextReports);
      setLiveHotspots(nextQueue);
      setWeather(nextWeather);
      if (Array.isArray(nextPlaces) && nextPlaces.length) setPlaces(nextPlaces.map((item) => item.name));
      setApiReady(true);
    } catch (error) {
      setApiReady(false);
      setNotice(error.message || 'Showing demo data while the API starts.');
    } finally {
      setRefreshing(false);
    }
  };

  const checkRoute = async () => {
    setLoading(true);
    try {
      setRisk(await getRisk(origin, destination));
      setApiReady(true);
    } catch {
      setApiReady(false);
      setNotice('Could not refresh the route right now. Start the FloodShield API and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    checkRoute();
  }, []);

  const navigate = (nextPage) => {
    setPage(nextPage);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submitReport = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const item = { place: data.get('place'), detail: data.get('detail'), level: data.get('level') };
    try {
      const created = await createReport(item);
      setReports((current) => [created, ...current]);
      setModal(false);
      setNotice('Report received. Authority queue and route risk will update.');
      await refresh();
      await checkRoute();
    } catch (error) {
      setNotice(error.message || 'Report was not submitted. Check the API connection and try again.');
    }
  };

  const updateAction = async (spot) => {
    const next = spot.actionStatus === 'Unassigned' ? 'Assigned' : spot.actionStatus === 'Assigned' ? 'In progress' : 'Resolved';
    try {
      await createAction({ hotspotId: spot.id, status: next });
      await refresh();
      await checkRoute();
      setNotice(`${spot.name}: ${next}.`);
    } catch (error) {
      setNotice(error.message || 'Action could not be saved. Start the local API and try again.');
    }
  };

  return (
    <>
      <header>
        <button className="brand" onClick={() => navigate('home')}>
          <span className="brand-mark"><Droplets size={19} /></span>
          <span>Flood<span>Shield</span></span>
        </button>
        <nav>
          <button onClick={() => navigate('home')}>Home</button>
          <button onClick={() => navigate('route')}>Plan a route</button>
          <button onClick={() => navigate('authority')}>Authority view</button>
        </nav>
        <div className="header-actions">
          <button className="report-link" onClick={() => openReport(risk?.hotspot && risk.hotspot.includes('hotspot') ? '' : risk?.hotspot)}>
            <Flag size={15} /> Report waterlogging
          </button>
          <button className="menu-button" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
        </div>
        {menu && (
          <div className="mobile-nav">
            <button onClick={() => navigate('home')}>Home</button>
            <button onClick={() => navigate('route')}>Plan a route</button>
            <button onClick={() => navigate('authority')}>Authority view</button>
            <button onClick={() => openReport()}>Report waterlogging</button>
          </div>
        )}
      </header>
      {notice && (
        <div className="toast">
          <CheckCircle2 size={18} />
          {notice}
          <button onClick={() => setNotice('')}><X size={16} /></button>
        </div>
      )}
      {page === 'home' && <Home navigate={navigate} openReport={openReport} weather={weather} risk={risk} />}
      {page === 'route' && (
        <RoutePlanner
          origin={origin}
          setOrigin={setOrigin}
          destination={destination}
          setDestination={setDestination}
          places={places}
          risk={risk}
          openReport={openReport}
          checkRoute={checkRoute}
          loading={loading}
          apiReady={apiReady}
          weather={weather}
        />
      )}
      {page === 'authority' && (
        <Authority
          reports={reports}
          hotspots={liveHotspots}
          weather={weather}
          openReport={openReport}
          updateAction={updateAction}
          refreshing={refreshing}
        />
      )}
      <footer>
        <div className="brand"><span className="brand-mark"><Droplets size={18} /></span>Flood<span>Shield</span></div>
        <p>Small warnings. Safer journeys. Stronger cities.</p>
        <p className="footer-right">Built for Environmental Hacks · AWS-ready</p>
      </footer>
      {modal && <ReportModal onClose={() => setModal(false)} submit={submitReport} places={places} defaultPlace={reportPlace} />}
    </>
  );
}

function Home({ navigate, openReport, weather, risk }) {
  const score = risk?.risk;
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15} /> Hyperlocal protection for monsoon cities</div>
          <h1>Know before<br />the water <em>rises.</em></h1>
          <p>FloodShield checks your actual Delhi corridor against flood hotspots, Open-Meteo rain, and citizen reports — then tells you <strong>whether that journey is safe today.</strong></p>
          <div className="hero-actions">
            <button className="primary" onClick={() => navigate('route')}>Check my route <ArrowRight size={18} /></button>
            <button className="secondary" onClick={() => navigate('authority')}>Explore the city view <ChevronRight size={18} /></button>
          </div>
          <div className="trust">
            <span><ShieldCheck /> Route-aware, not destination-only</span>
            <span><Bell /> Actionable for commuters and crews</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="rain r1">· · ·</div>
          <div className="rain r2">· · ·</div>
          <div className="storm-card">
            <div className="storm-icon"><CloudRain /></div>
            <div>
              <small>DELHI · OPEN-METEO</small>
              <h3>{weather.stale ? 'Live forecast unavailable' : weather.rainfallMmHr >= 7 ? 'Heavy rain signal' : weather.rainfallMmHr >= 2 ? 'Rain in the area' : 'Current rain signal is low'}</h3>
              <p>{weather.source || 'Forecast status'} · {formatObserved(weather.observedAt)}</p>
            </div>
            <div className="rainfall">
              <strong>{Number(weather.rainfallMmHr || 0).toFixed(1)}<span>mm/h</span></strong>
              <small>current</small>
            </div>
          </div>
          <div className="phone">
            <div className="phone-head"><span>9:41</span><span>FloodShield</span><span>●</span></div>
            <div className="phone-map">
              <div className="map-road road-a"></div>
              <div className="map-road road-b"></div>
              <i className="map-pin start"></i>
              <i className="map-pin end"></i>
              <span className="warning-dot w1"></span>
              <span className="warning-dot w2"></span>
              <span className="route-line"></span>
            </div>
            <div className="route-alert">
              <div className="danger-icon"><AlertTriangle size={19} /></div>
              <div>
                <small>YOUR ROUTE</small>
                <strong>{score == null ? 'Checking corridor risk' : score >= 75 ? 'Waterlogging risk elevated' : score >= 50 ? 'Waterlogging risk to watch' : 'Risk currently lower'}</strong>
                <p>{risk?.hotspot || 'Route risk summary'}</p>
              </div>
              <RiskBadge risk={score} />
            </div>
            <button className="phone-button" onClick={() => navigate('route')}>See safer route <ArrowRight size={15} /></button>
          </div>
          <div className="float-stat"><strong>3 km</strong><span>corridor check<br />around your journey</span></div>
        </div>
      </section>
      <section className="proof">
        <div><strong>Forecast-led</strong><span>Open-Meteo Delhi rain</span></div>
        <div><strong>Route-aware</strong><span>Hotspots near the corridor</span></div>
        <div><strong>One answer</strong><span>What to do next</span></div>
      </section>
      <section className="how">
        <div>
          <div className="eyebrow dark"><Gauge size={15} /> Built for the moment it matters</div>
          <h2>From “it might rain” to<br /><em>“this stretch is the problem.”</em></h2>
        </div>
        <div className="steps">
          <article><span>01</span><Navigation /><h3>Pick a Delhi journey</h3><p>Choose suggested origins and destinations so the corridor is geographic, not guessed.</p></article>
          <article><span>02</span><CloudRain /><h3>We read the signals</h3><p>Rainfall, hotspot exposure, fresh reports, and whether a crew is already on site.</p></article>
          <article><span>03</span><Siren /><h3>Act with confidence</h3><p>Leave earlier, avoid a named underpass, or report the road you are seeing.</p></article>
        </div>
      </section>
      <section className="cta">
        <div>
          <div className="eyebrow"><Droplets size={15} /> Your report can protect a whole route</div>
          <h2>Seen water on the road?</h2>
          <p>One quick report helps the next commuter and the response team.</p>
        </div>
        <button className="light-button" onClick={() => openReport()}>Report waterlogging <Flag size={17} /></button>
      </section>
    </main>
  );
}

function LocationField({ label, dot, value, onChange, places, listId }) {
  return (
    <label>
      <span className={`location-dot ${dot}`}></span> {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} list={listId} placeholder="Choose a Delhi location" autoComplete="off" required />
      <datalist id={listId}>
        {places.map((place) => <option key={place} value={place} />)}
      </datalist>
    </label>
  );
}

function RoutePlanner({ origin, setOrigin, destination, setDestination, places, risk, openReport, checkRoute, loading, apiReady, weather }) {
  const high = (risk?.risk || 0) >= 75;
  const exposed = risk?.exposedHotspots || [];
  const unmatched = risk && !risk.matched;
  const clearCorridor = risk?.matched && exposed.length === 0;
  return (
    <main className="route-page">
      <section className="page-title">
        <div>
          <div className="eyebrow dark"><Route size={15} /> Commuter mode</div>
          <h1>Plan a safer journey.</h1>
          <p>FloodShield scores the corridor between two Delhi points, not only the destination name.</p>
        </div>
        <button className="report-link dark-button" onClick={() => openReport()}><Flag size={15} /> Report a road</button>
      </section>
      <section className="planner">
        <aside className="route-form">
          <h2>Where are you going?</h2>
          <LocationField label="Starting from" dot="from" value={origin} onChange={setOrigin} places={places} listId="origin-places" />
          <div className="route-connector"></div>
          <LocationField label="Going to" dot="to" value={destination} onChange={setDestination} places={places} listId="destination-places" />
          <button className="primary full" onClick={checkRoute} disabled={loading}>{loading ? 'Updating corridor…' : <>Check route <ArrowRight size={17} /></>}</button>
          <p className="form-note">
            <Wind size={14} />
            {weather.stale ? 'Using fallback/cached rain until Open-Meteo responds' : `Open-Meteo · ${formatObserved(weather.observedAt)}`}
          </p>
        </aside>
        <div className="route-map">
          <div className="map-toolbar">
            <span className="map-label">DELHI CORRIDOR <b>·</b> ILLUSTRATIVE VIEW</span>
            <span className="map-live"><i></i> API synced</span>
          </div>
          <div className="map-controls" aria-hidden="true"><button>+</button><button>−</button></div>
          <div className="map-grid"></div>
          <div className="big-road r-a"></div>
          <div className="big-road r-b"></div>
          <div className="big-road r-c"></div>
          <div className="route-path main"></div>
          <div className="route-path alternative"></div>
          <div className="route-marker home"><MapPin /> <span><b>START</b>{origin}</span></div>
          <div className="route-marker dest"><MapPin /> <span><b>DESTINATION</b>{destination}</span></div>
          {exposed.map((spot, index) => (
            <span key={spot.id} className={`map-warning mw${index + 1}`} style={hotspotPositions[spot.id]} title={`${spot.name} · ${spot.distanceKm} km`} aria-label={`${spot.name}, ${spot.distanceKm} kilometres from corridor`}>
              <AlertTriangle />
              <small>{spot.name}</small>
            </span>
          ))}
          <div className="map-route-card">
            <small>MONITORED CORRIDOR</small>
            <strong>{risk?.corridorKm ? `${risk.corridorKm} km analysis radius` : '3 km analysis radius'}</strong>
            <span>{exposed.length ? `${exposed.length} exposed hotspot${exposed.length === 1 ? '' : 's'}` : 'No exposed hotspots'}</span>
          </div>
          <div className="map-scale"><span></span> 1 km</div>
          <div className="map-legend">
            <span><i className="red"></i> Exposed hotspot</span>
            <span><i className="green"></i> Illustrative alternative</span>
          </div>
        </div>
      </section>
      <section className="route-result">
        {loading && !risk && <div className="risk-summary medium-bg"><div><RiskBadge /><h2>Checking this corridor…</h2><p>Matching your locations, then measuring monitored hotspots within 3 km.</p></div></div>}
        {!loading && !apiReady && !risk && <div className="risk-summary medium-bg"><div><h2>No live risk data yet</h2><p>Start the FloodShield API (`npm run api`) so route scoring, reports, and weather can load.</p></div></div>}
        {risk && (
          <>
            <div className={`risk-summary ${high ? 'high-bg' : risk.risk >= 50 ? 'medium-bg' : 'low-bg'}`}>
              <div className="risk-ring"><strong>{risk.risk}</strong><span>/100</span></div>
              <div>
                <RiskBadge risk={risk.risk} />
                <h2>
                  {unmatched ? 'We could not match this journey yet.' : high ? 'Waterlogging likely on this corridor.' : risk.risk >= 50 ? 'Some waterlogging risk on this corridor.' : clearCorridor ? 'This corridor looks clear of monitored hotspots.' : 'Your route looks clearer for now.'}
                </h2>
                <p>{risk.reasons?.join(' · ')}</p>
              </div>
            </div>
            <div className="recommendation">
              <div className="rec-icon"><Clock3 /></div>
              <div>
                <small>OUR RECOMMENDATION · {risk.confidence} CONFIDENCE</small>
                <h3>{risk.recommendation}</h3>
                <p>Heuristic corridor estimate, not turn-by-turn routing or a flood guarantee. Confirm official advisories and live directions before travel.</p>
              </div>
              <div className="rec-actions">
                <button className="secondary" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`, '_blank', 'noopener,noreferrer')}>Open directions <Navigation size={16} /></button>
                <button className="report-link" onClick={() => openReport(exposed[0]?.name || '')}>Report this road <Flag size={15} /></button>
              </div>
            </div>
          </>
        )}
        {risk && (
          <div className="why-grid">
            <article className="why-card">
              <small>Why this route is risky</small>
              <h3>{unmatched ? 'Choose suggested places' : exposed.length ? `${exposed.length} hotspot${exposed.length === 1 ? '' : 's'} on corridor` : 'No hotspot in the 3 km corridor'}</h3>
              <ul>
                {(exposed.length ? exposed : [{ id: 'none', name: clearCorridor ? 'Journey avoids Mandi House, IIT Gate, Saket Metro, and Lajpat Ring' : 'Pick origin and destination from the Delhi list', distanceKm: '—', risk: risk.risk, reports: 0, actionStatus: 'n/a' }]).map((spot) => (
                  <li key={spot.id}>
                    <strong>{spot.name}</strong>
                    <span>{spot.distanceKm} km away · risk {spot.risk} · {spot.reports} reports · {spot.actionStatus}</span>
                  </li>
                ))}
              </ul>
            </article>
            <div className="signal-grid compact-signals">
              <Signal icon={<CloudRain />} title="Forecast" value={`${risk.weather?.next3hRainfallMm ?? weather.next3hRainfallMm ?? 0} mm / 3h`} note={`${risk.signals?.forecastSource || weather.source} · ${formatObserved(risk.signals?.observedAt || weather.observedAt)}`} />
              <Signal icon={<Droplets />} title="Road reports" value={`${risk.roadReports} on corridor`} note={risk.signals?.reportFreshness || 'Recent community signal'} />
              <Signal icon={<Gauge />} title="Confidence" value={risk.confidence} note={risk.confidence === 'Limited' ? 'Low confidence until locations match or reports arrive' : risk.hotspot} />
            </div>
            <ScoreBreakdown breakdown={risk.scoreBreakdown} />
          </div>
        )}
      </section>
    </main>
  );
}

function ScoreBreakdown({ breakdown }) {
  if (!breakdown) return null;
  const rows = [
    ['Hotspot baseline', breakdown.hotspotBaseline],
    ['Weather signal', breakdown.weatherSignal],
    ['Community reports', breakdown.communityReports],
    ['Crew mitigation', breakdown.responseMitigation ? `-${breakdown.responseMitigation}` : '0']
  ];
  return (
    <article className="score-breakdown">
      <div className="breakdown-head">
        <div><small>HOW THE SCORE WAS BUILT</small><h3>Evidence, not a black box</h3></div>
        <span>{breakdown.corridorExposure ? `${Math.round(breakdown.corridorExposure * 100)}% exposure` : 'No exposure'}</span>
      </div>
      <div className="breakdown-rows">
        {rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value} <small>pts</small></strong></div>)}
      </div>
      <p>{breakdown.note}</p>
    </article>
  );
}

function Signal({ icon, title, value, note }) {
  return (
    <article className="signal">
      <span>{icon}</span>
      <small>{title}</small>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function Authority({ reports, hotspots, weather, openReport, updateAction, refreshing }) {
  return (
    <main className="authority-page">
      <section className="authority-head">
        <div>
          <div className="eyebrow dark"><ShieldCheck size={15} /> Authority mode · Delhi demo</div>
          <h1>Put the right crew<br />in the right place.</h1>
          <p>Queue rank uses hotspot baseline, Open-Meteo rain, fresh reports, and the latest action state.{refreshing ? ' Refreshing…' : ''}</p>
        </div>
        <div className="weather-panel">
          <CloudRain />
          <div>
            <small>RAIN STATUS</small>
            <strong>{weather.stale ? 'Forecast unavailable' : `${Number(weather.rainfallMmHr || 0).toFixed(1)} mm/h current rain`}</strong>
            <span>{weather.source || 'Forecast feed'} · {formatObserved(weather.observedAt)}</span>
          </div>
        </div>
      </section>
      <section className="metrics">
        <Metric icon={<AlertTriangle />} label="High priority" value={hotspots.filter((spot) => spot.risk >= 75).length} change="Calculated from live signals" tone="red" />
        <Metric icon={<Flag />} label="Citizen reports" value={reports.length} change="Validated and time-weighted" tone="amber" />
        <Metric icon={<CheckCircle2 />} label="Crews active" value={hotspots.filter((spot) => spot.actionStatus && spot.actionStatus !== 'Unassigned').length} change="Tracked by response status" tone="green" />
        <Metric icon={<Bell />} label="Alert integration" value="Demo" change="Push notifications are not connected" tone="blue" />
      </section>
      <section className="command">
        <div className="city-map">
          <div className="map-toolbar">
            <span className="map-label">DELHI OPERATIONS MAP <b>·</b> LIVE QUEUE</span>
            <span className="map-live"><i></i> API synced</span>
          </div>
          <div className="map-controls" aria-hidden="true"><button>+</button><button>−</button></div>
          <div className="map-grid"></div>
          <div className="big-road r-a"></div>
          <div className="big-road r-b"></div>
          <div className="big-road r-c"></div>
          {hotspots.map((spot) => (
            <button
              key={spot.id || spot.name}
              className="hotspot"
              style={{ ...(hotspotPositions[spot.id] || { left: '50%', top: '50%' }), '--hot': spot.risk >= 75 ? '#ed5b45' : spot.risk >= 50 ? '#f7ae3b' : '#38c895' }}
              title={`${spot.name} · risk ${spot.risk}`}
              aria-label={`${spot.name}, risk ${spot.risk}`}
            >
              <span></span>
              <small>{spot.name.replace(' Underpass', '').replace(' Crossing', '')}</small>
            </button>
          ))}
          <div className="map-summary">
            <small>LAST UPDATED</small>
            <strong>{refreshing ? 'Refreshing…' : 'Live queue signal'}</strong>
            <span>Rain + reports + crew status</span>
          </div>
          <div className="map-scale"><span></span> 1 km</div>
          <div className="map-legend">
            <span><i className="red"></i> High risk</span>
            <span><i className="amber"></i> Watch</span>
            <span><i className="green"></i> Clear</span>
          </div>
        </div>
        <div className="priority-list">
          <div className="list-head">
            <div><small>LIVE QUEUE</small><h2>Intervention priority</h2></div>
          </div>
          {hotspots.map((spot, index) => (
            <article className="priority" key={spot.id || spot.name}>
              <b className={index < 1 ? 'rank urgent' : 'rank'}>0{index + 1}</b>
              <div className="priority-copy">
                <h3>{spot.name}</h3>
                <p>{spot.ward} · {spot.reports} reports</p>
                <span>{spot.actionStatus === 'Unassigned' ? `Next: ${spot.action}` : `Status: ${spot.actionStatus}`}</span>
              </div>
              <div className="priority-risk"><strong>{spot.risk}</strong><small>risk</small></div>
              <button className="assign" onClick={() => updateAction(spot)} disabled={spot.actionStatus === 'Resolved'}>
                {spot.actionStatus === 'Unassigned' ? 'Assign' : spot.actionStatus === 'Assigned' ? 'Start' : spot.actionStatus === 'In progress' ? 'Resolve' : 'Resolved'}
              </button>
            </article>
          ))}
        </div>
      </section>
      <section className="reports-section">
        <div>
          <div className="eyebrow dark"><Flag size={15} /> Community signal</div>
          <h2>Latest road reports</h2>
          <p>Validated reports decay in influence as they age. A matching report within 20 minutes is rejected.</p>
        </div>
        <div className="report-list">
          {reports.length === 0 && <p className="empty-copy">No citizen reports yet. Add one to change this queue and nearby commuter risk.</p>}
          {reports.slice(0, 5).map((report, index) => (
            <article key={report.id || index}>
              <span className={`report-level ${(report.level || '').toLowerCase()}`}></span>
              <div>
                <h3>{report.place}</h3>
                <p>“{report.detail}”</p>
              </div>
              <small>{report.freshness || report.time || 'Recent'}</small>
            </article>
          ))}
          <button className="secondary compact" onClick={() => openReport()}><Plus size={15} /> Add report</button>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, change, tone }) {
  return (
    <article className={`metric ${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{change}</p>
      </div>
    </article>
  );
}

function ReportModal({ onClose, submit, places, defaultPlace }) {
  const suggestions = useMemo(() => places, [places]);
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <button type="button" className="close" onClick={onClose}><X /></button>
        <div className="modal-icon"><Flag /></div>
        <h2>Report waterlogging</h2>
        <p>Help nearby commuters and the response team see what is happening.</p>
        <label>
          Location
          <input name="place" defaultValue={defaultPlace || ''} placeholder="e.g. Mandi House Underpass" list="report-places" minLength={3} maxLength={100} required />
          <datalist id="report-places">{suggestions.map((place) => <option key={place} value={place} />)}</datalist>
        </label>
        <label>What do you see?<textarea name="detail" placeholder="e.g. Water above wheel height, traffic slowing" minLength={12} maxLength={280} required /></label>
        <label>Severity<select name="level"><option>Moderate</option><option>Severe</option><option>Low</option></select></label>
        <button className="primary full" type="submit">Submit report <ArrowRight size={17} /></button>
      </form>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
