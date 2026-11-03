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
        entry: path.resolve("src/plugins/restore-search-mode-selector/menu.ts"),
        name: "SearchModeTest",
        formats: ["iife"],
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (output == null || !("output" in output))
    throw new Error("Unexpected build result");
  const chunk = output.output.find((item) => item.type === "chunk");
  if (chunk?.type !== "chunk") throw new Error("Missing test bundle");
  script = chunk.code;
});

async function fixture(page: Page, pathname = "/") {
  await page.route("https://www.perplexity.ai/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><body><main><div data-testid="ask-input-mode-toggle-width-wrapper"><button aria-pressed="true" aria-label="Search">Search</button></div><button id="outside" style="position:fixed;right:10px;bottom:10px">Outside</button></main></body></html>`,
    }),
  );
  await page.goto(`https://www.perplexity.ai${pathname}`);
  await page.addScriptTag({
    content: `
    window.selectedModes = [];
    window.nativeProps = {
      testIdPrefix: 'ask-input-mode-toggle', value: 'search',
      items: [{value:'search',activeValues:['search','research','agentic_research','study'],hidden:false,renderMenu:null}],
      onValueSelect(mode) { window.selectedModes.push(mode); window.nativeProps.value=mode; document.querySelector('button').setAttribute('aria-label', mode); }
    };
    document.querySelector('button').__reactFiber$test={memoizedProps:window.nativeProps,return:null};
    ${script}
    window.cleanupMenu = SearchModeTest.installSearchModeMenu();
  `,
  });
}

const trigger = (page: Page) =>
  page.getByRole("button", { name: "Search", exact: true });
const selections = (page: Page) => page.evaluate("window.selectedModes");

test("keyboard navigation and Escape never change the query mode", async ({
  page,
}) => {
  await fixture(page);
  await expect(trigger(page)).toHaveAttribute("aria-haspopup", "menu");
  await trigger(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio")).toHaveCount(4);
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitemradio", { name: "Learn Step by Step" }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("menuitemradio", { name: "Search", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  expect(await selections(page)).toEqual([]);
});

for (const [label, mode] of [
  ["Deep Research", "research"],
  ["Model Council", "agentic_research"],
  ["Learn Step by Step", "study"],
]) {
  test(`selects ${label} through native callback only`, async ({ page }) => {
    await fixture(page);
    await trigger(page).click();
    await page.getByRole("menuitemradio", { name: label }).click();
    expect(await selections(page)).toEqual([mode]);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(
      page.locator(
        '[data-testid="ask-input-mode-toggle-width-wrapper"] button',
      ),
    ).not.toHaveAttribute("aria-haspopup", "menu");
  });
}

test("does not take over an already available native menu", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(
    "window.nativeProps.items[0].renderMenu=()=>null; document.querySelector('button').setAttribute('aria-haspopup','dialog')",
  );
  await expect(trigger(page)).toHaveAttribute("aria-haspopup", "dialog");
  await trigger(page).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await selections(page)).toEqual([]);
  await expect(trigger(page)).toHaveAttribute("aria-haspopup", "dialog");
});

test("fails closed when the handler changes while open", async ({ page }) => {
  await fixture(page);
  await trigger(page).click();
  await page.evaluate(`window.nativeProps.onValueSelect=null;
    document.querySelector('[role="menuitemradio"][aria-label="Deep Research"]')?.click()`);
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await selections(page)).toEqual([]);
});

test("outside dismissal and Tab do not select", async ({ page }) => {
  await fixture(page);
  await trigger(page).click();
  await page.locator("#outside").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await trigger(page).click();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await selections(page)).toEqual([]);
});

test("home-only, responds to SPA navigation and cleans up added attributes", async ({
  page,
}) => {
  await fixture(page, "/academic");
  await expect(trigger(page)).not.toHaveAttribute("aria-haspopup", "menu");
  await page.evaluate(
    "history.pushState({},'', '/'); window.dispatchEvent(new PopStateEvent('popstate'))",
  );
  await expect(trigger(page)).toHaveAttribute("aria-haspopup", "menu");
  await trigger(page).click();
  await page.evaluate(
    "history.pushState({},'', '/computer'); window.dispatchEvent(new PopStateEvent('popstate'))",
  );
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger(page)).not.toHaveAttribute("aria-haspopup", "menu");
  await page.evaluate(
    "history.pushState({},'', '/'); window.dispatchEvent(new PopStateEvent('popstate'))",
  );
  await expect(trigger(page)).toHaveAttribute("aria-haspopup", "menu");
  await page.evaluate("window.cleanupMenu()");
  await expect(trigger(page)).not.toHaveAttribute("aria-haspopup", "menu");
});

test("handles composer remount and repeated installation without duplicates", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(`{
    const old=document.querySelector('button'); const next=old.cloneNode(true);
    next.__reactFiber$test={memoizedProps:window.nativeProps,return:null}; old.replaceWith(next);
    window.cleanupMenu=SearchModeTest.installSearchModeMenu();
  }`);
  await trigger(page).click();
  await expect(page.getByRole("menu")).toHaveCount(1);
  await page.getByRole("menuitemradio", { name: "Deep Research" }).click();
  expect(await selections(page)).toEqual(["research"]);
});

test("preserves equal-valued ARIA attributes after native Radix takeover", async ({
  page,
}) => {
  await fixture(page);
  await trigger(page).click();
  await page.evaluate(`window.nativeProps.items[0].renderMenu=()=>null;
    const button=document.querySelector('button');
    button.setAttribute('data-state','closed');
    button.setAttribute('aria-haspopup','menu');
    button.setAttribute('aria-controls','radix-native-menu');
    button.setAttribute('aria-label','Search');`);
  await trigger(page).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger(page)).toHaveAttribute("aria-haspopup", "menu");
  await expect(trigger(page)).toHaveAttribute(
    "aria-controls",
    "radix-native-menu",
  );
});

test("warns that native Deep Research may migrate to Computer", async ({
  page,
}) => {
  await fixture(page);
  await trigger(page).click();
  const research = page.getByRole("menuitemradio", {
    name: "Deep Research",
    exact: true,
  });
  await expect(research).toContainText("May use Computer");
  await expect(research).toHaveAttribute(
    "aria-description",
    /Credits may apply/,
  );
  expect(await selections(page)).toEqual([]);
});
