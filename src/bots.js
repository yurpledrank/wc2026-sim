import { ALL_TEAMS, GROUPS } from "./constants";
import { getProjectionBaseEV } from "./projectionSets";

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller — standard normal variate from seeded RNG
function boxMuller(rng) {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Fisher-Yates shuffle using seeded RNG
function seededShuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Roster ────────────────────────────────────────────────────────────────────
const RANDOM_PERSONALITIES = ["ev_chaser", "homer", "contrarian", "budget_manager"];

const ROSTER = [
  { name: "Gibson + JC", personality: null },
  { name: "Penney",      personality: "ev_chaser" },
  { name: "Mike + Pat",  personality: null },
  { name: "Scott",       personality: "ev_chaser" },
  { name: "Weems",       personality: null },
  { name: "Dave",        personality: null },
  { name: "Paul",        personality: null },
  { name: "Guido",       personality: null },
];

// ── Personality assignment ────────────────────────────────────────────────────
// Distribution: 10% → 3 naive, 50% → 4 naive, 40% → 5 naive (of 6 flexible slots)
function assignPersonalities(masterRng) {
  const flexible = ["Gibson + JC", "Mike + Pat", "Weems", "Dave", "Paul", "Guido"];
  const shuffled = seededShuffle(flexible, masterRng);
  const roll = masterRng();
  const naiveCount = roll < 0.10 ? 3 : roll < 0.60 ? 4 : 5;
  const assignment = {};
  shuffled.forEach((name, i) => {
    if (i < naiveCount) {
      assignment[name] = "naive";
    } else {
      assignment[name] = RANDOM_PERSONALITIES[
        Math.floor(masterRng() * RANDOM_PERSONALITIES.length)
      ];
    }
  });
  return assignment;
}

// ── Room composition profiles ─────────────────────────────────────────────────
// Drawn once at auction start; obscured from user.
// potCenter drives all bot pot estimates; naiveBudgetBase replaces the fixed $550.
export const ROOM_PROFILES = [
  { name: "tight",  weight: 0.15, potCenter: 3500, naiveBudgetBase: 385 },
  { name: "normal", weight: 0.45, potCenter: 5000, naiveBudgetBase: 550 },
  { name: "loose",  weight: 0.28, potCenter: 6500, naiveBudgetBase: 715 },
  { name: "big",    weight: 0.12, potCenter: 8500, naiveBudgetBase: 935 },
];

export function drawRoomProfile(rng) {
  const r = rng();
  let cum = 0;
  for (const p of ROOM_PROFILES) {
    cum += p.weight;
    if (r < cum) return p;
  }
  return ROOM_PROFILES[1];
}

// ── Projection set assignment ─────────────────────────────────────────────────
function assignProjectionSet(name, personality, rng) {
  if (personality === "naive") {
    return rng() < 0.5 ? "sports_betting" : "bid_anchoring";
  }
  if (name === "Scott" || name === "Penney") {
    const opts = ["sim", "analyst", "elo"];
    return opts[Math.floor(rng() * opts.length)];
  }
  const opts = ["sim", "analyst", "elo", "sports_betting", "bid_anchoring"];
  return opts[Math.floor(rng() * opts.length)];
}

// ── Pot estimate update frequency ────────────────────────────────────────────
function drawUpdateFreq(rng, personality) {
  if (personality === "naive") {
    const opts = ["every2", "every4", "bap"];
    return opts[Math.floor(rng() * opts.length)];
  }
  const opts = ["every", "every2", "every4", "bap"];
  return opts[Math.floor(rng() * opts.length)];
}

// ── Bot creation ──────────────────────────────────────────────────────────────
export function createBots(masterSeed, evData, userPotTarget, teamsData) {
  const masterRng = mulberry32(masterSeed);
  // Room profile drawn first — sets the collective spending level for this auction.
  // userPotTarget remains the user's own EV reference; bots are independent of it.
  const roomProfile = drawRoomProfile(masterRng);
  const personalityMap = assignPersonalities(mulberry32(masterSeed + 13));

  // Seed-1 teams: highest champion probability per group — no per-team spending cap applies
  const seed1Teams = new Set();
  Object.values(GROUPS).forEach(groupTeams => {
    const best = [...groupTeams].sort(
      (a, b) => (teamsData[b]?.advancement?.champion ?? 0) - (teamsData[a]?.advancement?.champion ?? 0)
    )[0];
    if (best) seed1Teams.add(best);
  });

  const bots = ROSTER.map((slot, i) => {
    const botSeed = Math.floor(masterRng() * 1_000_000) + i * 7919;
    const rng = mulberry32(botSeed);

    const personality = slot.personality ?? personalityMap[slot.name];
    const name = slot.name;

    // ── Pot estimate (independent of userPotTarget — drawn from room profile) ──
    let potEstimate;
    if (name === "Penney") {
      // Penney has a tight prior centered on the room; small ±8% noise
      const noise = 1 + boxMuller(rng) * 0.08;
      potEstimate = Math.round(roomProfile.potCenter * Math.max(0.7, noise) / 500) * 500;
    } else {
      const sigma = roomProfile.potCenter * 0.25;
      const raw   = roomProfile.potCenter + boxMuller(rng) * sigma;
      const lo    = Math.max(1500, roomProfile.potCenter * 0.40);
      const hi    = Math.min(roomProfile.potCenter * 1.60, 12000);
      potEstimate = Math.round(Math.max(lo, Math.min(hi, raw)) / 500) * 500;
    }

    // ── Budget ──────────────────────────────────────────────────────────────
    let budget;
    if (name === "Scott" || name === "Penney" || name === "Weems") {
      const pct = 0.12 + rng() * 0.03;          // 12–15% of pot estimate
      budget = Math.round(potEstimate * pct / 50) * 50;
    } else if (personality === "naive") {
      // Scale with room — naive bots in a big room bring more money
      const base  = roomProfile.naiveBudgetBase;
      const sigma = base * 0.14;
      const raw   = base + boxMuller(rng) * sigma;
      budget = Math.round(Math.max(250, Math.min(base * 2.5, raw)) / 25) * 25;
    } else {
      budget = Math.round(potEstimate * (0.05 + rng() * 0.15) / 50) * 50;
    }

    // ── Other characteristics ────────────────────────────────────────────────
    const aggression     = 0.5 + rng() * 1.5;
    // Penney is a consistent ev_chaser — narrow bias so she stays near-EV rather
    // than rolling a low draw (0.75) that puts her below market in loose rooms.
    const projectionBias = name === "Penney"
      ? 0.90 + rng() * 0.20   // 0.90–1.10
      : 0.75 + rng() * 0.50;  // 0.75–1.25
    const responseMin      = 0.3 + rng() * 0.9;
    const responseMax      = responseMin + 0.6 + rng() * 2.2;
    const participationRate = personality === "naive"
      ? 0.45 + rng() * 0.35
      : 0.80 + rng() * 0.18;

    const projectionSet = assignProjectionSet(name, personality, rng);
    const updateFreq    = drawUpdateFreq(rng, personality);

    // Wave-1 spending fraction: how much of budget bots will spend before seed-1 teams arrive.
    // ev_chasers and budget_managers save more room; naive bots are less disciplined.
    const wave1SpendFraction = personality === "ev_chaser" ? 0.45
      : personality === "budget_manager" ? 0.50
      : personality === "contrarian" ? 0.65
      : 0.58; // naive

    // ── BAP thresholds ───────────────────────────────────────────────────────
    const bapThreshold1 = 0.25 + rng() * 0.41;                          // 25–66% of budget
    const bapThreshold2 = Math.min(0.95, bapThreshold1 + 0.05 + rng() * 0.35); // threshold1+5% to threshold1+40%, capped at 95%
    const overEVPct1    = 0.01 + rng() * 0.07;   // 1–8% over EV at BAP1
    const overEVPct2    = 0.01 + rng() * 0.07;   // 1–8% over EV at BAP2

    // ── Homer teams ──────────────────────────────────────────────────────────
    const homerCount = 2 + Math.floor(rng() * 3);
    const homerTeams = seededShuffle(ALL_TEAMS, rng).slice(0, homerCount);

    // ── Per-team target prices ───────────────────────────────────────────────
    const evScale = userPotTarget > 0 ? potEstimate / userPotTarget : 1;
    // Wide per-team noise creates genuine valuation disagreement across bots —
    // some teams get overbid (one bot is very high), others get value-bought (all are meh).
    const noiseRange = projectionSet === "bid_anchoring" ? 0.10 : 0.20;

    const targetPrices    = {};
    const openingFractions = {};
    const simEVs = {};

    ALL_TEAMS.forEach(team => {
      const apiEV      = evData[team]?.mean_earnings ?? 0;
      const simChampP  = teamsData?.[team]?.advancement?.champion ?? 0;
      const baseEV     = getProjectionBaseEV(
        team, projectionSet, apiEV, simChampP, potEstimate, userPotTarget
      );

      simEVs[team] = apiEV;

      // Per-team projection noise (seeded)
      const projNoise = 1 + (rng() * noiseRange * 2 - noiseRange);

      let multiplier = projectionBias;
      if (personality === "naive") {
        multiplier = Math.min(2.25, projectionBias * (0.3 + rng() * 2.0));
      } else if (personality === "homer" && homerTeams.includes(team)) {
        multiplier = projectionBias * (1.25 + rng() * 0.4);
      } else if (personality === "contrarian") {
        multiplier = projectionBias * (1.0 + rng() * 0.15);
      } else if (personality === "budget_manager") {
        const isPet = rng() < 0.12 && apiEV > 25;  // no pet-team premium on near-zero EV teams
        multiplier = isPet
          ? projectionBias * (1.2 + rng() * 0.3)
          : projectionBias * (0.95 + rng() * 0.1);
      }

      const rawTarget = Math.max(5, Math.round(baseEV * multiplier * projNoise));
      // Cap targets at 2.5× raw sim EV for all personalities — matches evHardCap at bid time.
      if (apiEV > 0) {
        targetPrices[team] = Math.min(rawTarget, Math.round(apiEV * 2.5));
      } else {
        targetPrices[team] = rawTarget;
      }
      openingFractions[team] = 0.20 + rng() * 0.35;
    });

    // Top-4 most-coveted teams: budget constraints are waived for these.
    // Ceiling becomes target × 1.05 — the only limit is whether the price makes sense.
    const topTeams = Object.entries(targetPrices)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([t]) => t);

    return {
      id: `bot_${i}`,
      name,
      personality,
      projectionSet,
      budget,
      aggression,
      projectionBias,
      responseMin,
      responseMax,
      participationRate,
      homerTeams,
      targetPrices,
      openingFractions,
      topTeams,
      // pot estimate tracking
      potEstimate,
      initialPotEstimate: potEstimate,
      potEstimateScale: 1.0,
      updateFreq,
      // BAP
      bapThreshold1,
      bapThreshold2,
      overEVPct1,
      overEVPct2,
      bap1Active: false,
      bap2Active: false,
      bap1Underspent: null,
      bap2Underspent: null,
      simEVs,
      wave1SpendFraction,
      // mutable auction state
      spent: 0,
      portfolio: {},
      cooldownLots: 0,
      teamsAuctioned: 0,
      seed1Teams: [...seed1Teams],
    };
  });

  return { bots, roomProfile };
}

