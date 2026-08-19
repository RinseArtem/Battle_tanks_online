/* Симуляция дезматча: арена 1440×1440 (×5 против кампании), 4 класса танков,
   4 оружия, утилиты, мины, арт-обстрелы, сбросы снабжения, сужающаяся зона, боты.
   Хост авторитетен, тики 20 Гц. */

export const TILE = 48;
export const TN = 30;
export const WORLD = TILE * TN;
export const T_EMPTY = 0, T_BRICK = 1, T_STEEL = 2, T_WATER = 3, T_ICE = 4, T_BUSH = 5;

export type TankClass = "assault" | "scout" | "heavy" | "engineer";
export type WeaponId = "mg" | "shotgun" | "rocket" | "laser";
export type UtilId = "shield" | "repair" | "boost" | "mine";

export interface Input {
  up: boolean; down: boolean; left: boolean; right: boolean;
  fire: boolean; util: boolean; aimX: number; aimY: number;
}
export const NEUTRAL: Input = { up: false, down: false, left: false, right: false, fire: false, util: false, aimX: 0, aimY: 0 };

export interface ClassDef { name: string; desc: string; hp: number; speed: number; dmg: number; rate: number; color: string; dark: string; }
export const CLASSES: Record<TankClass, ClassDef> = {
  assault:  { name: "ШТУРМ",     desc: "Баланс огня и брони",        hp: 100, speed: 152, dmg: 1.0,  rate: 1.0,  color: "#ffc84a", dark: "#b57e12" },
  scout:    { name: "РАЗВЕДЧИК", desc: "Молниеносный, картонный",    hp: 70,  speed: 218, dmg: 0.85, rate: 1.3,  color: "#54d8e8", dark: "#1f8899" },
  heavy:    { name: "ТЯЖ",       desc: "Катается медленно, больно",  hp: 168, speed: 104, dmg: 1.3,  rate: 0.85, color: "#ff6d5a", dark: "#a32c1e" },
  engineer: { name: "САПЁР",     desc: "Чинится вне боя, ставит мины", hp: 92, speed: 146, dmg: 0.95, rate: 1.0, color: "#a8f637", dark: "#5f9c14" },
};
export const CLASS_IDS: TankClass[] = ["assault", "scout", "heavy", "engineer"];

export interface WeaponDef {
  name: string; dmg: number; rate: number; speed: number; ammo: number;
  pellets?: number; spread?: number; aoe?: number; pierce?: boolean; color: string;
}
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  mg:      { name: "ПУЛЕМЁТ",  dmg: 8,  rate: 0.15, speed: 600, ammo: Infinity, color: "#ffd76a" },
  shotgun: { name: "ДРОБОВИК", dmg: 7,  rate: 0.72, speed: 500, ammo: 10, pellets: 5, spread: 0.4, color: "#ff9d3a" },
  rocket:  { name: "РАКЕТЫ",   dmg: 34, rate: 0.95, speed: 390, ammo: 7,  aoe: 70, color: "#ff5c2a" },
  laser:   { name: "ЛАЗЕР",    dmg: 15, rate: 0.27, speed: 0,   ammo: 16, pierce: true, color: "#8fe8ff" },
};
export const WEAPON_IDS: WeaponId[] = ["shotgun", "rocket", "laser"];

export const UTILS: Record<UtilId, { name: string; color: string }> = {
  shield: { name: "ЩИТ", color: "#8fe8ff" },
  repair: { name: "РЕМНАБОР", color: "#a8f637" },
  boost: { name: "ФОРСАЖ", color: "#ffd23a" },
  mine: { name: "МИНА", color: "#ff6d5a" },
};
export const UTIL_IDS: UtilId[] = ["shield", "repair", "boost", "mine"];

export const PLAYER_COLORS = ["#ffc84a", "#54d8e8", "#ff6d9d", "#a8f637", "#e8a2ff", "#ffa94d"];
export const BOT_NAMES = ["ВОЛК", "ГРОЗА", "КУВАЛДА", "ШТЫРЬ", "ГАДЮКА", "БАРС", "КРЕЧЕТ", "БУРАН"];

// ---------------- структуры ----------------
export interface TankS {
  id: string; name: string; cls: TankClass; color: string; bot: boolean;
  x: number; y: number; vx: number; vy: number; turret: number;
  hp: number; maxHp: number; shieldT: number; boostT: number; invulnT: number;
  weapon: WeaponId; ammo: number; util: UtilId | null; utilCd: number;
  kills: number; deaths: number; streak: number; cd: number;
  dead: boolean; respawnT: number; lastCombat: number; mineCd: number;
  aiT: number; roamX: number; roamY: number; flash: number;
}
export interface BulletS { x: number; y: number; vx: number; vy: number; dmg: number; owner: string; kind: WeaponId; life: number; }
export interface PickupS { id: number; x: number; y: number; type: "weapon" | "util"; sub: string; beacon: boolean; }
export interface MineS { x: number; y: number; owner: string; arm: number; }
export interface EffectS { id: number; kind: string; x: number; y: number; x2: number; y2: number; r: number; t: number; max: number; txt: string; color: string; }
export interface FeedItem { id: number; killer: string; victim: string; weapon: string; t: number; }

