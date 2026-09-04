import {
  CreateStartUpPageContainer,
  type EvenAppBridge,
  type EvenHubEvent,
  ListContainerProperty,
  ListItemContainerProperty,
  OsEventTypeList,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
} from "@evenrealities/even_hub_sdk";
import {
  AVAILABLE_CONNECTION_STATE,
  connectionStatusText,
  presentConnectionState,
} from "@t3tools/client-runtime/connection";
import type {
  EnvironmentId,
  OrchestrationShellSnapshot,
  OrchestrationThreadShell,
  ThreadId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import {
  requestOlderThreadTurns,
  threadHasOlderTurns,
} from "@t3tools/client-runtime/state/threads";

import { appAtomRegistry } from "../connection/runtime";
import { environmentCatalog, environmentShell, environmentThreads } from "../state";
import { bridgeCall, bridgeIdle, evenAppBridge } from "./bridge";
import { revealCharsPerTick, revealSpeedAtom } from "./revealSpeed";
import {
  BODY_HEIGHT,
  BODY_INNER_WIDTH,
  dashboardLayout,
  flattenTitle,
  statusIcon,
  threadPreview,
  threadStatusKind,
  BODY_MAX_LINES,
  displayTitle,
  DIVIDER_HEIGHT,
  LIST_ITEM_MAX_BYTES,
  PANEL_PADDING,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  STATUS_HEIGHT,
  STATUS_INNER_WIDTH,
  STATUS_PADDING,
  type LineWindow,
  statusBar,
  revealedLines,
  skipInstantLines,
  SPINNER_FRAMES,
  transcriptLayout,
  type TranscriptLayout,
  transcriptLength,
  truncateBytes,
  visibleThreads,
  windowEndingAt,
  windowStartingAt,
} from "./format";

export const glassesStatusAtom = Atom.make("Waiting for the Even App bridge...").pipe(
  Atom.keepAlive,
  Atom.withLabel("glasses-status"),
);

// BLE round trips are slow and the firmware redraws the whole container on
// every update; coalescing bursts of stream events keeps the page readable.
const RENDER_THROTTLE_MS = 400;
const ELAPSED_TICK_MS = 1_000;
// Spinner cadence on the thread page, where it is a flicker-free text update.
// The list page has no spinner: list rebuilds reset the cursor to the top.
const SPINNER_TICK_MS = 500;
// Characters per second come from the phone page (revealSpeedAtom); renders
// still coalesce to the bridge throttle so the glasses see a few characters at a time.
const REVEAL_TICK_MS = 200;
// Edge events can repeat for one physical swipe; ignore the echoes.
const SCROLL_COOLDOWN_MS = 300;
const OLDER_FETCH_TIMEOUT_MS = 15_000;
// About three browse pages above the first loaded line.
const PREFETCH_OLDER_WITHIN_LINES = 80;
// Documented host limits, with headroom for the wrapped-line joins.
const UPGRADE_MAX_CHARS = 1900;
const REBUILD_MAX_CHARS = 950;
const MIN_UPGRADE_LIMIT = 256;
const MIN_USEFUL_UPGRADE_CHARS = 400;

const SCREEN = {
  xPosition: 0,
  yPosition: 0,
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
} as const;
// One framed panel, as in the official terminal app: transcript on top, a
// divider, then a status strip. The frame is its own empty container so the
// transcript can stop above the divider without breaking the outline.
const FRAME = { borderWidth: 1, borderColor: 10, borderRadius: 8 } as const;
const LIST_CONTAINER = { containerID: 1, containerName: "list" } as const;
const TEXT_CONTAINER = { containerID: 2, containerName: "body" } as const;
const FRAME_CONTAINER = { containerID: 3, containerName: "frame" } as const;
const DIVIDER_CONTAINER = { containerID: 4, containerName: "divider" } as const;
const STATUS_CONTAINER = { containerID: 5, containerName: "status" } as const;

type Page =
  | { readonly kind: "environments" }
  | { readonly kind: "threads"; readonly environmentId: EnvironmentId }
  | {
      readonly kind: "thread";
      readonly environmentId: EnvironmentId;
      readonly threadId: ThreadId;
    };

type View =
  | {
      readonly kind: "list";
      readonly items: ReadonlyArray<string>;
      readonly ids: ReadonlyArray<string>;
    }
  | { readonly kind: "text"; readonly content: string }
  | { readonly kind: "thread"; readonly body: string; readonly status: string };

function eventTypeOf(envelope: { eventType?: OsEventTypeList } | undefined) {
  if (!envelope) {
    return null;
  }
  // CLICK_EVENT is 0 and protobuf omits zero-value fields, so a tap arrives
  // with eventType undefined inside its envelope.
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT;
}

function setStatus(status: string) {
  appAtomRegistry.set(glassesStatusAtom, status);
}

function connectionPhase(environmentId: EnvironmentId) {
  const state = Option.getOrElse(
    AsyncResult.value(appAtomRegistry.get(environmentCatalog.stateAtom(environmentId))),
    () => AVAILABLE_CONNECTION_STATE,
  );
  return presentConnectionState(state);
}

function environmentsView(): View {
  const entries = [...appAtomRegistry.get(environmentCatalog.catalogValueAtom).entries];
  if (entries.length === 0) {
    return {
      kind: "text",
      content:
        "No T3 Code server paired.\n\nOn your phone, open this app in the Even App and scan the QR from T3 Code Settings > Connections.",
    };
  }
  return {
    kind: "list",
    ids: entries.map(([environmentId]) => environmentId),
    items: entries.map(([environmentId, entry]) => {
      const phase = connectionPhase(environmentId).phase;
      const suffix = phase === "connected" ? "" : ` (${phase})`;
      return truncateBytes(`${entry.target.label}${suffix}`, LIST_ITEM_MAX_BYTES);
    }),
  };
}

type Dashboard = {
  readonly view: View;
  readonly ids: ReadonlyArray<ThreadId>;
  readonly visibleIds: ReadonlyArray<ThreadId>;
  readonly cursor: ThreadId | null;
  readonly windowStart: number;
};

/**
 * The threads page is a text dashboard, not a native list: a list cannot be
 * updated in place and every rebuild drops the firmware cursor to the top.
 * The marker here is ours, follows the thread it was on, and moves with
 * swipes as in-place text updates.
 */
function threadsDashboard(
  environmentId: EnvironmentId,
  cursor: ThreadId | null,
  windowStart: number,
): Dashboard {
  const empty = (content: string): Dashboard => ({
    view: { kind: "text", content },
    ids: [],
    visibleIds: [],
    cursor: null,
    windowStart: 0,
  });
  const shell = appAtomRegistry.get(environmentShell.stateValueAtom(environmentId));
  if (Option.isNone(shell.snapshot)) {
    const status = connectionStatusText(connectionPhase(environmentId));
    return empty(`Loading threads...\n\n${status}`);
  }
  const threads = visibleThreads(shell.snapshot.value.threads, {
    now: new Date().toISOString(),
  });
  if (threads.length === 0) {
    return empty("No threads yet.");
  }
  const projects = projectTitles(shell.snapshot.value.projects);
  const rows = threads.map((thread) => {
    const kind = threadStatusKind(thread);
    return {
      id: thread.id,
      // Working rows get a fixed arrow, not the spinner; see threadListLabel.
      icon: kind === "working" ? SPINNER_FRAMES[0] : statusIcon(kind, 0),
      project: flattenTitle(projects.get(thread.projectId) ?? ""),
      title: flattenTitle(thread.title),
      working: kind === "working",
    };
  });
  const preview = (id: string) => {
    const detail = Option.getOrNull(
      AsyncResult.value(
        appAtomRegistry.get(environmentThreads.stateAtom(environmentId, id as ThreadId)),
      ),
    );
    const row = rows.find((candidate) => candidate.id === id);
    return detail !== null && Option.isSome(detail.data)
      ? threadPreview(detail.data.value, row?.working ?? false)
      : null;
  };
  const layout = dashboardLayout(rows, cursor, windowStart, preview);
  const ids = threads.map((thread) => thread.id);
  return {
    view: { kind: "text", content: layout.content },
    ids,
    visibleIds: layout.visibleIds as ReadonlyArray<ThreadId>,
    cursor: ids[layout.cursor] ?? null,
    windowStart: layout.windowStart,
  };
}

function projectTitles(projects: OrchestrationShellSnapshot["projects"]) {
  return new Map(projects.map((project) => [project.id, project.title] as const));
}

const MISSING_THREAD_SHELL: Pick<
  OrchestrationThreadShell,
  | "title"
  | "session"
  | "latestTurn"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "planProgress"
> = {
  title: "Thread",
  session: null,
  latestTurn: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  planProgress: null,
};

/**
 * "follow" keeps the newest lines on screen with no overflow, so nothing has
 * to be scrolled to read a live turn. "browse" fills the container with as
 * much history as one update allows and lets the firmware scroll it; the
 * boundary events then slide the window through older or newer lines.
 */
type ThreadMode = { readonly kind: "follow" } | { readonly kind: "browse"; readonly start: number };

interface ThreadRender {
  readonly view: View;
  readonly lines: ReadonlyArray<string>;
  readonly layout: TranscriptLayout;
  readonly window: LineWindow;
  readonly hasOlder: boolean;
  readonly loadingOlder: boolean;
  /** False until the thread detail has arrived and `lines` is real text. */
  readonly loaded: boolean;
}

function threadRender(
  environmentId: EnvironmentId,
  threadId: ThreadId,
  mode: ThreadMode,
  browseChars: number,
  spinnerFrame: number,
  revealChars: number | null,
  fetchingOlder: boolean,
): ThreadRender {
  const shell = appAtomRegistry.get(environmentShell.stateValueAtom(environmentId));
  const shellThread = Option.isSome(shell.snapshot)
    ? shell.snapshot.value.threads.find((thread) => thread.id === threadId)
    : undefined;
  const detail = Option.getOrNull(
    AsyncResult.value(appAtomRegistry.get(environmentThreads.stateAtom(environmentId, threadId))),
  );
  const thread = detail !== null && Option.isSome(detail.data) ? detail.data.value : null;
  const status = shellThread ?? MISSING_THREAD_SHELL;
  const projectTitle =
    shellThread === undefined || Option.isNone(shell.snapshot)
      ? undefined
      : projectTitles(shell.snapshot.value.projects).get(shellThread.projectId);
  const layout: TranscriptLayout =
    thread === null
      ? { lines: ["Loading..."], origins: ["agent"] }
      : transcriptLayout(thread, BODY_INNER_WIDTH);
  const lines = layout.lines;
  const shown =
    mode.kind === "follow" && revealChars !== null ? revealedLines(lines, revealChars) : lines;
  const hasOlder = detail !== null && threadHasOlderTurns(detail);
  const window =
    mode.kind === "follow"
      ? windowEndingAt(shown, shown.length, browseChars, BODY_MAX_LINES)
      : windowStartingAt(lines, mode.start, browseChars);
  return {
    lines,
    layout,
    window,
    loaded: thread !== null,
    hasOlder,
    loadingOlder:
      detail !== null && Option.isSome(detail.page) ? detail.page.value.loadingOlder : false,
    view: {
      kind: "thread",
      body: window.text,
      // The shell carries the freshest turn state, so status comes from it.
      status: statusBar(status, Date.now(), {
        title: displayTitle(projectTitle, status.title),
        maxWidth: STATUS_INNER_WIDTH,
        browsing: mode.kind === "browse",
        spinnerFrame,
        loadingOlder: fetchingOlder,
        atTop: mode.kind === "browse" && window.start === 0 && !hasOlder,
      }),
    },
  };
}

function sameView(left: View, right: View): boolean {
  if (left.kind === "text" && right.kind === "text") {
    return left.content === right.content;
  }
  if (left.kind === "thread" && right.kind === "thread") {
    return left.body === right.body && left.status === right.status;
  }
  if (left.kind === "list" && right.kind === "list") {
    return (
      left.items.length === right.items.length &&
      left.items.every((item, index) => item === right.items[index])
    );
  }
  return false;
}

function textPanel(content: string) {
  return new TextContainerProperty({
    ...SCREEN,
    ...TEXT_CONTAINER,
    ...FRAME,
    paddingLength: PANEL_PADDING,
    content,
    isEventCapture: 1,
  });
}

function listPanel(items: ReadonlyArray<string>) {
  return new ListContainerProperty({
    ...SCREEN,
    ...LIST_CONTAINER,
    ...FRAME,
    paddingLength: PANEL_PADDING,
    isEventCapture: 1,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemName: [...items],
      isItemSelectBorderEn: 1,
    }),
  });
}

