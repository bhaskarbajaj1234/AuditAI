export const LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "c",
  "cpp",
  "go",
  "other",
] as const;
export type Language = (typeof LANGUAGES)[number];

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Category = "security" | "performance" | "correctness" | "maintainability" | "style";

export interface Finding {
  ruleId: string;
  title: string;
  severity: Severity;
  category: Category;
  line: number;
  message: string;
}

export interface Chunk {
  index: number; // 1-based
  total: number;
  startLine: number;
  endLine: number;
  /** Line-numbered payload, e.g. "12| const x = 1" (blank lines omitted, numbers preserved). */
  text: string;
  tokens: number;
}

export interface Timings {
  /** ms until static findings were ready (first useful result). */
  heuristicMs: number;
  /** ms until the first LLM token was streamed (null on cache hit / failure). */
  firstTokenMs: number | null;
  totalMs: number;
}

export type ReviewEvent =
  | {
      type: "meta";
      cached: boolean;
      findings: Finding[];
      chunks: number;
      estimatedTokens: number;
      heuristicMs: number;
    }
  | { type: "token"; text: string }
  | { type: "done"; cached: boolean; timings: Timings }
  | { type: "error"; code: string; message: string };
