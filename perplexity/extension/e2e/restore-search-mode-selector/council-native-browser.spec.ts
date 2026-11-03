import path from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "vite";
let script: string;
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    resolve: { alias: { "@": path.resolve("src") } },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.resolve(
          "src/plugins/restore-search-mode-selector/council-preferences.ts",
        ),
        name: "CouncilIntegration",
        formats: ["iife"],
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!output || !("output" in output)) throw Error("build");
  const chunk = output.output.find((x) => x.type === "chunk");
  if (chunk?.type !== "chunk") throw Error("chunk");
  script = chunk.code;
});
async function fixture(page: import("@playwright/test").Page) {
  await page.route("https://www.perplexity.ai/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<div data-composer style="width:720px;margin:20px"><div data-command-menu-control><span data-testid="ask-input-mode-toggle-width-wrapper" style="display:inline-flex;width:36px;overflow:hidden"><span><button aria-pressed="true" aria-label="Model Council">C</button></span></span></div><button aria-label="3 models">3 models</button><textarea>draft untouched</textarea><button aria-label="Submit">Submit</button></div>`,
    }),
  );
  await page.goto("https://www.perplexity.ai/search/thread-a");
  await page.addScriptTag({
    content: `
    window.writes=[];window.record={selected:{models:['b','c'],at:10},submitted:{models:['c','a'],at:20,requestId:'actual-last-run'}};
    window.config={configuredModel:'pplx_agentic_research',compareModels:['a','b'],modelSpecificLimits:{},setConfiguredModel(){throw Error('wrong setter')}};
    window.picker={multiple:true,models:config.compareModels,enabled:true,minModels:2,maxModels:3,onModelsChange(ids){config.compareModels=[...ids];picker.models=config.compareModels;document.body.dataset.updated=String(Math.random())}};
    const chain=props=>props.reduceRight((ret,memoizedProps)=>({memoizedProps,return:ret}),null);
    const modelButton=document.querySelector('[aria-label="3 models"]');modelButton.__reactFiber$test=chain([picker]);
    window.listeners=new Set();window.nativeStreams={streams:{old:{params:{model_preference:'pplx_agentic_research',compare_model_preferences:['a','b']}}}};
    window.streamStore=Object.assign(()=>{}, {getState:()=>nativeStreams,subscribe:cb=>{listeners.add(cb);return()=>listeners.delete(cb)}});
    const values=[{testIdPrefix:'ask-input-mode-toggle',value:'agentic_research',items:[]},{value:config},{value:{currentThreadId:'thread-a'}},{value:streamStore},{value:{status:'authenticated',session:{user:{id:'user-a',org_uuid:null}}}}];
    const anchor=document.querySelector('[aria-label="Model Council"]');anchor.__reactFiber$test=chain(values);
    let f=anchor.__reactFiber$test;['Toggle','ThreadConfigContext','ResultsContext','StreamStateContext','SessionContext'].forEach(displayName=>{f.type={displayName};f=f.return});
    const raw={organization_model_policy:null,default_models:{agentic_research:'pplx_agentic_research'},models:{a:{label:'Alpha',mode:'search',replaced_by:null},b:{label:'Beta Thinking',mode:'search',replaced_by:null},c:{label:'Gamma',mode:'search',replaced_by:null}},search_config:[{non_reasoning_model:'a',reasoning_model:'b'},{non_reasoning_model:'c',reasoning_model:null}]};
    const store={read:async()=>record,write:async(account,kind,models,at,requestId)=>{writes.push({account,kind,models,requestId});record={...record,[kind]:{models,at,requestId}};return record}};
    ${script};window.cleanup=CouncilIntegration.installCouncilPreferences({store,fetchCatalog:async()=>raw});
  `,
  });
}
test("restores the latest executed Council set and mounts status outside the clipped native selector", async ({
  page,
}) => {
  await fixture(page);
  await expect(
    page.getByTestId("complexity-council-preferences"),
  ).toContainText("Restored");
  expect(await page.evaluate("config.compareModels")).toEqual(["c", "a"]);
  expect(
    await page
      .getByTestId("complexity-council-preferences")
      .evaluate(
        (el) =>
          !!el.closest('[data-testid="ask-input-mode-toggle-width-wrapper"]'),
      ),
  ).toBe(false);
  await expect(page.locator("textarea")).toHaveValue("draft untouched");
});
test("records only new actual requests from the callable native stream store", async ({
  page,
}) => {
  await fixture(page);
  await expect(
    page.getByTestId("complexity-council-preferences"),
  ).toContainText("Restored");
  expect(
    await page.evaluate("writes.filter(x=>x.kind==='submitted').length"),
  ).toBe(0);
  await page.evaluate(
    `nativeStreams.streams.next={params:{model_preference:'pplx_agentic_research',compare_model_preferences:['b','c'],query_str:'private prompt never persist'}};listeners.forEach(cb=>cb())`,
  );
  await expect
    .poll(() =>
      page.evaluate("writes.filter(x=>x.kind==='submitted').map(x=>x.models)"),
    )
    .toEqual([["b", "c"]]);
  expect(await page.evaluate("JSON.stringify(writes)")).not.toContain(
    "private prompt",
  );
});
