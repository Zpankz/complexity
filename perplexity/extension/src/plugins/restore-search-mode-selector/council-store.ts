import type { CouncilMemoryStore } from "./council-types";

export type CouncilStorageAdapter = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
};

export function createCouncilMemoryStore(_adapter: CouncilStorageAdapter): CouncilMemoryStore {
  return {
    async read() { throw new Error("Council memory not implemented"); },
    async write() { throw new Error("Council memory not implemented"); },
  };
}
