# Sourced by the hooks. `bun test --isolate` only exists from the bun version pinned in
# the root package.json. An older bun accepts the flag and ignores it -- like any flag it
# does not know -- so the suite runs unisolated: mock.module calls leak across files and
# dozens of tests fail for reasons that have nothing to do with the change. Bun does not
# enforce `engines` itself, so the floor is checked here.
bun -e '
  const required = require("./package.json").engines.bun;
  if (Bun.semver.satisfies(Bun.version, required)) process.exit(0);
  console.error(`\nbun ${Bun.version} is too old: this repo needs bun ${required}.`);
  console.error("Below it, `bun test --isolate` is silently a no-op and the suite fails on its own leakage.");
  console.error("Upgrade with: bun upgrade\n");
  process.exit(1);
' || exit 1
