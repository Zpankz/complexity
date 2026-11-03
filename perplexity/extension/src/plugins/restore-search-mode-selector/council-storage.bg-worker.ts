import { BrowserRuntimeAdapter } from "@comctx-adapters/core";
import { storage } from "@wxt-dev/storage";
import { defineProxy } from "comctx";

import { createCouncilMemoryStore } from "@/plugins/restore-search-mode-selector/council-store";
import type { CouncilMemoryStore } from "@/plugins/restore-search-mode-selector/council-types";
import { isBackgroundScript } from "@/utils/misc/utils";

let rootServiceInstance: CouncilMemoryStore | undefined;
let proxyServiceInstance: CouncilMemoryStore | undefined;

const [registerService, getService] = defineProxy(getCouncilRootService, {
  namespace: "CouncilStorageService",
  backup: false,
  heartbeatCheck: false,
});

function getCouncilRootService(): CouncilMemoryStore {
  invariant(isBackgroundScript(), "[CouncilStorageService] Invalid context");
  rootServiceInstance ??= createCouncilMemoryStore({
    get: (key) => storage.getItem<unknown>(key as `local:${string}`),
    set: (key, value) => storage.setItem(key as `local:${string}`, value),
  });
  return rootServiceInstance;
}

function getCouncilProxyService(): CouncilMemoryStore {
  invariant(!isBackgroundScript(), "[CouncilStorageService] Invalid context");
  proxyServiceInstance ??= getService(new BrowserRuntimeAdapter());
  return proxyServiceInstance;
}

/** Import only from isolated extension contexts, never from MAIN-world code. */
export const CouncilStorageService = {
  get Root() {
    return getCouncilRootService();
  },
  get Proxy() {
    return getCouncilProxyService();
  },
  get Instance() {
    return isBackgroundScript()
      ? getCouncilRootService()
      : getCouncilProxyService();
  },
};

export default function () {
  registerService(new BrowserRuntimeAdapter());
}
