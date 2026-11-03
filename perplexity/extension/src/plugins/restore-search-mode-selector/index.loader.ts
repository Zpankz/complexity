import { AsyncLoaderRegistry } from "@/entrypoints/contexts/content-scripts/services/async-loaders";
import { registerCouncilMemoryBridge } from "@/plugins/restore-search-mode-selector/council-bridge";
import { CouncilStorageService } from "@/plugins/restore-search-mode-selector/council-storage.bg-worker";
import { injectMainWorldScript } from "@/utils/dom-utils/generics";

import menuScript from "@/plugins/restore-search-mode-selector/main-world?script&module";

declare module "@/entrypoints/contexts/content-scripts/services/async-loaders" {
  interface AsyncLoadersRegistry {
    "plugin:restoreSearchModeSelector": void;
  }
}
export default function register() {
  AsyncLoaderRegistry.register({
    id: "plugin:restoreSearchModeSelector",
    dependencies: ["cache:pluginsEnableStates"],
    loader: async ({ "cache:pluginsEnableStates": enabled }) => {
      if (!enabled.restoreSearchModeSelector) return;
      registerCouncilMemoryBridge(CouncilStorageService.Proxy);
      await injectMainWorldScript({
        url: chrome.runtime.getURL(menuScript),
        head: true,
      });
    },
  });
}