// ── Bid helpers ───────────────────────────────────────────────────────────────
function calcIncrement(currentBid, target) {
  if (target <= 0) return currentBid < 100 ? 5 : currentBid < 400 ? 10 : 25;
  const gap = Math.max(0, target - currentBid);
  const gapFrac = gap / target;
  if (gapFrac > 0.50) return Math.max(25, Math.floor(gap * 0.15 / 25) * 25);
  if (gapFrac > 0.25) return Math.max(10, Math.floor(gap * 0.10 / 10) * 10);
  if (gapFrac > 0.10) return Math.max(5, Math.floor(gap * 0.08 / 5) * 5);
  return 5;
}

function roundToCleanNumber(value) {
  if (value >= 500) return Math.round(value / 100) * 100;
  if (value >= 100) return Math.round(value / 25) * 25;
  if (value >= 25)  return Math.round(value / 10) * 10;
  return Math.round(value / 5) * 5;
}

// ── getBotBid ─────────────────────────────────────────────────────────────────
export function getBotBid(bot, currentBid, team, queueIdx = 0, queueLength = 48) {
  const targetRaw = bot.targetPrices[team] ?? 0;
  const target = Math.round(targetRaw * bot.potEstimateScale);
  if (target <= 0) return null;

  // Top-4 coveted teams: budget is no constraint — only limit is EV + 5%.
  // Bypasses BAP, wave-1 brake, budget checks, and contrarian restrictions.
  const isTopTeam = bot.topTeams?.includes(team) ?? false;

  // Contrarian never opens — skip for top teams
  if (!isTopTeam && bot.personality === "contrarian" && currentBid === 0) return null;

  // Post-win cooldown: -75% / -50% / -25% for next 3 lots
  const cooldown = bot.cooldownLots ?? 0;
  const cooldownMult = cooldown >= 3 ? 0.25 : cooldown === 2 ? 0.50 : cooldown === 1 ? 0.75 : 1.0;

  // Two-team minimum: if < 2 teams won with ≤ 20 lots left, get more aggressive
  const teamsWon = Object.keys(bot.portfolio).length;
  const teamsRemaining = queueLength - queueIdx;
  const needsTeams = teamsWon < 2 && teamsRemaining <= 20;

  const baseRate = needsTeams
    ? Math.max(0.85, bot.participationRate)
    : bot.participationRate;

  const isSeed1 = bot.seed1Teams.includes(team);
  const isNaive = bot.personality === "naive";

  // Opening bid: always participate so every lot has at least one bot bid.
  // Contrarians already returned null above — all others open unconditionally.
  const isOpening = currentBid === 0;
  const forcedParticipant = isTopTeam || (isSeed1 && !isNaive) || isOpening;
  if (!forcedParticipant && Math.random() > baseRate * cooldownMult) return null;

  // ev_chaser: deprioritize low-EV teams (skip for top teams — these ARE the coveted ones)
  if (!isTopTeam && bot.personality === "ev_chaser") {
    const scaledEV = (bot.simEVs?.[team] ?? 0) * bot.potEstimateScale;
    if (scaledEV < bot.budget * 0.33 && Math.random() > 0.20) return null;
  }

  // Hard cap against raw sim EV (applies to all paths)
  const rawSimEV  = bot.simEVs?.[team] ?? 0;
  const evHardCap = rawSimEV > 0 ? Math.round(rawSimEV * 2.5) : Infinity;

  let effectiveCeiling;
  let budgetAvail;

  if (isTopTeam) {
    // No BAP, no budget cap, no wave-1 brake — EV estimate ± 5% is the only limit.
    // Cap target at simEV × 1.25 before applying the premium so noisy naive-bot
    // projections can't push top-team prices far above the market EV.
    const simEVscaled = (bot.simEVs?.[team] ?? 0) * bot.potEstimateScale;
    const cappedTarget = simEVscaled > 0 ? Math.min(target, Math.round(simEVscaled * 1.25)) : target;
    effectiveCeiling = Math.round(cappedTarget * 1.05);
    budgetAvail = Infinity;
  } else {
    // Determine active BAP state (BAP2 takes precedence over BAP1)
    const bap2On = bot.bap2Active;
    const bap1On = bot.bap1Active && !bap2On;
    const activeUnderspent = bap2On ? bot.bap2Underspent : (bap1On ? bot.bap1Underspent : null);
    const activeOverEV     = bap2On ? bot.overEVPct2 : bot.overEVPct1;

    // Contrarian hard ceiling
    if (bot.personality === "contrarian" && currentBid >= target * 0.72) return null;

    // BAP ceiling — how high this bot will go
    if (activeUnderspent === false) {
      if (currentBid >= target * 0.93) return null;
      effectiveCeiling = target;
    } else if (activeUnderspent === true) {
      effectiveCeiling = Math.round(target * (1 + activeOverEV));
    } else {
      effectiveCeiling = target;
    }

    // Two-team minimum: willing to pay up to 20% above normal ceiling
    if (needsTeams) effectiveCeiling = Math.round(effectiveCeiling * 1.20);

    // Wave-1 spending brake (skip when two-team minimum is active)
    if (!needsTeams && (bot.teamsAuctioned ?? 0) < 24 && bot.spent > (bot.wave1SpendFraction ?? 0.65) * bot.budget) {
      effectiveCeiling = Math.floor(effectiveCeiling * 0.75);
    }

    // Budget — 20% overage on clear value; seed-1 teams get 50% overage for sophisticated bots
    const clearValue = currentBid < target * 0.93;
    const budgetCap  = clearValue && isSeed1 && !isNaive ? 1.50 : clearValue ? 1.20 : 1.0;
    budgetAvail = Math.max(0, bot.budget * budgetCap - bot.spent);
    if (budgetAvail < 10) return null;
  }

  if (currentBid >= effectiveCeiling) return null;

  // $1-2 trickle bids only within min(20% of target, $30) of the bot's ceiling.
  // Beyond that threshold use calcIncrement ($5-50 range) for faster price discovery.
  const simEV = (bot.simEVs?.[team] ?? 0) * bot.potEstimateScale;
  const gap = Math.max(0, target - currentBid);
  const nearEV = target > 0 && gap <= Math.min(target * 0.20, 30);

  let newBid;
  if (currentBid === 0) {
    const fraction = bot.openingFractions[team] ?? 0.30;
    newBid = roundToCleanNumber(Math.round(target * fraction));
    if (simEV > 0) newBid = Math.min(newBid, Math.floor(simEV * 0.80));
    newBid = Math.max(5, newBid);
  } else if (nearEV) {
    newBid = currentBid + (Math.random() < 0.5 ? 1 : 2);
  } else {
    newBid = currentBid + calcIncrement(currentBid, target);
  }

  const ceiling = Math.floor(Math.min(effectiveCeiling, budgetAvail, evHardCap));
  if (newBid > ceiling) newBid = ceiling;
  if (newBid <= currentBid) return null;

  return Math.floor(newBid);
}

