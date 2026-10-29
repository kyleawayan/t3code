import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";
import { MarkdownTable } from "./MarkdownTable";

describe("MarkdownTable fullscreen", () => {
  it("opens the table in a dialog and closes it", async () => {
    await using screen = await render(
      <MarkdownTable>
        <thead>
          <tr>
            <th>Task</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Draft proposal</td>
          </tr>
        </tbody>
      </MarkdownTable>,
      // The table renders no links and reads no route.
      { router: false },
    );

    await userEvent.click(screen.getByRole("button", { name: "Open table fullscreen" }));
    const dialog = page.getByRole("dialog");
    await expect.element(dialog.getByRole("cell", { name: "Draft proposal" })).toBeVisible();

    await userEvent.click(dialog.getByRole("button", { name: "Close" }));
    await expect.element(dialog).not.toBeInTheDocument();
  });
});
