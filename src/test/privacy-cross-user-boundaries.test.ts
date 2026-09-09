import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("cross-user privacy boundaries", () => {
  it("public profile and wishlist never read raw user_books", () => {
    for (const path of [
      "src/pages/PublicProfile.tsx",
      "src/pages/PublicWishlistPage.tsx",
    ]) {
      const content = source(path);
      expect(content, `${path} must use visible_user_library`).not.toContain('.from("user_books")');
      expect(content, `${path} must use a redacted server projection`).toContain("visible_user_library");
    }
  });

  it("trade dialog reads raw user_books only for the authenticated user's own inventory", () => {
    const content = source("src/components/social/ProposeTradeDialog.tsx");
    expect(content.match(/\.from\("user_books"\)/g) ?? []).toHaveLength(1);
    expect(content).toContain("visible_user_library");
    expect(content).toContain("_available_for_trade_only: true");
  });

  it("reading-progress visibility is persisted server-side, never as a local privacy promise", () => {
    const content = source("src/pages/SettingsPage.tsx");
    expect(content).toContain("show_reading_progress");
    expect(content).not.toContain('localStorage.getItem("show_progress")');
    expect(content).not.toContain('localStorage.setItem("show_progress"');
  });

  it("club progress never subscribes to raw cross-user library rows", () => {
    const content = source("src/components/clubs/ClubBookProgress.tsx");
    expect(content).toContain("club_book_progress");
    expect(content).not.toMatch(/postgres_changes[\s\S]{0,300}table:\s*["']user_books["']/);
  });

  it("database migration makes raw library rows owner-only and exposes redacted projection", () => {
    const migration = source(
      "supabase/migrations/20260908203000_readify_privacy_projection_and_progress.sql",
    );
    expect(migration).toContain("CREATE POLICY ub_select_own");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.visible_user_library");
    expect(migration).toContain("p.show_reading_progress");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.can_view_profile_content");
    expect(migration).toContain("profile_visibility IN ('public', 'followers', 'private')");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.books_read_by_following");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.club_book_progress");
  });

  it("new progress preference remains writable after column-level profile grants", () => {
    const grant = source(
      "supabase/migrations/20260908203100_readify_privacy_profile_column_grant.sql",
    );
    expect(grant).toContain("GRANT UPDATE (show_reading_progress)");
    expect(grant).toContain("TO authenticated");
  });
});
