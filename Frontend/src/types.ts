// Mirrors BackEnd/src/types.ts (the wire format of POST /api/review).
export const LANGUAGES = ["javascript", "typescript", "python", "java", "c", "cpp", "go", "other"] as const;
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

export interface Timings {
  heuristicMs: number;
  firstTokenMs: number | null;
  totalMs: number;
}

export type ReviewEvent =
  | { type: "meta"; cached: boolean; findings: Finding[]; chunks: number; estimatedTokens: number; heuristicMs: number }
  | { type: "token"; text: string }
  | { type: "done"; cached: boolean; timings: Timings }
  | { type: "error"; code: string; message: string };
