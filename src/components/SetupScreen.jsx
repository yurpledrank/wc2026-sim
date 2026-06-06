import { useState } from "react";

function randomSeed() {
  return Math.floor(Math.random() * 99999) + 1;
}

const OPPONENTS = ["Gibson + JC", "Penney", "Mike + Pat", "Scott", "Weems", "Dave", "Paul", "Guido"];

export default function SetupScreen({ runInfo, onStart }) {
  const [userBudget, setUserBudget] = useState(1000);
  const [potTarget, setPotTarget] = useState(5000);
  const [seed, setSeed] = useState(() => randomSeed());

  function handleSubmit(e) {
    e.preventDefault();
    onStart({ userBudget, potTarget, seed });
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1 className="setup-title">WC2026 Calcutta Sim</h1>
        {runInfo && (
          <p className="setup-meta">
            {(runInfo.n_sims ?? 0).toLocaleString()} sims · seed {runInfo.seed}
          </p>
        )}

        <form onSubmit={handleSubmit} className="setup-form">
          <div className="setup-row">
            <label>Your budget ($) — JS</label>
            <input
              type="number"
              min="100"
              step="50"
              value={userBudget}
              onChange={e => setUserBudget(Number(e.target.value))}
            />
          </div>

          <div className="setup-row">
            <label>Opponents (8)</label>
            <div className="opponents-list">
              {OPPONENTS.map(n => <span key={n} className="opponent-chip">{n}</span>)}
            </div>
          </div>

          <div className="setup-row">
            <label>Estimated pot ($)</label>
            <input
              type="number"
              min="500"
              step="500"
              value={potTarget}
              onChange={e => setPotTarget(Number(e.target.value))}
            />
            <span className="setup-hint">used for EV calculations</span>
          </div>

          <div className="setup-row">
            <label>Sim seed</label>
            <div className="seed-row">
              <input
                type="number"
                min="1"
                value={seed}
                onChange={e => setSeed(Number(e.target.value))}
              />
              <button type="button" className="btn-ghost" onClick={() => setSeed(randomSeed())}>
                Shuffle
              </button>
            </div>
            <span className="setup-hint">same seed = same opponents</span>
          </div>

          <button type="submit" className="btn-primary setup-start">
            Start Auction
          </button>
        </form>
      </div>
    </div>
  );
}
