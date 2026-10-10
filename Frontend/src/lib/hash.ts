/** Must match the server's normalisation, so client and server agree on "same code". */
export function normalizeCode(code: string): string {
  return code
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\s+$/, "");
}

/** SHA-256 hex digest via the Web Crypto API (needs https or localhost). */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
