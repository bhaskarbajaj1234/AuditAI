import { parse } from "@babel/parser";
import type { File } from "@babel/types";
import type { Language } from "../types.js";

export const isBabelLanguage = (language: Language): boolean =>
  language === "javascript" || language === "typescript";

export interface ParseResult {
  ast: File | null;
  /** Set when the code could not be parsed (syntax error). */
  syntaxError: { line: number; message: string } | null;
}

/**
 * Parse JS/TS (with JSX) into an AST. Never throws: syntax errors are returned as data,
 * because "your code does not parse" is itself a valuable review finding.
 */
export function parseCode(code: string, language: Language): ParseResult {
  if (!isBabelLanguage(language)) return { ast: null, syntaxError: null };
  try {
    const ast = parse(code, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: language === "typescript" ? ["jsx", "typescript"] : ["jsx"],
    });
    return { ast, syntaxError: null };
  } catch (err) {
    const e = err as { loc?: { line: number }; message?: string };
    return {
      ast: null,
      syntaxError: {
        line: e.loc?.line ?? 1,
        message: (e.message ?? "Syntax error").replace(/\s*\(\d+:\d+\)\s*$/, ""),
      },
    };
  }
}

/** First line of each top-level statement (including leading comments). Used as safe chunk boundaries. */
export function topLevelStartLines(ast: File): number[] {
  const starts: number[] = [];
  for (const node of ast.program.body) {
    const lead = node.leadingComments?.[0]?.loc?.start.line;
    const line = lead ?? node.loc?.start.line;
    if (line) starts.push(line);
  }
  return starts;
}