function threadPanels(body: string, status: string) {
  return [
    new TextContainerProperty({
      ...SCREEN,
      ...FRAME_CONTAINER,
      ...FRAME,
      content: "",
      isEventCapture: 0,
      zOrderIndex: 1,
    }),
    new TextContainerProperty({
      ...TEXT_CONTAINER,
      xPosition: 0,
      yPosition: 0,
      width: SCREEN.width,
      height: BODY_HEIGHT,
      paddingLength: PANEL_PADDING,
      content: body,
      isEventCapture: 1,
      zOrderIndex: 2,
    }),
    new TextContainerProperty({
      ...DIVIDER_CONTAINER,
      xPosition: PANEL_PADDING,
      yPosition: BODY_HEIGHT,
      width: SCREEN.width - PANEL_PADDING * 2,
      height: DIVIDER_HEIGHT,
      borderWidth: 1,
      borderColor: 10,
      content: "",
      isEventCapture: 0,
      zOrderIndex: 3,
    }),
    new TextContainerProperty({
      ...STATUS_CONTAINER,
      xPosition: 0,
      yPosition: BODY_HEIGHT + DIVIDER_HEIGHT,
      width: SCREEN.width,
      height: STATUS_HEIGHT,
      paddingLength: STATUS_PADDING,
      content: status,
      isEventCapture: 0,
      zOrderIndex: 4,
    }),
  ];
}

