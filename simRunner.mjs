#!/usr/bin/env node
/**
 * simRunner.mjs — Standalone WC2026 Calcutta auction simulator
 *
 * Usage:
 *   node simRunner.mjs [N_SIMS] [POT_TARGET] [MASTER_SEED]
 *   node simRunner.mjs 100 5000 42
 *   node simRunner.mjs 1000 5000 42 --quiet     (suppress per-sim lines)
 *   node simRunner.mjs 50 5000 42 --ev-check    (verify EV sums via API — slow)
 *
 * Replaces the human player with a Penney-style "JS" bot (ev_chaser, fixed $5k estimate).
 * Uses Vickrey resolution (each team: everyone reveals ceiling, winner pays just above 2nd).
 * This matches the React app's resolveNow() logic — useful for diagnosing that path.
 */

import { createInterface } from 'node:readline';

const N_SIMS      = parseInt(process.argv[2] ?? '100');
const POT_TARGET  = parseInt(process.argv[3] ?? '5000');
const MASTER_SEED = parseInt(process.argv[4] ?? '42');
const QUIET       = process.argv.includes('--quiet');
const EV_CHECK    = process.argv.includes('--ev-check');

const API_BASE = 'http://127.0.0.1:8000';

// ── Constants (from src/constants.js) ─────────────────────────────────────────
const GROUPS = {
  A: ["MEX","RSA","KOR","CZE"], B: ["CAN","BIH","QAT","SUI"],
  C: ["BRA","MAR","SCO","HAI"], D: ["USA","PAR","AUS","TUR"],
  E: ["GER","ECU","CIV","CUW"], F: ["NED","JPN","SWE","TUN"],
  G: ["BEL","EGY","IRN","NZL"], H: ["ESP","URU","KSA","CPV"],
  I: ["FRA","NOR","SEN","IRQ"], J: ["ARG","AUT","ALG","JOR"],
  K: ["POR","COL","COD","UZB"], L: ["ENG","CRO","PAN","GHA"],
};
const GROUP_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"];
const ALL_TEAMS = GROUP_LETTERS.flatMap(l => GROUPS[l]);

