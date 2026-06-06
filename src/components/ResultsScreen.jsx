import { TEAM_NAMES } from "../constants";

function pct(v) { return v == null ? "—" : `${(v * 100).toFixed(1)}%`; }
function fmt(v) { return v == null ? "—" : `$${Math.round(v).toLocaleString()}`; }
function fmtDelta(v) {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : "-"}$${Math.round(Math.abs(v)).toLocaleString()}`;
}

function botName(id, bots) {
  if (id === "user") return "JS";
  return bots.find(b => b.id === id)?.name ?? id;
}

function csvCell(v) {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(...cells) { return cells.map(csvCell).join(","); }

function generateCSV(state, evData, initialEvData) {
  const { log, bots, results, userPortfolio, userBudget } = state;
  const lines = [];

  // ── Section 1: Bid History ──────────────────────────────────────────────
  lines.push("SECTION,BID HISTORY");
  lines.push(csvRow(
    "Team", "Team Name", "Bidder", "Amount",
    "Is Winning Bid", "Initial EV", "Final EV",
    "Prev1 Bidder", "Prev1 Amount", "Prev2 Bidder", "Prev2 Amount"
  ));

  const chronoLog = [...log].reverse();
  const teamBids = {};
  chronoLog.forEach(entry => {
    (teamBids[entry.team] = teamBids[entry.team] ?? []).push(entry);
  });

  chronoLog.forEach(entry => {
    const result = results[entry.team];
    const isWinning =
      result?.winner != null &&
      result.winner === entry.bidder &&
      result.price === entry.amount;

    let initEV = "", finalEV = "";
    let p1Bidder = "", p1Amount = "", p2Bidder = "", p2Amount = "";

    if (isWinning) {
      initEV  = Math.round(initialEvData[entry.team]?.mean_earnings ?? 0);
      finalEV = Math.round(evData[entry.team]?.mean_earnings ?? 0);
      const tBids = teamBids[entry.team] ?? [];
      const winIdx = tBids.indexOf(entry);
      if (winIdx >= 1) { const p1 = tBids[winIdx - 1]; p1Bidder = botName(p1.bidder, bots); p1Amount = p1.amount; }
      if (winIdx >= 2) { const p2 = tBids[winIdx - 2]; p2Bidder = botName(p2.bidder, bots); p2Amount = p2.amount; }
    }

    lines.push(csvRow(
      entry.team, TEAM_NAMES[entry.team] ?? entry.team,
      botName(entry.bidder, bots), entry.amount,
      isWinning ? "TRUE" : "FALSE",
      initEV, finalEV,
      p1Bidder, p1Amount, p2Bidder, p2Amount
    ));
  });

  lines.push("");

  // ── Section 2: Syndicate Portfolios (flat per syndicate×team) ───────────
  lines.push("SECTION,SYNDICATE PORTFOLIOS");
  lines.push(csvRow(
    "Syndicate", "Personality", "Budget", "Est Pot", "Proj Set",
    "Team", "Team Name", "Paid", "Final EV", "EV Delta"
  ));

  // Build roster: JS first, then bots
  const syndicates = [
    {
      name: "JS", personality: "user",
      budget: userBudget, estPot: "—", projSet: "—",
      portfolio: Object.entries(userPortfolio).map(([team, price]) => ({ team, price })),
    },
    ...bots.map(bot => ({
      name: bot.name,
      personality: bot.personality,
      budget: bot.budget,
      estPot: Math.round(bot.potEstimate ?? bot.initialPotEstimate),
      projSet: bot.projectionSet,
      portfolio: Object.entries(bot.portfolio).map(([team, price]) => ({ team, price })),
    })),
  ];

  syndicates.forEach(syn => {
    if (syn.portfolio.length === 0) {
      lines.push(csvRow(
        syn.name, syn.personality, syn.budget, syn.estPot, syn.projSet,
        "", "", "", "", ""
      ));
    } else {
      syn.portfolio.forEach(({ team, price }) => {
        const finalEV = Math.round(evData[team]?.mean_earnings ?? 0);
        const delta   = finalEV - price;
        lines.push(csvRow(
          syn.name, syn.personality, syn.budget, syn.estPot, syn.projSet,
          team, TEAM_NAMES[team] ?? team,
          price, finalEV,
          `${delta >= 0 ? "+" : ""}${delta}`
        ));
      });
    }
  });

  lines.push("");

  // ── Section 3: Syndicate Summary ────────────────────────────────────────
  lines.push("SECTION,SYNDICATE SUMMARY");
  lines.push(csvRow(
    "Syndicate", "Personality", "Budget", "Est Pot", "Proj Set",
    "Teams Won", "Total Spent", "Total EV", "Net +/-"
  ));

  syndicates.forEach(syn => {
    const totalSpent = syn.portfolio.reduce((s, { price }) => s + price, 0);
    const totalEV    = syn.portfolio.reduce((s, { team }) => s + Math.round(evData[team]?.mean_earnings ?? 0), 0);
    const net        = totalEV - totalSpent;
    lines.push(csvRow(
      syn.name, syn.personality, syn.budget, syn.estPot, syn.projSet,
      syn.portfolio.length, totalSpent, totalEV,
      `${net >= 0 ? "+" : ""}${net}`
    ));
  });

  return lines.join("\n");
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ResultsScreen({ state, teams, evData, initialEvData, onReset }) {
  const { results, userPortfolio, userSpent, bots, queue } = state;

  const allSold = Object.entries(results).filter(([, r]) => r.winner);
  const totalPot = allSold.reduce((s, [, r]) => s + r.price, 0);

  // The API's Monte Carlo probabilities don't integrate to exactly 1, so sumEV
  // consistently falls ~1-2% short of the actual pot. Normalize here so net
  // deltas sum to zero — display correction only, not a model change.
  const rawSumEV = allSold.reduce((s, [team]) => s + (evData[team]?.mean_earnings ?? 0), 0);
  const evNorm   = rawSumEV > 0 && totalPot > 0 ? totalPot / rawSumEV : 1;
  // Build a normalized evData map used for all display and CSV export
  const normEvData = Object.fromEntries(
    Object.entries(evData).map(([t, v]) => [t, { ...v, mean_earnings: (v.mean_earnings ?? 0) * evNorm }])
  );
  const getEV = team => normEvData[team]?.mean_earnings ?? 0;

  const userTeams = Object.entries(userPortfolio).map(([team, price]) => {
    const ev      = getEV(team) || null;
    const initEv  = initialEvData?.[team]?.mean_earnings ?? null;
    const delta   = ev != null ? ev - price : null;
    const champ   = teams[team]?.advancement?.champion ?? 0;
    return { team, price, ev, initEv, delta, champ };
  }).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0));

  const userEV       = userTeams.reduce((s, t) => s + (t.ev ?? 0), 0);
  const userNetDelta = userEV - userSpent;

  const botSummaries = bots.map(bot => {
    const teamsWon = Object.entries(bot.portfolio);
    const ev = teamsWon.reduce((s, [t]) => s + getEV(t), 0);
    return { ...bot, teamsWon: teamsWon.length, ev, netDelta: ev - bot.spent };
  }).sort((a, b) => b.netDelta - a.netDelta);

  function handleExport() {
    const csv = generateCSV(state, normEvData, initialEvData ?? {});
    downloadCSV(csv, "wc2026_auction.csv");
  }

  return (
    <div className="results-screen">
      <div className="results-header">
        <h1>Auction Complete</h1>
        <div className="results-meta">
          {allSold.length} of {queue.length} teams sold · Total pot: {fmt(totalPot)}
        </div>
      </div>

      {/* User results */}
      <section className="results-section">
        <h2>JS — Your Portfolio</h2>
        <div className="results-summary-row">
          <div className="summary-stat">
            <span className="ss-label">Teams</span>
            <span className="ss-val">{userTeams.length}</span>
          </div>
          <div className="summary-stat">
            <span className="ss-label">Spent</span>
            <span className="ss-val">{fmt(userSpent)}</span>
          </div>
          <div className="summary-stat">
            <span className="ss-label">Total EV</span>
            <span className="ss-val">{fmt(userEV)}</span>
          </div>
          <div className="summary-stat">
            <span className="ss-label">Net EV</span>
            <span
              className="ss-val"
              style={{ color: userNetDelta >= 0 ? "var(--success)" : "var(--danger)" }}
            >
              {fmtDelta(userNetDelta)}
            </span>
          </div>
        </div>

        {userTeams.length === 0 ? (
          <p className="results-empty">JS didn't win any teams.</p>
        ) : (
          <table className="results-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>P(Champ)</th>
                <th>Paid</th>
                <th>Initial EV</th>
                <th>Final EV</th>
                <th>EV Delta</th>
              </tr>
            </thead>
            <tbody>
              {userTeams.map(({ team, price, ev, initEv, delta, champ }) => (
                <tr key={team}>
                  <td><strong>{team}</strong> <span className="rt-name">{TEAM_NAMES[team]}</span></td>
                  <td>{pct(champ)}</td>
                  <td>{fmt(price)}</td>
                  <td className="rt-dim">{fmt(initEv)}</td>
                  <td>{fmt(ev)}</td>
                  <td style={{ color: delta == null ? undefined : delta >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {fmtDelta(delta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Opponent reveal */}
      <section className="results-section">
        <h2>Opponents (revealed)</h2>
        <table className="results-table">
          <thead>
            <tr>
              <th>Syndicate</th>
              <th>Style</th>
              <th>Teams</th>
              <th>Spent</th>
              <th>EV</th>
              <th>Net EV</th>
            </tr>
          </thead>
          <tbody>
            {botSummaries.map(bot => (
              <tr key={bot.id}>
                <td>{bot.name}</td>
                <td className="rt-personality">{bot.personality.replace("_", " ")}</td>
                <td>{bot.teamsWon}</td>
                <td>{fmt(bot.spent)}</td>
                <td>{fmt(bot.ev)}</td>
                <td style={{ color: bot.netDelta >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {fmtDelta(bot.netDelta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="results-actions">
        <button className="btn-primary results-reset" onClick={onReset}>New Auction</button>
        <button className="btn-ghost results-export" onClick={handleExport}>Export CSV</button>
      </div>
    </div>
  );
}
