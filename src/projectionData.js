// Pool C payout structure (mirrors payout_engine.py)
const _KO_PCT = { r32: 0.06, r16: 0.05, qf: 0.04, sf: 0.04, final: 0.03 };
const _N_ADV  = { r32: 32,   r16: 16,   qf: 8,    sf: 4,    final: 2    };

export function analystPoolCEV(team, totalPot) {
  const adv = ANALYST_ADV[team];
  if (!adv || !totalPot) return null;
  return Object.entries(_KO_PCT).reduce(
    (sum, [rnd, pct]) => sum + (adv[rnd] ?? 0) * totalPot * pct / _N_ADV[rnd],
    0
  );
}

export function isChampDisagreement(silverChamp, team) {
  const taChamp = ANALYST_ADV[team]?.champion;
  if (!silverChamp || !taChamp) return false;
  return Math.abs(silverChamp - taChamp) / Math.max(silverChamp, taChamp) > 0.30;
}

// TheAnalyst WC2026 advancement probabilities (theanalyst.com, May 2026)
export const ANALYST_ADV = {
  ESP: { r32: 0.9859, r16: 0.7243, qf: 0.5175, sf: 0.3883, final: 0.2548, champion: 0.1612 },
  FRA: { r32: 0.9525, r16: 0.6995, qf: 0.4771, sf: 0.3295, final: 0.2070, champion: 0.1267 },
  ENG: { r32: 0.9603, r16: 0.6946, qf: 0.4788, sf: 0.3068, final: 0.1921, champion: 0.1134 },
  ARG: { r32: 0.9681, r16: 0.6316, qf: 0.4529, sf: 0.3048, final: 0.1805, champion: 0.1034 },
  POR: { r32: 0.9498, r16: 0.6242, qf: 0.3977, sf: 0.2386, final: 0.1312, champion: 0.0690 },
  BRA: { r32: 0.9689, r16: 0.6244, qf: 0.3858, sf: 0.2215, final: 0.1238, champion: 0.0647 },
  GER: { r32: 0.9638, r16: 0.6209, qf: 0.3348, sf: 0.2059, final: 0.1140, champion: 0.0569 },
  NED: { r32: 0.8886, r16: 0.4886, qf: 0.3027, sf: 0.1554, final: 0.0793, champion: 0.0385 },
  NOR: { r32: 0.8271, r16: 0.4920, qf: 0.2720, sf: 0.1453, final: 0.0736, champion: 0.0324 },
  BEL: { r32: 0.8988, r16: 0.5452, qf: 0.2860, sf: 0.1241, final: 0.0559, champion: 0.0235 },
  COL: { r32: 0.8492, r16: 0.4454, qf: 0.2241, sf: 0.1139, final: 0.0500, champion: 0.0224 },
  MAR: { r32: 0.8902, r16: 0.4544, qf: 0.2360, sf: 0.1049, final: 0.0443, champion: 0.0192 },
  URU: { r32: 0.8384, r16: 0.3906, qf: 0.2038, sf: 0.0992, final: 0.0440, champion: 0.0163 },
  SUI: { r32: 0.8568, r16: 0.5034, qf: 0.2328, sf: 0.0966, final: 0.0390, champion: 0.0149 },
  CRO: { r32: 0.7718, r16: 0.3927, qf: 0.1846, sf: 0.0917, final: 0.0380, champion: 0.0149 },
  ECU: { r32: 0.8738, r16: 0.4314, qf: 0.1898, sf: 0.0893, final: 0.0362, champion: 0.0140 },
  USA: { r32: 0.7649, r16: 0.4153, qf: 0.1934, sf: 0.0806, final: 0.0348, champion: 0.0134 },
  JPN: { r32: 0.7620, r16: 0.3369, qf: 0.1731, sf: 0.0773, final: 0.0338, champion: 0.0131 },
  SEN: { r32: 0.6158, r16: 0.2976, qf: 0.1386, sf: 0.0581, final: 0.0230, champion: 0.0096 },
  MEX: { r32: 0.8759, r16: 0.5212, qf: 0.2373, sf: 0.0800, final: 0.0281, champion: 0.0094 },
  TUR: { r32: 0.7338, r16: 0.3856, qf: 0.1695, sf: 0.0669, final: 0.0258, champion: 0.0092 },
  SWE: { r32: 0.6296, r16: 0.2353, qf: 0.1032, sf: 0.0423, final: 0.0153, champion: 0.0056 },
  AUT: { r32: 0.6800, r16: 0.2435, qf: 0.1072, sf: 0.0452, final: 0.0169, champion: 0.0050 },
  CAN: { r32: 0.7926, r16: 0.4345, qf: 0.1862, sf: 0.0568, final: 0.0159, champion: 0.0044 },
  KOR: { r32: 0.6978, r16: 0.3372, qf: 0.1269, sf: 0.0414, final: 0.0134, champion: 0.0042 },
  PAR: { r32: 0.6379, r16: 0.2938, qf: 0.1172, sf: 0.0435, final: 0.0152, champion: 0.0041 },
  AUS: { r32: 0.5885, r16: 0.2616, qf: 0.1003, sf: 0.0362, final: 0.0114, champion: 0.0036 },
  EGY: { r32: 0.6860, r16: 0.3067, qf: 0.1122, sf: 0.0381, final: 0.0118, champion: 0.0032 },
  BIH: { r32: 0.6282, r16: 0.2850, qf: 0.1088, sf: 0.0320, final: 0.0094, champion: 0.0027 },
  ALG: { r32: 0.5673, r16: 0.1851, qf: 0.0752, sf: 0.0274, final: 0.0085, champion: 0.0027 },
  IRN: { r32: 0.6436, r16: 0.2724, qf: 0.0955, sf: 0.0310, final: 0.0086, champion: 0.0024 },
  CZE: { r32: 0.6349, r16: 0.2827, qf: 0.0984, sf: 0.0286, final: 0.0089, champion: 0.0022 },
  SCO: { r32: 0.6643, r16: 0.2377, qf: 0.0861, sf: 0.0280, final: 0.0080, champion: 0.0022 },
  CIV: { r32: 0.6405, r16: 0.2343, qf: 0.0774, sf: 0.0234, final: 0.0069, champion: 0.0020 },
  GHA: { r32: 0.4991, r16: 0.1828, qf: 0.0664, sf: 0.0236, final: 0.0080, champion: 0.0019 },
  TUN: { r32: 0.4331, r16: 0.1224, qf: 0.0414, sf: 0.0129, final: 0.0039, champion: 0.0009 },
  UZB: { r32: 0.4121, r16: 0.1215, qf: 0.0361, sf: 0.0114, final: 0.0028, champion: 0.0009 },
  PAN: { r32: 0.3996, r16: 0.1282, qf: 0.0408, sf: 0.0125, final: 0.0034, champion: 0.0009 },
  RSA: { r32: 0.4915, r16: 0.1892, qf: 0.0578, sf: 0.0147, final: 0.0044, champion: 0.0008 },
  COD: { r32: 0.4230, r16: 0.1265, qf: 0.0381, sf: 0.0112, final: 0.0035, champion: 0.0008 },
  JOR: { r32: 0.4044, r16: 0.1125, qf: 0.0372, sf: 0.0101, final: 0.0026, champion: 0.0007 },
  IRQ: { r32: 0.2727, r16: 0.0939, qf: 0.0313, sf: 0.0094, final: 0.0028, champion: 0.0006 },
  QAT: { r32: 0.4332, r16: 0.1562, qf: 0.0483, sf: 0.0106, final: 0.0026, champion: 0.0005 },
  KSA: { r32: 0.3982, r16: 0.1174, qf: 0.0370, sf: 0.0107, final: 0.0026, champion: 0.0005 },
  NZL: { r32: 0.4724, r16: 0.1642, qf: 0.0444, sf: 0.0119, final: 0.0025, champion: 0.0004 },
  CPV: { r32: 0.3314, r16: 0.0906, qf: 0.0257, sf: 0.0063, final: 0.0014, champion: 0.0004 },
  HAI: { r32: 0.1543, r16: 0.0270, qf: 0.0046, sf: 0.0007, final: 0.0001, champion: 0.0000 },
  CUW: { r32: 0.1874, r16: 0.0380, qf: 0.0077, sf: 0.0014, final: 0.0002, champion: 0.0000 },
};

