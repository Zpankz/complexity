import { getElementFiber } from "@/plugins/restore-search-mode-selector/native-selector";

export type LegacyThreadScope = {
  config: Record<string, unknown>;
  threadId: string;
  isActive: boolean;
};

function record(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** The nearest scoped provider wins. Never replace the parent's global model. */
export function getLegacyThreadScope(
  button: HTMLButtonElement,
): LegacyThreadScope | null {
  if (button.disabled) return null;
  let fiber = getElementFiber(button);
  let config: Record<string, unknown> | undefined;
  let parentConfig: Record<string, unknown> | undefined;
  let threadId: string | undefined;
  let isFollowUp: boolean | undefined;
  let mode: string | undefined;
  for (
    let depth = 0;
    fiber != null && depth < 512;
    depth++, fiber = fiber.return ?? null
  ) {
    const props = fiber.memoizedProps;
    if (!record(props)) continue;
    if (
      props.testIdPrefix === "ask-input-mode-toggle" &&
      Array.isArray(props.items) &&
      typeof props.onValueSelect === "function" &&
      mode == null
    ) {
      if (typeof props.value !== "string") return null;
      mode = props.value;
    }
    if (isFollowUp == null && typeof props.isFollowUp === "boolean")
      isFollowUp = props.isFollowUp;
    const value = props.value;
    if (!record(value)) continue;
    if (
      typeof value.configuredModel === "string" &&
      typeof value.setConfiguredModel === "function"
    ) {
      if (config == null) config = value;
      else if (parentConfig == null && value !== config) parentConfig = value;
    }
    if (
      threadId == null &&
      typeof value.currentThreadId === "string" &&
      value.currentThreadId.length > 0
    )
      threadId = value.currentThreadId;
  }
  if (
    !isFollowUp ||
    !threadId ||
    !config ||
    !parentConfig ||
    !["search", "research", "agentic_research", "study"].includes(mode ?? "") ||
    config.askDeepResearchModel !== null
  )
    return null;
  return {
    config,
    threadId,
    isActive: mode === "research" && config.configuredModel === "pplx_alpha",
  };
}

/** Extract the existing Plus menu's Pro action, including its native access checks. */
export function getIncludedProAction(
  option: HTMLElement,
  scope: LegacyThreadScope,
): (() => void) | null {
  if (
    option.getAttribute("role") !== "option" ||
    option.getAttribute("aria-disabled") === "true" ||
    !option.textContent.includes("Included in Pro")
  )
    return null;
  let fiber = getElementFiber(option);
  let action: (() => void) | undefined;
  let config: Record<string, unknown> | undefined;
  let threadId: string | undefined;
  for (
    let depth = 0;
    fiber != null && depth < 512;
    depth++, fiber = fiber.return ?? null
  ) {
    const props = fiber.memoizedProps;
    if (!record(props)) continue;
    if (action == null && record(props.row)) {
      const item = props.row.item;
      if (record(item) && item.id === "featured:deep-research") {
        const payload = item.payload;
        if (
          item.disabled === true ||
          !record(payload) ||
          payload.disabled === true ||
          !record(payload.action) ||
          payload.action.type !== "skill" ||
          !record(payload.action.selectableSkill) ||
          payload.action.selectableSkill.name !== "deep-research" ||
          payload.action.selectableSkill.scope !== "global" ||
          typeof props.onSelect !== "function"
        )
          return null;
        action = props.onSelect as () => void;
      }
    }
    const value = props.value;
    if (!record(value)) continue;
    if (
      config == null &&
      typeof value.configuredModel === "string" &&
      typeof value.setConfiguredModel === "function"
    )
      config = value;
    if (threadId == null && typeof value.currentThreadId === "string")
      threadId = value.currentThreadId;
  }
  return config === scope.config && threadId === scope.threadId
    ? (action ?? null)
    : null;
}
