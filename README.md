# Unified native capabilities

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
