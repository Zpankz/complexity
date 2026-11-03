import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { build } from "vite";

let script: string;
const routePath =
  "/computer/plugins/skills/11111111-1111-4111-8111-111111111111";
const source =
  '---\nname: fixture\n---\n\n# Instructions\n```python\nprint("hi")\n```\n\n  preserve spaces  \n';
const caveat =
  "Only this file is included. Referenced files, scripts, dependencies, credentials and tools are not installed; this is plain prompt context, not native skill execution.";
const copy = (page: Page) => page.getByTestId("complexity-copy-skill-context");

test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.resolve(
          "src/plugins/restore-search-mode-selector/skill-context.ts",
        ),
        name: "SkillContextTest",
        formats: ["iife"],
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!output || !("output" in output)) throw Error("Missing build");
  const chunk = output.output.find((c) => c.type === "chunk");
  if (chunk?.type !== "chunk") throw Error("Missing script");
  script = chunk.code;
});

async function fixture(page: Page, options: Record<string, unknown> = {}) {
  await page.route("https://www.perplexity.ai/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><body><nav aria-label="Main"><button><img alt="Profile avatar"></button></nav><main><section class="flex flex-col gap-6"><h2>Files</h2><div class="flex overflow-hidden"><div><button class="bg-subtle">SKILL.md</button></div><div class="flex min-h-0 min-w-0 flex-1 flex-col"><div><div role="radiogroup" aria-label="File view"><button role="radio" aria-label="Preview" aria-checked="false"></button><button role="radio" aria-label="Markdown" aria-checked="true"></button></div></div><div class="flex-1 overflow-y-auto"><pre class="text-sm whitespace-pre-wrap break-words px-8 py-6"></pre></div></div></div></section></main></body></html>`,
    }),
  );
  await page.goto(`https://www.perplexity.ai${options.pathname ?? routePath}`);
  await page.addScriptTag({
    content: `
    window.options=${JSON.stringify(options)};window.copied=[];
    const pre=document.querySelector('pre');pre.textContent=${JSON.stringify(source)};
    window.fileProps={content:pre.textContent,isMarkdown:true,isLoading:false,error:null,filePath:'SKILL.md',viewMode:'markdown',onSelectFile(){}};
    if(options.preview){fileProps.viewMode='preview';document.querySelector('[aria-label="Preview"]').setAttribute('aria-checked','true');document.querySelector('[aria-label="Markdown"]').setAttribute('aria-checked','false');pre.innerHTML='<code>rendered excerpt</code>'}
    if(options.oversize){pre.textContent='界'.repeat(350000);fileProps.content=pre.textContent}
    if(!options.clone)pre.__reactFiber$fixture={memoizedProps:{children:pre.textContent},return:{memoizedProps:fileProps,return:null}};
    if(options.nestedHeading){const heading=document.querySelector('h2');const wrapper=document.createElement('div');heading.before(wrapper);wrapper.append(heading)}
    if(options.noAuth)document.querySelector('nav').remove();
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(options.clipboardFail)throw Error('denied');window.copied.push(text)}}});
    ${script}
    window.cleanupSkill=SkillContextTest.installSkillContextCopy();
  `,
  });
}

