import { describe, expect, it } from "vite-plus/test";

import { replaceEmojiShortcodes } from "./emojiShortcodes.ts";

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
