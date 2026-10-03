# Unified native capabilities

Start with the [local vision](docs/VISION.md), [versioned bridge contract](contracts/native-bridge.v1.md)
and [agent entry](AGENTS.md). They map the inherited approved family direction to
this repository's public promises, owners, executable checks and remaining gaps.

Optional `HostConfig.capabilities` provider for native Amplifier settings and
runtime controls. The generic AHP host remains unaware of Python objects or
Amplifier transcript/configuration files. All runtime calls cross negotiated
ACP `_amplifier/native`; setup calls cross optional `_amplifier/admin`.

```ts
import {AdminConnection,createNativeCapabilities} from '@amplifier/unified-native-capabilities';
const admin = new AdminConnection({
  command:'/owned/amplifier-acp/.venv/bin/amplifier-acp',
  args:['--config','/owned/agent.json'], cwd:'/owned/workspace',
  resolveWorkspace:async context => context.session
    ? (await host.inspectSession(context.session.uri)).workingDirectory
    : '/owned/workspace',
});
const capabilities = createNativeCapabilities({
  nativeControl:(uri,op,args)=>host.nativeControl(uri,op,args),
  nativeAdmin:admin.perform,
  onInvalidate:(topic,scope)=>host.invalidateCapability(topic,scope),
});
// Supply capabilities to HostConfig before listen, with `host` assigned before use.
// Close admin explicitly when the distribution shuts down.
```

The trusted agent config must enable `adminWorkspaceRoots`. A client-provided
workspace remains a selector checked against the resolved trusted context.
Administration never calls session/new. No retries occur after timeout/crash;
the generic host owns durable admission receipts. Clients own editor drafts.

Reads are lazy, single-flight, copied, bounded to 32 cached scopes and 768 KiB per
topic, with a 15-second TTL. Commits invalidate only records; they do not rebuild
unrelated data. Global native administration invalidates affected cached scopes
through the optional public callback. Session execution controls require an
explicit negotiated native control advertisement. Standard ACP config options
remain the client/host's first choice for supported model/mode changes.

## Topic DTOs

- `configuration`: `configuration: {sessionId,plan,modules,capabilities,bundle,...}`,
  numeric `configurationRevision`, and bounded `registry` results. Bundle preview
  and switch selectors live inside that selected session's `configuration`.
- `provider-catalog`: `setup` (original provider/routing manager result), bounded
  per-provider metadata/catalogs and operation receipts; `draftDefaults` contains
  resolved choices keyed by workspace/bundle, never a user's editing state.
- `bundles`: native `bundles`, `registeredBundles`, `bundleDefaults`,
  `bundleDiscovery` when requested. No fabricated catalog when admin is absent.
- `runtime-control`: `runtimeControl[sessionURI][operation]`, plus the existing
  `modelCatalogs` selector. Goals, tasks, budgets, capacity, tools and advanced
  controls use native results without imitating an engine in TypeScript.

Actions use version 1 capability-action schema and durable `commandId`; the
returned `_meta['amplifier.dev/operation'].id` names the completed operation for
legacy UI selectors. Native errors propagate explicitly. Core functionality
works without installing this optional Unified presentation package.

## Validation

`npm test && npm run build`. Set `AMPLIFIER_ACP_PYTHON` to the installed adapter's
Python executable to run the actual upstream ACP SDK/native admin subprocess
test. Without it, that integration test is visibly skipped; it is never replaced
by a fake successful setup. Source tests and offline provider tests do not prove
live OAuth/model/account acceptance.

`actionSchemas()` lazily returns the advertised public action schemas without
opening a native worker or provider. Secret voice credential/configuration
operations are deliberately absent; they are trusted server-only admin calls.
Generic `runtime.control` cannot submit history edits/steering/scheduled or
observational input, relocate execution, run internal memory consolidation, or
bypass the owned process/kernel actions. Those actions need their corresponding
host admission/lifecycle owner. Native adapter support alone does not claim
Unified interactive parity for an unregistered owner. Tool invocation receives
actor provenance from authenticated context, never the argument body. The native
runtime retains its own generic-tool and approval-hook rechecks.

