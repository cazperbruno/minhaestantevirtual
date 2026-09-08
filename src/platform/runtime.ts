import { Capacitor } from "@capacitor/core";

export type ReadifyPlatform = "web" | "android" | "ios";

/** Fonte única de verdade para decisões de plataforma. */
export function getRuntimePlatform(): ReadifyPlatform {
  const platform = Capacitor.getPlatform();
  if (platform === "android" || platform === "ios") return platform;
  return "web";
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isWebPlatform(): boolean {
  return !isNativePlatform();
}

export function isAndroidPlatform(): boolean {
  return getRuntimePlatform() === "android";
}

export function isIOSPlatform(): boolean {
  return getRuntimePlatform() === "ios";
}

/**
 * Preview Lovable não representa runtime de produção e não deve registrar
 * recursos persistentes do dispositivo, como Web Push/PWA.
 */
export function isPreviewRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host.includes("id-preview--") || host.includes("lovableproject.com");
}

export interface RuntimeCapabilities {
  platform: ReadifyPlatform;
  native: boolean;
  webPush: boolean;
  serviceWorker: boolean;
  cameraWeb: boolean;
  shareWeb: boolean;
}

export function getRuntimeCapabilities(): RuntimeCapabilities {
  const native = isNativePlatform();
  const hasWindow = typeof window !== "undefined";
  const hasNavigator = typeof navigator !== "undefined";

  return {
    platform: getRuntimePlatform(),
    native,
    webPush:
      !native &&
      hasWindow &&
      hasNavigator &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window &&
      !isPreviewRuntime(),
    serviceWorker: !native && hasNavigator && "serviceWorker" in navigator,
    cameraWeb:
      hasNavigator &&
      !!navigator.mediaDevices?.getUserMedia,
    shareWeb: hasNavigator && typeof navigator.share === "function",
  };
}
