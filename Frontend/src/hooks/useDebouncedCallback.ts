import { useCallback, useEffect, useRef } from "react";

/**
 * Debounce: run `fn` only after `delay` ms with NO new calls.
 * (Throttle would run at most once per interval; for "user stopped typing" debounce is the right tool.)
 * The latest `fn` is kept in a ref, so callers never get a stale closure and the returned functions stay stable.
 */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay: number) {
  const fnRef = useRef(fn);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    fnRef.current = fn;
  });

  const cancel = useCallback(() => clearTimeout(timer.current), []);

  const debounced = useCallback(
    (...args: A) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  );

  useEffect(() => cancel, [cancel]); // clear a pending call on unmount
  return { debounced, cancel };
}
