import { useRef, useEffect } from "react";
import { TEAM_NAMES } from "../constants";

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function bidderLabel(bidder, bots) {
  if (bidder === "user") return { name: "JS", isUser: true };
  const bot = bots.find(b => b.id === bidder);
  return { name: bot?.name ?? bidder, isUser: false };
}

export default function BidLog({ log, bots }) {
  const bottomRef = useRef(null);

  // Auto-scroll on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  if (log.length === 0) {
    return (
      <div className="bid-log">
        <div className="log-title">Bid Log</div>
        <div className="log-empty">No bids yet</div>
      </div>
    );
  }

  return (
    <div className="bid-log">
      <div className="log-title">Bid Log</div>
      <div className="log-list">
        {log.map((entry, i) => {
          const { name, isUser } = bidderLabel(entry.bidder, bots);
          return (
            <div key={i} className={`log-entry ${isUser ? "log-user" : ""}`}>
              <span className="log-team">{entry.team}</span>
              <span className={`log-bidder ${isUser ? "you" : ""}`}>{name}</span>
              <span className="log-amount">${entry.amount.toLocaleString()}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
