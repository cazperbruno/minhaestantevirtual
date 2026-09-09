import { Network, type ConnectionStatus } from "@capacitor/network";
import { isNativePlatform } from "@/platform/runtime";

export interface ReadifyNetworkStatus {
  connected: boolean;
  connectionType: string;
}

function fromCapacitor(status: ConnectionStatus): ReadifyNetworkStatus {
  return {
    connected: status.connected,
    connectionType: status.connectionType,
  };
}

export async function getNetworkStatus(): Promise<ReadifyNetworkStatus> {
  if (isNativePlatform()) return fromCapacitor(await Network.getStatus());
  return {
    connected: typeof navigator === "undefined" ? true : navigator.onLine,
    connectionType: "unknown",
  };
}

export async function subscribeNetworkStatus(
  listener: (status: ReadifyNetworkStatus) => void,
): Promise<() => Promise<void>> {
  if (isNativePlatform()) {
    const handle = await Network.addListener("networkStatusChange", (status) => {
      listener(fromCapacitor(status));
    });
    return async () => handle.remove();
  }

  const online = () => listener({ connected: true, connectionType: "unknown" });
  const offline = () => listener({ connected: false, connectionType: "none" });
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);

  return async () => {
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
  };
}
