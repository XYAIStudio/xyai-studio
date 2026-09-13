---
description: "XunHuPay Alipay checkout, plugin-market licensing, the XYAI franchise price hierarchy, and the HQ and channel commerce consoles for one installation."
kind: "package-reference"
---

# @xyai/dsh-commerce

English | [中文](README.zh.md)

## Summary

This package gives one installation a XunHuPay (虎皮椒) Alipay checkout, a plugin-market license ledger, the XYAI franchise price hierarchy, and the merchant configuration surfaces behind them. An operator fills in the merchant appid, AppSecret, callback domain, invoicing subject, and price levels from the browser settings sections; a buyer pays through the checkout card; the gateway's asynchronous callback settles the order and grants or extends the plugin license. Every merchant value lives in a registered `settings` namespace and every secret is a `role('secret')` field, so no wire surface reads a secret back. The browser half reaches the Host verbs over this package's own Connection RPC channel, `/xyai-commerce`.

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

Mount the package in a composition that provides `connection` and `settings`; the browser half then renders the HQ console, the channel workspace, checkout, the plugin market, and six merchant settings sections.

### When to choose it

Choose this package when one installation sells XYAI plugin SKUs through channels and has to settle Alipay orders in its own Host process. Avoid it when the installation only needs to link an existing www.cnxyai.cn account — that is [@xyai/dsh-online-auth](../xyai-online-auth/README.md) — or when payment stays on a separate website backend, where only the callback module is worth reusing.

### Minimal configuration

```yaml
- id: xyai-commerce
  name: '@xyai/dsh-commerce'
```

The package has no Cordis configuration fields. Merchant values are `settings` namespaces the settings sections edit: `xyai-payment`, `xyai-channel`, `xyai-invoice`, `xyai-invoice-merchant`, `xyai-sys-config`, `xyai-price`, and `xyai-plugin-license`. The optional callback route appears only in a composition that also provides `webServer`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half owns one `CommerceBackend`. Its constructor registers the seven settings namespaces on the plugin's own lifetime, and each verb reads its section afresh, so a settings write is visible to the next channel call without a cache. `apply` registers the `/xyai-commerce` channel as a `ctx.effect` and, through an optional `webServer` injection, mounts `PAYMENT_NOTIFY_PATH` (`/xyai/payment/notify`) as an exact route: the gateway authenticates that delivery with its own signature rather than a browser session, so it sits outside the reserved `/api` channel.

The callback module owns verification and settle dispatch. The signature drops `hash` and every empty field, sorts the remaining keys by ASCII, joins them as `k=v&...`, appends the merchant AppSecret, and takes the lowercase MD5. An authentic delivery reporting `status === 'OD'` runs the settle handler and answers `success` with HTTP 200; every other delivery answers `fail` with HTTP 400 so the gateway keeps retrying. A settle failure stays retryable and is never reported to the gateway. Settling matches the order id `PLG-<id>-<ts>` to a SKU, falls back to the payer-visible order title, and grants or extends that SKU's license; the same order never extends a license twice.

The pricing module owns the franchise price hierarchy. 出厂价 `factoryPrice` is the channel's procurement cost, 指导价 `suggestPrice` is what a direct XYAI buyer sees, and 渠道销售价 `channelPrice` is the channel's own price. The margin-protection rule clamps the XYAI direct discount to `suggestPrice - factoryPrice`, so the direct price never undercuts the channel's margin band, and clamps the channel's total discount to its own margin over the factory price. A third-party SKU sells direct and splits its list price between developer and platform at a per-SKU share defaulting to 20%.

The browser half builds one `call` closure over `ctx.get('connection').rpc.call` and injects it into ten slot entries as their business face. A failed Connection result maps into the same `CommerceEnvelope` — `errcode` carries the failure code and `errmsg` the message — so a card routes a transport refusal and a business refusal through one field. Settings cards read their stored answer once on mount and open prefilled.

| Endpoint group | Verbs on `/xyai-commerce` |
|---|---|
| `pay` | `pay/create`, `pay/verify`, `pay/config/get`, `pay/config/set`, `pay/account/get`, `pay/account/set` |
| `invoice` | `invoice/subject/get`, `invoice/subject/set`, `invoice/model`, `invoice/merchant/get`, `invoice/merchant/set` |
| `sys` and `stats` | `sys/config/get`, `sys/config/set`, `stats/get` |
| `price` | `price/save`, `price/get`, `price/compute`, `price/plugin-split` |
| `plugin` | `plugin/market`, `plugin/license/get`, `plugin/grant` |

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Host verbs, settings namespaces, channel registration, and the callback route |
| [`src/protocol.ts`](src/protocol.ts) | channel name, callback path, and the shared answer envelope |
| [`src/pricing.ts`](src/pricing.ts) | franchise price hierarchy, margin protection, and plugin revenue split |
| [`src/xunhupay-notify.ts`](src/xunhupay-notify.ts) | callback signature, verification, and settle dispatch |
| [`src/client/index.ts`](src/client/index.ts) | browser consoles, settings sections, and the injected `call` face |
| [`src/client/locales.ts`](src/client/locales.ts) | the `xyaiCommerce` locale dictionary |

</details>

**Runtime invariant:** No companion is published. Each merchant value belongs to one registered settings namespace and each channel call is answered by one endpoint, so the package owns no relationship two independent observations can diverge on.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Connection](../connection/README.md) — authenticated RPC channels and exact Host routes.
- [Settings](../../settings/settings/README.md) — the namespace registry and secret field roles.
- [Web server](../../host/webserver/README.md) — exact HTTP routes below the browser origin.
- [Client group map](../README.md) — browser services and UI feature packages.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package moves merchant configuration, orders, and licenses between the browser and the Host and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits apply to the commerce surfaces themselves.

- **Settlement reads one deployment backend** — `stats/get` fetches `{baseUrl}/api/xyai/stats` from the configured `xyai-sys-config` base URL, defaulting to `https://www.cnxy.tech`; a deployment without that backend renders empty consoles.
- **Orders and commissions are not persisted locally** — the Host grants and extends licenses in `xyai-plugin-license`, while paid-order and commission rows stay in the deployment backend.
- **Alipay only** — `pay/create` builds one XunHuPay Alipay order; WeChat Pay, Stripe, refunds, and reconciliation are not implemented.
- **Card bodies are Simplified Chinese only** — the `xyaiCommerce` dictionary owns the ten slot labels, while the console and settings card bodies render Chinese literals through `React.createElement` children, which `verify-client-ui-i18n` does not inspect.
- **One merchant per installation** — a single set of settings namespaces holds one merchant configuration, so per-channel isolation is not implemented.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
