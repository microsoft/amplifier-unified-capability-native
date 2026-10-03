# Native capability bridge vision

This repository presents Amplifier configuration and runtime controls to Unified
clients through optional, negotiated capabilities. A person or agent should be
able to inspect the intended session, make an authorized scoped change, and tell
what was saved, what is mounted, and what still needs input or inspection.

## Direction and authority

This is a local expression of the [approved family direction](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/docs/architecture/VISION.md),
ratified on 2026-10-02. The [repository map](https://github.com/microsoft/amplifier-unified/blob/625af2f2832fafc8152f6078061d626f160362a4/docs/architecture/repositories.md)
assigns this owner the optional product bridge to native administration and
runtime controls. This document introduces no new family obligation or scope.
The [local v1 contract](../contracts/native-bridge.v1.md) maps that inherited
direction to public inputs, consumers and falsifiable checks. Passing those
checks does not ratify a new design or prove product adoption.

## Desired outcomes

- Preserve modular providers, bundles, tools, hooks, contexts and loops behind the
  full Core/Foundation adapter. Present supported controls faithfully and explain
  unsupported optional capabilities.
- Keep authenticated session/workspace authority and native ownership intact.
  User and agent actions reach the same authorized native operations; an argument
  cannot impersonate the actor or grant another session's authority.
- Keep saved preferences, effective configuration and mounted runtime distinct.
  A completed bundle save remains visible when activation needs a model choice,
  refuses, or becomes unknown. Recovery inspects the original outcome without replay.
- Load only the selected topic/scope, bound resident caches, and invalidate lazily.
  Private editing state remains with the client.

## Scope and ownership

This package owns product capability manifests, action schemas, bounded topic
projections, and the trusted administration connection/fence adapter.
`amplifier-app-acp` owns native schemas, settings, credentials, composition,
execution and canonical history. The host owns authorization, durable admission
and result receipts. Clients own drafts, widgets, devices and renderers. The
independent recovery owner orchestrates held maintenance; the distribution owns
composition, releases and deployment.

A second native settings/execution authority, a substitute lightweight engine,
a private fork of AHP/ACP, direct client filesystem access, global app snapshots,
implicit unknown-effect retries, and unapproved feature retirement are outside
this repository's purpose. Open parity and acceptance gaps remain explicit in
the local contract rather than redefining these outcomes around passing tests.
