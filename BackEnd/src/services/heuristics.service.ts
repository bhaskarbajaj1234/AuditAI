import _traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { parseCode } from "./ast.service.js";
import type { Category, Finding, Language, Severity } from "../types.js";

// Type-safe interop fix for NodeNext / @types/babel__traverse
type TraverseFn = typeof _traverse extends { default: infer T } ? T : typeof _traverse;
const traverse = (_traverse as unknown as { default?: TraverseFn }).default ?? (_traverse as unknown as TraverseFn);

type LineRule = {
  id: string;
  title: string;
  severity: Severity;
  category: Category;
  message: string;
  pattern: RegExp;
  languages?: Language[];
  inComments?: boolean;
};

const JS_TS: Language[] = ["javascript", "typescript"];

export const LINE_RULES: LineRule[] = [
  {
    id: "SEC001",
    title: "Hardcoded secret",
    severity: "critical",
    category: "security",
    message: "A credential-like value is hardcoded. Move it to an environment variable or a secret manager and rotate it.",
    pattern: /\b(api[_-]?key|secret|passwd|password|auth[_-]?token|access[_-]?token|private[_-]?key)\b\s*[:=]\s*["'`][^"'`\s]{8,}["'`]/i,
  },
  {
    id: "SEC002",
    title: "Known credential format",
    severity: "critical",
    category: "security",
    message: "This matches the format of a real credential (cloud key, token or private key). Treat it as leaked and rotate it.",
    pattern: /(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,})/,
  },
  {
    id: "SEC003",
    title: "Possible SQL injection",
    severity: "high",
    category: "security",
    message: "A SQL statement is built with string concatenation/interpolation. Use parameterised queries or prepared statements.",
    pattern:
      /["'`]\s*(?:select|insert|update|delete)\b[^"'`]*["'`]\s*(?:\+|%)\s*[\w(]|["'`]\s*(?:select|insert|update|delete)\b[^"'`]*\$\{|\.(?:execute|query)\(\s*f["']/i,
  },
  {
    id: "SEC004",
    title: "Dynamic code execution",
    severity: "high",
    category: "security",
    message: "eval/exec runs arbitrary code. Replace with a safe parser or an explicit dispatch table.",
    pattern: /\b(?:eval|exec)\s*\(/,
    languages: ["python"],
  },
  {
    id: "SEC005",
    title: "Shell command execution",
    severity: "high",
    category: "security",
    message: "Shell execution with untrusted input leads to command injection. Pass an argument list and avoid shell=True.",
    pattern: /subprocess\.\w+\([^)]*shell\s*=\s*True|\bos\.system\(\vert{}Runtime\.getRuntime\(\)\.exec\(/,
    languages: ["python", "java"],
  },
  {
    id: "SEC006",
    title: "Unsafe deserialisation",
    severity: "high",
    category: "security",
    message: "pickle/yaml.load can execute code while loading untrusted data. Use json or yaml.safe_load.",
    pattern: /pickle\.loads?\(|yaml\.load\((?![^)]*Loader)/,
    languages: ["python"],
  },
  {
    id: "SEC007",
    title: "XSS sink",
    severity: "high",
    category: "security",
    message: "Writing raw HTML into the DOM enables XSS. Use textContent or sanitise (e.g. DOMPurify) first.",
    pattern: /\.innerHTML\s*=|dangerouslySetInnerHTML|document\.write\(/,
    languages: JS_TS,
  },
  {
    id: "SEC008",
    title: "Weak hash algorithm",
    severity: "medium",
    category: "security",
    message: "MD5/SHA-1 are broken for security use. Use SHA-256+ (and bcrypt/argon2 for passwords).",
    pattern: /createHash\(\s*["'](?:md5\vert{}sha1)["']\s*\)|hashlib\.(?:md5|sha1)\(|MessageDigest\.getInstance\(\s*"(?:MD5|SHA-?1)"/i,
  },
  {
    id: "SEC009",
    title: "TLS verification disabled",
    severity: "high",
    category: "security",
    message: "Disabling certificate verification exposes the connection to man-in-the-middle attacks.",
    pattern: /rejectUnauthorized\s*:\s*false|verify\s*=\s*False|NODE_TLS_REJECT_UNAUTHORIZED/,
  },
  {
    id: "SEC010",
    title: "Wildcard CORS",
    severity: "medium",
    category: "security",
    message: "Allowing every origin lets any website call this API from a user's browser. Whitelist known origins.",
    pattern: /origin\s*:\s*["']\*["']|Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*["']/,
  },
  {
    id: "COR001",
    title: "Bare except",
    severity: "medium",
    category: "correctness",
    message: "A bare `except:` also swallows KeyboardInterrupt/SystemExit. Catch specific exceptions.",
    pattern: /^\s*except\s*:/,
    languages: ["python"],
  },
  {
    id: "STY001",
    title: "Leftover debug output",
    severity: "low",
    category: "style",
    message: "Debug logging left in the code. Use a structured logger with levels.",
    pattern: /\bconsole\.log\(|System\.out\.println\(/,
    languages: ["javascript", "typescript", "java"],
  },
  {
    id: "MNT001",
    title: "Unresolved TODO/FIXME",
    severity: "info",
    category: "maintainability",
    message: "An unresolved marker. Track it in an issue or resolve it before merging.",
    pattern: /\b(?:TODO|FIXME|HACK|XXX)\b/,
    inComments: true,
  },
];

const COMMENT_START = /^\s*(?:\/\/|#|\*|\/\*)/;

export function runLineRules(code: string, language: Language): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] as string;
    if (text.length > 2000) continue;
    const isComment = COMMENT_START.test(text);
    for (const rule of LINE_RULES) {
      if (rule.languages && !rule.languages.includes(language)) continue;
      if (isComment && !rule.inComments) continue;
      if (rule.pattern.test(text)) {
        findings.push({
          ruleId: rule.id,
          title: rule.title,
          severity: rule.severity,
          category: rule.category,
          line: i + 1,
          message: rule.message,
        });
      }
    }
  }
  return findings;
}

const MAX_FUNCTION_LINES = 50;
const MAX_PARAMS = 5;
const MAX_COMPLEXITY = 10;

function cyclomaticComplexity(fn: NodePath<t.Function>): number {
  let score = 1;
  fn.traverse({
    Function(inner: NodePath<t.Function>) {
      inner.skip();
    },
    IfStatement() { score++; },
    ForStatement() { score++; },
    ForInStatement() { score++; },
    ForOfStatement() { score++; },
    WhileStatement() { score++; },
    DoWhileStatement() { score++; },
    ConditionalExpression() { score++; },
    CatchClause() { score++; },
    LogicalExpression() { score++; },
    SwitchCase(p: NodePath<t.SwitchCase>) { if (p.node.test) score++; },
  });
  return score;
}

function functionName(path: NodePath<t.Function>): string {
  const n = path.node;
  if ((t.isFunctionDeclaration(n) || t.isFunctionExpression(n)) && n.id) return n.id.name;
  if (t.isObjectMethod(n) || t.isClassMethod(n)) return t.isIdentifier(n.key) ? n.key.name : "method";
  const parent = path.parent;
  if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) return parent.id.name;
  return "anonymous function";
}

export function runAstRules(code: string, language: Language): Finding[] {
  const { ast, syntaxError } = parseCode(code, language);
  if (syntaxError) {
    return [
      {
        ruleId: "COR000",
        title: "Syntax error",
        severity: "high",
        category: "correctness",
        line: syntaxError.line,
        message: `The code does not parse: ${syntaxError.message}`,
      },
    ];
  }
  if (!ast) return [];

  const findings: Finding[] = [];
  const add = (
    node: t.Node,
    ruleId: string,
    title: string,
    severity: Severity,
    category: Category,
    message: string,
  ) => findings.push({ ruleId, title, severity, category, line: node.loc?.start.line ?? 1, message });

  const usesChildProcess = /child_process/.test(code);

  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      const { callee } = path.node;
      if (t.isIdentifier(callee, { name: "eval" })) {
        add(path.node, "JS001", "Use of eval()", "critical", "security", "eval() executes arbitrary strings as code. Parse data with JSON.parse or use a lookup table.");
      } else if (t.isIdentifier(callee, { name: "Function" })) {
        add(path.node, "JS001", "Function constructor", "high", "security", "The Function constructor evaluates strings like eval(). Avoid it.");
      }
      if (usesChildProcess) {
        const isExecIdentifier = t.isIdentifier(callee) && /^(exec|execSync)$/.test(callee.name);
        const isExecMember =
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.object) &&
          /^(child_process|cp)$/.test(callee.object.name) &&
          t.isIdentifier(callee.property) &&
          /^(exec|execSync)$/.test(callee.property.name);
        const first = path.node.arguments[0];
        if ((isExecIdentifier || isExecMember) && first && !t.isStringLiteral(first)) {
          add(path.node, "JS002", "Command injection risk", "high", "security", "A shell command is built from a non-literal value. Use execFile/spawn with an argument array.");
        }
      }
    },
    NewExpression(path: NodePath<t.NewExpression>) {
      if (t.isIdentifier(path.node.callee, { name: "Function" })) {
        add(path.node, "JS001", "Function constructor", "high", "security", "The Function constructor evaluates strings like eval(). Avoid it.");
      }
    },
    BinaryExpression(path: NodePath<t.BinaryExpression>) {
      const { operator, left, right } = path.node;
      if ((operator === "==" || operator === "!=") && !t.isNullLiteral(left) && !t.isNullLiteral(right)) {
        add(path.node, "JS003", "Loose equality", "low", "correctness", `\`${operator}\` performs type coercion. Prefer \`${operator}=\`.`);
      }
    },
    VariableDeclaration(path: NodePath<t.VariableDeclaration>) {
      if (path.node.kind === "var") {
        add(path.node, "JS004", "`var` declaration", "low", "style", "`var` is function-scoped and hoisted. Use `const`/`let`.");
      }
    },
    CatchClause(path: NodePath<t.CatchClause>) {
      if (path.node.body.body.length === 0) {
        add(path.node, "JS005", "Empty catch block", "medium", "correctness", "The error is silently swallowed. Handle it, log it or rethrow.");
      }
    },
    AwaitExpression(path: NodePath<t.AwaitExpression>) {
      const parent = path.findParent((p: NodePath) => p.isFunction() || p.isLoop());
      if (parent?.isLoop() && !(parent.isForOfStatement() && (parent.node as t.ForOfStatement).await)) {
        add(path.node, "JS006", "await inside a loop", "medium", "performance", "Iterations run one after another. If they are independent, use Promise.all (with a concurrency limit).");
      }
    },
    Function(path: NodePath<t.Function>) {
      const { loc } = path.node;
      const name = functionName(path);
      if (loc) {
        const length = loc.end.line - loc.start.line + 1;
        if (length > MAX_FUNCTION_LINES) {
          add(path.node, "JS007", "Long function", "medium", "maintainability", `\`${name}\` is ${length} lines long (limit ${MAX_FUNCTION_LINES}). Split it into smaller functions.`);
        }
      }
      if (path.node.params.length > MAX_PARAMS) {
        add(path.node, "JS008", "Too many parameters", "low", "maintainability", `\`${name}\` takes ${path.node.params.length} parameters. Group related ones into an options object.`);
      }
      const complexity = cyclomaticComplexity(path);
      if (complexity > MAX_COMPLEXITY) {
        add(path.node, "JS009", "High cyclomatic complexity", "medium", "maintainability", `\`${name}\` has cyclomatic complexity ${complexity} (limit ${MAX_COMPLEXITY}). Extract branches into helpers.`);
      }
    },
  });

  return findings;
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function analyze(code: string, language: Language): Finding[] {
  const all = [...runLineRules(code, language), ...runAstRules(code, language)];
  const seen = new Set<string>();
  const unique = all.filter((f) => {
    const key = `${f.ruleId}:${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line);
}