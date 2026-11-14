// Parties pures du lecteur Twitch intégré (sans Electron, pour les tests). Voir player.ts.

/** Page du lecteur (pure, testable). */
export function embedPage(login: string): string {
  const src = `https://player.twitch.tv/?channel=${encodeURIComponent(login.toLowerCase())}&parent=localhost&autoplay=true`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Twitch</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="${src}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></body></html>`;
}

/** Seules les pages du serveur local sont servies, et seulement pour un hôte « localhost » / 127.0.0.1 (anti-DNS rebinding). */
export function hostOk(host: string | undefined, port: number): boolean {
  return host === `localhost:${port}` || host === `127.0.0.1:${port}`;
}
