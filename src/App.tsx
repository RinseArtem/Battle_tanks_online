import { useEffect, useRef, useState, type ReactNode } from "react";
import { BattleCity, type HudSnapshot } from "./game/engine";
import { LEVEL_COUNT } from "./game/levels";

const TANK_SVGS = {
  basic: <svg viewBox="0 0 16 16" className="w-full h-full"><path d="M3 2h10v11l-5 2-5-2z" fill="#b9c6ae" /><path d="M7 4h2v5h-2z" fill="#6d7a62" /><circle cx="8" cy="6.5" r="1.6" fill="#6d7a62" /></svg>,
  fast: <svg viewBox="0 0 16 16" className="w-full h-full"><path d="M2 7l12-5-4 6 4 6-12-5 3-2z" fill="#54d8e8" /></svg>,
  power: <svg viewBox="0 0 16 16" className="w-full h-full"><circle cx="8" cy="8" r="6" fill="none" stroke="#ff6d9d" strokeWidth="2.5" /><circle cx="8" cy="8" r="2" fill="#ff6d9d" /></svg>,
  armor: <svg viewBox="0 0 16 16" className="w-full h-full"><path d="M8 1l6 3v5c0 3.5-2.5 5.5-6 6-3.5-.5-6-2.5-6-6V4z" fill="#9a8f82" /><path d="M8 4l3.5 1.8V9c0 2-1.4 3.3-3.5 3.7-2.1-.4-3.5-1.7-3.5-3.7V5.8z" fill="#5c5348" /></svg>,
} as const;

function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd inline-block leading-none">{children}</span>;
}

function Pip({ on, color }: { on: boolean; color: string }) {
  return (
    <span
      className="inline-block w-4 h-4 border border-black/70"
      style={{ background: on ? color : "rgba(255,255,255,0.06)", boxShadow: on ? `0 0 8px ${color}88` : "none" }}
    />
  );
}

function StarRow({ n, color }: { n: number; color: string }) {
  return (
    <span className="inline-flex gap-1 items-center">
      {[0, 1, 2].map((i) => (
        <Pip key={i} on={n > i} color={color} />
      ))}
    </span>
  );
}

