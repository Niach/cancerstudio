"use client";

interface HelixProps {
  size?: number;
  rungs?: number;
  hue?: number;
  reverse?: boolean;
  showBases?: boolean;
  speed?: number;
}

export default function Helix({
  size = 280,
  rungs = 24,
  hue = 152,
  reverse = false,
  showBases = true,
  speed = 22,
}: HelixProps) {
  const width = size;
  const height = size * 1.2;
  const radius = size * 0.18;
  const spacing = (height * 0.78) / rungs;
  const offsetY = -((rungs - 1) * spacing) / 2;

  const rungsArr = Array.from({ length: rungs }, (_, i) => {
    const t = i / Math.max(1, rungs - 1);
    const angle = t * Math.PI * 3.2;
    const y = offsetY + i * spacing;
    return { angle, y, i };
  });

  const beadColorA = `oklch(0.72 0.14 ${hue})`;
  const beadColorB = `oklch(0.68 0.1 ${(hue + 180) % 360})`;
  const barColor = `oklch(0.55 0.04 ${hue})`;

  return (
    <div className="cs-helix-wrap" style={{ width, height }}>
      <div
        className={`cs-helix-scene ${reverse ? "cs-helix-reverse" : ""}`}
        style={{ width, height, position: "relative", animationDuration: `${speed}s` }}
      >
        {rungsArr.map((r) => {
          const depthScale = 0.6 + 0.4 * ((Math.sin(r.angle) + 1) / 2);
          return (
            <div
              key={r.i}
              style={{
                position: "absolute",
                top: `calc(50% + ${r.y}px)`,
                left: "50%",
                width: radius * 2,
                height: 2,
                transformStyle: "preserve-3d",
                transform: `translate(-${radius}px, -1px) rotateY(${(r.angle * 180) / Math.PI}deg)`,
              }}
            >
              {showBases && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 4,
                    right: 4,
                    height: 2,
                    borderRadius: 2,
                    background: `linear-gradient(90deg, transparent, ${barColor} 25%, ${barColor} 75%, transparent)`,
                    opacity: 0.42 * depthScale,
                  }}
                />
              )}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  width: 12 * depthScale,
                  height: 12 * depthScale,
                  marginTop: -6 * depthScale,
                  marginLeft: -6 * depthScale,
                  borderRadius: 999,
                  background: `radial-gradient(circle at 30% 30%, color-mix(in oklch, ${beadColorA} 70%, white), ${beadColorA})`,
                  boxShadow: `0 0 ${14 * depthScale}px 0 color-mix(in oklch, ${beadColorA} 60%, transparent)`,
                  opacity: 0.55 + 0.45 * depthScale,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "50%",
                  width: 12 * depthScale,
                  height: 12 * depthScale,
                  marginTop: -6 * depthScale,
                  marginRight: -6 * depthScale,
                  borderRadius: 999,
                  background: `radial-gradient(circle at 30% 30%, color-mix(in oklch, ${beadColorB} 70%, white), ${beadColorB})`,
                  boxShadow: `0 0 ${14 * depthScale}px 0 color-mix(in oklch, ${beadColorB} 60%, transparent)`,
                  opacity: 0.55 + 0.45 * depthScale,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
