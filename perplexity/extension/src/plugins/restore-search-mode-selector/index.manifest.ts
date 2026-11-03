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
    "Restore Search/chat modes, remember exact Council models per account, and copy readable skill files as plain prompt context. Native plan and runtime limits still apply.",
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
