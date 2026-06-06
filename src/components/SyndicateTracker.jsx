export default function SyndicateTracker({ state, evData }) {
  const { bots, userSpent, userPortfolio } = state;

  const userEV    = Object.keys(userPortfolio).reduce((s, t) => s + (evData[t]?.mean_earnings ?? 0), 0);
  const userTeams = Object.keys(userPortfolio).length;
  const userNet   = userEV - userSpent;

  const botRows = bots.map(bot => {
    const ev    = Object.keys(bot.portfolio).reduce((s, t) => s + (evData[t]?.mean_earnings ?? 0), 0);
    const teams = Object.keys(bot.portfolio).length;
    const net   = ev - bot.spent;
    return { id: bot.id, name: bot.name, teams, spent: bot.spent, ev, net, isUser: false };
  }).sort((a, b) => b.net - a.net);

  const rows = [
    { id: "user", name: "JS", teams: userTeams, spent: userSpent, ev: userEV, net: userNet, isUser: true },
    ...botRows,
  ];

  return (
    <div className="syndicate-tracker">
      <div className="syt-title">Syndicates</div>
      <div className="syt-scroll">
        <table className="syt-table">
          <thead>
            <tr>
              <th className="syt-name-col">Name</th>
              <th className="syt-right">Tm</th>
              <th className="syt-right">Spent</th>
              <th className="syt-right">EV</th>
              <th className="syt-right">+/-</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className={row.isUser ? "syt-user-row" : ""}>
                <td className={`syt-name-col ${row.isUser ? "syt-user-name" : ""}`}>{row.name}</td>
                <td className="syt-right syt-dim">{row.teams}</td>
                <td className="syt-right">{row.spent > 0 ? `$${row.spent.toLocaleString()}` : "—"}</td>
                <td className="syt-right">{row.ev > 0 ? `$${Math.round(row.ev).toLocaleString()}` : "—"}</td>
                <td className="syt-right syt-net"
                  style={{ color: row.net > 0 ? "var(--success)" : row.net < 0 ? "var(--danger)" : "var(--text-muted)" }}>
                  {row.spent > 0
                    ? `${row.net >= 0 ? "+" : ""}$${Math.round(row.net).toLocaleString()}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
