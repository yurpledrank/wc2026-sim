export const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export const TEAM_NAMES = {
  MEX: "Mexico",     RSA: "South Africa", KOR: "South Korea",  CZE: "Czech Republic",
  CAN: "Canada",     BIH: "Bosnia & Herz", QAT: "Qatar",       SUI: "Switzerland",
  ESP: "Spain",      URU: "Uruguay",       KSA: "Saudi Arabia", CPV: "Cape Verde",
  USA: "USA",        PAR: "Paraguay",      AUS: "Australia",    TUR: "Turkey",
  ARG: "Argentina",  AUT: "Austria",       ALG: "Algeria",      JOR: "Jordan",
  ENG: "England",    CRO: "Croatia",       PAN: "Panama",       GHA: "Ghana",
  FRA: "France",     NOR: "Norway",        SEN: "Senegal",      IRQ: "Iraq",
  BRA: "Brazil",     MAR: "Morocco",       SCO: "Scotland",     HAI: "Haiti",
  POR: "Portugal",   COL: "Colombia",      COD: "DR Congo",     UZB: "Uzbekistan",
  GER: "Germany",    ECU: "Ecuador",       CIV: "Ivory Coast",  CUW: "Curaçao",
  NED: "Netherlands",JPN: "Japan",         SWE: "Sweden",       TUN: "Tunisia",
  BEL: "Belgium",    EGY: "Egypt",         IRN: "Iran",         NZL: "New Zealand",
};

export const GROUPS = {
  A: ["MEX", "RSA", "KOR", "CZE"],
  B: ["CAN", "BIH", "QAT", "SUI"],
  C: ["BRA", "MAR", "SCO", "HAI"],
  D: ["USA", "PAR", "AUS", "TUR"],
  E: ["GER", "ECU", "CIV", "CUW"],
  F: ["NED", "JPN", "SWE", "TUN"],
  G: ["BEL", "EGY", "IRN", "NZL"],
  H: ["ESP", "URU", "KSA", "CPV"],
  I: ["FRA", "NOR", "SEN", "IRQ"],
  J: ["ARG", "AUT", "ALG", "JOR"],
  K: ["POR", "COL", "COD", "UZB"],
  L: ["ENG", "CRO", "PAN", "GHA"],
};

export const GROUP_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

export const ALL_TEAMS = GROUP_LETTERS.flatMap(l => GROUPS[l]);

export function buildAuctionQueue(teams) {
  const seeds = {};
  GROUP_LETTERS.forEach(l => {
    seeds[l] = [...GROUPS[l]].sort(
      (a, b) => (teams[b]?.advancement?.champion ?? 0) - (teams[a]?.advancement?.champion ?? 0)
    );
  });
  const wave1 = GROUP_LETTERS.flatMap(l => [seeds[l][1], seeds[l][2]]);
  const wave2 = GROUP_LETTERS.map(l => seeds[l][0]);
  const wave3 = GROUP_LETTERS.map(l => seeds[l][3]);
  return [...wave1, ...wave2, ...wave3].filter(Boolean);
}