// ── Projection data (from src/projectionData.js) ──────────────────────────────
const ANALYST_ADV = {
  ESP:{r32:0.9859,r16:0.7243,qf:0.5175,sf:0.3883,final:0.2548,champion:0.1612},
  FRA:{r32:0.9525,r16:0.6995,qf:0.4771,sf:0.3295,final:0.2070,champion:0.1267},
  ENG:{r32:0.9603,r16:0.6946,qf:0.4788,sf:0.3068,final:0.1921,champion:0.1134},
  ARG:{r32:0.9681,r16:0.6316,qf:0.4529,sf:0.3048,final:0.1805,champion:0.1034},
  POR:{r32:0.9498,r16:0.6242,qf:0.3977,sf:0.2386,final:0.1312,champion:0.0690},
  BRA:{r32:0.9689,r16:0.6244,qf:0.3858,sf:0.2215,final:0.1238,champion:0.0647},
  GER:{r32:0.9638,r16:0.6209,qf:0.3348,sf:0.2059,final:0.1140,champion:0.0569},
  NED:{r32:0.8886,r16:0.4886,qf:0.3027,sf:0.1554,final:0.0793,champion:0.0385},
  NOR:{r32:0.8271,r16:0.4920,qf:0.2720,sf:0.1453,final:0.0736,champion:0.0324},
  BEL:{r32:0.8988,r16:0.5452,qf:0.2860,sf:0.1241,final:0.0559,champion:0.0235},
  COL:{r32:0.8492,r16:0.4454,qf:0.2241,sf:0.1139,final:0.0500,champion:0.0224},
  MAR:{r32:0.8902,r16:0.4544,qf:0.2360,sf:0.1049,final:0.0443,champion:0.0192},
  URU:{r32:0.8384,r16:0.3906,qf:0.2038,sf:0.0992,final:0.0440,champion:0.0163},
  SUI:{r32:0.8568,r16:0.5034,qf:0.2328,sf:0.0966,final:0.0390,champion:0.0149},
  CRO:{r32:0.7718,r16:0.3927,qf:0.1846,sf:0.0917,final:0.0380,champion:0.0149},
  ECU:{r32:0.8738,r16:0.4314,qf:0.1898,sf:0.0893,final:0.0362,champion:0.0140},
  USA:{r32:0.7649,r16:0.4153,qf:0.1934,sf:0.0806,final:0.0348,champion:0.0134},
  JPN:{r32:0.7620,r16:0.3369,qf:0.1731,sf:0.0773,final:0.0338,champion:0.0131},
  SEN:{r32:0.6158,r16:0.2976,qf:0.1386,sf:0.0581,final:0.0230,champion:0.0096},
  MEX:{r32:0.8759,r16:0.5212,qf:0.2373,sf:0.0800,final:0.0281,champion:0.0094},
  TUR:{r32:0.7338,r16:0.3856,qf:0.1695,sf:0.0669,final:0.0258,champion:0.0092},
  SWE:{r32:0.6296,r16:0.2353,qf:0.1032,sf:0.0423,final:0.0153,champion:0.0056},
  AUT:{r32:0.6800,r16:0.2435,qf:0.1072,sf:0.0452,final:0.0169,champion:0.0050},
  CAN:{r32:0.7926,r16:0.4345,qf:0.1862,sf:0.0568,final:0.0159,champion:0.0044},
  KOR:{r32:0.6978,r16:0.3372,qf:0.1269,sf:0.0414,final:0.0134,champion:0.0042},
  PAR:{r32:0.6379,r16:0.2938,qf:0.1172,sf:0.0435,final:0.0152,champion:0.0041},
  AUS:{r32:0.5885,r16:0.2616,qf:0.1003,sf:0.0362,final:0.0114,champion:0.0036},
  EGY:{r32:0.6860,r16:0.3067,qf:0.1122,sf:0.0381,final:0.0118,champion:0.0032},
  BIH:{r32:0.6282,r16:0.2850,qf:0.1088,sf:0.0320,final:0.0094,champion:0.0027},
  ALG:{r32:0.5673,r16:0.1851,qf:0.0752,sf:0.0274,final:0.0085,champion:0.0027},
  IRN:{r32:0.6436,r16:0.2724,qf:0.0955,sf:0.0310,final:0.0086,champion:0.0024},
  CZE:{r32:0.6349,r16:0.2827,qf:0.0984,sf:0.0286,final:0.0089,champion:0.0022},
  SCO:{r32:0.6643,r16:0.2377,qf:0.0861,sf:0.0280,final:0.0080,champion:0.0022},
  CIV:{r32:0.6405,r16:0.2343,qf:0.0774,sf:0.0234,final:0.0069,champion:0.0020},
  GHA:{r32:0.4991,r16:0.1828,qf:0.0664,sf:0.0236,final:0.0080,champion:0.0019},
  TUN:{r32:0.4331,r16:0.1224,qf:0.0414,sf:0.0129,final:0.0039,champion:0.0009},
  UZB:{r32:0.4121,r16:0.1215,qf:0.0361,sf:0.0114,final:0.0028,champion:0.0009},
  PAN:{r32:0.3996,r16:0.1282,qf:0.0408,sf:0.0125,final:0.0034,champion:0.0009},
  RSA:{r32:0.4915,r16:0.1892,qf:0.0578,sf:0.0147,final:0.0044,champion:0.0008},
  COD:{r32:0.4230,r16:0.1265,qf:0.0381,sf:0.0112,final:0.0035,champion:0.0008},
  JOR:{r32:0.4044,r16:0.1125,qf:0.0372,sf:0.0101,final:0.0026,champion:0.0007},
  IRQ:{r32:0.2727,r16:0.0939,qf:0.0313,sf:0.0094,final:0.0028,champion:0.0006},
  QAT:{r32:0.4332,r16:0.1562,qf:0.0483,sf:0.0106,final:0.0026,champion:0.0005},
  KSA:{r32:0.3982,r16:0.1174,qf:0.0370,sf:0.0107,final:0.0026,champion:0.0005},
  NZL:{r32:0.4724,r16:0.1642,qf:0.0444,sf:0.0119,final:0.0025,champion:0.0004},
  CPV:{r32:0.3314,r16:0.0906,qf:0.0257,sf:0.0063,final:0.0014,champion:0.0004},
  HAI:{r32:0.1543,r16:0.0270,qf:0.0046,sf:0.0007,final:0.0001,champion:0.0000},
  CUW:{r32:0.1874,r16:0.0380,qf:0.0077,sf:0.0014,final:0.0002,champion:0.0000},
};
const ELO_RATINGS = {
  ESP:2165,ARG:2113,FRA:2081,ENG:2020,BRA:1984,POR:1984,
  COL:1975,NED:1961,ECU:1933,CRO:1930,GER:1923,NOR:1912,
  JPN:1904,TUR:1902,URU:1892,SUI:1889,SEN:1878,BEL:1867,
  MEX:1860,PAR:1833,AUT:1827,MAR:1822,CAN:1784,AUS:1783,
  SCO:1767,IRN:1760,KOR:1752,ALG:1743,PAN:1737,UZB:1727,
  CZE:1726,USA:1721,SWE:1719,EGY:1699,JOR:1690,CIV:1676,
  COD:1655,TUN:1636,IRQ:1607,BIH:1594,NZL:1585,KSA:1568,
  CPV:1549,HAI:1532,RSA:1524,GHA:1503,CUW:1436,QAT:1423,
};
const BETTING_ODDS_AMERICAN = {
  ESP:475,FRA:525,ENG:625,BRA:800,ARG:825,POR:1100,GER:1400,NED:2000,
  NOR:2900,BEL:3500,COL:4000,JPN:5000,MAR:5500,USA:6250,URU:6500,MEX:7250,
  SWE:8000,TUR:8250,ECU:8500,CRO:8500,SUI:9000,SEN:10000,AUT:10000,
  PAR:12000,CAN:12500,AUS:13000,SCO:14000,IRN:15000,KOR:16000,ALG:17000,
  PAN:18000,UZB:20000,CZE:20000,EGY:25000,JOR:27500,CIV:30000,COD:35000,
  TUN:40000,IRQ:50000,BIH:55000,NZL:60000,KSA:70000,CPV:80000,
  HAI:100000,RSA:100000,GHA:125000,CUW:175000,QAT:200000,
};

