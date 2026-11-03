import path from "node:path";

import { test, expect, type Page } from "@playwright/test";
import { build } from "vite";
let script: string;
const status = (page: Page) =>
  page.getByTestId("complexity-council-preferences");
const shim = `
export function readCouncilNative(){return window.nativeState && {...window.nativeState,composer:document.querySelector('form'),anchor:document.querySelector('#mode'),setModels: window.noCallback?null:ids=>{window.calls.push(ids);if(window.callbackFail)throw Error('callback failed');if(!window.noApply){window.nativeState.models=[...ids];window.touch()}},streams:window.streams}}
export function validCouncilModels(v){return Array.isArray(v)&&v.length>=2&&v.length<=3&&v.every(x=>typeof x==='string'&&x.length)&&new Set(v).size===v.length?[...v]:null}
export function parseCouncilCatalog(v){return v?{labels:v.labels,allowed:new Set(v.allowed),managed:!!v.managed,councilModel:'council'}:null}
export function councilModelIssues(ids,c,l={}){if(c.managed)return ['Managed policy requires explicit selection'];return ids.filter(id=>!c.allowed.has(id)||l[id]===0).map(id=>'Unavailable '+id)}
export function extractCouncilRuns(s,m){return (s||[]).filter(x=>x.params?.model_preference===m&&validCouncilModels(x.params.compare_model_preferences)).map(x=>({requestId:x.requestId,models:x.params.compare_model_preferences}))}
`;
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    plugins: [
      {
        name: "fake-native",
        enforce: "pre",
        resolveId(id) {
          if (id.endsWith("council-native")) return "\0native";
        },
        load(id) {
          if (id === "\0native") return shim;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.resolve(
          "src/plugins/restore-search-mode-selector/council-preferences.ts",
        ),
        name: "CouncilTest",
        formats: ["iife"],
      },
    },
  });
  const out = Array.isArray(result) ? result[0] : result;
  if (!out || !("output" in out)) throw Error("build");
  const chunk = out.output.find((x) => x.type === "chunk");
  if (chunk?.type !== "chunk") throw Error("chunk");
  script = chunk.code;
});
async function fixture(page: Page, options: Record<string, unknown> = {}) {
  await page.route("https://www.perplexity.ai/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<form><button id="mode" type="button">Council</button><button type="button" aria-label="2 models">Models</button><textarea>keep my draft</textarea><button type="submit" aria-label="Submit">Submit</button></form><i></i>',
    }),
  );
  await page.goto("https://www.perplexity.ai/");
  await page.addScriptTag({
    content: `window.opts=${JSON.stringify(options)};window.calls=[];window.writes=[];window.submits=0;window.touch=()=>document.querySelector('i').textContent=Math.random();window.nativeState={account:'alice:org',scope:'home',mode:'agentic_research',models:['a','b'],limits:{}};window.records=JSON.parse(localStorage.records||'{}');if(opts.saved){records['alice:org']={selected:{models:opts.saved,at:1}};localStorage.records=JSON.stringify(records)};window.callbackFail=opts.callbackFail;window.noApply=opts.noApply;window.noCallback=opts.noCallback;window.listeners=new Set();window.runs=opts.runs||[];window.streams={getState:()=>runs,subscribe:cb=>{listeners.add(cb);return()=>listeners.delete(cb)}};window.emit=r=>{runs.push(r);listeners.forEach(cb=>cb())};window.store={read:async a=>{if(opts.readFail)throw Error('read denied');return records[a]||{}},write:async(a,k,models,at,requestId)=>{if(opts.writeFail)throw Error('write denied');writes.push({a,k,models,requestId});records[a]={...records[a],[k]:{models,at,...(requestId?{requestId}:{})}};localStorage.records=JSON.stringify(records);return records[a]}};document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submits++});window.catalog={labels:{a:'Alpha',b:'Beta Thinking',c:'Gamma'},allowed:['a','b','c'],managed:opts.managed};${script};window.install=()=>CouncilTest.installCouncilPreferences({store,fetchCatalog:async()=>{if(opts.delayCatalog)await new Promise(resolve=>window.releaseCatalog=resolve);if(opts.catalogFail)throw Error('offline');return catalog},now:()=>42});window.cleanup=install();`,
  });
}
test("automatically restores exact ordered IDs and labels without submitting or changing draft", async ({
  page,
}) => {
  await fixture(page, { saved: ["b", "c"] });
  await expect(status(page)).toContainText("Restored");
  await expect(status(page)).toContainText("Beta Thinking");
  expect(await page.evaluate("nativeState.models")).toEqual(["b", "c"]);
  expect(await page.locator("textarea").inputValue()).toBe("keep my draft");
  expect(await page.evaluate("submits")).toBe(0);
});
test("new selection saves truthfully, but only a new actual stream records a run", async ({
  page,
}) => {
  await fixture(page, {
    runs: [
      {
        requestId: "old",
        params: {
          model_preference: "council",
          compare_model_preferences: ["b", "c"],
        },
      },
    ],
  });
  await expect(status(page)).toContainText("Saved");
  expect(await page.evaluate("writes.map(x=>x.k)")).toEqual(["selected"]);
  await page.evaluate(
    `emit({requestId:'new',params:{model_preference:'council',compare_model_preferences:['c','a']}})`,
  );
  await expect
    .poll(() => page.evaluate('records["alice:org"].submitted?.models'))
    .toEqual(["c", "a"]);
  expect(await page.evaluate('records["alice:org"].selected.models')).toEqual([
    "a",
    "b",
  ]);
});
test("unavailable saved models block click and Enter until explicit current-model confirmation", async ({
  page,
}) => {
  await fixture(page, { saved: ["missing", "b"] });
  await expect(status(page)).toContainText("missing");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.locator("textarea").press("Enter");
  expect(await page.evaluate("submits")).toBe(0);
  await page
    .getByRole("button", { name: "Use current models", exact: true })
    .click();
  await expect(status(page)).toContainText("Saved");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  expect(await page.evaluate("submits")).toBe(1);
  expect(await page.locator("textarea").inputValue()).toBe("keep my draft");
});
for (const option of [
  "callbackFail",
  "noApply",
  "noCallback",
  "readFail",
  "writeFail",
  "catalogFail",
])
  test("fails closed and truthful: " + option, async ({ page }) => {
    await fixture(page, {
      [option]: true,
      ...(option === "writeFail" ? {} : { saved: ["b", "c"] }),
    });
    await expect(status(page)).toContainText(
      /failed|unconfirmed|Unavailable|Unable/i,
    );
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    expect(await page.evaluate("submits")).toBe(0);
    expect(await page.locator("textarea").inputValue()).toBe("keep my draft");
  });
