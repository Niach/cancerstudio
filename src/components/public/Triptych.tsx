const ITEMS = [
  {
    k: "A" as const, num: "01", word: "Sample", sub: "Sequence the tumor.",
    body: "A biopsy plus a matched healthy sample. Two sequencing files from any veterinary lab.",
  },
  {
    k: "C" as const, num: "02", word: "Compute", sub: "Find the mutations.",
    body: "Eight pipeline stages compare tumor against healthy and design the vaccine. ~12 hours on your workstation.",
  },
  {
    k: "G" as const, num: "03", word: "Design", sub: "Make the vaccine.",
    body: "One finished design, sent to a GMP partner. A personalized mRNA vial arrives within ten days.",
  },
];

export default function Triptych() {
  return (
    <section className="block paper" id="three">
      <div className="inner">
        <ol className="triptych">
          {ITEMS.map(it => (
            <li key={it.k} className={"trip trip-" + it.k.toLowerCase()}>
              <div className="trip-rule" />
              <div className="trip-num">{it.num}</div>
              <div className="trip-body">
                <div className="trip-word">{it.word}<span className="trip-dot">.</span></div>
                <h3 className="trip-sub">{it.sub}</h3>
                <p>{it.body}</p>
              </div>
              <div className={"trip-letter letter-" + it.k.toLowerCase()}>{it.k}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
