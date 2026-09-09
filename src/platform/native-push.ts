import { App } from "@capacitor/app";
import {
  PushNotifications,
  type ActionPerformed,
  type PermissionStatus,
} from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { getRuntimePlatform, isNativePlatform } from "@/platform/runtime";
import { isSafeInternalPath } from "@/platform/urls";

type RpcError = { message?: string } | null;
type UntypedRpcResult = { data: unknown; error: RpcError };

function callRpc(name: string, args?: Record<string, unknown>): Promise<UntypedRpcResult> {
  const rpc = supabase.rpc as unknown as (
    fn: string,
    params?: Record<string, unknown>,
  ) => Promise<UntypedRpcResult>;
  return rpc(name, args);
}

export function nativePushEnabled(): boolean {
  return (
    isNativePlatform() &&
    import.meta.env.VITE_ENABLE_NATIVE_PUSH === "true"
  );
}

export async function getNativePushPermission(): Promise<PermissionStatus["receive"] | "unsupported"> {
  if (!isNativePlatform()) return "unsupported";
  const status = await PushNotifications.checkPermissions();
  return status.receive;
}

async function waitForRegistrationToken(): Promise<string> {
  let resolveToken!: (token: string) => void;
  let rejectToken!: (error: unknown) => void;
  const registration = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });

  const tokenHandle = await PushNotifications.addListener("registration", (token) => {
    resolveToken(token.value);
  });
  const errorHandle = await PushNotifications.addListener("registrationError", (error) => {
    rejectToken(new Error(error.error || "native_push_registration_failed"));
  });
  const timeoutId = setTimeout(() => {
    rejectToken(new Error("native_push_registration_timeout"));
  }, 15_000);

  try {
    await PushNotifications.register();
    return await registration;
  } finally {
    clearTimeout(timeoutId);
    await Promise.allSettled([tokenHandle.remove(), errorHandle.remove()]);
  }
}

/**
 * Solicita permissão no gesto explícito do usuário, obtém APNs/FCM token e
 * registra o dispositivo através de RPC self-scoped.
 */
export async function enableNativePush(): Promise<string> {
  if (!nativePushEnabled()) throw new Error("native_push_not_enabled");

  const platform = getRuntimePlatform();
  if (platform !== "android" && platform !== "ios") {
    throw new Error("native_push_unsupported_platform");
  }

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    throw new Error("native_push_permission_denied");
  }

  const token = await waitForRegistrationToken();
  const appInfo = await App.getInfo().catch(() => null);
  const { error } = await callRpc("register_my_native_push_device", {
    _platform: platform,
    _token: token,
    _app_version: appInfo?.version || null,
  });
  if (error) throw new Error(error.message || "native_push_device_registration_failed");

  return token;
}

export async function disableNativePush(): Promise<void> {
  if (!isNativePlatform()) return;

  const { error } = await callRpc("unregister_all_my_native_push_devices");
  if (error) throw new Error(error.message || "native_push_device_removal_failed");

  // Remove o registro do SO quando suportado. A remoção server-side acima é a
  // fonte de verdade mesmo se a API nativa falhar.
  await PushNotifications.unregister().catch(() => undefined);
}

/**
 * Push tap -> rota interna allowlisted. Nunca navega para URL arbitrária enviada
 * no payload da notificação.
 */
export async function startNativePushActionBridge(
  onInternalPath: (path: string) => void,
): Promise<() => Promise<void>> {
  if (!nativePushEnabled()) return async () => {};

  const handle = await PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action: ActionPerformed) => {
      const rawPath = action.notification.data?.link;
      if (typeof rawPath === "string" && isSafeInternalPath(rawPath)) {
        onInternalPath(rawPath);
      }
    },
  );

  return async () => handle.remove();
}