// Deterministic ceiling — max a bot will pay for a team (no participation randomness)
export function getBotCeiling(bot, team) {
  const targetRaw = bot.targetPrices[team] ?? 0;
  const target = Math.round(targetRaw * bot.potEstimateScale);
  if (target <= 0) return 0;

  const isNaive = bot.personality === "naive";
  const isSeed1 = bot.seed1Teams?.includes(team) ?? false;
  const isTopTeam = bot.topTeams?.includes(team) ?? false;

  const rawSimEV = bot.simEVs?.[team] ?? 0;
  const evHardCap = rawSimEV > 0 ? Math.round(rawSimEV * 2.5) : Infinity;

  // Top-4 coveted teams: no budget constraint, ceiling is EV × 1.25 × 1.05
  if (isTopTeam) {
    const simEVscaled = (bot.simEVs?.[team] ?? 0) * bot.potEstimateScale;
    const cappedTarget = simEVscaled > 0 ? Math.min(target, Math.round(simEVscaled * 1.25)) : target;
    return Math.floor(Math.min(Math.round(cappedTarget * 1.05), evHardCap));
  }

  const bap2On = bot.bap2Active;
  const bap1On = bot.bap1Active && !bap2On;
  const activeUnderspent = bap2On ? bot.bap2Underspent : (bap1On ? bot.bap1Underspent : null);
  const activeOverEV     = bap2On ? bot.overEVPct2 : bot.overEVPct1;

  if (bot.personality === "contrarian") {
    const budgetCeiling = Math.max(0, bot.budget * 1.20 - bot.spent);
    return Math.min(Math.floor(target * 0.72), budgetCeiling, evHardCap);
  }

  let effectiveCeiling;
  if (activeUnderspent === false) {
    effectiveCeiling = Math.floor(target * 0.93);
  } else if (activeUnderspent === true) {
    effectiveCeiling = Math.round(target * (1 + activeOverEV));
  } else {
    effectiveCeiling = target;
  }

  // Wave-1 spending brake: hold back budget for seed-1 (wave 2) teams
  if ((bot.teamsAuctioned ?? 0) < 24 && bot.spent > (bot.wave1SpendFraction ?? 0.65) * bot.budget) {
    effectiveCeiling = Math.floor(effectiveCeiling * 0.75);
  }

  // Seed-1 teams get the same 1.5× budget overage as in getBotBid
  const budgetMult = isSeed1 && !isNaive ? 1.50 : 1.20;
  const budgetCeiling = Math.max(0, bot.budget * budgetMult - bot.spent);
  return Math.floor(Math.min(effectiveCeiling, budgetCeiling, evHardCap));
}

// Response delay in ms — urgency multiplier compresses timing near the hammer
export function getBotDelay(bot, phase) {
  const urgency =
    phase === "going-twice" ? 0.25
    : phase === "going-once" ? 0.45
    : 1.0;
  const base = bot.responseMin + Math.random() * (bot.responseMax - bot.responseMin);
  return Math.round(base * urgency * 1000);
}
