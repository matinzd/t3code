import {
  findEmojiShortcodes,
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
const LITERAL_TYPES = new Set([
  "image",
  "imageReference",
  "code",
  "inlineCode",
  "html",
  "definition",
]);
const LINK_TYPES = new Set(["link", "linkReference"]);
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
  if (autolinks === null && shortcodes === null) return markdown;
  const emojify = (text: string) =>
    shortcodes === null ? text : replaceSourceShortcodes(text, shortcodes);
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
      let protectedHtmlDepth = 0;
      for (const child of node.children) {
        if (child.type === "html") {
          const tagStart = child.position?.start.offset;
          const tagEnd = child.position?.end.offset;
          const tag =
            tagStart === undefined || tagEnd === undefined ? "" : markdown.slice(tagStart, tagEnd);
          for (const match of tag.matchAll(/<(\/)?(?:a|code|pre|script|style)(?=[\s>])[^>]*>/giu)) {
            protectedHtmlDepth = Math.max(0, protectedHtmlDepth + (match[1] ? -1 : 1));
          }
        } else if (protectedHtmlDepth === 0) visit(child, inLink || LINK_TYPES.has(node.type));
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
