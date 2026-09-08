import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

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

  it("profile prefetch requests only public identity columns", () => {
    const content = source("src/lib/prefetch.ts");
    expect(content).toContain("id,username,display_name,avatar_url,level,xp,created_at");
    expect(content).not.toMatch(
      /\.from\(["']profiles["']\)[\s\S]{0,160}\.select\(["']\*["']\)/,
    );
  });
});
