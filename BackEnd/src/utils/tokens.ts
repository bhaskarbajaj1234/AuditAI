/**
 * Cheap token estimate (~4 characters per token for code/English).
 * Good enough for budgeting chunks; the exact count is only known to the model's tokenizer.
 */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
