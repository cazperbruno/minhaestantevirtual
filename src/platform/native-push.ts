import { App } from "@capacitor/app";
import {
  PushNotifications,
  type ActionPerformed,
  type PermissionStatus,
} from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { getRuntimePlatform, isNativePlatform } from "@/platform/runtime";
import { isSafeInternalPath } from "@/platform/urls";

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
  return new Promise<string>(async (resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tokenHandle = await PushNotifications.addListener("registration", (token) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      void tokenHandle.remove();
      void errorHandle.remove();
      resolve(token.value);
    });

    const errorHandle = await PushNotifications.addListener("registrationError", (error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      void tokenHandle.remove();
      void errorHandle.remove();
      reject(new Error(error.error || "native_push_registration_failed"));
    });

    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      void tokenHandle.remove();
      void errorHandle.remove();
      reject(new Error("native_push_registration_timeout"));
    }, 15_000);

    try {
      await PushNotifications.register();
    } catch (error) {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      void tokenHandle.remove();
      void errorHandle.remove();
      reject(error);
    }
  });
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
  const { error } = await supabase.rpc("register_my_native_push_device" as any, {
    _platform: platform,
    _token: token,
    _app_version: appInfo?.version || null,
  });
  if (error) throw error;

  return token;
}

export async function disableNativePush(): Promise<void> {
  if (!isNativePlatform()) return;

  const { error } = await supabase.rpc("unregister_all_my_native_push_devices" as any);
  if (error) throw error;

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