export interface World {
  seed: number; tiles: Uint8Array;
  tanks: TankS[]; bullets: BulletS[]; pickups: PickupS[]; mines: MineS[];
  effects: EffectS[]; feed: FeedItem[];
  time: number; matchT: number; fragLimit: number; timeLimit: number;
  sudden: boolean; zoneX: number; zoneY: number; zoneR: number;
  over: boolean; winner: string | null; nextId: number; dropT: number;
  dirty: number[];
}

// ---------------- генерация карты ----------------
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPAWNS: [number, number][] = [
  [140, 140], [WORLD - 140, 140], [140, WORLD - 140], [WORLD - 140, WORLD - 140],
  [WORLD / 2, 140], [WORLD / 2, WORLD - 140],
];

function genMap(seed: number): Uint8Array {
  const rnd = mulberry32(seed);
  const g = new Uint8Array(TN * TN);
  const put = (c: number, r: number, v: number) => { if (c >= 0 && r >= 0 && c < TN && r < TN) g[r * TN + c] = v; };
  // стальная рамка
  for (let i = 0; i < TN; i++) { put(i, 0, T_STEEL); put(i, TN - 1, T_STEEL); put(0, i, T_STEEL); put(TN - 1, i, T_STEEL); }
  // кирпичные сооружения (комнаты с проломами)
  const rooms = 9 + Math.floor(rnd() * 3);
  for (let i = 0; i < rooms; i++) {
    const w = 3 + Math.floor(rnd() * 4), h = 3 + Math.floor(rnd() * 4);
    const c0 = 2 + Math.floor(rnd() * (TN - 4 - w)), r0 = 2 + Math.floor(rnd() * (TN - 4 - h));
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) {
      const edge = r === r0 || r === r0 + h - 1 || c === c0 || c === c0 + w - 1;
      if (edge) put(c, r, T_BRICK);
    }
    const gaps = 1 + Math.floor(rnd() * 2);
    for (let gi = 0; gi < gaps; gi++) {
      if (rnd() < 0.5) put(c0 + Math.floor(rnd() * w), rnd() < 0.5 ? r0 : r0 + h - 1, T_EMPTY);
      else put(rnd() < 0.5 ? c0 : c0 + w - 1, r0 + Math.floor(rnd() * h), T_EMPTY);
    }
  }
  // кирпичные кучи
  for (let i = 0; i < 16; i++) {
    const c = 2 + Math.floor(rnd() * (TN - 5)), r = 2 + Math.floor(rnd() * (TN - 5));
    put(c, r, T_BRICK); put(c + 1, r, T_BRICK); put(c, r + 1, T_BRICK); put(c + 1, r + 1, T_BRICK);
  }
  // стальные глыбы и стены
  for (let i = 0; i < 6; i++) {
    const c = 2 + Math.floor(rnd() * (TN - 5)), r = 2 + Math.floor(rnd() * (TN - 5));
    put(c, r, T_STEEL); put(c + 1, r, T_STEEL); put(c, r + 1, T_STEEL); put(c + 1, r + 1, T_STEEL);
  }
  for (let i = 0; i < 3; i++) {
    const len = 3 + Math.floor(rnd() * 3);
    const horiz = rnd() < 0.5;
    const c = 3 + Math.floor(rnd() * (TN - 8)), r = 3 + Math.floor(rnd() * (TN - 8));
    for (let k = 0; k < len; k++) { if (horiz) put(c + k, r, T_STEEL); else put(c, r + k, T_STEEL); }
  }
  // водоёмы
  for (let i = 0; i < 4; i++) {
    const cx = 4 + Math.floor(rnd() * (TN - 8)), cy = 4 + Math.floor(rnd() * (TN - 8));
    const rad = 1.4 + rnd() * 1.3;
    for (let r = -3; r <= 3; r++) for (let c = -3; c <= 3; c++) {
      if (c * c + r * r <= rad * rad) put(cx + c, cy + r, T_WATER);
    }
  }
  // лёд
  for (let i = 0; i < 3; i++) {
    const cx = 4 + Math.floor(rnd() * (TN - 8)), cy = 4 + Math.floor(rnd() * (TN - 8));
    const rad = 1.2 + rnd();
    for (let r = -3; r <= 3; r++) for (let c = -3; c <= 3; c++) {
      if (c * c + r * r <= rad * rad) put(cx + c, cy + r, T_ICE);
    }
  }
  // кусты
  for (let i = 0; i < 46; i++) {
    const c = 1 + Math.floor(rnd() * (TN - 2)), r = 1 + Math.floor(rnd() * (TN - 2));
    if (g[r * TN + c] === T_EMPTY) put(c, r, T_BUSH);
  }
  // чистим спавны и центр
  for (const [sx, sy] of [...SPAWNS, [WORLD / 2, WORLD / 2] as [number, number]]) {
    const cc = Math.floor(sx / TILE), rc = Math.floor(sy / TILE);
    for (let r = rc - 1; r <= rc + 1; r++) for (let c = cc - 1; c <= cc + 1; c++) {
      if (c > 0 && r > 0 && c < TN - 1 && r < TN - 1) g[r * TN + c] = T_EMPTY;
    }
  }
  return g;
}

