/* Движок «Стального Рубежа» — канвас, 60 FPS, всё рисуется процедурно. */
import { audio } from "./audio";
import { LEVELS, levelName } from "./levels";

export type Phase = "menu" | "intro" | "playing" | "paused" | "clear" | "gameover" | "victory";

export interface HudSnapshot {
  phase: Phase;
  score: number;
  best: number;
  newBest: boolean;
  lives: number;
  level: number;
  levelTitle: string;
  enemiesLeft: number;
  star: number;
  muted: boolean;
  kills: number;
  accuracy: number;
  powerups: number;
  reason: string;
}

const N = 26;
const TILE = 24;
export const SIZE = N * TILE; // 624
const TANK = 46;

const EMPTY = 0, BRICK = 1, STEEL = 2, WATER = 3, TREE = 4, ICE = 5, EAGLE = 6;
const DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const;
type Dir = 0 | 1 | 2 | 3;
type Kind = "player" | "basic" | "fast" | "power" | "armor";

interface Tank {
  x: number; y: number; dir: Dir; vx: number; vy: number; base: number;
  kind: Kind; hp: number; cd: number; star: number; shield: number;
  spawnT: number; flash: number; ai: number; recoil: number; tread: number;
  isFlash: boolean; hitWall: boolean;
}
interface Bullet {
  x: number; y: number; dir: Dir; speed: number; power: number;
  owner: "p" | "e"; dead: boolean; trail: { x: number; y: number }[];
}
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  size: number; color: string; kind: "spark" | "smoke" | "debris" | "flash" | "ring";
}
interface Popup { x: number; y: number; txt: string; t: number; color: string; }
interface PowerUp { x: number; y: number; type: string; t: number; }

const ENEMY_DEF: Record<Exclude<Kind, "player">, {
  hp: number; speed: number; bullet: number; cd: number; score: number; body: string; dark: string;
}> = {
  basic: { hp: 1, speed: 78, bullet: 235, cd: 1.7, score: 100, body: "#b9c6ae", dark: "#6d7a62" },
  fast:  { hp: 1, speed: 132, bullet: 255, cd: 1.5, score: 200, body: "#54d8e8", dark: "#1f8899" },
  power: { hp: 1, speed: 88, bullet: 385, cd: 1.15, score: 300, body: "#ff6d9d", dark: "#b02a58" },
  armor: { hp: 4, speed: 60, bullet: 240, cd: 1.45, score: 400, body: "#9a8f82", dark: "#5c5348" },
};

const PLAYER_SHOT_CD = [0.34, 0.26, 0.2, 0.17];
const PLAYER_MAX_SHOTS = [1, 1, 2, 2];
const PLAYER_BULLET_SPEED = [300, 360, 420, 460];