// Pre-compute champion probability proxies for projection sets
const _eloStr = {}, _betProb = {};
let _totalElo = 0, _totalBet = 0;
for (const [t, elo] of Object.entries(ELO_RATINGS)) { _eloStr[t] = Math.pow(10, elo/400); _totalElo += _eloStr[t]; }
const ELO_CHAMP_PROB = Object.fromEntries(Object.entries(_eloStr).map(([t, s]) => [t, s / _totalElo]));
for (const [t, odds] of Object.entries(BETTING_ODDS_AMERICAN)) { _betProb[t] = 100 / (odds + 100); _totalBet += _betProb[t]; }
const BETTING_CHAMP_PROB = Object.fromEntries(Object.entries(_betProb).map(([t, p]) => [t, p / _totalBet]));

const RATIO_MIN = 0.05, RATIO_MAX = 1.25;
function champRatio(methodProb, simChampProb) {
  return Math.max(RATIO_MIN, Math.min(RATIO_MAX, Math.max(1e-6, methodProb) / Math.max(1e-6, simChampProb)));
}
function getProjectionBaseEV(team, projSet, apiEV, simChampProb, initialPotEstimate, userPotTarget) {
  const evScale = userPotTarget > 0 ? initialPotEstimate / userPotTarget : 1;
  if (projSet === "sim") return apiEV * evScale;
  if (projSet === "analyst") return apiEV * evScale * champRatio(ANALYST_ADV[team]?.champion ?? 0, simChampProb);
  if (projSet === "elo")     return apiEV * evScale * champRatio(ELO_CHAMP_PROB[team] ?? (1/48), simChampProb);
  if (projSet === "sports_betting") return apiEV * evScale * champRatio(BETTING_CHAMP_PROB[team] ?? (1/48), simChampProb);
  if (projSet === "bid_anchoring") return (BETTING_CHAMP_PROB[team] ?? (1/48)) * initialPotEstimate;
  return apiEV * evScale;
}

// ── PRNG ───────────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function boxMuller(rng) {
  const u1 = Math.max(1e-10, rng()), u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function seededShuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ── Room composition profiles ─────────────────────────────────────────────────
const ROOM_PROFILES = [
  { name: "tight",  weight: 0.15, potCenter: 3500, naiveBudgetBase: 385 },
  { name: "normal", weight: 0.45, potCenter: 5000, naiveBudgetBase: 550 },
  { name: "loose",  weight: 0.28, potCenter: 6500, naiveBudgetBase: 715 },
  { name: "big",    weight: 0.12, potCenter: 8500, naiveBudgetBase: 935 },
];
function drawRoomProfile(rng) {
  const r = rng();
  let cum = 0;
  for (const p of ROOM_PROFILES) {
    cum += p.weight;
    if (r < cum) return p;
  }
  return ROOM_PROFILES[1];
}

