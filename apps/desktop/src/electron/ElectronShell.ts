import { MAC_PERMISSION_SETTINGS_URLS } from "../permissions/MacPermission.ts";
import {
  REMOTE_CAPABLE_EDITOR_IDS,
  remoteSchemeForEditor,
  type SystemSettingsPane,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as Electron from "electron";

// Remote editor deep links must reach the OS handler.
const SAFE_WEB_PROTOCOLS = new Set(["http:", "https:"]);
const REMOTE_EDITOR_PROTOCOLS = new Set(
  REMOTE_CAPABLE_EDITOR_IDS.flatMap((id) => {
    const scheme = remoteSchemeForEditor(id);
    return scheme === undefined ? [] : [`${scheme}:`];
  }),
);

// Zed embeds [user@]host in the path; reject passwords and ports there.
const ZED_SSH_PATHNAME = /^\/(?:[^/@:]+@)?[^/@:]+\/.*$/;

const isRemoteEditorUrl = (url: URL) =>
  REMOTE_EDITOR_PROTOCOLS.has(url.protocol) &&
  url.username.length === 0 &&
  url.password.length === 0 &&
  (url.protocol === "zed:"
    ? url.host === "ssh" && ZED_SSH_PATHNAME.test(url.pathname)
    : url.protocol === "jetbrains:"
      ? url.host === "gateway" &&
        url.pathname === "/ssh/environment" &&
        (url.searchParams.get("h") ?? "").length > 0
      : url.host === "vscode-remote" &&
        url.pathname.startsWith("/ssh-remote+") &&
        url.pathname.length > "/ssh-remote+".length);

export function parseSafeExternalUrl(rawUrl: unknown): Option.Option<string> {
  if (typeof rawUrl !== "string") {
    return Option.none();
  }

  try {
    const url = new URL(rawUrl);
    return SAFE_WEB_PROTOCOLS.has(url.protocol) || isRemoteEditorUrl(url)
      ? Option.some(url.href)
      : Option.none();
  } catch {
    return Option.none();
  }
}

// Slack.app claims `slack://` but not *.slack.com links, so an https permalink
// detours through the browser's redirect page. These are the link shapes Codex
// Desktop rewrites to deep links; anything else keeps the https path.
const SLACK_ARCHIVES_PATHNAME = /^\/archives\/([CDG][A-Z0-9]+)(?:\/p(\d{10})(\d{1,6}))?$/;
const SLACK_CLIENT_PATHNAME = /^\/client\/([TE][A-Z0-9]+)\/([CDG][A-Z0-9]+)\/?$/;
const SLACK_WORKSPACE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SLACK_TS = /^\d{10}\.\d{1,6}$/;
const SLACK_PERMALINK_PARAMS = new Set(["cid", "thread_ts"]);

const decodeSlackFindTeamResponse = Schema.decodeUnknownOption(
  Schema.Struct({
    ok: Schema.Literal(true),
    team_id: Schema.String.check(Schema.isPattern(/^[TE][A-Z0-9]+$/)),
  }),
);

interface SlackLink {
  readonly team: { readonly id: string } | { readonly workspace: string };
  readonly channelId: string;
  readonly messageTs: string | undefined;
  readonly threadTs: string | undefined;
}

function parseSlackLink(url: URL): SlackLink | undefined {
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) {
    return undefined;
  }

  if (url.hostname === "app.slack.com") {
    const [, teamId, channelId] =
      (url.search ? null : SLACK_CLIENT_PATHNAME.exec(url.pathname)) ?? [];
    return teamId && channelId
      ? { team: { id: teamId }, channelId, messageTs: undefined, threadTs: undefined }
      : undefined;
  }

  const workspace = url.hostname.endsWith(".slack.com")
    ? url.hostname.slice(0, -".slack.com".length)
    : "";
  const [, channelId, seconds, micros] =
    (SLACK_WORKSPACE.test(workspace) ? SLACK_ARCHIVES_PATHNAME.exec(url.pathname) : null) ?? [];
  const keys = [...url.searchParams.keys()];
  if (
    !channelId ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => !SLACK_PERMALINK_PARAMS.has(key))
  ) {
    return undefined;
  }

  const messageTs = seconds && micros ? `${seconds}.${micros}` : undefined;
  const cid = url.searchParams.get("cid");
  const threadTs = url.searchParams.get("thread_ts") ?? undefined;
  if (
    (!messageTs && channelId.startsWith("D")) ||
    (cid !== null && (cid !== channelId || !threadTs)) ||
    (threadTs && (!messageTs || !SLACK_TS.test(threadTs)))
  ) {
    return undefined;
  }
  return { team: { workspace }, channelId, messageTs, threadTs };
}