const FORT: [number, number][] = (() => {
  const a: [number, number][] = [];
  for (let c = 10; c <= 15; c++) a.push([c, 22]);
  for (let r = 23; r <= 25; r++) { a.push([10, r]); a.push([15, r]); }
  return a;
})();

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class BattleCity {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hudCb: (s: HudSnapshot) => void;
  private lastSnap = "";

  private grid = new Uint8Array(N * N);
  private tanks: Tank[] = [];
  private player: Tank | null = null;
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private powerups: PowerUp[] = [];

  phase: Phase = "menu";
  private score = 0; private best = 0; private newBest = false;
  private lives = 3; private level = 1; private star = 0;
  private kills = 0; private runPowerups = 0;
  private lvlShots = 0; private lvlHits = 0;
  private reason = "";

  private queue: Kind[] = [];
  private spawnCounter = 0; private spawnCd = 0; private spawnPoint = 0;
  private introT = 0; private clearT = 0; private respawnT = 0;
  private freezeT = 0; private shovelT = 0; private fortSnapshot: number[] | null = null;
  private eagleAlive = true;
  private pendingOver: { t: number; reason: string } | null = null;
  private shake = 0; private redFlash = 0;
  private time = 0; private raf = 0; private last = 0;
  private destroyed = false;

  private keys = new Set<string>();
  private touchDir: Dir | null = null; private touchFire = false;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onBlur: () => void;
  private onPointer: () => void;

  constructor(canvas: HTMLCanvasElement, hudCb: (s: HudSnapshot) => void) {
    this.cv = canvas;
    this.hudCb = hudCb;
    const dpr = 2;
    canvas.width = SIZE * dpr; canvas.height = SIZE * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    this.ctx = ctx;
    this.best = parseInt(localStorage.getItem("steel-frontier-best") || "0", 10) || 0;

    this.onKeyDown = (e) => this.keyDown(e);
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onBlur = () => { if (this.phase === "playing") this.togglePause(); };
    this.onPointer = () => audio.ensure();

    this.loadLevel(1, true); // фон для меню
    this.phase = "menu";

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointerdown", this.onPointer);

    this.last = performance.now();
    const loop = (now: number) => {
      if (this.destroyed) return;
      const dt = clamp((now - this.last) / 1000, 0, 0.05);
      this.last = now;
      this.time += dt;
      this.update(dt);
      this.draw();
      this.pushHud();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerdown", this.onPointer);
  }

  // ============================= INPUT =============================
  private keyDown(e: KeyboardEvent) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    audio.ensure();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "KeyM") this.toggleMute();
    if (e.code === "Enter") this.enterPressed();
    if ((e.code === "KeyP" || e.code === "Escape") && (this.phase === "playing" || this.phase === "paused")) this.togglePause();
  }

  setTouchDir(d: Dir | null) { this.touchDir = d; audio.ensure(); }
  setTouchFire(f: boolean) { this.touchFire = f; audio.ensure(); }

  private enterPressed() {
    switch (this.phase) {
      case "menu": case "gameover": this.startRun(); break;
      case "victory": this.continueWar(); break;
      case "paused": this.togglePause(); break;
      case "intro": this.introT = Math.min(this.introT, 0.02); break;
      case "clear": this.clearT = Math.min(this.clearT, 0.02); break;
      default: break;
    }
  }

  startRun() {
    this.score = 0; this.lives = 3; this.kills = 0; this.runPowerups = 0; this.newBest = false;
    audio.ensure();
    this.loadLevel(1);
  }
  continueWar() { this.loadLevel(this.level + 1); }
  backToMenu() { this.phase = "menu"; this.loadLevel(1, true); }
  togglePause() {
    if (this.phase === "playing") { this.phase = "paused"; audio.pauseBlip(); }
    else if (this.phase === "paused") { this.phase = "playing"; audio.pauseBlip(); this.last = performance.now(); }
  }
  toggleMute() { audio.setMuted(!audio.muted); }

  // ============================= LEVELS =============================
  private loadLevel(lv: number, silent = false) {
    this.level = lv;
    const def = LEVELS[(lv - 1) % LEVELS.length];
    const cycle = Math.floor((lv - 1) / LEVELS.length);
    const g = this.grid;
    g.fill(EMPTY);
    for (let r = 0; r < 13; r++) {
      const row = def.map[r] || "";
      for (let c = 0; c < 13; c++) {
        const ch = row[c] || ".";
        const v = ch === "B" ? BRICK : ch === "S" ? STEEL : ch === "W" ? WATER : ch === "T" ? TREE : ch === "I" ? ICE : EMPTY;
        if (v !== EMPTY) {
          g[(r * 2) * N + c * 2] = v; g[(r * 2) * N + c * 2 + 1] = v;
          g[(r * 2 + 1) * N + c * 2] = v; g[(r * 2 + 1) * N + c * 2 + 1] = v;
        }
      }
    }
    // вырезаем спавны врагов, спавн игрока, зону Орла
    const clear = (c0: number, r0: number, w: number, h: number) => {
      for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) g[r * N + c] = EMPTY;
    };
    clear(0, 0, 2, 2); clear(12, 0, 2, 2); clear(24, 0, 2, 2);
    clear(8, 24, 2, 2);
    clear(10, 22, 6, 4);
    for (const [c, r] of FORT) g[r * N + c] = BRICK;
    for (let r = 24; r <= 25; r++) for (let c = 12; c <= 13; c++) g[r * N + c] = EAGLE;

    // очередь врагов
    const speedMul = Math.min(1.6, 1 + cycle * 0.12);
    const q: Kind[] = [];
    const push = (k: Kind, n: number) => { for (let i = 0; i < n; i++) q.push(k); };
    push("basic", def.comp.basic + cycle * 3);
    push("fast", def.comp.fast + cycle);
    push("power", def.comp.power + cycle);
    push("armor", def.comp.armor + cycle);
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    this.queue = q;
    (this as any)._speedMul = speedMul;
    (this as any)._armorHp = Math.min(7, 4 + cycle);
    (this as any)._fireMul = 1 + cycle * 0.2;

    this.tanks = []; this.bullets = []; this.powerups = []; this.popups = [];
    this.particles = [];
    this.spawnCounter = 0; this.spawnCd = 1.0; this.spawnPoint = 0;
    this.freezeT = 0; this.shovelT = 0; this.fortSnapshot = null;
    this.eagleAlive = true; this.pendingOver = null;
    this.lvlShots = 0; this.lvlHits = 0; this.respawnT = 0;
    this.shake = 0; this.redFlash = 0;

    this.player = this.makeTank("player", 8 * TILE, 24 * TILE);
    this.player.star = this.star;
    this.player.shield = 3;
    this.tanks.push(this.player);

    this.phase = "intro";
    this.introT = 1.9;
    if (!silent) audio.levelStart();
  }

  private makeTank(kind: Kind, x: number, y: number): Tank {
    const base = kind === "player" ? 138 : ENEMY_DEF[kind as Exclude<Kind, "player">].speed * (this as any)._speedMul;
    return {
      x, y, dir: kind === "player" ? 0 : 2, vx: 0, vy: 0, base,
      kind, hp: kind === "armor" ? (this as any)._armorHp : 1, cd: rnd(0.4, 1.2),
      star: 0, shield: 0, spawnT: kind === "player" ? 0 : 0.85, flash: 0,
      ai: rnd(0.3, 1.2), recoil: 0, tread: 0, isFlash: false, hitWall: false,
    };
  }

  // ============================= UPDATE =============================
  private update(dt: number) {
    if (this.phase === "paused") return;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.redFlash = Math.max(0, this.redFlash - dt * 1.6);
    this.updateFx(dt);

    if (this.phase === "intro") {
      this.introT -= dt;
      if (this.introT <= 0) this.phase = "playing";
      return;
    }
    if (this.phase === "clear") {
      this.clearT -= dt;
      this.updatePlayer(dt);
      this.updateBullets(dt);
      if (this.clearT <= 0) {
        if (this.level % LEVELS.length === 0) { this.phase = "victory"; audio.victory(); this.saveBest(); }
        else this.loadLevel(this.level + 1);
      }
      return;
    }
    if (this.phase === "gameover" || this.phase === "victory") return;
    if (this.phase === "menu") {
      if (Math.random() < dt * 3) {
        this.particles.push({ x: rnd(0, SIZE), y: rnd(0, SIZE), vx: rnd(-4, 4), vy: rnd(-9, -3), life: 2.4, max: 2.4, size: rnd(1, 2.4), color: "rgba(168,246,55,0.5)", kind: "spark" });
      }
      return;
    }

    // ---- playing ----
    if (this.pendingOver) {
      this.pendingOver.t -= dt;
      if (this.pendingOver.t <= 0) {
        this.phase = "gameover"; this.reason = this.pendingOver.reason;
        audio.gameOver(); this.saveBest(); this.pendingOver = null;
      }
    }
    if (this.freezeT > 0) this.freezeT -= dt;
    if (this.shovelT > 0) {
      this.shovelT -= dt;
      if (this.shovelT <= 0) this.fortify(false);
    }
    if (this.respawnT > 0) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.tryRespawn();
    }
    this.updatePlayer(dt);
    this.updateSpawning(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updatePowerups(dt);
    this.checkClear();
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    if (!p) return;
    if (p.spawnT > 0) { p.spawnT -= dt; return; }
    p.shield = Math.max(0, p.shield - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.recoil = Math.max(0, p.recoil - dt * 6);
    p.base = 138 + p.star * 13;

    let dir: Dir | null = null;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW") || this.touchDir === 0) dir = 0;
    else if (this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.touchDir === 1) dir = 1;
    else if (this.keys.has("ArrowDown") || this.keys.has("KeyS") || this.touchDir === 2) dir = 2;
    else if (this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.touchDir === 3) dir = 3;

    if (dir !== null) { this.steer(p, dir); this.moveTank(p, dt); }
    else {
      const f = 1 - Math.pow(0.55, dt * 60);
      p.vx *= 1 - f; p.vy *= 1 - f;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (!this.collides(nx, p.y, p)) p.x = nx; else p.vx = 0;
      if (!this.collides(p.x, ny, p)) p.y = ny; else p.vy = 0;
    }
    p.cd -= dt;
    if ((this.keys.has("Space") || this.keys.has("KeyJ") || this.touchFire) && p.cd <= 0) this.firePlayer(p);
  }

  private steer(t: Tank, dir: Dir) {
    if (dir === t.dir) return;
    const newAxis = dir % 2;
    if (t.dir % 2 !== newAxis) {
      // доворот в «коридор»: привязка к сетке 24px по поперечной оси
      if (newAxis === 1) {
        const target = Math.round(t.y / TILE) * TILE;
        if (!this.collides(t.x, target, t)) t.y = target;
      } else {
        const target = Math.round(t.x / TILE) * TILE;
        if (!this.collides(target, t.y, t)) t.x = target;
      }
    }
    t.dir = dir;
  }

  private moveTank(t: Tank, dt: number) {
    const d = DIRS[t.dir];
    const onIce = this.tileAt(t.x + TANK / 2, t.y + TANK / 2) === ICE;
    const lerp = onIce ? 0.055 : 0.42;
    const f = 1 - Math.pow(1 - lerp, dt * 60);
    t.vx += (d.x * t.base - t.vx) * f;
    t.vy += (d.y * t.base - t.vy) * f;
    t.tread += Math.hypot(t.vx, t.vy) * dt;
    t.hitWall = false;

    if (Math.abs(t.vx) > 2) {
      const nx = t.x + t.vx * dt;
      if (!this.collides(nx, t.y, t)) t.x = nx;
      else {
        t.vx = 0; t.hitWall = true;
        const target = Math.round(t.y / TILE) * TILE;
        const dy = clamp(target - t.y, -80 * dt, 80 * dt);
        if (Math.abs(dy) > 0.4 && !this.collides(t.x, t.y + dy, t)) t.y += dy;
      }
    }
    if (Math.abs(t.vy) > 2) {
      const ny = t.y + t.vy * dt;
      if (!this.collides(t.x, ny, t)) t.y = ny;
      else {
        t.vy = 0; t.hitWall = true;
        const target = Math.round(t.x / TILE) * TILE;
        const dx = clamp(target - t.x, -80 * dt, 80 * dt);
        if (Math.abs(dx) > 0.4 && !this.collides(t.x + dx, t.y, t)) t.x += dx;
      }
    }
  }

  private tileAt(x: number, y: number): number {
    const c = clamp(Math.floor(x / TILE), 0, N - 1), r = clamp(Math.floor(y / TILE), 0, N - 1);
    return this.grid[r * N + c];
  }

  private solidTile(v: number) { return v === BRICK || v === STEEL || v === WATER || v === EAGLE; }

  private collides(x: number, y: number, self: Tank | null): boolean {
    if (x < 0 || y < 0 || x + TANK > SIZE || y + TANK > SIZE) return true;
    const c0 = Math.floor(x / TILE), c1 = Math.floor((x + TANK - 0.5) / TILE);
    const r0 = Math.floor(y / TILE), r1 = Math.floor((y + TANK - 0.5) / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (this.solidTile(this.grid[r * N + c])) return true;
    }
    for (const o of this.tanks) {
      if (o === self || o.spawnT > 0 || o.hp <= 0) continue;
      if (x < o.x + TANK - 3 && x + TANK - 3 > o.x && y < o.y + TANK - 3 && y + TANK - 3 > o.y) return true;
    }
    return false;
  }

  // ============================= ENEMIES =============================
  private updateSpawning(dt: number) {
    if (!this.queue.length) return;
    this.spawnCd -= dt;
    if (this.spawnCd > 0) return;
    const active = this.tanks.filter((t) => t.kind !== "player").length;
    if (active >= 4) { this.spawnCd = 0.4; return; }
    const pts = [0, 12 * TILE, 24 * TILE];
    for (let i = 0; i < 3; i++) {
      const idx = (this.spawnPoint + i) % 3;
      const x = pts[idx];
      if (!this.collides(x, 0, null)) {
        this.spawnPoint = (idx + 1) % 3;
        const kind = this.queue.shift()!;
        const t = this.makeTank(kind, x, 0);
        this.spawnCounter++;
        t.isFlash = this.spawnCounter % 4 === 0;
        this.tanks.push(t);
        this.spawnCd = Math.max(1.1, 2.3 - this.level * 0.08);
        return;
      }
    }
    this.spawnCd = 0.5;
  }

  private pickDir(t: Tank): Dir {
    const cx = t.x + TANK / 2, cy = t.y + TANK / 2;
    const usePlayer = this.player && Math.random() < 0.45;
    const tx = usePlayer ? this.player!.x + TANK / 2 : 13 * TILE;
    const ty = usePlayer ? this.player!.y + TANK / 2 : 25 * TILE;
    const scored = ([0, 1, 2, 3] as Dir[]).map((d) => ({
      d,
      s: DIRS[d].x * (tx - cx) + DIRS[d].y * (ty - cy) + rnd(-30, 30),
    })).sort((a, b) => b.s - a.s);
    const roll = Math.random();
    if (roll < 0.5) return scored[0].d;
    if (roll < 0.75) return scored[1].d;
    return scored[2 + Math.floor(Math.random() * 2)].d;
  }

  private updateEnemies(dt: number) {
    for (const t of this.tanks) {
      if (t.kind === "player") continue;
      if (t.spawnT > 0) { t.spawnT -= dt; continue; }
      t.flash = Math.max(0, t.flash - dt);
      t.recoil = Math.max(0, t.recoil - dt * 6);
      if (this.freezeT > 0) continue;
      t.ai -= dt;
      const d = DIRS[t.dir];
      const blockedAhead = this.collides(t.x + d.x * 4, t.y + d.y * 4, t);
      if (t.hitWall || blockedAhead || t.ai <= 0) {
        this.steer(t, this.pickDir(t));
        t.ai = rnd(0.7, 2.1);
      }
      this.moveTank(t, dt);

      t.cd -= dt;
      const aiming = this.isAiming(t);
      const chance = (t.kind === "power" ? 1.5 : 0.85) * (this as any)._fireMul * (aiming ? 3 : 1);
      if (t.cd <= 0 && Math.random() < dt * chance) {
        this.fireEnemy(t);
        const def = ENEMY_DEF[t.kind as Exclude<Kind, "player">];
        t.cd = def.cd * rnd(0.6, 1.4);
      }
    }
    this.tanks = this.tanks.filter((t) => t.hp > 0 || t.kind === "player");
  }

  private isAiming(t: Tank): boolean {
    const d = DIRS[t.dir];
    const cx = t.x + TANK / 2, cy = t.y + TANK / 2;
    const targets: { x: number; y: number }[] = [{ x: 13 * TILE, y: 25 * TILE }];
    if (this.player) targets.push({ x: this.player.x + TANK / 2, y: this.player.y + TANK / 2 });
    for (const tg of targets) {
      const dx = tg.x - cx, dy = tg.y - cy;
      const along = dx * d.x + dy * d.y;
      if (along <= 0) continue;
      const perp = Math.abs(dx * d.y - dy * d.x);
      if (perp < 42) return true;
    }
    return false;
  }

  // ============================= FIRE =============================
  private firePlayer(p: Tank) {
    const mine = this.bullets.filter((b) => b.owner === "p" && !b.dead).length;
    if (mine >= PLAYER_MAX_SHOTS[p.star]) return;
    const d = DIRS[p.dir];
    const cx = p.x + TANK / 2 + d.x * (TANK / 2 + 6);
    const cy = p.y + TANK / 2 + d.y * (TANK / 2 + 6);
    this.bullets.push({ x: cx, y: cy, dir: p.dir, speed: PLAYER_BULLET_SPEED[p.star], power: p.star >= 3 ? 2 : 1, owner: "p", dead: false, trail: [] });
    p.cd = PLAYER_SHOT_CD[p.star];
    p.recoil = 1;
    this.lvlShots++;
    audio.shoot();
    this.muzzle(cx, cy, "#ffd76a");
  }

  private fireEnemy(t: Tank) {
    const d = DIRS[t.dir];
    const def = ENEMY_DEF[t.kind as Exclude<Kind, "player">];
    const cx = t.x + TANK / 2 + d.x * (TANK / 2 + 6);
    const cy = t.y + TANK / 2 + d.y * (TANK / 2 + 6);
    this.bullets.push({ x: cx, y: cy, dir: t.dir, speed: def.bullet * (this as any)._speedMul * 0.5 + def.bullet * 0.5, power: 1, owner: "e", dead: false, trail: [] });
    t.recoil = 1;
    audio.enemyShoot();
    this.muzzle(cx, cy, "#bfe8ff");
  }

  private muzzle(x: number, y: number, color: string) {
    for (let i = 0; i < 5; i++) {
      this.particles.push({ x, y, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0.14, max: 0.14, size: rnd(2, 4), color, kind: "spark" });
    }
  }

  // ============================= BULLETS =============================
  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      if (b.dead) continue;
      const d = DIRS[b.dir];
      const dist = b.speed * dt;
      const steps = Math.max(1, Math.ceil(dist / 5));
      for (let i = 0; i < steps; i++) {
        b.x += (d.x * dist) / steps;
        b.y += (d.y * dist) / steps;
        if (this.bulletTileHit(b)) break;
      }
      if (!b.dead && (b.x < -8 || b.y < -8 || b.x > SIZE + 8 || b.y > SIZE + 8)) b.dead = true;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 5) b.trail.shift();
    }
    // пуля <-> танк
    for (const b of this.bullets) {
      if (b.dead) continue;
      if (b.owner === "p") {
        for (const t of this.tanks) {
          if (t.kind === "player" || t.spawnT > 0 || t.hp <= 0) continue;
          if (Math.abs(b.x - (t.x + TANK / 2)) < TANK / 2 + 3 && Math.abs(b.y - (t.y + TANK / 2)) < TANK / 2 + 3) {
            b.dead = true;
            this.lvlHits++;
            t.hp -= b.power;
            t.flash = 0.09;
            if (t.hp <= 0) this.killEnemy(t);
            else { audio.steelHit(); this.sparks(b.x, b.y, "#ffe9a3", 6); }
            break;
          }
        }
      } else if (this.player && this.player.spawnT <= 0) {
        const p = this.player;
        if (Math.abs(b.x - (p.x + TANK / 2)) < TANK / 2 + 3 && Math.abs(b.y - (p.y + TANK / 2)) < TANK / 2 + 3) {
          b.dead = true;
          if (p.shield > 0) { audio.steelHit(); this.sparks(b.x, b.y, "#8fe8ff", 8); }
          else this.killPlayer();
        }
      }
    }
    // пуля <-> пуля
    for (const a of this.bullets) {
      if (a.dead || a.owner !== "p") continue;
      for (const e of this.bullets) {
        if (e.dead || e.owner !== "e") continue;
        if (Math.abs(a.x - e.x) < 9 && Math.abs(a.y - e.y) < 9) {
          a.dead = true; e.dead = true;
          audio.bulletClash();
          this.sparks((a.x + e.x) / 2, (a.y + e.y) / 2, "#ffffff", 8);
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  private bulletTileHit(b: Bullet): boolean {
    if (b.x < 0 || b.y < 0 || b.x > SIZE || b.y > SIZE) return true;
    const vertical = b.dir === 0 || b.dir === 2;
    const x0 = b.x - (vertical ? 10 : 4), x1 = b.x + (vertical ? 10 : 4);
    const y0 = b.y - (vertical ? 4 : 10), y1 = b.y + (vertical ? 4 : 10);
    const c0 = clamp(Math.floor(x0 / TILE), 0, N - 1), c1 = clamp(Math.floor(x1 / TILE), 0, N - 1);
    const r0 = clamp(Math.floor(y0 / TILE), 0, N - 1), r1 = clamp(Math.floor(y1 / TILE), 0, N - 1);
    let hit = false;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const v = this.grid[r * N + c];
      if (v === BRICK) {
        this.grid[r * N + c] = EMPTY;
        this.debris(c * TILE + TILE / 2, r * TILE + TILE / 2, "#a34f2a");
        hit = true;
      } else if (v === STEEL) {
        if (b.power >= 2) {
          this.grid[r * N + c] = EMPTY;
          this.debris(c * TILE + TILE / 2, r * TILE + TILE / 2, "#9aa7b0");
          this.sparks(c * TILE + TILE / 2, r * TILE + TILE / 2, "#dfe8ee", 6);
        }
        hit = true;
      } else if (v === EAGLE && this.eagleAlive) {
        // свои снаряды Орла не ломают — только вражеские
        if (b.owner === "e") this.destroyEagle();
        hit = true;
      }
    }
    if (hit) {
      b.dead = true;
      const v = this.tileAt(b.x, b.y);
      if (v === STEEL) audio.steelHit(); else audio.brickHit();
      this.sparks(b.x, b.y, "#ffb46a", 7);
    }
    return hit;
  }

  private destroyEagle() {
    if (!this.eagleAlive) return;
    this.eagleAlive = false;
    audio.explode(true);
    this.boom(13 * TILE, 25 * TILE, true);
    this.shake = 16; this.redFlash = 0.9;
    this.pendingOver = { t: 1.6, reason: "Орёл уничтожен" };
  }

  private killPlayer() {
    const p = this.player;
    if (!p) return;
    audio.playerDeath();
    this.boom(p.x + TANK / 2, p.y + TANK / 2, true);
    this.shake = 12; this.redFlash = 0.7;
    this.tanks = this.tanks.filter((t) => t !== p);
    this.player = null;
    this.star = 0;
    this.lives--;
    if (this.lives <= 0 && !this.pendingOver) {
      this.pendingOver = { t: 1.7, reason: "Танки закончились" };
    } else if (this.lives > 0) {
      this.respawnT = 1.1;
    }
  }

  private tryRespawn() {
    if (this.player) return;
    if (this.collides(8 * TILE, 24 * TILE, null)) { this.respawnT = 0.35; return; }
    const p = this.makeTank("player", 8 * TILE, 24 * TILE);
    p.shield = 3; p.star = this.star;
    this.player = p;
    this.tanks.push(p);
  }

  private killEnemy(t: Tank, giveDrop = true) {
    const def = ENEMY_DEF[t.kind as Exclude<Kind, "player">];
    this.kills++;
    this.score += def.score;
    this.checkBest();
    this.boom(t.x + TANK / 2, t.y + TANK / 2, false);
    this.popup(t.x + TANK / 2, t.y, `+${def.score}`, "#ffd76a");
    this.shake = Math.max(this.shake, 5);
    if (t.isFlash && giveDrop) this.dropPowerup();
    t.hp = 0;
  }

  // ============================= POWERUPS =============================
  private dropPowerup() {
    const roll = Math.random();
    const type = roll < 0.22 ? "star" : roll < 0.4 ? "shield" : roll < 0.55 ? "clock" : roll < 0.7 ? "shovel" : roll < 0.85 ? "grenade" : "tank";
    for (let i = 0; i < 24; i++) {
      const c = 2 + 2 * Math.floor(Math.random() * 11);
      const r = 2 + 2 * Math.floor(Math.random() * 10);
      let ok = true;
      for (let rr = r; rr < r + 2 && ok; rr++) for (let cc = c; cc < c + 2 && ok; cc++) {
        if (this.grid[rr * N + cc] !== EMPTY) ok = false;
      }
      if (ok) {
        this.powerups = [{ x: c * TILE, y: r * TILE, type, t: 16 }];
        return;
      }
    }
  }

  private updatePowerups(dt: number) {
    const p = this.player;
    for (const pu of this.powerups) {
      pu.t -= dt;
      if (p && p.spawnT <= 0 && pu.x < p.x + TANK && pu.x + 48 > p.x && pu.y < p.y + TANK && pu.y + 48 > p.y) {
        this.applyPowerup(pu.type, p.x + TANK / 2, p.y);
        pu.t = 0;
      }
    }
    this.powerups = this.powerups.filter((x) => x.t > 0);
  }

  private applyPowerup(type: string, px: number, py: number) {
    this.runPowerups++;
    switch (type) {
      case "star":
        if (this.player) this.player.star = Math.min(3, this.player.star + 1);
        this.star = this.player ? this.player.star : this.star;
        audio.powerup(); this.popup(px, py, "УЛУЧШЕНИЕ", "#a8f637"); break;
      case "shield":
        if (this.player) this.player.shield = 10;
        audio.shield(); this.popup(px, py, "ЩИТ", "#8fe8ff"); break;
      case "clock":
        this.freezeT = 8; audio.freeze(); this.popup(px, py, "ЗАМОРОЗКА", "#8fe8ff"); break;
      case "shovel":
        this.fortify(true); this.shovelT = 15; audio.powerup(); this.popup(px, py, "ФОРТ", "#ffd76a"); break;
      case "grenade": {
        audio.explode(true); this.shake = 14;
        this.popup(px, py, "ПОДРЫВ", "#ff6d5a");
        for (const t of [...this.tanks]) if (t.kind !== "player" && t.spawnT <= 0) this.killEnemy(t, false);
        break;
      }
      case "tank":
        this.lives++; audio.extraLife(); this.popup(px, py, "+1 ЖИЗНЬ", "#a8f637"); break;
    }
  }

  private fortify(on: boolean) {
    if (on) {
      this.fortSnapshot = FORT.map(([c, r]) => this.grid[r * N + c]);
      for (const [c, r] of FORT) this.grid[r * N + c] = STEEL;
    } else if (this.fortSnapshot) {
      FORT.forEach(([c, r], i) => { this.grid[r * N + c] = this.fortSnapshot![i]; });
      this.fortSnapshot = null;
    }
  }

  private checkClear() {
    if (this.pendingOver) return;
    const enemies = this.tanks.filter((t) => t.kind !== "player").length;
    if (this.queue.length === 0 && enemies === 0) {
      this.phase = "clear";
      this.clearT = 2.8;
      this.score += 500;
      this.checkBest();
      this.popup(13 * TILE, 12 * TILE, "+500 БОНУС", "#a8f637");
      audio.levelClear();
    }
  }

  private checkBest() {
    if (this.score > this.best) { this.best = this.score; this.newBest = true; }
  }
  private saveBest() {
    localStorage.setItem("steel-frontier-best", String(this.best));
  }

  // ============================= EFFECTS =============================
  private boom(x: number, y: number, big: boolean) {
    audio.explode(big);
    const n = big ? 30 : 16;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(40, big ? 320 : 220);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.25, 0.6), max: 0.6, size: rnd(2, 4.5), color: ["#ffd76a", "#ff9d3a", "#ff5c2a", "#fff3c4"][Math.floor(rnd(0, 4))], kind: "spark" });
    }
    const sm = big ? 9 : 5;
    for (let i = 0; i < sm; i++) {
      this.particles.push({ x: x + rnd(-10, 10), y: y + rnd(-10, 10), vx: rnd(-18, 18), vy: rnd(-46, -14), life: rnd(0.5, 1.0), max: 1.0, size: rnd(6, big ? 16 : 11), color: "smoke", kind: "smoke" });
    }
    this.particles.push({ x, y, vx: 0, vy: 0, life: big ? 0.4 : 0.26, max: big ? 0.4 : 0.26, size: big ? 44 : 28, color: "#fff3c4", kind: "flash" });
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, size: big ? 60 : 38, color: big ? "#ff9d3a" : "#ffd76a", kind: "ring" });
  }

  private sparks(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(30, 160);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.12, 0.3), max: 0.3, size: rnd(1.5, 3), color, kind: "spark" });
    }
  }

  private debris(x: number, y: number, color: string) {
    for (let i = 0; i < 3; i++) {
      this.particles.push({ x, y, vx: rnd(-90, 90), vy: rnd(-160, -40), life: rnd(0.3, 0.55), max: 0.55, size: rnd(2.5, 5), color, kind: "debris" });
    }
  }

  private popup(x: number, y: number, txt: string, color: string) {
    this.popups.push({ x, y, txt, t: 1.0, color });
  }

  private updateFx(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === "debris") p.vy += 500 * dt;
      if (p.kind === "spark") { p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; }
    }
    if (this.particles.length > 340) this.particles.splice(0, this.particles.length - 340);
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.popups) { p.t -= dt; p.y -= 34 * dt; }
    this.popups = this.popups.filter((p) => p.t > 0);
  }

  // ============================= HUD =============================
  private pushHud() {
    const enemiesLeft = this.queue.length + this.tanks.filter((t) => t.kind !== "player").length;
    const snap: HudSnapshot = {
      phase: this.phase,
      score: this.score,
      best: this.best,
      newBest: this.newBest,
      lives: Math.max(0, this.lives),
      level: this.level,
      levelTitle: levelName(this.level),
      enemiesLeft,
      star: this.player ? this.player.star : this.star,
      muted: audio.muted,
      kills: this.kills,
      accuracy: this.lvlShots ? Math.round((100 * this.lvlHits) / this.lvlShots) : 0,
      powerups: this.runPowerups,
      reason: this.reason,
    };
    const s = JSON.stringify(snap);
    if (s !== this.lastSnap) { this.lastSnap = s; this.hudCb(snap); }
  }

  // ============================= DRAW =============================
  private draw() {
    const ctx = this.ctx;
    const t = this.time;
    ctx.save();
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (this.shake > 0.2) ctx.translate(rnd(-this.shake, this.shake) * 0.5, rnd(-this.shake, this.shake) * 0.5);

    // фон поля
    ctx.fillStyle = "#0e120a";
    ctx.fillRect(-12, -12, SIZE + 24, SIZE + 24);
    const tints = ["rgba(168,246,55,0.025)", "rgba(255,180,42,0.03)", "rgba(90,190,255,0.03)"];
    ctx.fillStyle = tints[this.level % 3];
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = "rgba(255,255,255,0.028)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 13; i++) {
      ctx.beginPath(); ctx.moveTo(i * 48, 0); ctx.lineTo(i * 48, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 48); ctx.lineTo(SIZE, i * 48); ctx.stroke();
    }

    // тайлы (нижний слой + вода/лёд/кирпич/сталь)
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const v = this.grid[r * N + c];
      if (v === EMPTY || v === TREE || v === EAGLE) continue;
      this.drawTile(c, r, v, t);
    }
    this.drawEagle(t);

    // бонусы
    for (const pu of this.powerups) this.drawPowerup(pu, t);

    // танки
    for (const tank of this.tanks) this.drawTank(tank, t);

    // снаряды
    for (const b of this.bullets) this.drawBullet(b);

    // частицы
    this.drawParticles();

    // лес поверх
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (this.grid[r * N + c] === TREE) this.drawTree(c, r, t);
    }

    // всплывающие очки
    for (const p of this.popups) {
      ctx.globalAlpha = clamp(p.t / 0.4, 0, 1);
      ctx.font = '13px "Russo One", sans-serif';
      ctx.textAlign = "center";
      ctx.fillStyle = "#0a0d07";
      ctx.fillText(p.txt, p.x + 1.5, p.y + 1.5);
      ctx.fillStyle = p.color;
      ctx.fillText(p.txt, p.x, p.y);
      ctx.globalAlpha = 1;
    }

    // заморозка
    if (this.freezeT > 0 && (this.phase === "playing" || this.phase === "clear")) {
      ctx.fillStyle = `rgba(120,220,255,${0.05 + 0.03 * Math.sin(t * 6)})`;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }

    // красная вспышка урона
    if (this.redFlash > 0) {
      ctx.fillStyle = `rgba(255,60,45,${this.redFlash * 0.3})`;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }

    // виньетка
    const vg = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.36, SIZE / 2, SIZE / 2, SIZE * 0.74);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // шторка уровня
    if (this.phase === "intro") this.drawIntro();

    ctx.restore();
  }

  private drawIntro() {
    const ctx = this.ctx;
    const total = 1.9;
    const p = 1 - this.introT / total;
    let cover: number;
    if (p < 0.22) cover = p / 0.22;
    else if (p > 0.8) cover = 1 - (p - 0.8) / 0.2;
    else cover = 1;
    cover = cover * cover * (3 - 2 * cover);
    const w = (SIZE / 2) * cover;
    ctx.fillStyle = "#070904";
    ctx.fillRect(-12, 0, w + 12, SIZE);
    ctx.fillRect(SIZE - w, 0, w + 12, SIZE);
    ctx.fillStyle = "#3c5224";
    ctx.fillRect(w - 14, 0, 3, SIZE);
    ctx.fillRect(SIZE - w + 11, 0, 3, SIZE);
    if (cover > 0.85) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#a8f637";
      ctx.font = '34px "Russo One", sans-serif';
      ctx.fillText(`УРОВЕНЬ ${this.level}`, SIZE / 2, SIZE / 2 - 8);
      ctx.fillStyle = "#8fae58";
      ctx.font = '15px "Russo One", sans-serif';
      ctx.fillText(levelName(this.level), SIZE / 2, SIZE / 2 + 26);
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.time * 8);
      ctx.fillStyle = "#ffd76a";
      ctx.font = '11px "Russo One", sans-serif';
      ctx.fillText("ПРИГОТОВИТЬСЯ", SIZE / 2, SIZE / 2 + 62);
      ctx.globalAlpha = 1;
    }
  }

  private drawTile(c: number, r: number, v: number, t: number) {
    const ctx = this.ctx;
    const x = c * TILE, y = r * TILE;
    if (v === BRICK) {
      const shade = ((c * 7 + r * 13) % 3);
      ctx.fillStyle = shade === 0 ? "#9c4a26" : shade === 1 ? "#a34f2a" : "#944523";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#5e2a14";
      ctx.fillRect(x, y + 7, TILE, 2);
      ctx.fillRect(x, y + 16, TILE, 2);
      const off = (r % 2) * 6;
      ctx.fillRect(x + ((6 + off) % 24), y, 2, 7);
      ctx.fillRect(x + ((18 + off) % 24), y + 9, 2, 7);
      ctx.fillRect(x + ((6 + off) % 24), y + 18, 2, 6);
      ctx.fillStyle = "rgba(255,180,120,0.22)";
      ctx.fillRect(x, y, TILE, 1.5);
    } else if (v === STEEL) {
      ctx.fillStyle = "#7d8894";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#c3ccd4";
      ctx.fillRect(x, y, TILE, 2); ctx.fillRect(x, y, 2, TILE);
      ctx.fillStyle = "#46505c";
      ctx.fillRect(x, y + TILE - 2, TILE, 2); ctx.fillRect(x + TILE - 2, y, 2, TILE);
      ctx.fillStyle = "#97a3ad";
      ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
      ctx.fillStyle = "#e8eef2";
      for (const [dx, dy] of [[5, 5], [TILE - 7, 5], [5, TILE - 7], [TILE - 7, TILE - 7]] as const) {
        ctx.fillRect(x + dx, y + dy, 2, 2);
      }
    } else if (v === WATER) {
      ctx.fillStyle = "#0d3446";
      ctx.fillRect(x, y, TILE, TILE);
      const o1 = ((t * 14 + r * 9 + c * 3) % 24);
      const o2 = ((t * 9 + r * 5 + c * 7 + 12) % 24);
      ctx.fillStyle = "rgba(64,150,190,0.55)";
      ctx.fillRect(x + 2, y + (o1 % 11) + 2, TILE - 6, 2.5);
      ctx.fillRect(x + 4, y + (o2 % 11) + 10, TILE - 9, 2.5);
      ctx.fillStyle = "rgba(150,225,250,0.4)";
      ctx.fillRect(x + 3, y + ((o1 + 5) % 11) + 3, 8, 1.5);
    } else if (v === ICE) {
      ctx.fillStyle = "#b9dce8";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(x + 3, y + TILE - 3); ctx.lineTo(x + 10, y + 3); ctx.lineTo(x + 14, y + 3); ctx.lineTo(x + 7, y + TILE - 3);
      ctx.fill();
      ctx.strokeStyle = "#8fc3d6";
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    }
  }

  private drawTree(c: number, r: number, t: number) {
    const ctx = this.ctx;
    const x = c * TILE + TILE / 2 + Math.sin(t * 1.8 + c * 1.3 + r) * 1.2;
    const y = r * TILE + TILE / 2;
    const blobs: [number, number, number, string][] = [
      [-6, -4, 9, "#1c5c2b"], [6, -5, 8, "#237235"], [0, 6, 8.5, "#2c8a40"], [1, -1, 7, "#2f9145"],
    ];
    for (const [dx, dy, rad, col] of blobs) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x + dx, y + dy, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "rgba(190,255,160,0.35)";
    ctx.beginPath(); ctx.arc(x - 3, y - 6, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  private drawEagle(t: number) {
    const ctx = this.ctx;
    const x = 12 * TILE, y = 24 * TILE;
    ctx.fillStyle = "#141008";
    ctx.fillRect(x - 3, y - 3, 54, 54);
    ctx.strokeStyle = this.eagleAlive ? "#8a6410" : "#4a4a4a";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 2, y - 2, 52, 52);
    const cx = x + 24, cy = y + 26;
    if (this.eagleAlive) {
      const glow = 0.5 + 0.3 * Math.sin(t * 3);
      ctx.save();
      ctx.shadowColor = `rgba(255,210,90,${glow})`;
      ctx.shadowBlur = 14;
      // крылья
      ctx.fillStyle = "#c9932a";
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy); ctx.lineTo(cx - 19, cy - 12); ctx.lineTo(cx - 12, cy + 2); ctx.lineTo(cx - 18, cy + 6); ctx.lineTo(cx - 4, cy + 8);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 19, cy - 12); ctx.lineTo(cx + 12, cy + 2); ctx.lineTo(cx + 18, cy + 6); ctx.lineTo(cx + 4, cy + 8);
      ctx.fill();
      // тело и голова
      ctx.fillStyle = "#f5c542";
      ctx.beginPath(); ctx.arc(cx, cy - 2, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy - 12, 4.5, 0, Math.PI * 2); ctx.fill();
      // звезда
      ctx.fillStyle = "#ffe9a3";
      this.starPath(cx, cy - 2, 4.5, 2);
      ctx.restore();
    } else {
      ctx.fillStyle = "#565656";
      ctx.beginPath(); ctx.arc(cx, cy - 2, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3c3c3c";
      ctx.fillRect(cx - 16, cy - 8, 32, 4);
      ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 10, cy - 14); ctx.lineTo(cx + 2, cy + 2); ctx.lineTo(cx - 4, cy + 10); ctx.stroke();
      if (Math.random() < 0.06) {
        this.particles.push({ x: cx + rnd(-10, 10), y: cy, vx: rnd(-6, 6), vy: rnd(-34, -16), life: 0.8, max: 0.8, size: rnd(4, 8), color: "smoke", kind: "smoke" });
      }
    }
  }

  private starPath(cx: number, cy: number, ro: number, ri: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? ro : ri;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawTank(tank: Tank, t: number) {
    const ctx = this.ctx;
    if (tank.spawnT > 0) {
      const p = 1 - tank.spawnT / 0.85;
      const cx = tank.x + TANK / 2, cy = tank.y + TANK / 2;
      const s = 6 + 20 * Math.abs(Math.sin(p * 18));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(p * 9);
      ctx.strokeStyle = Math.floor(p * 18) % 2 === 0 ? "#ffffff" : "#8fe8ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.rotate(0.6);
      ctx.strokeStyle = "#a8f637";
      ctx.strokeRect(-s / 3, -s / 3, (s * 2) / 3, (s * 2) / 3);
      ctx.restore();
      return;
    }

    const def = tank.kind === "player"
      ? { body: "#ffc84a", dark: "#b57e12", track: "#3a2f12" }
      : ENEMY_DEF[tank.kind as Exclude<Kind, "player">];
    const trackCol = tank.kind === "player" ? "#3a2f12" : "#242b1e";

    ctx.save();
    ctx.translate(tank.x + TANK / 2, tank.y + TANK / 2);
    ctx.rotate((tank.dir * Math.PI) / 2);

    // гусеницы
    ctx.fillStyle = trackCol;
    ctx.fillRect(-23, -22, 9, 44);
    ctx.fillRect(14, -22, 9, 44);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    const tread = tank.tread % 8;
    for (let i = -3; i < 4; i++) {
      const yy = i * 8 + tread - 4;
      if (yy > -22 && yy < 20) {
        ctx.fillRect(-23, yy, 9, 2.5);
        ctx.fillRect(14, yy, 9, 2.5);
      }
    }

    // корпус
    let body = def.body, dark = def.dark;
    if (tank.kind === "armor") {
      const tints = ["#ff4747", "#ff8a2a", "#ffd23a", "#69d84f"];
      body = tints[clamp(tank.hp - 1, 0, 3)];
      dark = "#5c5348";
    }
    const grad = ctx.createLinearGradient(0, -20, 0, 20);
    grad.addColorStop(0, body);
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    this.rr(-16, -20, 32, 40, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    this.rr(-16, -20, 32, 10, 5);
    ctx.fill();
    if (tank.kind === "armor") {
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-16, -6); ctx.lineTo(16, -6); ctx.moveTo(-16, 6); ctx.lineTo(16, 6); ctx.stroke();
    }

    // ствол с отдачей
    const rec = tank.recoil * 5;
    ctx.fillStyle = dark;
    ctx.fillRect(-3.5, -30 + rec, 7, 16);
    ctx.fillStyle = body;
    ctx.fillRect(-2.5, -29 + rec, 5, 12);

    // башня
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.arc(0, 0, 8.5, Math.PI * 0.15, Math.PI * 0.85); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath(); ctx.arc(-2.5, -2.5, 2.4, 0, Math.PI * 2); ctx.fill();

    // звёзды игрока
    if (tank.kind === "player" && tank.star > 0) {
      ctx.fillStyle = "#fff3c4";
      for (let i = 0; i < tank.star; i++) {
        this.starPath(-8 + i * 8, 14, 3.4, 1.5);
      }
    }

    // мигание «с бонусом»
    if (tank.isFlash && Math.floor(t * 8) % 2 === 0) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      this.rr(-18, -22, 36, 44, 6);
      ctx.stroke();
    }
    // вспышка попадания
    if (tank.flash > 0) {
      ctx.globalAlpha = tank.flash / 0.09;
      ctx.fillStyle = "#ffffff";
      this.rr(-20, -24, 40, 48, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // щит
    if (tank.shield > 0) {
      const cx = tank.x + TANK / 2, cy = tank.y + TANK / 2;
      const a = tank.shield < 2 ? (Math.floor(t * 10) % 2 === 0 ? 0.7 : 0.15) : 0.45 + 0.2 * Math.sin(t * 9);
      ctx.strokeStyle = `rgba(143,232,255,${a})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, 29, t * 2, t * 2 + Math.PI * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 29, t * 2 + Math.PI * 1.6, t * 2 + Math.PI * 1.9); ctx.stroke();
      ctx.strokeStyle = `rgba(143,232,255,${a * 0.4})`;
      ctx.beginPath(); ctx.arc(cx, cy, 33, -t * 1.6, -t * 1.6 + Math.PI); ctx.stroke();
    }
  }

  private rr(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawBullet(b: Bullet) {
    const ctx = this.ctx;
    for (let i = 0; i < b.trail.length; i++) {
      const tr = b.trail[i];
      const a = (i + 1) / b.trail.length;
      ctx.globalAlpha = a * 0.3;
      ctx.fillStyle = b.owner === "p" ? "#ffd76a" : "#bfe8ff";
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 2.5 * a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.shadowColor = b.owner === "p" ? "#ffbb33" : "#9adcff";
    ctx.shadowBlur = 9;
    ctx.fillStyle = b.owner === "p" ? "#ffe9a3" : "#e8f6ff";
    ctx.beginPath(); ctx.arc(b.x, b.y, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = b.owner === "p" ? "#c77b12" : "#5a9dc4";
    ctx.beginPath(); ctx.arc(b.x, b.y, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const k = p.life / p.max;
      if (p.kind === "spark") {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.globalCompositeOperation = "source-over";
      } else if (p.kind === "smoke") {
        ctx.globalAlpha = k * 0.4;
        ctx.fillStyle = "#8a8f94";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === "debris") {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.kind === "flash") {
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * (1.3 - k * 0.3));
        g.addColorStop(0, `rgba(255,243,196,${k})`);
        g.addColorStop(0.5, `rgba(255,157,58,${k * 0.6})`);
        g.addColorStop(1, "rgba(255,92,42,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      } else if (p.kind === "ring") {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - k * 0.4), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawPowerup(pu: PowerUp, t: number) {
    const ctx = this.ctx;
    if (Math.floor(t * 6) % 2 === 0 && pu.t > 2) return; // мигание
    const cx = pu.x + 24, cy = pu.y + 24;
    const pulse = 1 + 0.08 * Math.sin(t * 6);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = "#ffb42a";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#171308";
    this.rr(-20, -20, 40, 40, 4);
    ctx.fill();
    ctx.strokeStyle = "#ffb42a";
    ctx.lineWidth = 2;
    this.rr(-20, -20, 40, 40, 4);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const icons: Record<string, () => void> = {
      star: () => { ctx.fillStyle = "#ffd23a"; this.starPath(0, 1, 11, 5); },
      shield: () => {
        ctx.strokeStyle = "#8fe8ff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#8fe8ff"; this.starPath(0, 0, 5, 2.2);
      },
      clock: () => {
        ctx.strokeStyle = "#8fe8ff"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -7); ctx.moveTo(0, 0); ctx.lineTo(5, 3); ctx.stroke();
      },
      shovel: () => {
        ctx.fillStyle = "#c3ccd4";
        ctx.fillRect(-2, -12, 4, 12);
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.lineTo(5, 11); ctx.lineTo(-5, 11); ctx.closePath(); ctx.fill();
      },
      grenade: () => {
        ctx.fillStyle = "#6d7a62";
        ctx.beginPath(); ctx.arc(0, 2, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffd23a"; ctx.fillRect(-2, -12, 4, 6);
        ctx.fillStyle = "#ff5c2a"; ctx.beginPath(); ctx.arc(3, -11, 2.5, 0, Math.PI * 2); ctx.fill();
      },
      tank: () => {
        ctx.fillStyle = "#a8f637";
        ctx.fillRect(-10, -6, 20, 13);
        ctx.fillRect(-3, -12, 6, 7);
        ctx.fillRect(-13, -4, 4, 10); ctx.fillRect(9, -4, 4, 10);
      },
    };
    (icons[pu.type] || icons.star)();
    ctx.restore();
  }
}
