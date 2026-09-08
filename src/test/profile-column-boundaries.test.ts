import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function sourceFiles(root = join(process.cwd(), "src")): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const PRIVATE_PROFILE_COLUMNS = new Set([
  "bio",
  "profile_visibility",
  "library_visibility",
  "show_reading_progress",
  "instagram",
  "tiktok",
  "twitter",
  "website",
  "favorite_genres",
  "content_types",
  "onboarded_at",
  "tutorial_completed_at",
  "tutorial_last_step",
]);

describe("profile column privacy boundary", () => {
  it("full profile rows are available only through the self-scoped RPC", () => {
    const helper = source("src/lib/profile-api.ts");
    const migration = source(
      "supabase/migrations/20260908205500_readify_profile_column_privacy.sql",
    );

    expect(helper).toContain("get_my_profile");
    expect(migration).toContain("WHERE p.id = auth.uid()");
    expect(migration).toContain("REVOKE SELECT ON TABLE public.profiles FROM anon, authenticated");
    expect(migration).toContain("GRANT SELECT (");
    expect(migration).toContain("id,");
    expect(migration).toContain("username,");
    expect(migration).toContain("display_name,");
    expect(migration).toContain("avatar_url,");
    expect(migration).toContain("level,");
    expect(migration).toContain("xp,");
    expect(migration).toContain("created_at");
    expect(migration).not.toMatch(/GRANT SELECT \([\s\S]*\bbio\b[\s\S]*\) ON TABLE public\.profiles TO anon/);
  });

  it("known self-only consumers use getMyProfile instead of raw sensitive SELECTs", () => {
    for (const path of [
      "src/components/auth/ProtectedRoute.tsx",
      "src/hooks/useContentPrefs.ts",
      "src/hooks/useTutorial.ts",
      "src/pages/Onboarding.tsx",
      "src/pages/ProfilePage.tsx",
      "src/pages/SettingsPage.tsx",
    ]) {
      const content = source(path);
      expect(content, `${path} must use self-only profile API`).toContain("getMyProfile");
      expect(content, `${path} must not select all profile columns`).not.toMatch(
        /\.from\(["']profiles["']\)[\s\S]{0,160}\.select\(["']\*["']\)/,
      );
    }
  });

  it("no client file reads all profile columns or selects private profile fields directly", () => {
    const offenders: string[] = [];
    const selectPattern = /\.from\(["']profiles["']\)[\s\S]{0,180}?\.select\(["'`]([^"'`]+)["'`]\)/g;

    for (const absolutePath of sourceFiles()) {
      const content = readFileSync(absolutePath, "utf8");
      const path = relative(process.cwd(), absolutePath);
      for (const match of content.matchAll(selectPattern)) {
        const selection = match[1].replace(/\s+/g, "");
        if (selection === "*") {
          offenders.push(`${path}: select(*)`);
          continue;
        }
        const columns = selection.split(",").map((column) => column.split(":").pop()?.split("(")[0] ?? column);
        const privateColumns = columns.filter((column) => PRIVATE_PROFILE_COLUMNS.has(column));
        if (privateColumns.length > 0) {
          offenders.push(`${path}: ${privateColumns.join(",")}`);
        }
      }
    }

    expect(offenders, `raw private profile reads found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("profile prefetch requests only public identity columns", () => {
    const content = source("src/lib/prefetch.ts");
    expect(content).toContain("id,username,display_name,avatar_url,level,xp,created_at");
    expect(content).not.toMatch(
      /\.from\(["']profiles["']\)[\s\S]{0,160}\.select\(["']\*["']\)/,
    );
  });
});