export function createWorld(seed: number, fragLimit: number, timeLimit: number): World {
  return {
    seed, tiles: genMap(seed),
    tanks: [], bullets: [], pickups: [], mines: [], effects: [], feed: [],
    time: 0, matchT: 0, fragLimit, timeLimit,
    sudden: false, zoneX: WORLD / 2, zoneY: WORLD / 2, zoneR: 1060,
    over: false, winner: null, nextId: 1, dropT: 8, dirty: [],
  };
}

function dig(w: World, idx: number) {
  w.tiles[idx] = T_EMPTY;
  w.dirty.push(idx);
  if (w.dirty.length > 400) w.dirty.shift();
}

// ---------------- танки ----------------
export function addTank(w: World, id: string, name: string, cls: TankClass, color: string, bot: boolean): TankS {
  const def = CLASSES[cls];
  const [sx, sy] = findSpawn(w, id);
  const t: TankS = {
    id, name, cls, color, bot, x: sx, y: sy, vx: 0, vy: 0, turret: -Math.PI / 2,
    hp: def.hp, maxHp: def.hp, shieldT: 0, boostT: 0, invulnT: 2,
    weapon: "mg", ammo: Infinity, util: null, utilCd: 0,
    kills: 0, deaths: 0, streak: 0, cd: 0, dead: false, respawnT: 0,
    lastCombat: -10, mineCd: 0, aiT: 0, roamX: sx, roamY: sy, flash: 0,
  };
  w.tanks.push(t);
  fx(w, "spawn", sx, sy, 0, 0);
  return t;
}

