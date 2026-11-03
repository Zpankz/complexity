import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CouncilMemoryStore } from "@/plugins/restore-search-mode-selector/council-types";

vi.mock("comctx", () => ({
  defineProxy: (root: () => CouncilMemoryStore) => [
    () => undefined,
    () => root(),
  ],
}));
vi.mock("@/utils/wrappers/comctx/get-document-adapter", () => ({
  getDocumentAdapter: () => ({}),
}));
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
async function fixture(
  session: unknown = { user: { id: "user-a", org_uuid: null } },
  ok = true,
) {
  const request = vi.fn(async () => ({ ok, json: async () => session }));
  vi.stubGlobal("fetch", request);
  const store = {
    read: vi.fn(async () => ({ selected: { models: ["a", "b"], at: 1 } })),
    write: vi.fn(async () => ({})),
  };
  const { registerCouncilMemoryBridge, getCouncilMemoryBridge } =
    await import("@/plugins/restore-search-mode-selector/council-bridge");
  registerCouncilMemoryBridge(store);
  return { proxy: getCouncilMemoryBridge(), store, request };
}
describe("account-bound isolated Council bridge", () => {
  it("verifies the current session before returning saved models", async () => {
    const f = await fixture();
    expect((await f.proxy.read("user-a|personal")).selected?.models).toEqual([
      "a",
      "b",
    ]);
    expect(f.request).toHaveBeenCalledWith("/api/auth/session", {
      credentials: "include",
      cache: "no-store",
    });
    expect(f.store.read).toHaveBeenCalledWith("user-a|personal");
  });
  it("keeps organization scopes distinct", async () => {
    const f = await fixture({ user: { id: "user-a", org_uuid: "org-b" } });
    await f.proxy.read("user-a|org-b");
    expect(f.store.read).toHaveBeenCalledOnce();
    await expect(f.proxy.read("user-a|personal")).rejects.toThrow(
      "account changed",
    );
  });
  it("does not read another account's record", async () => {
    const f = await fixture();
    await expect(f.proxy.read("user-b|personal")).rejects.toThrow(
      "account changed",
    );
    expect(f.store.read).not.toHaveBeenCalled();
  });
  it.each([
    null,
    {},
    { user: {} },
    { user: { id: 12 } },
    { user: { id: "user-a", org_uuid: 12 } },
  ])("fails closed for malformed sessions %j", async (session) => {
    const f = await fixture(session);
    await expect(f.proxy.read("user-a|personal")).rejects.toThrow();
    expect(f.store.read).not.toHaveBeenCalled();
  });
  it("does not forward writes when authentication fails", async () => {
    const f = await fixture(null, false);
    await expect(
      f.proxy.write("user-a|personal", "selected", ["a", "b"], 1),
    ).rejects.toThrow();
    expect(f.store.write).not.toHaveBeenCalled();
  });
  it("forwards only the typed model record after account verification", async () => {
    const f = await fixture();
    await f.proxy.write(
      "user-a|personal",
      "submitted",
      ["a", "b"],
      20,
      "request-a",
    );
    expect(f.store.write).toHaveBeenCalledWith(
      "user-a|personal",
      "submitted",
      ["a", "b"],
      20,
      "request-a",
    );
  });
});
