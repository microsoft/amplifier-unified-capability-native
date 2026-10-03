# Repository owner entry

Read [local vision](docs/VISION.md), [native bridge v1 contract](contracts/native-bridge.v1.md)
and [README](README.md) before changing the public boundary. These link the
approved family direction and schema owners; do not duplicate upstream AHP/ACP
or establish a second native authority.

Modify this repository only. Native adapter/runtime changes belong to
`amplifier-app-acp`; host admission and durable receipts, client drafts/rendering,
and distribution/release state have separate owners. Coordinate public deltas
before changing their meaning. Preserve scoped authority, native records and
unknown effects. Review affected native module-class implementations before
changing module semantics.

Run checks appropriate to the change. Actual installed fixtures use owned state,
`PYTHONDONTWRITEBYTECODE=1`, `-B` alongside `-I`, and immutable runtime preparation.
Do not mutate another owner's environment. Record exact packages/peers, skips
and browser/account/deployment limits. Documentation-only changes need link and
package-integrity checks, not unnecessary runtime reruns. No merge, publication
or deployment is implied by this repository's tests.