export function findSpawn(w: World, selfId: string): [number, number] {
  let best: [number, number] = SPAWNS[0];
  let bestScore = -1;
  for (const s of [...SPAWNS].sort(() => Math.random() - 0.5)) {
    let minD = 1e9;
    for (const t of w.tanks) {
      if (t.id === selfId || t.dead) continue;
      minD = Math.min(minD, Math.hypot(t.x - s[0], t.y - s[1]));
    }
    const score = minD + Math.random() * 120;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function fx(w: World, kind: string, x: number, y: number, r = 0, max = 0.5, x2 = 0, y2 = 0, txt = "", color = "") {
  w.effects.push({ id: w.nextId++, kind, x, y, x2, y2, r, t: max, max, txt, color });
  if (w.effects.length > 80) w.effects.shift();
}

// ---------------- столкновения ----------------
const R = 19; // радиус танка
export function tileAt(w: World, x: number, y: number): number {
  const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
  if (c < 0 || r < 0 || c >= TN || r >= TN) return T_STEEL;
  return w.tiles[r * TN + c];
}
function solidForTank(v: number) { return v === T_BRICK || v === T_STEEL || v === T_WATER; }
function solidForBullet(v: number) { return v === T_BRICK || v === T_STEEL; }

export function circleFree(w: World, x: number, y: number, ignore?: TankS): boolean {
  const c0 = Math.floor((x - R) / TILE), c1 = Math.floor((x + R) / TILE);
  const r0 = Math.floor((y - R) / TILE), r1 = Math.floor((y + R) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const v = tileAt(w, c * TILE + 1, r * TILE + 1);
    if (solidForTank(v)) {
      const nx = Math.max(c * TILE, Math.min(x, c * TILE + TILE));
      const ny = Math.max(r * TILE, Math.min(y, r * TILE + TILE));
      if (Math.hypot(x - nx, y - ny) < R) return false;
    }
  }
  for (const t of w.tanks) {
    if (t === ignore || t.dead) continue;
    if (Math.hypot(x - t.x, y - t.y) < R * 2 - 4) return false;
  }
  return true;
}

export function hasLOS(w: World, x1: number, y1: number, x2: number, y2: number): boolean {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(d / 20);
  for (let i = 1; i < steps; i++) {
    const x = x1 + ((x2 - x1) * i) / steps, y = y1 + ((y2 - y1) * i) / steps;
    const v = tileAt(w, x, y);
    if (v === T_BRICK || v === T_STEEL || v === T_WATER) return false;
  }
  return true;
}

// ---------------- основной тик ----------------
export function stepWorld(w: World, inputs: Record<string, Input>, dt: number) {
  w.time += dt;
  // эффекты всегда тикают
  for (const e of w.effects) {
    e.t -= dt;
    if (e.kind === "telegraph" && e.t <= 0) { e.kind = "artillery"; e.t = 0.5; e.max = 0.5; aoeDamage(w, e.x, e.y, e.r, 60, "__art", true); }
  }
  w.effects = w.effects.filter((e) => e.t > 0);
  for (const f of w.feed) f.t -= dt;
  w.feed = w.feed.filter((f) => f.t > 0);
  if (w.over) return;

  w.matchT += dt;
  // внезапная смерть: зона сжимается
  if (!w.sudden && w.matchT >= w.timeLimit) { w.sudden = true; fx(w, "zone", w.zoneX, w.zoneY, 0, 1); }
  if (w.sudden) w.zoneR = Math.max(150, w.zoneR - 15 * dt);

  // сбросы снабжения
  w.dropT -= dt;
  if (w.dropT <= 0) {
    w.dropT = 14 + Math.random() * 6;
    const [x, y] = randomOpen(w);
    const weapon = Math.random() < 0.55;
    const sub = weapon
      ? WEAPON_IDS[Math.floor(Math.random() * WEAPON_IDS.length)]
      : UTIL_IDS[Math.floor(Math.random() * UTIL_IDS.length)];
    w.pickups.push({ id: w.nextId++, x, y, type: weapon ? "weapon" : "util", sub, beacon: true });
    fx(w, "drop", x, y, 0, 1.2);
    if (w.pickups.length > 14) w.pickups.shift();
  }

  for (const t of w.tanks) {
    if (t.dead) {
      t.respawnT -= dt;
      if (t.respawnT <= 0) respawn(w, t);
      continue;
    }
    t.flash = Math.max(0, t.flash - dt);
    t.cd -= dt; t.utilCd -= dt; t.mineCd -= dt;
    t.shieldT = Math.max(0, t.shieldT - dt);
    t.boostT = Math.max(0, t.boostT - dt);
    t.invulnT = Math.max(0, t.invulnT - dt);

    const inp = inputs[t.id] || NEUTRAL;
    const def = CLASSES[t.cls];

    // движение
    let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    let my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    const ml = Math.hypot(mx, my);
    if (ml > 0) { mx /= ml; my /= ml; }
    const onIce = tileAt(w, t.x, t.y) === T_ICE;
    const accel = onIce ? 3.2 : 11;
    const spd = def.speed * (t.boostT > 0 ? 1.65 : 1);
    t.vx += (mx * spd - t.vx) * Math.min(1, accel * dt);
    t.vy += (my * spd - t.vy) * Math.min(1, accel * dt);
    const nx = t.x + t.vx * dt;
    if (circleFree(w, nx, t.y, t)) t.x = nx; else t.vx = 0;
    const ny = t.y + t.vy * dt;
    if (circleFree(w, t.x, ny, t)) t.y = ny; else t.vy = 0;
    t.x = Math.max(TILE + R, Math.min(WORLD - TILE - R, t.x));
    t.y = Math.max(TILE + R, Math.min(WORLD - TILE - R, t.y));

    // турель к прицелу
    t.turret = Math.atan2(inp.aimY - t.y, inp.aimX - t.x);

    // зона
    if (Math.hypot(t.x - w.zoneX, t.y - w.zoneY) > w.zoneR) {
      damage(w, t, 16 * dt, "__zone", "ЗОНА");
    }
    // сапёр чинится вне боя
    if (t.cls === "engineer" && w.time - t.lastCombat > 4 && t.hp < t.maxHp) {
      t.hp = Math.min(t.maxHp, t.hp + 7 * dt);
    }

    // огонь
    if (inp.fire && t.cd <= 0) shoot(w, t);
    // утилита
    if (inp.util && t.util && t.utilCd <= 0) useUtil(w, t);
  }

  updateBullets(w, dt);
  updateMines(w, dt);
  updatePickups(w);
}

function respawn(w: World, t: TankS) {
  const [sx, sy] = findSpawn(w, t.id);
  t.x = sx; t.y = sy; t.vx = 0; t.vy = 0;
  t.hp = t.maxHp; t.dead = false; t.invulnT = 2; t.shieldT = 0; t.boostT = 0;
  t.streak = 0; t.lastCombat = -10;
  if (t.ammo !== Infinity) t.ammo = Math.max(3, Math.ceil(t.ammo / 2));
  fx(w, "spawn", sx, sy, 0, 0.6);
}

function shoot(w: World, t: TankS) {
  const wdef = WEAPONS[t.weapon];
  const def = CLASSES[t.cls];
  t.cd = wdef.rate / def.rate;
  const mx = t.x + Math.cos(t.turret) * 30, my = t.y + Math.sin(t.turret) * 30;
  const dmg = wdef.dmg * def.dmg;
  if (t.weapon === "laser") {
    fireLaser(w, t, mx, my, dmg);
  } else {
    const pellets = wdef.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const a = t.turret + (pellets > 1 ? (Math.random() - 0.5) * (wdef.spread || 0) : (Math.random() - 0.5) * 0.03);
      w.bullets.push({ x: mx, y: my, vx: Math.cos(a) * wdef.speed, vy: Math.sin(a) * wdef.speed, dmg, owner: t.id, kind: t.weapon, life: 1.6 });
    }
  }
  if (t.ammo !== Infinity) {
    t.ammo--;
    if (t.ammo <= 0) { t.weapon = "mg"; t.ammo = Infinity; }
  }
  fx(w, "shot", mx, my, 0, 0.12, 0, 0, "", t.weapon);
}

function fireLaser(w: World, t: TankS, x0: number, y0: number, dmg: number) {
  const dx = Math.cos(t.turret), dy = Math.sin(t.turret);
  let x = x0, y = y0, ex = x0, ey = y0;
  const hitSet = new Set<string>();
  for (let i = 0; i < 75; i++) {
    x += dx * 12; y += dy * 12;
    ex = x; ey = y;
    if (x < TILE || y < TILE || x > WORLD - TILE || y > WORLD - TILE) break;
    const v = tileAt(w, x, y);
    if (v === T_STEEL) break;
    if (v === T_BRICK) {
      const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
      dig(w, r * TN + c);
      fx(w, "brick", c * TILE + 24, r * TILE + 24, 0, 0.3);
      break;
    }
    for (const o of w.tanks) {
      if (o.id === t.id || o.dead || hitSet.has(o.id)) continue;
      if (Math.hypot(o.x - x, o.y - y) < 24) { hitSet.add(o.id); damage(w, o, dmg, t.id, WEAPONS.laser.name); }
    }
  }
  fx(w, "beam", x0, y0, 0, 0.09, ex, ey);
}

function useUtil(w: World, t: TankS) {
  const u = t.util!;
  t.util = null; t.utilCd = 0.6;
  if (u === "shield") { t.shieldT = 4.5; fx(w, "shield", t.x, t.y, 0, 0.5); }
  else if (u === "repair") { t.hp = Math.min(t.maxHp, t.hp + 50); fx(w, "heal", t.x, t.y, 0, 0.7, 0, 0, "+50", "#a8f637"); }
  else if (u === "boost") { t.boostT = 6; fx(w, "boost", t.x, t.y, 0, 0.5); }
  else if (u === "mine" && t.mineCd <= 0) {
    w.mines.push({ x: t.x - Math.cos(t.turret) * 34, y: t.y - Math.sin(t.turret) * 34, owner: t.id, arm: 0.7 });
    fx(w, "mineplace", t.x - Math.cos(t.turret) * 34, t.y - Math.sin(t.turret) * 34, 0, 0.3);
    t.mineCd = 2;
    if (w.mines.filter((m) => m.owner === t.id).length > 3) w.mines = w.mines.filter((m) => m.owner !== t.id).concat(w.mines.filter((m) => m.owner === t.id).slice(-3));
  }
}

function updateBullets(w: World, dt: number) {
  for (const b of w.bullets) {
    b.life -= dt;
    if (b.life <= 0) { b.dmg = -1; continue; }
    const dist = Math.hypot(b.vx, b.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / 12));
    for (let s = 0; s < steps; s++) {
      b.x += (b.vx * dt) / steps; b.y += (b.vy * dt) / steps;
      const v = tileAt(w, b.x, b.y);
      if (solidForBullet(v)) {
        if (v === T_BRICK && b.kind !== "rocket") {
          const c = Math.floor(b.x / TILE), r = Math.floor(b.y / TILE);
          dig(w, r * TN + c);
          fx(w, "brick", c * TILE + 24, r * TILE + 24, 0, 0.3);
        }
        if (b.kind === "rocket") { explode(w, b.x, b.y, WEAPONS.rocket.aoe || 70, b.dmg, b.owner); }
        else fx(w, "spark", b.x, b.y, 0, 0.2);
        b.dmg = -1;
        break;
      }
      let hitTank = false;
      for (const t of w.tanks) {
        if (t.id === b.owner || t.dead) continue;
        if (Math.hypot(t.x - b.x, t.y - b.y) < 23) {
          if (b.kind === "rocket") explode(w, b.x, b.y, WEAPONS.rocket.aoe || 70, b.dmg, b.owner);
          else {
            damage(w, t, b.dmg, b.owner, WEAPONS[b.kind].name);
            fx(w, "spark", b.x, b.y, 0, 0.25);
          }
          hitTank = true;
          break;
        }
      }
      if (hitTank) { b.dmg = -1; break; }
    }
  }
  w.bullets = w.bullets.filter((b) => b.dmg >= 0);
}

