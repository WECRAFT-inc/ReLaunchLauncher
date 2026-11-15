// Son de l'intro, entièrement synthétisé (aucun fichier audio) : grondement, souffles des ailes, crépitement du feu,
// explosion de lumière, détonation du titre, nappe finale. Fonctionne avec un AudioContext (lecture au démarrage)
// comme avec un OfflineAudioContext (export vidéo) : mêmes instants que la scène (scene.ts).

const BURST_AT = 6.7;
const TITLE_AT = 7.75;

function noiseBuffer(ac: BaseAudioContext, seconds: number, brown = false): AudioBuffer {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 1234567;
  let last = 0;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0; // reproductible
    const w = seed / 2147483648 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

/** Réponse impulsionnelle d'une grande salle (queue de réverbération des explosions). */
function impulse(ac: BaseAudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, n, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let seed = 99 + c * 7;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = (seed / 2147483648 - 1) * Math.pow(1 - i / n, 3.2);
    }
  }
  return buf;
}

/** Programme tout le son à partir de `t0` (temps du contexte) ; renvoie le nœud de sortie (pour couper). */
export function scheduleIntroSound(ac: BaseAudioContext, t0: number, volume = 0.5): GainNode {
  const out = ac.createGain();
  out.gain.value = volume;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 6;
  comp.ratio.value = 12; // presque un limiteur : les explosions ne saturent pas
  comp.attack.value = 0.002;
  comp.release.value = 0.25;
  out.connect(comp).connect(ac.destination);
  const verb = ac.createConvolver();
  verb.buffer = impulse(ac, 3.2);
  const verbGain = ac.createGain();
  verbGain.gain.value = 0.35;
  verb.connect(verbGain).connect(out);

  const white = noiseBuffer(ac, 4);
  const brown = noiseBuffer(ac, 12, true);
  const src = (buf: AudioBuffer, at: number, dur: number, loop = false) => {
    const s = ac.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    s.start(t0 + at);
    s.stop(t0 + at + dur);
    return s;
  };
  const env = (g: GainNode, pts: [number, number][]) => {
    g.gain.setValueAtTime(0, t0);
    for (const [at, v] of pts) g.gain.linearRampToValueAtTime(v, t0 + at);
  };

  // 1. grondement profond : bruit brun filtré + sinus grave, qui enfle jusqu'à l'explosion
  {
    const s = src(brown, 0, 10.5, true);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 140;
    const g = ac.createGain();
    env(g, [
      [0.1, 0],
      [2.5, 0.9],
      [6.4, 1.1],
      [BURST_AT + 0.4, 0.5],
      [10.5, 0.25],
    ]);
    s.connect(lp).connect(g).connect(out);
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(36, t0);
    o.frequency.linearRampToValueAtTime(48, t0 + BURST_AT);
    const og = ac.createGain();
    env(og, [
      [0.2, 0],
      [2.0, 0.35],
      [BURST_AT, 0.45],
      [BURST_AT + 1.5, 0.1],
      [10.5, 0],
    ]);
    o.connect(og).connect(out);
    o.start(t0);
    o.stop(t0 + 10.5);
  }

  // 2. souffles : déploiement des ailes, deux battements pendant l'ascension
  for (const [at, dur, f0, f1, v] of [
    [2.3, 1.3, 300, 1400, 0.5],
    [4.6, 0.9, 400, 1800, 0.55],
    [5.3, 0.9, 400, 1800, 0.5],
    [5.9, 0.9, 450, 2000, 0.5],
  ] as [number, number, number, number, number][]) {
    const s = src(white, at, dur);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(f0, t0 + at);
    bp.frequency.exponentialRampToValueAtTime(f1, t0 + at + dur * 0.6);
    const g = ac.createGain();
    env(g, [
      [at, 0],
      [at + dur * 0.35, v],
      [at + dur, 0],
    ]);
    s.connect(bp).connect(g);
    g.connect(out);
    g.connect(verb);
  }

  // 3. feu : souffle continu + crépitements (petits claquements reproductibles)
  {
    const s = src(white, 3.0, 4.6, true);
    const hp = ac.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = 900;
    hp.Q.value = 0.5;
    const g = ac.createGain();
    env(g, [
      [3.0, 0],
      [3.8, 0.18],
      [BURST_AT, 0.28],
      [BURST_AT + 0.6, 0],
    ]);
    s.connect(hp).connect(g).connect(out);
    let seed = 42;
    for (let i = 0; i < 70; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const at = 3.1 + (seed / 4294967296) * (BURST_AT - 3.1);
      const c = src(white, at, 0.03);
      const f = ac.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 2500;
      const cg = ac.createGain();
      cg.gain.setValueAtTime(0, t0 + at);
      cg.gain.linearRampToValueAtTime(0.12 + (seed % 100) / 900, t0 + at + 0.002);
      cg.gain.exponentialRampToValueAtTime(0.001, t0 + at + 0.03);
      c.connect(f).connect(cg).connect(out);
    }
  }

  // explosion / détonation : transitoire de bruit + chute de fréquence grave + réverbération
  const boom = (at: number, power: number, low: number) => {
    const s = src(white, at, 2.5);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(6000, t0 + at);
    lp.frequency.exponentialRampToValueAtTime(180, t0 + at + 1.2);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t0 + at);
    g.gain.linearRampToValueAtTime(power, t0 + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + at + 2.4);
    s.connect(lp).connect(g);
    g.connect(out);
    g.connect(verb);
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(low * 2.4, t0 + at);
    o.frequency.exponentialRampToValueAtTime(low, t0 + at + 0.5);
    const og = ac.createGain();
    og.gain.setValueAtTime(0, t0 + at);
    og.gain.linearRampToValueAtTime(power * 1.1, t0 + at + 0.008);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + at + 1.8);
    o.connect(og);
    og.connect(out);
    og.connect(verb);
    o.start(t0 + at);
    o.stop(t0 + at + 2);
  };
  // montée avant l'explosion
  {
    const s = src(white, BURST_AT - 1.2, 1.25);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(200, t0 + BURST_AT - 1.2);
    bp.frequency.exponentialRampToValueAtTime(3000, t0 + BURST_AT);
    const g = ac.createGain();
    env(g, [
      [BURST_AT - 1.2, 0],
      [BURST_AT - 0.02, 0.4],
      [BURST_AT + 0.05, 0],
    ]);
    s.connect(bp).connect(g).connect(out);
  }
  boom(BURST_AT, 0.85, 34);
  boom(TITLE_AT, 1.0, 28);

  // nappe finale : accord grave et brillant, discret
  for (const [f, v] of [
    [55, 0.12],
    [110, 0.06],
    [164.8, 0.035],
    [220, 0.025],
  ] as [number, number][]) {
    const o = ac.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const g = ac.createGain();
    env(g, [
      [TITLE_AT, 0],
      [TITLE_AT + 1.2, v],
      [10.5, 0],
    ]);
    o.connect(g);
    g.connect(out);
    g.connect(verb);
    o.start(t0 + TITLE_AT);
    o.stop(t0 + 10.6);
  }
  return out;
}
