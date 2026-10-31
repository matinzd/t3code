import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { fromJsonStringPretty } from "@t3tools/shared/schemaJson";
import { gemoji } from "gemoji";

const encodeShortcodes = Schema.encodeEffect(
  fromJsonStringPretty(Schema.Record(Schema.String, Schema.String)),
);

const generateEmojiShortcodes = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const output = yield* path.fromFileUrl(
    new URL("../packages/client-runtime/src/emojiShortcodes.json", import.meta.url),
  );
  const shortcodes = Object.fromEntries(
    gemoji
      .flatMap((entry) => entry.names.map((name) => [name, entry.emoji] as const))
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  yield* fs.writeFileString(output, `${yield* encodeShortcodes(shortcodes)}\n`);
  yield* Console.log(`Wrote ${Object.keys(shortcodes).length} shortcodes to ${output}`);
});

generateEmojiShortcodes.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
