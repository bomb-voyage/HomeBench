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
  /** True floor area from the scanned outline (handles L-shaped rooms), including under cabinets. */
  floorAreaSqFt: number;
  /** Wall area with doors, windows and openings subtracted. */
  wallAreaSqFt: number;
  grossWallAreaSqFt: number;
  /** Approximate footprint of cabinets and built-ins. */
  cabinetAreaSqFt: number;
  wallCount: number;
  doorCount: number;
  windowCount: number;
  openingCount: number;
};

export type Measurement = { meters: number; feet: number; label: string };

export type ScanMode = "room" | "closet";

export type AppLockState = {
  enabled: boolean;
  /** False when the iPhone has no passcode set. */
  available: boolean;
  biometry: "faceID" | "touchID" | "opticID" | "passcode";
};

type HomebenchArPlugin = {
  getSupport(): Promise<{ measure: boolean; roomScan: boolean; lidar: boolean }>;
  scanRoom(options: { mode: ScanMode }): Promise<RoomScanResult>;
  measure(options: { instructions?: string }): Promise<{ measurements: Measurement[] }>;
  getAppLock(): Promise<AppLockState>;
  setAppLock(options: { enabled: boolean }): Promise<AppLockState>;
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

/**
 * Opens the native room scanner. "closet" mode tells the user to open the
 * closet door first. Resolves null if the user cancels.
 */
export async function scanRoomWithCamera(mode: ScanMode = "room"): Promise<RoomScanResult | null> {
  const box = await getPluginBox();
  if (!box) throw new Error("Room scanning is only available in the Homebench iPhone app.");
  try {
    return await box.plugin.scanRoom({ mode });
  } catch (error) {
    if (isCancel(error)) return null;
    throw error;
  }
}

/**
 * Opens the native AR tape measure, optionally with a banner telling the user
 * what to measure. Resolves null if the user cancels.
 */
export async function measureWithCamera(instructions?: string): Promise<Measurement[] | null> {
  const box = await getPluginBox();
  if (!box) throw new Error("Camera measuring is only available in the Homebench iPhone app.");
  try {
    const { measurements } = await box.plugin.measure(instructions ? { instructions } : {});
    return measurements;
  } catch (error) {
    if (isCancel(error)) return null;
    throw error;
  }
}

/**
 * Measures two sides (length, then width) and returns both plus the area.
 * Resolves null if the user cancels; throws if fewer than two sides were measured.
 */
export async function measureAreaWithCamera(): Promise<{
  lengthFt: number;
  widthFt: number;
  areaSqFt: number;
  label: string;
} | null> {
  const measurements = await measureWithCamera("Measure the length, then the width");
  if (!measurements) return null;
  if (measurements.length < 2) {
    throw new Error("Measure two sides (length, then width) to work out the area.");
  }
  const [length, width] = measurements.slice(-2) as [Measurement, Measurement];
  const lengthFt = Math.round(length.feet * 10) / 10;
  const widthFt = Math.round(width.feet * 10) / 10;
  return {
    lengthFt,
    widthFt,
    areaSqFt: Math.round(length.feet * width.feet),
    label: `${length.label} × ${width.label}`,
  };
}

/** Face ID app lock state, or null outside the app. */
export async function getAppLock(): Promise<AppLockState | null> {
  const box = await getPluginBox();
  if (!box) return null;
  try {
    return await box.plugin.getAppLock();
  } catch {
    // App build from before Face ID was added.
    return null;
  }
}

export async function setAppLock(enabled: boolean): Promise<AppLockState> {
  const box = await getPluginBox();
  if (!box) throw new Error("Face ID lock is only available in the Homebench iPhone app.");
  return box.plugin.setAppLock({ enabled });
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
