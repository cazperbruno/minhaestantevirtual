import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "@/components/layout/BottomNav";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "test-user" }, session: null, loading: false }),
}));

vi.mock("@/lib/prefetch", () => ({
  prefetch: {
    library: vi.fn(),
    profile: vi.fn(),
    feed: vi.fn(),
  },
}));

describe("BottomNav", () => {
  it("renders the five stable mobile destinations", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <BottomNav />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Início" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Biblioteca" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escanear livro" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buscar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Perfil" })).toBeInTheDocument();
  });

  it("keeps scanner as the central navigation action", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="*" element={<><BottomNav /><div data-testid="route">home</div></>} />
          <Route path="/scanner" element={<div data-testid="scanner-route">scanner</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Escanear livro" }));
    expect(screen.getByTestId("scanner-route")).toHaveTextContent("scanner");
  });
});
