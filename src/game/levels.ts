/* 50 уровней: 6 авторских карт + 44 процедурных (детерминированный генератор).
   Сетка 13×13 «больших» клеток, каждая = 2×2 подплитки.
   Символы: . пусто | B кирпич | S сталь | W вода | T лес | I лёд
   Движок сам вырезает точки спавна и зону крепости Орла внизу. */

export const LEVEL_COUNT = 50;

export interface LevelDef {
  name: string;
  map: string[];
  comp: { basic: number; fast: number; power: number; armor: number };
  speedMul: number;
  armorHp: number;
  fireMul: number;
}

const HANDMADE: Omit<LevelDef, "name">["map"][] = [
  [
    ".............",
    ".BB.BBB.BBB..",
    ".BB.BBB.BBB..",
    ".BB..B...B.B.",
    ".BBB.BB.BB.B.",
    "......BB.....",
    ".SS..BBBB..S.",
    ".BB..BBBB..B.",
    ".BB.BB..BB.B.",
    "..T.BB..BB.T.",
    "..T..........",
    "....BB.BB....",
    ".............",
  ],
  [
    ".............",
    "..T.BB.BB.T..",
    "..T.BB.BB.T..",
    ".BB..W.W..BB.",
    ".BB.WWWWW.BB.",
    "..B..W.W..B..",
    "..BB.....BB..",
    ".BBBB.S.BBBB.",
    ".BB...B...BB.",
    "..T..BBB..T..",
    ".....SSS.....",
    "....BB.BB....",
    ".............",
  ],
  [
    ".............",
    ".S.BB.S.BB.S.",
    ".S.BB...BB.S.",
    "...BB.BBB.BB.",
    ".BB...BBB....",
    ".BBBB..S.BBB.",
    "..S...BBB..S.",
    ".BB.BB...BB..",
    ".BB.BB.S.BB..",
    ".....BB.BB...",
    ".T...BB.BB.T.",
    "....BB.BB....",
    ".............",
  ],
  [
    ".............",
    ".BB.WWWWW.BB.",
    ".B...W.W...B.",
    ".BB..W.W..BB.",
    "..BB.WWW.BB..",
    "..BB..B..BB..",
    ".....BBB.....",
    ".BBBB.B.BBBB.",
    ".BB.....T.BB.",
    ".BB.T...T.BB.",
    "....TT.TT....",
    "....BB.BB....",
    ".............",
  ],
  [
    ".............",
    ".BBBB.B.BBBB.",
    "..BB..B..BB..",
    "..B..BBB..B..",
    ".BB.BB.BB.BB.",
    ".B.....S....B",
    ".BB.BB.BB.BB.",
    "..B..BBB..B..",
    "..BB..B..BB..",
    ".BBBB.B.BBBB.",
    "......I......",
    "....BB.BB....",
    ".............",
  ],
  [
    ".............",
    "..SSS...SSS..",
    "..B.BBB.B.B..",
    ".BB.B.B.B.BB.",
    ".B..BBB.BB..B",
    ".BB.......BB.",
    "..S.BB.BB.S..",
    ".BB.BB.BB.BB.",
    ".B....T....B.",
    ".BBB..T..BBB.",
    "......T......",
    "....BB.BB....",
    ".............",
  ],
];

const HANDMADE_NAMES = ["ПЕРЕДОВАЯ", "ЗАСАДА", "БРОНЯ", "РЕЧНАЯ", "ЛАБИРИНТ", "КРЕПОСТЬ"];
const HANDMADE_COMP = [
  { basic: 12, fast: 4, power: 2, armor: 2 },
  { basic: 10, fast: 5, power: 3, armor: 2 },
  { basic: 8, fast: 5, power: 4, armor: 3 },
  { basic: 9, fast: 6, power: 3, armor: 3 },
  { basic: 7, fast: 6, power: 5, armor: 4 },
  { basic: 6, fast: 6, power: 6, armor: 5 },
];

