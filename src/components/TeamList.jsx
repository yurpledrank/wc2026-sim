import { useEffect, useRef } from "react";
import { TEAM_NAMES } from "../constants";

function winnerLabel(winner, bots) {
  if (!winner) return null;
  if (winner === "user") return "JS";
  return bots.find(b => b.id === winner)?.name ?? winner;
}

export default function TeamList({ state, teams, evData, evAtSale }) {
  const { queue, queueIdx, results, bots } = state;
  const scrollRef = useRef(null);
  const currentRef = useRef(null);

  // Keep current team scrolled to vertical center of the list
  useEffect(() => {
    const container = scrollRef.current;
    const current   = currentRef.current;
    if (!container || !current) return;
    const cRect = container.getBoundingClientRect();
    const rRect = current.getBoundingClientRect();
    // Position of row's center relative to container top, accounting for current scroll
    const rowCenter = rRect.top - cRect.top + container.scrollTop + rRect.height / 2;
    container.scrollTo({ top: rowCenter - container.clientHeight / 2, behavior: "smooth" });
  }, [queueIdx]);

  return (
    <div className="team-list">
      <div className="tl-header">Teams ({queue.length})</div>
      <div className="tl-col-headers">
        <span></span>
        <span></span>
        <span>Price</span>
        <span>EV Sale</span>
        <span>Δ Now</span>
      </div>
      <div className="tl-scroll" ref={scrollRef}>
        {queue.map((team, idx) => {
          const isCurrent = idx === queueIdx;
          const result    = results[team];
          const isPast    = idx < queueIdx;

          let statusCls = "";
          if (isCurrent)                  statusCls = "tl-current";
          else if (result?.winner === "user") statusCls = "tl-won-you";
          else if (result?.winner)        statusCls = "tl-won-bot";
          else if (isPast)                statusCls = "tl-passed";
          else                            statusCls = "tl-upcoming";

          const ev     = evData[team]?.mean_earnings;
          const winner = result ? winnerLabel(result.winner, bots) : null;

          const saleEV   = result?.winner ? (evAtSale?.[team] ?? null) : null;
          const currEV   = ev != null ? Math.round(ev) : null;
          const evDelta  = result?.winner && currEV != null ? currEV - result.price : null;

          return (
            <div
              key={team}
              ref={isCurrent ? currentRef : null}
              className={`tl-row ${statusCls}`}
            >
              <span className="tl-code">{team}</span>
              <span className="tl-name">{TEAM_NAMES[team] ?? team}</span>
              {result?.winner ? (
                <>
                  <span className="tl-price">${result.price.toLocaleString()}</span>
                  <span className="tl-sale-ev">{saleEV != null ? `$${Math.round(saleEV)}` : "—"}</span>
                  <span className="tl-ev-delta" style={{ color: evDelta == null ? undefined : evDelta >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {evDelta != null ? `${evDelta >= 0 ? "+" : ""}$${evDelta}` : "—"}
                  </span>
                </>
              ) : result ? (
                <span className="tl-no-sale" style={{ gridColumn: "span 3" }}>—</span>
              ) : currEV != null ? (
                <span className="tl-ev" style={{ gridColumn: "span 3" }}>~${currEV}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
