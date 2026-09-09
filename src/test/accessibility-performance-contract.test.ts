import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("cross-platform accessibility and mobile performance contract", () => {
  it("keeps Readify red while using an AA-safe dark foreground", () => {
    const css = source("src/index.css");
    expect(css).toContain("--primary: 4 100% 59%;");
    expect(css).toContain("--primary-foreground: 0 0% 0%;");
    expect(css).toContain("--accent-foreground: 0 0% 0%;");
  });

  it("enforces touch-first button and notification targets", () => {
    const button = source("src/components/ui/button.tsx");
    const bell = source("src/components/social/NotificationsBell.tsx");
    expect(button).toContain("min-h-12 min-w-12");
    expect(bell).toContain('"h-12 w-12"');
  });

  it("does not pay fixed-background or glass-blur cost by default on mobile", () => {
    const css = source("src/index.css");
    expect(css).toContain("background-attachment: scroll;");
    expect(css).toContain("@media (min-width: 768px) and (pointer: fine)");
    expect(css).toContain("backdrop-filter: none;");
  });

  it("honors reduced-motion globally", () => {
    const css = source("src/index.css");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animation-duration: 0.01ms !important");
    expect(css).toContain("transition-duration: 0.01ms !important");
  });
});
