import { useSyncExternalStore } from "react";

/**
 * Faces the terminal offers beyond the default (Regrade) and the installed fonts: CONTROL's
 * own, and font files the owner loads to try (Settings › Typography › Terminal font). Loaded
 * files stay in this client's IndexedDB, so they survive a restart; other clients don't have
 * them.
 */
export const APP_TERMINAL_FACES: ReadonlyArray<{
  readonly family: string;
  readonly label: string;
}> = [
  { family: "BloomPlex", label: "IBM Plex Mono" },
  { family: "Departure", label: "Departure Mono" },
];

const DATABASE_NAME = "control:terminal-fonts";
const STORE_NAME = "fonts";
let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(STORE_NAME);
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  }));
}

function completed(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

let loadedFamilies: ReadonlyArray<string> = [];
const listeners = new Set<() => void>();

function setLoadedFamilies(next: ReadonlyArray<string>) {
  loadedFamilies = next.toSorted((a, b) => a.localeCompare(b));
  for (const listener of listeners) listener();
}

async function register(family: string, data: ArrayBuffer) {
  document.fonts.add(await new FontFace(family, data).load());
}

let restored: Promise<void> | null = null;

/** Registers the loaded fonts once per page; a terminal awaits it before measuring. */
export function restoreLoadedTerminalFonts(): Promise<void> {
  return (restored ??= (async () => {
    try {
      const db = await openDatabase();
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const [keys, values] = await Promise.all([
        new Promise<IDBValidKey[]>((resolve, reject) => {
          const request = store.getAllKeys();
          request.addEventListener("success", () => resolve(request.result));
          request.addEventListener("error", () => reject(request.error));
        }),
        new Promise<ArrayBuffer[]>((resolve, reject) => {
          const request = store.getAll();
          request.addEventListener("success", () => resolve(request.result as ArrayBuffer[]));
          request.addEventListener("error", () => reject(request.error));
        }),
      ]);
      const families: Array<string> = [];
      for (const [index, key] of keys.entries()) {
        const data = values[index];
        if (typeof key !== "string" || data === undefined) continue;
        // A file that no longer parses stays stored but unlisted.
        await register(key, data).then(
          () => families.push(key),
          () => undefined,
        );
      }
      setLoadedFamilies(families);
    } catch {
      // No IndexedDB here: nothing was loaded on this client.
    }
  })());
}

/** The file's name, without its extension, names the face. Rejects a file that isn't a font. */
export async function loadTerminalFontFile(file: File): Promise<string> {
  const family = file.name.replace(/\.(ttf|otf|woff2?)$/i, "").trim() || "Loaded font";
  const data = await file.arrayBuffer();
  await register(family, data);
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(data, family);
  await completed(transaction);
  setLoadedFamilies([...loadedFamilies.filter((name) => name !== family), family]);
  return family;
}

export async function removeLoadedTerminalFont(family: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(family);
  await completed(transaction);
  for (const face of document.fonts) {
    if (face.family.replace(/^["']|["']$/g, "") === family) document.fonts.delete(face);
  }
  setLoadedFamilies(loadedFamilies.filter((name) => name !== family));
}

export function useLoadedTerminalFonts(): ReadonlyArray<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      void restoreLoadedTerminalFonts();
      return () => listeners.delete(listener);
    },
    () => loadedFamilies,
  );
}
