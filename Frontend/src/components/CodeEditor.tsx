import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-typescript";
import "prismjs/themes/prism-tomorrow.css";
import Editor from "react-simple-code-editor";
import type { Language } from "../types";

const GRAMMAR: Record<Language, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  java: "java",
  c: "c",
  cpp: "cpp",
  go: "go",
  other: "clike",
};

interface Props {
  value: string;
  language: Language;
  onChange: (value: string) => void;
}

export function CodeEditor({ value, language, onChange }: Props) {
  const key = GRAMMAR[language];
  const grammar = Prism.languages[key] ?? Prism.languages["clike"];
  return (
    <>
    <label htmlFor="code-input" className="sr-only">
      Code to review
    </label>
    <Editor
      value={value}
      onValueChange={onChange}
      highlight={(code) => (grammar ? Prism.highlight(code, grammar, key) : code)}
      padding={14}
      textareaId="code-input"
      className="editor"
      style={{ fontFamily: '"Fira Code", "Fira Mono", ui-monospace, monospace', fontSize: 15, minHeight: "100%" }}
    />
    </>
  );
}
