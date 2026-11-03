export type CouncilSelection = { models: string[]; at: number };
export type CouncilRecord = {
  selected?: CouncilSelection;
  submitted?: CouncilSelection & { requestId: string };
};
export type CouncilMemoryStore = {
  read(account: string): Promise<CouncilRecord>;
  write(
    account: string,
    kind: "selected" | "submitted",
    models: string[],
    at: number,
    requestId?: string,
  ): Promise<CouncilRecord>;
};
