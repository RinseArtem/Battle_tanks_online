/* Карты уровней. Сетка 13×13 «больших» клеток, каждая = 2×2 подплитки.
   Символы: . пусто | B кирпич | S сталь | W вода | T лес | I лёд
   Движок сам вырезает точки спавна и крепость Орла внизу. */

export interface LevelDef {
  name: string;
  map: string[];
  comp: { basic: number; fast: number; power: number; armor: number };
}

export const LEVELS: LevelDef[] = [
  {
    name: "ПЕРЕДОВАЯ",
    map: [
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
    comp: { basic: 12, fast: 4, power: 2, armor: 2 },
  },
  {
    name: "ЗАСАДА",
    map: [
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
    comp: { basic: 10, fast: 5, power: 3, armor: 2 },
  },
  {
    name: "БРОНЯ",
    map: [
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
    comp: { basic: 8, fast: 5, power: 4, armor: 3 },
  },
  {
    name: "РЕЧНАЯ",
    map: [
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
    comp: { basic: 9, fast: 6, power: 3, armor: 3 },
  },
  {
    name: "ЛАБИРИНТ",
    map: [
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
    comp: { basic: 7, fast: 6, power: 5, armor: 4 },
  },
  {
    name: "КРЕПОСТЬ",
    map: [
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
    comp: { basic: 6, fast: 6, power: 6, armor: 5 },
  },
];

export function levelName(lv: number): string {
  return LEVELS[(lv - 1) % LEVELS.length].name;
}
