import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// FB-012: nothing in the app is smaller than 14px. The scale lives in
// src/app/globals.css as tokens; components use the utilities, never their own
// arbitrary pixel sizes.

const SRC = path.join(process.cwd(), "src");
const MIN_PX = 14;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "generated") return [];
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

function toPx(value: number, unit: string): number {
  return unit === "rem" ? value * 16 : value;
}

describe("type scale (FB-012)", () => {
  const sources = files(SRC).filter((f) => /\.(tsx?|css)$/.test(f));

  it("uses no arbitrary text-[Npx] / text-[Nrem] class below 14px", () => {
    const offenders: string[] = [];
    for (const file of sources.filter((f) => /\.tsx?$/.test(f))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/text-\[(\d+(?:\.\d+)?)(px|rem)\]/g)) {
        if (toPx(Number(match[1]), match[2]) < MIN_PX) {
          offenders.push(`${path.relative(SRC, file)}: ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("sets no font-size below 14px in CSS or inline styles", () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/font-?[sS]ize:\s*['"]?(\d+(?:\.\d+)?)(px|rem)/g)) {
        if (toPx(Number(match[1]), match[2]) < MIN_PX) {
          offenders.push(`${path.relative(SRC, file)}: ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("defines every text token at 14px or more, with the agreed named sizes", () => {
    const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    const sizes = new Map<string, number>();
    for (const match of css.matchAll(/--text-([a-z0-9]+):\s*(\d+(?:\.\d+)?)rem/g)) {
      sizes.set(match[1], Number(match[2]) * 16);
    }
    for (const [name, px] of sizes) expect(px, `--text-${name}`).toBeGreaterThanOrEqual(MIN_PX);
    expect(Object.fromEntries(sizes)).toMatchObject({
      meta: 14,
      body: 16,
      card: 18,
      banner: 20,
      section: 24,
      xs: 14,
      sm: 16,
    });
  });
});
