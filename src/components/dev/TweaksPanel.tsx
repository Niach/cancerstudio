"use client";

import { useTweaks, type VisualDirection } from "./TweaksProvider";

const DIRECTIONS: VisualDirection[] = ["paper", "console", "clinical"];

export default function TweaksPanel() {
  const { tweaks, setTweaks, panelVisible, setPanelVisible } = useTweaks();

  if (!panelVisible) return null;

  return (
    <div className="cs-tweaks-panel" role="dialog" aria-label="Design tweaks">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <h4>⚙ Tweaks</h4>
        <button
          type="button"
          onClick={() => setPanelVisible(false)}
          aria-label="Close tweaks panel"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--muted)",
            cursor: "pointer",
            fontSize: 14,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>

      <div className="cs-tweak-row">
        <label>Visual direction</label>
        <div className="cs-tweak-seg">
          {DIRECTIONS.map((v) => (
            <button
              key={v}
              type="button"
              className={tweaks.visualDirection === v ? "is-on" : ""}
              onClick={() => setTweaks({ visualDirection: v })}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="cs-tweak-row">
        <label>Accent hue · {tweaks.accentHue}°</label>
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          className="cs-tweak-range"
          value={tweaks.accentHue}
          onChange={(e) => setTweaks({ accentHue: parseInt(e.target.value, 10) })}
        />
      </div>

      <div className="cs-tweak-row">
        <label>Helix density · {tweaks.helixDensity} rungs</label>
        <input
          type="range"
          min={10}
          max={40}
          step={1}
          className="cs-tweak-range"
          value={tweaks.helixDensity}
          onChange={(e) => setTweaks({ helixDensity: parseInt(e.target.value, 10) })}
        />
      </div>

      <label className="cs-tweak-toggle" style={{ marginTop: 4 }}>
        <input
          type="checkbox"
          checked={tweaks.expertMode}
          onChange={(e) => setTweaks({ expertMode: e.target.checked })}
        />
        Expert mode (raw command tails)
      </label>

      <div
        className="cs-tiny"
        style={{ marginTop: 10, fontSize: 11, color: "var(--muted-2)" }}
      >
        Toggle with <kbd>⌃⇧D</kbd>
      </div>
    </div>
  );
}
