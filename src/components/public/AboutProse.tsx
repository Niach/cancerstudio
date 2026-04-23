import { fmt, type CatalogStats } from "@/lib/public-catalog";

export default function AboutProse({ stats }: { stats: CatalogStats }) {
  return (
    <div className="prose">
      <div className="section-label">Mission</div>
      <h1>
        You can&apos;t cure a cancer you can&apos;t <em>read</em>.
      </h1>
      <p className="lede">
        A tumour genome only means something when you have a healthy one to
        compare it against. Humans have gnomAD, 1000 Genomes, and biobanks. For dogs
        and cats, there was almost nothing. We are building that missing baseline —
        then using it to design vaccines, one tumour at a time.
      </p>

      <h2>Why this exists</h2>
      <p>
        One in four dogs and nearly one in five cats will develop cancer. Treatment
        lags decades behind human oncology because the foundational data — whole-genome
        sequences of healthy animals, consistent, permissively licensed, in one place —
        has never been collected. Without it, every somatic variant call is guesswork.
      </p>

      <h2>What cancerstudio is</h2>
      <p>
        Two things in one repository. <em>First</em>, an open archive of {fmt(stats.total)}
        {" "}healthy dog and cat genomes, free to browse and download.
        <em> Second</em>, an eight-stage pipeline that turns two FASTQs — tumour plus
        matched-normal — into an mRNA vaccine design you can send to a GMP manufacturer.
      </p>

      <h2>How the archive grows</h2>
      <p>
        Every contribution comes through a partner veterinary lab. We publish the
        validator source, every partner&apos;s rejection rate, and permit retraction at any
        time. No tumour samples, no clinical records, no owner PII — just healthy
        baselines. CC-BY, CC0, or CC-BY-NC at the contributor&apos;s choice.
      </p>

      <h2>How it cures cancer</h2>
      <p>
        Every oncologist who runs cancerstudio downloads a matched baseline from this
        archive as their reference. Every new healthy genome sharpens every future
        tumour call — for every pet, everywhere.
      </p>
    </div>
  );
}
