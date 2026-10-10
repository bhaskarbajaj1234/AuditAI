import { describe, expect, it } from "vitest";
import { analyze } from "../services/heuristics.service.js";

const ids = (code: string, language: Parameters<typeof analyze>[1] = "javascript") =>
  analyze(code, language).map((f) => f.ruleId);

describe("line rules", () => {
  it("flags hardcoded secrets and known key formats", () => {
    expect(ids(`const apiKey = "sk_live_1234567890abcdef";`)).toContain("SEC001");
    expect(ids(`const k = "AKIAABCDEFGHIJKLMNOP";`)).toContain("SEC002");
  });

  it("does not flag secrets read from the environment", () => {
    expect(ids(`const apiKey = process.env.API_KEY;`)).not.toContain("SEC001");
  });

  it("flags SQL built by concatenation and interpolation, but not parameterised queries", () => {
    expect(ids(`db.query("SELECT * FROM users WHERE id = " + id);`)).toContain("SEC003");
    expect(ids("db.query(`SELECT * FROM users WHERE id = ${id}`);")).toContain("SEC003");
    expect(ids(`db.query("SELECT * FROM users WHERE id = $1", [id]);`)).not.toContain("SEC003");
  });

  it("applies python-only rules to python only", () => {
    expect(ids("x = eval(user_input)", "python")).toContain("SEC004");
    expect(ids("try:\n    pass\nexcept:\n    pass", "python")).toContain("COR001");
    expect(ids("x = eval(user_input)", "go")).not.toContain("SEC004");
  });

  it("ignores commented-out code but still reports TODO markers", () => {
    const result = ids(`// const password = "supersecret123";\n// TODO: remove`);
    expect(result).not.toContain("SEC001");
    expect(result).toContain("MNT001");
  });
});

describe("AST rules (JS/TS)", () => {
  it("detects eval, empty catch, loose equality and var", () => {
    const code = `
var a = 1;
if (a == "1") { eval("x"); }
try { run(); } catch (e) {}
`;
    expect(ids(code)).toEqual(expect.arrayContaining(["JS001", "JS003", "JS004", "JS005"]));
  });

  it("allows `== null` and `await` in for-await", () => {
    const code = `async function f(x, items){ if (x == null) return; for await (const i of items) { await i; } }`;
    const result = ids(code);
    expect(result).not.toContain("JS003");
    expect(result).not.toContain("JS006");
  });

  it("detects await inside a loop", () => {
    expect(ids(`async function f(a){ for (const x of a) { await g(x); } }`)).toContain("JS006");
  });

  it("detects command injection only when child_process is used", () => {
    expect(ids(`const { exec } = require("child_process"); exec("ls " + dir);`)).toContain("JS002");
    expect(ids(`const m = /a/.exec(text); exec(text);`)).not.toContain("JS002");
  });

  it("scores long and complex functions", () => {
    const branches = Array.from({ length: 12 }, (_, i) => `if (x === ${i}) return ${i};`).join("\n");
    const body = Array.from({ length: 55 }, () => "doStuff();").join("\n");
    const result = ids(`function big(x) {\n${branches}\n${body}\n}`);
    expect(result).toContain("JS007");
    expect(result).toContain("JS009");
  });

  it("reports a syntax error with its line instead of throwing", () => {
    const findings = analyze("function broken( {\n  return 1;\n}", "javascript");
    expect(findings[0]?.ruleId).toBe("COR000");
  });

  it("parses TypeScript and JSX", () => {
    const code = `const App = (p: { n: number }) => <div>{p.n}</div>;`;
    expect(() => analyze(code, "typescript")).not.toThrow();
    expect(ids(code, "typescript")).not.toContain("COR000");
  });

  it("returns findings sorted by severity", () => {
    const findings = analyze(`var a = 1;\nconst password = "supersecret123";`, "javascript");
    expect(findings[0]?.severity).toBe("critical");
  });
});
