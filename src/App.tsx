import { useEffect, useRef, useState, type ReactNode } from "react";
import { BattleCity, type HudSnapshot } from "./game/engine";

const initialHud: HudSnapshot = {
  phase: "menu", score: 0, best: 0, newBest: false, lives: 3, level: 1,
  levelTitle: "ПЕРЕДОВАЯ", enemiesLeft: 0, star: 0, muted: false,
  kills: 0, accuracy: 0, powerups: 0, reason: "",
};

/* ---------------- SVG-иконки ---------------- */
function TankIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <rect x="7" y="0" width="2" height="6" />
      <rect x="4.5" y="4" width="7" height="4" rx="1" />
      <rect x="2" y="7.5" width="12" height="5" rx="1" />
      <rect x="0.5" y="12.5" width="15" height="2.6" rx="1.2" />
    </svg>
  );
}
function StarIcon({ className = "", dim = false }: { className?: string; dim?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" opacity={dim ? 0.18 : 1} aria-hidden>
      <path d="M8 0.8l2.2 4.6 5 .7-3.6 3.5.9 5L8 12.2l-4.5 2.4.9-5L.8 6.1l5-.7z" />
    </svg>
  );
}
function SoundIcon({ off, className = "" }: { off: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden>
      <path d="M2 7h3l5-4v14l-5-4H2z" />
      {off ? (
        <path d="M12.5 7.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M13 6.5a5 5 0 010 7M15.5 4.5a8 8 0 010 11" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}
function PauseIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <rect x="3" y="2" width="4" height="12" /><rect x="9" y="2" width="4" height="12" />
    </svg>
  );
}
function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect x="1" y="1" width="38" height="38" fill="#1b2412" stroke="#56742c" strokeWidth="2" />
      <rect x="18" y="5" width="4" height="12" fill="#a8f637" />
      <rect x="13" y="14" width="14" height="8" rx="2" fill="#ffc84a" />
      <rect x="8" y="21" width="24" height="9" rx="2" fill="#ffc84a" />
      <rect x="5" y="30" width="30" height="5" rx="2.4" fill="#86d416" />
      <circle cx="20" cy="25.5" r="2.4" fill="#15230a" />
    </svg>
  );
}

const ENEMY_BRIEF = [
  { name: "РАЗВЕДЧИК", pts: 100, color: "#b9c6ae" },
  { name: "ШТУРМОВИК", pts: 200, color: "#54d8e8" },
  { name: "ИСТРЕБИТЕЛЬ", pts: 300, color: "#ff6d9d" },
  { name: "БРОНЕНОСЕЦ", pts: 400, color: "#9a8f82" },
];

function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