Full mount-plan edits require the native inspect result's opaque
`configuration.configurationRevision` hash as `expectedConfigurationRevision`.
This differs from the outer numeric topic `configurationRevision`. The bridge
passes the exact base through without refreshing/rebasing it and keeps fresh
native plan/revision fields authoritative over older bundle overlays. Native
explicit `configuration-conflict` plus `executed:false` becomes `accepted:false`
with `result:{applied:false,executed:false,reason,configurationRevision,message}`;
the configuration topic is invalidated lazily and the host records a known
refusal. Other transport/native errors still propagate as uncertain outcomes.
The client preserves a dirty draft and requires explicit review before another
apply command. Missing base revisions are known refusals before native mutation.

### Native administration quiescence

One shared `AdminConnection` can cover native settings and maintenance users via
its public `quiescenceParticipant` (default owner ID `native-admin`, configurable
with `AdminOptions.ownerId`). Register it as a required writer participant; map
all native-admin callback paths to that authority. The participant obtains an
actual held native lifecycle lease, including post-response provider sign-in and
cross-process admin writers. A cold connection starts only the passive ACP
adapter to obtain this proof, never a Core session. Legacy agents without the
negotiated lifecycle capability refuse acquisition.

For reviewed native recovery, compose the two independent gates:

```ts
withQuiescenceMaintenance: (input, work) =>
  host.withQuiescenceMaintenance(input, () =>
    admin.withMaintenanceFence(input, work))
```

The recovery callback may then use `admin.perform` on that same connection.
Only the exact matching recovery fence admits the maintenance namespace;
ordinary configuration/generation mutations remain closed. Detached promises
lose this privilege when the trusted callback returns. The trusted reset preview
may pass its already-resolved native history cwd only inside this fence; generic
client administration cannot select native paths.

`inspectLifecycle()` supplies bounded native-owned activity and lease identity.
A participant known refusal means acquisition caused no effect; loss or timeout
retains uncertainty. Release requires the host's authenticated exact proof.
Replacement reconciliation acquires fresh native OS writer proof before release;
a new process alone does not prove an earlier operation completed. Multiple
independent participants for the same native home must be aggregated behind one
shared admin authority rather than trying to hold two exclusive leases.

`AdminOptions.onMayBeIdle` receives advisory recheck notifications when local
request accounting reaches zero and when negotiated native administration reports
that previously busy post-response work has settled. This uses the private
`_amplifier/admin/idle` notification and introduces no periodic polling. The signal
does not grant maintenance authority; always acquire the held participant again.

The exact passive `voice.configuration` operation remains available on this held administration connection. Its credential/configure counterparts receive no such access. Disabled launcher credentials project explicit unavailability; passive media status must not request a credential.

Native maintenance archive-plan requests (`maintenance.archive.create/add/prepare`)
are admitted only through the exact trusted maintenance-fence callback, like snapshot
and reset. `maintenance.archive.manifest` is an explicitly classified passive read
and remains usable under a held admin fence. The adapter never maps these private
operations directly into arbitrary client actions or accepts client-supplied native
paths. Public selected-archive review is supplied by the independent recovery owner.

Trusted history-import composition can call
`admin.importHistory(operation, args, workingDirectory)` after product workspace
authorization. This narrow method permits only `history.import.begin/chunk/preview/commit/receipt`;
the native launcher independently revalidates its configured workspace roots and
`adminHistoryImport` opt-in. It uses the same request, cross-process writer,
quiescence and unknown-outcome accounting as other admin calls. Only exact
`history.import.receipt` remains readable during a held fence. A native ID in a
browser request is never adoption authority; the host must independently inspect
the exact configured engine's committed native receipt. No generic `args.cwd`
reflection is added.

