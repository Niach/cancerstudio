"use client";

import { useMemo } from "react";

function HeroRain() {
  const letters = useMemo(() => {
    let s = 7;
    const rng = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const bases: Array<"A" | "C" | "G" | "T"> = ["A", "C", "G", "T"];
    const colorFor: Record<string, string> = { A: "var(--a)", C: "var(--c)", G: "var(--g)", T: "var(--t)" };
    const out: Array<{ b: string; top: number; left: number; size: number; rot: number; op: number; color: string }> = [];
    for (let i = 0; i < 22; i++) {
      const b = bases[i % 4];
      out.push({
        b,
        top: rng() * 100,
        left: rng() * 100,
        size: 40 + rng() * 90,
        rot: (rng() - 0.5) * 26,
        op: 0.06 + rng() * 0.1,
        color: colorFor[b],
      });
    }
    return out;
  }, []);
  return (
    <div className="hero-rain">
      {letters.map((l, i) => (
        <span
          key={i}
          style={{
            top: l.top + "%",
            left: l.left + "%",
            fontSize: l.size + "px",
            transform: `rotate(${l.rot}deg)`,
            opacity: l.op,
            color: l.color,
          }}
        >
          {l.b}
        </span>
      ))}
    </div>
  );
}

export default function Hero() {
  const scrollToShowcase = () => {
    const el = document.getElementById("app-showcase");
    if (el) {
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - 20,
        behavior: "smooth",
      });
    }
  };
  return (
    <section className="hero">
      <HeroRain />
      <div className="hero-inner">
        <h1>
          <span className="line">
            <span className="red">Design</span> your own mRNA
          </span>
          <span className="line">
            cancer <span className="highlight">vaccine.</span>
          </span>
        </h1>
        <p className="hero-sub">
          An open studio for personalized mRNA cancer vaccines.
          Sequence the tumor, run the studio on <em>your</em> machine,
          hand the design to a manufacturer — for dogs, cats, and humans.
        </p>
        <div className="hero-cta-row">
          <a className="btn-primary" href="https://github.com/niach/mutavax" target="_blank" rel="noreferrer">
            Get started on GitHub
            <span className="arrow">→</span>
          </a>
          <button className="btn-ghost" type="button" onClick={scrollToShowcase}>
            See the app
          </button>
        </div>
      </div>
    </section>
  );
}