test("only picker-intended changes autosave; unexpected changes warn and require confirmation", async ({
  page,
}) => {
  await fixture(page);
  await expect(status(page)).toContainText("Saved");
  await page.getByRole("button", { name: "2 models", exact: true }).click();
  await page.evaluate(`nativeState.models=['b','c'];touch()`);
  await expect
    .poll(() => page.evaluate('records["alice:org"].selected.models'))
    .toEqual(["b", "c"]);
  await page.evaluate(`nativeState.models=['a','c'];touch()`);
  await expect(status(page)).toContainText(/unconfirmed/i);
  expect(await page.evaluate('records["alice:org"].selected.models')).toEqual([
    "b",
    "c",
  ]);
});
test("account/scope changes restart restoration and cleanup deduplicates and unsubscribes", async ({
  page,
}) => {
  await fixture(page, { saved: ["b", "c"] });
  await expect(status(page)).toContainText("Restored");
  await page.evaluate(
    `records['bob:org']={selected:{models:['c','a'],at:1}};nativeState.account='bob:org';touch()`,
  );
  await expect
    .poll(() => page.evaluate("nativeState.models"))
    .toEqual(["c", "a"]);
  await page.evaluate(
    `nativeState.models=['a','b'];nativeState.scope='thread';history.pushState({},'', '/search/thread');dispatchEvent(new PopStateEvent('popstate'));touch()`,
  );
  await expect(status(page)).toContainText("Restored");
  await expect
    .poll(() => page.evaluate("nativeState.models"))
    .toEqual(["c", "a"]);
  await page.evaluate(`window.old=cleanup;cleanup=install();old()`);
  await expect(status(page)).toHaveCount(1);
  await page.evaluate("cleanup();touch()");
  await expect(status(page)).toHaveCount(0);
  expect(await page.evaluate("listeners.size")).toBe(0);
});
test("reload restores selected memory and other modes/routes remain untouched", async ({
  page,
}) => {
  await fixture(page, { saved: ["c", "b"] });
  await expect(status(page)).toContainText("Restored");
  await page.reload();
  await fixture(page);
  await expect(status(page)).toContainText("Restored");
  expect(await page.evaluate("nativeState.models")).toEqual(["c", "b"]);
  await page.evaluate(`nativeState.mode='search';touch()`);
  await expect(status(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  expect(await page.evaluate("submits")).toBe(1);
  await page.evaluate(
    `nativeState.mode='agentic_research';history.pushState({},'', '/computer');touch()`,
  );
  await expect(status(page)).toHaveCount(0);
});
test("managed policy requires explicit review and still validates current model availability", async ({
  page,
}) => {
  await fixture(page, { saved: ["b", "c"], managed: true });
  await expect(status(page)).toContainText("Managed");
  expect(await page.evaluate("calls")).toEqual([]);
  await page
    .getByRole("button", { name: "Use current models", exact: true })
    .click();
  await expect(status(page)).toContainText("Saved");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  expect(await page.evaluate("submits")).toBe(1);
});
test("pending restore guards Enter/click; stale catalog completion cannot touch another account or draft", async ({
  page,
}) => {
  await fixture(page, { saved: ["b", "c"], delayCatalog: true });
  await expect(status(page)).toContainText("Loading");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.locator("textarea").press("Enter");
  expect(await page.evaluate("submits")).toBe(0);
  await page.evaluate(
    `window.firstRelease=releaseCatalog;nativeState.account='bob:org';touch()`,
  );
  await expect
    .poll(() => page.evaluate("releaseCatalog===firstRelease"))
    .toBe(false);
  await page.evaluate("firstRelease()");
  expect(await page.evaluate("calls")).toEqual([]);
  await page.evaluate("releaseCatalog()");
  await expect(status(page)).toContainText("Saved");
  expect(await page.evaluate("nativeState.models")).toEqual(["a", "b"]);
  expect(await page.evaluate('writes.every(x=>x.a==="bob:org")')).toBe(true);
  expect(await page.locator("textarea").inputValue()).toBe("keep my draft");
});
test("wrong stream params do not fabricate executions and disposal cancels pending callback", async ({
  page,
}) => {
  await fixture(page);
  await expect(status(page)).toContainText("Saved");
  await page.evaluate(
    `emit({requestId:'wrong',params:{model_preference:'council',compareModels:['a','c']}})`,
  );
  expect(await page.evaluate('records["alice:org"].submitted')).toBeUndefined();
  await page.evaluate(`cleanup();opts.delayCatalog=true;cleanup=install()`);
  await expect(status(page)).toContainText("Loading");
  await page.evaluate("cleanup();releaseCatalog();touch()");
  await expect(status(page)).toHaveCount(0);
  expect(await page.evaluate("calls")).toEqual([]);
});

test("unresolved preferences do not block keyboard mode or picker controls",async({page})=>{
  await fixture(page,{saved:["missing","b"]});
  await expect(status(page)).toContainText("missing");
  await page.evaluate(`document.querySelector('#mode').onclick=()=>{nativeState.mode='search';touch()}`);
  await page.locator('#mode').press('Enter');
  await expect(status(page)).toHaveCount(0);
  expect(await page.evaluate('nativeState.mode')).toBe('search');
  expect(await page.evaluate('submits')).toBe(0);
});
