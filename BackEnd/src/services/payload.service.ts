import { parseCode, topLevelStartLines } from "./ast.service.js";
import { estimateTokens } from "../utils/tokens.js";
import type { Chunk, Finding, Language } from "../types.js";

/** Normalise line endings and strip trailing whitespace. Line COUNT is preserved so line numbers stay valid. */
export function normalizeCode(code: string): string {
  return code
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\s+$/, "");
}

/**
 * Format lines as "N| text", skipping blank lines but keeping the ORIGINAL numbers.
 * Blank lines cost tokens and carry no review value; line numbers let the model cite exact locations.
 */
function formatLines(lines: string[], from: number, to: number): string {
  const out: string[] = [];
  for (let n = from; n <= to; n++) {
    const text = lines[n - 1] as string;
    if (text.trim() === "") continue;
    out.push(`${n}| ${text}`);
  }
  return out.join("\n");
}

const DEFINITION = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:def|class|function|func|interface|enum|public|private|protected|static)\b/;

/** Lines where a new top-level "unit" begins; chunks are only cut at these lines when possible. */
function unitStartLines(lines: string[], code: string, language: Language): number[] {
  const { ast } = parseCode(code, language);
  if (ast) {
    const starts = topLevelStartLines(ast);
    if (starts.length > 0) return starts;
  }
  const starts: number[] = [];
  for (let n = 1; n <= lines.length; n++) {
    const text = lines[n - 1] as string;
    if (text.trim() === "" || /^\s/.test(text)) continue; // only unindented lines can start a unit
    const prevBlank = n === 1 || (lines[n - 2] as string).trim() === "";
    if (prevBlank || DEFINITION.test(text)) starts.push(n);
  }
  return starts;
}

/**
 * Split a file into chunks that fit the token budget.
 *  1. Small file -> one chunk.
 *  2. Otherwise cut only at top-level statement boundaries (AST for JS/TS, indentation heuristics elsewhere),
 *     so a function is never split in half when avoidable.
 *  3. A single unit larger than the budget is split by lines as a last resort.
 */
export function buildChunks(rawCode: string, language: Language, budgetTokens: number): Chunk[] {
  const code = normalizeCode(rawCode);
  const lines = code.split("\n");
  const wholeText = formatLines(lines, 1, lines.length);
  const wholeTokens = estimateTokens(wholeText);

  if (wholeTokens <= budgetTokens) {
    return [{ index: 1, total: 1, startLine: 1, endLine: lines.length, text: wholeText, tokens: wholeTokens }];
  }

  const starts = [...new Set([1, ...unitStartLines(lines, code, language)])].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = starts.map((s, i) => [s, (starts[i + 1] ?? lines.length + 1) - 1]);

  const pieces: Array<{ from: number; to: number }> = [];
  let current: { from: number; to: number } | null = null;
  let currentTokens = 0;

  const flush = () => {
    if (current) pieces.push(current);
    current = null;
    currentTokens = 0;
  };

  for (const [from, to] of ranges) {
    const unitTokens = estimateTokens(formatLines(lines, from, to));
    if (unitTokens > budgetTokens) {
      flush();
      // Oversized unit: split by lines.
      let segStart = from;
      let segTokens = 0;
      for (let n = from; n <= to; n++) {
        const lineTokens = estimateTokens(`${n}| ${lines[n - 1] as string}\n`);
        if (segTokens + lineTokens > budgetTokens && n > segStart) {
          pieces.push({ from: segStart, to: n - 1 });
          segStart = n;
          segTokens = 0;
        }
        segTokens += lineTokens;
      }
      pieces.push({ from: segStart, to });
      continue;
    }
    if (current && currentTokens + unitTokens > budgetTokens) flush();
    if (current) {
      (current as { from: number; to: number }).to = to;
    } else {
      current = { from, to };
    }
    currentTokens += unitTokens;
  }
  flush();

  return pieces.map((p, i) => {
    const text = formatLines(lines, p.from, p.to);
    return {
      index: i + 1,
      total: pieces.length,
      startLine: p.from,
      endLine: p.to,
      text,
      tokens: estimateTokens(text),
    };
  });
}

/** Names of top-level definitions, so each chunk knows what else exists in the file. */
export function buildOutline(rawCode: string): string[] {
  const outline: string[] = [];
  const lines = normalizeCode(rawCode).split("\n");
  const pattern =
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:(?:def|class|function\*?|func|interface|enum|type)\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>)/;
  for (let i = 0; i < lines.length && outline.length < 40; i++) {
    const m = pattern.exec(lines[i] as string);
    const name = m?.[1] ?? m?.[2];
    if (name) outline.push(`${name} (L${i + 1})`);
  }
  return outline;
}

const CLOSING_TAG = /<\/code_to_review>/gi;

/**
 * Build the user prompt for one chunk.
 * - Static hints are limited to the chunk's lines.
 * - User code is wrapped in delimiters and any closing delimiter inside it is neutralised,
 *   which (together with the system prompt) is the first line of defence against prompt injection.
 */
export function buildPrompt(args: {
  chunk: Chunk;
  language: Language;
  findings: Finding[];
  outline: string[];
}): string {
  const { chunk, language, findings, outline } = args;
  const hints = findings
    .filter((f) => f.line >= chunk.startLine && f.line <= chunk.endLine)
    .slice(0, 15)
    .map((f) => `- L${f.line} [${f.severity}] ${f.ruleId} ${f.title}`);

  const parts = [`Language: ${language}`];
  if (chunk.total > 1) {
    parts.push(`This is part ${chunk.index} of ${chunk.total} of one file (lines ${chunk.startLine}-${chunk.endLine}).`);
    if (outline.length > 0) parts.push(`File outline: ${outline.join(", ")}`);
  }
  if (hints.length > 0) {
    parts.push(`Static analysis already flagged these (verify them, explain impact, give the fix):\n${hints.join("\n")}`);
  }
  parts.push(`<code_to_review>\n${chunk.text.replace(CLOSING_TAG, "<\\/code_to_review>")}\n</code_to_review>`);
  return parts.join("\n\n");
}
