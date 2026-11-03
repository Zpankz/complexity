import type { CouncilMemoryStore } from "./council-types";
export function installCouncilPreferences(_options: { store: CouncilMemoryStore; fetchCatalog?: () => Promise<unknown>; now?: () => number }): () => void {
  return () => {};
}
