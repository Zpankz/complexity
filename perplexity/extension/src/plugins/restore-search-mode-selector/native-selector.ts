/** The retained Search menu's native values, not Computer skills or model IDs. */
export const MODE_OPTIONS = [
  { value: "search", label: "Search", icon: "search" },
  { value: "research", label: "Deep Research", icon: "telescope" },
  { value: "agentic_research", label: "Model Council", icon: "gavel" },
  { value: "study", label: "Learn Step by Step", icon: "book" },
] as const;

export type Fiber = {
  return?: Fiber | null;
  alternate?: Fiber | null;
  memoizedProps?: unknown;
  stateNode?: { current?: Fiber };
};

type NativeSelector = {
  modes: string[];
  onValueSelect: (mode: string) => void;
};

function record(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Follow the committed tree. DOM nodes may still point at React's old alternate. */
function currentFiber(fiber: Fiber): Fiber | null {
  let root = fiber;
  for (let depth = 0; root.return != null; depth++) {
    if (depth >= 512) return null;
    root = root.return;
  }
  return root.stateNode?.current != null && root.stateNode.current !== root
    ? (fiber.alternate ?? null)
    : fiber;
}

export function getElementFiber(element: Element): Fiber | null {
  const key = Object.keys(element).find((key) =>
    key.startsWith("__reactFiber$"),
  );
  if (key == null) return null;
  const initial = (element as unknown as Record<string, Fiber>)[key];
  return initial == null ? null : currentFiber(initial);
}

export function getNativeSelector(
  button: HTMLButtonElement,
): NativeSelector | null {
  if (button.disabled) return null;
  let fiber = getElementFiber(button);

  for (
    let depth = 0;
    fiber != null && depth < 60;
    depth++, fiber = fiber.return ?? null
  ) {
    const props = fiber.memoizedProps;
    if (
      !record(props) ||
      props.testIdPrefix !== "ask-input-mode-toggle" ||
      !Array.isArray(props.items)
    )
      continue;
    if (props.value !== "search" || typeof props.onValueSelect !== "function")
      return null;
    const search = props.items.find(
      (item: unknown) => record(item) && item.value === "search",
    ) as Record<string, unknown> | undefined;
    // A native menu, organization lock or changed component shape takes precedence.
    if (
      search == null ||
      search.hidden === true ||
      search.lockedReason != null ||
      search.renderMenu != null ||
      !Array.isArray(search.activeValues)
    )
      return null;
    const activeValues = search.activeValues;
    const modes = MODE_OPTIONS.map(({ value }) => value).filter((mode) =>
      activeValues.includes(mode),
    );
    if (modes.length < 2) return null;
    return {
      modes,
      onValueSelect: props.onValueSelect as NativeSelector["onValueSelect"],
    };
  }
  return null;
}

/** Re-read live props at selection time; never write model/state/request fields directly. */
export function selectNativeMode(
  button: HTMLButtonElement,
  mode: string,
): boolean {
  const selector = getNativeSelector(button);
  if (selector == null || !selector.modes.includes(mode)) return false;
  selector.onValueSelect(mode);
  return true;
}
