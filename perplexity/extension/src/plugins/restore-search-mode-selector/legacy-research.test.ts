import { describe, expect, it, vi } from "vitest";
import { getLegacyThreadScope, getIncludedProAction } from "@/plugins/restore-search-mode-selector/legacy-research";

function setup({mode="search", model="pplx_pro", researchModel=null as unknown, followUp=true, threadId="thread-a"}={}) {
  const config={ configuredModel:model, askDeepResearchModel:researchModel, setConfiguredModel:vi.fn() };
  const results={ currentThreadId:threadId, currentStreamId:null };
  const chain=(props: unknown[])=>props.reduceRight<object|null>((parent,memoizedProps)=>({memoizedProps,return:parent}),null);
  const button={ disabled:false, __reactFiber$test:chain([
    {testIdPrefix:"ask-input-mode-toggle",value:mode,items:[],onValueSelect:vi.fn()},
    {isFollowUp:followUp}, {value:config}, {value:results},
    {value:{configuredModel:"pplx_pro",askDeepResearchModel:null,setConfiguredModel:vi.fn()}},
  ]) } as unknown as HTMLButtonElement;
  const onSelect=vi.fn();
  const row={item:{id:"featured:deep-research",payload:{disabled:false,action:{type:"skill",selectableSkill:{name:"deep-research",scope:"global"}}}}};
  const attrs:Record<string,string>={role:"option","aria-disabled":"false"};
  const option={ textContent:"Deep Research Included in Pro",getAttribute:(name:string)=>attrs[name]??null,__reactFiber$test:chain([{row,onSelect},{value:config},{value:results}]) } as unknown as HTMLElement;
  return {config,results,button,option,row,onSelect,attrs};
}

describe("legacy Included in Pro Research",()=>{
  it("identifies the nearest follow-up config without changing it",()=>{
    const f=setup(); const scope=getLegacyThreadScope(f.button);
    expect(scope).toEqual({config:f.config,threadId:"thread-a",isActive:false});
    expect(f.config.setConfiguredModel).not.toHaveBeenCalled();
  });
  it("recognises the observed pplx_alpha research state, not Computer",()=>{
    expect(getLegacyThreadScope(setup({mode:"research",model:"pplx_alpha"}).button)?.isActive).toBe(true);
  });
  it.each([{followUp:false},{threadId:""},{mode:"asi",model:"pplx_asi"},{mode:"research",researchModel:"pplx_alpha"}])("rejects non-legacy scope %j",(args)=>{
    expect(getLegacyThreadScope(setup(args).button)).toBeNull();
  });
  it("rejects disabled or non-React controls",()=>{
    const f=setup();f.button.disabled=true;
    expect(getLegacyThreadScope(f.button)).toBeNull();
    expect(getLegacyThreadScope({} as HTMLButtonElement)).toBeNull();
  });
  it("returns only the enabled native Plus action for this exact thread/config",()=>{
    const f=setup();const action=getIncludedProAction(f.option,getLegacyThreadScope(f.button)!);
    expect(action).toBe(f.onSelect);expect(f.onSelect).not.toHaveBeenCalled();
    action?.();expect(f.onSelect).toHaveBeenCalledTimes(1);
  });
  it.each(["Deep Research","Deep Research May use Computer","Included in Max"])("rejects an option without the Pro badge: %s",text=>{
    const f=setup();Object.assign(f.option,{textContent:text});
    expect(getIncludedProAction(f.option,getLegacyThreadScope(f.button)!)).toBeNull();
  });
  it("rejects a disabled native action",()=>{
    const f=setup();f.attrs["aria-disabled"]="true";
    expect(getIncludedProAction(f.option,getLegacyThreadScope(f.button)!)).toBeNull();
  });
  it("rejects a disabled payload even if DOM looks enabled",()=>{
    const f=setup();f.row.item.payload.disabled=true;
    expect(getIncludedProAction(f.option,getLegacyThreadScope(f.button)!)).toBeNull();
  });
  it.each(["deep-research-other","featured:model-council"])("rejects wrong native item %s",id=>{
    const f=setup();f.row.item.id=id;
    expect(getIncludedProAction(f.option,getLegacyThreadScope(f.button)!)).toBeNull();
  });
  it("rejects a different skill action",()=>{
    const f=setup();f.row.item.payload.action.selectableSkill.name="create-skill";
    expect(getIncludedProAction(f.option,getLegacyThreadScope(f.button)!)).toBeNull();
  });
  it("rejects another thread or a stale provider object",()=>{
    const f=setup();const scope=getLegacyThreadScope(f.button)!;
    expect(getIncludedProAction(f.option,{...scope,threadId:"thread-b"})).toBeNull();
    expect(getIncludedProAction(f.option,{...scope,config:{...scope.config}})).toBeNull();
  });
  it("does not activate text-only lookalikes",()=>{
    const f=setup();delete (f.option as unknown as Record<string,unknown>).__reactFiber$test;
    expect(getIncludedProAction(f.option,getLegacyThreadScope(f.button)!)).toBeNull();
  });
});
