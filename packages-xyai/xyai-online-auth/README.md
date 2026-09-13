---
description: "Link one desktop installation to a www.cnxyai.cn account through the OAuth device authorization flow, storing the bearer token as a Host secret."
kind: "package-reference"
---

# @xyai/dsh-online-auth

English | [中文](README.zh.md)

## Summary

This package links one desktop installation to a www.cnxyai.cn account through the OAuth device authorization flow. The Host requests a device code, the operator confirms that code in a browser session they already hold, and the Host exchanges the code for a bearer token; every later online API call attaches the token as `Authorization: Bearer`. The token is a `role('secret')` field in the `xyai-online` settings namespace, so no wire surface reads it back and the browser half only ever sees the linked account. One settings section drives the whole flow over this package's own Connection RPC channel, `/xyai-online`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the package in a composition that provides `connection` and `settings`; the browser half then renders the online-account link section inside settings.

### When to choose it

Choose this package when a desktop installation has to act as one existing www.cnxyai.cn user — syncing that account's authorizations and plugins — and the operator can complete a browser confirmation step. Avoid it when the installation sells plugin SKUs and settles its own payment orders, which is [@xyai/dsh-commerce](../xyai-commerce/README.md), or when the deployment has no reachable online backend at all.

### Minimal configuration

```yaml
- id: xyai-online-auth
  name: '@xyai/dsh-online-auth'
```

The package has no Cordis configuration fields. The linked account lives in the `xyai-online` settings namespace: `accessToken` (secret), `loggedAt`, `userId`, `userName`, `userEmail`, and `userIsAdmin`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half owns one `OnlineBackend`. Its constructor registers the `xyai-online` namespace on the plugin's own lifetime, and `apply` registers the `/xyai-online` channel as a `ctx.effect`. Each verb reads the account section afresh, so a write by one verb is visible to the next call without a cache. Every request is one JSON POST to `https://www.cnxyai.cn/app/api/` — `device.php` for the flow and `auth.php` for the session — and the backend answers a flat `{ ok, message, ...fields }` record. A response body that is not JSON decodes to an empty record, so the caller routes on the envelope's own fields rather than on a transport exception.

The flow has five endpoints. `status` reports the stored link state without the token. `device/code` requests one fresh device code and returns it with the user code, the confirmation URI, and its lifetime. `device/poll` exchanges one device code for a bearer token: `authorized` stores the token with the account it authorized, while `pending`, `issued`, `denied`, `expired`, and `invalid` are ordinary poll outcomes the card routes on rather than failures. `me` revalidates the stored token, refreshing the account on success and resetting the whole section when the backend rejects it. `logout` ends the online session and forgets the token even when the backend already dropped the session.

The browser half builds one `call` closure over `ctx.get('connection').rpc.call` and injects it into a single `settings.section` entry as its business face. A failed Connection result maps into the same `OnlineEnvelope` — `errcode` carries the failure code and `errmsg` the message — so the card routes a transport refusal and a backend refusal through one field. The card renders four stages: idle, code issued, linked, and failed.

| Endpoint on `/xyai-online` | Answer beyond the envelope |
|---|---|
| `status` | `baseUrl`, `loggedIn`, `user` |
| `device/code` | `deviceCode`, `userCode`, `verificationUri`, `expiresIn` |
| `device/poll` | `status`, `user` |
| `me` | `user` |
| `logout` | none |

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host verbs, the account namespace, and channel registration |
| [`src/protocol.ts`](src/protocol.ts) | channel name, answer envelope, and the linked-account record |
| [`src/client/index.ts`](src/client/index.ts) | the link card and the injected `call` face |
| [`src/client/locales.ts`](src/client/locales.ts) | the `xyaiOnlineAuth` locale dictionary |

</details>

**Runtime invariant:** No companion is published. The linked account belongs to one registered settings namespace and each channel call is answered by one endpoint, so the package owns no relationship two independent observations can diverge on. The one boundary worth checking — whether the online backend still honors the stored token — is revalidated by `me` on demand rather than asserted continuously.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Connection](../connection/README.md) — authenticated RPC channels and exact Host routes.
- [Settings](../../settings/settings/README.md) — the namespace registry and secret field roles.
- [@xyai/dsh-commerce](../xyai-commerce/README.md) — the sibling XYAI plugin that settles its own payment orders.
- [Client group map](../README.md) — browser services and UI feature packages.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package links one installation to an online account and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits apply to the account link itself.

- **One canonical online origin** — the Host calls `https://www.cnxyai.cn/app/api/`, the origin whose device-flow contract this package was verified against; pointing at another backend needs a Cordis `Config` field this package does not declare.
- **The token carries the backend's full scope** — the package stores the bearer token as issued and never narrows it, so revocation is the online backend's decision.
- **No token refresh** — when `me` reports an invalid session the Host resets the whole account section and the operator repeats the device flow.
- **Polling is operator-driven** — the card exchanges the device code when the operator presses the confirm button; it does not poll on a timer, so an authorization completed in the browser is picked up by the next press.
- **Card bodies are Simplified Chinese only** — the `xyaiOnlineAuth` dictionary owns the section label, while the card body renders Chinese literals through `React.createElement` children, which `verify-client-ui-i18n` does not inspect.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
