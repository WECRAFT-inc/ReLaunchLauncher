// Réseau simulé pour les tests (aucune connexion réelle) : adresse -> réponse.
import type { FetchFn } from "../src/main/net/download";

export type Route = { status?: number; body?: Uint8Array | string; headers?: Record<string, string> };

export function fakeFetch(routes: Record<string, Route | (() => Route)>, log: string[] = []): FetchFn {
  return async (url) => {
    log.push(url);
    const r0 = routes[url];
    if (!r0) return new Response("introuvable", { status: 404 });
    const r = typeof r0 === "function" ? r0() : r0;
    const body = typeof r.body === "string" ? new TextEncoder().encode(r.body) : (r.body ?? new Uint8Array());
    return new Response(body, { status: r.status ?? 200, headers: r.headers ?? {} });
  };
}
