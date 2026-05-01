"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ago, type CatalogGenome } from "@/lib/public-catalog";

function DogGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="9" r="1.7" />
      <circle cx="9.5" cy="6" r="1.7" />
      <circle cx="14.5" cy="6" r="1.7" />
      <circle cx="19" cy="9" r="1.7" />
      <path d="M7.5 15.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5c0 2-1.5 3-3 3-0.7 0-1-0.3-1.5-0.3s-0.8 0.3-1.5 0.3c-1.5 0-3-1-3-3z" />
    </svg>
  );
}

function CatGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4l2.5 4.5" />
      <path d="M19 4l-2.5 4.5" />
      <path d="M6 9c0-2 2-4 6-4s6 2 6 4v7c0 2-2.5 3.5-6 3.5s-6-1.5-6-3.5V9z" />
      <path d="M10 11.5v0.5" />
      <path d="M14 11.5v0.5" />
      <path d="M11 15l1 1 1-1" />
    </svg>
  );
}

type SortKey = "recent" | "coverage" | "breed";

export default function Browse({ catalog }: { catalog: CatalogGenome[] }) {
  const [q, setQ] = useState("");
  const [species, setSpecies] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<Set<string>>(new Set());
  const [lic, setLic] = useState<Set<string>>(new Set());
  const [minCov, setMinCov] = useState(0);
  const [sort, setSort] = useState<SortKey>("recent");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount =
    species.size + groups.size + method.size + lic.size + (minCov > 0 ? 1 : 0);

  const allGroups = useMemo(() => Array.from(new Set(catalog.map(g => g.breedGroup))).sort(), [catalog]);
  const allMethods = useMemo(() => Array.from(new Set(catalog.map(g => g.method.type))), [catalog]);
  const allLic = useMemo(() => Array.from(new Set(catalog.map(g => g.license.id))), [catalog]);

  const filtered = useMemo(() => {
    const out = catalog.filter(g => {
      if (species.size && !species.has(g.species)) return false;
      if (groups.size && !groups.has(g.breedGroup)) return false;
      if (method.size && !method.has(g.method.type)) return false;
      if (lic.size && !lic.has(g.license.id)) return false;
      if (g.coverage < minCov) return false;
      if (q) {
        const s = (g.id + g.name + g.breed + g.lab.name + g.coat).toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    if (sort === "recent") out.sort((a, b) => a.addedDays - b.addedDays);
    if (sort === "coverage") out.sort((a, b) => b.coverage - a.coverage);
    if (sort === "breed") out.sort((a, b) => a.breed.localeCompare(b.breed));
    return out;
  }, [catalog, species, groups, method, lic, minCov, q, sort]);

  const toggleIn = <T,>(set: Set<T>, setter: (s: Set<T>) => void) => (v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setter(n);
  };
  const countBy = (fn: (g: CatalogGenome) => boolean) => catalog.filter(fn).length;

  return (
    <div className="browse-wrap">
      <div className="browse-head">
        <div className="section-label">Open archive</div>
        <h1>
          The <em>reference</em> genomes.
        </h1>
        <p>
          Healthy dog and cat whole genomes, contributed by partner labs. Filter by species,
          breed, sequencing method, license, and coverage. Click any row for files, metadata,
          and download.
        </p>
      </div>

      <div className="showcase-note" role="note">
        <strong>Showcase only.</strong> The archive is not yet seeded — the entries below are
        demo fixtures to illustrate the metadata, filtering, and download flow. No real genomes
        are hosted here yet. If you run a veterinary lab and want to contribute the first real
        healthy-pet genomes, <a href="mailto:dennis@straehhuber.com?subject=mutavax%20archive%20contribution">reach out</a>.
      </div>

      <button
        type="button"
        className="rail-toggle"
        aria-expanded={filtersOpen}
        aria-controls="archive-rail"
        onClick={() => setFiltersOpen(o => !o)}
      >
        {filtersOpen ? "Hide filters" : "Show filters"}
        {activeFilterCount > 0 && <span className="rail-toggle-badge">{activeFilterCount}</span>}
        <span className="rail-toggle-chev" aria-hidden="true">{filtersOpen ? "▲" : "▼"}</span>
      </button>

      <div className="catalog-grid">
        <aside id="archive-rail" className={"rail" + (filtersOpen ? " open" : "")}>
          <div className="group">
            <h4>Species</h4>
            {[
              { k: "dog", l: "Dogs", c: countBy(g => g.species === "dog") },
              { k: "cat", l: "Cats", c: countBy(g => g.species === "cat") },
            ].map(o => (
              <label className="fchk" key={o.k}>
                <span className="fchk-inner">
                  <input type="checkbox" checked={species.has(o.k)} onChange={() => toggleIn(species, setSpecies)(o.k)} />
                  {o.l}
                </span>
                <span className="count">{o.c}</span>
              </label>
            ))}
          </div>

          <div className="group">
            <h4>Breed group</h4>
            {allGroups.map(g => (
              <label className="fchk" key={g}>
                <span className="fchk-inner">
                  <input type="checkbox" checked={groups.has(g)} onChange={() => toggleIn(groups, setGroups)(g)} />
                  {g}
                </span>
                <span className="count">{countBy(x => x.breedGroup === g)}</span>
              </label>
            ))}
          </div>

          <div className="group">
            <h4>Sequencing</h4>
            {allMethods.map(m => (
              <label className="fchk" key={m}>
                <span className="fchk-inner">
                  <input type="checkbox" checked={method.has(m)} onChange={() => toggleIn(method, setMethod)(m)} />
                  {m}
                </span>
                <span className="count">{countBy(x => x.method.type === m)}</span>
              </label>
            ))}
          </div>

          <div className="group">
            <h4>License</h4>
            {allLic.map(id => (
              <label className="fchk" key={id}>
                <span className="fchk-inner">
                  <input type="checkbox" checked={lic.has(id)} onChange={() => toggleIn(lic, setLic)(id)} />
                  {id.toUpperCase()}
                </span>
                <span className="count">{countBy(x => x.license.id === id)}</span>
              </label>
            ))}
          </div>

          <div className="group">
            <h4>Coverage ≥ {minCov}×</h4>
            <input
              type="range"
              min={0}
              max={60}
              step={5}
              value={minCov}
              onChange={e => setMinCov(+e.target.value)}
              style={{ width: "100%", accentColor: "var(--g)" }}
            />
          </div>
        </aside>

        <div>
          <div className="search-row">
            <input
              type="text"
              placeholder="Search by name, breed, ID, lab…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)}>
              <option value="recent">Sort · Recent</option>
              <option value="coverage">Sort · Coverage</option>
              <option value="breed">Sort · Breed A–Z</option>
            </select>
          </div>
          <div className="count-line">
            Showing {filtered.length} of {catalog.length} genomes
          </div>

          <div className="row-head">
            <div></div>
            <div>Animal</div>
            <div>Breed</div>
            <div>Sequencing</div>
            <div>Cov.</div>
            <div>Added</div>
            <div></div>
          </div>

          {filtered.length === 0 && (
            <div className="empty">
              <div className="big-e">No matches.</div>
              Try widening your filters.
            </div>
          )}

          {filtered.map(g => (
            <Link key={g.id} href={`/archive/${g.id}`} className="row">
              <div className={"glyph " + g.species}>
                {g.species === "dog" ? <DogGlyph /> : <CatGlyph />}
              </div>
              <div>
                <div className="name">{g.name}</div>
                <div className="id">{g.id} · {g.age}y · {g.sex} · {g.coat}</div>
              </div>
              <div className="col">{g.breed}</div>
              <div className="col mono">{g.method.type} · {g.assembly}</div>
              <div className="col mono">{g.coverage}×</div>
              <div className="col mono">{ago(g.addedDays)}</div>
              <div className="view-arrow">view →</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