function explode(w: World, x: number, y: number, r: number, dmg: number, owner: string) {
  fx(w, "boom", x, y, r, 0.55);
  for (const t of w.tanks) {
    if (t.dead) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d < r + 16) damage(w, t, dmg * (t.id === owner ? 0.35 : 1), owner, WEAPONS.rocket.name);
  }
  // ракеты крошат кирпич в зоне
  const c0 = Math.floor((x - r) / TILE), c1 = Math.floor((x + r) / TILE);
  const r0 = Math.floor((y - r) / TILE), r1 = Math.floor((y + r) / TILE);
  for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
    if (cc < 1 || rr < 1 || cc >= TN - 1 || rr >= TN - 1) continue;
    if (w.tiles[rr * TN + cc] === T_BRICK && Math.hypot((cc + 0.5) * TILE - x, (rr + 0.5) * TILE - y) < r) {
      dig(w, rr * TN + cc);
    }
  }
}

function aoeDamage(w: World, x: number, y: number, r: number, dmg: number, owner: string, destroyBrick: boolean) {
  fx(w, "boom", x, y, r, 0.7);
  for (const t of w.tanks) {
    if (t.dead) continue;
    if (Math.hypot(t.x - x, t.y - y) < r + 16) damage(w, t, dmg, owner, "АРТОБСТРЕЛ");
  }
  if (destroyBrick) explodeBricks(w, x, y, r);
}

function explodeBricks(w: World, x: number, y: number, r: number) {
  const c0 = Math.floor((x - r) / TILE), c1 = Math.floor((x + r) / TILE);
  const r0 = Math.floor((y - r) / TILE), r1 = Math.floor((y + r) / TILE);
  for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
    if (cc < 1 || rr < 1 || cc >= TN - 1 || rr >= TN - 1) continue;
    if (w.tiles[rr * TN + cc] === T_BRICK && Math.hypot((cc + 0.5) * TILE - x, (rr + 0.5) * TILE - y) < r) {
      dig(w, rr * TN + cc);
    }
  }
}

