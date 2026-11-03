import {
  getNativeSelector,
  selectNativeMode,
  MODE_OPTIONS,
} from "@/plugins/restore-search-mode-selector/native-selector";

import { getLegacyThreadScope } from "@/plugins/restore-search-mode-selector/legacy-research";

const SELECTOR =
  '[data-testid="ask-input-mode-toggle-width-wrapper"] button[aria-pressed="true"]';
const SVG_NS = "http://www.w3.org/2000/svg";
let disposeMenu: (() => void) | undefined;
let menuSequence = 0;

export function installSearchModeMenu(): () => void {
  disposeMenu?.();
  const controller = new AbortController();
  const { signal } = controller;
  const menuId = `complexity-search-mode-menu-${++menuSequence}`;
  let trigger: HTMLButtonElement | null = null;
  let menu: HTMLDivElement | null = null;
  let indicator: SVGSVGElement | null = null;
  let frame = 0;
  let modes = "";
  let originalAttributes: Array<[string, string | null]> = [];
  const injectedAttributes = new Map<string, string>();
  let positioned = false;
  let originalPosition = "";
  let originalPriority = "";

  function read(button: HTMLButtonElement | null) {
    if (
      !button?.isConnected ||
      !button.matches(SELECTOR) ||
      button.getAttribute("aria-label") !== "Search" ||
      button.getAttribute("aria-disabled") === "true"
    )
      return null;
    const isHome = location.pathname === "/";
    const isThread = /^\/search\/(?!new\/?$)[^/]+\/?$/.test(location.pathname) &&
      getLegacyThreadScope(button) != null;
    return isHome || isThread ? getNativeSelector(button) : null;
  }

  function setAttribute(name: string, value: string) {
    trigger?.setAttribute(name, value);
    injectedAttributes.set(name, value);
  }

  function close(returnFocus = false) {
    menu?.remove();
    menu = null;
    if (
      trigger?.getAttribute("aria-expanded") === "true" &&
      injectedAttributes.get("aria-expanded") === "true"
    ) {
      setAttribute("aria-expanded", "false");
    }
    if (returnFocus && trigger?.isConnected) trigger.focus();
  }

  function detach() {
    menu?.remove();
    menu = null;
    if (trigger) {
      // Radix may take ownership while React renders its restored native menu.
      // Even equal-valued ARIA attributes then belong to the site, not this menu.
      const nativeTakeover =
        trigger.hasAttribute("data-state") ||
        trigger.getAttribute("aria-controls") !== menuId;
      for (const [name, value] of originalAttributes) {
        if (nativeTakeover && name.startsWith("aria-")) continue;
        if (trigger.getAttribute(name) !== injectedAttributes.get(name))
          continue;
        if (value === null) trigger.removeAttribute(name);
        else trigger.setAttribute(name, value);
      }
      if (
        positioned &&
        trigger.style.getPropertyValue("position") === "relative" &&
        !trigger.style.getPropertyPriority("position")
      ) {
        if (originalPosition)
          trigger.style.setProperty(
            "position",
            originalPosition,
            originalPriority,
          );
        else trigger.style.removeProperty("position");
      }
    }
    injectedAttributes.clear();
    positioned = false;
    indicator?.remove();
    indicator = null;
    trigger = null;
    modes = "";
  }

  function position() {
    if (!menu || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(208, Math.max(0, window.innerWidth - margin * 2));
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${Math.max(0, window.innerHeight - margin * 2)}px`;
    const height = menu.getBoundingClientRect().height;
    const above = rect.top - height - margin;
    const top = above >= margin ? above : rect.bottom + margin;
    menu.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`;
  }

  function reconcile() {
    frame = 0;
    const candidate = document.querySelector<HTMLButtonElement>(SELECTOR);
    const native = read(candidate);
    if (!native) {
      detach();
      return;
    }
    if (candidate !== trigger) {
      detach();
      trigger = candidate;
      if (!trigger) return;
      originalAttributes = [
        "aria-haspopup",
        "aria-expanded",
        "aria-controls",
        "title",
      ].map((name) => [name, trigger!.getAttribute(name)]);
      originalPosition = trigger.style.getPropertyValue("position");
      originalPriority = trigger.style.getPropertyPriority("position");
      positioned = getComputedStyle(trigger).position === "static";
      if (positioned) trigger.style.setProperty("position", "relative");
      setAttribute("aria-haspopup", "menu");
      setAttribute("aria-expanded", "false");
      setAttribute("aria-controls", menuId);
      setAttribute("title", "Choose search mode");
      indicator = document.createElementNS(SVG_NS, "svg");
      indicator.setAttribute("viewBox", "0 0 12 12");
      indicator.setAttribute("aria-hidden", "true");
      indicator.setAttribute("focusable", "false");
      indicator.style.cssText =
        "position:absolute;right:1px;bottom:1px;width:9px;height:9px;pointer-events:none;opacity:.65";
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", "m3 4.5 3 3 3-3");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.5");
      indicator.append(path);
      trigger.append(indicator);
    }
    if (indicator && trigger && !trigger.contains(indicator))
      trigger.append(indicator);
    const nextModes = native.modes.join("|");
    if (modes !== nextModes) close();
    modes = nextModes;
    position();
  }

  function schedule() {
    if (!frame && !signal.aborted) frame = requestAnimationFrame(reconcile);
  }

  function items() {
    return menu
      ? Array.from(
          menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
        )
      : [];
  }

  function open(last = false) {
    const native = read(trigger);
    if (!native || !trigger) {
      detach();
      return;
    }
    close();
    modes = native.modes.join("|");
    menu = document.createElement("div");
    menu.id = menuId;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Search modes");
    menu.className =
      "bg-base text-primary rounded-xl border border-subtle shadow-lg";
    menu.style.cssText =
      "position:fixed;z-index:2147483647;padding:4px;box-sizing:border-box;overflow-y:auto;font-size:14px";
    for (const option of MODE_OPTIONS) {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(option.value === "search"));
      item.disabled = !native.modes.includes(option.value);
      item.setAttribute("aria-disabled", String(item.disabled));
      item.tabIndex = -1;
      item.className =
        "reset interactable hover:bg-subtle rounded-xl text-primary";
      item.style.cssText =
        "display:flex;align-items:center;gap:10px;width:100%;min-height:36px;padding:8px 10px;text-align:left;box-sizing:border-box";
      if (item.disabled) item.style.opacity = ".45";
      const icon = document.createElementNS(SVG_NS, "svg");
      icon.setAttribute("aria-hidden", "true");
      icon.setAttribute("focusable", "false");
      icon.style.cssText = "width:18px;height:18px;flex-shrink:0";
      const use = document.createElementNS(SVG_NS, "use");
      use.setAttribute("href", `#pplx-icon-${option.icon}`);
      icon.append(use);
      const label = document.createElement("span");
      label.textContent = option.label;
      item.setAttribute("aria-label", option.label);
      if (option.value === "research" && location.pathname === "/") {
        item.setAttribute(
          "aria-description",
          "Perplexity may route Deep Research to Computer. Credits may apply.",
        );
        item.title =
          "Perplexity may route Deep Research to Computer. Credits may apply.";
        const warning = document.createElement("small");
        warning.textContent = "May use Computer";
        warning.setAttribute("aria-hidden", "true");
        warning.style.cssText =
          "display:block;font-size:11px;opacity:.7;line-height:1.3";
        label.append(warning);
      }
      item.append(icon, label);
      item.addEventListener("click", () => {
        const current = read(trigger);
        if (!current || !trigger) {
          detach();
          return;
        }
        if (!current.modes.includes(option.value)) {
          close(true);
          schedule();
          return;
        }
        const button = trigger;
        close(true);
        if (!selectNativeMode(button, option.value)) detach();
        schedule();
      });
      menu.append(item);
    }
    document.body.append(menu);
    setAttribute("aria-expanded", "true");
    position();
    const available = items();
    (last ? available.at(-1) : available[0])?.focus();
  }

  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Node) || !trigger?.contains(event.target))
        return;
      if (!read(trigger)) {
        detach();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (menu) close(true);
      else open();
    },
    { capture: true, signal },
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (!(event.target instanceof Node)) return;
      const onTrigger = trigger?.contains(event.target);
      const inMenu = menu?.contains(event.target);
      if (!onTrigger && !inMenu) return;
      if (!read(trigger)) {
        detach();
        return;
      }
      if (event.key === "Tab") {
        close(true);
        return;
      }
      if (event.key === "Escape" && menu) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close(true);
        return;
      }
      if (
        onTrigger &&
        ["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (menu && ["Enter", " "].includes(event.key)) close(true);
        else open(event.key === "ArrowUp");
        return;
      }
      if (
        !inMenu ||
        !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const available = items();
      const index = available.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? available.length - 1
            : (index +
                (event.key === "ArrowDown" ? 1 : -1) +
                available.length) %
              available.length;
      available[next]?.focus();
    },
    { capture: true, signal },
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.target instanceof Node &&
        !trigger?.contains(event.target) &&
        !menu?.contains(event.target)
      )
        close();
    },
    { capture: true, signal },
  );
  window.addEventListener("popstate", schedule, { signal });
  window.addEventListener("resize", schedule, { signal });
  window.addEventListener("scroll", schedule, {
    capture: true,
    passive: true,
    signal,
  });
  const observer = new MutationObserver(schedule);
  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "aria-pressed",
      "aria-label",
      "aria-disabled",
      "disabled",
      "hidden",
    ],
  });
  const cleanup = () => {
    controller.abort();
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    detach();
    if (disposeMenu === cleanup) disposeMenu = undefined;
  };
  disposeMenu = cleanup;
  reconcile();
  return cleanup;
}
