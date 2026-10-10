import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("App", () => {
  it("renders the editor with highlighted sample code, the controls and the stats bar", () => {
    const { container } = render(<App />);
    expect(screen.getByRole("button", { name: "Review" })).toBeTruthy();
    expect(screen.getByLabelText("Code to review")).toBeTruthy();
    expect(screen.getByLabelText("Language")).toBeTruthy();
    expect(container.querySelector(".token")).not.toBeNull(); // Prism produced syntax tokens
    expect(screen.getByLabelText("Performance statistics")).toBeTruthy();
  });
});
