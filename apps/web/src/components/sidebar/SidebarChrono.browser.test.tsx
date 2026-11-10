import { describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { act, render } from "../../../test/render";
import { nudgeChronoOnSend } from "./chronoSendNudge";
import { SidebarChrono } from "./SidebarChrono";

function setup() {
  localStorage.removeItem("t3code:sidebar-chrono:v1");
  localStorage.removeItem("t3code:sidebar-chrono-elapsed-today:v1");
}

describe("SidebarChrono", () => {
  it("flashes START? on a send only while the chrono is stopped", async () => {
    setup();
    await using screen = await render(<SidebarChrono />, {
      router: false /* reads no route */,
    });

    await act(() => nudgeChronoOnSend());
    // One letter per digit cell, with the colons left in place unlit.
    await expect.element(screen.getByText("St:Ar:t?")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Start chronograph" }));
    await expect.element(screen.getByText("St:Ar:t?")).not.toBeInTheDocument();
    await act(() => nudgeChronoOnSend());
    await expect.element(screen.getByRole("timer")).toHaveTextContent("00:00:00");
    expect(screen.container.textContent).not.toContain("St:Ar:t?");
  });
});
