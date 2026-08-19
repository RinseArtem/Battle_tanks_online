import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { BattleCity, type HudSnapshot } from "./game/engine";
import { LEVEL_COUNT } from "./game/levels";

const ENEMIES = [
  { color: "#b9c6ae", label: "РАЗВЕДЧИК", pts: 100 },
  { color: "#54d8e8", label: "ШТУРМОВИК", pts: 200 },
  { color: "#ff6d9d", label: "ИСТРЕБИТЕЛЬ", pts: 300 },
  { color: "#ff4747", label: "БРОНЕНОСЕЦ", pts: 400 },
];

const POWERUPS = [
  { label: "ЗВЕЗДА", color: "#ffd23a", hint: "тюнинг орудия" },
  { label: "ЩИТ", color: "#8fe8ff", hint: "10 сек брони" },
  { label: "ЧАСЫ", color: "#8fe8ff", hint: "стоп-кран врагов" },
  { label: "ЛОПАТА", color: "#c3ccd4", hint: "сталь у Орла" },
  { label: "ГРАНАТА", color: "#ff6d5a", hint: "взрыв на поле" },
  { label: "ТАНК", color: "#a8f637", hint: "+1 к экипажу" },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<BattleCity | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const engine = new BattleCity(cv, setHud);
    engineRef.current = engine;
    return () => engine.destroy();
  }, []);

  const eng = () => engineRef.current;
  const inGame = hud && (hud.phase === "playing" || hud.phase === "paused" || hud.phase === "clear" || hud.phase === "intro");

  return (
    <div className="battlefield-bg h-full w-full overflow-hidden select-none">
      <div className="h-full w-full flex flex-col lg:flex-row items-center justify-center gap-5 p-3 lg:p-6">
        {/* ======= ИГРОВОЙ ЭКРАН ======= */}
        <div className="tank-frame scanlines shrink-0 relative">
          <span className="rivet" style={{ top: 4, left: 4 }} />
          <span className="rivet" style={{ top: 4, right: 4 }} />
          <span className="rivet" style={{ bottom: 4, left: 4 }} />
          <span className="rivet" style={{ bottom: 4, right: 4 }} />
          <div className="relative" style={{ width: "min(92vw, 60vh, 624px)" }}>
            <canvas ref={canvasRef} className="block w-full h-auto" style={{ imageRendering: "auto" }} />
            {hud && hud.phase === "menu" && <MenuOverlay hud={hud} onStart={(m) => eng()?.startRun(m)} onSel={(i) => eng()?.setMenuSel(i)} />}
            {hud && hud.phase === "paused" && <PauseOverlay hud={hud} onResume={() => eng()?.togglePause()} onMenu={() => eng()?.backToMenu()} />}
            {hud && hud.phase === "clear" && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none overlay-in">
                <div className="hud-panel px-8 py-5 text-center slide-down">
                  <div className="font-disp text-3xl text-[#a8f637] title-glow">СЕКТОР ЧИСТ</div>
                  <div className="mt-1.5 text-sm text-[#cfe3ae]">
                    ТОЧНОСТЬ ОГНЯ <span className="font-disp text-[#ffd76a]">{hud.accuracy}%</span> · БОНУС <span className="font-disp text-[#ffd76a]">+500</span>
                  </div>
                </div>
              </div>
            )}
            {hud && hud.phase === "gameover" && <GameOverOverlay hud={hud} onRetry={() => eng()?.startRun(hud.mode === 2 ? 2 : 1)} onMenu={() => eng()?.backToMenu()} />}
            {hud && hud.phase === "victory" && <VictoryOverlay hud={hud} onRetry={() => eng()?.startRun(hud.mode === 2 ? 2 : 1)} onMenu={() => eng()?.backToMenu()} />}
          </div>
        </div>

        {/* ======= ПАНЕЛЬ УПРАВЛЕНИЯ ======= */}
        <div className="w-full max-w-[560px] lg:w-[264px] flex flex-row lg:flex-col gap-3">
          <section className="hud-panel px-4 py-3 flex-1 lg:flex-none">
            <div className="flex items-baseline justify-between">
              <h2 className="hud-label">Счёт</h2>
              {hud?.newBest && <span className="font-disp text-[10px] text-[#ffd76a] blink">НОВЫЙ РЕКОРД</span>}
            </div>
            <div className="font-disp text-3xl text-[#e8efdd] tabular-nums mt-1">{(hud?.score ?? 0).toLocaleString("ru-RU")}</div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-[#8fae58]">
              <span>РЕКОРД <span className="text-[#cfe3ae] font-disp">{(hud?.best ?? 0).toLocaleString("ru-RU")}</span></span>
              <span>УБИЙСТВА <span className="text-[#cfe3ae] font-disp">{hud?.kills ?? 0}</span></span>
            </div>
          </section>

          <section className="hud-panel px-4 py-3 flex-1 lg:flex-none">
            <div className="flex items-baseline justify-between">
              <h2 className="hud-label">Уровень</h2>
              <span className="font-disp text-sm text-[#ffd76a]">{inGame ? `${hud?.level ?? 1} / ${LEVEL_COUNT}` : "—"}</span>
            </div>
            <div className="mt-1 font-disp text-sm text-[#e8efdd] tracking-wide">{inGame ? hud?.levelTitle : "ОЖИДАНИЕ БОЯ"}</div>
            <div className="mt-2">
              <h3 className="hud-label">Противник</h3>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className={`h-4 border ${i < (hud?.enemiesLeft ?? 0) ? "border-[#ff4747] bg-[#ff4747]/80" : "border-[#3c5224] bg-[#121a0b]"}`} />
                ))}
              </div>
              <div className="mt-1 text-[11px] text-[#8fae58]">
                осталось <span className="text-[#ffd76a] font-disp">{inGame ? hud?.enemiesLeft ?? 0 : "—"}</span> машин
              </div>
            </div>
          </section>

          <section className="hud-panel px-4 py-3 flex-1 lg:flex-none">
            <h2 className="hud-label">Экипаж</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {Array.from({ length: Math.min(hud?.lives ?? 0, 8) }).map((_, i) => (
                <svg key={i} viewBox="0 0 20 20" className="w-6 h-6">
                  <rect x="2" y="7" width="16" height="9" rx="1.5" fill="#a8f637" />
                  <rect x="6.5" y="3" width="7" height="5" rx="1" fill="#a8f637" />
                  <rect x="9" y="0.5" width="2" height="4" fill="#a8f637" />
                </svg>
              ))}
              {(hud?.lives ?? 0) > 8 && <span className="font-disp text-[#a8f637]">×{hud?.lives}</span>}
              {(hud?.lives ?? 0) === 0 && <span className="text-[#ff4747] font-disp text-xs">ЭКИПАЖ ПОТЕРЯН</span>}
            </div>
            <h3 className="hud-label mt-3">Тюнинг орудий</h3>
            <div className="mt-1.5 space-y-1.5">
              <TuningRow label={hud?.mode === 2 ? "ИГРОК 1" : "ИГРОК"} color="#ffc84a" stars={hud?.star ?? 0} />
              {hud?.mode === 2 && <TuningRow label="ИГРОК 2" color="#7ede6a" stars={hud?.star2 ?? 0} />}
            </div>
          </section>

          <section className="hud-panel px-4 py-3 hidden lg:block">
            <h2 className="hud-label">Брифинг</h2>
            <ul className="mt-2 space-y-1.5">
              {ENEMIES.map((e) => (
                <li key={e.label} className="flex items-center gap-2">
                  <EnemyIcon color={e.color} />
                  <span className="text-[11px] text-[#cfe3ae] flex-1">{e.label}</span>
                  <span className="font-disp text-[11px] text-[#ffd76a]">{e.pts}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 pt-1 border-t border-[#2a3a1c]">
                <EagleIcon />
                <span className="text-[11px] text-[#ffd76a] flex-1">БЕРЕГИ ОРЛА!</span>
              </li>
            </ul>
          </section>

          <section className="hud-panel px-4 py-3 lg:hidden">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div className="text-[10px] text-[#8fae58] leading-5">
                <span className="text-[#ffc84a] font-disp">ИГРОК 1</span><br />
                <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> ход<br />
                <Kbd>SPACE</Kbd> огонь
              </div>
              <div className="text-[10px] text-[#8fae58] leading-5">
                <span className="text-[#7ede6a] font-disp">ИГРОК 2</span><br />
                <Kbd>←↑↓→</Kbd> ход<br />
                <Kbd>ENTER</Kbd> огонь
              </div>
            </div>
          </section>

          <section className="hud-panel px-4 py-3 hidden lg:flex flex-col gap-2">
            <button className="btn-arcade btn-dark text-[11px] py-2" onClick={() => eng()?.togglePause()}>
              ПАУЗА · <span className="opacity-70">P</span>
            </button>
            <button className="btn-arcade btn-dark text-[11px] py-2" onClick={() => eng()?.toggleMute()}>
              ЗВУК: {hud?.muted ? "ВЫКЛ" : "ВКЛ"} · <span className="opacity-70">M</span>
            </button>
            <button className="btn-arcade btn-dark text-[11px] py-2" onClick={() => eng()?.backToMenu()}>В МЕНЮ</button>
          </section>
        </div>
      </div>

      {/* сенсорное управление */}
      <div className="touch-only fixed bottom-0 inset-x-0 z-40 flex items-end justify-between px-4 pb-4 pointer-events-none">
        <div className="grid grid-cols-3 gap-1 pointer-events-auto" style={{ width: 150 }}>
          <span />
          <TouchBtn code="up" onDown={() => eng()?.setTouchDir(0)} onUp={() => eng()?.setTouchDir(null)}><Arrow dir={0} /></TouchBtn>
          <span />
          <TouchBtn code="left" onDown={() => eng()?.setTouchDir(3)} onUp={() => eng()?.setTouchDir(null)}><Arrow dir={3} /></TouchBtn>
          <span />
          <TouchBtn code="right" onDown={() => eng()?.setTouchDir(1)} onUp={() => eng()?.setTouchDir(null)}><Arrow dir={1} /></TouchBtn>
          <span />
          <TouchBtn code="down" onDown={() => eng()?.setTouchDir(2)} onUp={() => eng()?.setTouchDir(null)}><Arrow dir={2} /></TouchBtn>
          <span />
        </div>
        <TouchBtn
          code="fire"
          onDown={() => eng()?.setTouchFire(true)}
          onUp={() => eng()?.setTouchFire(false)}
          className="pointer-events-auto w-24 h-24 rounded-full font-disp text-sm text-[#ffd76a]"
        >
          ОГОНЬ
        </TouchBtn>
      </div>
    </div>
  );
}

/* ==================== оверлеи ==================== */

function MenuOverlay({ hud, onStart, onSel }: { hud: HudSnapshot; onStart: (m: 1 | 2) => void; onSel: (i: number) => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070904]/82 backdrop-blur-[2px] text-center px-4 overflow-y-auto">
      <div className="overlay-in w-full max-w-[460px] flex flex-col items-center">
        <div className="flex items-center gap-3 mb-1 float-slow">
          <TankIcon color="#ffc84a" className="w-10 h-10" />
          <TankIcon color="#7ede6a" className="w-8 h-8" />
          <TankIcon color="#ff6d9d" className="w-7 h-7 opacity-80" />
        </div>
        <h1 className="font-disp text-[40px] sm:text-5xl leading-none text-[#a8f637] title-glow">СТАЛЬНОЙ</h1>
        <h1 className="font-disp text-[40px] sm:text-5xl leading-none text-[#ffd76a]">РУБЕЖ</h1>
        <p className="mt-1 font-disp text-[11px] tracking-[0.3em] text-[#8fae58]">BATTLE CITY RELOADED · 50 УРОВНЕЙ</p>
        {hud.best > 0 && (
          <p className="mt-2 font-disp text-xs text-[#ffd76a]">РЕКОРД: {hud.best.toLocaleString("ru-RU")}</p>
        )}

        <div className="mt-5 w-full max-w-[330px] flex flex-col gap-2">
          <button
            className={`btn-arcade py-3 text-sm ${hud.menuSel === 0 ? "btn-acid" : "btn-dark"}`}
            onMouseEnter={() => onSel(0)}
            onClick={() => onStart(1)}
          >
            1 Игрок · <span className="opacity-70">[1]</span>
          </button>
          <button
            className={`btn-arcade py-3 text-sm ${hud.menuSel === 1 ? "btn-acid" : "btn-dark"}`}
            onMouseEnter={() => onSel(1)}
            onClick={() => onStart(2)}
          >
            2 Игрока · <span className="opacity-70">[2]</span>
          </button>
          <p className="text-[10px] text-[#8fae58] tracking-wider">W/S — выбор · ENTER — бой</p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 w-full max-w-[420px] text-left">
          <div className="hud-panel px-3 py-2.5">
            <div className="font-disp text-[10px] tracking-widest text-[#ffc84a]">ИГРОК 1</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-[#cfe3ae]">
              <Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd> — ход
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-[#cfe3ae]">
              <Kbd>SPACE</Kbd> / <Kbd>J</Kbd> — огонь
            </div>
          </div>
          <div className="hud-panel px-3 py-2.5">
            <div className="font-disp text-[10px] tracking-widest text-[#7ede6a]">ИГРОК 2</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] text-[#cfe3ae]">
              <Kbd>↑</Kbd><Kbd>←</Kbd><Kbd>↓</Kbd><Kbd>→</Kbd> — ход
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-[#cfe3ae]">
              <Kbd>ENTER</Kbd> / <Kbd>R-SHIFT</Kbd> — огонь
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-[#8fae58]"><Kbd>P</Kbd> пауза · <Kbd>M</Kbd> звук · соло: стрелки тоже работают</p>

        <details className="mt-4 w-full max-w-[420px] hud-panel px-3 py-2 text-left">
          <summary className="hud-label cursor-pointer list-none">Разведданные ▾</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              {ENEMIES.map((e) => (
                <div key={e.label} className="flex items-center gap-1.5 py-0.5">
                  <EnemyIcon color={e.color} small />
                  <span className="text-[10px] text-[#cfe3ae] flex-1">{e.label}</span>
                  <span className="font-disp text-[10px] text-[#ffd76a]">{e.pts}</span>
                </div>
              ))}
            </div>
            <div>
              {POWERUPS.map((p) => (
                <div key={p.label} className="flex items-center gap-1.5 py-0.5">
                  <span className="w-2.5 h-2.5 shrink-0" style={{ background: p.color }} />
                  <span className="text-[10px] text-[#cfe3ae]">{p.label} — <span className="text-[#8fae58]">{p.hint}</span></span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[10px] text-[#8fae58] border-t border-[#2a3a1c] pt-1.5">
            Мигающие машины несут бонус. Звёзды прокачивают орудие: темп, двойной залп, бронебойность. Лёд скользит, лес скрывает, вода не проходима. Не дай врагу добраться до Орла!
          </p>
        </details>
      </div>
    </div>
  );
}

function PauseOverlay({ hud, onResume, onMenu }: { hud: HudSnapshot; onResume: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070904]/78 backdrop-blur-[2px] text-center px-6">
      <div className="overlay-in hud-panel px-10 py-8 slide-down">
        <div className="hazard h-2 w-full mb-5" />
        <h2 className="font-disp text-3xl text-[#ffd76a]">ПАУЗА</h2>
        <p className="mt-2 text-sm text-[#cfe3ae]">
          СЧЁТ <span className="font-disp text-[#ffd76a]">{hud.score.toLocaleString("ru-RU")}</span> · УРОВЕНЬ <span className="font-disp text-[#ffd76a]">{hud.level}</span>
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button className="btn-arcade btn-acid px-8 py-2.5 text-sm" onClick={onResume}>Продолжить · P</button>
          <button className="btn-arcade btn-dark px-8 py-2.5 text-xs" onClick={onMenu}>Покинуть бой</button>
        </div>
      </div>
    </div>
  );
}

function GameOverOverlay({ hud, onRetry, onMenu }: { hud: HudSnapshot; onRetry: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#12060a]/85 backdrop-blur-[2px] text-center px-6">
      <div className="overlay-in">
        <div className="font-disp text-[9px] tracking-[0.4em] text-[#ff4747]">СВODКА С ПОЛЯ БОЯ</div>
        <h2 className="font-disp text-5xl sm:text-6xl text-[#ff4747] mt-1" style={{ textShadow: "0 0 34px rgba(255,71,71,0.55)" }}>
          ПОРАЖЕНИЕ
        </h2>
        <p className="mt-2 text-sm text-[#e8b3ab]">{hud.reason}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Stat label="СЧЁТ" value={hud.score.toLocaleString("ru-RU")} />
          <Stat label="РЕКОРД" value={hud.best.toLocaleString("ru-RU")} />
          <Stat label="УРОВЕНЬ" value={`${hud.level} / ${LEVEL_COUNT}`} />
          <Stat label="УНИЧТОЖЕНО" value={String(hud.kills)} />
        </div>
        {hud.newBest && <p className="mt-3 font-disp text-[#ffd76a] blink text-sm">НОВЫЙ РЕКОРД!</p>}
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          <button className="btn-arcade btn-amber px-8 py-3 text-sm" onClick={onRetry}>В бой снова · Enter</button>
          <button className="btn-arcade btn-dark px-8 py-3 text-sm" onClick={onMenu}>В меню</button>
        </div>
      </div>
    </div>
  );
}

function VictoryOverlay({ hud, onRetry, onMenu }: { hud: HudSnapshot; onRetry: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a1206]/88 backdrop-blur-[2px] text-center px-6">
      <div className="overlay-in">
        <div className="flex justify-center gap-2 mb-2">
          {[0, 1, 2].map((i) => (
            <svg key={i} viewBox="0 0 24 24" className="w-8 h-8 float-slow" style={{ animationDelay: `${i * 0.25}s` }}>
              <path d="M12 2l2.6 6.6L21 9.3l-5 4.4 1.5 6.8L12 17l-5.5 3.5L8 13.7 3 9.3l6.4-.7z" fill="#ffd23a" stroke="#8a6410" strokeWidth="1" />
            </svg>
          ))}
        </div>
        <h2 className="font-disp text-5xl sm:text-6xl text-[#a8f637] title-glow">ПОБЕДА</h2>
        <p className="mt-2 font-disp text-[11px] tracking-[0.3em] text-[#8fae58]">ВСЕ {LEVEL_COUNT} УРОВНЕЙ ПОЗАДИ · ВОЙНА ОКОНЧЕНА</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Stat label="ИТОГОВЫЙ СЧЁТ" value={hud.score.toLocaleString("ru-RU")} />
          <Stat label="УНИЧТОЖЕНО" value={String(hud.kills)} />
          <Stat label="БОНУСОВ" value={String(hud.powerups)} />
        </div>
        {hud.newBest && <p className="mt-3 font-disp text-[#ffd76a] blink text-sm">НОВЫЙ РЕКОРД!</p>}
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          <button className="btn-arcade btn-acid px-8 py-3 text-sm" onClick={onRetry}>Новая кампания · Enter</button>
          <button className="btn-arcade btn-dark px-8 py-3 text-sm" onClick={onMenu}>В меню</button>
        </div>
      </div>
    </div>
  );
}

/* ==================== мелочи ==================== */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-panel px-4 py-2 min-w-[104px]">
      <div className="hud-label">{label}</div>
      <div className="font-disp text-lg text-[#e8efdd] mt-0.5">{value}</div>
    </div>
  );
}

function TuningRow({ label, color, stars }: { label: string; color: string; stars: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-disp text-[9px] w-16 shrink-0" style={{ color }}>{label}</span>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <svg key={i} viewBox="0 0 24 24" className="w-4 h-4">
            <path
              d="M12 2l2.6 6.6L21 9.3l-5 4.4 1.5 6.8L12 17l-5.5 3.5L8 13.7 3 9.3l6.4-.7z"
              fill={i < stars ? color : "#22301a"}
              stroke={i < stars ? "#0a0d07" : "#3c5224"}
              strokeWidth="1"
            />
          </svg>
        ))}
      </div>
      <span className="text-[9px] text-[#8fae58]">{["ШТАТНОЕ", "СКОРОСТР.", "ДВОЙНОЙ", "БРОНЕБОЙ"][Math.max(0, Math.min(3, stars))]}</span>
    </div>
  );
}

function TankIcon({ color, className }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className}>
      <rect x="2" y="5" width="3" height="13" rx="1" fill={color} />
      <rect x="15" y="5" width="3" height="13" rx="1" fill={color} />
      <rect x="6" y="7" width="8" height="9" rx="1.5" fill={color} />
      <rect x="9" y="1" width="2" height="7" fill={color} />
      <circle cx="10" cy="11.5" r="2.2" fill="#0a0d07" opacity="0.35" />
    </svg>
  );
}

