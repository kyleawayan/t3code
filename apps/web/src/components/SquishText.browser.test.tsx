import { describe, expect, it, vi } from "vite-plus/test";

import "../index.css";
import { render } from "../../test/render";
import { SquishText, THREAD_TITLE_SQUISH_SCALE } from "./SquishText";

function Title({ text }: { text: string }) {
  return (
    <div className="flex" style={{ width: 120 }}>
      <SquishText ellipsisScale={THREAD_TITLE_SQUISH_SCALE} className="flex-1">
        {text}
      </SquishText>
    </div>
  );
}

describe("SquishText", () => {
  it("unsquishes an ellipsized title renamed to one that fits", async () => {
    await using screen = await render(
      <Title text="A thread title far too long to fit in this narrow row" />,
      { router: false },
    );
    const content = screen.container.querySelector<HTMLElement>("[data-squish-text-content]")!;
    await vi.waitFor(() => expect(content.style.width).not.toBe(""));

    await screen.rerender(<Title text="Short" />);

    await vi.waitFor(() => {
      expect(content.style.transform).toBe("");
      expect(content.style.width).toBe("");
    });
  });
});