// NELO Delta: normalizes PELE and ELO onto the same 0–1 scale and returns the
// difference as a percentage. Positive = Silver/PELE rates team higher than ELO.
const _peleVals = [2077,2065,2027,2026,1989,1975,1972,1953,1949,1939,1932,1931,1909,1897,1892,1889,1877,1872,1866,1855,1853,1832,1898,1806,1802,1794,1781,1777,1772,1770,1770,1769,1739,1729,1722,1714,1706,1695,1667,1662,1661,1653,1639,1637,1632,1621,1570,1550];
const _eloVals  = [2165,2113,2081,2020,1984,1984,1975,1961,1933,1930,1923,1912,1904,1902,1892,1889,1878,1867,1860,1833,1827,1822,1784,1783,1767,1760,1752,1743,1737,1727,1726,1721,1719,1699,1690,1676,1655,1636,1607,1594,1585,1568,1549,1532,1524,1503,1436,1423];
const _PELE_MIN = Math.min(..._peleVals), _PELE_MAX = Math.max(..._peleVals);
const _ELO_MIN  = Math.min(..._eloVals),  _ELO_MAX  = Math.max(..._eloVals);
export function neloDelta(team) {
  const pele = PELE_RATINGS[team], elo = ELO_RATINGS[team];
  if (!pele || !elo) return null;
  return ((pele - _PELE_MIN) / (_PELE_MAX - _PELE_MIN) - (elo - _ELO_MIN) / (_ELO_MAX - _ELO_MIN)) * 100;
}