// ── Personality / projection set / update frequency ──────────────────────────
const RANDOM_PERSONALITIES = ["ev_chaser","homer","contrarian","budget_manager"];
function assignPersonalities(masterRng) {
  const flexible = ["Gibson + JC","Mike + Pat","Weems","Dave","Paul","Guido"];
  const shuffled = seededShuffle(flexible, masterRng);
  const roll = masterRng();
  const naiveCount = roll < 0.10 ? 3 : roll < 0.60 ? 4 : 5;
  const assignment = {};
  shuffled.forEach((name, i) => {
    assignment[name] = i < naiveCount ? "naive" : RANDOM_PERSONALITIES[Math.floor(masterRng() * RANDOM_PERSONALITIES.length)];
  });
  return assignment;
}
function assignProjectionSet(name, personality, rng) {
  if (personality === "naive") return rng() < 0.5 ? "sports_betting" : "bid_anchoring";
  if (name === "Scott" || name === "Penney") return ["sim","analyst","elo"][Math.floor(rng() * 3)];
  return ["sim","analyst","elo","sports_betting","bid_anchoring"][Math.floor(rng() * 5)];
}
function drawUpdateFreq(rng, personality) {
  if (personality === "naive") return ["every2","every4","bap"][Math.floor(rng() * 3)];
  return ["every","every2","every4","bap"][Math.floor(rng() * 4)];
}

// ── Roster (8 bots + JS user bot) ────────────────────────────────────────────
const ROSTER = [
  { name: "Gibson + JC", personality: null },
  { name: "Penney",      personality: "ev_chaser" },
  { name: "Mike + Pat",  personality: null },
  { name: "Scott",       personality: "ev_chaser" },
  { name: "Weems",       personality: null },
  { name: "Dave",        personality: null },
  { name: "Paul",        personality: null },
  { name: "Guido",       personality: null },
  { name: "JS",          personality: "ev_chaser", isUser: true },
];