class GlassesController {
  private page: Page = { kind: "environments" };
  private rendered: View | null = null;
  private subscriptions: Array<() => void> = [];
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  // Longest in-place text update the host is known to accept. Starts at the
  // documented 2000 and drops to the size of any refused update, so a host
  // with a lower ceiling (the simulator) gets rebuilds instead of failed calls.
  private upgradeLimit = 2000;
  private threadMode: ThreadMode = { kind: "follow" };
  private lastThread: ThreadRender | null = null;
  // Line count when older turns were requested; the browse window shifts by
  // the growth once they arrive so the reader stays on the same lines.
  private olderRequest: { readonly total: number; readonly requestedAt: number } | null = null;
  private lastScrollAt = 0;
  // Dashboard marker: the thread it sits on and the first visible row.
  private dashboardCursor: ThreadId | null = null;
  private dashboardStart = 0;
  private dashboardIds: ReadonlyArray<ThreadId> = [];
  // Preview lines need each visible thread's transcript; only the threads on
  // screen stay subscribed, and they drop off as the window moves.
  private dashboardWatches = new Map<ThreadId, () => void>();
  // Advanced by the page ticker; only rows and strips that are "working" read it.
  private spinnerFrame = 0;
  private sliding = false;
  // Reveal cursor for follow mode: lines below it are not shown yet. Null
  // until the thread has loaded, then advanced one line per tick so a long
  // reply reads at a human pace instead of jumping straight to its end.
  private revealChars: number | null = null;
  private disposed = false;

