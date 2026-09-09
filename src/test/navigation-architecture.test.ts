import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  accountNavigation,
  bottomNavigation,
  navigationSections,
  nestedOnlyRoutes,
} from "@/config/navigation";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Readify navigation architecture", () => {
  it("keeps the five mobile destinations stable and product-first", () => {
    const routes = [
      ...bottomNavigation.left,
      bottomNavigation.center,
      ...bottomNavigation.right,
    ];

    expect(routes.map((item) => item.label)).toEqual([
      "Início",
      "Biblioteca",
      "Escanear",
      "Buscar",
      "Perfil",
    ]);
    expect(routes.map((item) => item.to)).toEqual([
      "/",
      "/biblioteca",
      "/scanner",
      "/buscar",
      "/perfil",
    ]);
    expect(routes.every((item) => item.label.length <= 10)).toBe(true);
  });

  it("uses one shared hierarchy without duplicate first-level routes", () => {
    const routes = navigationSections.flatMap((section) => section.items.map((item) => item.to));
    expect(new Set(routes).size).toBe(routes.length);

    for (const nestedRoute of nestedOnlyRoutes) {
      expect(routes).not.toContain(nestedRoute);
    }

    expect(accountNavigation.map((item) => item.to)).toEqual(["/perfil"]);
  });

  it("keeps secondary routes alive but out of first-level navigation", () => {
    const app = source("src/App.tsx");
    for (const route of nestedOnlyRoutes) {
      expect(app).toContain(`path="${route}"`);
    }
  });

  it("prevents layout components from defining independent navigation lists", () => {
    for (const path of [
      "src/components/layout/BottomNav.tsx",
      "src/components/layout/Sidebar.tsx",
      "src/components/layout/MobileHeader.tsx",
    ]) {
      const content = source(path);
      expect(content).toContain("@/config/navigation");
      expect(content).not.toMatch(/const\s+(items|left|right)\s*=/);
    }
  });
});
