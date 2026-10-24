// Client minimal du protocole local de Discord (Rich Presence) — lot E9. Remplace pypresence, sans dépendance.
// Discord écoute sur un canal local (« \\?\pipe\discord-ipc-N » sous Windows) : chaque message est
// [code u32][longueur u32][JSON]. Rien ne sort du PC : ReLaunch parle seulement à l'appli Discord ouverte.
import { connect, type Socket } from "node:net";
import path from "node:path";

export interface Activity {
  details: string;
  state: string;
  timestamps?: { start: number };
  assets?: { large_image: string; large_text: string };
  buttons?: { label: string; url: string }[];
}

export interface RpcClient {
  connect(): Promise<void>;
  setActivity(a: Activity | null): Promise<void>;
  close(): void;
}

export function pipePath(n: number, platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  if (platform === "win32") return `\\\\?\\pipe\\discord-ipc-${n}`;
  const base = env["XDG_RUNTIME_DIR"] || env["TMPDIR"] || env["TMP"] || env["TEMP"] || "/tmp";
  return path.posix.join(base, `discord-ipc-${n}`);
}

export function encode(op: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const head = Buffer.alloc(8);
  head.writeUInt32LE(op, 0);
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/** Client Discord : poignée de main (code 0), puis commandes SET_ACTIVITY (code 1). */
export class DiscordIpc implements RpcClient {
  private sock: Socket | null = null;
  private buf = Buffer.alloc(0);
  private waiters: ((m: { op: number; data: Record<string, unknown> }) => void)[] = [];
  private nonce = 0;

  constructor(
    private readonly clientId: string,
    private readonly open: (p: string) => Socket = (p) => connect(p),
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  private onData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 8) {
      const op = this.buf.readUInt32LE(0);
      const len = this.buf.readUInt32LE(4);
      if (len > 1024 * 1024) {
        this.close();
        return;
      }
      if (this.buf.length < 8 + len) return;
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(this.buf.toString("utf8", 8, 8 + len)) as Record<string, unknown>;
      } catch {
        // message illisible : ignoré
      }
      this.buf = this.buf.subarray(8 + len);
      this.waiters.shift()?.({ op, data });
    }
  }

  private next(timeoutMs = 5000): Promise<{ op: number; data: Record<string, unknown> }> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Discord ne répond pas")), timeoutMs);
      this.waiters.push((m) => {
        clearTimeout(t);
        resolve(m);
      });
    });
  }

  async connect(): Promise<void> {
    let last: unknown = null;
    for (let n = 0; n < 10; n++) {
      try {
        const sock = await new Promise<Socket>((resolve, reject) => {
          const s = this.open(pipePath(n, this.platform));
          s.once("connect", () => resolve(s));
          s.once("error", reject);
        });
        this.sock = sock;
        sock.on("data", (c: Buffer) => this.onData(c));
        sock.on("error", () => this.close());
        sock.on("close", () => (this.sock = null));
        sock.write(encode(0, { v: 1, client_id: this.clientId }));
        const ready = await this.next();
        if (ready.op !== 1 || ready.data["evt"] !== "READY") throw new Error("Discord a refusé la connexion");
        return;
      } catch (e) {
        last = e;
        this.close();
      }
    }
    throw last instanceof Error ? last : new Error("Discord n'est pas ouvert");
  }

  async setActivity(a: Activity | null): Promise<void> {
    if (!this.sock) throw new Error("non connecté");
    this.sock.write(encode(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity: a }, nonce: String(++this.nonce) }));
    const r = await this.next();
    if (r.data["evt"] === "ERROR") throw new Error(String((r.data["data"] as Record<string, unknown> | undefined)?.["message"] ?? "erreur Discord"));
  }

  close(): void {
    try {
      this.sock?.destroy();
    } catch {
      // déjà fermé
    }
    this.sock = null;
    this.buf = Buffer.alloc(0);
    for (const w of this.waiters.splice(0)) w({ op: -1, data: { evt: "ERROR" } });
  }
}