function EnemyIcon({ color, small }: { color: string; small?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className={small ? "w-4 h-4 shrink-0" : "w-5 h-5 shrink-0"}>
      <rect x="2" y="5" width="3" height="13" rx="1" fill={color} />
      <rect x="15" y="5" width="3" height="13" rx="1" fill={color} />
      <rect x="6" y="7" width="8" height="9" rx="1.5" fill={color} />
      <rect x="9" y="1" width="2" height="7" fill={color} />
    </svg>
  );
}

function EagleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-5 h-5 shrink-0">
      <rect x="1" y="1" width="18" height="18" fill="#141008" stroke="#8a6410" />
      <path d="M10 4l1.6 3.6L15 8.3l-2.6 2.4.8 3.9L10 12.6l-3.2 2 .8-3.9L5 8.3l3.4-.7z" fill="#f5c542" />
    </svg>
  );
}

function Arrow({ dir }: { dir: number }) {
  const rot = [0, 90, 180, 270][dir];
  return (
    <svg viewBox="0 0 20 20" className="w-6 h-6" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M10 3l7 8h-4v6H7v-6H3z" fill="currentColor" />
    </svg>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd inline-block">{children}</span>;
}

function TouchBtn({ onDown, onUp, className, children, code }: { onDown: () => void; onUp: () => void; className?: string; children: ReactNode; code?: string }) {
  void code;
  return (
    <button
      className={`touch-btn flex items-center justify-center w-12 h-12 ${className ?? ""}`}
      onTouchStart={(e: TouchEvent) => { e.preventDefault(); onDown(); }}
      onTouchEnd={(e: TouchEvent) => { e.preventDefault(); onUp(); }}
      onTouchCancel={onUp}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
