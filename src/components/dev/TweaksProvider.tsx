"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type VisualDirection = "paper" | "console" | "clinical";

export interface Tweaks {
  visualDirection: VisualDirection;
  accentHue: number;
  helixDensity: number;
  expertMode: boolean;
}

export const DEFAULT_TWEAKS: Tweaks = {
  visualDirection: "paper",
  accentHue: 152,
  helixDensity: 24,
  expertMode: false,
};

const STORAGE_KEY = "cs_tweaks";

interface TweaksContextValue {
  tweaks: Tweaks;
  setTweaks: (patch: Partial<Tweaks>) => void;
  panelVisible: boolean;
  setPanelVisible: (visible: boolean) => void;
}

const TweaksContext = createContext<TweaksContextValue | null>(null);

export function useTweaks() {
  const ctx = useContext(TweaksContext);
  if (!ctx) {
    throw new Error("useTweaks must be used inside <TweaksProvider>");
  }
  return ctx;
}

function readStoredTweaks(): Tweaks {
  if (typeof window === "undefined") return DEFAULT_TWEAKS;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_TWEAKS;
    const parsed = JSON.parse(stored) as Partial<Tweaks>;
    return { ...DEFAULT_TWEAKS, ...parsed };
  } catch {
    return DEFAULT_TWEAKS;
  }
}

export function TweaksProvider({ children }: { children: React.ReactNode }) {
  const [tweaks, setTweaksState] = useState<Tweaks>(readStoredTweaks);
  const [panelVisible, setPanelVisible] = useState(false);

  const setTweaks = useCallback((patch: Partial<Tweaks>) => {
    setTweaksState((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", tweaks.visualDirection);
    const h = tweaks.accentHue;
    root.style.setProperty("--accent", `oklch(0.55 0.12 ${h})`);
    root.style.setProperty("--accent-soft", `oklch(0.94 0.04 ${h})`);
    root.style.setProperty("--accent-ink", `oklch(0.3 0.1 ${h})`);
  }, [tweaks.visualDirection, tweaks.accentHue]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.key === "D" &&
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey
      ) {
        event.preventDefault();
        setPanelVisible((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(
    () => ({ tweaks, setTweaks, panelVisible, setPanelVisible }),
    [tweaks, setTweaks, panelVisible]
  );

  return <TweaksContext.Provider value={value}>{children}</TweaksContext.Provider>;
}
