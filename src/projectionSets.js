import { ANALYST_ADV, ELO_RATINGS, BETTING_ODDS_AMERICAN } from "./projectionData";

// Pre-compute Plackett-Luce champion probabilities from ELO at module load
const _eloStrengths = {};
let _totalElo = 0;
for (const [team, elo] of Object.entries(ELO_RATINGS)) {
  _eloStrengths[team] = Math.pow(10, elo / 400);
  _totalElo += _eloStrengths[team];
}
export const ELO_CHAMP_PROB = {};
for (const [team, s] of Object.entries(_eloStrengths)) {
  ELO_CHAMP_PROB[team] = s / _totalElo;
}

// Pre-compute normalized implied champion probabilities from betting odds
const _rawProbs = {};
let _totalRaw = 0;
for (const [team, odds] of Object.entries(BETTING_ODDS_AMERICAN)) {
  const p = 100 / (odds + 100);
  _rawProbs[team] = p;
  _totalRaw += p;
}
export const BETTING_CHAMP_PROB = {};
for (const [team, p] of Object.entries(_rawProbs)) {
  BETTING_CHAMP_PROB[team] = p / _totalRaw;
}

// Ratio cap — prevents extreme adjustments for mismatched models
const RATIO_MIN = 0.05;
const RATIO_MAX = 1.25;

function champRatio(methodProb, simChampProb) {
  const sProb = Math.max(1e-6, simChampProb);
  const mProb = Math.max(1e-6, methodProb);
  return Math.max(RATIO_MIN, Math.min(RATIO_MAX, mProb / sProb));
}

/**
 * Compute base EV at initialPotEstimate scale for a given projection set.
 * Returns a dollar value that can be multiplied by personality bias + noise.
 * potEstimateScale applied at bid time handles future pot estimate updates.
 *
 * @param {string}  team
 * @param {string}  projSet - "sim" | "analyst" | "elo" | "sports_betting" | "bid_anchoring"
 * @param {number}  apiEV   - API mean_earnings at userPotTarget scale
 * @param {number}  simChampProb - API sim P(champion) for this team
 * @param {number}  initialPotEstimate - bot's starting pot estimate
 * @param {number}  userPotTarget
 */
export function getProjectionBaseEV(team, projSet, apiEV, simChampProb, initialPotEstimate, userPotTarget) {
  const evScale = userPotTarget > 0 ? initialPotEstimate / userPotTarget : 1;

  switch (projSet) {
    case "sim":
      return apiEV * evScale;

    case "analyst": {
      const ratio = champRatio(ANALYST_ADV[team]?.champion ?? 0, simChampProb);
      return apiEV * evScale * ratio;
    }

    case "elo": {
      const ratio = champRatio(ELO_CHAMP_PROB[team] ?? (1 / 48), simChampProb);
      return apiEV * evScale * ratio;
    }

    case "sports_betting": {
      const ratio = champRatio(BETTING_CHAMP_PROB[team] ?? (1 / 48), simChampProb);
      return apiEV * evScale * ratio;
    }

    case "bid_anchoring": {
      // Pure market-based: betting-implied share of total pot
      const bProb = BETTING_CHAMP_PROB[team] ?? (1 / 48);
      return bProb * initialPotEstimate;
    }

    default:
      return apiEV * evScale;
  }
}
