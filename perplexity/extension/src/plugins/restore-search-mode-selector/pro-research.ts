import {
  getLegacyThreadScope,
  getIncludedProAction,
  type LegacyThreadScope,
} from "@/plugins/restore-search-mode-selector/legacy-research";

const SELECTOR =
  '[data-testid="ask-input-mode-toggle-width-wrapper"] button[aria-pressed="true"]';
const OPTION = '[role="option"][id$="-featured:deep-research"]';
let disposeShortcut: (() => void) | undefined;

/** Companion to the home selector: only invoke the native, included Plus action. */
export function installProResearchShortcut(): () => void {
  disposeShortcut?.();
  const controller = new AbortController();
  let trigger: HTMLButtonElement | null = null;
  let shortcut: HTMLButtonElement | null = null;
  let status: HTMLSpanElement | null = null;
  let mountedScope: LegacyThreadScope | null = null;
  let frame = 0;
  let cancelPending: (() => void) | null = null;
  let checkPending: (() => void) | null = null;

  function read(button: HTMLButtonElement | null) {
    if (
      controller.signal.aborted ||
      !/^\/search\/(?!new\/?$)[^/]+\/?$/.test(location.pathname) ||
      !button?.isConnected ||
      !button.matches(SELECTOR) ||
      button.matches(':disabled, [aria-disabled="true"]')
    )
      return null;
    const composer = button.closest<HTMLElement>("[data-composer]");
    const scope = composer && getLegacyThreadScope(button);
    return composer && scope ? { composer, scope } : null;
  }

  function same(a: LegacyThreadScope | null, b: LegacyThreadScope) {
    return a?.config === b.config && a.threadId === b.threadId;
  }

  function mountFor(button: HTMLButtonElement, composer: HTMLElement) {
    const anchor = button.closest<HTMLElement>("[data-command-menu-control]");
    const parent = anchor?.parentElement;
    return anchor &&
      parent &&
      composer.contains(parent) &&
      !parent.closest("button")
      ? anchor
      : null;
  }

  function unavailable() {
    if (!shortcut?.isConnected) return;
    if (!status) {
      status = document.createElement("span");
      status.setAttribute("role", "status");
      status.className = "text-secondary text-xs";
      status.textContent =
        "Included in Pro Research is unavailable in this chat.";
      shortcut.after(status);
    }
  }

  function detach() {
    cancelPending?.();
    shortcut?.removeEventListener("click", activate);
    shortcut?.remove();
    status?.remove();
    shortcut = null;
    status = null;
    trigger = null;
    mountedScope = null;
  }

  function blocked(composer: HTMLElement) {
    const add = composer.querySelector<HTMLButtonElement>(
      'button[aria-label="Add"], button[aria-label="Close"][aria-expanded="true"]',
    );
    return {
      add,
      blocked:
        !add ||
        add.matches(':disabled, [aria-disabled="true"]') ||
        !!composer.querySelector(
          'button[aria-label^="Stop response"],button[aria-label^="Stop generating"]',
        ),
    };
  }

  function activate(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (cancelPending) return;
    const initial = read(trigger);
    if (!initial || !same(mountedScope, initial.scope)) {
      unavailable();
      schedule();
      return;
    }
    if (initial.scope.isActive) return;
    const { add, blocked: busy } = blocked(initial.composer);
    if (busy || !add) {
      unavailable();
      return;
    }
    status?.remove();
    status = null;
    const origin = location.href;
    const button = trigger;
    let finished = false;
    const isFinished = () => finished;
    const pendingObserver = new MutationObserver(schedule);
    const finish = () => {
      if (finished) return;
      finished = true;
      pendingObserver.disconnect();
      clearTimeout(timer);
      cancelPending = null;
      checkPending = null;
    };
    const timer = window.setTimeout(() => {
      finish();
      unavailable();
    }, 1500);
    cancelPending = finish;
    checkPending = () => {
      if (finished) return;
      const live = read(button);
      if (
        origin !== location.href ||
        !live ||
        live.composer !== initial.composer ||
        !same(initial.scope, live.scope) ||
        blocked(live.composer).blocked
      ) {
        finish();
        unavailable();
        return;
      }
      if (live.scope.isActive) {
        finish();
        return;
      }
      for (const option of document.querySelectorAll<HTMLElement>(OPTION)) {
        const action = getIncludedProAction(option, live.scope);
        if (!action) continue;
        // The helper validates the menu's owning config/thread, including portals.
        const latest = read(button);
        if (!latest || !same(live.scope, latest.scope) || latest.scope.isActive)
          continue;
        const freshAction = getIncludedProAction(option, latest.scope);
        if (!freshAction) continue;
        finish();
        try {
          freshAction();
        } catch {
          unavailable();
        }
        schedule();
        return;
      }
    };
    pendingObserver.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    const check = checkPending;
    check();
    if (
      !isFinished() &&
      add.getAttribute("aria-expanded") !== "true" &&
      !document.querySelector(OPTION)
    ) {
      add.click();
      check();
    }
  }

  function reconcile() {
    frame = 0;
    checkPending?.();
    const candidate = document.querySelector<HTMLButtonElement>(SELECTOR);
    if (!candidate) {
      detach();
      return;
    }
    const live = read(candidate);
    const anchor = live && mountFor(candidate, live.composer);
    if (!live || !anchor) {
      detach();
      return;
    }
    if (
      trigger !== candidate ||
      !same(mountedScope, live.scope) ||
      !shortcut?.isConnected ||
      shortcut.parentElement !== anchor.parentElement
    ) {
      detach();
      trigger = candidate;
      mountedScope = live.scope;
      shortcut = document.createElement("button");
      shortcut.type = "button";
      shortcut.dataset.testid = "complexity-pro-research";
      shortcut.setAttribute("aria-label", "Deep Research (Included in Pro)");
      shortcut.textContent = "Pro Research";
      shortcut.className =
        "reset interactable rounded-full text-secondary hover:text-primary hover:bg-soft h-8 px-2 text-sm";
      shortcut.addEventListener("click", activate);
      anchor.after(shortcut);
    }
    const pressed = String(live.scope.isActive);
    if (shortcut.getAttribute("aria-pressed") !== pressed)
      shortcut.setAttribute("aria-pressed", pressed);
    const title = live.scope.isActive
      ? "Legacy Deep Research is active in this chat"
      : "Deep Research (Included in Pro)";
    if (shortcut.title !== title) shortcut.title = title;
  }

  function schedule() {
    if (!frame && !controller.signal.aborted)
      frame = requestAnimationFrame(reconcile);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  window.addEventListener("popstate", schedule, { signal: controller.signal });
  const cleanup = () => {
    controller.abort();
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    detach();
    if (disposeShortcut === cleanup) disposeShortcut = undefined;
  };
  disposeShortcut = cleanup;
  reconcile();
  return cleanup;
}
