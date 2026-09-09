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
    else if ((path.endsWith(".ts") || path.endsWith(".tsx")) && !path.includes("/test/")) out.push(path);
  }
  return out;
}

describe("authenticated runtime architecture", () => {
  it("owns Supabase auth state in one global provider", () => {
    const provider = source("src/providers/AuthProvider.tsx");
    const hook = source("src/hooks/useAuth.ts");

    expect(provider).toContain("supabase.auth.onAuthStateChange");
    expect(provider).toContain("supabase.auth.getSession");
    expect(hook).toContain("useAuthContext");
    expect(hook).not.toContain("onAuthStateChange");
    expect(hook).not.toContain("getSession");

    const owners = sourceFiles()
      .map((path) => [relative(process.cwd(), path), readFileSync(path, "utf8")] as const)
      .filter(([, content]) => content.includes("supabase.auth.onAuthStateChange"))
      .map(([path]) => path);

    expect(owners).toEqual(["src/providers/AuthProvider.tsx"]);
  });

  it("uses one persistent protected boundary and one persistent visual shell", () => {
    const app = source("src/App.tsx");
    const protectedRoute = source("src/components/auth/ProtectedRoute.tsx");
    const layout = source("src/components/layout/AuthenticatedAppLayout.tsx");
    const shell = source("src/components/layout/AppShell.tsx");

    expect(app).toContain("<AuthProvider>");
    expect(app.match(/<ProtectedRoute \/>/g)?.length).toBe(1);
    expect(app).toContain("<AuthenticatedAppLayout />");
    expect(protectedRoute).toContain("<Outlet />");
    expect(protectedRoute).toContain("useRealtimeInvalidation();");
    expect(layout).toContain("<AppShell>");
    expect(layout).toContain("<Outlet />");
    expect(shell).not.toContain("useRealtimeInvalidation");
  });

  it("keeps product pages shell-agnostic", () => {
    const offenders: string[] = [];
    const pagesRoot = join(process.cwd(), "src/pages");

    for (const name of readdirSync(pagesRoot)) {
      if (!name.endsWith(".tsx")) continue;
      const path = join(pagesRoot, name);
      const content = readFileSync(path, "utf8");
      if (content.includes("AppShell")) offenders.push(relative(process.cwd(), path));
    }

    expect(offenders, `pages still own AppShell:\n${offenders.join("\n")}`).toEqual([]);
  });
});
