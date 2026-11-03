# Restore Search Mode Selector (experimental)

## Observed 4 November 2026

Compared two signed-in Perplexity home tabs and the user's supplied screenshot.
One tab remained in Search; the other had been taken through Academic search and
returned home in Model Council. No queries were submitted during investigation.

- Both pages have `ask-input-mode-toggle-width-wrapper` and the same native
  `ask-input-mode-toggle` React props, with `onValueSelect` and `items`.
- The Search tab has no `aria-haspopup`, no chevron, and `renderMenu: null`.
- The Council tab has the native menu with Search, Deep Research, Model Council
  (Max badge), and Learn Step by Step. Its search-group `renderMenu` is a function.
- In both tabs the home composer passes `hideModeMenus: true`. The site's current
  client only suppresses the menu when the current mode is `search`.
- Native mode values are `search`, `research`, `agentic_research`, and `study`.
  Computer is `asi`. The plugin never explicitly selects it, but Perplexity's native
  handler can migrate a Deep Research selection to Computer.

## Approach and boundaries

The plugin is off by default. Enable **Restore Search Mode Selector** in
Complexity's plugin dashboard, then reload Perplexity. Disabling also requires a
reload, consistent with the cached plugin-loader enablement model.

On the home page only, a small fallback dropdown is attached to the existing
Search button when semantic React props prove the native menu is absent. The
adapter traverses a bounded number of ancestors, resolves React's committed
alternate, and does not rely on minified component names or fixed hook indices.
At selection time it re-reads current props and calls the native `onValueSelect`.
It does not mutate React props, overwrite configured models, persist a preferred
mode, change sources, navigate through Academic, submit queries, or intercept
network requests. If Perplexity restores its native menu, the plugin steps aside.
In Research/Council/Learn mode, Perplexity itself owns the existing menu.

The callback continues through Perplexity's own access/organization/usage checks.
The plugin does not grant a subscription entitlement or guarantee that requests
are credit-free. Live testing on this account verified Council (`3 models`) and
Learn Step by Step remain on the ordinary search surface. Deep Research instead
showed **“Deep research is now powered by Computer. Uses your included Deep
Research allowance first”** and added a Deep Research skill chip in Computer.
The same migration happened through Academic's native menu. The fallback warns
**May use Computer** on that entry. Non-Computer Deep Research is not restored or
verified by this change. No queries were submitted and no billing claims are
made. Menu labels currently use the English labels observed on the site.

Unknown DOM/React structure, locked/hidden Search groups, missing handlers,
unsupported values, non-home pages, and disabled buttons fail closed. Keyboard
navigation, Escape, Tab, outside dismissal, SPA transitions, remounts and explicit
cleanup are covered by local browser fixtures. Those fixtures are not proof that
a paid account can execute every mode.

## Validation commands

From the repository root, with Node 22 and pnpm 10:

```sh
pnpm install --frozen-lockfile
pnpm --filter 'pplx-ext^...' build
pnpm --filter pplx-ext exec vitest run
pnpm --filter pplx-ext check-types
pnpm --filter pplx-ext exec eslint src/plugins/restore-search-mode-selector
pnpm --filter pplx-ext exec playwright test --config=e2e/restore-search-mode-selector/playwright.config.ts
pnpm --filter pplx-ext build
```

The standalone browser suite uses installed Google Chrome and local HTML
fixtures. It has no account login, no paid queries, and no Perplexity requests.
For manual testing, load the unpacked build from `perplexity/extension/dist/chrome`,
enable the plugin, and reload the home page. Select each mode, return to Search,
then check Computer, Academic, a thread, and a Space are unchanged. A real query
and billing/credit check need a separate explicit decision by the tester.

## Upstream contribution

No PR is opened. Upstream's plugin-authoring guide currently says new features
require an issue first rather than an unsolicited PR. Review that policy before
proposing this fork branch upstream.

## Results for this branch

- Node 22.22.3, pnpm 10.25.0; dependencies installed from the unchanged lockfile.
- 152 unit tests passed, including 25 adapter cases and 4 compatibility cases.
- 11 isolated Chrome acceptance tests passed.
- TypeScript and plugin ESLint (`--max-warnings=0`) passed.
- Full Chrome production build passed. The build includes the registered plugin,
  its settings UI, and the main-world controller with the Deep Research warning.
