import { memo, useLayoutEffect } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import type { ReviewView } from "../hooks/useReviewStream";
import { FindingsList } from "./FindingsList";

interface Props {
  view: ReviewView;
  onCommit: () => void;
}

const STATUS_TEXT: Record<ReviewView["status"], string> = {
  idle: "Paste code on the left and press Review.",
  loading: "Connecting to the review service…",
  streaming: "Reviewing…",
  done: "",
  error: "",
};

const rehypePlugins = [rehypeHighlight];

/**
 * react-markdown does not render raw HTML by default, so model output can never inject markup.
 * The layout effect reports when each streamed update reached the DOM (see useReviewStream.markCommit).
 */
export const ReviewPanel = memo(function ReviewPanel({ view, onCommit }: Props) {
  useLayoutEffect(() => {
    onCommit();
  }, [view.text, onCommit]);

  return (
    <section className="review-panel" aria-live="polite" aria-busy={view.status === "loading" || view.status === "streaming"}>
      {STATUS_TEXT[view.status] && <p className="muted">{STATUS_TEXT[view.status]}</p>}
      <FindingsList findings={view.findings} />
      {view.error && (
        <p role="alert" className="error">
          {view.error}
        </p>
      )}
      {view.text && <Markdown rehypePlugins={rehypePlugins}>{view.text}</Markdown>}
    </section>
  );
});
