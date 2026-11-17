import { expect, it } from "vite-plus/test";

import { createSidebarListMotion } from "./Sidebar.motion";

const filterAnimations = (node: Element) =>
  node
    .getAnimations()
    .filter((animation) =>
      (animation.effect as KeyframeEffect).getKeyframes().some((frame) => "filter" in frame),
    );

function rowList(count: number) {
  const list = document.createElement("ul");
  list.style.cssText = "position: relative; margin: 0; padding: 0; list-style: none";
  const rows = Array.from({ length: count }, (_, index) => {
    const row = document.createElement("li");
    row.style.height = "32px";
    row.textContent = `Row ${index}`;
    list.append(row);
    return row;
  });
  document.body.append(list);
  const motion = createSidebarListMotion(list);
  motion.update(false);
  return {
    list,
    rows,
    motion,
    [Symbol.dispose]() {
      motion.dispose();
      list.remove();
      document.getElementById("sidebar-motion-blur-1")?.parentElement?.remove();
    },
  };
}

it("blurs a row that jumps sections, not the neighbors that shift by one", () => {
  using fixture = rowList(8);
  const { list, rows, motion } = fixture;

  // The first row moves to the bottom, as a thread does into the Working shelf.
  list.append(rows[0]!);
  motion.update(true);

  expect(filterAnimations(rows[0]!)).toHaveLength(1);
  expect(rows.slice(1).flatMap(filterAnimations)).toHaveLength(0);
  expect(rows[1]!.getAnimations()).toHaveLength(1);
});

it("doesn't blur rows that shift together as a block", () => {
  using fixture = rowList(8);
  const { list, rows, motion } = fixture;

  // Rows appear above, as when a project shows more threads; the rest slide down four rows.
  for (let index = 0; index < 4; index++) {
    const row = document.createElement("li");
    row.style.height = "32px";
    list.prepend(row);
  }
  motion.update(true);

  expect(rows.flatMap(filterAnimations)).toHaveLength(0);
  expect(rows[0]!.getAnimations()).toHaveLength(1);
});

it("blurs a row that slides far into a bottom-anchored section past one row", () => {
  using fixture = rowList(3);
  const { list, rows, motion } = fixture;
  // The Working shelf sits at the bottom of the sidebar, below empty space.
  Object.assign(list.style, { display: "flex", flexDirection: "column", height: "600px" });
  rows[1]!.style.marginTop = "auto";
  motion.update(false);

  // A thread starts and lands under the shelf's header: it passes one row but travels far.
  rows[1]!.after(rows[0]!);
  motion.update(true);

  expect(filterAnimations(rows[0]!)).toHaveLength(1);
  expect(rows.slice(1).flatMap(filterAnimations)).toHaveLength(0);
});
