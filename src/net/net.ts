/* P2P-комната на PeerJS: хост авторитетен, гости шлют инпут, хост рассылает снапшоты. */
import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import type { Input, Snapshot, TankClass } from "../dm/sim";

export interface PlayerInfo {
  id: string;
  name: string;
  cls: TankClass;
  color: string;
  bot: boolean;
  host: boolean;
}

export type RoomEvent =
  | { t: "lobby"; code: string; you: string; players: PlayerInfo[] }
  | { t: "start"; seed: number; fragLimit: number; timeLimit: number; players: PlayerInfo[] }
  | { t: "snap"; s: Snapshot }
  | { t: "peerleft"; id: string }
  | { t: "hostleft" }
  | { t: "error"; msg: string };

type Msg =
  | { t: "hello"; info: PlayerInfo }
  | { t: "players"; players: PlayerInfo[]; code: string; you: string }
  | { t: "start"; seed: number; fragLimit: number; timeLimit: number; players: PlayerInfo[] }
  | { t: "input"; input: Input }
  | { t: "snap"; s: Snapshot };

const ID_PREFIX = "steel-frontier-dm-";

export function makeCode(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

export class NetRoom {
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>(); // host: все гости
  private hostConn: DataConnection | null = null;   // guest: связь с хостом
  isHost = false;
  code = "";
  you = "";
  onEvent: (e: RoomEvent) => void;
  onInput: (connId: string, input: Input) => void;

  constructor(handlers: { onEvent: (e: RoomEvent) => void; onInput: (connId: string, input: Input) => void }) {
    this.onEvent = handlers.onEvent;
    this.onInput = handlers.onInput;
  }

  host(code: string, me: PlayerInfo) {
    this.isHost = true;
    this.code = code;
    this.you = me.id;
    this.peer = new Peer(ID_PREFIX + code);
    this.peer.on("open", () => {
      this.onEvent({ t: "lobby", code, you: me.id, players: [me] });
    });
    this.peer.on("connection", (conn) => {
      conn.on("open", () => {
        this.conns.set(conn.peer, conn);
      });
      conn.on("data", (raw) => this.hostReceive(conn, raw as Msg));
      conn.on("close", () => {
        if (this.conns.has(conn.peer)) {
          this.conns.delete(conn.peer);
          this.onEvent({ t: "peerleft", id: conn.peer });
        }
      });
      conn.on("error", () => { /* игнор */ });
    });
    this.peer.on("error", (err: Error & { type?: string }) => {
      if (err.type === "unavailable-id") this.onEvent({ t: "error", msg: "Код комнаты занят — попробуйте создать ещё раз" });
      else if (err.type === "network" || err.type === "server-error") this.onEvent({ t: "error", msg: "Сигнальный сервер недоступен. Проверьте интернет." });
      else this.onEvent({ t: "error", msg: "Ошибка сети: " + (err.type || "неизвестная") });
    });
  }

  private hostReceive(conn: DataConnection, msg: Msg) {
    if (msg.t === "hello") {
      this.onHello(conn.peer, msg.info);
    } else if (msg.t === "input") {
      this.onInput(conn.peer, msg.input);
    }
  }

  onHello: (connId: string, info: PlayerInfo) => void = () => {};

  join(code: string, me: PlayerInfo) {
    this.isHost = false;
    this.code = code.toUpperCase().trim();
    this.you = me.id;
    this.peer = new Peer();
    this.peer.on("open", () => {
      const conn = this.peer!.connect(ID_PREFIX + this.code, { reliable: false });
      this.hostConn = conn;
      conn.on("open", () => {
        conn.send({ t: "hello", info: me } satisfies Msg);
      });
      conn.on("data", (raw) => {
        const msg = raw as Msg;
        if (msg.t === "players") this.onEvent({ t: "lobby", code: msg.code, you: this.you, players: msg.players });
        else if (msg.t === "start") this.onEvent({ t: "start", seed: msg.seed, fragLimit: msg.fragLimit, timeLimit: msg.timeLimit, players: msg.players });
        else if (msg.t === "snap") this.onEvent({ t: "snap", s: msg.s });
      });
      conn.on("close", () => this.onEvent({ t: "hostleft" }));
      conn.on("error", () => this.onEvent({ t: "hostleft" }));
    });
    this.peer.on("error", (err: Error & { type?: string }) => {
      if (err.type === "peer-unavailable") this.onEvent({ t: "error", msg: "Комната не найдена. Проверьте код." });
      else if (err.type === "network" || err.type === "server-error") this.onEvent({ t: "error", msg: "Сигнальный сервер недоступен. Проверьте интернет." });
      else this.onEvent({ t: "error", msg: "Ошибка сети: " + (err.type || "неизвестная") });
    });
  }

  broadcastPlayers(players: PlayerInfo[]) {
    if (!this.isHost) return;
    for (const [id, conn] of this.conns) {
      const you = players.find((p) => p.id === id)?.id ?? id;
      try { conn.send({ t: "players", players, code: this.code, you } satisfies Msg); } catch { /* обрыв */ }
    }
  }

  startGame(payload: { seed: number; fragLimit: number; timeLimit: number; players: PlayerInfo[] }) {
    for (const [, conn] of this.conns) {
      try { conn.send({ t: "start", ...payload } satisfies Msg); } catch { /* обрыв */ }
    }
  }

  sendSnap(s: Snapshot) {
    const msg: Msg = { t: "snap", s };
    for (const [, conn] of this.conns) {
      try { conn.send(msg); } catch { /* обрыв */ }
    }
  }

  sendInput(input: Input) {
    if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send({ t: "input", input } satisfies Msg); } catch { /* обрыв */ }
    }
  }

  connectedGuests(): string[] {
    return [...this.conns.keys()];
  }

  close() {
    try { this.hostConn?.close(); } catch { /* */ }
    for (const [, c] of this.conns) { try { c.close(); } catch { /* */ } }
    this.conns.clear();
    try { this.peer?.destroy(); } catch { /* */ }
    this.peer = null;
  }
}
