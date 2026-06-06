import { useState, useEffect } from "react";
import { TEAM_NAMES, GROUPS } from "../constants";
import { ELO_RATINGS, PELE_RATINGS, PELE_RANKS, ELO_RANKS, ANALYST_ADV, analystPoolCEV, isChampDisagreement, neloDelta } from "../projectionData";

const PHASE_LABEL = {
  open:         { text: "Waiting for first bid…", cls: "phase-open" },
  active:       { text: "Active",                 cls: "phase-active" },
  "going-once": { text: "Going once…",            cls: "phase-once" },
  "going-twice":{ text: "Going twice…",           cls: "phase-twice" },
  sold:         { text: "SOLD",                   cls: "phase-sold" },
  passed:       { text: "No sale — passed",       cls: "phase-passed" },
};

const OPP_ROUNDS = [
  { key: "r32", label: "R32" },
  { key: "r16", label: "R16" },
  { key: "qf",  label: "QF"  },
];


function fmtBidder(bidder, bots) {
  if (!bidder) return "—";
  if (bidder === "user") return "JS";
  return bots.find(b => b.id === bidder)?.name ?? bidder;
}

function winnerName(winner, bots) {
  if (!winner) return null;
  if (winner === "user") return "JS";
  return bots.find(b => b.id === winner)?.name ?? winner;
}

