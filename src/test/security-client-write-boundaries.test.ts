import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === "test") return [];
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function directInsertInto(content: string, table: string): boolean {
  const quoted = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\.from\\(\\s*["']${quoted}["']\\s*\\)[\\s\\S]{0,300}?\\.insert\\(`,
    "m",
  );
  return pattern.test(content);
}

describe("client trust boundaries", () => {
  const src = join(process.cwd(), "src");
  const files = sourceFiles(src);

  it("frontend never inserts system notifications directly", () => {
    const offenders = files
      .filter((file) => directInsertInto(readFileSync(file, "utf8"), "notifications"))
      .map((file) => relative(process.cwd(), file));

    expect(offenders, `Move notification creation to a validated RPC/trigger: ${offenders.join(", ")}`)
      .toEqual([]);
  });

  it("frontend never inserts system activities directly", () => {
    const offenders = files
      .filter((file) => directInsertInto(readFileSync(file, "utf8"), "activities"))
      .map((file) => relative(process.cwd(), file));

    expect(offenders, `Move activity creation to a validated RPC/trigger: ${offenders.join(", ")}`)
      .toEqual([]);
  });
});
