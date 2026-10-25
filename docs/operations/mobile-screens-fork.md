# Building the mobile Screens dependency

The mobile v5 stack uses a committed tarball from the
[T3 Screens fork](https://github.com/juliusmarminge/react-native-screens/tree/t3-v5.0.0-t3.7).
The fork owns the integration changes; the app does not patch this package.
Each archive includes compiled JavaScript, declarations, native source and
`t3-fork.json` recording its version, source commit and upstream base.

To reproduce the current archive with Node 24 and the repository's pinned Yarn:

```sh
git clone --branch t3-v5.0.0-t3.7 https://github.com/juliusmarminge/react-native-screens.git /tmp/t3-screens-fork
yarn --cwd /tmp/t3-screens-fork pack:t3 /tmp/screens-pack
```

Then label it ours: set `version` in the archive's `package/package.json` to `5.0.0-control.N` (the
fork's `N`), and repack it into `apps/mobile/deps/react-native-screens-5.0.0-control.N.tgz` with the
packed archive's own entries (`tar -tzf` it to a list, then
`COPYFILE_DISABLE=1 tar --no-xattrs -czf <new.tgz> -C <extracted> -T <list>`). Expo's build
fingerprint records that version and file name, so the fork's label stays out of the app.

For an update, sync the fork's `main` with upstream, merge it and the required
proposal branches into `t3/main`, increment the `5.0.0-t3.N` version, pin `t3Fork.upstreamCommit` to the
integrated upstream SHA and commit.
Run `pack:t3` from that clean checkout, tag the source as `t3-v<version>` and label the archive as
above. Replace the old archive, update `apps/mobile/package.json` and run `vp i` to
regenerate the lockfile. Verify mobile types and affected navigation tests.
Changes to native source also require rebuilding and testing the native client.
