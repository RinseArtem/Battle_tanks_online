/* Рендер дезматча: камера, миникарта, частицы, зона, всё процедурно. */
import { CLASSES, WEAPONS, T_BRICK, T_STEEL, T_WATER, T_ICE, T_BUSH, TILE, TN, WORLD, type World, type TankS } from "./sim";

interface RParticle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: "spark" | "smoke" | "flash" | "ring"; }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class DMRenderer {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private vw = 0; private vh = 0;
  private parts: RParticle[] = [];
  private seenFx = new Set<number>();
  private disp = new Map<string, { x: number; y: number; turret: number; dist: number; px: number; py: number }>();
  private shake = 0;
  private mmCache: HTMLCanvasElement | null = null;
  private mmStamp = 0;
  private deco: { x: number; y: number; s: number; a: number }[] = [];
  private decoSeed = -1;
  vw2 = 0; vh2 = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  resize(w: number, h: number) {
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.vw = w; this.vh = h;
    this.vw2 = w; this.vh2 = h;
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
  }

  get viewW() { return this.vw; }
  get viewH() { return this.vh; }

  render(world: World, cam: { x: number; y: number }, localId: string, mouse: { x: number; y: number }, t: number, dt: number) {
    const ctx = this.ctx;
    this.shake = Math.max(0, this.shake - dt * 30);
    const shx = this.shake > 0.3 ? rnd(-this.shake, this.shake) * 0.5 : 0;
    const shy = this.shake > 0.3 ? rnd(-this.shake, this.shake) * 0.5 : 0;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.vw, this.vh);
    ctx.save();
    ctx.translate(-cam.x + this.vw / 2 + shx, -cam.y + this.vh / 2 + shy);

    // ---- земля ----
    const vx0 = cam.x - this.vw / 2 - 48, vy0 = cam.y - this.vh / 2 - 48;
    const vx1 = cam.x + this.vw / 2 + 48, vy1 = cam.y + this.vh / 2 + 48;
    ctx.fillStyle = "#141709";
    ctx.fillRect(Math.max(0, vx0), Math.max(0, vy0), Math.min(WORLD, vx1) - Math.max(0, vx0), Math.min(WORLD, vy1) - Math.max(0, vy0));
    if (this.decoSeed !== world.seed) { this.buildDeco(world.seed); }
    for (const d of this.deco) {
      if (d.x < vx0 || d.x > vx1 || d.y < vy0 || d.y > vy1) continue;
      ctx.globalAlpha = d.a;
      ctx.fillStyle = "#1c2010";
      ctx.fillRect(d.x, d.y, d.s, d.s * 0.6);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    const c0 = Math.max(0, Math.floor(vx0 / TILE)), c1 = Math.min(TN, Math.ceil(vx1 / TILE));
    const r0 = Math.max(0, Math.floor(vy0 / TILE)), r1 = Math.min(TN, Math.ceil(vy1 / TILE));
    ctx.beginPath();
    for (let c = c0; c <= c1; c++) { ctx.moveTo(c * TILE, Math.max(0, vy0)); ctx.lineTo(c * TILE, Math.min(WORLD, vy1)); }
    for (let r = r0; r <= r1; r++) { ctx.moveTo(Math.max(0, vx0), r * TILE); ctx.lineTo(Math.min(WORLD, vx1), r * TILE); }
    ctx.stroke();

    // ---- тайлы ----
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      const v = world.tiles[r * TN + c];
      if (v === 0 || v === T_BUSH) continue;
      this.drawTile(c, r, v, t);
    }

