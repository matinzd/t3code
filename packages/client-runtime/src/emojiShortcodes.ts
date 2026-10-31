export type EmojiShortcodes = ReadonlyMap<string, string>;

const SHORTCODE = /:([a-z0-9_+-]+):/g;

let shortcodes: EmojiShortcodes | null = null;
let loading: Promise<EmojiShortcodes> | null = null;

/** The table loads on first use, so it stays out of the bundle that starts the app. */
function loadEmojiShortcodes(): Promise<EmojiShortcodes> {
  loading ??= import("./emojiShortcodes.json").then(
    (table) => (shortcodes = new Map(Object.entries(table.default))),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

export function loadedEmojiShortcodes(): EmojiShortcodes | null {
  return shortcodes;
}

/** A `useSyncExternalStore` subscription that loads the table and reports when it arrives. */
export function subscribeEmojiShortcodes(onLoad: () => void): () => void {
  if (shortcodes === null) loadEmojiShortcodes().then(onLoad, () => {});
  return () => {};
}

/** Replaces GitHub `:name:` shortcodes with their emoji, leaving unknown names as written. */
export function replaceEmojiShortcodes(text: string, table: EmojiShortcodes): string {
  if (!text.includes(":")) return text;
  let result = "";
  let last = 0;
  SHORTCODE.lastIndex = 0;
  for (let match = SHORTCODE.exec(text); match !== null; match = SHORTCODE.exec(text)) {
    const emoji = table.get(match[1]!);
    if (emoji === undefined) {
      // The closing colon can open the next shortcode, as in `:typo:rocket:`.
      SHORTCODE.lastIndex = match.index + match[0].length - 1;
      continue;
    }
    result += text.slice(last, match.index) + emoji;
    last = match.index + match[0].length;
  }
  return last === 0 ? text : result + text.slice(last);
}