/* Детерминированный PRNG, чтобы уровень N всегда был одинаковым. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOUNS = [
  "ГРОЗА", "БУРАН", "КЕДР", "СОКОЛ", "ГРАНИТ", "ШТОРМ", "ТАЙГА", "САПСАН",
  "БАЗАЛЬТ", "МОЛНИЯ", "СЕВЕР", "КРЕЧЕТ", "ОБРЫВ", "ЗАРЯ", "ГРАД", "БУЛАТ",
  "ТУМАН", "ОРЛАН", "БАРС", "ЛАВИНА", "РУБИН", "ШКВАЛ", "МРАМОР", "КОБАЛЬТ",
  "ИРБИС", "ЦИКЛОН", "ГРОМ", "ОНИКС", "ФИЛИН", "МЕТЕЛЬ", "КРЕМЕНЬ", "РЫСЬ",
  "ВАЛ", "ПИРАНЬЯ", "КОРСАК", "ГИЛЬЗА", "ПОЛЫНЬ", "СИРОККО", "БЕРКУТ", "ТОРФ",
  "КЛИНОК", "ОТЛИВ", "СЛЕД", "РУДА",
];

function genMap(rnd: () => number, lv: number): string[] {
  const g: string[][] = Array.from({ length: 13 }, () => Array(13).fill("."));
  const sym = rnd() < 0.65;
  const set = (c: number, r: number, ch: string) => {
    if (r < 1 || r > 12 || c < 0 || c > 12) return;
    if (g[r][c] === ".") g[r][c] = ch;
  };
  const put = (c: number, r: number, w: number, h: number, ch: string) => {
    for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) {
      set(cc, rr, ch);
      if (sym && cc <= 12) set(12 - cc, rr, ch);
    }
  };

  // кирпичные clusters
  const clusters = 5 + Math.floor(rnd() * 4) + Math.min(4, Math.floor(lv / 10));
  for (let i = 0; i < clusters; i++) {
    const w = 1 + Math.floor(rnd() * 3);
    const h = 1 + Math.floor(rnd() * 3);
    put(Math.floor(rnd() * (13 - w)), 1 + Math.floor(rnd() * (10 - h)), w, h, "B");
  }
  // стальные укрепления
  const steels = 1 + Math.floor(lv / 8) + Math.floor(rnd() * 2);
  for (let i = 0; i < steels; i++) {
    const w = rnd() < 0.5 ? 2 : 1;
    put(Math.floor(rnd() * (13 - w)), 1 + Math.floor(rnd() * 9), w, 1, "S");
  }
  // водный канал
  if (rnd() < 0.45 + lv * 0.006) {
    if (rnd() < 0.5) {
      const r = 2 + Math.floor(rnd() * 6);
      for (let c = 0; c < 13; c++) if (rnd() > 0.22) set(c, r, "W");
    } else {
      const c = 2 + Math.floor(rnd() * 9);
      for (let r = 1; r <= 9; r++) if (rnd() > 0.25) set(c, r, "W");
    }
  }
  // лесные массивы
  const forests = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < forests; i++) {
    const s = 2 + Math.floor(rnd() * 2);
    put(Math.floor(rnd() * (13 - s)), 1 + Math.floor(rnd() * (10 - s)), s, s, "T");
  }
  // лёд с 8-го уровня
  if (lv >= 8 && rnd() < 0.4) {
    const n = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) put(Math.floor(rnd() * 12), 2 + Math.floor(rnd() * 8), 1, 1, "I");
  }
  // не перегружать карту
  let filled = 0;
  for (const row of g) for (const ch of row) if (ch !== ".") filled++;
  if (filled > 72) {
    for (let r = 1; r <= 10; r++) for (let c = 0; c < 13; c++) {
      if (filled <= 72) break;
      if (g[r][c] === "B" && rnd() < 0.5) { g[r][c] = "."; filled--; }
    }
  }
  // верхний ряд — манёвр для вражеских спавнов
  for (let c = 0; c < 13; c++) g[0][c] = ".";
  return g.map((row) => row.join(""));
}

function genComp(lv: number): LevelDef["comp"] {
  const total = Math.round(Math.min(42, 16 + lv * 0.52));
  const armor = Math.round(total * Math.min(0.3, 0.05 + lv * 0.006));
  const power = Math.round(total * (0.12 + Math.min(0.2, lv * 0.004)));
  const fast = Math.round(total * (0.18 + Math.min(0.15, lv * 0.003)));
  return { basic: Math.max(2, total - armor - power - fast), fast, power, armor };
}

const CACHE = new Map<number, LevelDef>();

export function buildLevel(lv: number): LevelDef {
  const level = Math.min(LEVEL_COUNT, Math.max(1, lv));
  const cached = CACHE.get(level);
  if (cached) return cached;
  const speedMul = Math.min(1.6, 1 + level * 0.012);
  const armorHp = Math.min(7, 4 + Math.floor(level / 12));
  const fireMul = 1 + level * 0.02;
  let def: LevelDef;
  if (level <= HANDMADE.length) {
    def = { name: HANDMADE_NAMES[level - 1], map: HANDMADE[level - 1], comp: HANDMADE_COMP[level - 1], speedMul, armorHp, fireMul };
  } else {
    const rnd = mulberry32(level * 2654435761 + 7);
    def = {
      name: `ОПЕРАЦИЯ «${NOUNS[(level - 7) % NOUNS.length]}»`,
      map: genMap(rnd, level),
      comp: genComp(level),
      speedMul, armorHp, fireMul,
    };
  }
  CACHE.set(level, def);
  return def;
}

export function levelName(lv: number): string {
  return buildLevel(lv).name;
}
