/* Дезматч: лобби (локальное с ботами или сетевое P2P), бой на арене 1440×1440. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { audio } from "../game/audio";
import { NetRoom, makeCode, type PlayerInfo } from "../net/net";
import { DMRenderer } from "../dm/render";
import {
  createWorld, addTank, stepWorld, botInputs, makeSnapshot, applySnapshot,
  CLASSES, CLASS_IDS, WEAPONS, UTILS, WORLD, PLAYER_COLORS, BOT_NAMES,
  type World, type Input, type TankClass, type WeaponId, type UtilId,
} from "./sim";

const TIME_LIMIT = 180;
const TICK = 0.05;
const randId = () => Math.random().toString(36).slice(2, 9);

interface MatchCfg { seed: number; fragLimit: number; timeLimit: number; players: PlayerInfo[]; }
interface BoardRow { name: string; kills: number; deaths: number; color: string; me: boolean; bot: boolean; }
interface HudDM {
  hp: number; maxHp: number; shield: number; boost: number; invuln: number;
  weapon: WeaponId; ammo: number; util: UtilId | null;
  kills: number; deaths: number; streak: number;
  dead: boolean; respawnT: number; zoneOut: boolean;
  board: BoardRow[]; matchT: number; timeLimit: number; sudden: boolean;
  over: boolean; winner: string | null; winnerMe: boolean;
  feed: { id: number; killer: string; victim: string; weapon: string }[];
}

function buildHud(w: World, meId: string, cfg: MatchCfg): HudDM {
  const me = w.tanks.find((t) => t.id === meId);
  const board = [...w.tanks]
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    .map((t) => ({ name: t.name, kills: t.kills, deaths: t.deaths, color: t.color, me: t.id === meId, bot: t.bot }));
  const winner = w.winner ? w.tanks.find((t) => t.id === w.winner)?.name ?? "—" : null;
  return {
    hp: me ? Math.max(0, Math.round(me.hp)) : 0,
    maxHp: me?.maxHp ?? 100,
    shield: me?.shieldT ?? 0,
    boost: me?.boostT ?? 0,
    invuln: me?.invulnT ?? 0,
    weapon: me?.weapon ?? "mg",
    ammo: me?.ammo ?? Infinity,
    util: me?.util ?? null,
    kills: me?.kills ?? 0,
    deaths: me?.deaths ?? 0,
    streak: me?.streak ?? 0,
    dead: me ? me.dead : true,
    respawnT: me?.respawnT ?? 0,
    zoneOut: !!(me && w.sudden && Math.hypot(me.x - w.zoneX, me.y - w.zoneY) > w.zoneR),
    board,
    matchT: w.matchT,
    timeLimit: cfg.timeLimit,
    sudden: w.sudden,
    over: w.over,
    winner,
    winnerMe: w.winner === meId,
    feed: w.feed.slice(-4).reverse().map((f) => ({ id: f.id, killer: f.killer, victim: f.victim, weapon: f.weapon })),
  };
}

const fmtTime = (s: number) => {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};

export default function Deathmatch({ onExit }: { onExit: () => void }) {
  const [stage, setStage] = useState<"setup" | "lobby" | "game">("setup");
  const [name, setName] = useState(() => localStorage.getItem("dm-name") || "БОЕЦ-1");
  const [cls, setCls] = useState<TankClass>("assault");
  const [mode, setMode] = useState<"local" | "net">("local");
  const [bots, setBots] = useState(3);
  const [fragLimit, setFragLimit] = useState(10);
  const [joinCode, setJoinCode] = useState("");
  const [netErr, setNetErr] = useState("");
  const [lobbyCode, setLobbyCode] = useState("");
  const [lobbyPlayers, setLobbyPlayers] = useState<PlayerInfo[]>([]);
  const [isHost, setIsHost] = useState(true);
  const [cfg, setCfg] = useState<MatchCfg | null>(null);
  const [hud, setHud] = useState<HudDM | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  const netRef = useRef<NetRoom | null>(null);
  const worldRef = useRef<World | null>(null);
  const meIdRef = useRef("");
  const meInfoRef = useRef<PlayerInfo | null>(null);
  const guestsRef = useRef(new Map<string, Omit<PlayerInfo, "color" | "host" | "bot">>());
  const connToPlayerRef = useRef(new Map<string, string>());
  const netInputsRef = useRef(new Map<string, Input>());
  const keysRef = useRef(new Set<string>());
  const mouseRef = useRef({ x: 0, y: 0, down: false });
  const utilQRef = useRef(false);
  const camRef = useRef({ x: WORLD / 2, y: WORLD / 2 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mmRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    localStorage.setItem("dm-name", name);
  }, [name]);

  useEffect(() => () => { netRef.current?.close(); }, []);

  // ---------- логика лобби ----------
  const handleNetEvent = (raw: unknown) => {
    const ev = raw as
      | { t: "lobby"; code: string; you: string; players: PlayerInfo[] }
      | { t: "start"; seed: number; fragLimit: number; timeLimit: number; players: PlayerInfo[] }
      | { t: "snap"; s: Parameters<typeof applySnapshot>[1] }
      | { t: "peerleft"; id: string }
      | { t: "hostleft" }
      | { t: "error"; msg: string };
    if (ev.t === "lobby") {
      if (!netRef.current?.isHost) {
        setLobbyCode(ev.code);
        setLobbyPlayers(ev.players);
      }
    } else if (ev.t === "start") {
      setCfg({ seed: ev.seed, fragLimit: ev.fragLimit, timeLimit: ev.timeLimit, players: ev.players });
      setStage("game");
      setConfirmExit(false);
    } else if (ev.t === "snap") {
      if (worldRef.current) applySnapshot(worldRef.current, ev.s);
    } else if (ev.t === "peerleft") {
      const pid = connToPlayerRef.current.get(ev.id);
      if (pid) {
        netInputsRef.current.delete(pid);
        connToPlayerRef.current.delete(ev.id);
        if (worldRef.current) worldRef.current.tanks = worldRef.current.tanks.filter((t) => t.id !== pid);
      }
      for (const [cid, info] of guestsRef.current) {
        if (cid === ev.id) { guestsRef.current.delete(cid); break; }
      }
      pushLobby();
    } else if (ev.t === "hostleft") {
      setNetErr("Хост отключился от боя");
      worldRef.current = null;
      netRef.current?.close();
      netRef.current = null;
      setStage("setup");
    } else if (ev.t === "error") {
      setNetErr(ev.msg);
    }
  };

  const handleNetInput = (connId: string, input: Input) => {
    const pid = connToPlayerRef.current.get(connId);
    if (pid) netInputsRef.current.set(pid, input);
  };

  const pushLobby = () => {
    const net = netRef.current;
    const me = meInfoRef.current;
    if (!net || !me || !net.isHost) return;
    const players: PlayerInfo[] = [{ ...me }];
    let i = 1;
    for (const [, g] of guestsRef.current) {
      players.push({ id: g.id, name: g.name, cls: g.cls, color: PLAYER_COLORS[i % PLAYER_COLORS.length], bot: false, host: false });
      i++;
    }
    net.broadcastPlayers(players);
    setLobbyPlayers(players);
  };

  const createRoom = () => {
    audio.ensure(); audio.uiClick();
    setNetErr("");
    const me: PlayerInfo = { id: randId(), name: name.trim() || "БОЕЦ-1", cls, color: PLAYER_COLORS[0], bot: false, host: true };
    meIdRef.current = me.id;
    meInfoRef.current = me;
    guestsRef.current.clear();
    connToPlayerRef.current.clear();
    netInputsRef.current.clear();
    const net = new NetRoom({ onEvent: handleNetEvent, onInput: handleNetInput });
    net.onHello = (connId, info) => {
      guestsRef.current.set(connId, info);
      connToPlayerRef.current.set(connId, info.id);
      audio.join();
      pushLobby();
    };
    const code = makeCode();
    netRef.current = net;
    net.host(code, me);
    setLobbyCode(code);
    setLobbyPlayers([me]);
    setIsHost(true);
    setStage("lobby");
  };

  const joinRoom = () => {
    audio.ensure(); audio.uiClick();
    setNetErr("");
    if (joinCode.trim().length < 4) { setNetErr("Введите код комнаты (5 символов)"); return; }
    const me: PlayerInfo = { id: randId(), name: name.trim() || "БОЕЦ-1", cls, color: "", bot: false, host: false };
    meIdRef.current = me.id;
    meInfoRef.current = me;
    const net = new NetRoom({ onEvent: handleNetEvent, onInput: handleNetInput });
    netRef.current = net;
    net.join(joinCode, me);
    setIsHost(false);
    setLobbyPlayers([]);
    setStage("lobby");
  };

  const startLocal = () => {
    audio.ensure(); audio.uiClick();
    const me: PlayerInfo = { id: randId(), name: name.trim() || "БОЕЦ-1", cls, color: PLAYER_COLORS[0], bot: false, host: true };
    meIdRef.current = me.id;
    meInfoRef.current = me;
    netRef.current = null;
    const players: PlayerInfo[] = [me];
    for (let i = 0; i < bots; i++) {
      players.push({
        id: `bot-${i}`, name: BOT_NAMES[i % BOT_NAMES.length],
        cls: CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)],
        color: PLAYER_COLORS[(i + 1) % PLAYER_COLORS.length], bot: true, host: false,
      });
    }
    setCfg({ seed: Math.floor(Math.random() * 1e9), fragLimit, timeLimit: TIME_LIMIT, players });
    setStage("game");
  };

  const startFromLobby = () => {
    const net = netRef.current;
    if (!net?.isHost) return;
    audio.uiClick();
    const players: PlayerInfo[] = [...lobbyPlayers];
    const off = players.length;
    for (let i = 0; i < bots; i++) {
      players.push({
        id: `bot-${i}`, name: BOT_NAMES[i % BOT_NAMES.length],
        cls: CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)],
        color: PLAYER_COLORS[(off + i) % PLAYER_COLORS.length], bot: true, host: false,
      });
    }
    const payload = { seed: Math.floor(Math.random() * 1e9), fragLimit, timeLimit: TIME_LIMIT, players };
    net.startGame(payload);
    setCfg(payload);
    setStage("game");
  };

  const rematch = () => {
    if (!cfg) return;
    if (netRef.current && !netRef.current.isHost) return;
    audio.uiClick();
    const payload = { ...cfg, seed: Math.floor(Math.random() * 1e9) };
    netRef.current?.startGame(payload);
    setCfg(payload);
  };

  const leaveAll = () => {
    audio.uiClick();
    netRef.current?.close();
    netRef.current = null;
    worldRef.current = null;
    setCfg(null);
    setHud(null);
    setConfirmExit(false);
    setStage("setup");
  };

  // ---------- игровой цикл ----------
  useEffect(() => {
    if (stage !== "game" || !cfg) return;
    const canvas = canvasRef.current, wrap = wrapRef.current, mm = mmRef.current;
    if (!canvas || !wrap || !mm) return;
    audio.ensure();
    const world = createWorld(cfg.seed, cfg.fragLimit, cfg.timeLimit);
    worldRef.current = world;
    const net = netRef.current;
    const isServer = !net || net.isHost;
    const meId = meIdRef.current;
    if (isServer) for (const p of cfg.players) addTank(world, p.id, p.name, p.cls, p.color || "#ffc84a", p.bot);

    const renderer = new DMRenderer(canvas);
    const ro = new ResizeObserver(() => renderer.resize(wrap.clientWidth, wrap.clientHeight));
    ro.observe(wrap);
    renderer.resize(wrap.clientWidth, wrap.clientHeight);

    const cam = camRef.current;
    const me0 = world.tanks.find((t) => t.id === meId);
    if (me0) { cam.x = me0.x; cam.y = me0.y; }
    else { cam.x = WORLD / 2; cam.y = WORLD / 2; }

    let raf = 0, last = performance.now(), acc = 0, acc2 = 0, hudT = 0;
    const seenSfx = new Set<number>();

    const readLocal = (): Input => {
      const k = keysRef.current;
      const inp: Input = {
        up: k.has("KeyW"), down: k.has("KeyS"), left: k.has("KeyA"), right: k.has("KeyD"),
        fire: mouseRef.current.down, util: utilQRef.current,
        aimX: cam.x - renderer.viewW / 2 + mouseRef.current.x,
        aimY: cam.y - renderer.viewH / 2 + mouseRef.current.y,
      };
      utilQRef.current = false;
      return inp;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (isServer) {
        acc += dt;
        while (acc >= TICK) {
          acc -= TICK;
          const inputs: Record<string, Input> = botInputs(world, TICK);
          inputs[meId] = readLocal();
          for (const [pid, inp] of netInputsRef.current) inputs[pid] = inp;
          stepWorld(world, inputs, TICK);
          net?.sendSnap(makeSnapshot(world));
        }
      } else {
        acc2 += dt;
        if (acc2 >= TICK) { acc2 = 0; net?.sendInput(readLocal()); }
      }

      // звуки по новым эффектам (работает и у хоста, и у гостя)
      const me = world.tanks.find((t) => t.id === meId);
      for (const e of world.effects) {
        if (seenSfx.has(e.id)) continue;
        seenSfx.add(e.id);
        const near = me ? Math.hypot(e.x - me.x, e.y - me.y) < 950 : true;
        const onMe = me ? Math.hypot(e.x - me.x, e.y - me.y) < 70 : false;
        if (e.kind === "bigboom" || e.kind === "artillery") audio.dmBoom(true);
        else if (e.kind === "boom" || e.kind === "mineboom") { if (near) audio.dmBoom(false); }
        else if (e.kind === "shot" && near) audio.dmShoot(e.txt);
        else if (e.kind === "telegraph" && near) audio.alarmSfx();
        else if (e.kind === "pickup" && onMe) audio.pickupSfx();
        else if (e.kind === "heal" && onMe) audio.healSfx();
        else if (e.kind === "streak" && onMe) audio.streakSfx();
        else if (e.kind === "dmg" && onMe) audio.dmHit();
        else if (e.kind === "mineplace" && near) audio.dmShoot("mine");
        else if (e.kind === "zone") audio.zoneSfx();
      }
      if (seenSfx.size > 800) seenSfx.clear();

      if (me && !me.dead) {
        const ck = 1 - Math.pow(0.0005, dt);
        cam.x += (me.x - cam.x) * ck;
        cam.y += (me.y - cam.y) * ck;
      }
      const halfW = renderer.viewW / 2, halfH = renderer.viewH / 2;
      cam.x = renderer.viewW >= WORLD ? WORLD / 2 : Math.max(halfW, Math.min(WORLD - halfW, cam.x));
      cam.y = renderer.viewH >= WORLD ? WORLD / 2 : Math.max(halfH, Math.min(WORLD - halfH, cam.y));

      renderer.render(world, cam, meId, mouseRef.current, now / 1000, dt);
      renderer.renderMinimap(mm, world, meId);

      hudT += dt;
      if (hudT >= 0.1) { hudT = 0; setHud(buildHud(world, meId, cfg)); }
    };
    raf = requestAnimationFrame(frame);

    const kd = (e: KeyboardEvent) => {
      if (["Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyE"].includes(e.code)) e.preventDefault();
      if (e.code === "KeyE" && !e.repeat) utilQRef.current = true;
      keysRef.current.add(e.code);
    };
    const ku = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    const mmv = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - r.left;
      mouseRef.current.y = e.clientY - r.top;
    };
    const md = (e: MouseEvent) => { if (e.button === 0) mouseRef.current.down = true; audio.ensure(); };
    const mu = () => { mouseRef.current.down = false; };
    const cm = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    canvas.addEventListener("mousemove", mmv);
    canvas.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    canvas.addEventListener("contextmenu", cm);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      canvas.removeEventListener("mousemove", mmv);
      canvas.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
      canvas.removeEventListener("contextmenu", cm);
    };
  }, [stage, cfg]);

  // ============================ ЭКРАНЫ ============================
  if (stage === "setup") {
    return (
      <SetupScreen
        name={name} setName={setName} cls={cls} setCls={setCls}
        mode={mode} setMode={setMode} bots={bots} setBots={setBots}
        fragLimit={fragLimit} setFragLimit={setFragLimit}
        joinCode={joinCode} setJoinCode={setJoinCode} netErr={netErr}
        onCreate={createRoom} onJoin={joinRoom} onLocal={startLocal} onExit={onExit}
      />
    );
  }

  if (stage === "lobby") {
    return (
      <LobbyScreen
        code={lobbyCode} isHost={isHost} players={lobbyPlayers} bots={bots}
        copied={copied}
        onCopy={() => {
          navigator.clipboard?.writeText(lobbyCode).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
        onStart={startFromLobby}
        onBack={() => { netRef.current?.close(); netRef.current = null; setStage("setup"); }}
      />
    );
  }

  return (
    <div className="battlefield-bg h-full w-full relative overflow-hidden">
      <div ref={wrapRef} className="absolute inset-0 cursor-none">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
      {/* миникарта всегда в DOM — на неё ссылается игровой цикл */}
      <div className="absolute top-10 right-2 z-20 pointer-events-none">
        <div className="bg-[#0d1108cc] border border-[#2a3a1c] p-1">
          <canvas ref={mmRef} width={150} height={150} className="block" style={{ width: 150, height: 150 }} />
        </div>
      </div>
      {hud && <GameHud hud={hud} fragLimit={cfg?.fragLimit ?? 10} />}
      {confirmExit && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#070904]/80">
          <div className="hud-panel px-8 py-6 text-center overlay-in">
            <div className="font-disp text-xl text-[#ffd76a]">ПОКИНУТЬ БОЙ?</div>
            <p className="text-xs text-[#8fae58] mt-1.5">{isHost || !netRef.current ? "Комната будет закрыта" : "Вы выйдете из комнаты"}</p>
            <div className="mt-4 flex gap-2 justify-center">
              <button className="btn-arcade btn-amber px-6 py-2 text-xs" onClick={leaveAll}>Да, выйти</button>
              <button className="btn-arcade btn-dark px-6 py-2 text-xs" onClick={() => setConfirmExit(false)}>Остаться</button>
            </div>
          </div>
        </div>
      )}
      <button
        className="absolute top-2 right-2 z-30 btn-arcade btn-dark px-3 py-1.5 text-[10px]"
        onClick={() => { audio.uiClick(); setConfirmExit(true); }}
      >
        ВЫЙТИ
      </button>
      {hud?.over && (isHost || !netRef.current ? (
        <button className="absolute bottom-3 right-3 z-30 btn-arcade btn-acid px-4 py-2 text-[11px]" onClick={rematch}>
          РЕВАНШ
        </button>
      ) : (
        <div className="absolute bottom-3 right-3 z-30 font-disp text-[10px] text-[#8fe8ff] blink bg-[#0d1108cc] border border-[#1f8899] px-3 py-2">
          ЖДЁМ РЕВАНШ ОТ ХОСТА
        </div>
      ))}
    </div>
  );
}

