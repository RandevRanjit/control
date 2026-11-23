import { DesktopSavedLogin, type DesktopSaveLoginInput } from "@control/contracts";
import { loginOrigin } from "@control/shared/preview";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Base64 from "effect/encoding/Base64";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";

const LoginRecord = Schema.Struct({
  ...DesktopSavedLogin.fields,
  encryptedPassword: Schema.String,
});
type LoginRecord = typeof LoginRecord.Type;

const LoginDocument = Schema.fromJsonString(
  Schema.Struct({ version: Schema.Literal(1), logins: Schema.Array(LoginRecord) }),
);
const decodeLoginDocument = Schema.decodeEffect(LoginDocument);
const encodeLoginDocument = Schema.encodeEffect(LoginDocument);

export class LoginVaultError extends Schema.TaggedError<LoginVaultError>()("LoginVaultError", {
  operation: Schema.Literals(["read", "write", "encrypt", "decrypt"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Saved logins could not be used: ${this.operation} failed.`;
  }
}

export class LoginSiteError extends Schema.TaggedError<LoginSiteError>()("LoginSiteError", {}) {
  override get message(): string {
    return "A login can only be saved for an https address.";
  }
}

const failed = (operation: LoginVaultError["operation"]) => (cause: unknown) =>
  new LoginVaultError({ operation, cause });

/**
 * The website logins the browser signs in with. Passwords are encrypted with the app's Keychain
 * key, and only `credentials` gives one back: no IPC method, log or event carries it.
 */
export class LoginVault extends Context.Service<
  LoginVault,
  {
    readonly list: Effect.Effect<ReadonlyArray<DesktopSavedLogin>, LoginVaultError>;
    /** Returns the origin it was saved for. */
    readonly save: (
      input: DesktopSaveLoginInput,
    ) => Effect.Effect<string, LoginVaultError | LoginSiteError>;
    readonly remove: (origin: string) => Effect.Effect<void, LoginVaultError>;
    /** The login to sign in with; none when the site turned it down. Records its use. */
    readonly credentials: (
      origin: string,
    ) => Effect.Effect<
      Option.Option<{ readonly username: string; readonly password: string }>,
      LoginVaultError
    >;
    readonly markRefused: (
      origin: string,
      refused: boolean,
    ) => Effect.Effect<void, LoginVaultError>;
  }
>()("@control/desktop/logins/LoginVault") {}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const { loginsPath, stateDir } = yield* DesktopEnvironment.DesktopEnvironment;
  const fileSystem = yield* FileSystem.FileSystem;
  const safeStorage = yield* ElectronSafeStorage.ElectronSafeStorage;
  const crypto = yield* Crypto.Crypto;
  const writing = yield* Semaphore.make(1);
  const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

  // An unreadable file fails every call, so a save can't replace logins it never read.
  const read = fileSystem.readFileString(loginsPath).pipe(
    Effect.flatMap(decodeLoginDocument),
    Effect.map((document) => document.logins),
    Effect.catchTags({
      PlatformError: (error) =>
        error.reason._tag === "NotFound"
          ? Effect.succeed<ReadonlyArray<LoginRecord>>([])
          : Effect.fail(error),
    }),
    Effect.mapError(failed("read")),
  );

  const write = Effect.fn("LoginVault.write")(
    function* (logins: ReadonlyArray<LoginRecord>) {
      const temporary = `${loginsPath}.${yield* crypto.randomUUIDv4}.tmp`;
      const encoded = yield* encodeLoginDocument({ version: 1, logins });
      yield* fileSystem.makeDirectory(stateDir, { recursive: true });
      yield* fileSystem.writeFileString(temporary, `${encoded}\n`, { mode: 0o600 }).pipe(
        Effect.andThen(fileSystem.rename(temporary, loginsPath)),
        Effect.onError(() => fileSystem.remove(temporary, { force: true }).pipe(Effect.ignore)),
      );
    },
    Effect.mapError(failed("write")),
  );

  const update = (
    change: (
      logins: ReadonlyArray<LoginRecord>,
    ) => Effect.Effect<ReadonlyArray<LoginRecord>, LoginVaultError>,
  ) => read.pipe(Effect.flatMap(change), Effect.flatMap(write), writing.withPermit);

  const updateOne = (origin: string, change: (login: LoginRecord) => LoginRecord) =>
    update((logins) =>
      Effect.succeed(logins.map((login) => (login.origin === origin ? change(login) : login))),
    );

  return LoginVault.of({
    list: Effect.map(read, (logins) =>
      logins.map(({ origin, username, lastUsedAt, refusedAt }) => ({
        origin,
        username,
        lastUsedAt,
        refusedAt,
      })),
    ).pipe(Effect.withSpan("LoginVault.list")),

    save: Effect.fn("LoginVault.save")(function* ({ site, username, password }) {
      const origin = loginOrigin(site);
      if (origin === null) return yield* new LoginSiteError();
      const encryptedPassword = Base64.encode(
        yield* safeStorage.encryptString(password).pipe(Effect.mapError(failed("encrypt"))),
      );
      yield* update((logins) =>
        Effect.succeed([
          ...logins.filter((login) => login.origin !== origin),
          { origin, username, encryptedPassword, lastUsedAt: null, refusedAt: null },
        ]),
      );
      return origin;
    }),

    remove: Effect.fn("LoginVault.remove")(function* (origin) {
      yield* update((logins) => Effect.succeed(logins.filter((login) => login.origin !== origin)));
    }),

    credentials: Effect.fn("LoginVault.credentials")(function* (origin) {
      const login = (yield* read).find((candidate) => candidate.origin === origin);
      if (login === undefined || login.refusedAt !== null) return Option.none();
      const password = yield* Effect.fromResult(Base64.decode(login.encryptedPassword)).pipe(
        Effect.flatMap(safeStorage.decryptString),
        Effect.mapError(failed("decrypt")),
      );
      const lastUsedAt = yield* nowIso;
      yield* updateOne(origin, (current) => ({ ...current, lastUsedAt }));
      return Option.some({ username: login.username, password });
    }),

    markRefused: Effect.fn("LoginVault.markRefused")(function* (origin, refused) {
      const refusedAt = refused ? yield* nowIso : null;
      yield* updateOne(origin, (current) => ({ ...current, refusedAt }));
    }),
  });
});

export const layer = Layer.effect(LoginVault, make);
