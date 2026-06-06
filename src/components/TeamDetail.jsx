import { TEAM_NAMES } from "../constants";
import { ANALYST_ADV } from "../projectionData";

const ROUNDS = [
  { key: "r32",      label: "R32" },
  { key: "r16",      label: "R16" },
  { key: "qf",       label: "QF" },
  { key: "sf",       label: "SF" },
  { key: "final",    label: "Final" },
  { key: "champion", label: "Champ" },
];

function pct(v) {
  return v != null ? `${(v * 100).toFixed(1)}%` : "—";
}

export default function TeamDetail({ state, teams, evData, initialEvData, evAtBuy }) {
  const { queue, queueIdx, currentBid, userPortfolio } = state;
  const team = queue[queueIdx] ?? null;

  if (!team) {
    return <div className="team-detail team-detail-empty"><span>—</span></div>;
  }

  const adv       = teams[team]?.advancement ?? {};
  const ev        = evData[team]?.mean_earnings ?? null;
  const initialEv = initialEvData?.[team]?.mean_earnings ?? null;
  const evShift   = (initialEv != null && ev != null) ? ev - initialEv : null;
  const delta     = ev != null && currentBid > 0 ? ev - currentBid : null;

  return (
    <div className="team-detail">
      <div className="td-header">
        <span className="td-code">{team}</span>
        <span className="td-name">{TEAM_NAMES[team] ?? team}</span>
      </div>

      <div className="td-ev-row">
        {initialEv != null && (
          <div className="td-ev-cell">
            <span className="td-ev-label">Initial EV</span>
            <span className="td-ev-amount">${Math.round(initialEv).toLocaleString()}</span>
          </div>
        )}
        {ev != null && (
          <div className="td-ev-cell">
            <span className="td-ev-label">Current EV</span>
            <span className="td-ev-amount td-ev-amount-current">${Math.round(ev).toLocaleString()}</span>
          </div>
        )}
        {evShift != null && evShift !== 0 && (
          <div className="td-ev-cell">
            <span className="td-ev-label">Shift</span>
            <span className="td-ev-amount" style={{ color: evShift > 0 ? "var(--success)" : "var(--danger)" }}>
              {evShift > 0 ? "+" : ""}${Math.round(evShift).toLocaleString()}
            </span>
          </div>
        )}
        {delta != null && (
          <div className="td-ev-cell">
            <span className="td-ev-label">EV vs bid</span>
            <span className="td-ev-amount" style={{ color: delta >= 0 ? "var(--success)" : "var(--danger)" }}>
              {delta >= 0 ? "+" : ""}${Math.round(delta).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <table className="td-prob-table">
        <thead>
          <tr>
            <th></th>
            {ROUNDS.map(({ key, label }) => (
              <th key={key}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="td-prob-src">Silver</td>
            {ROUNDS.map(({ key }) => (
              <td key={key} className={`td-prob-cell${key === "champion" ? " td-champ-cell" : ""}`}>
                {pct(adv[key])}
              </td>
            ))}
          </tr>
          <tr className="td-prob-ta-row">
            <td className="td-prob-src">TA</td>
            {ROUNDS.map(({ key }) => (
              <td key={key} className="td-prob-cell">
                {pct(ANALYST_ADV[team]?.[key])}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {Object.keys(userPortfolio).length > 0 && (
        <div className="td-portfolio">
          <div className="td-port-title">Your Teams</div>
          <table className="td-port-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Paid</th>
                <th>Init EV</th>
                <th>EV at Buy</th>
                <th>Now</th>
                <th>+/-</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(userPortfolio).map(([t, price]) => {
                const initEv  = initialEvData?.[t]?.mean_earnings ?? null;
                const buyEv   = evAtBuy?.[t] ?? null;
                const currEv  = evData[t]?.mean_earnings ?? null;
                return (
                  <tr key={t}>
                    <td className="td-port-code">{t}</td>
                    <td className="td-port-num">${price.toLocaleString()}</td>
                    <td className="td-port-num td-port-dim">{initEv != null ? `$${Math.round(initEv)}` : "—"}</td>
                    <td className="td-port-num td-port-dim">{buyEv  != null ? `$${Math.round(buyEv)}`  : "—"}</td>
                    <td className="td-port-num td-port-current">
                      {currEv != null ? `$${Math.round(currEv)}` : "—"}
                    </td>
                    <td className="td-port-num td-port-delta"
                      style={{ color: currEv != null
                        ? (currEv >= price ? "var(--success)" : "var(--danger)")
                        : undefined }}>
                      {currEv != null
                        ? `${currEv - price >= 0 ? "+" : ""}$${Math.round(currEv - price)}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
