import { describe, it, expect } from "vitest";
import { getIcon } from "./gamification";
import * as Icons from "lucide-react";

describe("getIcon", () => {
  it("retorna o ícone correto quando o nome existe em lucide-react", () => {
    const Icon = getIcon("BookOpen");
    expect(Icon).toBe((Icons as any).BookOpen);
  });

  it("retorna ícone para nomes válidos comuns usados em achievements", () => {
    expect(getIcon("Flame")).toBe((Icons as any).Flame);
    expect(getIcon("Trophy")).toBe((Icons as any).Trophy);
    expect(getIcon("Star")).toBe((Icons as any).Star);
  });

  it("faz fallback para Award quando o nome não existe", () => {
    const Icon = getIcon("DefinitivamenteNaoExiste");
    expect(Icon).toBe(Icons.Award);
  });

  it("faz fallback para Award com string vazia", () => {
    expect(getIcon("")).toBe(Icons.Award);
  });

  it("não lança erro com inputs inválidos", () => {
    expect(() => getIcon("123!@#")).not.toThrow();
    expect(getIcon("123!@#")).toBe(Icons.Award);
  });
});
