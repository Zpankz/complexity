const TEST_ID = "complexity-copy-skill-context";
const CAVEAT =
  "Only this file is included. Referenced files, scripts, dependencies, credentials and tools are not installed; this is plain prompt context, not native skill execution.";
let disposeCopy: (() => void) | undefined;
type Fiber = { memoizedProps?: Record<string, unknown>; return?: Fiber | null };

// Read only the inspected viewer's public render inputs, never account/auth state.
function boundSource(pre: HTMLElement) {
  const key = Object.keys(pre).find((key) => key.startsWith("__reactFiber$"));
  let fiber = key ? (pre as unknown as Record<string, Fiber>)[key] : undefined;
  for (
    let depth = 0;
    fiber && depth < 6;
    depth++, fiber = fiber.return ?? undefined
  ) {
    const props = fiber.memoizedProps;
    if (!props || !("filePath" in props) || !("content" in props)) continue;
    if (
      props.isLoading !== false ||
      Boolean(props.error) ||
      typeof props.filePath !== "string" ||
      typeof props.content !== "string" ||
      !/^[^\r\n\\]+\.[a-z0-9]+$/i.test(props.filePath) ||
      props.filePath
        .split("/")
        .some((part) => !part || part === "." || part === "..") ||
      typeof props.isMarkdown !== "boolean" ||
      (props.isMarkdown && props.viewMode !== "markdown") ||
      pre.textContent !== props.content
    )
      return null;
    return { path: props.filePath, source: props.content };
  }
  return null;
}

/** Install an opt-in copier for one authenticated skill viewer's verified source. */
export function installSkillContextCopy(): () => void {
  disposeCopy?.();
  const controller = new AbortController();
  const { signal } = controller;
  let toolbar: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let status: HTMLSpanElement | null = null;
  let frame = 0;
  let lastSource = "";
  let lastPath = "";
  let busy = false;
  let sourceRoute = "";
  const currentRoute = () => `${location.origin}${location.pathname}`;

  function section() {
    if (
      !/^\/computer\/plugins\/skills\/[a-z0-9-]+\/?$/i.test(
        location.pathname,
      ) ||
      !["www.perplexity.ai", "perplexity.ai"].includes(location.hostname) ||
      !document.querySelector(
        'nav[aria-label="Main"] button img[alt="Profile avatar"]',
      )
    )
      return null;
    const sections = [
      ...document.querySelectorAll<HTMLElement>("main section"),
    ].filter((el) =>
      [...el.querySelectorAll("h2")].some((h) => h.textContent === "Files"),
    );
    return sections.length === 1 ? sections[0] : null;
  }
  function read(panel: HTMLElement) {
    const group = panel.querySelector(
      '[role="radiogroup"][aria-label="File view"]',
    );
    if (
      group &&
      !group.querySelector(
        '[role="radio"][aria-label="Markdown"][aria-checked="true"]',
      )
    )
      return { message: "Switch to Markdown/source view" };
    const sources = panel.querySelectorAll<HTMLElement>(
      "pre.whitespace-pre-wrap",
    );
    const data =
      sources.length === 1 && sources[0] ? boundSource(sources[0]) : null;
    if (!data || !data.source)
      return { message: "Full selected source is unavailable" };
    if (new Blob([data.source]).size > 1_000_000)
      return { message: "File exceeds 1 MB; nothing copied" };
    return { message: "", data };
  }
  function say(message: string) {
    if (status && status.textContent !== message) status.textContent = message;
  }
  function detach() {
    toolbar?.remove();
    toolbar = null;
    button = null;
    status = null;
    lastSource = "";
    lastPath = "";
    sourceRoute = "";
  }
  async function copy() {
    const panel = section();
    const current = panel ? read(panel) : null;
    if (!current?.data || busy) {
      say(current?.message ?? "Selected source is unavailable");
      return;
    }
    if (sourceRoute !== currentRoute()) {
      say("Skill page changed; reload the source view before copying.");
      return;
    }
    const { path, source } = current.data;
    const text = `File: ${path}\nSkill page: ${location.origin}${location.pathname}\n${CAVEAT}\n\n${source}`;
    if (new Blob([text]).size > 1_000_000) {
      say("Context exceeds 1 MB; nothing copied");
      return;
    }
    busy = true;
    try {
      await navigator.clipboard.writeText(text);
      if (!signal.aborted) say(`Copied ${path}. Only this file is included.`);
    } catch {
      if (!signal.aborted)
        say("Copy failed. Clipboard permission is required.");
    } finally {
      busy = false;
    }
  }
  function sync() {
    frame = 0;
    const panel = section();
    if (!panel) {
      detach();
      return;
    }
    if (!toolbar?.isConnected || !panel.contains(toolbar)) {
      detach();
      toolbar = document.createElement("div");
      toolbar.className = "flex flex-wrap items-center gap-2 text-sm";
      button = document.createElement("button");
      button.type = "button";
      button.dataset.testid = TEST_ID;
      button.className =
        "reset interactable rounded-lg border px-3 py-1.5 text-sm text-primary disabled:opacity-50";
      button.textContent = "Copy file as prompt context";
      button.addEventListener(
        "click",
        () => {
          void copy();
        },
        { signal },
      );
      status = document.createElement("span");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      toolbar.append(button, status);
      panel.querySelector("h2")?.after(toolbar);
    }
    const current = read(panel);
    if (
      current.data &&
      sourceRoute &&
      sourceRoute !== currentRoute() &&
      lastSource === current.data.source &&
      lastPath === current.data.path
    ) {
      if (button && !button.disabled) button.disabled = true;
      say("Skill page changed; reload the source view before copying.");
      return;
    }
    if (button && button.disabled !== !current.data)
      button.disabled = !current.data;
    if (current.message) {
      lastSource = "";
      lastPath = "";
      say(current.message);
    } else if (
      current.data &&
      (lastSource !== current.data.source || lastPath !== current.data.path)
    ) {
      lastSource = current.data.source;
      lastPath = current.data.path;
      sourceRoute = currentRoute();
      say("Only the selected file will be copied as plain prompt context.");
    }
  }
  function schedule() {
    if (!frame && !signal.aborted) frame = requestAnimationFrame(sync);
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
  window.addEventListener("popstate", schedule, { signal });
  // Native SPA DOM updates and popstate invalidate the viewer without patching history.
  const cleanup = () => {
    controller.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
    detach();
    if (disposeCopy === cleanup) disposeCopy = undefined;
  };
  disposeCopy = cleanup;
  sync();
  return cleanup;
}
