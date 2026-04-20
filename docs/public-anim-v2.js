/* cancerstudio public landing animations */
(function () {
  if (typeof gsap === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);

  const LETTERS = ["A", "C", "G", "T"];
  const COLORS = {
    A: "#ef4444",
    C: "#3b82f6",
    G: "#10b981",
    T: "#f59e0b",
  };
  const rand = (min, max) => Math.random() * (max - min) + min;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ───────────────────────────────────────────────────────────
     HERO — soft ACGT rain (light palette)
     ─────────────────────────────────────────────────────────── */
  const rain = document.getElementById("heroRain");
  const rainLetters = [];
  if (rain) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const COUNT = Math.floor((W * H) / 22000);
    for (let i = 0; i < COUNT; i++) {
      const s = document.createElement("span");
      const letter = pick(LETTERS);
      s.textContent = letter;
      s.style.color = COLORS[letter];
      const sz = rand(14, 38);
      s.style.fontSize = `${sz}px`;
      s.style.left = `${rand(-5, 105)}%`;
      s.style.top = `${rand(-10, 110)}%`;
      s.style.opacity = rand(0.25, 0.7);
      rain.appendChild(s);
      rainLetters.push({ el: s, sz });
    }

    // Gentle drift
    rainLetters.forEach(({ el }) => {
      gsap.to(el, {
        y: `+=${rand(-40, 40)}`,
        x: `+=${rand(-40, 40)}`,
        rotation: rand(-8, 8),
        duration: rand(4, 9),
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    });

    // Entrance cascade
    gsap.from(
      rainLetters.map((l) => l.el),
      {
        opacity: 0,
        y: -60,
        duration: 1.2,
        stagger: { amount: 1.1, from: "random" },
        ease: "power2.out",
      }
    );

    // Parallax on scroll
    gsap.to(rain, {
      scrollTrigger: {
        trigger: ".hero",
        start: "top top",
        end: "bottom top",
        scrub: 1,
      },
      y: 160,
      opacity: 0.2,
    });
  }

  /* ───────────────────────────────────────────────────────────
     HERO headline reveal
     ─────────────────────────────────────────────────────────── */
  gsap.set("#heroHeadline .line1, #heroHeadline .line2", { yPercent: 60, opacity: 0 });
  gsap.set("#heroSub, #heroCta, .hero-meta, .hero-eyebrow", { y: 18, opacity: 0 });

  const heroTl = gsap.timeline({ delay: 0.2, defaults: { ease: "power4.out" } });
  heroTl
    .to(".hero-eyebrow", { y: 0, opacity: 1, duration: 0.7 }, 0)
    .to("#heroHeadline .line1", { yPercent: 0, opacity: 1, duration: 1.0 }, 0.15)
    .to("#heroHeadline .line2", { yPercent: 0, opacity: 1, duration: 1.0 }, 0.30)
    .to("#heroSub", { y: 0, opacity: 1, duration: 0.8 }, 0.55)
    .to("#heroCta", { y: 0, opacity: 1, duration: 0.8 }, 0.70)
    .to(".hero-meta", { y: 0, opacity: 1, duration: 0.8 }, 0.85);

  /* ───────────────────────────────────────────────────────────
     STEP VISUALS — Sample / Compute / Cure
     ─────────────────────────────────────────────────────────── */
  document.querySelectorAll(".step-viz").forEach((el) => {
    const kind = el.dataset.viz;
    if (kind === "sample") buildSample(el);
    else if (kind === "compute") buildCompute(el);
    else if (kind === "cure") buildCure(el);
  });

  function buildSample(el) {
    // FASTQ-style letter rain falling
    const W = 340;
    const H = 160;
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    el.appendChild(svg);

    const fallers = [];
    for (let i = 0; i < 22; i++) {
      const t = document.createElementNS(svgNS, "text");
      const ch = pick(LETTERS);
      t.textContent = ch;
      t.setAttribute("x", rand(15, W - 15));
      t.setAttribute("y", rand(-20, 40));
      t.setAttribute("fill", COLORS[ch]);
      t.setAttribute("font-family", "JetBrains Mono, monospace");
      t.setAttribute("font-weight", "700");
      t.setAttribute("font-size", rand(12, 20));
      t.setAttribute("opacity", rand(0.3, 0.85));
      svg.appendChild(t);
      fallers.push(t);
    }
    gsap.to(fallers, {
      y: "+=140",
      duration: 1.8,
      ease: "bounce.out",
      stagger: 0.06,
      repeat: -1,
      repeatDelay: 1.2,
      onRepeat: () => {
        fallers.forEach((t) => gsap.set(t, { y: 0 }));
      },
    });
  }

  function buildCompute(el) {
    // horizontal pipeline: 8 dots lighting up in sequence
    const W = 340;
    const H = 160;
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    el.appendChild(svg);

    const ln = document.createElementNS(svgNS, "line");
    ln.setAttribute("x1", 30);
    ln.setAttribute("x2", W - 30);
    ln.setAttribute("y1", H / 2);
    ln.setAttribute("y2", H / 2);
    ln.setAttribute("stroke", "#3b82f6");
    ln.setAttribute("stroke-width", "1.5");
    ln.setAttribute("stroke-dasharray", "3 4");
    ln.setAttribute("opacity", "0.6");
    svg.appendChild(ln);

    const dots = [];
    for (let i = 0; i < 8; i++) {
      const c = document.createElementNS(svgNS, "circle");
      const x = 30 + (i * (W - 60)) / 7;
      c.setAttribute("cx", x);
      c.setAttribute("cy", H / 2);
      c.setAttribute("r", 7);
      c.setAttribute("fill", "#3b82f6");
      c.setAttribute("opacity", "0.25");
      svg.appendChild(c);
      dots.push(c);
    }
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
    dots.forEach((d, i) => {
      tl.to(d, { attr: { r: 11, opacity: 1 }, duration: 0.22, ease: "power2.out" }, i * 0.16)
        .to(d, { attr: { r: 7, opacity: 0.35 }, duration: 0.5, ease: "power2.in" }, i * 0.16 + 0.22);
    });
  }

  function buildCure(el) {
    // a simple vial icon with glow
    const W = 340;
    const H = 160;
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    el.appendChild(svg);

    const cx = W / 2;
    const vialW = 40;
    const vialH = 90;
    const cy = H / 2;

    // glow
    const glow = document.createElementNS(svgNS, "circle");
    glow.setAttribute("cx", cx);
    glow.setAttribute("cy", cy);
    glow.setAttribute("r", 60);
    glow.setAttribute("fill", "#10b981");
    glow.setAttribute("opacity", "0.15");
    svg.appendChild(glow);
    gsap.to(glow, { attr: { r: 75 }, opacity: 0.08, duration: 2, yoyo: true, repeat: -1, ease: "sine.inOut" });

    // cap
    const cap = document.createElementNS(svgNS, "rect");
    cap.setAttribute("x", cx - vialW / 2 - 3);
    cap.setAttribute("y", cy - vialH / 2 - 8);
    cap.setAttribute("width", vialW + 6);
    cap.setAttribute("height", 12);
    cap.setAttribute("rx", 2);
    cap.setAttribute("fill", "#0f1214");
    svg.appendChild(cap);

    // body
    const body = document.createElementNS(svgNS, "rect");
    body.setAttribute("x", cx - vialW / 2);
    body.setAttribute("y", cy - vialH / 2 + 4);
    body.setAttribute("width", vialW);
    body.setAttribute("height", vialH);
    body.setAttribute("rx", 6);
    body.setAttribute("fill", "#fff");
    body.setAttribute("stroke", "#0f1214");
    body.setAttribute("stroke-width", "1.5");
    svg.appendChild(body);

    // liquid
    const liq = document.createElementNS(svgNS, "rect");
    liq.setAttribute("x", cx - vialW / 2 + 3);
    liq.setAttribute("y", cy + vialH / 2 - 40);
    liq.setAttribute("width", vialW - 6);
    liq.setAttribute("height", 37);
    liq.setAttribute("rx", 4);
    liq.setAttribute("fill", "#10b981");
    liq.setAttribute("opacity", 0.85);
    svg.appendChild(liq);

    // bubbles
    for (let i = 0; i < 4; i++) {
      const b = document.createElementNS(svgNS, "circle");
      b.setAttribute("cx", cx + rand(-vialW / 2 + 6, vialW / 2 - 6));
      b.setAttribute("cy", cy + vialH / 2 - 10);
      b.setAttribute("r", rand(1.5, 3));
      b.setAttribute("fill", "#fff");
      b.setAttribute("opacity", 0.8);
      svg.appendChild(b);
      gsap.to(b, {
        attr: { cy: cy + vialH / 2 - 36 },
        opacity: 0,
        duration: rand(1.4, 2.2),
        repeat: -1,
        delay: rand(0, 1.5),
        ease: "sine.out",
      });
    }
  }

  /* ───────────────────────────────────────────────────────────
     PIPELINE — horizontal scroll of 8 stage cards
     ─────────────────────────────────────────────────────────── */
  const STAGES = [
    { n: "01", t: "Sequence",   d: "FASTQ in. Match tumor vs normal.",   color: "A", emoji: "SEQ" },
    { n: "02", t: "Map",        d: "Align to the reference genome.",     color: "C", emoji: "MAP" },
    { n: "03", t: "Call",       d: "Find the mutations the tumor made.", color: "G", emoji: "SNV" },
    { n: "04", t: "Type",       d: "Phase each patient's MHC alleles.",  color: "T", emoji: "HLA" },
    { n: "05", t: "Predict",    d: "Score every neoantigen.",            color: "A", emoji: "NET" },
    { n: "06", t: "Rank",       d: "Pick the best-covered epitopes.",    color: "C", emoji: "TOP" },
    { n: "07", t: "Design",     d: "Assemble the mRNA construct.",       color: "G", emoji: "mRNA" },
    { n: "08", t: "Deliver",    d: "One FASTA to the manufacturer.",     color: "T", emoji: "FA" },
  ];

  const nodesG = document.getElementById("pipelineNodes");
  const list = document.getElementById("pipelineList");
  if (nodesG && list) {
    const W = 1200;
    const cx0 = 80, cxN = 1120;
    const y = 110;
    const svgNS = "http://www.w3.org/2000/svg";

    STAGES.forEach((s, i) => {
      const cx = cx0 + (i * (cxN - cx0)) / 7;
      const color = COLORS[s.color];

      // outer soft halo
      const halo = document.createElementNS(svgNS, "circle");
      halo.setAttribute("cx", cx);
      halo.setAttribute("cy", y);
      halo.setAttribute("r", 32);
      halo.setAttribute("fill", color);
      halo.setAttribute("opacity", "0.12");
      nodesG.appendChild(halo);

      // inner solid
      const dot = document.createElementNS(svgNS, "circle");
      dot.setAttribute("cx", cx);
      dot.setAttribute("cy", y);
      dot.setAttribute("r", 20);
      dot.setAttribute("fill", "#fff");
      dot.setAttribute("stroke", color);
      dot.setAttribute("stroke-width", "2");
      nodesG.appendChild(dot);

      // letter inside
      const txt = document.createElementNS(svgNS, "text");
      txt.setAttribute("x", cx);
      txt.setAttribute("y", y + 6);
      txt.setAttribute("text-anchor", "middle");
      txt.setAttribute("fill", color);
      txt.setAttribute("font-family", "JetBrains Mono, monospace");
      txt.setAttribute("font-weight", "800");
      txt.setAttribute("font-size", "16");
      txt.textContent = s.color;
      nodesG.appendChild(txt);

      // stage number above
      const num = document.createElementNS(svgNS, "text");
      num.setAttribute("x", cx);
      num.setAttribute("y", y - 48);
      num.setAttribute("text-anchor", "middle");
      num.setAttribute("fill", "#0f1214");
      num.setAttribute("font-family", "JetBrains Mono, monospace");
      num.setAttribute("font-weight", "700");
      num.setAttribute("font-size", "11");
      num.setAttribute("letter-spacing", "1.5");
      num.textContent = s.n;
      nodesG.appendChild(num);

      // stage name below
      const name = document.createElementNS(svgNS, "text");
      name.setAttribute("x", cx);
      name.setAttribute("y", y + 60);
      name.setAttribute("text-anchor", "middle");
      name.setAttribute("fill", "#0f1214");
      name.setAttribute("font-family", "Instrument Serif, serif");
      name.setAttribute("font-size", "20");
      name.textContent = s.t;
      nodesG.appendChild(name);

      // pulse animation
      gsap.to(halo, {
        attr: { r: 38 },
        opacity: 0.05,
        duration: 1.6,
        repeat: -1,
        yoyo: true,
        delay: i * 0.18,
        ease: "sine.inOut",
      });

      // list entry
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="pl-num" style="color:${color};">${s.n}</div>
        <div class="pl-name">${s.t}</div>
        <div class="pl-desc">${s.d}</div>
      `;
      list.appendChild(li);
    });

    // entrance: nodes draw in
    gsap.from("#pipelineNodes circle, #pipelineNodes text", {
      scrollTrigger: { trigger: "#pipelineDiagram", start: "top 80%", toggleActions: "play none none reverse" },
      opacity: 0,
      y: 10,
      duration: 0.6,
      stagger: 0.05,
      ease: "power2.out",
    });
    gsap.from("#pipelineList li", {
      scrollTrigger: { trigger: "#pipelineList", start: "top 85%", toggleActions: "play none none reverse" },
      opacity: 0,
      y: 18,
      duration: 0.5,
      stagger: 0.05,
      ease: "power2.out",
    });
  }

  /* ───────────────────────────────────────────────────────────
     CTA section — soft ACGT letters in background
     ─────────────────────────────────────────────────────────── */
  const ctaLetters = document.getElementById("ctaLetters");
  if (ctaLetters) {
    for (let i = 0; i < 28; i++) {
      const s = document.createElement("span");
      const ch = pick(LETTERS);
      s.textContent = ch;
      s.style.cssText = `
        position:absolute;
        left:${rand(0,100)}%; top:${rand(0,100)}%;
        color:${COLORS[ch]};
        font-family:'JetBrains Mono',monospace;
        font-weight:800;
        font-size:${rand(14,40)}px;
        opacity:${rand(0.3,0.7)};
      `;
      ctaLetters.appendChild(s);
      gsap.to(s, {
        y: `+=${rand(-30,30)}`,
        x: `+=${rand(-30,30)}`,
        duration: rand(4,8),
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }
  }

  /* ───────────────────────────────────────────────────────────
     Fade-in on scroll for blocks
     ─────────────────────────────────────────────────────────── */
  gsap.utils.toArray("section.block .section-label, section.block h2.big").forEach((el) => {
    gsap.from(el, {
      scrollTrigger: { trigger: el, start: "top 85%", toggleActions: "play none none reverse" },
      y: 30,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
    });
  });

  gsap.utils.toArray(".step").forEach((el, i) => {
    gsap.from(el, {
      scrollTrigger: { trigger: el, start: "top 85%", toggleActions: "play none none reverse" },
      y: 40,
      opacity: 0,
      duration: 0.7,
      delay: i * 0.1,
      ease: "power3.out",
    });
  });

  gsap.from(".docker-block", {
    scrollTrigger: { trigger: ".docker-block", start: "top 80%", toggleActions: "play none none reverse" },
    y: 40,
    opacity: 0,
    duration: 0.9,
    ease: "power3.out",
  });

  gsap.from(".cta-row", {
    scrollTrigger: { trigger: ".cta-row", start: "top 85%", toggleActions: "play none none reverse" },
    y: 30,
    opacity: 0,
    duration: 0.8,
    ease: "power3.out",
  });
})();
