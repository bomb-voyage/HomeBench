// Bridge to the native camera features in the Homebench iOS app
// (ios/App/App/HomebenchARPlugin.swift). On the website these report "not
// supported", so callers can render the camera buttons only inside the app.
import { useEffect, useState } from "react";

export type NativeArSupport = {
  /** Running inside the Homebench iOS app. */
  isNativeApp: boolean;
  /** Point-to-point AR tape measure (any ARKit iPhone). */
  measure: boolean;
  /** Whole-room scan via RoomPlan (LiDAR iPhones only). */
  roomScan: boolean;
  lidar: boolean;
};

export type RoomScanResult = {
  lengthFt: number;
  widthFt: number;
  ceilingHeightFt: number;
  wallCount: number;
  doorCount: number;
  windowCount: number;
  openingCount: number;
};

export type Measurement = { meters: number; feet: number; label: string };

type HomebenchArPlugin = {
  getSupport(): Promise<{ measure: boolean; roomScan: boolean; lidar: boolean }>;
  scanRoom(): Promise<RoomScanResult>;
  measure(): Promise<{ measurements: Measurement[] }>;
};

const NO_SUPPORT: NativeArSupport = {
  isNativeApp: false,
  measure: false,
  roomScan: false,
  lidar: false,
};

// Capacitor plugin objects are proxies that answer every property, including
// `then`. Resolving a promise with one makes JS treat it as a thenable and call
// a native method named "then", which fails. So the plugin travels in a box.
type PluginBox = { plugin: HomebenchArPlugin } | null;

let pluginBoxPromise: Promise<PluginBox> | null = null;

function getPluginBox(): Promise<PluginBox> {
  if (typeof window === "undefined") return Promise.resolve(null);
  pluginBoxPromise ??= import("@capacitor/core")
    .then(({ Capacitor, registerPlugin }): PluginBox =>
      Capacitor.getPlatform() === "ios"
        ? { plugin: registerPlugin<HomebenchArPlugin>("HomebenchAR") }
        : null,
    )
    .catch((): PluginBox => null);
  return pluginBoxPromise;
}

function isCancel(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "CANCELLED"
  );
}

export async function getNativeArSupport(): Promise<NativeArSupport> {
  const box = await getPluginBox();
  if (!box) return NO_SUPPORT;
  try {
    const support = await box.plugin.getSupport();
    return { isNativeApp: true, ...support };
  } catch {
    // App build without the plugin (older version still installed).
    return { ...NO_SUPPORT, isNativeApp: true };
  }
}

/** Opens the native room scanner. Resolves null if the user cancels. */
export async function scanRoomWithCamera(): Promise<RoomScanResult | null> {
  const box = await getPluginBox();
  if (!box) throw new Error("Room scanning is only available in the Homebench iPhone app.");
  try {
    return await box.plugin.scanRoom();
  } catch (error) {
    if (isCancel(error)) return null;
    throw error;
  }
}

/** Opens the native AR tape measure. Resolves null if the user cancels. */
export async function measureWithCamera(): Promise<Measurement[] | null> {
  const box = await getPluginBox();
  if (!box) throw new Error("Camera measuring is only available in the Homebench iPhone app.");
  try {
    const { measurements } = await box.plugin.measure();
    return measurements;
  } catch (error) {
    if (isCancel(error)) return null;
    throw error;
  }
}

/** Client-only support check; always NO_SUPPORT during server render. */
export function useNativeArSupport(): NativeArSupport {
  const [support, setSupport] = useState<NativeArSupport>(NO_SUPPORT);
  useEffect(() => {
    let active = true;
    void getNativeArSupport().then((result) => {
      if (active) setSupport(result);
    });
    return () => {
      active = false;
    };
  }, []);
  return support;
}
