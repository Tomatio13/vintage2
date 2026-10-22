import { expect, it } from "vitest";
import { createGaryScene } from "../src/renderer/lib/sidebarGary.js";

it("keeps randomized routes ordered and stops at the apple for every bite", () => {
  for (let seed = 0; seed <= 100; seed++) {
    let value = seed;
    const scene = createGaryScene(() => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 2 ** 32;
    });
    for (const frames of [scene.travel, scene.facing, scene.chewing, scene.food]) {
      const offsets = frames.map((frame) => Number(frame.offset));
      expect(offsets[0]).toBe(0);
      expect(offsets.at(-1)).toBe(1);
      expect(
        offsets.every(
          (offset, index) =>
            offset >= 0 && offset <= 1 && (index === 0 || offset >= offsets[index - 1]!),
        ),
      ).toBe(true);
    }
    const arrival = Number(scene.food[1]!.offset);
    const eaten = Number(scene.food.at(-2)!.offset);
    const start = scene.travel.find((frame) => frame.offset === arrival)!;
    const end = scene.travel.find((frame) => frame.offset === eaten)!;
    expect(start.left).toBe(end.left);
    expect(start.bottom).toBe("-1px");
    expect((eaten - arrival) * scene.duration).toBeGreaterThanOrEqual(2799);
    expect(scene.travel[0]!.left).toBe(scene.travel.at(-1)!.left);
    expect(scene.travel.some((frame) => frame.bottom === "11px")).toBe(true);
  }
});

it("varies scenery and timing while retaining a valid route at random range boundaries", () => {
  const min = createGaryScene(() => 0);
  const max = createGaryScene(() => 1 - Number.EPSILON);
  expect(min.stairLeft).not.toBe(max.stairLeft);
  expect(min.appleLeft).not.toBe(max.appleLeft);
  expect(min.duration).not.toBe(max.duration);
  for (const scene of [min, max]) {
    const offsets = scene.travel.map((frame) => Number(frame.offset));
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  }
});