// WC PELE ratings — "WC PELE" column from silver_pele_2026.csv (May 2026)
// USA includes +88 home-field; MEX/CAN use raw WC PELE (knockout games in USA)
export const PELE_RATINGS = {
  ESP: 2077, ARG: 2065, ENG: 2027, FRA: 2026, BRA: 1989, GER: 1975,
  POR: 1972, NOR: 1953, COL: 1949, NED: 1939, ECU: 1932, URU: 1931,
  TUR: 1909, SEN: 1897, BEL: 1892, SUI: 1889, CRO: 1877, JPN: 1872,
  MAR: 1866, PAR: 1855, MEX: 1853, AUT: 1832, USA: 1898, CAN: 1806,
  SCO: 1802, ALG: 1794, SWE: 1781, CIV: 1777, AUS: 1772, KOR: 1770,
  EGY: 1770, CZE: 1769, PAN: 1739, COD: 1729, IRN: 1722, UZB: 1714,
  BIH: 1706, TUN: 1695, RSA: 1667, GHA: 1662, JOR: 1661, IRQ: 1653,
  NZL: 1639, HAI: 1637, KSA: 1632, CPV: 1621, CUW: 1570, QAT: 1550,
};

// World Football ELO ratings (May 2026)
export const ELO_RATINGS = {
  ESP: 2165, ARG: 2113, FRA: 2081, ENG: 2020, BRA: 1984, POR: 1984,
  COL: 1975, NED: 1961, ECU: 1933, CRO: 1930, GER: 1923, NOR: 1912,
  JPN: 1904, TUR: 1902, URU: 1892, SUI: 1889, SEN: 1878, BEL: 1867,
  MEX: 1860, PAR: 1833, AUT: 1827, MAR: 1822, CAN: 1784, AUS: 1783,
  SCO: 1767, IRN: 1760, KOR: 1752, ALG: 1743, PAN: 1737, UZB: 1727,
  CZE: 1726, USA: 1721, SWE: 1719, EGY: 1699, JOR: 1690, CIV: 1676,
  COD: 1655, TUN: 1636, IRQ: 1607, BIH: 1594, NZL: 1585, KSA: 1568,
  CPV: 1549, HAI: 1532, RSA: 1524, GHA: 1503, CUW: 1436, QAT: 1423,
};

export const PELE_RANKS = Object.fromEntries(
  Object.entries(PELE_RATINGS).sort(([,a],[,b]) => b-a).map(([c],i) => [c, i+1])
);
export const ELO_RANKS = Object.fromEntries(
  Object.entries(ELO_RATINGS).sort(([,a],[,b]) => b-a).map(([c],i) => [c, i+1])
);

// Betting odds (American format, midpoints of market ranges — May 2026)
// PAR through QAT are estimated from ELO; user should verify
export const BETTING_ODDS_AMERICAN = {
  ESP: 475,   FRA: 525,   ENG: 625,   BRA: 800,   ARG: 825,
  POR: 1100,  GER: 1400,  NED: 2000,  NOR: 2900,  BEL: 3500,
  COL: 4000,  JPN: 5000,  MAR: 5500,  USA: 6250,  URU: 6500,
  MEX: 7250,  SWE: 8000,  TUR: 8250,  ECU: 8500,  CRO: 8500,
  SUI: 9000,  SEN: 10000, AUT: 10000,
  PAR: 12000, CAN: 12500, AUS: 13000, SCO: 14000, IRN: 15000,
  KOR: 16000, ALG: 17000, PAN: 18000, UZB: 20000, CZE: 20000,
  EGY: 25000, JOR: 27500, CIV: 30000, COD: 35000, TUN: 40000,
  IRQ: 50000, BIH: 55000, NZL: 60000, KSA: 70000, CPV: 80000,
  HAI: 100000, RSA: 100000, GHA: 125000, CUW: 175000, QAT: 200000,
};
