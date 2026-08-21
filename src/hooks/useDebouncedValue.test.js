import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { useDebouncedValue } from "./useDebouncedValue";

function Harness({ value, delay }) {
  const debouncedValue = useDebouncedValue(value, delay);
  return <span>{debouncedValue}</span>;
}

describe("useDebouncedValue", () => {
  let container;
  let root;
  let rootUnmounted;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    rootUnmounted = false;
  });

  afterEach(() => {
    if (!rootUnmounted) act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  test("keeps the initial value immediate and delays subsequent values", () => {
    act(() => root.render(<Harness value="PR" delay={250} />));
    expect(container.textContent).toBe("PR");

    act(() => root.render(<Harness value="PR-001" delay={250} />));
    expect(container.textContent).toBe("PR");

    act(() => jest.advanceTimersByTime(249));
    expect(container.textContent).toBe("PR");

    act(() => jest.advanceTimersByTime(1));
    expect(container.textContent).toBe("PR-001");
  });

  test("cancels the pending update when the value changes or unmounts", () => {
    act(() => root.render(<Harness value="PO" delay={200} />));
    act(() => root.render(<Harness value="PO-1" delay={200} />));
    act(() => jest.advanceTimersByTime(100));
    act(() => root.render(<Harness value="PO-12" delay={200} />));

    act(() => jest.advanceTimersByTime(100));
    expect(container.textContent).toBe("PO");

    act(() => root.unmount());
    rootUnmounted = true;
    expect(jest.getTimerCount()).toBe(0);
  });
});