  constructor(private readonly bridge: EvenAppBridge) {}

  async start() {
    const content = "Connecting to T3 Code...";
    // Register before the page exists so a tap during startup is not lost.
    this.bridge.onEvenHubEvent((event) => this.handleEvent(event));
    // Goes through the queue so it also gets the call timeout: after a page
    // reload the host already has a page and never answers a second startup
    // call, so a timeout is treated as "page exists" and the first rebuild
    // takes over from there.
    const result = await this.call("createStartUpPageContainer", () =>
      this.bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({ containerTotalNum: 1, textObject: [textPanel(content)] }),
      ),
    );
    if (result !== undefined && result !== StartUpPageCreateResult.success) {
      // "invalid" is also what a reloaded page gets: the host still holds the
      // page from before. Carry on; the first rebuild replaces it either way.
      setStatus(`Glasses startup answered ${StartUpPageCreateResult[result] ?? result}; retrying.`);
    }
    this.rendered = { kind: "text", content };
    this.enter({ kind: "environments" });
  }

  private call<T>(label: string, run: () => Promise<T>): Promise<T | undefined> {
    return bridgeCall(label, run);
  }

  private enter(page: Page) {
    this.page = page;
    this.threadMode = { kind: "follow" };
    this.lastThread = null;
    this.olderRequest = null;
    this.revealChars = null;
    this.dashboardCursor = null;
    this.dashboardStart = 0;
    this.dashboardIds = [];
    this.watchDashboardThreads([]);
    this.unsubscribeAll();
    const subscribe = (atom: Atom.Atom<unknown>) => {
      this.subscriptions.push(appAtomRegistry.subscribe(atom, () => this.scheduleRender()));
    };

    subscribe(environmentCatalog.catalogValueAtom);
    switch (page.kind) {
      case "environments": {
        const catalog = appAtomRegistry.get(environmentCatalog.catalogValueAtom);
        for (const environmentId of catalog.entries.keys()) {
          subscribe(environmentCatalog.stateAtom(environmentId));
        }
        setStatus("Glasses: showing paired servers.");
        break;
      }
      case "threads": {
        subscribe(environmentCatalog.stateAtom(page.environmentId));
        subscribe(environmentShell.stateAtom(page.environmentId));
        setStatus("Glasses: showing threads.");
        break;
      }
      case "thread": {
        subscribe(environmentShell.stateAtom(page.environmentId));
        subscribe(environmentThreads.stateAtom(page.environmentId, page.threadId));
        // Keeps the elapsed-time readout moving while a turn runs; unchanged
        // text is deduplicated before it reaches the bridge.
        const ticker = setInterval(
          () => {
            this.spinnerFrame += 1;
            this.scheduleRender();
          },
          Math.min(ELAPSED_TICK_MS, SPINNER_TICK_MS),
        );
        this.subscriptions.push(() => clearInterval(ticker));
        const reveal = setInterval(() => {
          if (
            this.threadMode.kind === "follow" &&
            this.revealChars !== null &&
            this.lastThread !== null &&
            this.revealChars < transcriptLength(this.lastThread.lines)
          ) {
            const speed = appAtomRegistry.get(revealSpeedAtom);
            const total = transcriptLength(this.lastThread.lines);
            this.revealChars =
              speed === null
                ? total
                : Math.min(total, this.revealChars + revealCharsPerTick(speed, REVEAL_TICK_MS));
            this.scheduleRender();
          }
        }, REVEAL_TICK_MS);
        this.subscriptions.push(() => clearInterval(reveal));
        setStatus("Glasses: reading a thread.");
        break;
      }
    }
    this.render(true);
  }

  private unsubscribeAll() {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
  }

  private scheduleRender() {
    if (this.renderTimer !== null || this.disposed) {
      return;
    }
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.render(false);
    }, RENDER_THROTTLE_MS);
  }

  private currentView(): View {
    switch (this.page.kind) {
      case "environments":
        return environmentsView();
      case "threads": {
        const dashboard = threadsDashboard(
          this.page.environmentId,
          this.dashboardCursor,
          this.dashboardStart,
        );
        this.dashboardIds = dashboard.ids;
        this.dashboardCursor = dashboard.cursor;
        this.dashboardStart = dashboard.windowStart;
        this.watchDashboardThreads(dashboard.visibleIds);
        return dashboard.view;
      }
      case "thread": {
        const { environmentId, threadId } = this.page;
        // A fetch that never lands must not spin forever.
        if (
          this.olderRequest !== null &&
          Date.now() - this.olderRequest.requestedAt > OLDER_FETCH_TIMEOUT_MS
        ) {
          this.olderRequest = null;
        }
        let rendered = threadRender(
          environmentId,
          threadId,
          this.threadMode,
          this.browseChars(),
          this.spinnerFrame,
          this.revealChars,
          this.fetchingOlder(),
        );
        if (this.olderRequest !== null && rendered.lines.length > this.olderRequest.total) {
          const grown = rendered.lines.length - this.olderRequest.total;
          this.olderRequest = null;
          if (this.threadMode.kind === "browse") {
            this.threadMode = { kind: "browse", start: this.threadMode.start + grown };
            rendered = threadRender(
              environmentId,
              threadId,
              this.threadMode,
              this.browseChars(),
              this.spinnerFrame,
              this.revealChars,
              this.fetchingOlder(),
            );
          }
        }
        // Text that was already there when the page opened shows at once;
        // only lines arriving afterwards are typed out by the reveal ticker.
        if (rendered.loaded && this.revealChars === null) {
          this.revealChars = transcriptLength(rendered.lines);
        } else if (
          this.revealChars !== null &&
          this.revealChars > transcriptLength(rendered.lines)
        ) {
          this.revealChars = transcriptLength(rendered.lines);
        }
        // Only the agent's lines type out; anything else lands whole.
        if (this.revealChars !== null && this.threadMode.kind === "follow") {
          const skipped = skipInstantLines(rendered.layout, this.revealChars);
          if (skipped !== this.revealChars) {
            this.revealChars = skipped;
            rendered = threadRender(
              environmentId,
              threadId,
              this.threadMode,
              this.browseChars(),
              this.spinnerFrame,
              this.revealChars,
              this.fetchingOlder(),
            );
          }
        }
        this.lastThread = rendered;
        this.prefetchOlderIfNear(rendered);
        if (import.meta.env.DEV) {
          const { start, end } = rendered.window;
          console.log(
            `[glasses] window ${this.threadMode.kind} ${start}-${end}/${rendered.lines.length} chars=${rendered.window.text.length} older=${rendered.hasOlder}`,
          );
        }
        return rendered.view;
      }
    }
  }

  // Browse windows ride on in-place updates while the host accepts a useful
  // size; below that a flickering rebuild with its 1000-character cap wins.
  private browseChars(): number {
    const viaUpgrade = this.upgradeLimit - 1;
    return viaUpgrade >= MIN_USEFUL_UPGRADE_CHARS
      ? Math.min(UPGRADE_MAX_CHARS, viaUpgrade)
      : REBUILD_MAX_CHARS;
  }

  private canUpgrade(view: View): boolean {
    switch (view.kind) {
      case "text":
        return view.content.length < this.upgradeLimit;
      case "thread":
        return Math.max(view.body.length, view.status.length) < this.upgradeLimit;
      case "list":
        return false;
    }
  }

  /**
   * The firmware scrolls the body itself and only reports hitting an edge.
   * Top: slide the window back a page, or ask the server for older turns
   * once local history is exhausted. Bottom: slide forward, and resume
   * following the live tail when the window already ends at the newest line.
   */
  /**
   * A page slide is one body update over the bridge, long enough to notice.
   * Show the Loading cue until the queued calls have settled. Skipped when
   * the host forces rebuilds, where a second rebuild would only add flicker.
   */
  private beginSlide() {
    if (this.sliding || this.upgradeLimit - 1 < MIN_USEFUL_UPGRADE_CHARS) {
      return;
    }
    this.sliding = true;
    // Runs after the render below has queued its status and body updates.
    queueMicrotask(() => {
      void bridgeIdle().then(() => {
        this.sliding = false;
        if (!this.disposed) {
          this.render(false);
        }
      });
    });
  }

  private onScrollEdge(edge: "top" | "bottom") {
    const now = Date.now();
    if (now - this.lastScrollAt < SCROLL_COOLDOWN_MS) {
      return;
    }
    if (this.page.kind === "threads") {
      this.lastScrollAt = now;
      this.moveDashboardCursor(edge === "bottom" ? 1 : -1);
      return;
    }
    if (this.page.kind !== "thread" || this.lastThread === null) {
      return;
    }
    this.lastScrollAt = now;
    this.beginSlide();
    const { lines, window, hasOlder, loadingOlder } = this.lastThread;
    if (edge === "top") {
      if (window.start > 0) {
        const previous = windowEndingAt(
          lines,
          Math.min(lines.length, window.start + BODY_MAX_LINES),
          this.browseChars(),
        );
        this.threadMode = { kind: "browse", start: previous.start };
      } else if (hasOlder && !loadingOlder) {
        this.olderRequest = { total: lines.length, requestedAt: Date.now() };
        requestOlderThreadTurns(this.page.environmentId, this.page.threadId);
        this.threadMode = { kind: "browse", start: 0 };
      }
    } else if (this.threadMode.kind === "browse") {
      if (window.end >= lines.length) {
        this.threadMode = { kind: "follow" };
        this.revealChars = transcriptLength(lines);
      } else {
        this.threadMode = { kind: "browse", start: Math.max(0, window.end - BODY_MAX_LINES) };
      }
    }
    this.render(false);
  }

  /** Tap: leave browse mode and skip any text still being typed out. */
  /** Older turns are on their way, or a page slide is still in transit to the glasses. */
  private fetchingOlder(): boolean {
    return this.sliding || this.olderRequest !== null || (this.lastThread?.loadingOlder ?? false);
  }

  /**
   * Infinite scroll: ask for older turns while the reader is still a few
   * pages above the start of loaded history, so the top is rarely reached
   * with nothing behind it. The browse window is re-anchored when they land.
   */
  private prefetchOlderIfNear(rendered: ThreadRender) {
    if (
      this.page.kind !== "thread" ||
      this.threadMode.kind !== "browse" ||
      !rendered.hasOlder ||
      this.fetchingOlder() ||
      rendered.window.start > PREFETCH_OLDER_WITHIN_LINES
    ) {
      return;
    }
    this.olderRequest = { total: rendered.lines.length, requestedAt: Date.now() };
    requestOlderThreadTurns(this.page.environmentId, this.page.threadId);
    this.scheduleRender();
  }

  private watchDashboardThreads(visible: ReadonlyArray<ThreadId>) {
    if (this.page.kind !== "threads" && visible.length > 0) {
      return;
    }
    const environmentId = this.page.kind === "threads" ? this.page.environmentId : null;
    for (const [threadId, unsubscribe] of this.dashboardWatches) {
      if (!visible.includes(threadId)) {
        unsubscribe();
        this.dashboardWatches.delete(threadId);
      }
    }
    if (environmentId === null) {
      return;
    }
    for (const threadId of visible) {
      if (!this.dashboardWatches.has(threadId)) {
        this.dashboardWatches.set(
          threadId,
          appAtomRegistry.subscribe(environmentThreads.stateAtom(environmentId, threadId), () =>
            this.scheduleRender(),
          ),
        );
      }
    }
  }

  /**
   * The dashboard fits on one screen, so a swipe reports an edge at once and
   * reads as one step of the marker. Steps clamp at both ends.
   */
  private moveDashboardCursor(step: 1 | -1) {
    if (this.page.kind !== "threads" || this.dashboardIds.length === 0) {
      return;
    }
    const current = Math.max(
      0,
      this.dashboardIds.findIndex((id) => id === this.dashboardCursor),
    );
    const next = Math.min(this.dashboardIds.length - 1, Math.max(0, current + step));
    if (next === current) {
      return;
    }
    this.dashboardCursor = this.dashboardIds[next] ?? null;
    this.render(false);
  }

  private openDashboardCursor() {
    if (this.page.kind !== "threads" || this.dashboardCursor === null) {
      return;
    }
    this.enter({
      kind: "thread",
      environmentId: this.page.environmentId,
      threadId: this.dashboardCursor,
    });
  }

  private jumpToLatest() {
    if (this.page.kind !== "thread") {
      return;
    }
    this.threadMode = { kind: "follow" };
    this.revealChars = this.lastThread === null ? null : transcriptLength(this.lastThread.lines);
    this.render(false);
  }

  private render(forceRebuild: boolean) {
    if (this.disposed) {
      return;
    }
    let view = this.currentView();
    const previous = this.rendered;
    if (!forceRebuild && previous !== null && sameView(previous, view)) {
      return;
    }

    // In-place text updates skip the full-page flicker of a rebuild and allow
    // the larger 2000-character payload.
    const canUpgrade = !forceRebuild && previous?.kind === view.kind && this.canUpgrade(view);
    // A rebuild carries at most 1000 characters; shrink a browse window that
    // was sized for an update before sending it that way.
    if (
      !canUpgrade &&
      view.kind === "thread" &&
      view.body.length > REBUILD_MAX_CHARS &&
      this.page.kind === "thread"
    ) {
      const rendered = threadRender(
        this.page.environmentId,
        this.page.threadId,
        this.threadMode,
        REBUILD_MAX_CHARS,
        this.spinnerFrame,
        this.revealChars,
        this.fetchingOlder(),
      );
      this.lastThread = rendered;
      view = rendered.view;
    }
    this.rendered = view;
    if (canUpgrade && view.kind === "text" && previous?.kind === "text") {
      this.upgradeText(TEXT_CONTAINER, view.content);
      return;
    }
    if (canUpgrade && view.kind === "thread" && previous?.kind === "thread") {
      // Status first: it is tiny, and during a page slide it carries the
      // Loading cue that should be visible while the body is in transit.
      if (view.status !== previous.status) {
        this.upgradeText(STATUS_CONTAINER, view.status);
      }
      if (view.body !== previous.body) {
        this.upgradeText(TEXT_CONTAINER, view.body);
      }
      return;
    }

    const container =
      view.kind === "list"
        ? new RebuildPageContainer({ containerTotalNum: 1, listObject: [listPanel(view.items)] })
        : view.kind === "text"
          ? new RebuildPageContainer({
              containerTotalNum: 1,
              textObject: [textPanel(view.content)],
            })
          : new RebuildPageContainer({
              containerTotalNum: 4,
              textObject: threadPanels(view.body, view.status),
            });
    void this.call("rebuildPageContainer", () => this.bridge.rebuildPageContainer(container)).then(
      (ok) => {
        // A refused rebuild leaves the previous page on the glasses; forget
        // what we thought was rendered so the next change tries again.
        if (ok === false && this.rendered === view) {
          console.warn("[glasses] page rebuild refused", JSON.stringify(container));
          this.rendered = null;
        }
      },
    );
  }

  private upgradeText(target: { containerID: number; containerName: string }, content: string) {
    void this.call(`textContainerUpgrade:${target.containerName}`, () =>
      this.bridge.textContainerUpgrade(
        // Offset and length 0 mean "replace the whole content".
        new TextContainerUpgrade({ ...target, content, contentOffset: 0, contentLength: 0 }),
      ),
    ).then((ok) => {
      // The host refused the in-place update; a full rebuild still gets the
      // text on screen at the cost of a flicker.
      if (ok === false && !this.disposed) {
        // Halve toward the host's real ceiling instead of creeping down one
        // refused update at a time.
        this.upgradeLimit = Math.max(
          MIN_UPGRADE_LIMIT,
          Math.floor(Math.min(this.upgradeLimit, content.length) / 2),
        );
        this.render(true);
      }
    });
  }

  private handleEvent(event: EvenHubEvent) {
    if (import.meta.env.DEV) {
      console.log("[glasses] event", JSON.stringify(event));
    }
    const listType = eventTypeOf(event.listEvent);
    const textType = eventTypeOf(event.textEvent);
    const sysType = eventTypeOf(event.sysEvent);

    if (
      listType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
      textType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
      sysType === OsEventTypeList.DOUBLE_CLICK_EVENT
    ) {
      this.back();
      return;
    }
    if (event.listEvent && listType === OsEventTypeList.CLICK_EVENT) {
      this.select(this.selectedIndex(event.listEvent));
      return;
    }
    // Text pages report scroll edges, not gestures: 1 = hit the top, 2 = hit the bottom.
    if (textType === OsEventTypeList.SCROLL_TOP_EVENT) {
      this.onScrollEdge("top");
      return;
    }
    if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      this.onScrollEdge("bottom");
      return;
    }
    // A tap on the dashboard opens the marked thread; on the transcript it
    // jumps back to the live tail.
    if (!event.listEvent && sysType === OsEventTypeList.CLICK_EVENT) {
      if (this.page.kind === "threads") {
        this.openDashboardCursor();
      } else {
        this.jumpToLatest();
      }
      return;
    }
    if (sysType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
      this.render(true);
      return;
    }
    if (
      sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
      sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
    ) {
      this.dispose();
    }
  }

  // Protobuf drops zero values, so the first row arrives with neither index
  // nor name; the simulator sends neither for any row.
  private selectedIndex(listEvent: NonNullable<EvenHubEvent["listEvent"]>): number {
    if (typeof listEvent.currentSelectItemIndex === "number") {
      return listEvent.currentSelectItemIndex;
    }
    if (this.rendered?.kind === "list" && typeof listEvent.currentSelectItemName === "string") {
      const byName = this.rendered.items.indexOf(listEvent.currentSelectItemName);
      if (byName >= 0) {
        return byName;
      }
    }
    return 0;
  }

  private select(index: number) {
    if (this.rendered?.kind !== "list") {
      return;
    }
    const id = this.rendered.ids[index];
    if (id === undefined) {
      return;
    }
    switch (this.page.kind) {
      case "environments":
        this.enter({ kind: "threads", environmentId: id as EnvironmentId });
        return;
      case "threads":
        this.enter({
          kind: "thread",
          environmentId: this.page.environmentId,
          threadId: id as ThreadId,
        });
        return;
      case "thread":
        return;
    }
  }

  private back() {
    switch (this.page.kind) {
      case "thread":
        this.enter({ kind: "threads", environmentId: this.page.environmentId });
        return;
      case "threads":
        this.enter({ kind: "environments" });
        return;
      case "environments":
        // Root exit goes through the system confirmation dialog (mode 1); the
        // user can still cancel, so nothing is torn down until SYSTEM_EXIT.
        this.call("shutDownPageContainer", () => this.bridge.shutDownPageContainer(1));
        return;
    }
  }

  private dispose() {
    this.disposed = true;
    if (this.renderTimer !== null) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.watchDashboardThreads([]);
    this.unsubscribeAll();
    setStatus("Glasses page closed.");
  }
}

export async function startGlassesController(): Promise<void> {
  const bridge = await evenAppBridge();
  if (bridge === null) {
    setStatus(
      "Not running inside the Even App. Pairing works here; the glasses page needs the Even App.",
    );
    return;
  }
  setStatus("Opening the glasses page...");
  await new GlassesController(bridge).start();
}
