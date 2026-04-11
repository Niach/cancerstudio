export interface DesktopSelectedFile {
  path: string;
  name: string;
  sizeBytes: number;
  modifiedAtMs: number;
}

export interface DesktopBridge {
  pickSequencingFiles: () => Promise<DesktopSelectedFile[]>;
  openPath: (targetPath: string) => Promise<void>;
  getAppDataPath: () => Promise<string>;
}

declare global {
  interface Window {
    cancerstudioDesktop?: DesktopBridge;
  }
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.cancerstudioDesktop ?? null;
}

export function isDesktopRuntime() {
  return getDesktopBridge() !== null;
}
