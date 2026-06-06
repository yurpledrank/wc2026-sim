import { useState, useEffect, useRef } from "react";
import { loadAllProfiles, loadRunInfo, fetchEV, loadOpponents } from "./api";

let _evFetchSeq = 0;
import { buildAuctionQueue, ALL_TEAMS } from "./constants";
import { createBots } from "./bots";
import { useAuction } from "./useAuction";
import SetupScreen from "./components/SetupScreen";
import AuctionStage from "./components/AuctionStage";
import SyndicateTracker from "./components/SyndicateTracker";
import TeamList from "./components/TeamList";
import TeamDetail from "./components/TeamDetail";
import ResultsScreen from "./components/ResultsScreen";
import "./App.css";

export default function App() {
  const [loading, setLoading]     = useState(true);
  const [apiError, setApiError]   = useState(null);
  const [starting, setStarting]   = useState(false);
  const [startError, setStartError] = useState(null);
  const [teams, setTeams]         = useState({});
  const [runInfo, setRunInfo]     = useState(null);
  const [evData, setEvData]           = useState({});
  const [initialEvData, setInitialEvData] = useState({});
  const [potTarget, setPotTarget]     = useState(5000);

  const [opponents, setOpponents]       = useState({});
  const [evAtBuy, setEvAtBuy]           = useState({});
  const [evAtSale, setEvAtSale]         = useState({});
  const prevPortfolioRef                = useRef({});
  const prevResultsRef                  = useRef({});

  const { state, startAuction, placeBid, togglePause, resumeAuction, resolveNow } = useAuction();

  // Load team profiles + run info on mount
  useEffect(() => {
    Promise.all([loadAllProfiles(), loadRunInfo()])
      .then(([profiles, info]) => {
        setTeams(profiles);
        setRunInfo(info);
        setLoading(false);
      })
      .catch(err => {
        setApiError(err.message);
        setLoading(false);
      });
  }, []);

  // Pre-fetch EV data (updated when potTarget changes)
  useEffect(() => {
    if (Object.keys(teams).length === 0) return;
    const assumedPrice = potTarget / ALL_TEAMS.length;
    const prices = Object.fromEntries(ALL_TEAMS.map(t => [t, assumedPrice]));
    fetchEV(prices)
      .then(data => {
        const map = {};
        data.teams.forEach(t => { map[t.team] = t; });
        setEvData(map);
      })
      .catch(err => console.warn("EV fetch failed:", err));
  }, [teams, potTarget]);

  // Re-fetch EV after each completed sale — Bayesian shrinkage (S=3) blends prior with observed
  const resultsCount = Object.keys(state.results).length;
  useEffect(() => {
    if (resultsCount === 0 || Object.keys(teams).length === 0) return;
    const soldEntries = Object.values(state.results).filter(r => r.winner);
    const nSold    = soldEntries.length;
    const nUnsold  = ALL_TEAMS.length - Object.keys(state.results).length;
    const actualTotal = soldEntries.reduce((s, r) => s + r.price, 0);
    let assumedPerUnsold;
    if (nSold === 0) {
      assumedPerUnsold = potTarget / ALL_TEAMS.length;
    } else {
      const extrapolatedPot = (actualTotal / nSold) * ALL_TEAMS.length;
      const estimatedPot    = (3 * potTarget + nSold * extrapolatedPot) / (3 + nSold);
      assumedPerUnsold = Math.max(0, (estimatedPot - actualTotal) / Math.max(1, nUnsold));
    }
    const prices = Object.fromEntries(
      ALL_TEAMS.map(t => {
        const result = state.results[t];
        return [t, result?.winner ? result.price : assumedPerUnsold];
      })
    );
    const totalSent = Object.values(prices).reduce((s, v) => s + v, 0);
    const seq = ++_evFetchSeq;
    console.log(`[EV #${seq}] sent nSold=${nSold} nUnsold=${nUnsold} actualTotal=${actualTotal} assumedPerUnsold=${assumedPerUnsold.toFixed(1)} totalSent=${totalSent.toFixed(0)} potTarget=${potTarget}`);
    fetchEV(prices)
      .then(data => {
        if (seq < _evFetchSeq) {
          console.log(`[EV #${seq} discarded — superseded by #${_evFetchSeq}]`);
          return;
        }
        const sumEV = data.teams.reduce((s, t) => s + t.mean_earnings, 0);
        console.log(`[EV #${seq}] sumEV=${sumEV.toFixed(0)} expected~${totalSent.toFixed(0)} delta=${(sumEV - totalSent).toFixed(0)}`);
        const map = {};
        data.teams.forEach(t => { map[t.team] = t; });
        setEvData(map);
      })
      .catch(err => console.warn("EV re-fetch failed:", err));
  }, [resultsCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Snapshot evData at the moment each team sells (all participants)
  useEffect(() => {
    const curr = state.results;
    const prev = prevResultsRef.current;
    const newSold = Object.keys(curr).filter(t => !(t in prev) && curr[t].winner);
    if (newSold.length > 0) {
      setEvAtSale(before => {
        const next = { ...before };
        newSold.forEach(t => { next[t] = evData[t]?.mean_earnings ?? null; });
        return next;
      });
    }
    prevResultsRef.current = curr;
  }, [state.results]); // eslint-disable-line react-hooks/exhaustive-deps

  // Snapshot evData at the moment each team enters the user's portfolio
  useEffect(() => {
    const curr = state.userPortfolio;
    const prev = prevPortfolioRef.current;
    const newTeams = Object.keys(curr).filter(t => !(t in prev));
    if (newTeams.length > 0) {
      setEvAtBuy(before => {
        const next = { ...before };
        newTeams.forEach(t => { next[t] = evData[t]?.mean_earnings ?? null; });
        return next;
      });
    }
    prevPortfolioRef.current = curr;
  }, [state.userPortfolio]); // eslint-disable-line react-hooks/exhaustive-deps


  // Fetch opponent data for current team under auction
  useEffect(() => {
    const team = state.queue[state.queueIdx] ?? null;
    if (!team || state.status !== "running") return;
    setOpponents({});
    const rounds = ["r32", "r16", "qf"];
    rounds.forEach(round => {
      loadOpponents(team, round)
        .then(data => setOpponents(prev => ({ ...prev, [round]: data })))
        .catch(() => {});
    });
  }, [state.queueIdx, state.status]);

  function handleStart({ userBudget, potTarget: pt, seed }) {
    setStarting(true);
    setStartError(null);
    setPotTarget(pt);
    const assumedPrice = pt / ALL_TEAMS.length;
    const prices = Object.fromEntries(ALL_TEAMS.map(t => [t, assumedPrice]));
    const seq = ++_evFetchSeq;
    console.log(`[EV #${seq}] handleStart fetch potTarget=${pt} assumedPrice=${assumedPrice.toFixed(2)}`);
    fetchEV(prices)
      .then(data => {
        const sumEV = data.teams.reduce((s, t) => s + t.mean_earnings, 0);
        console.log(`[EV #${seq} resp] handleStart sumEV=${sumEV.toFixed(0)} expected~${pt}`);
        const map = {};
        data.teams.forEach(t => { map[t.team] = t; });
        setEvData(map);
        setInitialEvData(map);
        const { bots, roomProfile } = createBots(seed, map, pt, teams);
        console.log(`[Room] ${roomProfile.name} | potCenter=$${roomProfile.potCenter}`);
        const queue = buildAuctionQueue(teams);
        startAuction({ queue, bots, userBudget });
      })
      .catch(err => {
        console.warn("EV fetch failed, starting without EV data:", err);
        try {
          const { bots } = createBots(seed, {}, pt, teams);
          const queue = buildAuctionQueue(teams);
          startAuction({ queue, bots, userBudget });
        } catch (e) {
          setStartError(e.message);
          setStarting(false);
        }
      });
  }

  function handleTogglePause() {
    togglePause();
  }

  function handleReset() {
    window.location.reload();
  }

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Connecting to API…</p>
        <p className="loading-sub">Make sure <code>python server.py --db wc2026_prod.sqlite</code> is running</p>
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="error-screen">
        <h2>Cannot reach API server</h2>
        <p className="err-msg">{apiError}</p>
        <code>python server.py --db wc2026_prod.sqlite</code>
      </div>
    );
  }

  if (state.status === "idle") {
    if (starting) {
      return (
        <div className="loading-screen">
          <div className="spinner" />
          <p>Calculating…</p>
        </div>
      );
    }
    if (startError) {
      return (
        <div className="error-screen">
          <h2>Failed to start auction</h2>
          <p className="err-msg">{startError}</p>
          <button className="btn-ghost" onClick={() => setStartError(null)}>Back</button>
        </div>
      );
    }
    return <SetupScreen runInfo={runInfo} onStart={handleStart} />;
  }

  if (state.status === "complete") {
    return (
      <ResultsScreen
        state={state}
        teams={teams}
        evData={evData}
        initialEvData={initialEvData}
        onReset={handleReset}
      />
    );
  }

  // Running auction
  const userSpentDisplay = state.userSpent.toLocaleString();
  const soldResults = Object.values(state.results).filter(r => r.winner);
  const impliedPot = soldResults.length >= 1
    ? Math.round((soldResults.reduce((s, r) => s + r.price, 0) / soldResults.length) * 48)
    : null;
  const teamsAuctioned = state.queueIdx;
  const totalSpent = soldResults.reduce((s, r) => s + r.price, 0);

  return (
    <div className="app-root">
      <header className="app-header">
        <span className="app-title">WC2026 Auction Sim</span>
        <span className="header-meta">
          {runInfo && `${(runInfo.n_sims ?? 0).toLocaleString()} sims`}
        </span>
        <span className="header-pot">
          <span className="header-pot-label">Pot target</span>
          <span className="header-pot-val">${potTarget.toLocaleString()}</span>
          {impliedPot != null && (
            <>
              <span className="header-pot-sep">·</span>
              <span className="header-pot-label">implied</span>
              <span className="header-pot-implied">${impliedPot.toLocaleString()}</span>
            </>
          )}
        </span>
        <span className="header-counters">
          <span className="header-counter-label">Auctioned</span>
          <span className="header-counter-val">{teamsAuctioned}/{state.queue.length}</span>
          <span className="header-pot-sep">·</span>
          <span className="header-counter-label">Total spent</span>
          <span className="header-counter-val">${totalSpent.toLocaleString()}</span>
        </span>
        <span className="header-budget">
          JS — Budget: ${state.userBudget.toLocaleString()} · Spent: ${userSpentDisplay}
        </span>
        <button className="btn-ghost" onClick={handleReset}>Exit</button>
      </header>

      <div className="app-body">
        <aside className="left-panel">
          <TeamDetail state={state} teams={teams} evData={evData} initialEvData={initialEvData} evAtBuy={evAtBuy} />
        </aside>

        <main className="center-panel">
          <AuctionStage
            state={state}
            teams={teams}
            evData={evData}
            initialEvData={initialEvData}
            opponents={opponents}
            potTarget={potTarget}
            onBid={placeBid}
            onTogglePause={handleTogglePause}
            onStartSim={resumeAuction}
            onSkipToEnd={resolveNow}
          />
        </main>

        <aside className="right-panel">
          <SyndicateTracker state={state} evData={evData} />
          <TeamList state={state} teams={teams} evData={evData} evAtSale={evAtSale} />
        </aside>
      </div>
    </div>
  );
}