    // ---- зона ----
    if (world.sudden) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(vx0, vy0, vx1 - vx0, vy1 - vy0);
      ctx.arc(world.zoneX, world.zoneY, world.zoneR, 0, Math.PI * 2, true);
      ctx.fillStyle = "rgba(255,46,30,0.14)";
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = `rgba(255,90,60,${0.5 + 0.3 * Math.sin(t * 6)})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 12]);
      ctx.lineDashOffset = -t * 60;
      ctx.beginPath(); ctx.arc(world.zoneX, world.zoneY, world.zoneR, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- телеграфы арт-обстрела ----
    for (const e of world.effects) {
      if (e.kind !== "telegraph" && e.kind !== "artillery") continue;
      if (e.kind === "telegraph") {
        const p = 1 - e.t / e.max;
        ctx.strokeStyle = `rgba(255,80,60,${0.4 + 0.4 * Math.sin(t * 10)})`;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.15 - p * 0.15), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(255,80,60,${0.06 + p * 0.1})`;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ff6d5a";
        ctx.font = '13px "Russo One"';
        ctx.textAlign = "center";
        ctx.fillText("!", e.x, e.y - e.r - 8);
      } else {
        const p = 1 - e.t / e.max;
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = "#fff3c4";
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.6 + p * 0.8), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // ---- мины ----
    for (const m of world.mines) {
      if (m.x < vx0 || m.x > vx1 || m.y < vy0 || m.y > vy1) continue;
      ctx.fillStyle = "#23271c";
      ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#3d4432"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, Math.PI * 2); ctx.stroke();
      if (m.arm <= 0 && Math.floor(t * 4) % 2 === 0) {
        ctx.fillStyle = "#ff4747";
        ctx.beginPath(); ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // ---- ящики ----
    for (const p of world.pickups) {
      if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
      this.drawPickup(p.x, p.y, p.type, p.sub, t);
    }

    // ---- танки ----
    for (const tank of world.tanks) {
      if (tank.dead) continue;
      this.drawTank(tank, tank.id === localId, t, dt);
    }

    // ---- снаряды и лучи ----
    for (const e of world.effects) {
      if (e.kind !== "beam") continue;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(143,232,255,0.9)";
      ctx.lineWidth = 4 * (e.t / e.max);
      ctx.shadowColor = "#8fe8ff"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke();
      ctx.restore();
    }
    for (const b of world.bullets) {
      if (b.x < vx0 || b.x > vx1 || b.y < vy0 || b.y > vy1) continue;
      this.drawBullet(b.x, b.y, b.vx, b.vy, b.kind);
    }

    // ---- эффекты-частицы ----
    this.spawnFromEffects(world);
    this.updateParts(dt);
    this.drawParts(ctx);
    for (const e of world.effects) {
      const p = 1 - e.t / e.max;
      if (e.kind === "boom" || e.kind === "bigboom" || e.kind === "mineboom") {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const rad = e.r * (0.4 + p * 0.9);
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rad);
        g.addColorStop(0, `rgba(255,243,196,${(1 - p) * 0.9})`);
        g.addColorStop(0.45, `rgba(255,140,50,${(1 - p) * 0.6})`);
        g.addColorStop(1, "rgba(255,70,30,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(e.x, e.y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,200,120,${1 - p})`;
        ctx.lineWidth = 3 * (1 - p);
        ctx.beginPath(); ctx.arc(e.x, e.y, rad * 1.1, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      } else if (e.kind === "dmg" || e.kind === "heal" || e.kind === "pickup" || e.kind === "streak") {
        ctx.globalAlpha = Math.min(1, e.t / 0.3);
        ctx.font = `${e.kind === "streak" ? 17 : 12}px "Russo One"`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#0a0d07";
        ctx.fillText(e.txt, e.x - e.y * 0 + 1.5, e.y - p * 26 + 1.5);
        ctx.fillStyle = e.color || "#ffd76a";
        ctx.fillText(e.txt, e.x, e.y - p * 26);
        ctx.globalAlpha = 1;
      } else if (e.kind === "drop") {
        ctx.strokeStyle = `rgba(255,210,90,${1 - p})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, 10 + p * 46, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // ---- кусты поверх ----
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      if (world.tiles[r * TN + c] !== T_BUSH) continue;
      this.drawBush(c, r, t);
    }

    ctx.restore();

    // ---- прицел ----
    ctx.strokeStyle = "rgba(255,231,163,0.9)";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mouse.x - 14, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y);
    ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 14, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 14); ctx.lineTo(mouse.x, mouse.y - 5);
    ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 14);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,231,163,0.9)";
    ctx.fillRect(mouse.x - 1, mouse.y - 1, 2, 2);
  }

  private buildDeco(seed: number) {
    this.decoSeed = seed;
    this.deco = [];
    let s = seed;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 220; i++) {
      this.deco.push({ x: r() * WORLD, y: r() * WORLD, s: 10 + r() * 40, a: 0.12 + r() * 0.2 });
    }
  }

  private drawTile(c: number, r: number, v: number, t: number) {
    const ctx = this.ctx;
    const x = c * TILE, y = r * TILE;
    if (v === T_BRICK) {
      ctx.fillStyle = "#9c4a26";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#5e2a14";
      for (let i = 1; i < 4; i++) ctx.fillRect(x, y + i * 12, TILE, 2);
      const off = (r % 2) * 12;
      for (let i = 0; i < 4; i++) ctx.fillRect(x + ((i * 12 + off) % TILE), y + (i % 2) * 12 + 2, 2, 10);
      ctx.fillStyle = "rgba(255,180,120,0.16)";
      ctx.fillRect(x, y, TILE, 2);
    } else if (v === T_STEEL) {
      ctx.fillStyle = "#7d8894";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "#c3ccd4";
      ctx.fillRect(x, y, TILE, 2); ctx.fillRect(x, y, 2, TILE);
      ctx.fillStyle = "#46505c";
      ctx.fillRect(x, y + TILE - 2, TILE, 2); ctx.fillRect(x + TILE - 2, y, 2, TILE);
      ctx.fillStyle = "#97a3ad";
      ctx.fillRect(x + 8, y + 8, TILE - 16, TILE - 16);
      ctx.fillStyle = "#e8eef2";
      ctx.fillRect(x + 6, y + 6, 3, 3); ctx.fillRect(x + TILE - 9, y + 6, 3, 3);
      ctx.fillRect(x + 6, y + TILE - 9, 3, 3); ctx.fillRect(x + TILE - 9, y + TILE - 9, 3, 3);
    } else if (v === T_WATER) {
      ctx.fillStyle = "#0d3446";
      ctx.fillRect(x, y, TILE, TILE);
      const o1 = (t * 16 + r * 11 + c * 5) % TILE;
      const o2 = (t * 10 + r * 7 + c * 9 + 20) % TILE;
      ctx.fillStyle = "rgba(70,160,200,0.5)";
      ctx.fillRect(x + 4, y + (o1 % 34) + 4, TILE - 12, 3);
      ctx.fillRect(x + 8, y + (o2 % 30) + 14, TILE - 18, 3);
      ctx.fillStyle = "rgba(160,228,252,0.35)";
      ctx.fillRect(x + 6, y + ((o1 + 17) % 36) + 4, 12, 2);
    } else if (v === T_ICE) {
      ctx.fillStyle = "#b9dce8";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.moveTo(x + 6, y + TILE - 6); ctx.lineTo(x + 20, y + 6); ctx.lineTo(x + 28, y + 6); ctx.lineTo(x + 14, y + TILE - 6);
      ctx.fill();
      ctx.strokeStyle = "#8fc3d6";
      ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    }
  }

  private drawBush(c: number, r: number, t: number) {
    const ctx = this.ctx;
    const x = c * TILE + TILE / 2 + Math.sin(t * 1.6 + c + r * 2) * 1.5;
    const y = r * TILE + TILE / 2;
    const blobs: [number, number, number, string][] = [
      [-12, -8, 16, "#1c5c2b"], [12, -9, 14, "#237235"], [0, 10, 15, "#2c8a40"], [2, -2, 13, "#2f9145"],
    ];
    for (const [dx, dy, rad, col] of blobs) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x + dx, y + dy, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "rgba(190,255,160,0.3)";
    ctx.beginPath(); ctx.arc(x - 6, y - 10, 4, 0, Math.PI * 2); ctx.fill();
  }

  private drawPickup(x: number, y: number, type: string, sub: string, t: number) {
    const ctx = this.ctx;
    const bob = Math.sin(t * 4 + x) * 3;
    // маяк
    ctx.save();
    ctx.globalAlpha = 0.2 + 0.1 * Math.sin(t * 5);
    ctx.fillStyle = type === "weapon" ? "#ffd76a" : "#8fe8ff";
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 90); ctx.lineTo(x + 14, y - 90); ctx.lineTo(x + 7, y + bob); ctx.lineTo(x - 7, y + bob);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.shadowColor = type === "weapon" ? "#ffd76a" : "#8fe8ff";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#171308";
    ctx.strokeStyle = type === "weapon" ? "#ffd76a" : "#8fe8ff";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(-15, -15, 30, 30); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath(); ctx.moveTo(-15, -5); ctx.lineTo(15, -5); ctx.stroke();
    // иконка
    ctx.fillStyle = ctx.strokeStyle = type === "weapon" ? "#ffd76a" : "#8fe8ff";
    if (sub === "shotgun") {
      ctx.fillRect(-9, -2, 18, 4); ctx.fillRect(-9, 3, 12, 3);
    } else if (sub === "rocket") {
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, -6); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ff5c2a"; ctx.fillRect(-9, -2, 5, 4);
    } else if (sub === "laser") {
      ctx.fillRect(-10, -1.5, 20, 3);
      ctx.beginPath(); ctx.arc(8, 0, 3, 0, Math.PI * 2); ctx.fill();
    } else if (sub === "shield") {
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
    } else if (sub === "repair") {
      ctx.fillRect(-2, -9, 4, 18); ctx.fillRect(-9, -2, 18, 4);
    } else if (sub === "boost") {
      ctx.beginPath(); ctx.moveTo(4, -9); ctx.lineTo(-6, 2); ctx.lineTo(-1, 2); ctx.lineTo(-4, 9); ctx.lineTo(6, -2); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill();
    } else if (sub === "mine") {
      ctx.beginPath(); ctx.arc(0, 2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-1.5, -9, 3, 6);
    }
    ctx.restore();
  }

  private drawTank(tank: TankS, isLocal: boolean, t: number, dt: number) {
    const ctx = this.ctx;
    // сглаживание позиции (для сети)
    let d = this.disp.get(tank.id);
    if (!d) { d = { x: tank.x, y: tank.y, turret: tank.turret, dist: 0, px: tank.x, py: tank.y }; this.disp.set(tank.id, d); }
    const k = 1 - Math.pow(0.0001, dt);
    d.px = d.x; d.py = d.y;
    d.x += (tank.x - d.x) * k;
    d.y += (tank.y - d.y) * k;
    let da = tank.turret - d.turret;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    d.turret += da * k;
    d.dist += Math.hypot(d.x - d.px, d.y - d.py);

    const def = CLASSES[tank.cls];
    const blink = tank.invulnT > 0 && Math.floor(t * 10) % 2 === 0;

    ctx.save();
    ctx.translate(d.x, d.y);
    // тень
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(2, 4, 21, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(d.turret);
    if (blink) ctx.globalAlpha = 0.45;

    const wide = tank.cls === "heavy" ? 4 : 0;
    // гусеницы
    ctx.fillStyle = "#262c1c";
    ctx.fillRect(-21 - wide, -22, 10, 44);
    ctx.fillRect(11 + wide, -22, 10, 44);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    const tr = d.dist % 9;
    for (let i = -3; i < 4; i++) {
      const yy = i * 9 + tr - 5;
      if (yy > -21 && yy < 20) {
        ctx.fillRect(-21 - wide, yy, 10, 3);
        ctx.fillRect(11 + wide, yy, 10, 3);
      }
    }
    // корпус
    const grad = ctx.createLinearGradient(0, -20, 0, 20);
    grad.addColorStop(0, def.color);
    grad.addColorStop(1, def.dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-15 - wide, -20, 30 + wide * 2, 40, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath(); ctx.roundRect(-15 - wide, -20, 30 + wide * 2, 12, 6); ctx.fill();
    if (tank.cls === "heavy") {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(-15 - wide, -6, 30 + wide * 2, 3);
      ctx.fillRect(-15 - wide, 5, 30 + wide * 2, 3);
      ctx.fillStyle = "#5c5348";
      ctx.beginPath(); ctx.roundRect(-12, -24, 24, 6, 3); ctx.fill();
    }
    if (tank.cls === "scout") {
      ctx.fillStyle = def.dark;
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(-7, -16); ctx.lineTo(7, -16); ctx.closePath(); ctx.fill();
    }
    // ствол
    const barrelLen = tank.weapon === "rocket" ? 26 : tank.weapon === "shotgun" ? 20 : tank.weapon === "laser" ? 28 : 24;
    ctx.fillStyle = def.dark;
    ctx.fillRect(-3.5, -14 - barrelLen, 7, barrelLen + 4);
    ctx.fillStyle = def.color;
    ctx.fillRect(-2, -13 - barrelLen, 4, barrelLen);
    if (tank.weapon === "shotgun") ctx.fillRect(-4.5, -12 - barrelLen, 9, 4);
    // башня
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.arc(0, 0, 9.5, Math.PI * 0.2, Math.PI * 0.8); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath(); ctx.arc(-3, -3, 2.6, 0, Math.PI * 2); ctx.fill();
    if (tank.cls === "engineer") {
      ctx.fillStyle = "#171308";
      ctx.fillRect(-1.5, -6, 3, 12); ctx.fillRect(-6, -1.5, 12, 3);
    }
    // форсаж
    if (tank.boostT > 0) {
      ctx.fillStyle = `rgba(255,180,60,${0.5 + 0.4 * Math.sin(t * 30)})`;
      ctx.beginPath(); ctx.moveTo(-6, 22); ctx.lineTo(0, 34 + Math.sin(t * 40) * 4); ctx.lineTo(6, 22); ctx.fill();
    }
    // вспышка урона
    if (tank.flash > 0) {
      ctx.globalAlpha = Math.min(1, tank.flash / 0.1) * 0.8;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.roundRect(-19, -24, 38, 48, 7); ctx.fill();
      ctx.globalAlpha = blink ? 0.45 : 1;
    }
    ctx.restore();

    // щит
    if (tank.shieldT > 0) {
      ctx.strokeStyle = `rgba(143,232,255,${tank.shieldT < 1.2 && Math.floor(t * 10) % 2 === 0 ? 0.2 : 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(d.x, d.y, 30, t * 2.4, t * 2.4 + Math.PI * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(d.x, d.y, 30, t * 2.4 + Math.PI * 1.65, t * 2.4 + Math.PI * 1.95); ctx.stroke();
    }

    // имя + HP
    ctx.textAlign = "center";
    ctx.font = '10px "Russo One"';
    const nm = tank.name;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(nm, d.x + 1, d.y - 33);
    ctx.fillStyle = isLocal ? "#ffe9a3" : "#e8efdd";
    ctx.fillText(nm, d.x, d.y - 34);
    const hpw = 44;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(d.x - hpw / 2, d.y - 30, hpw, 5);
    const hpP = Math.max(0, tank.hp / tank.maxHp);
    ctx.fillStyle = hpP > 0.5 ? "#69d84f" : hpP > 0.25 ? "#ffd23a" : "#ff4747";
    ctx.fillRect(d.x - hpw / 2 + 1, d.y - 29, (hpw - 2) * hpP, 3);
    // серия
    if (tank.streak >= 2) {
      ctx.fillStyle = "#ffd23a";
      ctx.font = '9px "Russo One"';
      ctx.fillText(`×${tank.streak}`, d.x + 30, d.y - 28);
    }
  }

  private drawBullet(x: number, y: number, vx: number, vy: number, kind: string) {
    const ctx = this.ctx;
    const l = Math.hypot(vx, vy) || 1;
    const nx = vx / l, ny = vy / l;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (kind === "rocket") {
      ctx.strokeStyle = "rgba(255,140,60,0.7)";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x - nx * 18, y - ny * 18); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = "#ffd7a0";
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      const len = kind === "shotgun" ? 9 : 14;
      ctx.strokeStyle = kind === "shotgun" ? "rgba(255,157,58,0.9)" : "rgba(255,215,106,0.9)";
      ctx.lineWidth = kind === "shotgun" ? 3 : 2.5;
      ctx.beginPath(); ctx.moveTo(x - nx * len, y - ny * len); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = "#fff3c4";
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  private spawnFromEffects(world: World) {
    for (const e of world.effects) {
      if (this.seenFx.has(e.id)) continue;
      this.seenFx.add(e.id);
      if (e.kind === "boom" || e.kind === "bigboom" || e.kind === "mineboom" || e.kind === "artillery") {
        const n = e.kind === "bigboom" ? 26 : e.kind === "artillery" ? 30 : 14;
        for (let i = 0; i < n; i++) {
          const a = rnd(0, Math.PI * 2), s = rnd(60, 340);
          this.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.25, 0.6), max: 0.6, size: rnd(2, 5), color: ["#ffd76a", "#ff9d3a", "#ff5c2a", "#fff3c4"][Math.floor(rnd(0, 4))], kind: "spark" });
        }
        for (let i = 0; i < 8; i++) {
          this.parts.push({ x: e.x + rnd(-14, 14), y: e.y + rnd(-14, 14), vx: rnd(-20, 20), vy: rnd(-50, -15), life: rnd(0.5, 1), max: 1, size: rnd(7, 16), color: "", kind: "smoke" });
        }
        const big = e.kind === "bigboom" || e.kind === "artillery";
        this.shake = Math.max(this.shake, big ? 10 : 5);
      } else if (e.kind === "shot") {
        for (let i = 0; i < 5; i++) {
          const a = rnd(0, Math.PI * 2), s = rnd(40, 160);
          this.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.08, 0.18), max: 0.18, size: rnd(2, 3.5), color: e.txt === "laser" ? "#8fe8ff" : "#ffd76a", kind: "spark" });
        }
        if (e.txt === "shotgun" || e.txt === "rocket") this.shake = Math.max(this.shake, 2.5);
      } else if (e.kind === "mineplace") {
        for (let i = 0; i < 6; i++) {
          this.parts.push({ x: e.x + rnd(-8, 8), y: e.y + rnd(-8, 8), vx: rnd(-30, 30), vy: rnd(-60, -20), life: rnd(0.15, 0.3), max: 0.3, size: rnd(1.5, 3), color: "#c3ccd4", kind: "spark" });
        }
      } else if (e.kind === "brick" || e.kind === "spark") {
        for (let i = 0; i < 6; i++) {
          const a = rnd(0, Math.PI * 2), s = rnd(30, 150);
          this.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.15, 0.3), max: 0.3, size: rnd(1.5, 3.5), color: e.kind === "brick" ? "#a34f2a" : "#ffe9a3", kind: "spark" });
        }
      } else if (e.kind === "heal" || e.kind === "shield" || e.kind === "boost") {
        for (let i = 0; i < 10; i++) {
          this.parts.push({ x: e.x + rnd(-16, 16), y: e.y + rnd(-8, 16), vx: rnd(-15, 15), vy: rnd(-70, -30), life: rnd(0.3, 0.6), max: 0.6, size: rnd(2, 3.5), color: e.kind === "heal" ? "#a8f637" : e.kind === "shield" ? "#8fe8ff" : "#ffd23a", kind: "spark" });
        }
      }
    }
    if (this.seenFx.size > 600) {
      const arr = [...this.seenFx];
      this.seenFx = new Set(arr.slice(arr.length - 200));
    }
  }

  private updateParts(dt: number) {
    for (const p of this.parts) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === "spark") { p.vx *= 1 - 3.2 * dt; p.vy *= 1 - 3.2 * dt; }
    }
    if (this.parts.length > 380) this.parts.splice(0, this.parts.length - 380);
    this.parts = this.parts.filter((p) => p.life > 0);
  }

  private drawParts(ctx: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      const k = p.life / p.max;
      if (p.kind === "spark") {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.globalAlpha = k * 0.4;
        ctx.fillStyle = "#8a8f94";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.7 - k * 0.7), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- миникарта ----------
  renderMinimap(mm: HTMLCanvasElement, world: World, localId: string) {
    const size = mm.width;
    const mctx = mm.getContext("2d")!;
    const scale = size / WORLD;
    if (!this.mmCache || performance.now() - this.mmStamp > 500) {
      if (!this.mmCache) { this.mmCache = document.createElement("canvas"); this.mmCache.width = size; this.mmCache.height = size; }
      const c = this.mmCache.getContext("2d")!;
      c.fillStyle = "#0d100a";
      c.fillRect(0, 0, size, size);
      for (let r = 0; r < TN; r++) for (let cc = 0; cc < TN; cc++) {
        const v = world.tiles[r * TN + cc];
        if (v === T_BRICK) c.fillStyle = "#8a4a28";
        else if (v === T_STEEL) c.fillStyle = "#8d99a4";
        else if (v === T_WATER) c.fillStyle = "#1a5670";
        else if (v === T_ICE) c.fillStyle = "#9fc8d8";
        else if (v === T_BUSH) c.fillStyle = "#24603a";
        else continue;
        c.fillRect(cc * TILE * scale, r * TILE * scale, TILE * scale + 0.5, TILE * scale + 0.5);
      }
      this.mmStamp = performance.now();
    }
    mctx.clearRect(0, 0, size, size);
    mctx.drawImage(this.mmCache, 0, 0);
    // зона
    if (world.sudden) {
      mctx.strokeStyle = "#ff5c3c";
      mctx.lineWidth = 1.5;
      mctx.beginPath(); mctx.arc(world.zoneX * scale, world.zoneY * scale, world.zoneR * scale, 0, Math.PI * 2); mctx.stroke();
    }
    // телеграфы
    for (const e of world.effects) {
      if (e.kind !== "telegraph") continue;
      mctx.fillStyle = "rgba(255,80,60,0.5)";
      mctx.beginPath(); mctx.arc(e.x * scale, e.y * scale, Math.max(2, e.r * scale), 0, Math.PI * 2); mctx.fill();
    }
    // ящики
    mctx.fillStyle = "#ffd76a";
    for (const p of world.pickups) mctx.fillRect(p.x * scale - 1.5, p.y * scale - 1.5, 3, 3);
    // танки
    for (const t of world.tanks) {
      if (t.dead) continue;
      const me = t.id === localId;
      mctx.fillStyle = me ? "#ffffff" : t.color;
      mctx.beginPath(); mctx.arc(t.x * scale, t.y * scale, me ? 3.4 : 2.6, 0, Math.PI * 2); mctx.fill();
      if (me) { mctx.strokeStyle = "#0a0d07"; mctx.lineWidth = 1; mctx.stroke(); }
    }
  }
}

export const weaponInfo = WEAPONS;
