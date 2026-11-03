import type {
  CouncilMemoryStore,
  CouncilRecord,
  CouncilSelection,
} from "@/plugins/restore-search-mode-selector/council-types";

export type CouncilStorageAdapter = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
};

const ACCOUNT = /^[A-Za-z0-9_-]+(?:\|[A-Za-z0-9_-]+)?$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function validAccount(value: unknown): value is string {
  return (
    typeof value === "string" && value.length <= 200 && ACCOUNT.test(value)
  );
}

function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function validModels(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 3 &&
    Array.from(value).every(validId) &&
    new Set(value).size === value.length
  );
}

function validKind(value: unknown): value is "selected" | "submitted" {
  return value === "selected" || value === "submitted";
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function own(value: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, key)
    ? value[key]
    : undefined;
}

function selection(value: unknown): CouncilSelection | undefined {
  if (!object(value)) return;
  const models = own(value, "models");
  const at = own(value, "at");
  if (validModels(models) && validTimestamp(at))
    return { models: [...models], at };
}

/** Copy and allowlist persisted data; never retain prompts or unknown metadata. */
function sanitize(value: unknown): CouncilRecord {
  const record: CouncilRecord = {};
  if (!object(value)) return record;
  const selected = selection(own(value, "selected"));
  if (selected) record.selected = selected;
  const rawSubmitted = own(value, "submitted");
  const submitted = selection(rawSubmitted);
  const requestId = object(rawSubmitted)
    ? own(rawSubmitted, "requestId")
    : undefined;
  if (submitted && validId(requestId))
    record.submitted = { ...submitted, requestId };
  return record;
}

/** One background-owned instance serializes read/modify/write operations. */
export function createCouncilMemoryStore(
  adapter: CouncilStorageAdapter,
): CouncilMemoryStore {
  let tail: Promise<void> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  function key(account: string): string {
    if (!validAccount(account)) throw new Error("Invalid Council account ID");
    return `local:council-model-memory:v1:${account}`;
  }

  return {
    async read(account) {
      const storageKey = key(account);
      return enqueue(async () => sanitize(await adapter.get(storageKey)));
    },
    async write(account, kind, models, at, requestId) {
      const storageKey = key(account);
      if (!validKind(kind)) throw new Error("Invalid Council memory kind");
      if (!validModels(models)) throw new Error("Invalid Council model IDs");
      if (!validTimestamp(at)) throw new Error("Invalid Council timestamp");
      if (kind === "submitted" && !validId(requestId))
        throw new Error("Invalid Council request ID");
      // Capture caller-owned data now, before waiting behind another operation.
      const captured = { models: [...models], at };
      return enqueue(async () => {
        const record = sanitize(await adapter.get(storageKey));
        const existing = record[kind];
        if (existing && existing.at > at) return record;
        if (kind === "submitted")
          record.submitted = { ...captured, requestId: requestId! };
        else record.selected = captured;
        // The backend and caller each receive separate, sanitized object graphs.
        await adapter.set(storageKey, sanitize(record));
        return sanitize(record);
      });
    },
  };
}