Shared voice defaults use negotiated native `voice.preferences.update` and
`voice.preferences.receipt` through `AdminConnection.perform`. Update arguments
are `{commandId, expectedRevision, patch}`; only the four advertised non-secret
fields are writable. The native result is an exact succeeded/failed/unknown
receipt; `failed` plus `executed:false` is a known refusal, including stale CAS.
The preferences receipt remains a passive read while administration is held.
Credential setup remains separate. `fallbackBehavior: 'stored-only'` explicitly
means automatic transport fallback is not implemented. Unadvertised native
history import or voice preferences are refused before dispatch with typed
`data.executed:false`, rather than inventing an uncertain effect.

Service-stop support is additive and explicitly declared by
`AdminConnection.quiescenceParticipant.serviceStop = {version:1}`. It also requires
the actual configured native peer to negotiate `admin.lifecycle.serviceStop`;
older peers refuse before acquisition. `AdminFenceContext` retains
`serviceIdentity:{installationId,dataScope,ownerId,instanceId,releaseDigest}` only
for `purpose:'service-stop'`. That gate permits no `withMaintenanceFence` work.
External release/reconciliation requires `AdminServiceReleaseProof`, with exact
expected/observed identity and authenticated platform stop-refused or resumed
receipts. The host verifies those receipts; this bridge only checks exact binding.
Only the original live acquired lease supports pre-effect admission rollback.
Reconciliation cannot substitute the `admission-refused` shortcut. Process loss
retains uncertainty, and a new process or open OS lock alone never proves success.

### Scoped file-access editor

Optional `createPermissionsCapabilities({nativeAdmin: admin.perform,onInvalidate})`
provides `permissions.get/save/receipt` through a separately composed provider.
Its `permissions` topic is host-scoped change/capability metadata only:
`data.permissionsCapability = {version:1,available,scopes,limits,application,revision}`.
Clients keep session/scope selection and unsaved edits private, load the selected
scope explicitly, and compare the saved scope's `revision` before saving.
Get arguments are `{scope?,sessionId?}`. Save arguments are
`{scope,sessionId?,expectedRevision,allowed,denied}`; the outer action command ID
is the native command identity. Receipt arguments are `{commandId,sessionId?}`.
Results preserve native exact receipt status; failed pre-effect CAS returns
`accepted:false`, while an unknown result never authorizes effect replay.

Confirmed saves invalidate the single host metadata topic. Get and receipt do
not publish editor selection or trigger invalidation loops. The native launcher
must set `adminPermissions:true`; `AdminConnection` checks the negotiated v1
capability before dispatch, and retains its normal held-intake accounting.
Get/receipt are explicitly read-only even while held. Bind this provider to the
same genuine administration quiescence participant in composition.

Session selectors must match trusted AHP channel/context. Agent saves cannot
change global settings or select another session workspace. Clients cannot pass
native homes, cwd, or arbitrary settings paths. Path entries are preferences for
the native reference tool policy, not generic filesystem or shell authority.
Actual mounted bundle/instance restrictions remain authoritative.

`AdminConnection.maintenanceCapabilities()` returns a cloned initialized
`native.admin.maintenance` value (or undefined if absent). It is passive and
does not mount a worker or scan archive inventories. Full-native/restore callers
must inspect the negotiated nested `archivePlans.fullNative` fields. Restore
preview/apply/reconcile use the exact held recovery maintenance fence;
restore.manifest/restore.inspect are explicitly passive under held intake.

Host-scoped UI permission actions carrying `args.sessionId` require the trusted
`inspectSession: uri => host.inspectSession(uri)` factory callback. The provider
checks the returned identity and binds the authorized workspace before native
dispatch. Missing or foreign selectors never fall back to a default workspace.
Agents still use their own authenticated session channel; a root selector grants
no cross-session authority.

`maintenance.artifact.inspect` is a passive held-gate read for independently
verified full-native immutable archive attestations. It is available through the
existing trusted `perform` port and never grants archive creation/restore rights.

`AdminConnection` forwards the negotiated native `maintenance.cache.scan`,
`page`, `preview`, and `clear` methods. An absent `cacheInventory.version: 1`
marker produces a typed pre-dispatch `executed: false` refusal. Indexed page and
exact receipt reads remain available under a held admin intake. A clear request
requires the caller's trusted `withMaintenanceFence` recovery scope; ordinary
browser calls cannot acquire that authority. Native v1 only clears reviewed,
exactly reconstructible bytecode and never retires source directories. Product
owners must enqueue the work, hold their own intakes, retain the exact command,
and inspect an uncertain receipt without replaying the effect.

