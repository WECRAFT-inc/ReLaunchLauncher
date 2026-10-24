// Icône du prototype rendue comme un vrai <svg> (même balisage que le prototype, constantes du code uniquement).
import type { SVGProps } from "react";
import { IC } from "./icons";

const CAMEL: Record<string, string> = {
  viewBox: "viewBox",
  fill: "fill",
  stroke: "stroke",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  width: "width",
  height: "height",
};
const parsed = new Map<string, { props: Record<string, string>; inner: string }>();

function parse(name: string): { props: Record<string, string>; inner: string } {
  const hit = parsed.get(name);
  if (hit) return hit;
  const src = IC[name] ?? "";
  const m = /^<svg([^>]*)>([\s\S]*)<\/svg>$/.exec(src);
  const props: Record<string, string> = {};
  if (m) for (const a of m[1]!.matchAll(/([\w-]+)="([^"]*)"/g)) props[CAMEL[a[1]!] ?? a[1]!] = a[2]!;
  const out = { props, inner: m ? m[2]! : "" };
  parsed.set(name, out);
  return out;
}

export function Ic({ n, ...extra }: { n: string } & SVGProps<SVGSVGElement>) {
  const { props, inner } = parse(n);
  return <svg {...(props as SVGProps<SVGSVGElement>)} {...extra} dangerouslySetInnerHTML={{ __html: inner }} />;
}
