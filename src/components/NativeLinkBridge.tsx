import { useNativeDeepLinks } from "@/hooks/useNativeDeepLinks";

/** Headless bridge: traduz links do sistema operacional para rotas do Readify. */
export function NativeLinkBridge() {
  useNativeDeepLinks();
  return null;
}