function damage(w: World, t: TankS, amount: number, attackerId: string, weaponName: string) {
  if (t.dead || t.invulnT > 0 || t.shieldT > 0) return;
  t.hp -= amount;
  t.flash = 0.1;
  t.lastCombat = w.time;
  if (attackerId !== "__zone" && attackerId !== "__art") {
    const at = w.tanks.find((o) => o.id === attackerId);
    if (at) at.lastCombat = w.time;
  }
  if (amount >= 4) fx(w, "dmg", t.x, t.y - 30, 0, 0.7, 0, 0, `-${Math.round(amount)}`, "#ff8a7a");
  if (t.hp <= 0) kill(w, t, attackerId, weaponName);
}

function kill(w: World, victim: TankS, attackerId: string, weaponName: string) {
  victim.dead = true;
  victim.deaths++;
  victim.respawnT = 2.5;
  victim.streak = 0;
  fx(w, "bigboom", victim.x, victim.y, 60, 0.8);
  const killer = w.tanks.find((t) => t.id === attackerId);
  const killerName = attackerId === "__zone" ? "ЗОНА" : attackerId === "__art" ? "АРТИЛЛЕРИЯ" : killer ? killer.name : "—";
  w.feed.push({ id: w.nextId++, killer: killerName, victim: victim.name, weapon: weaponName, t: 4 });
  if (w.feed.length > 5) w.feed.shift();
  if (killer) {
    killer.kills++;
    killer.streak++;
    killer.hp = Math.min(killer.maxHp, killer.hp + 15);
    fx(w, "heal", killer.x, killer.y, 0, 0.6, 0, 0, "+15", "#a8f637");
    if (killer.streak === 3) fx(w, "streak", killer.x, killer.y, 0, 1.2, 0, 0, `СЕРИЯ ×3`, "#ffd23a");
    if (killer.streak > 0 && killer.streak % 5 === 0) {
      // арт-обстрел по ближайшему врагу убийцы
      let target: TankS | null = null; let bd = 1e9;
      for (const o of w.tanks) {
        if (o.id === killer.id || o.dead) continue;
        const d = Math.hypot(o.x - killer.x, o.y - killer.y);
        if (d < bd) { bd = d; target = o; }
      }
      if (target) {
        fx(w, "telegraph", target.x + (Math.random() - 0.5) * 60, target.y + (Math.random() - 0.5) * 60, 85, 1.4);
        fx(w, "streak", killer.x, killer.y, 0, 1.4, 0, 0, "АРТ-ПОДДЕРЖКА", "#ff6d5a");
      }
    }
    if (w.sudden || killer.kills >= w.fragLimit) { w.over = true; w.winner = killer.id; }
  } else if (w.sudden) {
    // в зоне при внезапной смерти побеждает последний выживший
    const alive = w.tanks.filter((t) => !t.dead);
    if (alive.length === 1) { w.over = true; w.winner = alive[0].id; }
  }
}

function updateMines(w: World, dt: number) {
  for (const m of w.mines) {
    m.arm -= dt;
    if (m.arm > 0) continue;
    for (const t of w.tanks) {
      if (t.dead || t.id === m.owner) continue;
      if (Math.hypot(t.x - m.x, t.y - m.y) < 36) {
        fx(w, "mineboom", m.x, m.y, 80, 0.6);
        explodeBricks(w, m.x, m.y, 60);
        for (const o of w.tanks) {
          if (o.dead) continue;
          const d = Math.hypot(o.x - m.x, o.y - m.y);
          if (d < 96) damage(w, o, 46 * (o.id === m.owner ? 0.4 : 1), m.owner, "МИНА");
        }
        m.arm = 999;
        break;
      }
    }
  }
  w.mines = w.mines.filter((m) => m.arm < 900);
}

function updatePickups(w: World) {
  for (const p of [...w.pickups]) {
    for (const t of w.tanks) {
      if (t.dead) continue;
      if (Math.hypot(t.x - p.x, t.y - p.y) < 34) {
        if (p.type === "weapon") { t.weapon = p.sub as WeaponId; t.ammo = WEAPONS[p.sub as WeaponId].ammo; }
        else t.util = p.sub as UtilId;
        fx(w, "pickup", t.x, t.y - 34, 0, 0.8, 0, 0, p.type === "weapon" ? WEAPONS[p.sub as WeaponId].name : UTILS[p.sub as UtilId].name, p.type === "weapon" ? "#ffd76a" : "#8fe8ff");
        w.pickups = w.pickups.filter((q) => q.id !== p.id);
        break;
      }
    }
  }
}

function randomOpen(w: World): [number, number] {
  for (let i = 0; i < 40; i++) {
    const x = TILE * 2 + Math.random() * (WORLD - TILE * 4);
    const y = TILE * 2 + Math.random() * (WORLD - TILE * 4);
    if (circleFree(w, x, y)) return [x, y];
  }
  return [WORLD / 2, WORLD / 2];
}