The additive `maintenance.capture.acquire/inspect/release` methods require the
negotiated `captureScope.version: 1` marker. Acquire/release run inside the trusted
recovery maintenance scope; inspect is passive under the held intake. Native
capture keeps the original connection's writer exclusion from before full-native
preparation through the external product seal. Exact artifact/manifest bindings
and live inspection are required; an old receipt or replacement connection never
recreates authority. Release binds the externally authenticated product digest or
an explicit aborted outcome. This adapter does not authenticate supervisor stop
receipts or claim that independent product stores were captured.

The optional native `maintenance.appReset` v1 marker enables only the four
`maintenance.appReset.prepare/apply/inspect/restore` routes. Prepare and mutations
require the exact existing recovery `withMaintenanceFence`; detached callbacks,
ordinary browser administration, and older peers refuse before dispatch. Exact
receipt inspection is an explicit passive read while held. No connection is
reopened to repeat uncertain work. `maintenanceCapabilities()` returns a cloned
metadata declaration without reading private settings or starting a session.


### Custom bundle save and activation outcomes

`bundle.save` retains a completed native save when the subsequent `bundle.switch`
needs a model choice, refuses before an effect, or loses its reply. The action
returns `accepted:true` with the original `saved` result and a separate `activation`.
A model choice preserves native `requiresModelChoice`/`preview` and publishes
`configuration.bundleChange.phase = 'needs-model'`; the old mounted bundle remains
current. Explicit native `executed:false` activation errors produce
`activation:{state:'failed',executed:false,reason}` and phase `error`. Other activation
errors produce `activation:{state:'unknown',reason:'activation-outcome-unknown'}`
and phase `unknown`; this path dispatches no automatic retry or provider refresh.
Only a confirmed activation publishes the replacement plan. Clients must inspect
unknown activation before explicitly choosing another effect. This package's
cache is not a durable receipt store. This preserves the delivered action response;
exact recovery of the original saved/activation body after a lost outer reply or
process restart is unqualified. Host command status/detail does not retain that
body. Inspecting current settings or mounted state does not prove the original
command's outcome and never authorizes replay.

For an independent package consumer, set `AMPLIFIER_NATIVE_CAPABILITY_MODULE`
to the installed package's absolute `dist/index.js` path when running the tests.
Provider fixture tests and the actual installed-native presentation test both
consume this entrypoint. The latter checks saved provider opaque fields/redaction,
all five configuration sections, local/project source separation, workspace bundle
defaults and foreign workspace refusal with zero runtime calls. These checks do
not mount the configured fixture modules or qualify browser editors, provider
accounts or model inference.

The opt-in `AMPLIFIER_TEST_NATIVE_APPROVAL=1` installed ACP regression exercises
an approval-backed generic tool for both authenticated origins. At native
`f530e541` the first approved call does not settle: `control` retains the worker
command lock while `approval` requires the same lock. The reproduction refuses to
retry, times out after 15 seconds, retains its owned state and reports its native
session ID. It is visibly skipped by default; enable it explicitly when qualifying a
sealed native successor. Ordinary actual-runtime checks qualify goals, unlimited turn
budgets, context limits, catalog/usage, mode absence and local-only export refusal;
no inference is requested. A local fixture source has no portable Git equivalent,
so the actual export test expects native refusal and verifies no activation.

Set `AMPLIFIER_TEST_PORTABLE_BUNDLE=1` with the native owner's tiny installed
provider-fixture wheel to exercise actual save-and-use. The new fixture omits
private module source paths, applies context limit 7777 through native CAS,
saves the selected plan and activates it exactly once through this bridge.
The installed check verifies the saved body, reloaded native plan, zero model
calls and approved user/agent tools. This synthetic bundle is a test fixture,
not a production package or account acceptance. Without this flag the same
fixture deliberately retains local paths and tests the native export refusal.
