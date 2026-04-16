import { cn } from "@/lib/utils";

export type AlignmentState = "locked" | "unlocked";

export function IngestionHeader({
  alignmentState,
}: {
  alignmentState: AlignmentState;
}) {
  const isUnlocked = alignmentState === "unlocked";

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-1 pt-1 pb-3">
      <div className="max-w-2xl">
        <h2 className="text-[18px] font-semibold text-stone-950">
          Add the tumor sample and the healthy sample
        </h2>
        <p className="mt-1 text-[13px] leading-6 text-stone-600">
          Choose either a paired FASTQ set or one BAM/CRAM file for each sample.
          We prepare the files locally so alignment can start cleanly.
        </p>
      </div>
      <span
        data-testid="alignment-status-indicator"
        data-state={alignmentState}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em]",
          isUnlocked
            ? "bg-emerald-50 text-emerald-700"
            : "bg-stone-100 text-stone-500"
        )}
      >
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            isUnlocked ? "bg-emerald-500" : "bg-stone-400"
          )}
        />
        {isUnlocked ? "Ready for alignment" : "Waiting for both samples"}
      </span>
    </div>
  );
}
