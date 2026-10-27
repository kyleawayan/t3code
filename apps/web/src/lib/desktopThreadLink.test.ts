import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { desktopThreadLink } from "./desktopThreadLink";

const threadRef = scopeThreadRef(EnvironmentId.make("env 1"), ThreadId.make("thread/1"));

function linkFromPage(protocol: string): string {
  vi.stubGlobal("window", { location: { protocol } });
  try {
    return desktopThreadLink(threadRef);
  } finally {
    vi.unstubAllGlobals();
  }
}

describe("desktopThreadLink", () => {
  it("targets the installed app from a web page", () => {
    expect(linkFromPage("http:")).toBe("t3code://threads/env%201/thread%2F1");
  });

  it("keeps the dev app's own scheme inside the dev desktop", () => {
    expect(linkFromPage("t3code-dev:")).toBe("t3code-dev://threads/env%201/thread%2F1");
  });
});