/* ==================== ЭКРАН НАСТРОЙКИ ==================== */
function SetupScreen(p: {
  name: string; setName: (s: string) => void; cls: TankClass; setCls: (c: TankClass) => void;
  mode: "local" | "net"; setMode: (m: "local" | "net") => void;
  bots: number; setBots: (n: number) => void;
  fragLimit: number; setFragLimit: (n: number) => void;
  joinCode: string; setJoinCode: (s: string) => void; netErr: string;
  onCreate: () => void; onJoin: () => void; onLocal: () => void; onExit: () => void;
}) {
  return (
    <div className="battlefield-bg h-full w-full overflow-y-auto">
      <div className="min-h-full flex flex-col items-center px-4 py-5">
        <div className="w-full max-w-[980px]">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-disp text-[10px] tracking-[0.35em] text-[#8fae58]">СТАЛЬНОЙ РУБЕЖ</div>
              <h1 className="font-disp text-4xl text-[#ff6d5a]" style={{ textShadow: "0 0 26px rgba(255,109,90,0.4)" }}>ДЕЗМАТЧ</h1>
            </div>
            <button className="btn-arcade btn-dark px-4 py-2 text-[11px]" onClick={p.onExit}>Кампания</button>
          </div>
          <p className="mt-1 text-xs text-[#8fae58]">
            Арена <span className="text-[#ffd76a] font-disp">1440×1440</span> · 4 класса машин · 4 вида оружия · мины, арт-обстрелы, сбросы снабжения · внезапная смерть
          </p>

          <div className="mt-4 grid lg:grid-cols-[1fr_360px] gap-4 items-start">
            {/* левая колонка */}
            <div className="space-y-4">
              <section className="hud-panel px-4 py-3">
                <label className="hud-label">Позывной</label>
                <input
                  value={p.name}
                  maxLength={12}
                  onChange={(e) => p.setName(e.target.value.toUpperCase())}
                  className="mt-1.5 w-full bg-[#0d1108] border border-[#3c5224] px-3 py-2 font-disp text-lg text-[#ffe9b8] outline-none focus:border-[#a8f637] transition-colors"
                />
              </section>
              <section className="hud-panel px-4 py-3">
                <div className="hud-label">Выбери машину</div>
                <div className="mt-2 grid sm:grid-cols-2 gap-2.5">
                  {CLASS_IDS.map((id) => {
                    const d = CLASSES[id];
                    const sel = p.cls === id;
                    return (
                      <button
                        key={id}
                        onClick={() => { audio.ensure(); audio.uiClick(); p.setCls(id); }}
                        className={`text-left px-3 py-2.5 border transition-all duration-150 ${sel ? "bg-[#1b2412] border-[#a8f637] shadow-[0_0_18px_rgba(168,246,55,0.25)] -translate-y-0.5" : "bg-[#121a0b] border-[#2a3a1c] hover:border-[#56742c] hover:-translate-y-0.5"}`}
                        style={{ borderLeftWidth: 4, borderLeftColor: d.color }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-disp text-sm" style={{ color: d.color }}>{d.name}</span>
                          {sel && <span className="font-disp text-[9px] text-[#a8f637]">ВЫБРАНО</span>}
                        </div>
                        <div className="text-[10px] text-[#8fae58] mt-0.5">{d.desc}</div>
                        <StatBar label="ОГОНЬ" v={(d.dmg * d.rate) / 1.35} color="#ff6d5a" />
                        <StatBar label="БРОНЯ" v={d.hp / 170} color="#8d99a4" />
                        <StatBar label="ХОД" v={d.speed / 225} color="#54d8e8" />
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* правая колонка */}
            <div className="space-y-4">
              <section className="hud-panel px-4 py-3">
                <div className="hud-label">Режим боя</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <ModeBtn active={p.mode === "local"} onClick={() => { audio.uiClick(); p.setMode("local"); }} title="ПОЛИГОН" sub="ты + боты" />
                  <ModeBtn active={p.mode === "net"} onClick={() => { audio.uiClick(); p.setMode("net"); }} title="СЕТЬ" sub="P2P-лобби" />
                </div>

                {p.mode === "local" ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#8fae58]">Ботов на арене</span>
                      <span className="font-disp text-lg text-[#ffd76a]">{p.bots}</span>
                    </div>
                    <input type="range" min={0} max={5} value={p.bots} onChange={(e) => p.setBots(parseInt(e.target.value, 10))} className="w-full accent-[#a8f637]" />
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-[11px] text-[#8fae58]">До победы:</span>
                      {[5, 10, 15].map((n) => (
                        <button key={n} onClick={() => { audio.uiClick(); p.setFragLimit(n); }} className={`chip ${p.fragLimit === n ? "chip-on" : ""}`}>{n}</button>
                      ))}
                      <span className="text-[11px] text-[#8fae58]">фрагов</span>
                    </div>
                    <button className="btn-arcade btn-acid w-full mt-3 py-3 text-sm" onClick={p.onLocal}>Начать бой</button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#8fae58]">Ботов в комнату</span>
                        <span className="font-disp text-lg text-[#ffd76a]">{p.bots}</span>
                      </div>
                      <input type="range" min={0} max={4} value={p.bots} onChange={(e) => p.setBots(parseInt(e.target.value, 10))} className="w-full accent-[#a8f637]" />
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="text-[11px] text-[#8fae58]">До победы:</span>
                        {[5, 10, 15].map((n) => (
                          <button key={n} onClick={() => { audio.uiClick(); p.setFragLimit(n); }} className={`chip ${p.fragLimit === n ? "chip-on" : ""}`}>{n}</button>
                        ))}
                      </div>
                    </div>
                    <button className="btn-arcade btn-amber w-full py-3 text-sm" onClick={p.onCreate}>Создать лобби</button>
                    <div className="flex gap-2">
                      <input
                        value={p.joinCode}
                        onChange={(e) => p.setJoinCode(e.target.value.toUpperCase())}
                        placeholder="КОД"
                        maxLength={6}
                        className="flex-1 min-w-0 bg-[#0d1108] border border-[#3c5224] px-3 py-2 font-disp text-center text-lg tracking-[0.3em] text-[#8fe8ff] outline-none focus:border-[#8fe8ff] placeholder:text-[#3c5224]"
                      />
                      <button className="btn-arcade btn-dark px-4 py-2 text-xs" onClick={p.onJoin}>Войти</button>
                    </div>
                    <p className="text-[10px] text-[#8fae58] leading-relaxed">
                      Соединение P2P (WebRTC): хост считает бой, гости подключаются по коду — свой сервер не нужен. Пока комната не набита, зови до 5 бойцов.
                    </p>
                  </div>
                )}
                {p.netErr && <div className="mt-2 text-[11px] text-[#ff8a7a] font-disp">{p.netErr}</div>}
              </section>

              <section className="hud-panel px-4 py-3">
                <div className="hud-label">Управление</div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] text-[#cfe3ae]">
                  <span><Kbd>W</Kbd><Kbd>A</Kbd><Kbd>S</Kbd><Kbd>D</Kbd> ход</span>
                  <span><Kbd>МЫШЬ</Kbd> наводка</span>
                  <span><Kbd>ЛКМ</Kbd> огонь</span>
                  <span><Kbd>E</Kbd> утилита</span>
                </div>
                <div className="mt-2 text-[10px] text-[#8fae58] leading-relaxed">
                  Подбирай ящики: <span className="text-[#ffd76a]">оружие</span> и <span className="text-[#8fe8ff]">утилиты</span>. Серия ×5 вызывает арт-обстрел. После таймера — внезапная смерть и сжатие зоны.
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBar({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <span className="font-disp text-[8px] w-10 text-[#8fae58]">{label}</span>
      <div className="flex-1 h-1.5 bg-[#0d1108] overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${Math.min(100, v * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 border text-left transition-all ${active ? "border-[#a8f637] bg-[#1b2412] shadow-[0_0_14px_rgba(168,246,55,0.2)]" : "border-[#2a3a1c] bg-[#121a0b] hover:border-[#56742c]"}`}
    >
      <div className={`font-disp text-sm ${active ? "text-[#a8f637]" : "text-[#cfe3ae]"}`}>{title}</div>
      <div className="text-[10px] text-[#8fae58]">{sub}</div>
    </button>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd inline-block mx-0.5">{children}</span>;
}

/* ==================== ЛОББИ ==================== */
function LobbyScreen(p: {
  code: string; isHost: boolean; players: PlayerInfo[]; bots: number; copied: boolean;
  onCopy: () => void; onStart: () => void; onBack: () => void;
}) {
  return (
    <div className="battlefield-bg h-full w-full overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-[520px]">
          <div className="hud-panel px-6 py-5 overlay-in">
            <div className="flex items-center justify-between">
              <h2 className="font-disp text-2xl text-[#a8f637]">ЛОББИ</h2>
              <span className={`font-disp text-[10px] px-2 py-1 border ${p.isHost ? "text-[#ffd76a] border-[#8a6410]" : "text-[#8fe8ff] border-[#1f8899]"}`}>
                {p.isHost ? "ТЫ — ХОСТ" : "ТЫ — ГОСТЬ"}
              </span>
            </div>

            {p.isHost && (
              <div className="mt-4 relative">
                <div className="hazard h-2 w-full" />
                <div className="mt-3 flex items-center justify-center gap-3">
                  <span className="font-disp text-5xl tracking-[0.3em] text-[#ffe9b8] pl-3" style={{ textShadow: "0 0 22px rgba(255,233,184,0.35)" }}>{p.code || "....."}</span>
                  <button className="btn-arcade btn-dark px-3 py-2 text-[10px]" onClick={p.onCopy}>{p.copied ? "Готово" : "Копия"}</button>
                </div>
                <p className="text-center text-[11px] text-[#8fae58] mt-1.5">Отправь код друзьям — они введут его во вкладке «СЕТЬ → Войти»</p>
              </div>
            )}

            <div className="mt-4">
              <div className="hud-label">Бойцы ({p.players.length}{p.isHost ? ` + ${p.bots} ботов` : ""})</div>
              <div className="mt-2 space-y-1.5">
                {p.players.length === 0 && <div className="text-[11px] text-[#8fae58] blink">ПОДКЛЮЧЕНИЕ К ХОСТУ...</div>}
                {p.players.map((pl) => (
                  <div key={pl.id} className="flex items-center gap-2.5 bg-[#0d1108] border border-[#2a3a1c] px-3 py-2">
                    <span className="w-3.5 h-3.5 shrink-0" style={{ background: pl.color || "#8fe8ff" }} />
                    <span className="font-disp text-sm text-[#e8efdd] flex-1 truncate">{pl.name}</span>
                    <span className="text-[10px] text-[#8fae58]">{CLASSES[pl.cls].name}</span>
                    {pl.host && <span className="font-disp text-[9px] text-[#ffd76a]">ХОСТ</span>}
                  </div>
                ))}
                {p.isHost && Array.from({ length: p.bots }).map((_, i) => (
                  <div key={`b${i}`} className="flex items-center gap-2.5 bg-[#0d1108] border border-dashed border-[#2a3a1c] px-3 py-2 opacity-80">
                    <span className="w-3.5 h-3.5 shrink-0" style={{ background: PLAYER_COLORS[(p.players.length + i) % PLAYER_COLORS.length] }} />
                    <span className="font-disp text-sm text-[#8fae58] flex-1">{BOT_NAMES[i % BOT_NAMES.length]}</span>
                    <span className="font-disp text-[9px] text-[#8fae58]">БОТ</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {p.isHost ? (
                <button className="btn-arcade btn-acid py-3 text-sm" onClick={p.onStart}>Начать бой</button>
              ) : (
                <div className="text-center font-disp text-xs text-[#8fe8ff] blink py-2">ЖДЁМ СТАРТА ОТ ХОСТА...</div>
              )}
              <button className="btn-arcade btn-dark py-2.5 text-xs" onClick={p.onBack}>Назад</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================== HUD БОЯ ==================== */
function GameHud({ hud, fragLimit }: { hud: HudDM; fragLimit: number }) {
  const timeLeft = hud.timeLimit - hud.matchT;
  return (
    <>
      {/* таймер и лимит */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none">
        <div className={`font-disp text-3xl tabular-nums ${hud.sudden ? "text-[#ff4747] blink" : "text-[#e8efdd]"}`} style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
          {hud.over ? "БОЙ ОКОНЧЕН" : hud.sudden ? "ВНЕЗАПНАЯ СМЕРТЬ" : fmtTime(timeLeft)}
        </div>
        {!hud.over && !hud.sudden && (
          <div className="font-disp text-[10px] text-[#8fae58] tracking-[0.25em]">ДО ПОБЕДЫ {fragLimit} ФРАГОВ</div>
        )}
        {hud.sudden && !hud.over && (
          <div className="font-disp text-[10px] text-[#ff8a7a] tracking-[0.25em]">ЗОНА СУЖАЕТСЯ · СЛЕДУЮЩИЙ ФРАГ РЕШАЕТ</div>
        )}
      </div>

      {/* таблица + килл-фид */}
      <div className="absolute top-2 left-2 z-20 pointer-events-none w-[190px]">
        <div className="bg-[#0d1108cc] border border-[#2a3a1c] px-2.5 py-2">
          {hud.board.slice(0, 6).map((r, i) => (
            <div key={r.name + i} className={`flex items-center gap-1.5 py-0.5 ${r.me ? "text-[#ffe9b8]" : "text-[#cfe3ae]"}`}>
              <span className="w-2 h-2 shrink-0" style={{ background: r.color }} />
              <span className="font-disp text-[10px] flex-1 truncate">{r.name}{r.bot ? "·Б" : ""}</span>
              <span className="font-disp text-[11px] text-[#ffd76a]">{r.kills}</span>
              <span className="font-disp text-[9px] text-[#8fae58]">/{r.deaths}</span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 space-y-1">
          {hud.feed.map((f) => (
            <div key={f.id} className="bg-[#0d1108cc] border-l-2 border-[#ff6d5a] px-2 py-1 text-[9px] slide-down">
              <span className="font-disp text-[#ffe9b8]">{f.killer}</span>
              <span className="text-[#8fae58]"> [{f.weapon}] </span>
              <span className="font-disp text-[#ff8a7a]">{f.victim}</span>
            </div>
          ))}
        </div>
      </div>

      {hud.streak >= 2 && (
        <div className="absolute top-[182px] right-2 z-20 pointer-events-none font-disp text-[11px] text-[#ffd23a]" style={{ textShadow: "0 0 10px rgba(255,210,58,0.6)" }}>
          СЕРИЯ ×{hud.streak}
        </div>
      )}

      {/* оружие и утилита */}
      <div className="absolute bottom-3 left-3 z-20 pointer-events-none flex items-end gap-2">
        <div className="bg-[#0d1108cc] border border-[#2a3a1c] px-3 py-2">
          <div className="hud-label">Орудие</div>
          <div className="font-disp text-base" style={{ color: WEAPONS[hud.weapon].color }}>{WEAPONS[hud.weapon].name}</div>
          <div className="font-disp text-[11px] text-[#cfe3ae] tabular-nums">
            {hud.ammo === Infinity ? "БЕСКОНЕЧНО" : `СНАРЯДЫ: ${hud.ammo}`}
          </div>
        </div>
        <div className={`bg-[#0d1108cc] border px-3 py-2 ${hud.util ? "border-[#8fe8ff]" : "border-[#2a3a1c]"}`}>
          <div className="hud-label">Утилита [E]</div>
          <div className={`font-disp text-sm ${hud.util ? "" : "text-[#3c5224]"}`} style={hud.util ? { color: UTILS[hud.util].color } : undefined}>
            {hud.util ? UTILS[hud.util].name : "ПУСТО"}
          </div>
        </div>
      </div>

      {/* HP */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-[300px] max-w-[60vw]">
        <div className="bg-[#0d1108cc] border border-[#2a3a1c] px-3 py-2">
          <div className="flex justify-between font-disp text-[9px] text-[#8fae58]">
            <span>КОРПУС {hud.hp}/{hud.maxHp}</span>
            {hud.invuln > 0 && <span className="text-[#8fe8ff] blink">НЕУЯЗВИМОСТЬ</span>}
            {hud.boost > 0 && <span className="text-[#ffd23a]">ФОРСАЖ {Math.ceil(hud.boost)}</span>}
          </div>
          <div className="mt-1 h-3 bg-[#0a0d07] border border-[#2a3a1c] relative overflow-hidden">
            <div
              className="h-full transition-[width] duration-150"
              style={{
                width: `${(hud.hp / hud.maxHp) * 100}%`,
                background: hud.hp / hud.maxHp > 0.5 ? "linear-gradient(180deg,#8ef05a,#4f9c22)" : hud.hp / hud.maxHp > 0.25 ? "linear-gradient(180deg,#ffd23a,#c78a12)" : "linear-gradient(180deg,#ff6d5a,#c22a1a)",
              }}
            />
            {hud.shield > 0 && (
              <div className="absolute inset-0 pointer-events-none" style={{ background: `rgba(143,232,255,${0.25 + 0.15 * Math.sin(Date.now() / 120)})` }} />
            )}
          </div>
          <div className="mt-1 flex justify-between font-disp text-[9px] text-[#8fae58]">
            <span>ФРАГИ <span className="text-[#ffd76a]">{hud.kills}</span></span>
            <span>СМЕРТИ <span className="text-[#ff8a7a]">{hud.deaths}</span></span>
          </div>
        </div>
      </div>

      {/* подсказка */}
      <div className="absolute bottom-3 right-3 z-10 pointer-events-none hidden md:block text-right text-[9px] text-[#8fae58]/80 leading-relaxed">
        <Kbd>ЛКМ</Kbd> огонь · <Kbd>E</Kbd> утилита<br />серия ×5 = арт-обстрел
      </div>

      {/* вне зоны */}
      {hud.zoneOut && !hud.over && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="font-disp text-xl text-[#ff4747] blink" style={{ textShadow: "0 0 18px rgba(255,71,71,0.8)" }}>ВНЕ ЗОНЫ — ВЕРНИСЬ В КРУГ</div>
        </div>
      )}

      {/* возрождение */}
      {hud.dead && !hud.over && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none bg-[#12060a]/45">
          <div className="font-disp text-4xl text-[#ff4747]" style={{ textShadow: "0 0 26px rgba(255,71,71,0.6)" }}>ПОДБИТ</div>
          <div className="mt-2 font-disp text-lg text-[#e8efdd] tabular-nums">возрождение через {hud.respawnT.toFixed(1)}</div>
        </div>
      )}

      {/* итог */}
      {hud.over && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-[#070904]/70">
          <div className="hud-panel px-8 py-6 text-center overlay-in w-[min(440px,92vw)]">
            <div className={`font-disp text-4xl ${hud.winnerMe ? "text-[#a8f637] title-glow" : "text-[#ff6d5a]"}`}>
              {hud.winnerMe ? "ПОБЕДА" : "ПОРАЖЕНИЕ"}
            </div>
            <p className="mt-1 text-xs text-[#8fae58]">
              Чемпион арены — <span className="font-disp text-[#ffd76a]">{hud.winner}</span>
            </p>
            <div className="mt-4 space-y-1 text-left">
              {hud.board.map((r, i) => (
                <div key={r.name + i} className={`flex items-center gap-2 px-2.5 py-1.5 ${r.me ? "bg-[#1b2412] border border-[#a8f637]/40" : "bg-[#0d1108] border border-[#2a3a1c]"}`}>
                  <span className="font-disp text-[10px] text-[#8fae58] w-4">{i + 1}</span>
                  <span className="w-2.5 h-2.5" style={{ background: r.color }} />
                  <span className="font-disp text-xs text-[#e8efdd] flex-1 truncate">{r.name}</span>
                  <span className="font-disp text-sm text-[#ffd76a]">{r.kills}</span>
                  <span className="font-disp text-[10px] text-[#8fae58]">/ {r.deaths}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-[#8fae58]">Реванш — кнопка справа внизу · Выход — кнопка «ВЫЙТИ»</p>
          </div>
        </div>
      )}
    </>
  );
}
