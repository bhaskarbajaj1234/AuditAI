import { memo } from "react";
import type { Finding, Severity } from "../types";

const LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
const ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

interface Props {
  findings: Finding[];
}

export const FindingsList = memo(function FindingsList({ findings }: Props) {
  if (findings.length === 0) return null;

  const counts = ORDER.map((s) => [s, findings.filter((f) => f.severity === s).length] as const).filter(([, n]) => n > 0);

  return (
    <details className="findings" open>
      <summary>
        Static checks: {findings.length} {findings.length === 1 ? "finding" : "findings"}
        <span className="counts">
          {counts.map(([s, n]) => (
            <span key={s} className={`sev sev-${s}`}>
              {n} {LABEL[s].toLowerCase()}
            </span>
          ))}
        </span>
      </summary>
      <ul>
        {findings.slice(0, 50).map((f) => (
          <li key={`${f.ruleId}-${f.line}`}>
            <span className={`badge sev-${f.severity}`}>{LABEL[f.severity]}</span>
            <strong>
              Line {f.line}: {f.title}
            </strong>
            <p>{f.message}</p>
          </li>
        ))}
      </ul>
      {findings.length > 50 && <p className="muted">Showing the first 50 of {findings.length}.</p>}
    </details>
  );
});
