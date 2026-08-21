import { useEffect, useState } from "react";

/**
 * Returns the latest value after it has remained unchanged for `delay` ms.
 * The caller keeps ownership of the immediate (non-debounced) value.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
}
