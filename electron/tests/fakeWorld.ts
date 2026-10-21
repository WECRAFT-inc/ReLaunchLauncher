// Monde Mojang simulé pour les tests d'installation (aucune connexion réelle).
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { VERSION_MANIFEST_URL } from "../src/main/install/vanilla";
import type { Route } from "./fakeNet";

export const sha1 = (s: string | Uint8Array) => createHash("sha1").update(s).digest("hex");
export const META = "https://piston-meta.mojang.com/v1/packages/";
export const DATA = "https://piston-data.mojang.com/v1/objects/";
export const LIB = "https://libraries.minecraft.net/";
export const RES = "https://resources.download.minecraft.net/";

/** Petit zip valide (une entrée « stockée ») : xmcl vérifie que le jar du jeu est un zip non vide. */
export function tinyZip(name: string, content: string): Buffer {
  const data = Buffer.from(content);
  const fname = Buffer.from(name);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(10, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fname.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(10, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(fname.length, 28);
  const cdOffset = local.length + fname.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fname.length, 12);
  end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, fname, data, central, fname, end]);
}

/** Un « monde Mojang » minimal : liste, version, jar, une bibliothèque, un index et une ressource. */
export function world(id: string, opts: { tamperJson?: boolean } = {}) {
  const jar = tinyZip("net/minecraft/Main.class", "JEU");
  const lib = tinyZip("a/A.class", "LIB");
  const sound = "SON";
  const index = JSON.stringify({ objects: { "minecraft/sounds/a.ogg": { hash: sha1(sound), size: sound.length } } });
  const versionJson = JSON.stringify({
    id,
    type: "release",
    time: "2026-01-01T00:00:00+00:00",
    releaseTime: "2026-01-01T00:00:00+00:00",
    minimumLauncherVersion: 21,
    mainClass: "net.minecraft.client.main.Main",
    arguments: { game: [], jvm: [] },
    assets: "99",
    assetIndex: { id: "99", sha1: sha1(index), size: index.length, totalSize: sound.length, url: `${META}index-99.json` },
    downloads: { client: { sha1: sha1(jar), size: jar.length, url: `${DATA}client.jar` } },
    javaVersion: { component: "java-runtime-delta", majorVersion: 21 },
    libraries: [
      {
        name: "com.example:lib:1.0",
        downloads: { artifact: { path: "com/example/lib/1.0/lib-1.0.jar", sha1: sha1(lib), size: lib.length, url: `${LIB}com/example/lib/1.0/lib-1.0.jar` } },
      },
    ],
  });
  const manifest = JSON.stringify({
    latest: { release: id, snapshot: id },
    versions: [{ id, type: "release", url: `${META}${id}.json`, sha1: sha1(opts.tamperJson ? "autre" : versionJson), time: "", releaseTime: "" }],
  });
  const routes: Record<string, Route> = {
    [VERSION_MANIFEST_URL]: { body: manifest },
    [`${META}${id}.json`]: { body: versionJson },
    [`${DATA}client.jar`]: { body: jar },
    [`${LIB}com/example/lib/1.0/lib-1.0.jar`]: { body: lib },
    [`${META}index-99.json`]: { body: index },
    [`${RES}${sha1(sound).slice(0, 2)}/${sha1(sound)}`]: { body: sound },
  };
  return { routes, jar, lib, sound };
}