- Live same-source controller injection verified the missing Search dropdown,
  Council selection with `3 models`, native menu takeover, Learn selection, and
  return to Search. No unpacked build was installed over the user's existing
  extension, and no paid request was made. Reload clears the temporary live test.
- Live nesting regression: this composer has 229 ancestors before its React root;
  the adapter allows up to 512 root ancestors and 60 selector ancestors, still
  failing closed on cycles/incompatible shapes.

The fork plugin declares `fallbackCompatibilityVersion: "2.9.19"`. This is used
only while its ID is absent from the upstream compatibility CDN; an explicit
remote requirement always wins. Other unlisted plugins retain the existing
fail-closed behavior. Without this narrow fallback, upstream's CDN marks any new
fork plugin as outdated and prevents enabling it in production builds.

The packaged build uses the documented optional official config registry
(`VITE_CPLX_CDN_URL=https://cdn.cplx.app` in an untracked `.env`). No extension
permissions were added. Keep the existing installed Complexity disabled while
trying the unpacked fork build to avoid duplicate content scripts.

## Follow-up: the existing-thread Included in Pro path

The earlier limitation applies to the **home/Academic, no-thread selection path**,
not all Deep Research. The user's existing Search chat exposed a distinct native
`+` entry labeled **Deep Research Included in Pro**. Its scoped configuration was
`configuredModel: pplx_alpha`, mode `research`, `askDeepResearchModel: null`; its
separate parent global config remained an ordinary Search model. The native
client's Computer migration code only runs when there is no current thread or
stream, explaining why this follow-up path stays on legacy Research.

The plugin now adds **Pro Research** beside the mode control in an existing
`/search/<thread>` composer. On click it opens that composer's native `+` menu,
checks the actual Included in Pro badge, enabled `featured:deep-research` action,
global deep-research skill payload, and exact owning config object/thread ID,
then invokes the native row's fresh `onSelect`. The native action keeps its own
plan/usage gate. No direct model setter, global preference write, stored native
callback, request interceptor, navigation trick or query submission is used.

The shortcut is absent on home, Academic, Projects, new/empty Search sessions and
Computer. It does not activate during a running response, when Add is disabled,
when the native Pro badge is missing, or after the thread/provider changes. Its
menu lookup is bounded to 1.5 seconds, cancels on navigation/uninstall, and
preserves drafts. When Research is already active, clicking is a no-op.

Same-source live validation switched an empty existing-thread follow-up from
Search through the new shortcut, then verified `research / pplx_alpha`, no
Computer Research model, active shortcut state and an empty unchanged draft.
No new query was submitted. This supersedes any interpretation of the earlier
home-only finding as a claim that legacy Research is unavailable everywhere.

Updated verification: **170 unit tests** (including 18 new legacy-action guards),
**27 Chrome acceptance scenarios** (16 new Pro-shortcut cases), strict plugin
ESLint, TypeScript and the full Chrome production build all pass. A separate
read-only review found no direct model-write/query-submission path or actionable
scope/cleanup bug. The feature remains limited to the native selection path;
server-side billing for a new query was not tested.

## Search-started chats, exact Council memory, and readable skill context

### Existing chats that began in Search

The user's simple-Search thread also had `hideModeMenus: true` while its current
mode was Search. Its existing native Plus menu still offered Deep Research
(Included in Pro), Model Council and Learn. The fallback mode dropdown now applies
to these verified ordinary Search follow-up contexts as well as home. It does
not infer a valid chat from its URL alone, replace an available native menu,
force Computer back to Search, or manipulate skill chips.

### Council models

- A verified authenticated `SessionContext` binds storage to user ID and
  organization (or personal scope). No credentials, prompts or report contents
  are stored. The isolated bridge rechecks `/api/auth/session` before each
  background storage operation and rejects a different account.
- One background-owned queue persists independent last-selected and
  last-submitted records in Chrome local extension storage. Ordered IDs retain
  reasoning variants, with two or three distinct native model IDs required.
  Older async writes cannot replace a newer record of the same kind.
- Restoration uses the newer selected/submitted record, the current authenticated
  `/rest/models/config/v2` catalog, fresh native `onModelsChange`, and a subsequent
  exact native-state comparison. It does not rename replaced models or silently
  drop unavailable IDs. Unknown managed policies require explicit confirmation.
