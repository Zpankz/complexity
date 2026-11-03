import {
  getElementFiber,
  type Fiber,
} from "@/plugins/restore-search-mode-selector/native-selector";

export type NativeStreamStore = {
  getState(): unknown;
  subscribe(listener: () => void): () => void;
};
export type CouncilNative = {
  account: string;
  scope: string;
  mode: string;
  composer: HTMLElement;
  anchor: HTMLButtonElement;
  models: string[];
  limits: Record<string, unknown>;
  setModels: ((models: string[]) => void) | null;
  streams: NativeStreamStore | null;
};
export type CouncilCatalog = {
  labels: Record<string, string>;
  allowed: Set<string>;
  managed: boolean;
  councilModel: string;
  textOnly?: Set<string>;
};
function record(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
function modelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)
  );
}
export function validCouncilModels(value: unknown): string[] | null {
  return Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 3 &&
    Array.from(value).every(modelId) &&
    new Set(value).size === value.length
    ? [...value]
    : null;
}
export function parseCouncilCatalog(value: unknown): CouncilCatalog | null {
  if (
    !record(value) ||
    !record(value.models) ||
    !Array.isArray(value.search_config) ||
    !record(value.default_models) ||
    !modelId(value.default_models.agentic_research)
  )
    return null;
  const labels: Record<string, string> = {};
  const allowed = new Set<string>();
  const textOnly = new Set<string>();
  for (const [id, model] of Object.entries(value.models)) {
    if (modelId(id) && record(model) && typeof model.label === "string")
      labels[id] = model.label;
  }
  for (const config of value.search_config) {
    if (!record(config)) continue;
    for (const id of [config.non_reasoning_model, config.reasoning_model]) {
      if (!modelId(id)) continue;
      const model = value.models[id];
      if (
        !record(model) ||
        model.mode !== "search" ||
        model.replaced_by != null ||
        !labels[id]
      )
        continue;
      allowed.add(id);
      if (config.text_only_model === true) textOnly.add(id);
    }
  }
  if (allowed.size < 2) return null;
  return {
    labels,
    allowed,
    textOnly,
    managed: value.organization_model_policy !== null,
    councilModel: value.default_models.agentic_research,
  };
}
export function councilModelIssues(
  models: string[],
  catalog: CouncilCatalog,
  limits: Record<string, unknown> = {},
): string[] {
  if (!validCouncilModels(models))
    return ["Choose two or three distinct models"];
  if (catalog.managed)
    return ["Managed-account model policy requires explicit selection"];
  return models.flatMap((id) =>
    !catalog.allowed.has(id)
      ? [`Unavailable: ${catalog.labels[id] ?? id}`]
      : typeof limits[id] === "number" && limits[id] <= 0
        ? [`Limit reached: ${catalog.labels[id] ?? id}`]
        : limits.__blockTextOnly === true && catalog.textOnly?.has(id)
          ? [`Cannot use with these attachments: ${catalog.labels[id] ?? id}`]
          : [],
  );
}
export function extractCouncilRuns(
  value: unknown,
  councilModel = "pplx_agentic_research",
): Array<{ requestId: string; models: string[] }> {
  if (!record(value) || !record(value.streams)) return [];
  const runs: Array<{ requestId: string; models: string[] }> = [];
  for (const [requestId, stream] of Object.entries(value.streams)) {
    if (
      !requestId ||
      requestId.length > 200 ||
      !record(stream) ||
      !record(stream.params) ||
      stream.params.model_preference !== councilModel ||
      stream.params.resume_entry_uuid != null
    )
      continue;
    const models = validCouncilModels(stream.params.compare_model_preferences);
    if (models) runs.push({ requestId, models });
  }
  return runs;
}
function displayName(fiber: Fiber) {
  return (fiber as Fiber & { type?: { displayName?: string } }).type
    ?.displayName;
}
function sameModels(a: unknown, b: string[]) {
  return (
    Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i])
  );
}
export function readCouncilNative(): CouncilNative | null {
  const anchor = document.querySelector<HTMLButtonElement>(
    '[data-testid="ask-input-mode-toggle-width-wrapper"] button[aria-pressed="true"]',
  );
  if (!anchor || anchor.disabled) return null;
  const composer = anchor.closest<HTMLElement>("[data-composer]");
  if (!composer) return null;
  let config: Record<string, unknown> | undefined;
  let account: string | undefined;
  let scope = "home";
  let mode: string | undefined;
  let streams: NativeStreamStore | null = null;
  let fiber = getElementFiber(anchor);
  for (
    let depth = 0;
    fiber && depth < 512;
    depth++, fiber = fiber.return ?? null
  ) {
    const props = fiber.memoizedProps;
    if (!record(props)) continue;
    if (
      mode == null &&
      props.testIdPrefix === "ask-input-mode-toggle" &&
      Array.isArray(props.items) &&
      typeof props.value === "string"
    )
      mode = props.value;
    const value = props.value;
    if (
      displayName(fiber) === "StreamStateContext" &&
      value != null &&
      (typeof value === "function" || record(value))
    ) {
      const api = value as Partial<NativeStreamStore>;
      if (
        typeof api.getState === "function" &&
        typeof api.subscribe === "function"
      )
        streams = api as NativeStreamStore;
    }
    if (!record(value)) continue;
    if (
      !config &&
      Array.isArray(value.compareModels) &&
      typeof value.setConfiguredModel === "function"
    )
      config = value;
    if (
      displayName(fiber) === "SessionContext" &&
      value.status === "authenticated" &&
      record(value.session) &&
      record(value.session.user)
    ) {
      const user = value.session.user;
      const org = user.org_uuid == null ? "personal" : user.org_uuid;
      if (
        typeof user.id === "string" &&
        /^[A-Za-z0-9_-]{1,100}$/.test(user.id) &&
        typeof org === "string" &&
        /^[A-Za-z0-9_-]{1,100}$/.test(org)
      )
        account = `${user.id}|${org}`;
    }
    if (
      displayName(fiber) === "ResultsContext" &&
      typeof value.currentThreadId === "string" &&
      value.currentThreadId
    )
      scope = value.currentThreadId;
  }
  if (
    !account ||
    !config ||
    !mode ||
    !Array.isArray(config.compareModels) ||
    !Array.from(config.compareModels).every(modelId) ||
    config.compareModels.length > 3
  )
    return null;
  const models = [...config.compareModels] as string[];
  const limits = record(config.modelSpecificLimits)
    ? { ...config.modelSpecificLimits }
    : {};
  let setModels: CouncilNative["setModels"] = null;
  if (mode === "agentic_research") {
    for (const button of composer.querySelectorAll<HTMLButtonElement>(
      "button",
    )) {
      if (!/^\d+ models?$/.test(button.getAttribute("aria-label") ?? ""))
        continue;
      let node = getElementFiber(button);
      for (
        let depth = 0;
        node && depth < 60;
        depth++, node = node.return ?? null
      ) {
        const props = node.memoizedProps;
        if (
          !record(props) ||
          props.multiple !== true ||
          !sameModels(props.models, models) ||
          typeof props.onModelsChange !== "function" ||
          props.minModels !== 2 ||
          props.maxModels !== 3
        )
          continue;
        if (props.enabled !== false && props.disabled !== true)
          setModels = props.onModelsChange as (models: string[]) => void;
        if (
          record(props.restrictions) &&
          props.restrictions.allowTextOnlyModels === false
        )
          limits.__blockTextOnly = true;
        break;
      }
      if (setModels) break;
    }
  }
  return {
    account,
    scope,
    mode,
    composer,
    anchor,
    models,
    limits,
    setModels,
    streams,
  };
}
