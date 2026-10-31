import * as Effect from "effect/Effect";

export type EmojiShortcodes = ReadonlyMap<string, string>;

/** HTML whose text GitHub keeps as written. */
export const EMOJI_LITERAL_HTML_TAGS: ReadonlySet<string> = new Set([
  "code",
  "pre",
  "tt",
  "script",
  "style",
]);

const SHORTCODE = /:([a-z0-9_+-]+):/g;

function findEmojiShortcodes(
  text: string,
  table: EmojiShortcodes,
): ReadonlyArray<{ readonly index: number; readonly length: number; readonly emoji: string }> {
  if (!text.includes(":")) return [];
  const matches = [];
  SHORTCODE.lastIndex = 0;
  for (let match = SHORTCODE.exec(text); match !== null; match = SHORTCODE.exec(text)) {
    const emoji = table.get(match[1]!);
    if (emoji === undefined) {
      // The closing colon can open the next shortcode, as in `:typo:rocket:`.
      SHORTCODE.lastIndex = match.index + match[0].length - 1;
      continue;
    }
    matches.push({ index: match.index, length: match[0].length, emoji });
  }
  return matches;
}

/** Replaces GitHub `:name:` shortcodes with their emoji, leaving unknown names as written. */
export function replaceEmojiShortcodes(text: string, table: EmojiShortcodes): string {
  let result = "";
  let last = 0;
  for (const match of findEmojiShortcodes(text, table)) {
    result += text.slice(last, match.index) + match.emoji;
    last = match.index + match.length;
  }
  return last === 0 ? text : result + text.slice(last);
}

/** A `useSyncExternalStore` source for a table that loads once and retries after a failure. */
export function createEmojiShortcodeStore(load: () => Promise<Readonly<Record<string, string>>>) {
  let table: EmojiShortcodes | null = null;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const preload = (): Promise<void> => {
    if (table !== null) return Promise.resolve();
    loading ??= load().then(
      (entries) => {
        table = new Map(Object.entries(entries));
        for (const listener of listeners) listener();
      },
      (error: unknown) => {
        loading = null;
        Effect.runFork(
          Effect.logWarning("Emoji shortcodes failed to load; the next render retries.", { error }),
        );
      },
    );
    return loading;
  };
  return {
    preload,
    getSnapshot: (): EmojiShortcodes | null => table,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      void preload();
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Kept out of the bundle that starts the app; web preloads it in the background. */
export const emojiShortcodeStore = createEmojiShortcodeStore(() =>
  import("./emojiShortcodes.json").then((table) => table.default),
);
