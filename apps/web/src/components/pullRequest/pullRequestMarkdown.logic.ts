import {
  EMOJI_LITERAL_HTML_TAGS,
  replaceEmojiShortcodes,
  type EmojiShortcodes,
} from "@t3tools/client-runtime/emoji-shortcodes";
import { changeRequestReferenceAutolinker } from "@t3tools/client-runtime/pull-request-markdown";
import {
  sourceControlClients,
  type ReferenceAutolink,
} from "@t3tools/client-runtime/source-control-clients";
import type { PluggableList } from "unified";

export {
  splitPullRequestBody,
  type PullRequestBodySegment,
} from "@t3tools/client-runtime/pull-request-markdown";

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  url?: string;
  data?: unknown;
};

const AUTOLINK_IGNORED_TYPES = new Set(["link", "linkReference"]);

export function remarkPullRequestAutolinks(options: {
  readonly autolinks: (text: string) => ReadonlyArray<ReferenceAutolink>;
}) {
  const visit = (node: MarkdownNode): void => {
    const children = node.children;
    if (children === undefined) return;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index]!;
      if (AUTOLINK_IGNORED_TYPES.has(child.type)) continue;
      if (child.type !== "text" || child.value === undefined) {
        visit(child);
        continue;
      }
      const value = child.value;
      const links = options.autolinks(value);
      if (links.length === 0) continue;
      const replacements: MarkdownNode[] = [];
      let start = 0;
      for (const link of links) {
        if (start < link.index) {
          replacements.push({ type: "text", value: value.slice(start, link.index) });
        }
        replacements.push({
          type: "link",
          url: link.url,
          data: { hProperties: { dataPullRequestAutolink: link.kind } },
          children: [{ type: "text", value: link.label }],
        });
        start = link.index + link.text.length;
      }
      if (start < value.length) replacements.push({ type: "text", value: value.slice(start) });
      children.splice(index, 1, ...replacements);
      index += replacements.length - 1;
    }
  };
  return (tree: MarkdownNode) => visit(tree);
}

const NO_AUTOLINK_PLUGINS: PluggableList = [];
const autolinkPlugins = new Map<string, PluggableList>();

/**
 * One plugin list per repository, so every comment of a pull request shares one markdown
 * renderer and its parse cache instead of parsing again on each render.
 */
export function pullRequestAutolinkPlugins(
  changeRequest: { readonly provider: string; readonly url: string } | null,
): PluggableList {
  if (changeRequest === null) return NO_AUTOLINK_PLUGINS;
  const repositoryUrl = sourceControlClients.parseChangeRequestUrl(changeRequest.url)?.link
    .repositoryUrl;
  if (repositoryUrl === undefined) return NO_AUTOLINK_PLUGINS;
  const key = `${changeRequest.provider}\u0000${repositoryUrl}`;
  let plugins = autolinkPlugins.get(key);
  if (plugins === undefined) {
    const autolinks = changeRequestReferenceAutolinker(changeRequest);
    plugins = autolinks ? [[remarkPullRequestAutolinks, { autolinks }]] : NO_AUTOLINK_PLUGINS;
    autolinkPlugins.set(key, plugins);
  }
  return plugins;
}

type HtmlNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { href?: unknown };
  children?: HtmlNode[];
};

const textContent = (node: HtmlNode): string =>
  node.type === "text" ? (node.value ?? "") : (node.children ?? []).map(textContent).join("");

/** A bare or `<...>` autolink, whose text is its URL. */
function isUrlLink(node: HtmlNode): boolean {
  const href = node.properties?.href;
  const text = textContent(node);
  return (
    typeof href === "string" &&
    (href === text || href === `http://${text}` || href === `mailto:${text}`)
  );
}

/** Runs on HTML, after raw HTML is parsed, so it sees the text GitHub's emoji filter does. */
function rehypeEmojiShortcodes(options: { readonly shortcodes: EmojiShortcodes }) {
  const visit = (node: HtmlNode): void => {
    if (node.type === "text" && node.value !== undefined) {
      node.value = replaceEmojiShortcodes(node.value, options.shortcodes);
      return;
    }
    if (node.type === "element") {
      if (EMOJI_LITERAL_HTML_TAGS.has(node.tagName ?? "")) return;
      if (node.tagName === "a" && isUrlLink(node)) return;
    }
    node.children?.forEach(visit);
  };
  return (tree: HtmlNode) => visit(tree);
}

const NO_EMOJI_PLUGINS: PluggableList = [];
let emojiPlugins: PluggableList | null = null;

/** One list for the loaded table, so every comment shares one renderer and its parse cache. */
export function emojiShortcodePlugins(shortcodes: EmojiShortcodes | null): PluggableList {
  if (shortcodes === null) return NO_EMOJI_PLUGINS;
  emojiPlugins ??= [[rehypeEmojiShortcodes, { shortcodes }]];
  return emojiPlugins;
}
