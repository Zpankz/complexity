import {
  readCouncilNative,
  parseCouncilCatalog,
  validCouncilModels,
  councilModelIssues,
  extractCouncilRuns,
  type CouncilNative,
  type CouncilCatalog,
} from "@/plugins/restore-search-mode-selector/council-native";
import type { CouncilMemoryStore } from "@/plugins/restore-search-mode-selector/council-types";

let disposePrevious: (() => void) | undefined;
const equal = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);
type Session = {
  native: CouncilNative;
  catalog?: CouncilCatalog;
  phase: "loading" | "verifying" | "saving" | "ready" | "error";
  message: string;
  models: string[];
  expected?: string[];
  intent: boolean;
  policyConfirmed?: boolean;
  intentAt?: number;
  ui: HTMLDivElement;
  text: HTMLSpanElement;
  confirm: HTMLButtonElement;
  timer?: ReturnType<typeof setTimeout>;
  unsubscribe?: () => void;
  streams: CouncilNative["streams"];
  seen: Set<string>;
  revision: number;
  restoredMessage?: string;
  lastSubmitted?: { models: string[]; at: number };
};

/** Main-world controller. It only calls the current native model-selection callback. */
export function installCouncilPreferences(options: {
  store: CouncilMemoryStore;
  fetchCatalog?: () => Promise<unknown>;
  now?: () => number;
}): () => void {
  disposePrevious?.();
  const controller = new AbortController();
  const { signal } = controller;
  const now = options.now ?? Date.now;
  const clocks = new Map<string, number>();
  // Preserve local event order even when two actions share one wall-clock millisecond.
  const timestamp = (account: string) => {
    const at = Math.max(now(), (clocks.get(account) ?? 0) + 1);
    clocks.set(account, at);
    return at;
  };
  const fetchCatalog =
    options.fetchCatalog ??
    (async () => {
      const response = await fetch("/rest/models/config/v2", {
        credentials: "same-origin",
        signal,
      });
      if (!response.ok)
        throw Error(`Catalog request failed (${response.status})`);
      return response.json();
    });
  let session: Session | undefined;
  let frame = 0;
  const active = () => {
    if (!/^\/(?:search\/[^/]+\/?)?$/.test(location.pathname)) return null;
    const native = readCouncilNative();
    return native?.mode === "agentic_research" ? native : null;
  };
  const matches = (s: Session, n: CouncilNative | null) =>
    !!n &&
    n.account === s.native.account &&
    n.scope === s.native.scope &&
    n.composer === s.native.composer &&
    n.anchor === s.native.anchor;
  const live = (s: Session) =>
    !signal.aborted && session === s && matches(s, active());
  function paint(s: Session) {
    if (!live(s)) return;
    const n = active()!;
    const labels =
      n.models.map((id) => s.catalog?.labels[id] ?? id).join(" · ") ||
      "No confirmed native models";
    const runStatus = s.lastSubmitted
      ? equal(n.models, s.lastSubmitted.models)
        ? "matches last recorded run"
        : "last recorded run differs"
      : "no Council run recorded yet";
    const message = `${labels} · ${s.message} · ${runStatus}`;
    if (s.text.textContent !== message) s.text.textContent = message;
    const title =
      `Current IDs: ${n.models.join(" · ")}` +
      (s.lastSubmitted
        ? `\nLast submitted IDs: ${s.lastSubmitted.models.join(" · ")}`
        : "");
    if (s.text.title !== title) s.text.title = title;
    if (s.confirm.hidden !== (s.phase !== "error"))
      s.confirm.hidden = s.phase !== "error";
  }
  function fail(s: Session, message: string) {
    if (!live(s)) return;
    clearTimeout(s.timer);
    s.expected = undefined;
    s.phase = "error";
    s.intent = false;
    s.message = message;
    paint(s);
  }
  function issues(n: CouncilNative, catalog: CouncilCatalog) {
    return validCouncilModels(n.models)
      ? councilModelIssues(n.models, catalog, n.limits)
      : ["Choose 2–3 distinct native models"];
  }
  async function save(s: Session, n: CouncilNative, explicit = false) {
    if (!s.catalog || !live(s)) return;
    const catalog =
      explicit || s.policyConfirmed
        ? { ...s.catalog, managed: false }
        : s.catalog;
    const problems = issues(n, catalog);
    if (problems.length) return fail(s, `Unconfirmed: ${problems.join("; ")}`);
    const models = [...n.models];
    const revision = ++s.revision;
    s.policyConfirmed = explicit || s.policyConfirmed;
    s.models = models;
    s.phase = "saving";
    s.intent = false;
    s.message = "Saving selection (unconfirmed)";
    paint(s);
    try {
      const record = await options.store.write(
        n.account,
        "selected",
        models,
        timestamp(n.account),
      );
      if (!live(s) || revision !== s.revision) return;
      if (!record.selected || !equal(record.selected.models, models))
        return fail(
          s,
          "Save was not confirmed by storage; selection unconfirmed",
        );
      const current = active()!;
      if (!equal(current.models, models))
        return fail(
          s,
          "Unconfirmed native model change; review current models",
        );
      s.phase = "ready";
      s.message = "Saved selection";
      paint(s);
    } catch {
      fail(s, "Save failed; selection unconfirmed");
    }
  }
  function subscribe(s: Session, n: CouncilNative) {
    s.unsubscribe?.();
    s.unsubscribe = undefined;
    s.streams = n.streams;
    if (!n.streams || !s.catalog) return;
    const store = n.streams;
    try {
      // Baseline all existing executions, never relabel existing history as a new run.
      for (const run of extractCouncilRuns(
        store.getState(),
        s.catalog.councilModel,
      ))
        s.seen.add(run.requestId);
      s.unsubscribe = store.subscribe(() => {
        if (!live(s)) return;
        try {
          for (const run of extractCouncilRuns(
            store.getState(),
            s.catalog!.councilModel,
          )) {
            if (s.seen.has(run.requestId)) continue;
            s.seen.add(run.requestId);
            void options.store
              .write(
                s.native.account,
                "submitted",
                run.models,
                timestamp(s.native.account),
                run.requestId,
              )
              .then((record) => {
                if (!live(s)) return;
                if (
                  !record.submitted ||
                  record.submitted.requestId !== run.requestId ||
                  !equal(record.submitted.models, run.models)
                )
                  return fail(
                    s,
                    "Last submitted run was not confirmed by storage; unconfirmed",
                  );
                s.lastSubmitted = record.submitted;
                paint(s);
              })
              .catch(() => {
                fail(s, "Last submitted run could not be saved; unconfirmed");
              });
          }
        } catch {
          fail(s, "Native run tracking failed; unconfirmed");
        }
        schedule();
      });
    } catch {
      fail(s, "Native run tracking failed; unconfirmed");
    }
  }
  async function load(s: Session) {
    try {
      const [record, raw] = await Promise.all([
        options.store.read(s.native.account),
        fetchCatalog(),
      ]);
      if (!live(s)) return;
      const catalog = parseCouncilCatalog(raw);
      if (!catalog)
        return fail(s, "Unavailable current model catalog; unconfirmed");
      s.catalog = catalog;
      subscribe(s, active()!);
      if (s.phase === "error") return;
      s.lastSubmitted = record.submitted;
      clocks.set(
        s.native.account,
        Math.max(
          clocks.get(s.native.account) ?? 0,
          record.selected?.at ?? 0,
          record.submitted?.at ?? 0,
        ),
      );
      if (
        record.selected &&
        record.submitted &&
        record.selected.at === record.submitted.at &&
        !equal(record.selected.models, record.submitted.models)
      )
        return fail(
          s,
          "Saved selection and run order are ambiguous; confirm current models",
        );
      const useRun =
        record.submitted != null &&
        (record.selected == null || record.submitted.at >= record.selected.at);
      const saved = useRun ? record.submitted : record.selected;
      s.restoredMessage = useRun ? "Restored last run" : "Restored selection";
      if (!saved) {
        await save(s, active()!);
        return;
      }
      const models = validCouncilModels(saved.models);
      const n = active()!;
      const problems = models
        ? councilModelIssues(models, catalog, n.limits)
        : ["Saved model IDs are invalid"];
      if (problems.length || !models)
        return fail(s, `Unavailable saved selection: ${problems.join("; ")}`);
      // A user opening the picker while loading takes precedence over remembered data.
      if (s.intent || !equal(n.models, s.models))
        return fail(
          s,
          "Unconfirmed model change while loading; review current models",
        );
      s.expected = [...models];
      s.phase = "verifying";
      s.message = "Restoration unconfirmed";
      paint(s);
      s.timer = setTimeout(() => {
        if (!live(s)) return;
        // Chrome can defer rAF in background tabs. Re-read committed native
        // state at the deadline instead of mistaking a deferred paint for failure.
        cancelAnimationFrame(frame);
        reconcile();
        if (s.phase === "verifying")
          fail(s, "Restoration failed: native models unconfirmed");
      }, 1500);
      if (!n.setModels)
        return fail(s, "Restoration failed: native model callback unavailable");
      n.setModels([...models]);
      // Only verify after the native render, not the callback's return value.
      schedule();
    } catch {
      fail(s, "Restoration failed; preferences unconfirmed");
    }
  }
  function stopSession() {
    if (!session) return;
    clearTimeout(session.timer);
    session.unsubscribe?.();
    session.ui.remove();
    session = undefined;
  }
  function start(n: CouncilNative) {
    const ui = document.createElement("div");
    ui.dataset.testid = "complexity-council-preferences";
    ui.className =
      "flex flex-wrap items-center gap-2 px-2 py-1 text-xs text-secondary";
    const text = document.createElement("span");
    text.setAttribute("role", "status");
    text.setAttribute("aria-live", "polite");
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = "Use current models";
    confirm.className = "rounded px-2 py-1 text-xs bg-subtle text-primary";
    confirm.hidden = true;
    ui.append(text, confirm);
    n.composer.append(ui);
    const s: Session = {
      native: n,
      phase: "loading",
      message: "Loading preferences (unconfirmed)",
      models: [...n.models],
      intent: false,
      ui,
      text,
      confirm,
      streams: null,
      seen: new Set(),
      revision: 0,
    };
    session = s;
    confirm.addEventListener(
      "click",
      () => {
        if (live(s)) void save(s, active()!, true);
      },
      { signal },
    );
    paint(s);
    void load(s);
  }
  function reconcile() {
    frame = 0;
    const n = active();
    if (!n) {
      stopSession();
      return;
    }
    if (!session || !matches(session, n)) {
      stopSession();
      start(n);
      return;
    }
    const s = session;
    if (!s.ui.isConnected) n.composer.append(s.ui);
    if (s.catalog && n.streams !== s.streams) subscribe(s, n);
    if (s.phase === "verifying" && s.expected && equal(n.models, s.expected)) {
      if (issues(n, s.catalog!).length)
        return fail(
          s,
          "Restoration failed: current native model limits changed",
        );
      clearTimeout(s.timer);
      s.models = [...n.models];
      s.expected = undefined;
      s.phase = "ready";
      s.message = s.restoredMessage ?? "Restored selection";
    } else if (s.phase === "ready" && !equal(n.models, s.models)) {
      if (s.intent && Date.now() - (s.intentAt ?? 0) < 15000) {
        void save(s, n);
      } else fail(s, "Unconfirmed native model change; review current models");
    }
    paint(s);
  }
  function schedule() {
    if (!signal.aborted && !frame) frame = requestAnimationFrame(reconcile);
  }
  function guard(event: Event) {
    const n = active();
    if (!n) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || session?.ui.contains(target)) return;
    if (event.type === "click") {
      const button = target.closest("button");
      if (
        button &&
        /^\d+ models?$/i.test(
          button.getAttribute("aria-label") ?? button.textContent.trim(),
        )
      ) {
        if (session && matches(session, n)) {
          session.intent = true;
          session.intentAt = Date.now();
        }
        return;
      }
      if (
        !button ||
        !(
          button.type === "submit" ||
          /^Submit$/i.test(button.getAttribute("aria-label") ?? "")
        )
      )
        return;
      // Only the active composer's own native Submit, not unrelated page actions.
      if (
        !n.composer.contains(button) &&
        !n.composer.closest("form")?.contains(button) &&
        !n.anchor.parentElement?.contains(button)
      )
        return;
    } else if (event instanceof KeyboardEvent) {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.isComposing ||
        !n.composer.contains(target)
      )
        return;
      // Enter on mode/picker controls must remain usable while recovery is pending.
      if (
        !target.closest(
          '[role="textbox"], textarea, input, [contenteditable="true"]',
        ) &&
        !target.closest('button[aria-label="Submit"], button[type="submit"]')
      )
        return;
    } else if (!n.composer.contains(target) && !target.contains(n.composer))
      return;
    const s = session;
    if (
      !s ||
      !matches(s, n) ||
      s.phase !== "ready" ||
      !equal(s.models, n.models) ||
      !s.catalog ||
      issues(
        n,
        s.policyConfirmed ? { ...s.catalog, managed: false } : s.catalog,
      ).length
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (s && matches(s, n) && s.phase === "ready")
        fail(s, "Unconfirmed native models; review current models");
      schedule();
    }
  }
  document.addEventListener("click", guard, { capture: true, signal });
  document.addEventListener("keydown", guard, { capture: true, signal });
  document.addEventListener("submit", guard, { capture: true, signal });
  window.addEventListener("popstate", schedule, { signal });
  window.addEventListener("hashchange", schedule, { signal });
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  const dispose = () => {
    controller.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
    stopSession();
    if (disposePrevious === dispose) disposePrevious = undefined;
  };
  disposePrevious = dispose;
  schedule();
  return dispose;
}