function EnemyIcon({ kind }: { kind: keyof typeof TANK_SVGS }) {
  return <span className="inline-block w-4 h-4 drop-shadow">{TANK_SVGS[kind]}</span>;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BattleCity | null>(null);
  const [hud, setHud] = useState<HudSnapshot>({
    phase: "menu", score: 0, best: 0, newBest: false, lives: 3, level: 1,
    levelTitle: "", enemiesLeft: 0, star: 0, star1: 0, star2: 0, mode: 1, menuSel: 0,
    muted: false, kills: 0, accuracy: 0, powerups: 0, reason: "",
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new BattleCity(canvasRef.current, setHud);
    engineRef.current = game;
    return () => game.destroy();
  }, []);

  const g = engineRef.current;
  const playing = hud.phase === "playing" || hud.phase === "paused" || hud.phase === "clear";
  const coOp = hud.mode === 2;

  const touchHold = (fn: (v: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); fn(true); },
    onPointerUp: () => fn(false),
    onPointerLeave: () => fn(false),
    onPointerCancel: () => fn(false),
  });
  const dpad = (d: 0 | 1 | 2 | 3) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); g?.setTouchDir(d); },
    onPointerUp: () => g?.setTouchDir(null),
    onPointerLeave: () => g?.setTouchDir(null),
    onPointerCancel: () => g?.setTouchDir(null),
  });

  const modeCard = (sel: boolean, idx: 0 | 1, title: string, sub: string, accent: string) => (
    <button
      onClick={() => { g?.setMenuSel(idx); g?.startRun(idx === 0 ? 1 : 2); }}
      onMouseEnter={() => g?.setMenuSel(idx)}
      className={`btn-arcade relative px-5 py-3.5 text-left w-full ${sel ? "btn-acid" : "btn-dark"}`}
      style={sel ? { boxShadow: `0 4px 0 #000, 0 0 26px ${accent}55` } : undefined}
    >
      <span className="block text-sm">{title}</span>
      <span className={`block text-[9px] tracking-[0.18em] mt-1 ${sel ? "text-[#15230a]/80" : "text-[#8fae58]"}`}>{sub}</span>
      {sel && <span className="absolute -left-1 top-1/2 -translate-y-1/2 text-[#a8f637] text-lg leading-none" style={{ left: "-14px" }}>▶</span>}
    </button>
  );

  return (
    <div className="battlefield-bg min-h-screen w-full flex items-center justify-center p-3 sm:p-5 relative overflow-hidden">
      {/* фоновые декорации */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "repeating-linear-gradient(45deg, #a8f637 0 2px, transparent 2px 90px)" }} />

      <div className="flex flex-col xl:flex-row gap-5 items-center xl:items-stretch max-w-[1150px] w-full justify-center relative z-10">
        {/* ======== ИГРОВОЙ ЭКРАН ======== */}
        <div className="tank-frame scanlines shrink-0">
          <span className="rivet" style={{ top: 5, left: 5 }} />
          <span className="rivet" style={{ top: 5, right: 5 }} />
          <span className="rivet" style={{ bottom: 5, left: 5 }} />
          <span className="rivet" style={{ bottom: 5, right: 5 }} />
          <div className="relative" style={{ width: "min(92vw, 66vh, 624px)", aspectRatio: "1 / 1" }}>
            <canvas ref={canvasRef} className="w-full h-full block" style={{ imageRendering: "auto", background: "#0e120a" }} />

            {/* -------- МЕНЮ -------- */}
            {hud.phase === "menu" && (
              <div className="absolute inset-0 z-20 overlay-in flex flex-col items-center justify-center bg-[rgba(6,8,4,0.88)] px-6 text-center">
                <div className="hud-label mb-2">1985 · NES · ПЕРЕИЗДАНИЕ 2026</div>
                <h1 className="font-disp title-glow text-4xl sm:text-6xl leading-none text-[#a8f637]">СТАЛЬНОЙ<br />РУБЕЖ</h1>
                <p className="mt-3 text-[11px] tracking-[0.3em] text-[#8fae58] font-disp">BATTLE CITY RELOADED · {LEVEL_COUNT} УРОВНЕЙ</p>

                <div className="hazard h-1.5 w-40 my-4" />

                <div className="w-full max-w-[300px] flex flex-col gap-2.5">
                  {modeCard(hud.menuSel === 0, 0, "СОЛО-КАМПАНИЯ", "WASD + ПРОБЕЛ · 3 ЭКИПАЖА", "#a8f637")}
                  {modeCard(hud.menuSel === 1, 1, "КО-ОП НА ДВОИХ", "P1: WASD+SPACE · P2: СТРЕЛКИ+ENTER", "#54d8e8")}
                </div>
                <div className="mt-2.5 text-[10px] text-[#8fae58] tracking-widest">
                  <Kbd>↑</Kbd> <Kbd>↓</Kbd> выбор · <Kbd>Enter</Kbd> старт · <Kbd>1</Kbd> <Kbd>2</Kbd> быстрый старт
                </div>

                <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1.5 text-left text-[11px] text-[#cfe3ae]">
                  <div className="flex items-center gap-2 col-span-2 hud-label !text-[9px]">Брифинг по противнику</div>
                  <div className="flex items-center gap-2"><EnemyIcon kind="basic" /> Разведчик — 100</div>
                  <div className="flex items-center gap-2"><EnemyIcon kind="fast" /> Штурмовик — 200</div>
                  <div className="flex items-center gap-2"><EnemyIcon kind="power" /> Истребитель — 300</div>
                  <div className="flex items-center gap-2"><EnemyIcon kind="armor" /> Броненосец — 400</div>
                </div>

                {hud.best > 0 && (
                  <div className="mt-4 text-[11px] tracking-[0.2em] text-[#ffd76a] font-disp">РЕКОРД: {hud.best.toLocaleString("ru-RU")}</div>
                )}
              </div>
            )}

            {/* -------- ПАУЗА -------- */}
            {hud.phase === "paused" && (
              <div className="absolute inset-0 z-20 overlay-in flex flex-col items-center justify-center bg-[rgba(6,8,4,0.82)]">
                <div className="font-disp text-4xl text-[#ffd76a] tracking-widest blink">ПАУЗА</div>
                <div className="mt-4 flex flex-col gap-1.5 text-[12px] text-[#cfe3ae]">
                  <div className="flex items-center gap-3"><span className="w-3 h-3 inline-block" style={{ background: "#ffc84a" }} /> Игрок 1 — тюнинг <StarRow n={hud.star1} color="#ffc84a" /></div>
                  {coOp && <div className="flex items-center gap-3"><span className="w-3 h-3 inline-block" style={{ background: "#6fe25c" }} /> Игрок 2 — тюнинг <StarRow n={hud.star2} color="#6fe25c" /></div>}
                </div>
                <div className="mt-5 flex gap-3">
                  <button className="btn-arcade btn-acid px-5 py-2.5 text-xs" onClick={() => g?.togglePause()}>Продолжить</button>
                  <button className="btn-arcade btn-dark px-5 py-2.5 text-xs" onClick={() => g?.backToMenu()}>В меню</button>
                </div>
                <div className="mt-3 text-[10px] text-[#8fae58]"><Kbd>P</Kbd> / <Kbd>Esc</Kbd> — вернуться в бой</div>
              </div>
            )}

            {/* -------- GAME OVER -------- */}
            {hud.phase === "gameover" && (
              <div className="absolute inset-0 z-20 overlay-in flex flex-col items-center justify-center bg-[rgba(20,4,3,0.9)] px-6 text-center">
                <div className="font-disp text-5xl sm:text-6xl text-[#ff4747] title-glow" style={{ textShadow: "0 0 30px rgba(255,71,71,0.6)" }}>РАЗГРОМ</div>
                <div className="mt-2 text-[11px] tracking-[0.3em] text-[#ffb0a6]">{hud.reason.toUpperCase()}</div>
                <div className="hazard h-1.5 w-36 my-4" />
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[12px] text-[#e8efdd]">
                  <div className="text-right text-[#8fae58]">Очки</div><div className="text-left font-disp">{hud.score.toLocaleString("ru-RU")}</div>
                  <div className="text-right text-[#8fae58]">Рубеж</div><div className="text-left font-disp">{hud.level} / {LEVEL_COUNT}</div>
                  <div className="text-right text-[#8fae58]">Подбито</div><div className="text-left font-disp">{hud.kills}</div>
                  <div className="text-right text-[#8fae58]">Бонусы</div><div className="text-left font-disp">{hud.powerups}</div>
                  <div className="text-right text-[#8fae58]">Рекорд</div>
                  <div className={`text-left font-disp ${hud.newBest ? "text-[#ffd76a]" : ""}`}>{hud.best.toLocaleString("ru-RU")}{hud.newBest ? " ★" : ""}</div>
                </div>
                <div className="mt-5 flex gap-3 flex-wrap justify-center">
                  <button className="btn-arcade btn-acid px-6 py-3 text-xs" onClick={() => g?.startRun(hud.mode as 1 | 2)}>В бой снова</button>
                  <button className="btn-arcade btn-dark px-6 py-3 text-xs" onClick={() => g?.backToMenu()}>В меню</button>
                </div>
                <div className="mt-3 text-[10px] text-[#8fae58]"><Kbd>Enter</Kbd> — реванш</div>
              </div>
            )}

            {/* -------- ПОБЕДА -------- */}
            {hud.phase === "victory" && (
              <div className="absolute inset-0 z-20 overlay-in flex flex-col items-center justify-center bg-[rgba(8,14,4,0.92)] px-6 text-center">
                <div className="float-slow">
                  <svg viewBox="0 0 48 48" className="w-16 h-16 mx-auto" style={{ filter: "drop-shadow(0 0 14px rgba(255,210,58,0.7))" }}>
                    <path d="M24 4l5.8 11.8L43 17.7l-9.5 9.2 2.2 13.1L24 33.8 12.3 40l2.2-13.1L5 17.7l13.2-1.9z" fill="#ffd23a" />
                  </svg>
                </div>
                <div className="font-disp title-glow text-4xl sm:text-5xl text-[#a8f637] mt-2">ПОБЕДА</div>
                <div className="mt-2 text-[11px] tracking-[0.3em] text-[#cfe3ae]">ВСЕ {LEVEL_COUNT} РУБЕЖЕЙ ВЗЯТЫ{coOp ? " · ЭКИПАЖ-ДУЭТ" : ""}</div>
                <div className="hazard h-1.5 w-36 my-4" />
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[12px] text-[#e8efdd]">
                  <div className="text-right text-[#8fae58]">Очки</div><div className="text-left font-disp">{hud.score.toLocaleString("ru-RU")}</div>
                  <div className="text-right text-[#8fae58]">Подбито</div><div className="text-left font-disp">{hud.kills}</div>
                  <div className="text-right text-[#8fae58]">Рекорд</div>
                  <div className={`text-left font-disp ${hud.newBest ? "text-[#ffd76a]" : ""}`}>{hud.best.toLocaleString("ru-RU")}{hud.newBest ? " ★" : ""}</div>
                </div>
                <div className="mt-5 flex gap-3 flex-wrap justify-center">
                  <button className="btn-arcade btn-acid px-6 py-3 text-xs" onClick={() => g?.startRun(hud.mode as 1 | 2)}>Ещё раз</button>
                  <button className="btn-arcade btn-dark px-6 py-3 text-xs" onClick={() => g?.backToMenu()}>В меню</button>
                </div>
              </div>
            )}

            {/* -------- ЗАЧИСТКА -------- */}
            {hud.phase === "clear" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="slide-down hud-panel px-8 py-4 text-center">
                  <div className="font-disp text-3xl text-[#a8f637]">ЗАЧИЩЕНО</div>
                  <div className="mt-1 text-[11px] tracking-[0.25em] text-[#8fae58]">
                    РУБЕЖ {hud.level} / {LEVEL_COUNT} ПАЛ · ТОЧНОСТЬ {hud.accuracy}%
                  </div>
                </div>
              </div>
            )}

            {/* -------- СЕНСОРНОЕ УПРАВЛЕНИЕ -------- */}
            {playing && (
              <>
                <div className="touch-only absolute left-3 bottom-3 z-20 grid grid-cols-3 gap-1 select-none" style={{ width: 132 }}>
                  <span />
                  <button className="touch-btn h-11 text-lg" {...dpad(0)}>▲</button>
                  <span />
                  <button className="touch-btn h-11 text-lg" {...dpad(3)}>◀</button>
                  <span />
                  <button className="touch-btn h-11 text-lg" {...dpad(1)}>▶</button>
                  <span />
                  <button className="touch-btn h-11 text-lg" {...dpad(2)}>▼</button>
                  <span />
                </div>
                <div className="touch-only absolute right-3 bottom-3 z-20 select-none">
                  <button className="touch-btn w-16 h-16 rounded-full font-disp text-sm border-2" {...touchHold((v) => g?.setTouchFire(v))}>ОГОНЬ</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ======== HUD-ПАНЕЛЬ ======== */}
        <div className="w-full max-w-[624px] xl:w-[300px] xl:max-w-none flex flex-col gap-3">
          <div className="hud-panel px-4 pt-4 pb-3">
            <div className="hud-label">Противник</div>
            <div className="flex flex-wrap gap-[7px] mt-2 min-h-[22px] items-center">
              {Array.from({ length: Math.max(0, hud.enemiesLeft) }).map((_, i) => (
                <span key={i} className="inline-block w-[15px] h-[15px]" style={{ background: "#ff4747", clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)", boxShadow: "0 0 6px rgba(255,71,71,0.5)" }} />
              ))}
              {hud.enemiesLeft === 0 && <span className="text-[11px] text-[#8fae58] tracking-widest">ЧИСТО</span>}
            </div>
          </div>

          <div className="hud-panel px-4 pt-4 pb-3">
            <div className="hud-label">Очки</div>
            <div className="font-disp text-3xl text-[#ffd76a] leading-tight tabular-nums">{hud.score.toLocaleString("ru-RU")}</div>
            <div className="text-[10px] tracking-[0.2em] text-[#8fae58] mt-0.5">
              РЕКОРД {hud.best.toLocaleString("ru-RU")}{hud.newBest && <span className="text-[#ffd76a] blink ml-1">НОВЫЙ</span>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="hud-panel px-4 pt-4 pb-3">
              <div className="hud-label">Экипаж</div>
              <div className="flex items-end gap-2 mt-1.5">
                <span className="font-disp text-3xl text-[#a8f637] tabular-nums">{hud.lives}</span>
                <div className="flex flex-wrap gap-1 mb-1.5 max-w-[80px]">
                  {Array.from({ length: Math.min(hud.lives, 8) }).map((_, i) => (
                    <span key={i} className="inline-block w-3 h-3" style={{ background: "#a8f637", clipPath: "polygon(0 25%, 100% 25%, 100% 100%, 0 100%)", opacity: 0.9 }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="hud-panel px-4 pt-4 pb-3">
              <div className="hud-label">Рубеж</div>
              <div className="font-disp text-3xl text-[#e8efdd] tabular-nums">{hud.level}<span className="text-sm text-[#8fae58]"> / {LEVEL_COUNT}</span></div>
              <div className="text-[10px] tracking-[0.15em] text-[#8fae58] truncate">{hud.levelTitle}</div>
            </div>
          </div>

          <div className="hud-panel px-4 pt-4 pb-3">
            <div className="hud-label">Тюнинг орудия</div>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[11px] text-[#cfe3ae]">
                  <span className="w-3 h-3 inline-block" style={{ background: "#ffc84a" }} /> Игрок 1
                </span>
                <StarRow n={hud.star1} color="#ffc84a" />
              </div>
              {coOp && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[11px] text-[#cfe3ae]">
                    <span className="w-3 h-3 inline-block" style={{ background: "#6fe25c" }} /> Игрок 2
                  </span>
                  <StarRow n={hud.star2} color="#6fe25c" />
                </div>
              )}
            </div>
            <div className="mt-2.5 flex gap-2">
              <button className="btn-arcade btn-dark px-3 py-1.5 text-[10px] flex-1" onClick={() => g?.togglePause()} disabled={hud.phase !== "playing"}>
                {hud.phase === "paused" ? "Продолжить" : "Пауза"}
              </button>
              <button className="btn-arcade btn-dark px-3 py-1.5 text-[10px] flex-1" onClick={() => g?.toggleMute()}>
                Звук: {hud.muted ? "выкл" : "вкл"}
              </button>
            </div>
          </div>

          <div className="hud-panel px-4 pt-4 pb-4 hidden sm:block">
            <div className="hud-label mb-2">Управление</div>
            <div className="text-[11px] text-[#cfe3ae] flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="w-3 h-3 inline-block shrink-0" style={{ background: "#ffc84a" }} />
                <Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd> ход · <Kbd>Пробел</Kbd> огонь
              </div>
              {coOp ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="w-3 h-3 inline-block shrink-0" style={{ background: "#6fe25c" }} />
                  <Kbd>←</Kbd><Kbd>↑</Kbd><Kbd>↓</Kbd><Kbd>→</Kbd> ход · <Kbd>Enter</Kbd> огонь
                </div>
              ) : (
                <div className="text-[10px] text-[#8fae58]">В соло работают и стрелки</div>
              )}
              <div className="text-[10px] text-[#8fae58] pt-0.5 border-t border-[#2a3a1c] mt-1">
                <Kbd>P</Kbd> пауза · <Kbd>M</Kbd> звук · бонусы подбираются корпусом
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
