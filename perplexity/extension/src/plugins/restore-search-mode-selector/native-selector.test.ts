import { describe, expect, it, vi } from "vitest";

import { getNativeSelector, selectNativeMode } from "./native-selector";

function fixture(overrides: Record<string, unknown> = {}) {
  const onValueSelect = vi.fn();
  const props = {
    testIdPrefix: "ask-input-mode-toggle",
    value: "search",
    items: [
      {
        value: "search",
        activeValues: ["search", "research", "agentic_research", "study"],
        hidden: false,
        renderMenu: null,
      },
      { value: "asi", hidden: false },
    ],
    onValueSelect,
    ...overrides,
  };
  const fiber = { memoizedProps: props, return: null };
  const button = { __reactFiber$fixture: fiber, disabled: false };
  return { button: button as unknown as HTMLButtonElement, props, onValueSelect, fiber };
}

describe("retained native search-mode selector", () => {
  it("finds the selector by semantic props, not minified component names", () => {
    const { button, onValueSelect } = fixture();
    expect(getNativeSelector(button)?.onValueSelect).toBe(onValueSelect);
  });

  it.each(["search", "research", "agentic_research", "study"])(
    "routes %s through Perplexity's own handler",
    (mode) => {
      const { button, onValueSelect } = fixture();
      expect(selectNativeMode(button, mode)).toBe(true);
      expect(onValueSelect).toHaveBeenCalledWith(mode);
    },
  );

  it.each(["asi", "browser_agent", "unknown", "__proto__"])(
    "never selects unsupported mode %s", (mode) => {
      const { button, onValueSelect } = fixture();
      expect(selectNativeMode(button, mode)).toBe(false);
      expect(onValueSelect).not.toHaveBeenCalled();
    },
  );

  it("does not replace an existing native menu", () => {
    const { button, onValueSelect } = fixture({ items: [{ value: "search", activeValues: ["search", "research"], renderMenu: () => null }] });
    expect(getNativeSelector(button)).toBeNull();
    expect(selectNativeMode(button, "research")).toBe(false);
    expect(onValueSelect).not.toHaveBeenCalled();
  });

  it.each(["research", "agentic_research", "study", "asi"])(
    "leaves active %s mode to the native selector", (value) => {
      expect(getNativeSelector(fixture({ value }).button)).toBeNull();
    },
  );

  it.each([
    { items: [] },
    { items: [{ value: "search", hidden: true }] },
    { items: [{ value: "search", lockedReason: "Disabled by your organization" }] },
    { onValueSelect: null },
    { testIdPrefix: "other-toggle" },
  ])("fails closed when selector props are incompatible: %j", (props) => {
    expect(getNativeSelector(fixture(props).button)).toBeNull();
  });

  it("honours native activeValues instead of inventing mode availability", () => {
    const { button, onValueSelect } = fixture({ items: [{ value: "search", activeValues: ["search", "study"] }] });
    expect(selectNativeMode(button, "research")).toBe(false);
    expect(onValueSelect).not.toHaveBeenCalled();
  });

  it("does not intercept a disabled button or non-React DOM", () => {
    const { button } = fixture();
    button.disabled = true;
    expect(getNativeSelector(button)).toBeNull();
    expect(getNativeSelector({} as HTMLButtonElement)).toBeNull();
  });

  it("reads the current React tree rather than a stale alternate", () => {
    const { button, fiber } = fixture();
    const current = { memoizedProps: { ...fiber.memoizedProps, value: "study" }, return: null };
    const currentRoot = { stateNode: { current: null as unknown }, return: null };
    currentRoot.stateNode.current = currentRoot;
    const staleRoot = { stateNode: currentRoot.stateNode, return: null };
    Object.assign(fiber, { return: staleRoot, alternate: current });
    Object.assign(current, { return: currentRoot });
    expect(getNativeSelector(button)).toBeNull();
  });

  it("bounds traversal on unexpected cyclic fibers", () => {
    const { button, fiber } = fixture({ testIdPrefix: "other" });
    Object.assign(fiber, { return: fiber });
    expect(getNativeSelector(button)).toBeNull();
  });
});
