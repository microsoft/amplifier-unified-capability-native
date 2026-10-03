# Native capability bridge contract — v1

Status: local declaration of inherited approved direction and existing public
interfaces; **no new family ratification or proposed runtime scope**. Parent:
[local vision](../docs/VISION.md). Shared authority: family contracts at
[`625af2f`](https://github.com/microsoft/amplifier-unified/tree/625af2f2832fafc8152f6078061d626f160362a4/contracts).
The schema owners define wire details; this document does not copy them.

## Public boundary and consumers

`createNativeCapabilities` supplies manifest discovery, `actionSchemas`, bounded
`read`, scoped `action`, and lazy `invalidate`. `AdminConnection` supplies trusted
`perform`, narrow import/maintenance composition and one administration quiescence
participant. `createPermissionsCapabilities` supplies the separate scoped file
preference bridge. Their authoritative declarations live in exported package
types and `src/action-schemas.ts` / `src/permissions.ts`, not prose copies here.

[Upstream AHP](https://microsoft.github.io/agent-host-protocol/) and
[ACP](https://agentclientprotocol.com/) own standard protocol semantics. Native
`_amplifier/native` and `_amplifier/admin` extensions and their negotiated metadata
belong to `amplifier-app-acp`. This product bridge neither redefines standard
model/mode controls nor owns native storage. Optional absence is explicit.

## Promises and falsifiers

The following promises inherit the linked family clauses. Acceptance links point
to the sealed implementation source; they are checks, not universal parity claims.

| Local promise | Shared basis | Falsifier and executable evidence |
| --- | --- | --- |
| NB1: Keep native execution/settings behind negotiated ACP; preserve modular composition. | [CB2–3](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/contracts/component-boundaries.v1.md), [AP1–2, AP5](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/contracts/agent-protocol.v1.md) | A TypeScript native store, fabricated absent catalog or silently substituted control breaks this boundary. [Provider tests](https://github.com/microsoft/amplifier-unified-capability-native/blob/b33432cb967c21a6840a8155013c71ab7f173940/test/provider.test.ts) and [installed presentation](https://github.com/microsoft/amplifier-unified-capability-native/blob/b33432cb967c21a6840a8155013c71ab7f173940/test/installed-presentation.test.ts). |
| NB2: Bind actions to trusted context; retain one native administration authority. | [HP4–5](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/contracts/host-protocol.v1.md), [CS1, CS5, CS7](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/contracts/client-state.v1.md) | Foreign selectors, caller-supplied homes or forged tool actors must not authorize dispatch. [Permission tests](https://github.com/microsoft/amplifier-unified-capability-native/blob/b33432cb967c21a6840a8155013c71ab7f173940/test/permissions.test.ts), provider scope/actor cases and admin fence cases. |
| NB3: Preserve saved/mounted distinctions and truthful refusal/unknown outcomes without replay. | [AP4](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/contracts/agent-protocol.v1.md), [HP6](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/contracts/host-protocol.v1.md), CS4–6 | Throwing away a completed save after lost activation, rebasing stale CAS or retrying uncertain work breaks this promise. Provider causal save/CAS cases and [actual runtime checks](https://github.com/microsoft/amplifier-unified-capability-native/blob/b33432cb967c21a6840a8155013c71ab7f173940/test/runtime.integration.test.ts). |
| NB4: Bound selected projections and leave drafts with clients. | [WS3–5](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/contracts/working-set.v1.md), CS2–3 | An unrelated history scan, eager global rebuild, leaked editor selection or unbounded scope cache violates this direction. Provider lazy/copy/invalidation checks and permission projection checks. Whole-app scale remains separately qualified. |
| NB5: Preserve native held intake and exact trusted recovery scope. | CB7, CS7, [MA](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/contracts/maintenance.v1.md) | A detached callback, replacement process or browser selector cannot recreate a maintenance lease. [Admin tests](https://github.com/microsoft/amplifier-unified-capability-native/blob/b33432cb967c21a6840a8155013c71ab7f173940/test/admin.test.ts) cover release binding, capture, cache and app-reset gates. |
| NB6: Keep user/agent semantics and evidence limits explicit. | [CX3, CX7](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/contracts/client-experience.v1.md), [CD3, CD5–6](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/contracts/client-development.v1.md), CB4–5 | A source fixture called browser/account/release acceptance, or forged caller actor, falsifies the claim. Installed runtime checks exercise actual approved UI/agent tool calls; exact peer/package receipts retain gaps. |

## Consumer obligations already required by this boundary

Hosts authorize channels and workspaces before calling these ports, retain the
original command identity, and distinguish a delivered completed-save response
from its activation outcome. Exact original result recovery remains a desired
CS4/HP6 obligation, not qualified behavior: the current host retains command
status/detail, not the saved/activation body. A topic cache is not a durable
receipt store. Consumers keep
native configuration revisions opaque and require explicit stale-draft review.

Composition binds every administration callback to the same genuine connection
and quiescence participant. Only trusted host recovery code enters the matching
maintenance fence; native paths and private reset DTOs do not become browser
arguments. Clients retain private drafts and render needs-model, failed and
unknown outcomes without automatic mutation retries. They inspect negotiated
support before exposing optional controls.

## Qualification and open gaps

`npm test` and `npm run check` cover the local owner. Set `AMPLIFIER_ACP_PYTHON` for
actual installed native checks; omitted peers produce visible skips. Set
`AMPLIFIER_NATIVE_CAPABILITY_MODULE` for an independently installed package.
Enable `AMPLIFIER_TEST_NATIVE_APPROVAL=1` with repaired native `473d42f`; enable
`AMPLIFIER_TEST_PORTABLE_BUNDLE=1` with the native owner's test-only installed
provider fixture. These flags qualify fresh owned state, never retry old effects.

Implementation `b33432c` passed 38 source and 38 installed consumer checks with no
skips on macOS against native `473d42f`. Three causal bundle-save cases fail on
baseline `8e8b615`. The original `f530` approval deadlock/unknown records remain
retained independently. Hosted Node 22/24 fixture success is distinct from actual
native, browser, account and deployed acceptance.

F04/F06–F10/F23/F25 retain their original desired behavior. Browser editors,
lost outer-reply/result recovery and its UI, remote source discovery, nonempty skills/agents, supported
mode-set variants, all module/provider combinations, Linux installed-native,
real accounts/devices and live adoption are not established by this packet.
General global-agent administration policy remains a cross-owner question;
permission saves already restrict agents to their authorized session workspace.
No new policy or retirement decision is inferred from that gap.
