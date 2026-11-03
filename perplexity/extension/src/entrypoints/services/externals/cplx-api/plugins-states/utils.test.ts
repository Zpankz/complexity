import { describe, expect, it, vi } from "vitest";

import type { FeatureCompatibility } from "@/entrypoints/services/externals/cplx-api/plugins-states/types";
import {
  updatePluginStatesWithFeatureCompat,
  type PluginsStates,
} from "@/entrypoints/services/externals/cplx-api/plugins-states/utils";

vi.mock("@/entrypoints/services/plugins", () => ({
  PluginsRegistryService: {
    entries: {
      restoreSearchModeSelector: {
        meta: { fallbackCompatibilityVersion: "2.9.19" },
        dashboardMeta: {},
      },
      noFocusByDefault: { meta: {}, dashboardMeta: {} },
    },
  },
}));
vi.mock("@/entrypoints/services/plugins/predicates", () => ({
  isPublicPlugin: () => true,
}));
vi.mock("@/entrypoints/services/plugins/utils", () => ({
  getPluginIds: () => [],
  getPluginDependencies: () => [],
  getPluginDependents: () => [],
}));

function compatibility(
  remote: Record<string, string> = {},
  currentVersion = "2.9.19",
) {
  return updatePluginStatesWithFeatureCompat({
    pluginsStates: {
      restoreSearchModeSelector: { isOutdated: false, isOnMaintenance: false },
      noFocusByDefault: { isOutdated: false, isOnMaintenance: false },
    } as PluginsStates,
    featureCompat: remote as FeatureCompatibility,
    currentVersion,
    latestAvailableVersion: currentVersion,
  });
}

describe("opt-in fallback plugin compatibility", () => {
  it("allows only a plugin explicitly declaring a tested fallback version", () => {
    expect(compatibility().restoreSearchModeSelector.isOutdated).toBe(false);
    expect(compatibility().noFocusByDefault.isOutdated).toBe(true);
  });
  it("keeps upstream's newer minimum authoritative", () => {
    expect(
      compatibility({ restoreSearchModeSelector: "2.9.20" })
        .restoreSearchModeSelector.isOutdated,
    ).toBe(true);
  });
  it("accepts an upstream version meeting the installed build", () => {
    expect(
      compatibility({ restoreSearchModeSelector: "2.9.19" })
        .restoreSearchModeSelector.isOutdated,
    ).toBe(false);
  });
  it("rejects builds below the fallback's tested version", () => {
    expect(
      compatibility({}, "2.9.18").restoreSearchModeSelector.isOutdated,
    ).toBe(true);
  });
});
