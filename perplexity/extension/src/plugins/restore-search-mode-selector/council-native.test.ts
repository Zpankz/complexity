import { afterEach, describe, expect, it, vi } from "vitest";

import {
  validCouncilModels,
  parseCouncilCatalog,
  councilModelIssues,
  extractCouncilRuns,
  readCouncilNative,
} from "@/plugins/restore-search-mode-selector/council-native";

const models = ["model_a", "model_b", "model_c_thinking"];
const rawCatalog = {
  organization_model_policy: null,
  models: {
    model_a: { label: "Model A", mode: "search", replaced_by: null },
    model_b: { label: "Model B", mode: "search", replaced_by: null },
    model_c_thinking: {
      label: "Model C Thinking",
      mode: "search",
      replaced_by: null,
    },
    old: { label: "Old", mode: "search", replaced_by: "model_a" },
  },
  search_config: [
    { non_reasoning_model: "model_a", reasoning_model: "model_b" },
    { non_reasoning_model: null, reasoning_model: "model_c_thinking" },
  ],
  default_models: { agentic_research: "pplx_agentic_research" },
};
afterEach(() => vi.unstubAllGlobals());

describe("verified Council state and catalog", () => {
  it("preserves exact ordered model and reasoning IDs", () => {
    expect(validCouncilModels(models)).toEqual(models);
  });
  it.each(
    [
      [],
      ["a"],
      ["a", "a"],
      ["a", "b", "c", "d"],
      ["a", null],
      ["a", "bad model"],
      "a,b",
    ].map((value) => [value]),
  )("rejects malformed selection %j", (value) => {
    expect(validCouncilModels(value)).toBeNull();
  });
  it("uses current selectable search configs, not deprecated model aliases or defaults", () => {
    const catalog = parseCouncilCatalog(rawCatalog)!;
    expect([...catalog.allowed]).toEqual(models);
    expect(catalog.labels.model_c_thinking).toBe("Model C Thinking");
    expect(catalog.allowed.has("old")).toBe(false);
    expect(councilModelIssues(models, catalog)).toEqual([]);
    expect(councilModelIssues(["model_a", "old"], catalog)).not.toEqual([]);
  });
  it("does not guess managed-account restrictions", () => {
    const catalog = parseCouncilCatalog({
      ...rawCatalog,
      organization_model_policy: { unknown: true },
    })!;
    expect(catalog.managed).toBe(true);
    expect(councilModelIssues(models, catalog)).not.toEqual([]);
  });
  it("reports exhausted model limits without silently replacing the model", () => {
    const catalog = parseCouncilCatalog(rawCatalog)!;
    expect(councilModelIssues(models, catalog, { model_b: 0 })).not.toEqual([]);
    expect(councilModelIssues(models, catalog, { model_b: 10 })).toEqual([]);
  });
  it.each([null, {}, { models: {}, search_config: [] }])(
    "rejects unavailable or empty catalog %j",
    (value) => {
      expect(parseCouncilCatalog(value)).toBeNull();
    },
  );
  it("records actual Council stream model preferences, not UI defaults", () => {
    const runs = extractCouncilRuns({
      streams: {
        run1: {
          params: {
            model_preference: "pplx_agentic_research",
            compare_model_preferences: models,
            query_str: "must not escape",
          },
        },
        ordinary: {
          params: {
            model_preference: "claude55opus",
            compare_model_preferences: models,
          },
        },
        reconnect: { params: { resume_entry_uuid: "old" } },
        invalid: {
          params: {
            model_preference: "pplx_agentic_research",
            compare_model_preferences: ["a"],
          },
        },
      },
    });
    expect(runs).toEqual([{ requestId: "run1", models }]);
    expect(JSON.stringify(runs)).not.toContain("must not escape");
  });
});

function nativeFixture({
  account = "user-a",
  org = null as string | null,
  mode = "agentic_research",
  status = "authenticated",
  disabled = false,
  functionalStreams = false,
} = {}) {
  const chain = (
    entries: Array<{ memoizedProps: unknown; type?: { displayName: string } }>,
  ) =>
    entries.reduceRight<object | null>(
      (parent, e) => ({ ...e, return: parent }),
      null,
    );
  const setModels = vi.fn();
  const api = {
    getState: () => ({ streams: {} }),
    subscribe: vi.fn(() => vi.fn()),
  };
  const streams = functionalStreams ? Object.assign(() => undefined, api) : api;
  const config = {
    configuredModel: "pplx_agentic_research",
    askDeepResearchModel: null,
    compareModels: [...models],
    setCompareModels: vi.fn(),
    setConfiguredModel: vi.fn(),
    modelSpecificLimits: {},
  };
  const modelButton = {
    getAttribute: (key: string) => (key === "aria-label" ? "3 models" : null),
    __reactFiber$test: chain([
      {
        memoizedProps: {
          multiple: true,
          models: [...models],
          onModelsChange: setModels,
          enabled: !disabled,
          disabled,
          minModels: 2,
          maxModels: 3,
        },
      },
    ]),
  };
  const composer = { querySelectorAll: () => [modelButton] };
  const anchor = {
    disabled: false,
    getAttribute: () => null,
    closest: () => composer,
    __reactFiber$test: chain([
      {
        memoizedProps: {
          testIdPrefix: "ask-input-mode-toggle",
          value: mode,
          items: [],
          onValueSelect: vi.fn(),
        },
      },
      {
        memoizedProps: { value: config },
        type: { displayName: "ThreadConfigContext" },
      },
      {
        memoizedProps: { value: { currentThreadId: "thread-a" } },
        type: { displayName: "ResultsContext" },
      },
      {
        memoizedProps: { value: streams },
        type: { displayName: "StreamStateContext" },
      },
      {
        memoizedProps: {
          value: { session: { user: { id: account, org_uuid: org } }, status },
        },
        type: { displayName: "SessionContext" },
      },
    ]),
  };
  vi.stubGlobal("document", { querySelector: () => anchor });
  return { anchor, config, composer, setModels, streams };
}
describe("fresh native Council adapter", () => {
  it("binds account and organization, nearest config and native selection callback", () => {
    const f = nativeFixture();
    const state = readCouncilNative()!;
    expect(state.account).toBe("user-a|personal");
    expect(state.scope).toBe("thread-a");
    expect(state.models).toEqual(models);
    expect(state.setModels).toBe(f.setModels);
    expect(state.streams).toBe(f.streams);
    expect(f.setModels).not.toHaveBeenCalled();
  });
  it("recognises the callable Zustand stream store observed live", () => {
    const f = nativeFixture({ functionalStreams: true });
    expect(readCouncilNative()?.streams).toBe(f.streams);
  });
  it("keeps organization accounts separate", () => {
    nativeFixture({ org: "org-b" });
    expect(readCouncilNative()?.account).toBe("user-a|org-b");
  });
  it("does not restore through disabled native model controls", () => {
    nativeFixture({ disabled: true });
    expect(readCouncilNative()?.setModels).toBeNull();
  });
  it("does not expose a Council setter in regular Search", () => {
    nativeFixture({ mode: "search" });
    expect(readCouncilNative()?.setModels).toBeNull();
  });
  it("waits for verified authenticated identity", () => {
    nativeFixture({ status: "loading" });
    expect(readCouncilNative()).toBeNull();
  });
  it("does not reuse a callback whose models belong to another scope", () => {
    const f = nativeFixture();
    f.config.compareModels = ["other_a", "other_b"];
    expect(readCouncilNative()?.setModels).toBeNull();
  });
});
