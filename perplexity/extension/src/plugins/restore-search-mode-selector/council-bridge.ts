import { defineProxy } from "comctx";

import type { CouncilMemoryStore } from "@/plugins/restore-search-mode-selector/council-types";
import { getDocumentAdapter } from "@/utils/wrappers/comctx/get-document-adapter";

const namespace = "complexity:restore-search-mode-selector:council-memory";
let implementation: CouncilMemoryStore | undefined;
let proxy: CouncilMemoryStore | undefined;
const [registerService, getService] = defineProxy(
  () => {
    if (!implementation)
      throw new Error("Council memory bridge is not registered");
    return implementation;
  },
  { namespace, backup: false, heartbeatCheck: false },
);

/** Keep one page from accessing saved preferences for another signed-in account. */
async function verifyAccount(account: string) {
  const response = await fetch("/api/auth/session", {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Cannot verify Council account");
  const session: unknown = await response.json();
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value != null && typeof value === "object" && !Array.isArray(value);
  if (
    !isRecord(session) ||
    !isRecord(session.user) ||
    typeof session.user.id !== "string"
  )
    throw new Error("Council account is unavailable");
  const user = session.user;
  const org = user.org_uuid == null ? "personal" : user.org_uuid;
  if (typeof org !== "string" || `${user.id}|${org}` !== account)
    throw new Error("Council account changed");
}

/** Register only in the isolated content script before loading MAIN-world UI. */
export function registerCouncilMemoryBridge(store: CouncilMemoryStore) {
  implementation = {
    async read(account) {
      await verifyAccount(account);
      return store.read(account);
    },
    async write(account, kind, models, at, requestId) {
      await verifyAccount(account);
      return store.write(account, kind, models, at, requestId);
    },
  };
  registerService(getDocumentAdapter(namespace));
}

/** MAIN world has no Chrome storage permission; only the narrow typed bridge. */
export function getCouncilMemoryBridge(): CouncilMemoryStore {
  proxy ??= getService(getDocumentAdapter(namespace));
  return proxy;
}