// ---------------- боты ----------------
export function botInputs(w: World, dt: number): Record<string, Input> {
  const out: Record<string, Input> = {};
  for (const t of w.tanks) {
    if (!t.bot || t.dead) continue;
    out[t.id] = botThink(w, t, dt);
  }
  return out;
}

function botThink(w: World, t: TankS, dt: number): Input {
  t.aiT -= dt;
  const inp: Input = { ...NEUTRAL, aimX: t.x + Math.cos(t.turret) * 200, aimY: t.y + Math.sin(t.turret) * 200 };
  const enemies = w.tanks.filter((o) => o.id !== t.id && !o.dead);
  let target: TankS | null = null; let bd = 1e9;
  for (const o of enemies) {
    const d = Math.hypot(o.x - t.x, o.y - t.y);
    if (d < bd && d < 660 && hasLOS(w, t.x, t.y, o.x, o.y)) { bd = d; target = o; }
  }

  // утилиты
  if (t.util && t.utilCd <= 0) {
    if (t.util === "repair" && t.hp < t.maxHp * 0.55) inp.util = true;
    else if (t.util === "shield" && target && bd < 320 && t.hp < t.maxHp * 0.5) inp.util = true;
    else if (t.util === "boost" && !target && Math.hypot(t.roamX - t.x, t.roamY - t.y) > 400) inp.util = true;
    else if (t.util === "mine" && ((target && bd < 240) || Math.random() < dt * 0.15)) inp.util = true;
  }

  // избегание арт-обстрела
  for (const e of w.effects) {
    if (e.kind === "telegraph" && Math.hypot(e.x - t.x, e.y - t.y) < e.r + 70) {
      const ax = t.x - e.x, ay = t.y - e.y;
      const l = Math.hypot(ax, ay) || 1;
      inp.left = ax / l < -0.3; inp.right = ax / l > 0.3;
      inp.up = ay / l < -0.3; inp.down = ay / l > 0.3;
      return inp;
    }
  }
  // из зоны
  if (Math.hypot(t.x - w.zoneX, t.y - w.zoneY) > w.zoneR - 90) {
    const ax = w.zoneX - t.x, ay = w.zoneY - t.y, l = Math.hypot(ax, ay) || 1;
    inp.left = ax / l < -0.3; inp.right = ax / l > 0.3;
    inp.up = ay / l < -0.3; inp.down = ay / l > 0.3;
    if (target) aimAt(w, t, target, inp);
    return inp;
  }

  if (target) {
    aimAt(w, t, target, inp);
    inp.fire = true;
    const want = t.weapon === "shotgun" ? 170 : t.weapon === "rocket" ? 430 : t.weapon === "laser" ? 470 : 330;
    const dx = target.x - t.x, dy = target.y - t.y, l = Math.hypot(dx, dy) || 1;
    const radial = bd > want + 40 ? 1 : bd < want - 40 ? -1 : 0;
    const tang = Math.sin(w.time * 1.3 + t.x) > 0 ? 1 : -1;
    const mx = (dx / l) * radial + (-dy / l) * tang * 0.8;
    const my = (dy / l) * radial + (dx / l) * tang * 0.8;
    inp.left = mx < -0.3; inp.right = mx > 0.3; inp.up = my < -0.3; inp.down = my > 0.3;
  } else {
    // за добычей или патруль
    let goal: [number, number] | null = null;
    let pd = 560;
    for (const p of w.pickups) {
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      if (d < pd) { pd = d; goal = [p.x, p.y]; }
    }
    if (!goal) {
      if (t.aiT <= 0 || Math.hypot(t.roamX - t.x, t.roamY - t.y) < 70) {
        t.aiT = 2 + Math.random() * 2;
        [t.roamX, t.roamY] = randomOpen(w);
      }
      goal = [t.roamX, t.roamY];
    }
    const dx = goal[0] - t.x, dy = goal[1] - t.y, l = Math.hypot(dx, dy) || 1;
    inp.left = dx / l < -0.3; inp.right = dx / l > 0.3;
    inp.up = dy / l < -0.3; inp.down = dy / l > 0.3;
    inp.aimX = t.x + (dx / l) * 220; inp.aimY = t.y + (dy / l) * 220;
  }
  // обход стен: если уткнулись — свернуть
  if (!circleFree(w, t.x + t.vx * 0.22, t.y + t.vy * 0.22, t)) {
    const s = Math.random() < 0.5 ? 1 : -1;
    const tmpL = inp.left, tmpR = inp.right;
    if (s > 0) { inp.left = inp.up; inp.right = inp.down; inp.up = tmpR; inp.down = tmpL; }
    else { inp.left = inp.down; inp.right = inp.up; inp.up = tmpL; inp.down = tmpR; }
  }
  return inp;
}

function aimAt(w: World, t: TankS, target: TankS, inp: Input) {
  const wdef = WEAPONS[t.weapon];
  const dist = Math.hypot(target.x - t.x, target.y - t.y);
  const bs = wdef.speed || 900;
  const lead = Math.min(0.5, dist / bs);
  inp.aimX = target.x + target.vx * lead;
  inp.aimY = target.y + target.vy * lead;
  void w;
}

