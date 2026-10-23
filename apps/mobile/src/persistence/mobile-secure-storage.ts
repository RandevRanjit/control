import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SecureStore from "expo-secure-store";

const MobileSecureStorageOperation = Schema.Literals(["read", "write", "delete"]);

/** Keys were `t3code.…` before the rename; `control.…` keys read through to them. */
const legacyKey = (key: string) =>
  key.startsWith("control.") ? `t3code.${key.slice("control.".length)}` : null;

/** Reads a key, copying a value saved under its old name the first time. */
export async function getItemCarryingLegacy(key: string): Promise<string | null> {
  const value = await SecureStore.getItemAsync(key);
  const legacy = legacyKey(key);
  if (value !== null || legacy === null) return value;
  const carried = await SecureStore.getItemAsync(legacy);
  if (carried !== null) await SecureStore.setItemAsync(key, carried);
  return carried;
}

export class MobileSecureStorageError extends Schema.TaggedError<MobileSecureStorageError>()(
  "MobileSecureStorageError",
  {
    operation: MobileSecureStorageOperation,
    key: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Mobile secure storage operation ${this.operation} failed for key ${this.key}.`;
  }
}

export class MobileSecureStorage extends Context.Service<
  MobileSecureStorage,
  {
    readonly getItem: (key: string) => Effect.Effect<string | null, MobileSecureStorageError>;
    readonly setItem: (key: string, value: string) => Effect.Effect<void, MobileSecureStorageError>;
    readonly removeItem: (key: string) => Effect.Effect<void, MobileSecureStorageError>;
  }
>()("@control/mobile/persistence/MobileSecureStorage") {}

export const make = MobileSecureStorage.of({
  getItem: Effect.fn("MobileSecureStorage.getItem")((key) =>
    Effect.tryPromise({
      try: () => getItemCarryingLegacy(key),
      catch: (cause) => new MobileSecureStorageError({ operation: "read", key, cause }),
    }),
  ),
  setItem: Effect.fn("MobileSecureStorage.setItem")((key, value) =>
    Effect.tryPromise({
      try: () => SecureStore.setItemAsync(key, value),
      catch: (cause) => new MobileSecureStorageError({ operation: "write", key, cause }),
    }),
  ),
  removeItem: Effect.fn("MobileSecureStorage.removeItem")((key) =>
    Effect.tryPromise({
      // The old name goes too, or the next read would bring the value back.
      try: async () => {
        await SecureStore.deleteItemAsync(key);
        const legacy = legacyKey(key);
        if (legacy !== null) await SecureStore.deleteItemAsync(legacy);
      },
      catch: (cause) => new MobileSecureStorageError({ operation: "delete", key, cause }),
    }),
  ),
});

export const layer = Layer.succeed(MobileSecureStorage, make);