test("copies exact raw frontmatter/code only after a click, with truthful provenance", async ({
  page,
}) => {
  await fixture(page);
  await expect(copy(page)).toBeEnabled();
  expect(await page.evaluate("window.copied")).toEqual([]);
  await copy(page).click();
  expect(await page.evaluate("window.copied")).toEqual([
    `File: SKILL.md\nSkill page: https://www.perplexity.ai${routePath}\n${caveat}\n\n${source}`,
  ]);
  await expect(page.getByRole("status")).toContainText("Copied SKILL.md");
});
for (const pathname of [
  "/",
  "/search/a",
  "/computer/plugins/skills",
  routePath + "/other",
]) {
  test(`route guard ${pathname}`, async ({ page }) => {
    await fixture(page, { pathname });
    await expect(copy(page)).toHaveCount(0);
  });
}
test("requires authenticated UI", async ({ page }) => {
  await fixture(page, { noAuth: true });
  await expect(copy(page)).toHaveCount(0);
});
test("preview fails closed even with code blocks", async ({ page }) => {
  await fixture(page, { preview: true });
  await expect(page.getByRole("status")).toContainText(
    "Switch to Markdown/source view",
  );
  await expect(copy(page)).toBeDisabled();
  expect(await page.evaluate("window.copied")).toEqual([]);
});
test("text-only source clones do not qualify", async ({ page }) => {
  await fixture(page, { clone: true });
  await expect(copy(page)).not.toBeEnabled();
});
test("clipboard failure reports failure, never success", async ({ page }) => {
  await fixture(page, { clipboardFail: true });
  await copy(page).click();
  await expect(page.getByRole("status")).toContainText("Copy failed");
  expect(await page.evaluate("window.copied")).toEqual([]);
});
test("UTF-8 source over 1MB is rejected, not sliced", async ({ page }) => {
  await fixture(page, { oversize: true });
  await expect(page.getByRole("status")).toContainText("1 MB");
  await expect(copy(page)).toBeDisabled();
  expect(await page.evaluate("window.copied")).toEqual([]);
});
test("revalidates current path and content on click and on rerender", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(
    `fileProps.filePath='references/runtime.md';fileProps.content='new source\\n';document.querySelector('pre').textContent=fileProps.content`,
  );
  await copy(page).click();
  expect(await page.evaluate("window.copied[0]")).toBe(
    `File: references/runtime.md\nSkill page: https://www.perplexity.ai${routePath}\n${caveat}\n\nnew source\n`,
  );
  await page.evaluate(`document.querySelector('pre').textContent='incomplete'`);
  await expect(copy(page)).not.toBeEnabled();
});
test("repeated installation, SPA navigation and disposal clean up controls", async ({
  page,
}) => {
  await fixture(page);
  await expect(copy(page)).toBeEnabled();
  await page.evaluate(
    "window.oldCleanup=cleanupSkill;window.cleanupSkill=SkillContextTest.installSkillContextCopy();oldCleanup()",
  );
  await expect(copy(page)).toHaveCount(1);
  await page.evaluate(
    "history.pushState({},'', '/search/a');dispatchEvent(new PopStateEvent('popstate'))",
  );
  await expect(copy(page)).toHaveCount(0);
  await page.evaluate(
    `history.pushState({},'', '${routePath}');dispatchEvent(new PopStateEvent('popstate'))`,
  );
  await expect(copy(page)).toBeEnabled();
  await page.evaluate(
    "cleanupSkill();document.querySelector('h2').textContent='Files'",
  );
  await expect(copy(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("remounted source and Unicode CRLF survive exactly", async ({ page }) => {
  await fixture(page);
  await page.evaluate(`{
    const old=document.querySelector('pre');const next=old.cloneNode();
    fileProps.content='---\\r\\nname: unicode\\r\\n---\\r\\n界 😀  \\r\\n';
    fileProps.filePath='references/unicode.md';next.textContent=fileProps.content;
    next.__reactFiber$fixture={memoizedProps:{},return:{memoizedProps:fileProps,return:null}};
    old.replaceWith(next);
  }`);
  await expect(copy(page)).toBeEnabled();
  await copy(page).click();
  expect(await page.evaluate("window.copied[0]")).toBe(
    `File: references/unicode.md\nSkill page: https://www.perplexity.ai${routePath}\n${caveat}\n\n---\r\nname: unicode\r\n---\r\n界 😀  \r\n`,
  );
});

test("synchronous click rechecks loading/error instead of using cached text", async ({
  page,
}) => {
  await fixture(page);
  await expect(copy(page)).toBeEnabled();
  await page.evaluate(
    `fileProps.isLoading=true;document.querySelector('[data-testid="complexity-copy-skill-context"]').click()`,
  );
  expect(await page.evaluate("window.copied")).toEqual([]);
  await expect(copy(page)).toBeDisabled();
  await page.evaluate(
    "fileProps.isLoading=false;fileProps.error='unavailable';document.querySelector('h2').textContent='Files'",
  );
  await expect(copy(page)).toBeDisabled();
  await page.evaluate(
    "fileProps.error=null;document.querySelector('h2').textContent='Files'",
  );
  await expect(copy(page)).toBeEnabled();
});

test("does not attribute a stale displayed source to a newly navigated skill", async ({
  page,
}) => {
  await fixture(page);
  await expect(copy(page)).toBeEnabled();
  await page.evaluate(
    "history.pushState({},'', '/computer/plugins/skills/another-skill');dispatchEvent(new PopStateEvent('popstate'))",
  );
  await expect(copy(page)).toBeDisabled();
  expect(await page.evaluate("window.copied")).toEqual([]);
  await expect(page.getByRole("status")).toContainText(/changed|stale|reload/i);
});

test("nested native Files headings do not recreate the copy control every frame",async({page})=>{
 await fixture(page,{nestedHeading:true});await expect(copy(page)).toBeEnabled();
 await page.evaluate(()=>{window.originalCopy=document.querySelector('[data-testid="complexity-copy-skill-context"]');document.body.dataset.refresh='once';});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 expect(await page.evaluate(()=>document.querySelector('[data-testid="complexity-copy-skill-context"]')===window.originalCopy)).toBe(true);
 await copy(page).click();expect(await page.evaluate('window.copied.length')).toBe(1);
});
