export type LegacyThreadScope = { config: Record<string,unknown>; threadId:string; isActive:boolean };
export function getLegacyThreadScope(_button:HTMLButtonElement):LegacyThreadScope|null { return null; }
export function getIncludedProAction(_option:HTMLElement,_scope:LegacyThreadScope):(()=>void)|null { return null; }
