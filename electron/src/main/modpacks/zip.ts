// Lecture de quelques petits fichiers dans une archive .jar/.zip (lot E7, port de zipfile dans read_mod_jar).
// Volontairement minimal : seuls les fichiers demandés sont lus, chacun limité en taille (pas de « bombe »),
// rien n'est extrait sur le disque. Archives ZIP64 ou chiffrées : ignorées (le nom du fichier sert alors de nom).
import { open } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

export async function readZipEntries(file: string, names: readonly string[], maxEach: number): Promise<Map<string, Buffer>> {
  const want = new Set(names);
  const out = new Map<string, Buffer>();
  const fh = await open(file, "r");
  try {
    const size = (await fh.stat()).size;
    const tailLen = Math.min(size, 65536 + 22);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let e = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD) {
        e = i;
        break;
      }
    }
    if (e < 0) throw new Error("archive illisible");
    const count = tail.readUInt16LE(e + 10);
    const cdSize = tail.readUInt32LE(e + 12);
    const cdOff = tail.readUInt32LE(e + 16);
    if (cdOff + cdSize > size || cdSize > 16 * 1024 * 1024) throw new Error("archive illisible");
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOff);
    let p = 0;
    for (let n = 0; n < count && p + 46 <= cd.length; n++) {
      if (cd.readUInt32LE(p) !== CEN) break;
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      const csize = cd.readUInt32LE(p + 20);
      const usize = cd.readUInt32LE(p + 24);
      const nlen = cd.readUInt16LE(p + 28);
      const xlen = cd.readUInt16LE(p + 30);
      const clen = cd.readUInt16LE(p + 32);
      const loc = cd.readUInt32LE(p + 42);
      const name = cd.toString("utf8", p + 46, p + 46 + nlen);
      p += 46 + nlen + xlen + clen;
      if (!want.has(name) || out.has(name)) continue;
      if (flags & 1 || usize > maxEach || csize > maxEach || csize === 0xffffffff || (method !== 0 && method !== 8)) continue;
      const lh = Buffer.alloc(30);
      await fh.read(lh, 0, 30, loc);
      if (lh.readUInt32LE(0) !== LOC) continue;
      const start = loc + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      if (start + csize > size) continue;
      const data = Buffer.alloc(csize);
      await fh.read(data, 0, csize, start);
      try {
        out.set(name, method === 0 ? data : inflateRawSync(data, { maxOutputLength: maxEach }));
      } catch {
        // entrée abîmée : ignorée
      }
    }
  } finally {
    await fh.close();
  }
  return out;
}
