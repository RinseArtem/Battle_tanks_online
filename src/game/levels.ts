/* 50 уровней кампании: 6 базовых карт × зеркальные варианты + сидированные
   мутации terrain'а. Уровень детерминирован номером (seeded RNG).
   Символы: . пусто | B кирпич | S сталь | W вода | T лес
   Точки спавна, зону игрока и крепость Орла движок вырезает сам. */

export const LEVEL_COUNT = 50;

const TEMPLATES: string[][] = [
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

const PRE = ["Операция", "Рубеж", "Сектор", "Зона", "Плацдарм", "Гарнизон", "Прорыв", "Коридор", "Крепость", "Форпост"];
const SUF = ["Заря", "Гром", "Туман", "Сталь", "Волна", "Шторм", "Тайга", "Буран", "Гранит", "Рассвет"];

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BuiltLevel {
  map: string[];
  comp: { basic: number; fast: number; power: number; armor: number };
  name: string;
  speedMul: number;
  fireMul: number;
  armorHp: number;
}

// запретные «большие» клетки: спавны врагов, зона игроков, крепость Орла
const FORBIDDEN = new Set(["0,0", "6,0", "12,0", "4,12", "8,12", "5,11", "6,11", "7,11", "5,12", "6,12", "7,12"]);

export function buildLevel(lv: number): BuiltLevel {
  const idx = (lv - 1) % LEVEL_COUNT;
  const rnd = mulberry32(lv * 1013904223 + 7777);

  // базовая карта + зеркальная трансформация
  let map = TEMPLATES[Math.floor(rnd() * TEMPLATES.length)].map((r) => r.split(""));
  const flipH = rnd() < 0.5;
  const flipV = rnd() < 0.5;
  if (flipH) map = map.map((row) => [...row].reverse());
  if (flipV) map = [...map].reverse();

  // мутации: кластеры terrain'а на свободных клетках
  const mutations = Math.min(7, 2 + Math.floor(idx / 6));
  for (let m = 0; m < mutations; m++) {
    const bc = Math.floor(rnd() * 13);
    const br = Math.floor(rnd() * 13);
    if (FORBIDDEN.has(`${bc},${br}`)) continue;
    let free = true;
    for (let r = br * 2; r < br * 2 + 2 && free; r++)
      for (let c = bc * 2; c < bc * 2 + 2 && free; c++)
        if (map[r][c] !== ".") free = false;
    if (!free) continue;
    const roll = rnd();
    const ch = roll < 0.55 ? "B" : roll < 0.72 ? "T" : roll < 0.87 ? "S" : "W";
    for (let r = br * 2; r < br * 2 + 2; r++)
      for (let c = bc * 2; c < bc * 2 + 2; c++) map[r][c] = ch;
  }

  // состав врагов растёт с уровнем
  const cap = (v: number, mx: number) => Math.min(mx, Math.round(v));
  const comp = {
    basic: cap(7 + idx * 0.34, 16),
    fast: cap(2 + idx * 0.3, 10),
    power: cap(1 + idx * 0.24, 9),
    armor: cap(1 + idx * 0.22, 9),
  };

  const name = `${PRE[(idx * 7 + 3) % PRE.length]} «${SUF[(idx * 13 + 5) % SUF.length]}»`;
  return {
    map: map.map((r) => r.join("")),
    comp,
    name,
    speedMul: 1 + Math.min(0.75, idx * 0.014),
    fireMul: 1 + idx * 0.016,
    armorHp: Math.min(8, 4 + Math.floor(idx / 8)),
  };
}

const names = new Map<number, string>();
export function levelName(lv: number): string {
  if (!names.has(lv)) names.set(lv, buildLevel(lv).name);
  return names.get(lv)!;
}