// ── Bot creation ───────────────────────────────────────────────────────────────
function createBots(masterSeed, evData, userPotTarget, teamsData) {
  const masterRng = mulberry32(masterSeed);
  const roomProfile = drawRoomProfile(masterRng);
  const personalityMap = assignPersonalities(mulberry32(masterSeed + 13));

  const seed1Teams = new Set();
  Object.values(GROUPS).forEach(gt => {
    const best = [...gt].sort((a, b) => (teamsData[b]?.advancement?.champion ?? 0) - (teamsData[a]?.advancement?.champion ?? 0))[0];
    if (best) seed1Teams.add(best);
  });

  const bots = ROSTER.map((slot, i) => {
    const botSeed = Math.floor(masterRng() * 1_000_000) + i * 7919;
    const rng = mulberry32(botSeed);
    const personality = slot.personality ?? personalityMap[slot.name];
    const name = slot.name;
    const isUser = slot.isUser ?? false;

    // Pot estimate (drawn from room profile, independent of userPotTarget)
    let potEstimate;
    if (isUser) {
      potEstimate = userPotTarget; // user's own reference stays as-is
    } else if (name === "Penney") {
      const noise = 1 + boxMuller(rng) * 0.08;
      potEstimate = Math.round(roomProfile.potCenter * Math.max(0.7, noise) / 500) * 500;
    } else {
      const sigma = roomProfile.potCenter * 0.25;
      const raw   = roomProfile.potCenter + boxMuller(rng) * sigma;
      const lo    = Math.max(1500, roomProfile.potCenter * 0.40);
      const hi    = Math.min(roomProfile.potCenter * 1.60, 12000);
      potEstimate = Math.round(Math.max(lo, Math.min(hi, raw)) / 500) * 500;
    }

    // Budget
    let budget;
    if (name === "Scott" || name === "Penney" || name === "Weems" || isUser) {
      const pct = 0.12 + rng() * 0.03;
      budget = Math.round(potEstimate * pct / 50) * 50;
    } else if (personality === "naive") {
      const base  = roomProfile.naiveBudgetBase;
      const sigma = base * 0.14;
      const raw   = base + boxMuller(rng) * sigma;
      budget = Math.round(Math.max(250, Math.min(base * 2.5, raw)) / 25) * 25;
    } else {
      budget = Math.round(potEstimate * (0.05 + rng() * 0.15) / 50) * 50;
    }

    const aggression     = 0.5 + rng() * 1.5;
    const projectionBias = name === "Penney"
      ? 0.90 + rng() * 0.20   // 0.90–1.10: keeps Penney near-EV in any room
      : 0.75 + rng() * 0.50;  // 0.75–1.25
    const responseMin      = 0.3 + rng() * 0.9;
    const responseMax      = responseMin + 0.6 + rng() * 2.2;
    const participationRate = personality === "naive" ? 0.45 + rng() * 0.35 : 0.80 + rng() * 0.18;
    const projectionSet    = isUser ? "sim" : assignProjectionSet(name, personality, rng);
    const updateFreq       = drawUpdateFreq(rng, personality);

    const wave1SpendFraction = personality === "ev_chaser" ? 0.45
      : personality === "budget_manager" ? 0.50
      : personality === "contrarian" ? 0.65
      : 0.58; // naive

    const bapThreshold1 = 0.25 + rng() * 0.41;
    const bapThreshold2 = Math.min(0.95, bapThreshold1 + 0.05 + rng() * 0.35);
    const overEVPct1    = 0.01 + rng() * 0.07;
    const overEVPct2    = 0.01 + rng() * 0.07;

    const homerCount = 2 + Math.floor(rng() * 3);
    const homerTeams = seededShuffle(ALL_TEAMS, rng).slice(0, homerCount);

    const evScale    = userPotTarget > 0 ? potEstimate / userPotTarget : 1;
    const noiseRange = projectionSet === "bid_anchoring" ? 0.10 : 0.20;
    const targetPrices = {}, openingFractions = {}, simEVs = {};

    ALL_TEAMS.forEach(team => {
      const apiEV     = evData[team]?.mean_earnings ?? 0;
      const simChampP = teamsData?.[team]?.advancement?.champion ?? 0;
      const baseEV    = getProjectionBaseEV(team, projectionSet, apiEV, simChampP, potEstimate, userPotTarget);
      simEVs[team]    = apiEV;

      const projNoise = 1 + (rng() * noiseRange * 2 - noiseRange);
      let multiplier  = projectionBias;
      if (personality === "naive") {
        multiplier = Math.min(2.25, projectionBias * (0.3 + rng() * 2.0));
      } else if (personality === "homer" && homerTeams.includes(team)) {
        multiplier = projectionBias * (1.25 + rng() * 0.4);
      } else if (personality === "contrarian") {
        multiplier = projectionBias * (1.0 + rng() * 0.15);
      } else if (personality === "budget_manager") {
        const isPet = rng() < 0.12 && apiEV > 25;
        multiplier  = isPet ? projectionBias * (1.2 + rng() * 0.3) : projectionBias * (0.95 + rng() * 0.1);
      }

      const rawTarget = Math.max(5, Math.round(baseEV * multiplier * projNoise));
      if (apiEV > 0) {
        targetPrices[team] = Math.min(rawTarget, Math.round(apiEV * 2.5));
      } else {
        targetPrices[team] = rawTarget;
      }
      openingFractions[team] = 0.20 + rng() * 0.35;
    });

    const topTeams = Object.entries(targetPrices)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([t]) => t);

    return {
      id: `bot_${i}`, name, personality, projectionSet, budget, aggression,
      projectionBias, responseMin, responseMax, participationRate, homerTeams,
      targetPrices, openingFractions, simEVs, topTeams,
      potEstimate, initialPotEstimate: potEstimate, potEstimateScale: 1.0,
      updateFreq, bapThreshold1, bapThreshold2, overEVPct1, overEVPct2,
      bap1Active: false, bap2Active: false, bap1Underspent: null, bap2Underspent: null,
      wave1SpendFraction,
      spent: 0, portfolio: {}, cooldownLots: 0, teamsAuctioned: 0, seed1Teams: [...seed1Teams],
    };
  });

  return { bots, roomProfile };
}

// ── getBotCeiling — mirrors getBotBid logic for Vickrey resolution ────────────
function getBotCeiling(bot, team) {
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
  if (activeUnderspent === false)      effectiveCeiling = Math.floor(target * 0.93);
  else if (activeUnderspent === true)  effectiveCeiling = Math.round(target * (1 + activeOverEV));
  else                                 effectiveCeiling = target;

  // Wave-1 spending brake: hold back budget for seed-1 (wave 2) teams
  if ((bot.teamsAuctioned ?? 0) < 24 && bot.spent > (bot.wave1SpendFraction ?? 0.65) * bot.budget) {
    effectiveCeiling = Math.floor(effectiveCeiling * 0.75);
  }

  const budgetMult = isSeed1 && !isNaive ? 1.50 : 1.20;
  const budgetCeiling = Math.max(0, bot.budget * budgetMult - bot.spent);
  return Math.floor(Math.min(effectiveCeiling, budgetCeiling, evHardCap));
}

// ── Auction queue (wave1=seeds2&3, wave2=seed1, wave3=seed4) ──────────────────
function buildAuctionQueue(teamProfiles) {
  const seeds = {};
  GROUP_LETTERS.forEach(l => {
    seeds[l] = [...GROUPS[l]].sort(
      (a, b) => (teamProfiles[b]?.advancement?.champion ?? 0) - (teamProfiles[a]?.advancement?.champion ?? 0)
    );
  });
  const wave1 = GROUP_LETTERS.flatMap(l => [seeds[l][1], seeds[l][2]]);
  const wave2 = GROUP_LETTERS.map(l => seeds[l][0]);
  const wave3 = GROUP_LETTERS.map(l => seeds[l][3]);
  return [...wave1, ...wave2, ...wave3].filter(Boolean);
}