// ---------------- снапшоты (сеть) ----------------
export interface SnapTank {
  id: string; name: string; cls: TankClass; color: string; bot: boolean;
  x: number; y: number; turret: number; hp: number; maxHp: number;
  weapon: WeaponId; ammo: number; util: UtilId | null; shieldT: number; boostT: number;
  invulnT: number; kills: number; deaths: number; streak: number; dead: boolean; respawnT: number;
}
export interface Snapshot {
  matchT: number; sudden: boolean; zone: [number, number, number];
  tilesVersion: number; tilesChanged: number[];
  tanks: SnapTank[];
  bullets: [number, number, number, number, WeaponId, string][];
  pickups: [number, number, number, string, string][];
  mines: [number, number, string, number][];
  effects: [number, string, number, number, number, number, number, string, string, number, number][];
  feed: [number, string, string, string, number][];
  over: boolean; winner: string | null;
}

export function makeSnapshot(w: World): Snapshot {
  return {
    matchT: w.matchT, sudden: w.sudden, zone: [w.zoneX, w.zoneY, w.zoneR],
    tilesVersion: 0, tilesChanged: w.dirty.splice(0, w.dirty.length),
    tanks: w.tanks.map((t) => ({
      id: t.id, name: t.name, cls: t.cls, color: t.color, bot: t.bot,
      x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10, turret: Math.round(t.turret * 100) / 100,
      hp: Math.round(t.hp), maxHp: t.maxHp, weapon: t.weapon, ammo: t.ammo === Infinity ? -1 : t.ammo, util: t.util,
      shieldT: Math.round(t.shieldT * 10) / 10, boostT: Math.round(t.boostT * 10) / 10, invulnT: t.invulnT,
      kills: t.kills, deaths: t.deaths, streak: t.streak, dead: t.dead, respawnT: Math.round(t.respawnT * 10) / 10,
    })),
    bullets: w.bullets.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), b.kind, b.owner]),
    pickups: w.pickups.map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.type, p.sub]),
    mines: w.mines.map((m) => [Math.round(m.x), Math.round(m.y), m.owner, Math.round(m.arm * 10) / 10]),
    effects: w.effects.map((e) => [e.id, e.kind, Math.round(e.x), Math.round(e.y), e.r, Math.round(e.t * 100) / 100, e.max, e.txt, e.color, Math.round(e.x2), Math.round(e.y2)]),
    feed: w.feed.map((f) => [f.id, f.killer, f.victim, f.weapon, Math.round(f.t * 10) / 10]),
    over: w.over, winner: w.winner,
  };
}

export function applySnapshot(w: World, s: Snapshot) {
  for (const idx of s.tilesChanged) w.tiles[idx] = T_EMPTY;
  w.matchT = s.matchT; w.sudden = s.sudden;
  w.zoneX = s.zone[0]; w.zoneY = s.zone[1]; w.zoneR = s.zone[2];
  w.over = s.over; w.winner = s.winner;
  for (const st of s.tanks) {
    let t = w.tanks.find((o) => o.id === st.id);
    if (!t) {
      t = {
        id: st.id, name: st.name, cls: st.cls, color: st.color, bot: st.bot,
        x: st.x, y: st.y, vx: 0, vy: 0, turret: st.turret, hp: st.hp, maxHp: st.maxHp,
        shieldT: st.shieldT, boostT: st.boostT, invulnT: st.invulnT, weapon: st.weapon,
        ammo: st.ammo < 0 ? Infinity : st.ammo, util: st.util, utilCd: 0, kills: st.kills, deaths: st.deaths, streak: st.streak,
        cd: 0, dead: st.dead, respawnT: st.respawnT, lastCombat: 0, mineCd: 0, aiT: 0,
        roamX: st.x, roamY: st.y, flash: 0,
      };
      w.tanks.push(t);
    } else {
      t.x = st.x; t.y = st.y; t.turret = st.turret; t.hp = st.hp; t.weapon = st.weapon;
      t.ammo = st.ammo < 0 ? Infinity : st.ammo; t.util = st.util; t.shieldT = st.shieldT; t.boostT = st.boostT;
      t.invulnT = st.invulnT; t.kills = st.kills; t.deaths = st.deaths; t.streak = st.streak;
      t.dead = st.dead; t.respawnT = st.respawnT; t.name = st.name; t.color = st.color; t.cls = st.cls;
    }
  }
  w.tanks = w.tanks.filter((t) => s.tanks.some((st) => st.id === t.id));
  w.bullets = s.bullets.map(([x, y, vx, vy, kind, owner]) => ({ x, y, vx, vy, kind, owner, dmg: 1, life: 1 }));
  w.pickups = s.pickups.map(([id, x, y, type, sub]) => ({ id, x, y, type: type as "weapon" | "util", sub, beacon: true }));
  w.mines = s.mines.map(([x, y, owner, arm]) => ({ x, y, owner, arm }));
  w.effects = s.effects.map(([id, kind, x, y, r, t, max, txt, color, x2, y2]) => ({ id, kind, x, y, x2, y2, r, t, max, txt, color }));
  w.feed = s.feed.map(([id, killer, victim, weapon, t]) => ({ id, killer, victim, weapon, t }));
}
