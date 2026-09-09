import { Outlet } from "react-router-dom";
import { AppShell } from "./AppShell";

/**
 * Persistent visual shell for authenticated product routes.
 * Route changes replace only the Outlet; navigation/runtime chrome stays mounted.
 */
export function AuthenticatedAppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
