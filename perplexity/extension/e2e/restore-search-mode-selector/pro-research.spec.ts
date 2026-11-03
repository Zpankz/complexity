import { expect, test, type Page } from "@playwright/test";
import { build } from "vite";
import path from "node:path";

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
          "src/plugins/restore-search-mode-selector/pro-research.ts",
        ),
        name: "ProResearchTest",
        formats: ["iife"],
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!output || !("output" in output)) throw new Error("Missing build");
  const chunk = output.output.find((c) => c.type === "chunk");
  if (chunk?.type !== "chunk") throw new Error("Missing script");
  script = chunk.code;
});

async function fixture(page: Page, options: Record<string, unknown> = {}) {
  await page.route("https://www.perplexity.ai/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><body><div data-composer><div class="row"><button aria-label="Add">+</button><div data-command-menu-control><span data-testid="ask-input-mode-toggle-width-wrapper"><button aria-pressed="true" aria-label="Search">Search</button></span><button aria-label="Computer">Computer</button></div></div><div role="textbox" contenteditable="true">Unsaved draft</div></div></body></html>`,
    }),
  );
  await page.goto(
    `https://www.perplexity.ai${options.pathname ?? "/search/thread-a"}`,
  );
  await page.addScriptTag({
    content: `
    window.fixtureOptions=${JSON.stringify(options)};
    window.nativeSelections=0;window.nativeAddClicks=0;
    window.config={configuredModel:'pplx_pro',askDeepResearchModel:null,setConfiguredModel(){throw Error('direct setter must not be called')}};
    window.results={currentThreadId:'thread-a',currentStreamId:null};
    window.toggle={testIdPrefix:'ask-input-mode-toggle',value:fixtureOptions.computer?'asi':'search',items:[],onValueSelect(){throw Error('wrong native handler')}};
    const chain=props=>props.reduceRight((ret,memoizedProps)=>({memoizedProps,return:ret}),null);
    const button=document.querySelector('[aria-label="Search"]');
    button.__reactFiber$fixture=chain([window.toggle,{isFollowUp:fixtureOptions.followUp!==false},{value:window.config},{value:{configuredModel:'pplx_pro',askDeepResearchModel:null,setConfiguredModel(){}}},{value:window.results}]);
    if(fixtureOptions.streaming){const stop=document.createElement('button');stop.setAttribute('aria-label','Stop response (Esc)');document.querySelector('[data-composer]').append(stop)}
    const add=document.querySelector('[aria-label="Add"]');add.disabled=!!fixtureOptions.addDisabled;
    add.onclick=()=>{window.nativeAddClicks++;if(fixtureOptions.toggleLabel){add.setAttribute('aria-label','Close');add.setAttribute('aria-expanded','true')}setTimeout(()=>{
      const row=document.createElement('div');row.id='fixture-featured:deep-research';row.setAttribute('role','option');row.setAttribute('aria-disabled',String(!!fixtureOptions.disabled));row.textContent='Deep Research '+(fixtureOptions.noBadge?'':'Included in Pro');
      const payload={disabled:!!fixtureOptions.disabled,action:{type:'skill',selectableSkill:{name:'deep-research',scope:'global'}}};
      row.__reactFiber$fixture=chain([{row:{item:{id:'featured:deep-research',payload}},onSelect(){
        window.nativeSelections++;if(fixtureOptions.denied)return;
        window.config.configuredModel='pplx_alpha';window.toggle.value='research';button.setAttribute('aria-label','Deep Research');row.remove();
      }},{value:window.config},{value:window.results}]);document.body.append(row);
    },fixtureOptions.delay??0)};
    ${script}
    window.cleanupPro=ProResearchTest.installProResearchShortcut();
  `,
  });
}
const shortcut = (page: Page) =>
  page.getByRole("button", {
    name: "Deep Research (Included in Pro)",
    exact: true,
  });

