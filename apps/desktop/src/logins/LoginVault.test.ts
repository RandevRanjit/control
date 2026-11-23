import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";
import * as LoginVault from "./LoginVault.ts";

const reverse = (value: string) => [...value].toReversed().join("");

const layerSafeStorage = Layer.succeed(ElectronSafeStorage.ElectronSafeStorage, {
  isEncryptionAvailable: Effect.succeed(true),
  encryptString: (value) => Effect.succeed(new TextEncoder().encode(reverse(value))),
  decryptString: (value) => Effect.succeed(reverse(new TextDecoder().decode(value))),
  selectedStorageBackend: Effect.succeedNone,
});

const withVault = <A, E>(
  body: Effect.Effect<
    A,
    E,
    LoginVault.LoginVault | DesktopEnvironment.DesktopEnvironment | FileSystem.FileSystem
  >,
) =>
  Effect.gen(function* () {
    const baseDir = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
      prefix: "control-logins-",
    });
    const layerEnvironment = DesktopEnvironment.layer({
      dirname: "/repo/apps/desktop/src",
      homeDirectory: baseDir,
      platform: "darwin",
      processArch: "arm64",
      appVersion: "1.2.3",
      appPath: "/repo",
      isPackaged: true,
      resourcesPath: "/missing/resources",
      runningUnderArm64Translation: false,
    }).pipe(Layer.provide(DesktopConfig.layerTest({ CONTROL_HOME: baseDir })));
    return yield* body.pipe(
      Effect.provide(
        LoginVault.layer.pipe(
          Layer.provideMerge(Layer.mergeAll(layerEnvironment, layerSafeStorage)),
        ),
      ),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const login = {
  site: "https://login.example.com/sso?x=1",
  username: "ada",
  password: "Sw0rdfish!",
};

describe("LoginVault", () => {
  it.effect("keeps a login for its origin and gives the password only to sign in", () =>
    withVault(
      Effect.gen(function* () {
        const vault = yield* LoginVault.LoginVault;
        const { loginsPath } = yield* DesktopEnvironment.DesktopEnvironment;
        const fileSystem = yield* FileSystem.FileSystem;
        assert.equal(yield* vault.save(login), "https://login.example.com");

        assert.deepEqual(yield* vault.list, [
          {
            origin: "https://login.example.com",
            username: "ada",
            lastUsedAt: null,
            refusedAt: null,
          },
        ]);
        const onDisk = yield* fileSystem.readFileString(loginsPath);
        assert.notInclude(onDisk, login.password);
        assert.equal((yield* fileSystem.stat(loginsPath)).mode & 0o777, 0o600);

        assert.deepEqual(
          yield* vault.credentials("https://login.example.com"),
          Option.some({ username: "ada", password: login.password }),
        );
        assert.isNotNull((yield* vault.list)[0]?.lastUsedAt);
        for (const other of ["https://example.com", "https://login.example.com:8443"]) {
          assert.isTrue(Option.isNone(yield* vault.credentials(other)), other);
        }
      }),
    ),
  );

  it.effect("replaces the login when saved again, and forgets it when removed", () =>
    withVault(
      Effect.gen(function* () {
        const vault = yield* LoginVault.LoginVault;
        const origin = yield* vault.save(login);
        yield* vault.save({ ...login, username: "grace", password: "changed" });
        assert.deepEqual(
          yield* vault.credentials(origin),
          Option.some({ username: "grace", password: "changed" }),
        );
        assert.equal((yield* vault.list).length, 1);
        yield* vault.remove(origin);
        assert.deepEqual(yield* vault.list, []);
        assert.isTrue(Option.isNone(yield* vault.credentials(origin)));
      }),
    ),
  );

  it.effect("holds back a login the site turned down until it is retried or saved again", () =>
    withVault(
      Effect.gen(function* () {
        const vault = yield* LoginVault.LoginVault;
        const origin = yield* vault.save(login);
        yield* vault.markRefused(origin, true);
        assert.isNotNull((yield* vault.list)[0]?.refusedAt);
        assert.isTrue(Option.isNone(yield* vault.credentials(origin)));
        yield* vault.markRefused(origin, false);
        assert.isTrue(Option.isSome(yield* vault.credentials(origin)));
        yield* vault.markRefused(origin, true);
        yield* vault.save(login);
        assert.isTrue(Option.isSome(yield* vault.credentials(origin)));
      }),
    ),
  );

  it.effect("saves nothing for an address that isn't https", () =>
    withVault(
      Effect.gen(function* () {
        const vault = yield* LoginVault.LoginVault;
        const error = yield* vault.save({ ...login, site: "http://example.com" }).pipe(Effect.flip);
        assert.instanceOf(error, LoginVault.LoginSiteError);
        assert.deepEqual(yield* vault.list, []);
      }),
    ),
  );

  it.effect("never writes over a file it can't read", () =>
    withVault(
      Effect.gen(function* () {
        const vault = yield* LoginVault.LoginVault;
        const { loginsPath, stateDir } = yield* DesktopEnvironment.DesktopEnvironment;
        const fileSystem = yield* FileSystem.FileSystem;
        yield* fileSystem.makeDirectory(stateDir, { recursive: true });
        yield* fileSystem.writeFileString(loginsPath, "{damaged");
        for (const attempt of [
          Effect.asVoid(vault.save(login)),
          Effect.asVoid(vault.list),
          vault.remove("https://a.example"),
        ]) {
          assert.instanceOf(yield* Effect.flip(attempt), LoginVault.LoginVaultError);
        }
        assert.equal(yield* fileSystem.readFileString(loginsPath), "{damaged");
      }),
    ),
  );
});
