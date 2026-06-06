import { useReducer, useEffect, useRef, useCallback } from "react";
import { getBotBid, getBotDelay, getBotCeiling } from "./bots";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------
const initial = {
  status: "idle",    // idle | running | transitioning | complete
  phase: "open",     // open | active | going-once | going-twice | sold | passed
  paused: false,
  queue: [],
  queueIdx: 0,
  currentBid: 0,
  leader: null,      // null | "user" | botId
  countdown: 15,
  bots: [],
  userBudget: 0,
  userSpent: 0,
  userPortfolio: {},
  results: {},       // { team: { winner, price } }
  log: [],           // [{ team, bidder, amount, ts }]
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
function reducer(state, action) {
  switch (action.type) {

    case "START":
      return {
        ...initial,
        status: "running",
        phase: "open",
        queue: action.queue,
        bots: action.bots,
        userBudget: action.userBudget,
        countdown: 15,
        paused: true, // wait for explicit "Start Sim" click
      };

    case "TICK": {
      if (state.status !== "running") return state;

      const cd = state.countdown - 1;

      if (cd <= 0) {
        // Countdown expired — move to transitioning so timer pauses
        return {
          ...state,
          countdown: 0,
          status: "transitioning",
          phase: state.leader ? "sold" : "passed",
        };
      }

      let phase;
      if (!state.leader) {
        phase = "open";
      } else if (cd <= 2) {
        phase = "going-twice";
      } else if (cd <= 4) {
        phase = "going-once";
      } else {
        phase = "active";
      }

      return { ...state, countdown: cd, phase };
    }

    case "BID": {
      const { bidder, amount } = action;
      // Guard: reject stale or invalid bids
      if (state.status === "transitioning" || state.status === "idle") return state;
      if (state.phase === "sold" || state.phase === "passed") return state;
      if (amount <= state.currentBid) return state;

      const team = state.queue[state.queueIdx];
      const entry = { team, bidder, amount, ts: Date.now() };

      return {
        ...state,
        currentBid: amount,
        leader: bidder,
        countdown: 6,
        phase: "active",
        status: "running",
        log: [entry, ...state.log],
      };
    }

    case "ADVANCE": {
      const team = state.queue[state.queueIdx];
      const won = state.phase === "sold";
      const winner = won ? state.leader : null;
      const price = won ? state.currentBid : 0;

      // Record result
      const results = won
        ? { ...state.results, [team]: { winner, price } }
        : state.results;

      // Update winner's state
      let bots = state.bots;
      let userPortfolio = state.userPortfolio;
      let userSpent = state.userSpent;

      if (winner === "user") {
        userPortfolio = { ...userPortfolio, [team]: price };
        userSpent = userSpent + price;
      } else if (winner) {
        bots = state.bots.map(b =>
          b.id === winner
            ? { ...b, spent: b.spent + price, portfolio: { ...b.portfolio, [team]: price } }
            : b
        );
      }

      // Post-sale: update BAP state, pot estimates, and cooldowns for all bots
      if (won) {
        const soldEntries = Object.values(results).filter(r => r.winner);
        const soldCount = soldEntries.length;
        const totalSold = soldEntries.reduce((s, r) => s + r.price, 0);
        const impliedPot = (totalSold / soldCount) * 48;

        bots = bots.map(bot => {
          // Cooldown: tick down 1 for everyone, reset to 3 for the winner
          let b = bot.id === winner
            ? { ...bot, cooldownLots: 3 }
            : { ...bot, cooldownLots: Math.max(0, (bot.cooldownLots ?? 0) - 1) };

          const spentFrac = b.budget > 0 ? b.spent / b.budget : 1;
          const wins = Object.keys(b.portfolio).length;

          // BAP trigger check
          let bapTriggered = false;
          if (!b.bap1Active && (spentFrac >= b.bapThreshold1 || wins >= 3)) {
            b = { ...b, bap1Active: true,
              bap1Underspent: (b.budget - b.spent) > b.budget * 0.4 };
            bapTriggered = true;
          }
          if (!b.bap2Active && (spentFrac >= b.bapThreshold2 || wins >= 6)) {
            b = { ...b, bap2Active: true,
              bap2Underspent: (b.budget - b.spent) > b.budget * 0.4 };
            bapTriggered = true;
          }

          // Pot estimate update
          const shouldUpdate =
            b.updateFreq === "every" ||
            (b.updateFreq === "every2" && soldCount % 2 === 0) ||
            (b.updateFreq === "every4" && soldCount % 4 === 0) ||
            (b.updateFreq === "bap" && bapTriggered);

          if (shouldUpdate) {
            const noise = 1 + (Math.random() * 0.04 - 0.02);
            const newPot = impliedPot * noise;
            // Cap upward drift — bots won't chase a runaway pot more than 10% above initial estimate
            const newScale = Math.min(newPot / b.initialPotEstimate, 1.10);
            b = { ...b, potEstimate: newPot, potEstimateScale: newScale };
          }

          return { ...b, teamsAuctioned: soldCount };
        });
      } else {
        // Passed lot: still tick down cooldowns
        bots = bots.map(b => ({
          ...b,
          cooldownLots: Math.max(0, (b.cooldownLots ?? 0) - 1),
        }));
      }

      const nextIdx = state.queueIdx + 1;
      const done = nextIdx >= state.queue.length;

      return {
        ...state,
        status: done ? "complete" : "running",
        phase: "open",
        queueIdx: nextIdx,
        currentBid: 0,
        leader: null,
        countdown: 15,
        results,
        bots,
        userPortfolio,
        userSpent,
      };
    }

    case "RESOLVE_LOT": {
      const { winner, price, logEntry } = action;
      if (winner) {
        return {
          ...state,
          currentBid: price,
          leader: winner,
          countdown: 0,
          status: "transitioning",
          phase: "sold",
          paused: false,
          log: logEntry ? [logEntry, ...state.log] : state.log,
        };
      }
      return {
        ...state,
        countdown: 0,
        status: "transitioning",
        phase: "passed",
        paused: false,
      };
    }

    case "PAUSE":
      if (state.status !== "running") return state;
      return { ...state, paused: true };

    case "RESUME":
      return { ...state, paused: false };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useAuction() {
  const [state, dispatch] = useReducer(reducer, initial);
  const botTimers = useRef([]);

  // ── 1. Countdown timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (state.status !== "running" || state.paused) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.status, state.paused]);

  // ── 2. Sold / passed → advance after brief pause ─────────────────────────
  useEffect(() => {
    if (state.phase !== "sold" && state.phase !== "passed") return;
    if (state.paused) return;
    const delay = state.phase === "sold" ? 2200 : 900;
    const id = setTimeout(() => dispatch({ type: "ADVANCE" }), delay);
    return () => clearTimeout(id);
  }, [state.phase, state.queueIdx, state.paused]);

  // ── 3. Bot decisions — re-evaluate on every bid change ───────────────────
  useEffect(() => {
    if (state.status !== "running" || state.paused) return;
    if (state.phase === "sold" || state.phase === "passed") return;

    // Clear any pending bot actions from the previous state
    botTimers.current.forEach(clearTimeout);
    botTimers.current = [];

    const { currentBid, leader, queue, queueIdx, phase } = state;
    const team = queue[queueIdx];
    if (!team) return;

    state.bots.forEach(bot => {
      if (bot.id === leader) return;  // already winning, no need to bid

      const bid = getBotBid(bot, currentBid, team, state.queueIdx, state.queue.length);
      if (bid === null) return;

      const delay = getBotDelay(bot, phase);
      const id = setTimeout(() => {
        dispatch({ type: "BID", bidder: bot.id, amount: bid });
      }, delay);
      botTimers.current.push(id);
    });

    return () => {
      botTimers.current.forEach(clearTimeout);
      botTimers.current = [];
    };
  }, [state.currentBid, state.leader, state.queueIdx, state.phase, state.status, state.paused, state.bots]);

  // ── Public API ────────────────────────────────────────────────────────────
  const startAuction = useCallback(({ queue, bots, userBudget }) => {
    dispatch({ type: "START", queue, bots, userBudget });
  }, []);

  const placeBid = useCallback((amount) => {
    dispatch({ type: "BID", bidder: "user", amount });
  }, []);

  const pauseAuction  = useCallback(() => dispatch({ type: "PAUSE" }),  []);
  const resumeAuction = useCallback(() => dispatch({ type: "RESUME" }), []);
  const togglePause   = useCallback(() => {
    dispatch({ type: state.paused ? "RESUME" : "PAUSE" });
  }, [state.paused]);

  const resolveNow = useCallback(() => {
    const { queue, queueIdx, currentBid, leader, bots } = state;
    if (state.status !== "running") return;
    const team = queue[queueIdx];
    if (!team) return;

    // The current leader is already committed at currentBid.
    // Their effective ceiling = max(getBotCeiling, currentBid) so they can't
    // be outbid by a bot whose ceiling is below currentBid.
    const entries = [];

    if (leader === "user") {
      entries.push({ id: "user", ceiling: currentBid });
    } else if (leader) {
      const leadBot = bots.find(b => b.id === leader);
      if (leadBot) {
        entries.push({ id: leader, ceiling: Math.max(getBotCeiling(leadBot, team), currentBid) });
      }
    }

    // Non-leaders only enter if they can actually outbid the current price.
    bots.forEach(bot => {
      if (bot.id === leader) return;
      const c = getBotCeiling(bot, team);
      if (c > currentBid) entries.push({ id: bot.id, ceiling: c });
    });

    if (entries.length === 0) {
      // Leader holds at currentBid; no one else can outbid.
      if (currentBid > 0 && leader) {
        dispatch({ type: "RESOLVE_LOT", winner: leader, price: currentBid });
      } else {
        dispatch({ type: "RESOLVE_LOT", winner: null, price: 0 });
      }
      return;
    }

    entries.sort((a, b) => b.ceiling - a.ceiling);
    const winner = entries[0];
    const secondCeiling = entries[1]?.ceiling ?? 0;
    // Price = just above second place, capped at winner's ceiling, never below currentBid.
    const price = Math.floor(Math.min(winner.ceiling, Math.max(currentBid, secondCeiling + 1)));

    // When Vickrey bumps price above the last visible bid, add a synthetic log
    // entry so generateCSV's isWinning check (result.price === entry.amount) works.
    const logEntry = price > currentBid
      ? { team, bidder: winner.id, amount: price, ts: Date.now() }
      : null;
    dispatch({ type: "RESOLVE_LOT", winner: winner.id, price, logEntry });
  }, [state]);

  return { state, startAuction, placeBid, togglePause, pauseAuction, resumeAuction, resolveNow };
}
