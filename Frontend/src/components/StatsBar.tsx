import type { Counters, ReviewView } from "../hooks/useReviewStream";

interface RenderStats {
  samples: number;
  p95: number;
  max: number;
}

interface Props {
  view: ReviewView;
  counters: Counters;
  renderStats: RenderStats | null;
}

const ms = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${Math.round(n)} ms`);

export function StatsBar({ view, counters, renderStats }: Props) {
  const networkCalls = counters.autoRequests;
  const saved = counters.edits > 0 ? Math.max(0, Math.round((1 - networkCalls / counters.edits) * 100)) : null;

  return (
    <footer className="stats" aria-label="Performance statistics">
      <dl>
        <div>
          <dt>Static findings</dt>
          <dd>{view.timings ? ms(view.timings.heuristicMs) : "–"}</dd>
        </div>
        <div>
          <dt>First AI token</dt>
          <dd>{view.cached ? "cached" : ms(view.timings?.firstTokenMs)}</dd>
        </div>
        <div>
          <dt>Full review</dt>
          <dd>{ms(view.timings?.totalMs)}</dd>
        </div>
        <div>
          <dt>UI update p95 / max</dt>
          <dd>{renderStats ? `${renderStats.p95.toFixed(1)} / ${renderStats.max.toFixed(1)} ms` : "–"}</dd>
        </div>
        <div title="Editor changes while auto-review was on, versus requests actually sent">
          <dt>Auto-review calls</dt>
          <dd>
            {networkCalls} of {counters.edits} edits{saved !== null ? ` (${saved}% fewer)` : ""}
          </dd>
        </div>
        <div>
          <dt>Browser cache hits</dt>
          <dd>{counters.clientCacheHits}</dd>
        </div>
        <div>
          <dt>Cancelled</dt>
          <dd>{counters.cancelled}</dd>
        </div>
      </dl>
    </footer>
  );
}
