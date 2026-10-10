import { useEffect, useState } from "react";
import { CodeEditor } from "./components/CodeEditor";
import { ReviewPanel } from "./components/ReviewPanel";
import { StatsBar } from "./components/StatsBar";
import { useDebouncedCallback } from "./hooks/useDebouncedCallback";
import { useReviewStream } from "./hooks/useReviewStream";
import { LANGUAGES, type Language } from "./types";
import "./App.css";

const AUTO_REVIEW_DELAY_MS = 800;

const SAMPLE = `const express = require("express");
const app = express();

app.get("/user", async (req, res) => {
  const rows = [];
  for (const id of req.query.ids) {
    rows.push(await db.query("SELECT * FROM users WHERE id = " + id));
  }
  try {
    res.json(rows);
  } catch (e) {}
});
`;

export default function App() {
  const [code, setCode] = useState(SAMPLE);
  const [language, setLanguage] = useState<Language>("javascript");
  const [autoReview, setAutoReview] = useState(false);
  const [renderStats, setRenderStats] = useState<ReturnType<ReturnType<typeof useReviewStream>["getRenderStats"]>>(null);

  const { view, counters, review, recordEdit, markCommit, getRenderStats } = useReviewStream();
  const { debounced, cancel } = useDebouncedCallback((c: string, l: Language) => void review(c, l, "auto"), AUTO_REVIEW_DELAY_MS);

  // Effects run after the layout effects that record commit times, so the numbers are up to date here.
  useEffect(() => {
    if (view.status === "done") setRenderStats(getRenderStats());
  }, [view.status, getRenderStats]);

  const handleChange = (next: string) => {
    setCode(next);
    if (autoReview) {
      recordEdit();
      debounced(next, language);
    }
  };

  const handleManualReview = () => {
    cancel(); // a pending auto-review is redundant now
    void review(code, language, "manual");
  };

  const handleAutoToggle = (enabled: boolean) => {
    setAutoReview(enabled);
    if (!enabled) cancel();
  };

  const busy = view.status === "loading" || view.status === "streaming";

  return (
    <div className="app">
      <header className="toolbar">
        <h1>AuditAI</h1>
        <label>
          Language
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={autoReview} onChange={(e) => handleAutoToggle(e.target.checked)} />
          Review automatically after I stop typing
        </label>
        <button type="button" className="primary" onClick={handleManualReview} disabled={!code.trim()}>
          {busy ? "Review again" : "Review"}
        </button>
      </header>

      <main>
        <div className="pane code-pane">
          <CodeEditor value={code} language={language} onChange={handleChange} />
        </div>
        <div className="pane review-pane">
          <ReviewPanel view={view} onCommit={markCommit} />
        </div>
      </main>

      <StatsBar view={view} counters={counters} renderStats={renderStats} />
    </div>
  );
}