function toSlackDeepLink(link: SlackLink, teamId: string): string {
  const params = new URLSearchParams({ team: teamId, id: link.channelId });
  if (link.messageTs) params.set("message", link.messageTs);
  if (link.threadTs) params.set("thread_ts", link.threadTs);
  params.set("host", "slack.com");
  return `slack://channel?${params.toString()}`;
}

const openUrl = (url: string) =>
  Effect.promise(() =>
    Electron.shell.openExternal(url).then(
      () => true,
      () => false,
    ),
  );

export class ElectronShell extends Context.Service<
  ElectronShell,
  {
    readonly openExternal: (rawUrl: unknown) => Effect.Effect<boolean>;
    readonly openSystemSettings: (pane: SystemSettingsPane) => Effect.Effect<boolean>;
    readonly copyText: (text: string) => Effect.Effect<void>;
  }
>()("@t3tools/desktop/electron/ElectronShell") {}

/** @public */
export const make = Effect.sync(() => {
  // A workspace's team ID never changes, so one lookup per launch is enough.
  const slackTeamIds = new Map<string, string>();

  const resolveSlackTeamId = Effect.fn("ElectronShell.resolveSlackTeamId")(function* (
    workspace: string,
  ) {
    const cached = slackTeamIds.get(workspace);
    if (cached !== undefined) return Option.some(cached);

    const lookupUrl = new URL("https://slack.com/api/auth.findTeam");
    lookupUrl.searchParams.set("domain", workspace);
    const teamId = yield* Effect.tryPromise((signal) =>
      Electron.net
        .fetch(lookupUrl.href, { signal })
        .then((response): Promise<unknown> => response.json()),
    ).pipe(
      // Past this, opening the browser is faster than waiting.
      Effect.timeout("3 seconds"),
      Effect.map((body) =>
        Option.map(decodeSlackFindTeamResponse(body), (response) => response.team_id),
      ),
      Effect.orElseSucceed(() => Option.none<string>()),
    );
    if (Option.isSome(teamId)) slackTeamIds.set(workspace, teamId.value);
    return teamId;
  });

  const openInSlack = Effect.fn("ElectronShell.openInSlack")(function* (externalUrl: string) {
    const link = parseSlackLink(new URL(externalUrl));
    // Without a registered handler, Windows prompts for an app instead of
    // rejecting the deep link, so the browser fallback would never run.
    if (!link || Electron.app.getApplicationNameForProtocol("slack://") === "") return false;

    const teamId =
      "id" in link.team
        ? Option.some(link.team.id)
        : yield* resolveSlackTeamId(link.team.workspace);
    if (Option.isNone(teamId)) return false;
    return yield* openUrl(toSlackDeepLink(link, teamId.value));
  });

  return ElectronShell.of({
    openExternal: Effect.fn("ElectronShell.openExternal")(function (rawUrl) {
      return Option.match(parseSafeExternalUrl(rawUrl), {
        onNone: () => Effect.succeed(false),
        onSome: (externalUrl) =>
          openInSlack(externalUrl).pipe(
            Effect.flatMap((opened) => (opened ? Effect.succeed(true) : openUrl(externalUrl))),
          ),
      });
    }),
    openSystemSettings: Effect.fn("ElectronShell.openSystemSettings")(function (pane) {
      return openUrl(MAC_PERMISSION_SETTINGS_URLS[pane]);
    }),
    copyText: Effect.fn("ElectronShell.copyText")(function (text) {
      return Effect.promise(() => Electron.clipboard.writeText(text).catch(() => undefined));
    }),
  });
});

export const layer = Layer.effect(ElectronShell, make);
