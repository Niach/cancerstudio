import Link from "next/link";

import Helix from "@/components/helix/Helix";
import TweaksPanel from "@/components/dev/TweaksPanel";
import { Chip, Eyebrow } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { PRIMARY_PIPELINE_STAGES } from "@/lib/types";
import { formatDateTime, formatSpeciesLabel } from "@/lib/workspace-utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const workspaces = await api.listWorkspaces().catch(() => []);

  return (
    <div className="mvx-theme">
      <div className="mvx-view mvx-fade-in">
        <div className="mvx-view-head">
          <div>
            <div className="mvx-crumb">Workspaces</div>
            <h1>Your cases.</h1>
            <p
              style={{
                maxWidth: "58ch",
                marginTop: 12,
                fontSize: 16.5,
                lineHeight: 1.6,
                color: "var(--ink-2)",
              }}
            >
              Every case is a full pipeline: from raw DNA reads to a
              personalized mRNA construct. Everything runs on your computer.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Helix size={110} rungs={14} hue={152} speed={30} />
            <Link href="/workspaces/new" className="mvx-btn mvx-btn-primary">
              + New case
            </Link>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
          }}
        >
          {workspaces.map((workspace) => (
            <Link
              key={workspace.id}
              href={`/workspaces/${workspace.id}`}
              style={{
                textAlign: "left",
                padding: "22px 26px",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-mvx-lg)",
                background: "var(--surface-strong)",
                fontFamily: "inherit",
                color: "var(--ink)",
                textDecoration: "none",
                display: "block",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <Eyebrow>Open case</Eyebrow>
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 500,
                      fontSize: 24,
                      margin: "6px 0 4px",
                      letterSpacing: "-0.02em",
                      color: "var(--ink)",
                    }}
                  >
                    {workspace.displayName}
                  </h3>
                  <div style={{ fontSize: 13.5, color: "var(--muted)" }}>
                    {formatSpeciesLabel(workspace.species)}
                  </div>
                </div>
                <Chip kind="live">Active</Chip>
              </div>
              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 8,
                }}
              >
                {PRIMARY_PIPELINE_STAGES.map((stage, index) => (
                  <div
                    key={stage.id}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "var(--surface-sunk)",
                      border: "1px solid var(--line)",
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        color: "var(--muted-2)",
                        opacity: 0.7,
                      }}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div
                      style={{
                        color: "var(--ink-2)",
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {stage.name}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className="mvx-tiny">
                  Updated {formatDateTime(workspace.updatedAt)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--accent-ink)",
                  }}
                >
                  Open →
                </span>
              </div>
            </Link>
          ))}

          <Link
            href="/workspaces/new"
            style={{
              textAlign: "left",
              padding: "22px 26px",
              border: "1.5px dashed var(--line-strong)",
              borderRadius: "var(--radius-mvx-lg)",
              background: "transparent",
              fontFamily: "inherit",
              color: "var(--muted)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 240,
              textDecoration: "none",
            }}
          >
            <div
              style={{
                fontSize: 44,
                fontFamily: "var(--font-display)",
                color: "var(--muted-2)",
              }}
            >
              +
            </div>
            <div style={{ fontSize: 15, marginTop: 8, color: "var(--ink-2)" }}>
              Start a new case
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>
              Pick a species · name it · register files
            </div>
          </Link>
        </div>
      </div>

      <TweaksPanel />
    </div>
  );
}
