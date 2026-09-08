import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * The bridge to "Share to ZenTask".
 *
 * Two ways a share arrives, and both have to work:
 *   - cold, when the app was not running and the share launched it, which the
 *     native side reads off the starting intent;
 *   - warm, when the app was already open, which arrives as an event.
 *
 * Nothing here files anything. A share becomes a pending review like every
 * other capture and waits for the same single tap.
 */

export type SharePayload = {
  text: string | null;
  imagePath: string | null;
};

type ShareTargetPlugin = {
  getShared(): Promise<SharePayload>;
  clear(): Promise<void>;
  addListener(
    eventName: "shareReceived",
    listener: (payload: SharePayload) => void,
  ): Promise<PluginListenerHandle>;
};

const ShareTarget = registerPlugin<ShareTargetPlugin>("ShareTarget");

export function isShareTargetAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export function hasSomethingShared(payload: SharePayload | undefined): boolean {
  return Boolean(payload && (payload.text || payload.imagePath));
}

/** Whatever is waiting, or nothing. Never throws — a share is best-effort. */
export async function takeShared(): Promise<SharePayload | undefined> {
  if (!isShareTargetAvailable()) return undefined;
  try {
    const payload = await ShareTarget.getShared();
    return hasSomethingShared(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}

/** Forget the share once it has become a review, so it is not offered twice. */
export async function clearShared(): Promise<void> {
  if (!isShareTargetAvailable()) return;
  try {
    await ShareTarget.clear();
  } catch {
    // Nothing to do: at worst the same share is offered again.
  }
}

export async function onShareReceived(
  handler: (payload: SharePayload) => void,
): Promise<PluginListenerHandle | undefined> {
  if (!isShareTargetAvailable()) return undefined;
  try {
    return await ShareTarget.addListener("shareReceived", handler);
  } catch {
    return undefined;
  }
}
