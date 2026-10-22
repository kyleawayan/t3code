import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { beforeEach, vi } from "vite-plus/test";

const { openExternalMock, writeTextMock, protocolHandlerMock, fetchMock } = vi.hoisted(() => ({
  openExternalMock: vi.fn(),
  writeTextMock: vi.fn(),
  protocolHandlerMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getApplicationNameForProtocol: protocolHandlerMock,
  },
  net: {
    fetch: fetchMock,
  },
  shell: {
    openExternal: openExternalMock,
  },
  clipboard: {
    writeText: writeTextMock,
  },
}));

import * as ElectronShell from "./ElectronShell.ts";

const SLACK_THREAD_PERMALINK =
  "https://my-workspace.slack.com/archives/C0123ABCD/p1700000000123456?thread_ts=1699999999.000100&cid=C0123ABCD";
const SLACK_THREAD_DEEP_LINK =
  "slack://channel?team=T0123ABCD&id=C0123ABCD&message=1700000000.123456&thread_ts=1699999999.000100&host=slack.com";

const findTeamResponse = (body: unknown) => ({ json: async () => body });

describe("ElectronShell", () => {
  beforeEach(() => {
    openExternalMock.mockReset();
    writeTextMock.mockReset();
    protocolHandlerMock.mockReset().mockReturnValue("Slack");
    fetchMock.mockReset();
  });

  it.effect("opens Slack permalinks in the Slack app", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);
      fetchMock.mockResolvedValue(findTeamResponse({ ok: true, team_id: "T0123ABCD" }));

      const electronShell = yield* ElectronShell.ElectronShell;
      const results = yield* Effect.all([
        electronShell.openExternal(SLACK_THREAD_PERMALINK),
        electronShell.openExternal(SLACK_THREAD_PERMALINK),
      ]);

      assert.deepEqual(results, [true, true]);
      assert.equal(fetchMock.mock.calls.length, 1);
      assert.equal(
        fetchMock.mock.calls[0]?.[0],
        "https://slack.com/api/auth.findTeam?domain=my-workspace",
      );
      assert.deepEqual(openExternalMock.mock.calls, [
        [SLACK_THREAD_DEEP_LINK],
        [SLACK_THREAD_DEEP_LINK],
      ]);
    }).pipe(Effect.provide(ElectronShell.layer)),
  );

  it.effect("opens Slack web client links in the Slack app without a team lookup", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openExternal(
        "https://app.slack.com/client/T0123ABCD/C0123ABCD",
      );

      assert.equal(result, true);
      assert.equal(fetchMock.mock.calls.length, 0);
      assert.deepEqual(openExternalMock.mock.calls, [
        ["slack://channel?team=T0123ABCD&id=C0123ABCD&host=slack.com"],
      ]);
    }).pipe(Effect.provide(ElectronShell.layer)),
  );

  it.effect("opens Slack links in the browser when the Slack app is not installed", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);
      protocolHandlerMock.mockReturnValue("");

      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openExternal(SLACK_THREAD_PERMALINK);

      assert.equal(result, true);
      assert.equal(fetchMock.mock.calls.length, 0);
      assert.deepEqual(openExternalMock.mock.calls, [[SLACK_THREAD_PERMALINK]]);
    }).pipe(Effect.provide(ElectronShell.layer)),
  );

  it.effect("opens Slack links in the browser when the deep link cannot be made or opened", () =>
    Effect.gen(function* () {
      const electronShell = yield* ElectronShell.ElectronShell;

      openExternalMock.mockResolvedValue(undefined);
      fetchMock.mockRejectedValueOnce(new Error("offline"));
      fetchMock.mockResolvedValueOnce(findTeamResponse({ ok: false, error: "team_not_found" }));
      yield* electronShell.openExternal(SLACK_THREAD_PERMALINK);
      yield* electronShell.openExternal(SLACK_THREAD_PERMALINK);
      assert.deepEqual(openExternalMock.mock.calls, [
        [SLACK_THREAD_PERMALINK],
        [SLACK_THREAD_PERMALINK],
      ]);

      openExternalMock.mockReset();
      openExternalMock.mockRejectedValueOnce(new Error("no handler"));
      openExternalMock.mockResolvedValueOnce(undefined);
      fetchMock.mockResolvedValue(findTeamResponse({ ok: true, team_id: "T0123ABCD" }));
      const result = yield* electronShell.openExternal(SLACK_THREAD_PERMALINK);
      assert.equal(result, true);
      assert.deepEqual(openExternalMock.mock.calls, [
        [SLACK_THREAD_DEEP_LINK],
        [SLACK_THREAD_PERMALINK],
      ]);
    }).pipe(Effect.provide(ElectronShell.layer)),
  );

  it.effect("keeps Slack links the deep link cannot represent in the browser", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);
      const urls = [
        "https://my-workspace.slack.com/archives/C0123ABCD/p1700000000123456?utm_source=x",
        "https://my-workspace.slack.com/archives/D0123ABCD",
        "https://my-workspace.slack.com/archives/C0123ABCD?thread_ts=1699999999.000100",
        "https://my-workspace.slack.com/docs/T0123ABCD/F0123ABCD",
        "https://app.slack.com/client/T0123ABCD/C0123ABCD?cdn_fallback=1",
      ];

      const electronShell = yield* ElectronShell.ElectronShell;
      yield* Effect.forEach(urls, (url) => electronShell.openExternal(url));

      assert.equal(fetchMock.mock.calls.length, 0);
      assert.deepEqual(
        openExternalMock.mock.calls,
        urls.map((url) => [url]),
      );
    }).pipe(Effect.provide(ElectronShell.layer)),
  );

  it.effect("opens remote SSH editor URLs", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openExternal(
        "vscode://vscode-remote/ssh-remote+user%40example.com/home/user/project",
      );

      assert.equal(result, true);
      assert.deepEqual(openExternalMock.mock.calls, [
        ["vscode://vscode-remote/ssh-remote+user%40example.com/home/user/project"],
      ]);
    }).pipe(Effect.provide(ElectronShell.layer)),
  );

  it.effect("opens the JetBrains Toolbox ssh deep link", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const url =
        "jetbrains://gateway/ssh/environment?h=example.com&launchIde=true&ideHint=IU&projectHint=%2Fhome%2Fuser%2Fproject&u=user";
      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openExternal(url);

      assert.equal(result, true);
      assert.deepEqual(openExternalMock.mock.calls, [[url]]);
    }).pipe(Effect.provide(ElectronShell.layer)),
  );

  it.effect("does not open editor URLs that mix up link shapes", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      const results = yield* Effect.all([
        electronShell.openExternal("zed://extension/attacker"),
        electronShell.openExternal("vscode://ssh/example.com/home/user/project"),
        electronShell.openExternal("jetbrains://idea/navigate/reference?project=x&path=y"),
        electronShell.openExternal("jetbrains://gateway/ssh/environment?launchIde=true"),
        electronShell.openExternal("jetbrains://gateway/com.example.provider/connect?h=x"),
      ]);

      assert.deepEqual(results, [false, false, false, false, false]);
      assert.equal(openExternalMock.mock.calls.length, 0);
    }).pipe(Effect.provide(ElectronShell.layer)),
  );

  it.effect("does not open remote editor URLs with userinfo", () =>
    Effect.gen(function* () {
      openExternalMock.mockResolvedValue(undefined);

      const electronShell = yield* ElectronShell.ElectronShell;
      const results = yield* Effect.all([
        electronShell.openExternal(
          "vscode://user@vscode-remote/ssh-remote+example.com/home/user/project",
        ),
        electronShell.openExternal(
          "vscode://:secret@vscode-remote/ssh-remote+example.com/home/user/project",
        ),
        electronShell.openExternal("zed://ssh/user:secret@example.com/home/user/project"),
        electronShell.openExternal("jetbrains://user@gateway/ssh/environment?h=example.com"),
      ]);

      assert.deepEqual(results, [false, false, false, false]);
      assert.equal(openExternalMock.mock.calls.length, 0);
    }).pipe(Effect.provide(ElectronShell.layer)),
  );

  it.effect("does not open unsafe external URLs", () =>
    Effect.gen(function* () {
      const electronShell = yield* ElectronShell.ElectronShell;
      const result = yield* electronShell.openExternal("file:///etc/passwd");

      assert.equal(result, false);
      assert.equal(openExternalMock.mock.calls.length, 0);
    }).pipe(Effect.provide(ElectronShell.layer)),
  );
});
