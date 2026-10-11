# Where these rules come from

- **Source**: https://github.com/dmmulroy/anti-slop, the bundled copy of the `install-anti-slop` skill
  (`skills/install-anti-slop/assets/anti-slop`).
- **Commit**: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` (`main` on 2026-10-11).
- **Installed at**: `tools/oxlint/anti-slop/`, registered in `.oxlintrc.jsonc` as the plugin `anti-slop`. The Effect
  plugin in `effect/` is copied but not registered; the project does not use Effect.
- **Licence**: MIT, see [`LICENSE`](LICENSE), copied from the root of the source repository.
- **Changes to the copied files**: none.

## Deviations from the rule set of the skill

The reasons are next to the settings in `.oxlintrc.jsonc`.

- Off everywhere: `no-unknown-parameters`, `no-unknown-returns`, `no-runtime-typeof`, `no-unsafe-dictionary-type`.
- Off in specs and test helpers: `require-safety-comment-for-type-assertion`, `no-chained-type-assertions`,
  `no-object-parameters`, `no-reflect-get`, `no-known-value-widening`, `no-conditional-empty-object-spread`.