/* ---------------- основной компонент ---------------- */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engRef = useRef<BattleCity | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(initialHud);
  const [side, setSide] = useState(520);

  useEffect(() => {
    const eng = new BattleCity(canvasRef.current!, setHud);
    engRef.current = eng;
    return () => eng.destroy();
  }, []);

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSide(Math.max(240, Math.floor(Math.min(r.width, r.height)) - 6));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const eng = () => engRef.current;
  const inGame = hud.phase === "playing" || hud.phase === "paused" || hud.phase === "intro" || hud.phase === "clear";

  return (
    <div className="battlefield-bg h-full flex flex-col select-none overflow-hidden">
      {/* ======= шапка ======= */}
      <header className="flex items-center gap-3 px-4 h-14 shrink-0 border-b border-[#2a3a1c] bg-[#0c100a]/80">
        <LogoMark className="w-8 h-8 shrink-0" />
        <div className="leading-none">
          <div className="font-disp text-[17px] tracking-wide text-[#e8efdd]">
            СТАЛЬНОЙ <span className="text-[#a8f637]">РУБЕЖ</span>
          </div>
          <div className="text-[10px] tracking-[0.3em] text-[#8fae58] font-medium mt-1">BATTLE CITY · RELOADED</div>
        </div>
        <div className="flex-1" />
        <div className="hidden sm:flex items-center gap-5 mr-1">
          <div className="text-right leading-tight">
            <div className="hud-label">Счёт</div>
            <div className="font-disp text-lg text-[#ffb42a]">{hud.score}</div>
          </div>
          <div className="text-right leading-tight">
            <div className="hud-label">Рекорд</div>
            <div className="font-disp text-lg text-[#a8f637]">{hud.best}</div>
          </div>
        </div>
        <button
          className="btn-arcade btn-dark px-3 py-2 flex items-center gap-2 text-[11px]"
          onClick={() => eng()?.toggleMute()}
          title="Звук (M)"
        >
          <SoundIcon off={hud.muted} className="w-4 h-4" />
          <span className="hidden md:inline">{hud.muted ? "Звук выкл" : "Звук вкл"}</span>
        </button>
      </header>

      {/* ======= игровое поле + HUD ======= */}
      <main className="flex-1 min-h-0 flex items-stretch justify-center gap-4 px-4 py-3">
        <div ref={wrapRef} className="relative flex-1 min-w-0 flex items-center justify-center">
          <div className="tank-frame scanlines relative shrink-0" style={{ width: side, height: side }}>
            {[["top-1 left-1"], ["top-1 right-1"], ["bottom-1 left-1"], ["bottom-1 right-1"]].map((p) => (
              <span key={p[0]} className={`rivet ${p[0]}`} />
            ))}
            <canvas
              ref={canvasRef}
              className="block w-full h-full relative z-10"
              style={{ imageRendering: "auto" }}
            />

            {/* ---------- оверлеи ---------- */}
            {hud.phase === "menu" && (
              <div className="absolute inset-[10px] z-40 overlay-in flex flex-col items-center justify-center text-center bg-[#0a0d07]/92 px-5 overflow-hidden">
                <div className="text-[10px] tracking-[0.4em] text-[#8fae58] font-medium mb-3">ОПЕРАЦИЯ · NES TRIBUTE · 1985/2026</div>
                <h1 className="font-disp title-glow text-[#a8f637] leading-none" style={{ fontSize: "clamp(30px, 6.2vmin, 54px)" }}>
                  СТАЛЬНОЙ<br />РУБЕЖ
                </h1>
                <div className="font-disp text-[#ffb42a] tracking-[0.42em] text-sm mt-3 mb-6">BATTLE CITY RELOADED</div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 mb-6">
                  {ENEMY_BRIEF.map((e) => (
                    <div key={e.name} className="flex items-center gap-2.5">
                      <span className="shrink-0 drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]" style={{ color: e.color }}>
                        <TankIcon className="w-5 h-5" />
                      </span>
                      <span className="block leading-tight">
                        <span className="block text-[11px] font-bold tracking-wide" style={{ color: e.color }}>{e.name}</span>
                        <span className="block text-[10px] text-[#8fae58]">{e.pts} очков</span>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-[#cfe3ae] mb-7">
                  <span className="flex items-center gap-1.5"><Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd><span className="text-[#8fae58]">движение</span></span>
                  <span className="flex items-center gap-1.5"><Kbd>SPACE</Kbd><span className="text-[#8fae58]">огонь</span></span>
                  <span className="flex items-center gap-1.5"><Kbd>P</Kbd><span className="text-[#8fae58]">пауза</span></span>
                  <span className="flex items-center gap-1.5"><Kbd>M</Kbd><span className="text-[#8fae58]">звук</span></span>
                </div>

                <button className="btn-arcade btn-acid px-10 py-3.5 text-[15px]" onClick={() => eng()?.startRun()}>
                  В БОЙ
                </button>
                <div className="blink font-disp text-[11px] text-[#ffd76a] tracking-[0.3em] mt-4">НАЖМИ ENTER</div>
                {hud.best > 0 && (
                  <div className="absolute bottom-4 text-[11px] text-[#8fae58]">
                    Рекорд командования: <span className="font-disp text-[#a8f637]">{hud.best}</span>
                  </div>
                )}
              </div>
            )}

            {hud.phase === "paused" && (
              <div className="absolute inset-[10px] z-40 overlay-in flex flex-col items-center justify-center bg-[#0a0d07]/88">
                <PauseIcon className="w-10 h-10 text-[#ffb42a] mb-3" />
                <div className="font-disp text-3xl text-[#e8efdd] tracking-widest">ПАУЗА</div>
                <div className="text-[11px] text-[#8fae58] tracking-[0.25em] mt-2 mb-7">ОПЕРАЦИЯ ПРИОСТАНОВЛЕНА</div>
                <div className="flex flex-col gap-3 w-56">
                  <button className="btn-arcade btn-acid py-3 text-sm" onClick={() => eng()?.togglePause()}>Продолжить · P</button>
                  <button className="btn-arcade btn-dark py-3 text-sm" onClick={() => eng()?.backToMenu()}>В меню</button>
                </div>
              </div>
            )}

            {hud.phase === "gameover" && (
              <div className="absolute inset-[10px] z-40 overlay-in flex flex-col items-center justify-center text-center bg-[#160808]/93 px-6">
                <div className="hazard h-2 w-40 mb-5" />
                <div className="font-disp text-[#ff4747] leading-none" style={{ fontSize: "clamp(26px, 5.4vmin, 44px)", textShadow: "0 0 24px rgba(255,71,71,0.5)" }}>
                  ИГРА ОКОНЧЕНА
                </div>
                <div className="text-[12px] text-[#e8b4ae] tracking-[0.2em] mt-3 uppercase">{hud.reason}</div>
                <div className="grid grid-cols-3 gap-6 mt-7 mb-8">
                  <div><div className="hud-label">Счёт</div><div className="font-disp text-2xl text-[#ffb42a]">{hud.score}</div></div>
                  <div><div className="hud-label">Рекорд</div><div className="font-disp text-2xl text-[#a8f637]">{hud.best}</div></div>
                  <div><div className="hud-label">Подбито</div><div className="font-disp text-2xl text-[#e8efdd]">{hud.kills}</div></div>
                </div>
                {hud.newBest && <div className="blink font-disp text-[#ffd23a] text-sm tracking-[0.25em] mb-5">★ НОВЫЙ РЕКОРД ★</div>}
                <div className="flex flex-col gap-3 w-60">
                  <button className="btn-arcade btn-amber py-3 text-sm" onClick={() => eng()?.startRun()}>Реванш · Enter</button>
                  <button className="btn-arcade btn-dark py-3 text-sm" onClick={() => eng()?.backToMenu()}>В меню</button>
                </div>
              </div>
            )}

            {hud.phase === "victory" && (
              <div className="absolute inset-[10px] z-40 overlay-in flex flex-col items-center justify-center text-center bg-[#0a120a]/93 px-6">
                <div className="flex gap-2 mb-4">
                  {[0, 1, 2].map((i) => <StarIcon key={i} className="w-7 h-7 text-[#ffd23a] float-slow" />)}
                </div>
                <div className="font-disp title-glow text-[#a8f637]" style={{ fontSize: "clamp(30px, 6vmin, 50px)" }}>ПОБЕДА!</div>
                <div className="text-[12px] text-[#cfe3ae] tracking-[0.22em] mt-3">ШЕСТЬ РУБЕЖЕЙ ВЗЯТЫ · СЧЁТ {hud.score}</div>
                <div className="text-[11px] text-[#8fae58] mt-1 mb-7">Подбито: {hud.kills} · Бонусов: {hud.powerups}</div>
                <div className="flex flex-col gap-3 w-64">
                  <button className="btn-arcade btn-acid py-3 text-sm" onClick={() => eng()?.continueWar()}>Продолжить войну · Enter</button>
                  <button className="btn-arcade btn-dark py-3 text-sm" onClick={() => eng()?.backToMenu()}>В меню</button>
                </div>
              </div>
            )}

            {hud.phase === "clear" && (
              <div className="absolute inset-[10px] z-30 pointer-events-none flex flex-col items-center justify-center">
                <div className="slide-down bg-[#0a0d07]/85 border border-[#56742c] px-8 py-5 text-center shadow-[0_0_40px_rgba(168,246,55,0.25)]">
                  <div className="hazard h-1.5 w-full mb-3" />
                  <div className="font-disp text-[#a8f637] text-2xl tracking-wider">УРОВЕНЬ {hud.level} ЗАЧИЩЕН</div>
                  <div className="text-[11px] text-[#cfe3ae] mt-2 tracking-widest">
                    ТОЧНОСТЬ {hud.accuracy}% · ПОДБИТО {hud.kills} · +500
                  </div>
                  <div className="hazard h-1.5 w-full mt-3" />
                </div>
              </div>
            )}
          </div>

          {/* ------- сенсорное управление ------- */}
          {inGame && hud.phase !== "paused" && (
            <div className="touch-only absolute inset-x-0 bottom-2 z-50 flex items-end justify-between px-4 pointer-events-none">
              <div className="grid grid-cols-3 gap-1.5 pointer-events-auto" style={{ width: 150 }}>
                <span />
                <TouchBtn label="▲" onDown={() => eng()?.setTouchDir(0)} onUp={() => eng()?.setTouchDir(null)} />
                <span />
                <TouchBtn label="◀" onDown={() => eng()?.setTouchDir(3)} onUp={() => eng()?.setTouchDir(null)} />
                <span />
                <TouchBtn label="▶" onDown={() => eng()?.setTouchDir(1)} onUp={() => eng()?.setTouchDir(null)} />
                <span />
                <TouchBtn label="▼" onDown={() => eng()?.setTouchDir(2)} onUp={() => eng()?.setTouchDir(null)} />
                <span />
              </div>
              <button
                className="touch-btn pointer-events-auto rounded-full font-disp text-sm text-[#ffd76a]"
                style={{ width: 74, height: 74 }}
                onPointerDown={(e) => { e.preventDefault(); eng()?.setTouchFire(true); }}
                onPointerUp={() => eng()?.setTouchFire(false)}
                onPointerLeave={() => eng()?.setTouchFire(false)}
                onPointerCancel={() => eng()?.setTouchFire(false)}
              >
                ОГОНЬ
              </button>
            </div>
          )}
        </div>

        {/* ======= правая HUD-панель ======= */}
        <aside className="hidden lg:flex flex-col gap-3 w-60 shrink-0 min-h-0 overflow-y-auto py-0.5">
          <div className="hud-panel p-3 pt-4">
            <div className="flex items-baseline justify-between">
              <span className="hud-label">Противники</span>
              <span className="font-disp text-lg text-[#ff6d5a]">{hud.enemiesLeft}</span>
            </div>
            <div className="grid grid-cols-10 gap-[3px] mt-2">
              {Array.from({ length: Math.min(hud.enemiesLeft, 20) }).map((_, i) => (
                <TankIcon key={i} className="w-3.5 h-3.5 text-[#ff8a6a]" />
              ))}
              {hud.enemiesLeft === 0 && inGame && <span className="text-[10px] text-[#8fae58] col-span-10">чисто</span>}
            </div>
          </div>

          <div className="hud-panel p-3 pt-4">
            <span className="hud-label">Счёт</span>
            <div className="font-disp text-[28px] leading-tight text-[#ffb42a]">{hud.score}</div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-[#8fae58] tracking-widest">РЕКОРД</span>
              <span className="font-disp text-sm text-[#a8f637]">{hud.best}</span>
            </div>
            {hud.newBest && hud.score > 0 && (
              <div className="blink text-[9px] font-disp text-[#ffd23a] tracking-[0.2em] mt-1">НОВЫЙ РЕКОРД</div>
            )}
          </div>

          <div className="hud-panel p-3 pt-4">
            <div className="flex items-center justify-between">
              <span className="hud-label">Экипаж</span>
              <span className="font-disp text-lg text-[#a8f637]">{hud.lives}</span>
            </div>
            <div className="flex gap-1.5 mt-2">
              {Array.from({ length: Math.min(hud.lives, 5) }).map((_, i) => (
                <TankIcon key={i} className="w-5 h-5 text-[#ffc84a]" />
              ))}
              {hud.lives > 5 && <span className="font-disp text-[#ffc84a] text-sm self-center">+{hud.lives - 5}</span>}
              {hud.lives === 0 && <span className="text-[10px] text-[#8fae58]">резерв исчерпан</span>}
            </div>
          </div>

          <div className="hud-panel p-3 pt-4">
            <div className="flex items-baseline justify-between">
              <span className="hud-label">Уровень</span>
              <span className="font-disp text-[28px] leading-none text-[#e8efdd]">{hud.level}</span>
            </div>
            <div className="text-[11px] font-bold tracking-[0.18em] text-[#8fae58] mt-1">{hud.levelTitle}</div>
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className="hud-label mr-1">Тюнинг</span>
              {[0, 1, 2].map((i) => (
                <StarIcon key={i} className="w-4 h-4 text-[#ffd23a]" dim={hud.star <= i} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button className="btn-arcade btn-dark py-2.5 text-[11px] flex items-center justify-center gap-2" onClick={() => eng()?.togglePause()} disabled={!inGame}>
              <PauseIcon className="w-3 h-3" /> Пауза · P
            </button>
            <button className="btn-arcade btn-dark py-2.5 text-[11px]" onClick={() => eng()?.backToMenu()}>
              В меню
            </button>
          </div>

          <div className="hud-panel p-3 pt-4 mt-auto">
            <span className="hud-label">Управление</span>
            <div className="mt-2 space-y-1.5 text-[10px] text-[#cfe3ae]">
              <div className="flex justify-between items-center"><span>Движение</span><span className="flex gap-1"><Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd></span></div>
              <div className="flex justify-between items-center"><span>Огонь</span><span className="flex gap-1"><Kbd>SPACE</Kbd><Kbd>J</Kbd></span></div>
              <div className="flex justify-between items-center"><span>Пауза</span><span className="flex gap-1"><Kbd>P</Kbd><Kbd>ESC</Kbd></span></div>
              <div className="flex justify-between items-center"><span>Звук</span><Kbd>M</Kbd></div>
            </div>
            <div className="mt-3 pt-2 border-t border-[#2a3a1c] text-[9px] leading-relaxed text-[#6d8444]">
              Сбивай мигающие танки — из них выпадают бонусы. Не дай врагам расстрелять Орла.
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function TouchBtn({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  return (
    <button
      className="touch-btn rounded-md h-11 flex items-center justify-center text-base"
      onPointerDown={(e) => { e.preventDefault(); onDown(); }}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onPointerCancel={onUp}
    >
      {label}
    </button>
  );
}
