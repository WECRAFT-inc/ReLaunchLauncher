// Musique : pont des commandes multimédias de Windows (processus simulé), réglages et raccourcis.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { cleanMusicSettings, isMusicAccelerator } from "../src/main/config";
import { appName, BRIDGE_SCRIPT, decodeSessions, MusicBridge, pickSession, type BridgeChild } from "../src/main/media/music";
import { FriendsPresence } from "../src/main/relink/friendsPresence";

/** Faux PowerShell : répond aux commandes comme le script du pont. */
function fakeBridge(sessions: Record<string, unknown>[], opts: { current?: string; failOn?: string } = {}) {
  const lines: string[] = [];
  const out = new EventEmitter();
  const ev = new EventEmitter();
  const reply = (o: unknown) => setImmediate(() => out.emit("data", Buffer.from(JSON.stringify(o) + "\r\n")));
  const child: BridgeChild = {
    stdin: {
      write: (s: string) => {
        for (const line of s.split("\n").filter(Boolean)) {
          lines.push(line);
          const [id, cmd, ...rest] = line.split(" ");
          const arg = rest.join(" ");
          if (cmd === opts.failOn) reply({ id, ok: false, error: "x" });
          else if (cmd === "state") reply({ id, ok: true, current: opts.current ?? "", sessions: sessions.length === 1 ? sessions[0] : sessions });
          else if (cmd === "thumb") reply({ id, ok: true, type: "image/png", data: "iVBORw0KGgo=" });
          else reply({ id, ok: sessions.some((x) => x["id"] === arg) });
        }
        return true;
      },
    },
    stdout: { on: (e, cb) => out.on(e, cb) },
    on: (e, cb) => ev.on(e, cb),
    kill: () => ev.emit("exit", 0),
  };
  reply({ ready: true });
  return { child, lines, ev };
}

const spotify = { id: "Spotify.exe", title: "Titre", artist: "Artiste", album: "Album", status: "Playing", canPlay: true, canPause: true, canNext: true, canPrev: true, hasThumb: true };
const chrome = { id: "Chrome", title: "Vidéo", artist: "", album: "", status: "Paused", canPlay: true, canPause: false, canNext: false, canPrev: false, hasThumb: false };

test("noms d'applis lisibles", () => {
  assert.equal(appName("Spotify.exe"), "Spotify");
  assert.equal(appName("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"), "Spotify");
  assert.equal(appName("Deezer.Desktop"), "Deezer");
  assert.equal(appName("MSEdge"), "Microsoft Edge");
  assert.equal(appName("AppleInc.AppleMusicWin_nzyj5cx40ttqa!App"), "Apple Music");
  assert.equal(appName("Truc.MonLecteur_abc!App"), "MonLecteur");
});

test("sessions : un élément seul (aplati par PowerShell) et valeurs invalides", () => {
  assert.equal(decodeSessions(spotify).length, 1);
  assert.deepEqual(decodeSessions([{ id: "" }, { id: "a\nb" }, null, 3]), []);
  const [s] = decodeSessions([{ ...spotify, title: "x".repeat(500) + "\u0007" }]);
  assert.equal(s!.title.length, 200);
  assert.equal(s!.playing, true);
});

test("session pilotée : choix du joueur, sinon Windows, sinon celle qui joue", () => {
  const ss = decodeSessions([chrome, spotify]);
  assert.equal(pickSession(ss, "Chrome", "Spotify.exe")?.id, "Chrome");
  assert.equal(pickSession(ss, "Disparue", "Chrome")?.id, "Chrome");
  assert.equal(pickSession(ss, null, null)?.id, "Spotify.exe");
  assert.equal(pickSession([], null, null), null);
});

