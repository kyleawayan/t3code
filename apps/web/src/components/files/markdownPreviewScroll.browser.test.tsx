import "../../index.css";

import { describe, expect, it, vi } from "vite-plus/test";

import { render, type Screen } from "../../../test/render";
import { ScrollArea } from "../ui/scroll-area";
import { rememberScrollTop, usePersistedScrollAreaPosition } from "./markdownPreviewScroll";

function setup() {
  localStorage.removeItem("t3code.markdownPreviewScroll");
}

function Preview(props: {
  readonly scrollKey: string;
  readonly paragraphs?: number;
  readonly width?: number;
}) {
  const scrollAreaRef = usePersistedScrollAreaPosition(props.scrollKey);
  return (
    <div className="flex h-[200px] flex-col" style={{ width: props.width ?? 400 }}>
      <ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1">
        {Array.from({ length: props.paragraphs ?? 80 }, (_, index) => (
          <p key={index}>Paragraph {index} has enough words to wrap in a narrow panel.</p>
        ))}
      </ScrollArea>
    </div>
  );
}

function viewport(screen: Screen): HTMLElement {
  return screen.container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
}

async function userScrollTo(screen: Screen, top: number) {
  const element = viewport(screen);
  const scrolled = new Promise((resolve) => {
    element.addEventListener("scroll", resolve, { once: true });
  });
  element.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
  element.scrollTop = top;
  await scrolled;
}

describe("usePersistedScrollAreaPosition", () => {
  it("restores the position after a remount", async () => {
    setup();
    {
      await using screen = await render(<Preview scrollKey="a" />);
      await userScrollTo(screen, 300);
    }
    await using screen = await render(<Preview scrollKey="a" />);
    expect(viewport(screen).scrollTop).toBe(300);
  });

  it("swaps positions when the key changes on a mounted preview", async () => {
    setup();
    await using screen = await render(<Preview scrollKey="thread-a" />);
    await userScrollTo(screen, 300);

    await screen.rerender(<Preview scrollKey="thread-b" />);
    expect(viewport(screen).scrollTop).toBe(0);
    await userScrollTo(screen, 120);

    await screen.rerender(<Preview scrollKey="thread-a" />);
    expect(viewport(screen).scrollTop).toBe(300);
    await screen.rerender(<Preview scrollKey="thread-b" />);
    expect(viewport(screen).scrollTop).toBe(120);
  });

  it("reaches the position once late content makes it scrollable", async () => {
    setup();
    {
      await using screen = await render(<Preview scrollKey="a" />);
      await userScrollTo(screen, 300);
    }
    await using screen = await render(<Preview scrollKey="a" paragraphs={1} />);
    expect(viewport(screen).scrollTop).toBe(0);

    await screen.rerender(<Preview scrollKey="a" />);
    await vi.waitFor(() => expect(viewport(screen).scrollTop).toBe(300));
  });

  it("keeps the position when the preview mounts narrow and then widens", async () => {
    setup();
    {
      await using screen = await render(<Preview scrollKey="a" />);
      await userScrollTo(screen, 300);
    }
    await using screen = await render(<Preview scrollKey="a" width={120} />);
    await screen.rerender(<Preview scrollKey="a" />);
    await vi.waitFor(() => expect(viewport(screen).scrollTop).toBe(300));
  });
});

describe("rememberScrollTop", () => {
  it("keeps the most recently scrolled entries and forgets the top of a file", () => {
    const scrollTops = { a: 10, b: 20, c: 30 };

    expect(Object.entries(rememberScrollTop(scrollTops, "a", 40.6, 3))).toEqual([
      ["b", 20],
      ["c", 30],
      ["a", 41],
    ]);
    expect(Object.entries(rememberScrollTop(scrollTops, "d", 40, 3))).toEqual([
      ["b", 20],
      ["c", 30],
      ["d", 40],
    ]);
    expect(rememberScrollTop(scrollTops, "b", 0)).toEqual({ a: 10, c: 30 });
  });
});
