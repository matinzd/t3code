import {
  EMOJI_LITERAL_HTML_TAGS,
  findEmojiShortcodes,
  replaceEmojiShortcodes,
  type EmojiShortcodes,
} from "@t3tools/client-runtime/emoji-shortcodes";
import type { ReferenceAutolink } from "@t3tools/client-runtime/source-control-clients";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

type MarkdownNode = {
  readonly type: string;
  readonly referenceType?: string | undefined;
  readonly position?:
    | {
        readonly start: { readonly offset?: number | undefined };
        readonly end: { readonly offset?: number | undefined };
      }
    | undefined;
  readonly children?: readonly MarkdownNode[] | undefined;
};

const parser = unified().use(remarkParse).use(remarkGfm);
const LITERAL_TYPES = new Set(["image", "imageReference", "code", "inlineCode", "definition"]);
const LINK_TYPES = new Set(["link", "linkReference"]);
const HTML_TAG = /<(\/)?([a-z][a-z0-9-]*)(?=[\s/>])[^>]*>/giu;
const ESCAPABLE = /^[!-/:-@[-`{-~]$/u;

/** Replaces shortcodes in markdown source as the parser reads it, so `\:x\_y:` counts. */
function replaceSourceShortcodes(source: string, table: EmojiShortcodes): string {
  if (!source.includes(":")) return source;
  let text = "";
  const offsets: number[] = [];
  for (let index = 0; index < source.length; index++) {
    offsets.push(index);
    if (source[index] === "\\" && ESCAPABLE.test(source[index + 1] ?? "")) index++;
    text += source[index];
  }
  offsets.push(source.length);
  let result = "";
  let last = 0;
  for (const match of findEmojiShortcodes(text, table)) {
    result += source.slice(last, offsets[match.index]) + match.emoji;
    last = offsets[match.index + match.length]!;
  }
  return last === 0 ? source : result + source.slice(last);
}

/**
 * Rewrites the markdown's prose for the native renderer, which takes markdown text: references
 * `autolinks` finds become markdown links and emoji shortcodes become emoji. References are
 * searched as written, escapes included.
 */
export function rewritePullRequestMarkdown(
  markdown: string,
  autolinks: ((text: string) => ReadonlyArray<ReferenceAutolink>) | null,
  shortcodes: EmojiShortcodes | null,
): string {
  if (autolinks === null && (shortcodes === null || !markdown.includes(":"))) return markdown;
  const emojify = (source: string) =>
    shortcodes === null ? source : replaceSourceShortcodes(source, shortcodes);
  const edits: { start: number; end: number; value: string }[] = [];
  const visit = (node: MarkdownNode, inLink: boolean) => {
    if (LITERAL_TYPES.has(node.type)) return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    // A bare or `<...>` autolink's text is its URL.
    if (node.type === "link" && start !== undefined && markdown[start] !== "[") return;
    // A shortcut or collapsed reference's text is the label that finds its definition.
    if (node.type === "linkReference" && node.referenceType !== "full") return;
    if (node.type === "text") {
      if (start === undefined || end === undefined) return;
      const text = markdown.slice(start, end);
      let value = "";
      let last = 0;
      for (const link of inLink || autolinks === null ? [] : autolinks(text)) {
        value += `${emojify(text.slice(last, link.index))}[${link.label}](${link.url})`;
        last = link.index + link.text.length;
      }
      value += emojify(text.slice(last));
      if (value !== text) edits.push({ start, end, value });
    } else if (node.children !== undefined) {
      let literalDepth = 0;
      let anchorDepth = 0;
      for (const child of node.children) {
        if (child.type !== "html") {
          if (literalDepth === 0) {
            visit(child, inLink || anchorDepth > 0 || LINK_TYPES.has(node.type));
          }
          continue;
        }
        const tagStart = child.position?.start.offset;
        const tagEnd = child.position?.end.offset;
        if (tagStart === undefined || tagEnd === undefined) continue;
        const html = markdown.slice(tagStart, tagEnd);
        if (html.startsWith("<!--")) continue;
        // Raw HTML takes no backslash escapes, so its text is replaced as written.
        let value = "";
        let last = 0;
        for (const tag of html.matchAll(HTML_TAG)) {
          const text = html.slice(last, tag.index);
          value +=
            literalDepth === 0 && shortcodes ? replaceEmojiShortcodes(text, shortcodes) : text;
          value += tag[0];
          last = tag.index + tag[0].length;
          const name = tag[2]!.toLowerCase();
          const step = tag[1] ? -1 : 1;
          if (EMOJI_LITERAL_HTML_TAGS.has(name)) literalDepth = Math.max(0, literalDepth + step);
          else if (name === "a") anchorDepth = Math.max(0, anchorDepth + step);
        }
        const rest = html.slice(last);
        value += literalDepth === 0 && shortcodes ? replaceEmojiShortcodes(rest, shortcodes) : rest;
        if (value !== html) edits.push({ start: tagStart, end: tagEnd, value });
      }
    }
  };
  visit(parser.parse(markdown), false);
  let rewritten = markdown;
  for (let index = edits.length - 1; index >= 0; index--) {
    const edit = edits[index]!;
    rewritten = rewritten.slice(0, edit.start) + edit.value + rewritten.slice(edit.end);
  }
  return rewritten;
}