// ── Post-sale bot state update (mirrors useAuction ADVANCE) ──────────────────
function updateBotsAfterSale(bots, soldResults, winnerId, team, price) {
  const soldEntries = Object.values(soldResults).filter(r => r.winner);
  const soldCount   = soldEntries.length;
  const totalSold   = soldEntries.reduce((s, r) => s + r.price, 0);
  const impliedPot  = (totalSold / soldCount) * 48;

  return bots.map(bot => {
    let b = bot.id === winnerId
      ? { ...bot, cooldownLots: 3 }
      : { ...bot, cooldownLots: Math.max(0, (bot.cooldownLots ?? 0) - 1) };

    const spentFrac = b.budget > 0 ? b.spent / b.budget : 1;
    const wins = Object.keys(b.portfolio).length;
    let bapTriggered = false;
    if (!b.bap1Active && (spentFrac >= b.bapThreshold1 || wins >= 3)) {
      b = { ...b, bap1Active: true, bap1Underspent: (b.budget - b.spent) > b.budget * 0.4 };
      bapTriggered = true;
    }
    if (!b.bap2Active && (spentFrac >= b.bapThreshold2 || wins >= 6)) {
      b = { ...b, bap2Active: true, bap2Underspent: (b.budget - b.spent) > b.budget * 0.4 };
      bapTriggered = true;
    }

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
}

// ── Run one simulation (Vickrey / resolveNow resolution) ──────────────────────
function runSim(seed, teamProfiles, initialEVs, potTarget) {
  const queue = buildAuctionQueue(teamProfiles);
  const { bots: initialBots, roomProfile } = createBots(seed, initialEVs, potTarget, teamProfiles);
  let bots = initialBots;
  const soldResults = {};

  for (const team of queue) {
    const entries = bots
      .map(bot => ({ id: bot.id, name: bot.name, ceiling: getBotCeiling(bot, team) }))
      .filter(e => e.ceiling > 0)
      .sort((a, b) => b.ceiling - a.ceiling);

    if (entries.length === 0) {
      // Passed — tick cooldowns
      bots = bots.map(b => ({ ...b, cooldownLots: Math.max(0, (b.cooldownLots ?? 0) - 1) }));
      continue;
    }

    const winner = entries[0];
    const secondCeiling = entries[1]?.ceiling ?? 0;
    const price = Math.min(winner.ceiling, Math.max(1, secondCeiling + 1));

    soldResults[team] = { winner: winner.id, price };

    // Update winner's portfolio and spent
    bots = bots.map(b =>
      b.id === winner.id
        ? { ...b, portfolio: { ...b.portfolio, [team]: price }, spent: b.spent + price }
        : b
    );

    bots = updateBotsAfterSale(bots, soldResults, winner.id, team, price);
  }

  return { soldResults, bots, roomProfile };
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path, options) {
  const res = await fetch(API_BASE + path, options);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}
async function loadTeamProfiles() {
  const results = await Promise.all(
    ALL_TEAMS.map(t => apiFetch(`/teams/${t}/profile`).then(d => [t, d]))
  );
  return Object.fromEntries(results);
}
async function fetchEV(prices) {
  return apiFetch("/ev", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prices, default_price: 0 }),
  });
}