function GroupTable({ team, teams, evData, initialEvData, results, bots }) {
  const groupEntry = Object.entries(GROUPS).find(([, ts]) => ts.includes(team));
  if (!groupEntry) return null;
  const [groupLetter, rawGroupTeams] = groupEntry;
  const groupTeams = [...rawGroupTeams].sort((a, b) => (ELO_RATINGS[b] ?? 0) - (ELO_RATINGS[a] ?? 0));

  return (
    <div className="sgt-section">
      <div className="sgt-label">Group {groupLetter}</div>
      <table className="sgt-table">
        <colgroup>
          <col />
          <col style={{ width: "115px" }} />
          <col style={{ width: "62px" }} />
          <col style={{ width: "62px" }} />
          <col style={{ width: "44px" }} />
        </colgroup>
        <thead>
          <tr>
            <th>Team</th>
            <th>Status</th>
            <th className="sgt-right">Init EV</th>
            <th className="sgt-right">+/- EV</th>
            <th className="sgt-right">P(🏆)</th>
          </tr>
        </thead>
        <tbody>
          {groupTeams.map(code => {
            const result    = results[code];
            const ev        = evData[code]?.mean_earnings;
            const initEv    = initialEvData?.[code]?.mean_earnings;
            const champ     = teams[code]?.advancement?.champion ?? 0;
            const isCurrent = code === team;
            const wName     = result ? winnerName(result.winner, bots) : null;

            let statusEl;
            if (result?.winner) {
              const isUser = result.winner === "user";
              statusEl = (
                <span className={`sgt-sold ${isUser ? "sgt-sold-you" : ""}`}>
                  ${result.price.toLocaleString()} · {wName}
                </span>
              );
            } else if (result) {
              statusEl = <span className="sgt-passed">passed</span>;
            } else if (ev != null) {
              statusEl = <span className="sgt-ev">~${Math.round(ev)}</span>;
            } else {
              statusEl = <span className="sgt-ev">—</span>;
            }

            // ev - price: positive = good deal (current EV exceeds what was paid), updates live with evData
            const evDelta = result?.winner && ev != null ? ev - result.price : null;

            return (
              <tr key={code} className={isCurrent ? "sgt-current" : ""}>
                <td>
                  <span className="sgt-code">{code}</span>
                  <span className="sgt-name"> {TEAM_NAMES[code] ?? code}</span>
                </td>
                <td>{statusEl}</td>
                <td className="sgt-right sgt-dim">
                  {initEv != null ? `$${Math.round(initEv)}` : "—"}
                </td>
                <td className="sgt-right">
                  {evDelta != null ? (
                    <span style={{ color: evDelta >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                      {evDelta >= 0 ? "+" : ""}${Math.round(evDelta)}
                    </span>
                  ) : "—"}
                </td>
                <td className="sgt-right">{(champ * 100).toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OpponentSection({ opponents, evData, results, bots }) {
  return (
    <div className="opp-section">
      <div className="sgt-label">Likely Opponents</div>
      <div className="opp-rounds">
        {OPP_ROUNDS.map(({ key, label }) => {
          const data = opponents[key];
          return (
            <div key={key} className="opp-round-block">
              <div className="opp-round-head">
                <span className="opp-round-label">{label}</span>
                {data && (
                  <span className="opp-reach opp-reach-bright">{(data.reach_prob * 100).toFixed(0)}% reach</span>
                )}
              </div>
              {!data ? (
                <div className="opp-loading">…</div>
              ) : (
                <table className="opp-table">
                  <tbody>
                    {Object.entries(data.opponents).slice(0, 5).map(([opp, prob]) => {
                      const result = results[opp];
                      const ev     = evData[opp]?.mean_earnings;
                      let priceEl;
                      if (result?.winner) {
                        const isUser = result.winner === "user";
                        priceEl = <span className={`opp-price ${isUser ? "opp-price-you" : "opp-price-sold"}`}>
                          ${result.price.toLocaleString()}
                        </span>;
                      } else if (ev != null) {
                        priceEl = <span className="opp-price opp-price-ev">~${Math.round(ev)}</span>;
                      } else {
                        priceEl = <span className="opp-price opp-price-ev">—</span>;
                      }
                      return (
                        <tr key={opp}>
                          <td className="opp-code">{opp}</td>
                          <td className="opp-prob opp-prob-bright">{(prob * 100).toFixed(0)}%</td>
                          <td>{priceEl}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AuctionStage({ state, teams, evData, initialEvData, opponents, potTarget, onBid, onTogglePause, onStartSim, onSkipToEnd }) {
  const { phase, queue, queueIdx, currentBid, leader, countdown, bots, results, paused } = state;
  const team      = queue[queueIdx] ?? null;
  const profile   = team ? teams[team] : null;
  const ev        = team ? (evData[team]?.mean_earnings ?? null) : null;
  const initialEv = team ? (initialEvData?.[team]?.mean_earnings ?? null) : null;
  const evShift   = (initialEv != null && ev != null) ? ev - initialEv : null;

  const [bidInput, setBidInput] = useState(currentBid + 1);

  useEffect(() => {
    setBidInput(currentBid + 1);
  }, [currentBid, queueIdx]);

  const taPoolCEV  = team ? analystPoolCEV(team, potTarget) : null;
  const disagrees  = team ? isChampDisagreement(profile?.advancement?.champion, team) : false;
  const nelo       = team ? neloDelta(team) : null;

  const userIsLeading = leader === "user";
  const isClosed      = phase === "sold" || phase === "passed";
  const canBid        = !isClosed && !userIsLeading && state.status === "running" && !paused;

  function submit(amount) {
    const val = Math.floor(Number(amount));
    if (!val || val <= currentBid) return;
    onBid(val);
  }

  const phaseInfo = PHASE_LABEL[phase] ?? PHASE_LABEL.open;
  const delta     = ev != null && currentBid > 0 ? ev - currentBid : null;

  if (!team || state.status === "idle") {
    return <div className="stage-empty">Auction not started</div>;
  }

  return (
    <div className="stage">

      {/* ── Top row: info col (left) + bid col (right) ── */}
      <div className="stage-top-row">

        {/* Left: condensed team info */}
        <div className="stage-info-col">
          <div className="stage-team-header">
            <div className="stage-team-code">{team}</div>
            <div className="stage-team-name">{TEAM_NAMES[team] ?? team}</div>
            <div className="stage-position">Team {queueIdx + 1} of {queue.length}</div>
          </div>

          {/* EV strip: Initial EV | Shift | Current EV | EV vs bid */}
          {initialEv != null && ev != null && (
            <div className="ev-strip">
              <div className="ev-strip-cell">
                <span className="ev-strip-label">Initial EV</span>
                <span className="ev-strip-val">${Math.round(initialEv).toLocaleString()}</span>
              </div>
              <div className="ev-strip-cell">
                <span className="ev-strip-label">Shift</span>
                <span className="ev-strip-val ev-strip-shift"
                  style={{ color: evShift != null && evShift !== 0
                    ? (evShift > 0 ? "var(--success)" : "var(--danger)")
                    : "var(--text-dim)" }}>
                  {evShift != null && evShift !== 0
                    ? `${evShift > 0 ? "+" : ""}$${Math.round(evShift).toLocaleString()}`
                    : "—"}
                </span>
              </div>
              <div className="ev-strip-cell ev-strip-cell-highlight">
                <span className="ev-strip-label">Current EV</span>
                <span className="ev-strip-val ev-strip-current">${Math.round(ev).toLocaleString()}</span>
              </div>
              <div className="ev-strip-cell ev-strip-cell-highlight">
                <span className="ev-strip-label">EV vs bid</span>
                <span className="ev-strip-val ev-strip-delta"
                  style={{ color: delta != null
                    ? (delta >= 0 ? "var(--success)" : "var(--danger)")
                    : "var(--text-dim)" }}>
                  {delta != null
                    ? `${delta >= 0 ? "+" : ""}$${Math.round(delta).toLocaleString()}`
                    : "—"}
                </span>
              </div>
            </div>
          )}


          <div className="ssc-wrap">
            <div className="ssc-rating-grid">
              <span className="ssc-chip">
                <span className="ssc-clabel">PELE</span>
                <span className="ssc-cval">{PELE_RATINGS[team] ?? "—"}</span>
              </span>
              <span className="ssc-chip">
                <span className="ssc-clabel">ELO</span>
                <span className="ssc-cval">{ELO_RATINGS[team] ?? "—"}</span>
              </span>
              <span className="ssc-chip">
                <span className="ssc-clabel">NELO Δ</span>
                <span className="ssc-cval" style={{ color: nelo != null && nelo > 1 ? "var(--success)" : nelo != null && nelo < -1 ? "var(--danger)" : "var(--text)" }}>
                  {nelo != null ? `${nelo > 0 ? "+" : ""}${nelo.toFixed(1)}%` : "—"}
                </span>
              </span>
              <span className={`ssc-badge ${disagrees ? "ssc-badge-warn" : "ssc-badge-ok"}`}>
                {disagrees ? "⚠ Sources Disagree" : "✓ Sources Converge"}
              </span>
              <span className="ssc-chip ssc-rank-chip">
                <span className="ssc-clabel">PELE</span>
                <span className="ssc-cval ssc-rank-val">#{PELE_RANKS[team] ?? "—"}</span>
              </span>
              <span className="ssc-chip ssc-rank-chip">
                <span className="ssc-clabel">ELO</span>
                <span className="ssc-cval ssc-rank-val">#{ELO_RANKS[team] ?? "—"}</span>
              </span>
              <span /><span />
            </div>
            <table className="ssc-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Silver</th>
                  <th>TheAnalyst</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>R32</td>
                  <td>{profile?.advancement?.r32 != null
                    ? `${(profile.advancement.r32 * 100).toFixed(1)}%` : "—"}</td>
                  <td>{ANALYST_ADV[team]?.r32 != null
                    ? `${(ANALYST_ADV[team].r32 * 100).toFixed(1)}%` : "—"}</td>
                </tr>
                <tr className={disagrees ? "ssc-row-warn" : ""}>
                  <td>P(Champ)</td>
                  <td>{profile?.advancement?.champion != null
                    ? `${(profile.advancement.champion * 100).toFixed(2)}%` : "—"}</td>
                  <td>{ANALYST_ADV[team]?.champion != null
                    ? `${(ANALYST_ADV[team].champion * 100).toFixed(2)}%` : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: bid display + countdown + controls */}
        <div className="stage-bid-col">
          <div className="stage-bid-display">
            <div className="stage-current-bid">
              {currentBid > 0 ? `$${currentBid.toLocaleString()}` : "—"}
            </div>
            <div className="stage-leader">
              {leader ? `${fmtBidder(leader, bots)} leading` : "No bids yet"}
            </div>
          </div>

          <div className={`stage-countdown ${paused ? "phase-paused" : phaseInfo.cls}`}>
            <div className="countdown-number">{paused ? "⏸" : (countdown > 0 ? countdown : "")}</div>
            <div className="countdown-label">{paused ? "Paused" : phaseInfo.text}</div>
          </div>

          {canBid ? (
            <div className="stage-controls">
              <div className="bid-input-row">
                <span className="bid-dollar">$</span>
                <input
                  className="bid-input"
                  type="number"
                  min={currentBid + 1}
                  step="5"
                  value={bidInput}
                  onChange={e => setBidInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submit(bidInput)}
                />
                <button className="btn-primary bid-btn" onClick={() => submit(bidInput)}>Bid</button>
              </div>
              <div className="quick-bids">
                {[5, 10, 25, 50].map(inc => (
                  <button key={inc} className="btn-quick"
                    onClick={() => { const v = currentBid + inc; setBidInput(v); submit(v); }}>
                    +${inc}
                  </button>
                ))}
                <button className="btn-quick btn-skip-end"
                  onClick={onSkipToEnd}
                  title="Sell to the highest bidder now">
                  Skip to End
                </button>
              </div>
            </div>
          ) : (
            <div className="stage-controls-inactive">
              {paused && <span className="passed-msg">Clock paused — resume to continue</span>}
              {!paused && userIsLeading && <span className="winning-msg">You're winning this one</span>}
              {!paused && isClosed && phase === "sold" && (
                <span className="sold-msg">
                  {leader === "user" ? "JS wins!" : `${fmtBidder(leader, bots)} wins`} — ${currentBid.toLocaleString()}
                </span>
              )}
              {!paused && isClosed && phase === "passed" && (
                <span className="passed-msg">Passed — no bids</span>
              )}
            </div>
          )}

          <div className="stage-pause-row">
            {paused && queueIdx === 0 && Object.keys(results).length === 0 && currentBid === 0 ? (
              <button className="btn-start-sim" onClick={onStartSim}>
                ▶ Start Sim
              </button>
            ) : (
              <button
                className={`btn-pause ${paused ? "btn-resume" : ""}`}
                onClick={onTogglePause}
              >
                {paused ? "▶ Resume" : "⏸ Pause"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom row: group table left, opponents right ── */}
      <div className="stage-bottom-row">
        <GroupTable
          team={team}
          teams={teams}
          evData={evData}
          initialEvData={initialEvData}
          results={results}
          bots={bots}
        />
        <OpponentSection
          opponents={opponents ?? {}}
          evData={evData}
          results={results}
          bots={bots}
        />
      </div>
    </div>
  );
}
