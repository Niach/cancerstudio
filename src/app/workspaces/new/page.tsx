"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import Helix from "@/components/helix/Helix";
import TweaksPanel from "@/components/dev/TweaksPanel";
import { Btn, Card, Eyebrow } from "@/components/ui-kit";
import { api } from "@/lib/api";
import type { WorkspaceSpecies } from "@/lib/types";

interface SpeciesOption {
  id: WorkspaceSpecies;
  name: string;
  ref: string;
  emoji: string;
  note: string;
}

const OPTIONS: SpeciesOption[] = [
  {
    id: "dog",
    name: "Dog",
    ref: "CanFam4 · UU_Cfam_GSD_1.0",
    emoji: "🐕",
    note: "Resolves the complete DLA region",
  },
  {
    id: "cat",
    name: "Cat",
    ref: "felCat9",
    emoji: "🐈",
    note: "Feline reference assembly",
  },
  {
    id: "human",
    name: "Human",
    ref: "GRCh38 (hg38)",
    emoji: "◯",
    note: "Standard clinical reference",
  },
];

export default function NewWorkspacePage() {
  const router = useRouter();
  const [species, setSpecies] = useState<WorkspaceSpecies>("dog");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const displayName = name.trim();
    if (!displayName) {
      setError("Give this case a name first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const workspace = await api.createWorkspace({ displayName, species });
      router.push(`/workspaces/${workspace.id}/ingestion`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create the workspace."
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="mvx-theme">
      <div
        className="mvx-view mvx-fade-in"
        style={{ maxWidth: 900 }}
      >
        <div className="mvx-view-head">
          <div>
            <div className="mvx-crumb">Workspaces / New</div>
            <h1>Start a new case.</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Helix size={90} rungs={12} hue={152} speed={30} />
          </div>
        </div>

        <Card>
          <div style={{ padding: "24px 28px" }}>
            <Eyebrow>Step 1 · Species</Eyebrow>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 500,
                fontSize: 22,
                margin: "8px 0 6px",
                letterSpacing: "-0.02em",
                color: "var(--ink)",
              }}
            >
              Pick a species.
            </h3>
            <p className="mvx-tiny" style={{ marginBottom: 18, fontSize: 13 }}>
              Species locks the reference genome for this run. Everything
              downstream — alignment, variant calling, HLA/DLA handling — is
              species-aware.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              {OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`mvx-species-card ${species === opt.id ? "is-on" : ""}`}
                  onClick={() => setSpecies(opt.id)}
                >
                  <div className="mvx-species-portrait">{opt.emoji}</div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 500,
                        fontFamily: "var(--font-display)",
                        letterSpacing: "-0.01em",
                        color: "var(--ink)",
                      }}
                    >
                      {opt.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11.5,
                        fontFamily: "var(--font-mono)",
                        color: "var(--muted)",
                      }}
                    >
                      {opt.ref}
                    </span>
                    <span className="mvx-tiny" style={{ fontSize: 11 }}>
                      {opt.note}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div
            style={{ borderTop: "1px solid var(--line)", padding: "24px 28px" }}
          >
            <Eyebrow>Step 2 · Name</Eyebrow>
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 500,
                fontSize: 22,
                margin: "8px 0 14px",
                letterSpacing: "-0.02em",
                color: "var(--ink)",
              }}
            >
              What should we call this case?
            </h3>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
              placeholder="e.g. Rosie — mast cell tumor"
              disabled={submitting}
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "1px solid var(--line-strong)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-strong)",
                fontFamily: "inherit",
                fontSize: 14,
                color: "var(--ink)",
                outline: "none",
              }}
            />
            <p className="mvx-tiny" style={{ marginTop: 10, fontSize: 11.5 }}>
              Workspaces live on your machine under{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>
                ~/mutavax-data/workspaces/
              </span>
            </p>
            {error ? (
              <p
                className="mvx-tiny"
                style={{
                  marginTop: 10,
                  color: "var(--danger)",
                  fontSize: 13,
                }}
              >
                {error}
              </p>
            ) : null}
          </div>

          <div
            style={{
              borderTop: "1px solid var(--line)",
              padding: "18px 28px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span className="mvx-tiny">
              Next: register your local FASTQ or BAM files.
            </span>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn
                variant="ghost"
                onClick={() => router.push("/")}
                disabled={submitting}
              >
                Cancel
              </Btn>
              <Btn onClick={handleCreate} disabled={submitting}>
                {submitting ? "Creating…" : "Create workspace →"}
              </Btn>
            </div>
          </div>
        </Card>
      </div>

      <TweaksPanel />
    </div>
  );
}