// ── Percentile helper ─────────────────────────────────────────────────────────
function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.floor((p / 100) * (s.length - 1));
  return s[i];
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nWC2026 Auction SimRunner — ${N_SIMS} sims | pot=$${POT_TARGET} | seed=${MASTER_SEED}`);
  console.log(`evHardCap: 2.5× simEV (all bots) | RATIO_MAX: ${RATIO_MAX} | noiseRange: ±${(0.20*100).toFixed(0)}%\n`);

  // Load team profiles
  process.stdout.write("Fetching team profiles...");
  const teamProfiles = await loadTeamProfiles();
  console.log("done");

  // Fetch initial EVs (all teams at potTarget/48)
  process.stdout.write("Fetching initial EVs...");
  const assumedPrice = POT_TARGET / ALL_TEAMS.length;
  const initPrices = Object.fromEntries(ALL_TEAMS.map(t => [t, assumedPrice]));
  const initEVData = await fetchEV(initPrices);
  const initEVMap = {};
  initEVData.teams.forEach(t => { initEVMap[t.team] = t; });
  const initSumEV = initEVData.teams.reduce((s, t) => s + t.mean_earnings, 0);
  console.log(`done  sumEV=$${initSumEV.toFixed(0)} (expect~$${POT_TARGET})`);

  // Per-sim accumulation
  const simPots     = [];
  const simNSold    = [];
  const teamPrices  = {}; // team → [prices across sims where sold]
  const botStats    = {}; // botId → { spentArr, teamsArr, evDeltaArr }
  const roomCounts  = {}; // room name → count
  ROOM_PROFILES.forEach(p => { roomCounts[p.name] = 0; });
  ALL_TEAMS.forEach(t => { teamPrices[t] = []; });

  let evErrorSum = 0, evErrorCount = 0;

  // RNG for sim seeds
  const masterRng = mulberry32(MASTER_SEED);

  for (let sim = 1; sim <= N_SIMS; sim++) {
    const simSeed = Math.floor(masterRng() * 1_000_000_000);
    const { soldResults, bots, roomProfile } = runSim(simSeed, teamProfiles, initEVMap, POT_TARGET);

    const soldEntries = Object.entries(soldResults).filter(([, r]) => r.winner);
    const totalPot = soldEntries.reduce((s, [, r]) => s + r.price, 0);
    const nSold    = soldEntries.length;

    simPots.push(totalPot);
    simNSold.push(nSold);
    roomCounts[roomProfile.name] = (roomCounts[roomProfile.name] ?? 0) + 1;
    soldEntries.forEach(([team, r]) => teamPrices[team].push(r.price));

    // EV check (optional — slow: one API call per sim)
    let evErr = null;
    if (EV_CHECK) {
      const unsoldPrice = nSold > 0
        ? (() => {
            const extrap = (totalPot / nSold) * 48;
            const estPot = (3 * POT_TARGET + nSold * extrap) / (3 + nSold);
            return Math.max(0, (estPot - totalPot) / Math.max(1, ALL_TEAMS.length - nSold));
          })()
        : POT_TARGET / ALL_TEAMS.length;
      const finalPrices = Object.fromEntries(ALL_TEAMS.map(t => {
        const r = soldResults[t];
        return [t, r?.winner ? r.price : unsoldPrice];
      }));
      const totalSent = Object.values(finalPrices).reduce((s, v) => s + v, 0);
      const evResp = await fetchEV(finalPrices);
      const sumEV  = evResp.teams.reduce((s, t) => s + t.mean_earnings, 0);
      evErr = sumEV - totalSent;
      evErrorSum += Math.abs(evErr);
      evErrorCount++;
    }

    // Bot stats
    bots.forEach(bot => {
      if (!botStats[bot.id]) botStats[bot.id] = { name: bot.name, personality: bot.personality, spentArr: [], teamsArr: [], evDeltaArr: [] };
      const bs = botStats[bot.id];
      bs.spentArr.push(bot.spent);
      bs.teamsArr.push(Object.keys(bot.portfolio).length);
      // EV delta from simEVs (approximate): sum(simEV[team]) - spent
      const approxEV = Object.keys(bot.portfolio).reduce((s, t) => s + (initEVMap[t]?.mean_earnings ?? 0), 0);
      bs.evDeltaArr.push(approxEV - bot.spent);
    });

    if (!QUIET) {
      const top5 = soldEntries.sort(([,a],[,b]) => b.price - a.price).slice(0, 5)
        .map(([t, r]) => `${t}=$${r.price}`).join(" ");
      const evStr = evErr != null ? `  evErr=${evErr >= 0 ? "+" : ""}${evErr.toFixed(0)}` : "";
      console.log(`SIM ${String(sim).padStart(4)}: pot=$${totalPot.toLocaleString().padStart(5)} sold=${nSold}/48  [${roomProfile.name.padEnd(6)}]  top: ${top5}${evStr}`);
    } else if (sim % 100 === 0) {
      console.log(`  ...${sim}/${N_SIMS} sims complete`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(70)}`);
  console.log(`SUMMARY — ${N_SIMS} simulations`);
  console.log(`${"═".repeat(70)}`);

  const avgPot = simPots.reduce((s, v) => s + v, 0) / N_SIMS;
  const avgSold = simNSold.reduce((s, v) => s + v, 0) / N_SIMS;
  console.log(`\nTotal pot:   avg=$${avgPot.toFixed(0)}  p10=$${pct(simPots,10)}  p50=$${pct(simPots,50)}  p90=$${pct(simPots,90)}  min=$${Math.min(...simPots)}  max=$${Math.max(...simPots)}`);
  console.log(`Teams sold:  avg=${avgSold.toFixed(1)}  min=${Math.min(...simNSold)}  max=${Math.max(...simNSold)}`);
  if (EV_CHECK && evErrorCount > 0) {
    console.log(`EV check:    avg_abs_error=$${(evErrorSum/evErrorCount).toFixed(1)}`);
  }

  // Per-team averages — sorted by avg price descending
  console.log(`\nTEAM PRICES (avg selling price, sims where sold):`);
  const teamAvgs = ALL_TEAMS
    .map(t => {
      const arr = teamPrices[t];
      const soldPct = (arr.length / N_SIMS * 100).toFixed(0);
      const avg = arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length) : 0;
      const max = arr.length ? Math.max(...arr) : 0;
      return { t, avg, max, soldPct: parseInt(soldPct), n: arr.length };
    })
    .sort((a, b) => b.avg - a.avg);

  // Flag teams where avg price > 4× their simEV (indicates cap issue)
  teamAvgs.forEach(({ t, avg, max, soldPct, n }) => {
    const simEV = initEVMap[t]?.mean_earnings ?? 0;
    const flag  = simEV > 0 && avg > simEV * 3.5 ? " ⚠ HIGH" : "";
    const simEVStr = simEV > 0 ? `  simEV=$${simEV.toFixed(0)}` : "";
    console.log(`  ${t.padEnd(4)} avg=$${String(avg.toFixed(0)).padStart(4)}  max=$${String(max).padStart(4)}  sold=${soldPct}%${simEVStr}${flag}`);
  });

  // Personality breakdown
  console.log(`\nBOT SUMMARY (avg across sims):`);
  const byPersonality = {};
  Object.values(botStats).forEach(bs => {
    const p = bs.personality;
    if (!byPersonality[p]) byPersonality[p] = { spentArr: [], teamsArr: [], evDeltaArr: [] };
    byPersonality[p].spentArr.push(...bs.spentArr);
    byPersonality[p].teamsArr.push(...bs.teamsArr);
    byPersonality[p].evDeltaArr.push(...bs.evDeltaArr);
  });

  console.log(`  ${"Bot".padEnd(14)} ${"Personality".padEnd(16)} avg_spent  avg_teams  avg_ev_delta`);
  Object.values(botStats).forEach(bs => {
    const avgSpent = bs.spentArr.reduce((s,v)=>s+v,0)/bs.spentArr.length;
    const avgTeams = bs.teamsArr.reduce((s,v)=>s+v,0)/bs.teamsArr.length;
    const avgDelta = bs.evDeltaArr.reduce((s,v)=>s+v,0)/bs.evDeltaArr.length;
    const deltaStr = `${avgDelta >= 0 ? "+" : ""}$${avgDelta.toFixed(0)}`;
    console.log(`  ${bs.name.padEnd(14)} ${bs.personality.padEnd(16)} $${avgSpent.toFixed(0).padStart(6)}     ${avgTeams.toFixed(1).padStart(5)}      ${deltaStr}`);
  });

  console.log(`\n${"─".repeat(70)}`);
  console.log(`Room composition drawn across ${N_SIMS} sims:`);
  ROOM_PROFILES.forEach(p => {
    const n = roomCounts[p.name] ?? 0;
    const pct = (n / N_SIMS * 100).toFixed(1);
    const potSample = simPots.filter((_, i) => true); // rough: just show avg by room would need per-sim room tracking
    console.log(`  ${p.name.padEnd(7)} potCenter=$${p.potCenter.toLocaleString().padStart(5)}  drawn ${String(n).padStart(4)}×  (${pct}%)`);
  });

  console.log(`\n${"─".repeat(70)}`);
  console.log(`Wave prices vs simEV caps:`);
  console.log(`  all bots: 2.5× simEV cap | RATIO_MAX: ${RATIO_MAX}`);
  const wave1Teams = GROUP_LETTERS.flatMap(l => {
    const q = buildAuctionQueue(teamProfiles);
    return q.slice(0, 24);
  }).filter((v, i, a) => a.indexOf(v) === i).slice(0, 24);
  const wave1Avgs = teamAvgs.filter(({ t }) => wave1Teams.includes(t));
  const overCapCount = wave1Avgs.filter(({ t, avg }) => {
    const simEV = initEVMap[t]?.mean_earnings ?? 0;
    return simEV > 0 && avg > simEV * 2.5;
  }).length;
  console.log(`  Wave-1 teams with avg > 2.5× simEV: ${overCapCount}/${wave1Avgs.length} (should be 0 if cap is working)`);
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
