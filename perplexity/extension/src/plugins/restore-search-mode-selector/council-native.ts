export type NativeStreamStore = { getState(): unknown; subscribe(listener: () => void): () => void };
export type CouncilNative = {
  account: string;
  scope: string;
  mode: string;
  composer: HTMLElement;
  anchor: HTMLButtonElement;
  models: string[];
  limits: Record<string, unknown>;
  setModels: ((models: string[]) => void) | null;
  streams: NativeStreamStore | null;
};
export type CouncilCatalog = { labels: Record<string,string>; allowed: Set<string>; managed: boolean; councilModel: string };
export function validCouncilModels(_value: unknown): string[] | null { return null; }
export function parseCouncilCatalog(_value: unknown): CouncilCatalog | null { return null; }
export function councilModelIssues(_models: string[], _catalog: CouncilCatalog, _limits: Record<string,unknown> = {}): string[] { return ["Unavailable"]; }
export function extractCouncilRuns(_value: unknown, _councilModel = "pplx_agentic_research"): Array<{requestId:string; models:string[]}> { return []; }
export function readCouncilNative(): CouncilNative | null { return null; }
