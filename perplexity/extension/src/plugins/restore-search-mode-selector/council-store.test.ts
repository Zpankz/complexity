import { describe, expect, it, vi } from "vitest";

import { createCouncilMemoryStore } from "@/plugins/restore-search-mode-selector/council-store";

const account = "ea447f1b-2656-442b-8850-227bcbb2c503|personal";
const org =
  "ea447f1b-2656-442b-8850-227bcbb2c503|57f1ecbd-6562-45d4-823c-378cd199050f";
const models = ["gpt56_terra", "claude50opus"];
function fixture(initial?: unknown) {
  const values = new Map<string, unknown>();
  const get = vi.fn(async (key: string) =>
    values.has(key) ? values.get(key) : initial,
  );
  const set = vi.fn(async (key: string, value: unknown) => {
    values.set(key, value);
  });
  return { store: createCouncilMemoryStore({ get, set }), get, set, values };
}

describe("Council durable model memory", () => {
  it("returns an empty record for absent storage", async () => {
    expect(await fixture().store.read(account)).toEqual({});
  });

  it("persists separate account keys and survives a new adapter instance", async () => {
    const { store, get, set } = fixture();
    await store.write(account, "selected", models, 10);
    await store.write(
      org,
      "submitted",
      [...models, "kimik3thinking"],
      20,
      "request-1",
    );
    const reopened = createCouncilMemoryStore({ get, set });
    expect(await reopened.read(account)).toEqual({
      selected: { models, at: 10 },
    });
    expect(await reopened.read(org)).toEqual({
      submitted: {
        models: [...models, "kimik3thinking"],
        at: 20,
        requestId: "request-1",
      },
    });
    expect(set.mock.calls[0]?.[0]).not.toEqual(set.mock.calls[1]?.[0]);
    expect([...set.mock.calls].every(([key]) => key.startsWith("local:"))).toBe(
      true,
    );
  });

  it("merges only the intended field, and older timestamps cannot replace newer ones", async () => {
    const { store } = fixture();
    await store.write(account, "selected", models, 20);
    await store.write(account, "submitted", ["a", "b"], 30, "request-2");
    await store.write(account, "selected", ["x", "y"], 19);
    const result = await store.write(
      account,
      "submitted",
      ["x", "y"],
      29,
      "old",
    );
    expect(result).toEqual({
      selected: { models, at: 20 },
      submitted: { models: ["a", "b"], at: 30, requestId: "request-2" },
    });
  });

  it.each([
    "",
    " ",
    "../account",
    "account?prompt=secret",
    "x\ny",
    "x\n",
    "a|b|c",
    "a".repeat(201),
    null,
    1,
  ])("rejects invalid account %j before touching storage", async (bad) => {
    const { store, get, set } = fixture();
    await expect(store.read(bad as string)).rejects.toThrow();
    await expect(
      store.write(bad as string, "selected", models, 1),
    ).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it.each(
    [
      [],
      ["a"],
      ["a", "b", "c", "d"],
      ["a", "a"],
      ["a", ""],
      ["a", " "],
      ["a", "../b"],
      ["a", "b?query=secret"],
      ["a", "x".repeat(201)],
      ["a", 1],
      Object.assign(new Array<string>(2), { 0: "a" }),
      null,
    ].map((value) => [value]),
  )("rejects invalid model IDs %j", async (bad) => {
    const { store, get, set } = fixture();
    await expect(
      store.write(account, "selected", bad as string[], 1),
    ).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Infinity, -Infinity, "1", null])(
    "rejects invalid timestamp %j",
    async (at) => {
      const { store, set } = fixture();
      await expect(
        store.write(account, "selected", models, at as number),
      ).rejects.toThrow();
      expect(set).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    "",
    " ",
    "x".repeat(201),
    "request\n1",
    "request\n",
    "request?prompt=secret",
    2,
  ])("requires a safe submitted request ID %j", async (requestId) => {
    const { store, set } = fixture();
    await expect(
      store.write(account, "submitted", models, 1, requestId as string),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects unknown write kinds and drops submitted metadata from selected writes", async () => {
    const { store, set } = fixture();
    await expect(
      store.write(account, "prompt" as "selected", models, 1),
    ).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
    expect(
      await store.write(account, "selected", models, 1, "not-stored"),
    ).toEqual({ selected: { models, at: 1 } });
  });

  it("retains only sanitized fields when reading and merging corrupt stored data", async () => {
    const initial = {
      selected: { models, at: 3, query: "secret", requestId: "drop" },
      submitted: { models: ["a"], at: 5, requestId: "invalid" },
      prompt: "secret",
      arbitrary: true,
    };
    const { store, set } = fixture(initial);
    expect(await store.read(account)).toEqual({ selected: { models, at: 3 } });
    await store.write(account, "submitted", ["a", "b"], 6, "req-6");
    expect(set.mock.calls[0]?.[1]).toEqual({
      selected: { models, at: 3 },
      submitted: { models: ["a", "b"], at: 6, requestId: "req-6" },
    });
  });

  it.each([
    null,
    "{bad-json",
    [],
    5,
    { selected: { models, at: Infinity } },
    { submitted: { models, at: 2 } },
    { selected: { models: ["a", "a"], at: 1 } },
  ])("discards malformed stored records %j", async (initial) => {
    expect(await fixture(initial).store.read(account)).toEqual({});
  });

  it("does not read inherited fields", async () => {
    expect(
      await fixture(Object.create({ selected: { models, at: 3 } })).store.read(
        account,
      ),
    ).toEqual({});
  });

  it("serializes simultaneous read-modify-writes and reads behind pending writes", async () => {
    const { store } = fixture();
    const selected = store.write(account, "selected", models, 10);
    const submitted = store.write(
      account,
      "submitted",
      ["a", "b"],
      20,
      "request-20",
    );
    const read = store.read(account);
    const results = await Promise.all([selected, submitted, read]);
    expect(results[2]).toEqual({
      selected: { models, at: 10 },
      submitted: { models: ["a", "b"], at: 20, requestId: "request-20" },
    });
  });

  it("recovers its queue after a failed read or write", async () => {
    const { store, get, set } = fixture();
    get.mockRejectedValueOnce(new Error("read failed"));
    await expect(store.read(account)).rejects.toThrow("read failed");
    set.mockRejectedValueOnce(new Error("write failed"));
    await expect(store.write(account, "selected", models, 1)).rejects.toThrow(
      "write failed",
    );
    expect(await store.write(account, "selected", models, 2)).toEqual({
      selected: { models, at: 2 },
    });
  });

  it("copies inputs before queuing and every output including backend references", async () => {
    const { store, values } = fixture();
    const input = [...models];
    const pending = store.write(account, "submitted", input, 10, "request-10");
    input[0] = "mutated";
    const written = await pending;
    written.submitted!.models[0] = "returned-mutation";
    const first = await store.read(account);
    expect(first.submitted?.models).toEqual(models);
    first.submitted!.models.push("read-mutation");
    expect((await store.read(account)).submitted?.models).toEqual(models);
    expect([...values.values()][0]).toEqual({
      submitted: { models, at: 10, requestId: "request-10" },
    });
  });
});

const background = vi.hoisted(() => ({
  active: true,
  register: vi.fn(),
  getProxy: vi.fn(() => ({ read: vi.fn(), write: vi.fn() })),
  get: vi.fn(async (_key: string): Promise<unknown> => null),
  set: vi.fn(async (_key: string, _value: unknown) => {}),
  define: vi.fn(),
}));

vi.mock("@comctx-adapters/core", () => ({ BrowserRuntimeAdapter: class {} }));
vi.mock("@wxt-dev/storage", () => ({
  storage: { getItem: background.get, setItem: background.set },
}));
vi.mock("comctx", () => ({
  defineProxy: (factory: unknown, options: unknown) => {
    background.define(factory, options);
    return [background.register, background.getProxy];
  },
}));
vi.mock("@/utils/misc/utils", () => ({
  isBackgroundScript: () => background.active,
  invariant: (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
  },
}));

describe("Council background proxy", () => {
  it("registers a named runtime service and exposes guarded Root/Proxy/Instance singletons", async () => {
    const { default: register, CouncilStorageService } =
      await import("./council-storage.bg-worker");
    expect(background.define).toHaveBeenCalledWith(expect.any(Function), {
      namespace: "CouncilStorageService",
      backup: false,
      heartbeatCheck: false,
    });
    register();
    expect(background.register).toHaveBeenCalledOnce();
    const root = CouncilStorageService.Root;
    expect(CouncilStorageService.Root).toBe(root);
    expect(CouncilStorageService.Instance).toBe(root);
    expect(() => CouncilStorageService.Proxy).toThrow();
    expect(await root.read(account)).toEqual({});
    await root.write(account, "selected", models, 1);
    expect(background.get).toHaveBeenCalledWith(
      `local:council-model-memory:v1:${account}`,
    );
    expect(background.set).toHaveBeenCalledWith(
      `local:council-model-memory:v1:${account}`,
      { selected: { models, at: 1 } },
    );
    background.active = false;
    try {
      const proxy = CouncilStorageService.Proxy;
      expect(CouncilStorageService.Instance).toBe(proxy);
      expect(CouncilStorageService.Proxy).toBe(proxy);
      expect(background.getProxy).toHaveBeenCalledOnce();
      expect(() => CouncilStorageService.Root).toThrow();
    } finally {
      background.active = true;
    }
  });
});
