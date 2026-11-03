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
