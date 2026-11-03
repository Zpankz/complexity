import {
  definePluginDashboardMeta,
  definePluginMeta,
} from "@/entrypoints/services/plugins/defines";
import type { PluginManifestExports } from "@/entrypoints/services/plugins/types";
import {
  settingsSchemas,
  settingsStorage,
} from "@/plugins/restore-search-mode-selector/settings";

declare module "@/entrypoints/services/plugins/types" {
  interface PluginsRegistry {
    [meta.id]: typeof manifest;
  }
}

const meta = definePluginMeta({
  id: "restoreSearchModeSelector",
  fallbackCompatibilityVersion: "2.9.19",
  name: "Restore Search Mode Selector",
  description:
    "Restore the home Search menu and expose Included in Pro Deep Research in existing Search chats. Uses Perplexity's native actions; plan limits still apply.",
});
const dashboardMeta = definePluginDashboardMeta({
  tags: ["ui", "experimental"],
  categories: ["queryBox"],
  uiRouteSegment: "restore-search-mode-selector",
});
const manifest = {
  meta,
  dashboardMeta,
  settingsSchemas,
  settingsStorage,
} satisfies PluginManifestExports;
export default manifest;