test("pont : état avec pochette, commandes seulement sur une session connue", async () => {
  const f = fakeBridge([chrome, spotify], { current: "Spotify.exe" });
  const b = new MusicBridge({ platform: "win32", spawnBridge: () => f.child });
  const st = await b.state();
  assert.equal(st.available, true);
  assert.equal(st.selected, "Spotify.exe");
  assert.equal(st.track?.thumb, "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(await b.control("next"), true);
  assert.ok(f.lines.some((l) => / next Spotify\.exe$/.test(l)));
  assert.equal(await b.control("toggle", "Inconnue"), false);
  assert.ok(!f.lines.some((l) => l.includes("Inconnue")), "jamais d'identifiant inconnu envoyé au pont");
  b.choose("Chrome");
  assert.equal((await b.state()).selected, "Chrome");
  // pochette gardée en cache : une seule demande pour le même morceau
  await b.state();
  b.choose(null);
  await b.state();
  assert.equal(f.lines.filter((l) => l.includes(" thumb ")).length, 1);
  b.stop();
});

test("pont : hors Windows, rien n'est lancé ; pont mort → indisponible sans exception", async () => {
  let spawned = 0;
  const off = new MusicBridge({ platform: "linux", spawnBridge: () => (spawned++, fakeBridge([]).child) });
  assert.equal((await off.state()).available, false);
  assert.equal(spawned, 0);

  let f = fakeBridge([spotify]);
  let n = 0;
  const b = new MusicBridge({ platform: "win32", spawnBridge: () => (n++ ? (f = fakeBridge([spotify])) : f).child });
  await b.state();
  f.ev.emit("exit", 1);
  const st = await b.state(); // relance après l'arrêt (le délai d'attente ne s'applique qu'aux échecs de démarrage)
  assert.equal(st.available, true);
  assert.equal(n, 2);
});

test("pont : échec au démarrage (ex. API Windows absente) → raison affichée, pas d'attente infinie", async () => {
  const out = new EventEmitter();
  const ev = new EventEmitter();
  const child: BridgeChild = { stdin: { write: () => true }, stdout: { on: (e, cb) => out.on(e, cb) }, on: (e, cb) => ev.on(e, cb), kill: () => undefined };
  setImmediate(() => out.emit("data", '{"fatal":"Type introuvable"}\r\n'));
  const logs: string[] = [];
  const b = new MusicBridge({ platform: "win32", spawnBridge: () => child, log: (l) => logs.push(l) });
  const st = await b.state();
  assert.equal(st.available, false);
  assert.match(st.reason ?? "", /Type introuvable/);
  assert.ok(logs.some((l) => l.includes("Type introuvable")));
});

test("script du pont : jamais de changement d'encodage de la console (lancé sans console)", () => {
  assert.doesNotMatch(BRIDGE_SCRIPT, /\[Console\]::(Input|Output)Encoding\s*=/);
  assert.match(BRIDGE_SCRIPT, /OpenStandardInput\(\)/);
});

test("réglages : par défaut mini-lecteur actif, partage coupé, aucun raccourci", () => {
  assert.deepEqual(cleanMusicSettings(undefined), { enabled: true, share: false, shortcuts: { toggle: null, next: null, prev: null } });
  assert.deepEqual(cleanMusicSettings({ enabled: false, share: true, shortcuts: { toggle: "Ctrl+Alt+Space", next: "Right", prev: "Ctrl+Alt+Left" } }).shortcuts, { toggle: "Ctrl+Alt+Space", next: null, prev: "Ctrl+Alt+Left" });
});

test("raccourcis : Ctrl ou Alt obligatoire, touches connues seulement", () => {
  for (const ok of ["Ctrl+Alt+Space", "Alt+Shift+P", "Ctrl+F5", "Ctrl+Super+num3"]) assert.ok(isMusicAccelerator(ok), ok);
  for (const ko of ["Space", "Shift+P", "Ctrl+Ctrl+P", "Ctrl+Alt+Escape", "Ctrl+", "Ctrl+Alt+MediaNextTrack", 5]) assert.ok(!isMusicAccelerator(ko), String(ko));
});

test("présence : la musique n'est envoyée que si elle est fournie (partage activé)", async () => {
  const sent: unknown[] = [];
  let music: { title: string; artist: string; app: string } | null = { title: "T", artist: "A", app: "Spotify" };
  const p = new FriendsPresence({ send: async (b) => void sent.push(b), clear: async () => undefined, active: async () => true, music: async () => music });
  await p.beat();
  music = null;
  await p.beat();
  assert.deepEqual((sent[0] as { music: unknown }).music, { title: "T", artist: "A", app: "Spotify" });
  assert.equal((sent[1] as { music: unknown }).music, null);
});

test("script du pont : commandes attendues, aucun accès réseau ni fichier", () => {
  for (const c of ["'state'", "'thumb'", "TryTogglePlayPauseAsync", "TrySkipNextAsync", "IAsyncOperation`1"]) assert.ok(BRIDGE_SCRIPT.includes(c), c);
  assert.doesNotMatch(BRIDGE_SCRIPT, /Invoke-WebRequest|Invoke-Expression|\biex\b|Set-Content|Out-File|Start-Process/i);
});