- Current model names and restoration state are visible below the composer, not
  clipped inside the native fixed-width mode toggle. Exact IDs are also in the
  status tooltip. Missing models, unavailable callbacks, storage errors or a
  failed restoration require review before a Council submission; mode/picker
  controls remain keyboard-accessible so users can leave Council.
- A read-only subscription to native `StreamStateContext` observes only new
  Council streams and records the actual `params.compare_model_preferences`
  array (with `model_preference` identifying Council). Merely opening/editing a
  selector is not recorded as a run. Existing stream history is baselined, not
  relabeled as a newly executed query. Executions predating the plugin are not
  claimed recoverable.

### Skill access investigation and the implemented workaround

The completed Research report explicitly said it could not access the linked
Perplexity skill. Its earlier “Loading skill” and `get_url_content` activity
labels therefore did not establish successful skill loading. The later Running
code activity saved an explanation, not proof of running the skill's engine.

The signed-in browser could read the exact skill's file viewer: SKILL.md was
29,837 characters, a runtime reference 11,038, and a Python entrypoint 191,529.
The package contained 88 files. No private source content or real skill/account
IDs are included in this repository's tests or documentation.

Official implementation detail:
https://www.perplexity.ai/hub/blog/designing-refining-and-maintaining-agent-skills-at-perplexity
explains that Computer's `load_skill` copies the skill directory into an isolated
sandbox, loads declared dependencies, and progressively reads supporting files.
A readable instruction file does not establish that runtime or its tools,
credentials, dependencies or executable files are available in ordinary Research.

The plugin now adds **Copy file as prompt context** to an authenticated skill
file viewer in raw Markdown/source mode. The selected native viewer's filePath,
full content, loading/error state and raw DOM text must agree. A user click copies
that exact complete file, with provenance and an explicit one-file/runtime caveat.
There is no summarization, frontmatter stripping or silent truncation; UTF-8
context above 1 MB is rejected. Preview-only, stale-navigation, cloned-source or
clipboard-failure states are not reported as success. No polling, prompt
insertion, automatic mode switch, real clipboard write during validation, or
query submission is performed by the agent.

Manual use: open the skill, select SKILL.md, select Markdown, click Copy file as
prompt context, and paste the resulting plain text into Search/Research. Repeat
for any necessary supporting files the user chooses to supply. This works around
a private URL fetch failure by transferring readable content. It is not a claim
that an 88-file executable skill has been installed or can fully run outside
Computer; that remains a server/runtime capability boundary.

### Final verification

- Native Council adapter read the live Search-started thread's exact three IDs
  (`claudefable51`, `claude55opus`, `gpt6_astra`), exposed its native multi-model
  callback and callable stream store, and parsed the current authenticated model
  catalog (19 allowed variants, no organization policy).
- The live copy test captured the entire 29,837-character root with frontmatter
  intact through a temporary clipboard stub, then restored the browser's clipboard
  API. A native nested Files header exposed a remount loop missed by the first
  fixture; containment-based mounting and a dedicated stable-node regression fix it.
- Same-millisecond selected/submitted events now use per-account monotonic stamps;
  conflicting equal-time records require confirmation. A storage result that did
  not retain the intended selection/run is not labeled saved.
- Pure adapter/storage/bridge core coverage: 97.93% lines, 91.68% branches,
  100% functions (129 tests). Browser-controller tests cover the UI paths separately.
- No query, credit-consuming run, real clipboard write or full skill execution was
  performed. Native skill execution in ordinary Research remains unverified.
- Packaged-extension browser-restart smoke test: [blocked] this machine's installed
  system Chrome did not start an unpacked-extension service worker from automated
  launch flags, and the separate extension-capable Playwright Chromium is not
  installed. The Chrome build must be manually loaded/reloaded before real
  cross-restart verification. Typed bridge, queue and persisted-record restoration
  are covered by automated tests, not claimed as that missing end-to-end check.

The live Council callback also round-tripped the exact existing three-model set
against the authenticated catalog without submitting anything. A delayed animation
frame initially caused a false confirmation timeout despite matching native IDs;
the deadline now cancels the deferred frame and re-reads committed native state
before deciding success or failure. A deferred-frame regression reproduces this
without using the network or sending a query.

Final gate: 256 unit tests and 68 browser scenarios pass; TypeScript, plugin
lint, production build and Chrome ZIP integrity all pass. No PR was opened.
