import { describe, expect, it } from "vitest";

import { createReplayBuffer } from "../src/main/ptyReplayBuffer.js";

describe("createReplayBuffer", () => {
  it("returns appended data in order while under the cap", () => {
    const buffer = createReplayBuffer(100);
    buffer.append("hello ");
    buffer.append("world");
    expect(buffer.snapshot()).toBe("hello world");
    expect(buffer.length).toBe(11);
  });

  it("trims the oldest chunks once the cap is exceeded", () => {
    const buffer = createReplayBuffer(10);
    buffer.append("aaaaaaaaaa");
    buffer.append("bbbbbbbbbb");
    buffer.append("cc");
    expect(buffer.snapshot()).toBe("bbbbbbbbcc");
    expect(buffer.length).toBe(10);
  });

  it("never exceeds the cap when a single chunk is larger than it", () => {
    const buffer = createReplayBuffer(10);
    buffer.append("0123456789");
    buffer.append("abcdefghijk");
    expect(buffer.length).toBe(10);
    expect(buffer.snapshot()).toBe("bcdefghijk");
  });

  it("keeps snapshot within the cap for many small appends", () => {
    const buffer = createReplayBuffer(50);
    for (let index = 0; index < 100; index += 1) {
      buffer.append(String(index).padStart(3, "0"));
    }
    expect(buffer.length).toBe(50);
    expect(buffer.snapshot().length).toBe(50);
  });

  it("clears all stored output", () => {
    const buffer = createReplayBuffer(10);
    buffer.append("0123456789");
    buffer.clear();
    expect(buffer.snapshot()).toBe("");
    expect(buffer.length).toBe(0);
  });

  it("ignores empty appends", () => {
    const buffer = createReplayBuffer(10);
    buffer.append("");
    expect(buffer.snapshot()).toBe("");
    expect(buffer.length).toBe(0);
  });
});
