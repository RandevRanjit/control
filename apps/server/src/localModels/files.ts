import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { expandHomePathWith } from "../pathExpansion.ts";

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export type ContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image_url"; readonly image_url: { readonly url: string } };

/**
 * Why a call's files couldn't be read. It names the path only: what a file holds never goes
 * into an error, a result, a transcript or a log (design/hybrid/HANDOFF.md §18.4).
 */
export class LocalModelFilesError extends Schema.TaggedError<LocalModelFilesError>()(
  "LocalModelFilesError",
  { message: Schema.String },
) {}

/**
 * The user turn of a local-model call: the instruction, then each file under a `--- path ---`
 * header. A folder means the files directly inside it, hidden ones aside. Images go in as image
 * parts, which only a model with a projector reads.
 */
export const readCallContent = (input: {
  readonly instruction: string;
  readonly files: ReadonlyArray<string>;
  readonly readsImages: boolean;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const fail = (message: string) => Effect.fail(new LocalModelFilesError({ message }));

    const paths: Array<string> = [];
    for (const given of input.files) {
      const absolute = expandHomePathWith(given, path);
      if (!path.isAbsolute(absolute)) return yield* fail(`Give ${given} as an absolute path.`);
      const info = yield* fs.stat(absolute).pipe(Effect.orElseSucceed(() => null));
      if (info === null) return yield* fail(`${given} doesn't exist.`);
      if (info.type !== "Directory") {
        paths.push(absolute);
        continue;
      }
      for (const name of (yield* fs.readDirectory(absolute)).toSorted()) {
        if (name.startsWith(".")) continue;
        const inside = path.join(absolute, name);
        const entry = yield* fs.stat(inside).pipe(Effect.orElseSucceed(() => null));
        if (entry?.type === "File") paths.push(inside);
      }
    }

    const parts: Array<ContentPart> = [{ type: "text", text: input.instruction }];
    for (const file of paths) {
      const bytes = yield* fs
        .readFile(file)
        .pipe(
          Effect.mapError(() => new LocalModelFilesError({ message: `Couldn't read ${file}.` })),
        );
      const imageType = IMAGE_TYPES[path.extname(file).toLowerCase()];
      if (imageType !== undefined) {
        if (!input.readsImages) {
          return yield* fail(`${file} is an image, and this model has no projector to read it.`);
        }
        parts.push({ type: "text", text: `--- ${file} ---` });
        parts.push({
          type: "image_url",
          image_url: { url: `data:${imageType};base64,${Buffer.from(bytes).toString("base64")}` },
        });
        continue;
      }
      const text = new TextDecoder().decode(bytes);
      if (text.includes("\u0000")) return yield* fail(`${file} isn't a text file.`);
      parts.push({ type: "text", text: `--- ${file} ---\n${text}` });
    }
    return { parts, fileCount: paths.length };
  });
