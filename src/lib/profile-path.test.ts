import { describe, it, expect } from "vitest";
import { profilePath } from "./profile-path";

describe("profilePath", () => {
  it("retorna # quando perfil é null/undefined", () => {
    expect(profilePath(null)).toBe("#");
    expect(profilePath(undefined)).toBe("#");
    expect(profilePath({})).toBe("#");
  });

  it("prioriza username sobre id", () => {
    expect(profilePath({ id: "uuid-1", username: "joao" })).toBe("/u/joao");
  });

  it("remove @ inicial do username", () => {
    expect(profilePath({ username: "@maria" })).toBe("/u/maria");
    expect(profilePath({ username: "@@dupla" })).toBe("/u/dupla");
  });

  it("cai pra id quando username ausente", () => {
    expect(profilePath({ id: "abc-123" })).toBe("/u/abc-123");
  });

  it("ignora username vazio e usa id", () => {
    expect(profilePath({ id: "abc", username: "" })).toBe("/u/abc");
  });
});