test("invokes only the actual native Included in Pro action and preserves draft", async ({
  page,
}) => {
  await fixture(page);
  await shortcut(page).click();
  await expect(shortcut(page)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate("window.nativeSelections")).toBe(1);
  expect(await page.evaluate("window.config.configuredModel")).toBe(
    "pplx_alpha",
  );
  await expect(page.getByRole("textbox")).toHaveText("Unsaved draft");
  await shortcut(page).click();
  expect(await page.evaluate("window.nativeSelections")).toBe(1);
});
test("waits for native menu rendering without a second activation", async ({
  page,
}) => {
  await fixture(page, { delay: 150 });
  await shortcut(page).click();
  await expect(shortcut(page)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate("window.nativeSelections")).toBe(1);
});
for (const opts of [{ noBadge: true }, { disabled: true }]) {
  test(`fails closed if the native Pro entry is missing or disabled ${JSON.stringify(opts)}`, async ({
    page,
  }) => {
    await fixture(page, opts);
    await shortcut(page).click();
    await expect(page.getByRole("status")).toContainText("unavailable", {
      timeout: 4000,
    });
    expect(await page.evaluate("window.nativeSelections")).toBe(0);
    expect(await page.evaluate("window.config.configuredModel")).toBe(
      "pplx_pro",
    );
  });
}
test("does not bypass a native gate denying selection", async ({ page }) => {
  await fixture(page, { denied: true });
  await shortcut(page).click();
  await expect.poll(() => page.evaluate("window.nativeSelections")).toBe(1);
  await expect(shortcut(page)).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate("window.config.configuredModel")).toBe("pplx_pro");
});
for (const opts of [
  { pathname: "/" },
  { pathname: "/search/new" },
  { pathname: "/computer/tasks/thread-a" },
  { computer: true },
  { followUp: false },
]) {
  test(`leaves non-legacy surfaces untouched ${JSON.stringify(opts)}`, async ({
    page,
  }) => {
    await fixture(page, opts);
    await expect(shortcut(page)).toHaveCount(0);
    expect(await page.evaluate("window.nativeAddClicks")).toBe(0);
  });
}
test("does not activate during an in-flight response", async ({ page }) => {
  await fixture(page, { streaming: true });
  const count = await shortcut(page).count();
  if (count) {
    await shortcut(page).click({ force: true });
  }
  expect(await page.evaluate("window.nativeAddClicks")).toBe(0);
});
test("cancels pending native activation on navigation", async ({ page }) => {
  await fixture(page, { delay: 300 });
  await shortcut(page).click();
  await page.evaluate(
    "history.pushState({},'', '/');window.dispatchEvent(new PopStateEvent('popstate'))",
  );
  await expect(shortcut(page)).toHaveCount(0);
  await page.waitForTimeout(400);
  expect(await page.evaluate("window.nativeSelections")).toBe(0);
});
test("cleans up and reinstall does not duplicate handlers", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(
    "window.cleanupPro=ProResearchTest.installProResearchShortcut()",
  );
  await expect(shortcut(page)).toHaveCount(1);
  await page.evaluate("window.cleanupPro()");
  await expect(shortcut(page)).toHaveCount(0);
  expect(await page.evaluate("window.nativeAddClicks")).toBe(0);
});

test("handles native Add becoming Close while its menu is open", async ({
  page,
}) => {
  await fixture(page, { toggleLabel: true, delay: 100 });
  await shortcut(page).click();
  await expect(shortcut(page)).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate("window.nativeSelections")).toBe(1);
});
test("does not click a disabled native Add control", async ({ page }) => {
  await fixture(page, { addDisabled: true });
  await shortcut(page).click();
  expect(await page.evaluate("window.nativeAddClicks")).toBe(0);
  expect(await page.evaluate("window.nativeSelections")).toBe(0);
});
test("cancels when the native thread scope changes before menu arrival", async ({
  page,
}) => {
  await fixture(page, { delay: 300 });
  await shortcut(page).click();
  await page.evaluate(
    "window.results.currentThreadId='thread-b';document.body.dataset.changed='true'",
  );
  await page.waitForTimeout(400);
  expect(await page.evaluate("window.nativeSelections")).toBe(0);
});
