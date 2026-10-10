import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedCallback } from "../hooks/useDebouncedCallback";

describe("useDebouncedCallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses a burst of calls into one call with the latest arguments", () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 800));

    for (const text of ["a", "ab", "abc", "abcd"]) {
      act(() => result.current.debounced(text));
      act(() => void vi.advanceTimersByTime(200)); // typing faster than the delay
    }
    expect(fn).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(800));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("abcd");
  });

  it("cancel() drops the pending call", () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 500));
    act(() => result.current.debounced("x"));
    act(() => result.current.cancel());
    act(() => void vi.advanceTimersByTime(1000));
    expect(fn).not.toHaveBeenCalled();
  });
});
