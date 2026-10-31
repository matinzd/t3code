import { describe, expect, it, vi } from "vite-plus/test";

import { createEmojiShortcodeStore, replaceEmojiShortcodes } from "./emojiShortcodes.ts";

const table = new Map([
  ["+1", "👍"],
  ["-1", "👎"],
  ["rocket", "🚀"],
  ["tada", "🎉"],
]);

describe("replaceEmojiShortcodes", () => {
  it.each([
    ["Ship it :rocket:", "Ship it 🚀"],
    [":+1: and :-1:", "👍 and 👎"],
    [":tada::rocket:", "🎉🚀"],
    ["unknown :not_an_emoji: stays", "unknown :not_an_emoji: stays"],
    [":typo:rocket:", ":typo🚀"],
    ["at 10:30:00 and a:b", "at 10:30:00 and a:b"],
  ])("%s", (text, expected) => {
    expect(replaceEmojiShortcodes(text, table)).toBe(expected);
  });
});

describe("createEmojiShortcodeStore", () => {
  it("retries after a failed load and notifies only mounted subscribers", async () => {
    const loads = [Promise.reject(new Error("chunk failed")), Promise.resolve({ rocket: "🚀" })];
    const store = createEmojiShortcodeStore(() => loads.shift()!);
    const mounted = vi.fn();
    const unmounted = vi.fn();
    store.subscribe(mounted);
    const unsubscribe = store.subscribe(unmounted);
    await store.preload();
    expect(store.getSnapshot()).toBeNull();

    unsubscribe();
    store.subscribe(() => {});
    await store.preload();
    expect(store.getSnapshot()?.get("rocket")).toBe("🚀");
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
  });
});
