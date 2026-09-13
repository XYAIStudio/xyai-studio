---
description: "为单套安装提供虎皮椒支付宝收银台、插件市场授权、XYAI 加盟价格体系，以及总部与渠道商业化控制台。"
kind: "package-reference"
---

# @xyai/dsh-commerce

[English](README.md) | 中文

## 概述

本包为单套安装提供虎皮椒（XunHuPay）支付宝收银台、插件市场授权台账、XYAI 加盟价格体系，以及其背后的商户配置界面。运营者在浏览器设置分区里填写商户 appid、AppSecret、回调域名、开票主体与价格档位；购买者通过收银台卡片付款；网关的异步回调完成订单结算并发放或延长插件授权。每个商户值都存放在已注册的 `settings` 命名空间中，每个密钥都是 `role('secret')` 字段，因此没有任何线路接口能读回密钥。浏览器半通过本包自己的 Connection RPC 通道 `/xyai-commerce` 访问 Host 动词。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在提供 `connection` 与 `settings` 的组合中挂载本包；浏览器半随后渲染总部控制台、渠道工作台、收银台、插件市场以及六个商户设置分区。

### 何时选择它

当一套安装需要通过渠道销售 XYAI 插件 SKU，并且必须在自己的 Host 进程里结算支付宝订单时选择本包。如果这套安装只需要关联已有的 www.cnxyai.cn 账号——那属于 [@xyai/dsh-online-auth](../xyai-online-auth/README.zh.md)——或者支付留在独立的网站后端上（此时只有回调模块值得复用），就不要选择本包。

### 最小配置

```yaml
- id: xyai-commerce
  name: '@xyai/dsh-commerce'
```

本包没有 Cordis 配置字段。商户值是设置分区编辑的 `settings` 命名空间：`xyai-payment`、`xyai-channel`、`xyai-invoice`、`xyai-invoice-merchant`、`xyai-sys-config`、`xyai-price` 与 `xyai-plugin-license`。可选的回调路由只在同时提供 `webServer` 的组合中出现。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Host 半拥有一个 `CommerceBackend`。它的构造函数在插件自身生命周期上注册七个设置命名空间，每个动词都会重新读取自己的分区，因此一次设置写入无需缓存即可对下一次通道调用可见。`apply` 以 `ctx.effect` 注册 `/xyai-commerce` 通道，并通过可选的 `webServer` 注入把 `PAYMENT_NOTIFY_PATH`（`/xyai/payment/notify`）挂载为精确路由：网关用自身的签名而不是浏览器会话来认证这次投递，因此该路由位于保留通道 `/api` 之外。

回调模块负责验签与结算派发。签名会丢弃 `hash` 和所有空字段，按 ASCII 排序剩余键，拼成 `k=v&...`，直接追加商户 AppSecret，再取小写 MD5。一次真实且报告 `status === 'OD'` 的投递会执行结算处理并以 HTTP 200 应答 `success`；其他任何投递都以 HTTP 400 应答 `fail`，让网关继续重试。结算失败保持可重试，且从不上报给网关。结算会把订单号 `PLG-<id>-<ts>` 匹配到一个 SKU，匹配不到时退回付款可见的订单标题，再发放或延长该 SKU 的授权；同一订单不会二次延长授权。

定价模块负责加盟价格体系。出厂价 `factoryPrice` 是渠道的进货成本，指导价 `suggestPrice` 是 XYAI 直销买家看到的价格，渠道销售价 `channelPrice` 由渠道自己设定。利润带保护规则会把 XYAI 直销优惠额夹紧到 `suggestPrice - factoryPrice`，使直销价不会击穿渠道的利润带；同时把渠道的优惠总额夹紧到它相对出厂价的自身毛利。三方 SKU 走直销，其定价按每 SKU 可配、默认 20% 的比例在开发者与平台之间分成。

浏览器半在 `ctx.get('connection').rpc.call` 之上构造一个 `call` 闭包，并把它作为业务 face 注入十个 slot 条目。一次失败的 Connection 结果会映射进同一个 `CommerceEnvelope`——`errcode` 携带失败码，`errmsg` 携带原因——因此卡片用同一个字段处理传输拒绝和业务拒绝。设置卡片在挂载时读取一次已存值，并以预填状态打开。

| 端点分组 | `/xyai-commerce` 上的动词 |
|---|---|
| `pay` | `pay/create`、`pay/verify`、`pay/config/get`、`pay/config/set`、`pay/account/get`、`pay/account/set` |
| `invoice` | `invoice/subject/get`、`invoice/subject/set`、`invoice/model`、`invoice/merchant/get`、`invoice/merchant/set` |
| `sys` 与 `stats` | `sys/config/get`、`sys/config/set`、`stats/get` |
| `price` | `price/save`、`price/get`、`price/compute`、`price/plugin-split` |
| `plugin` | `plugin/market`、`plugin/license/get`、`plugin/grant` |

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Host 动词、设置命名空间、通道注册与回调路由 |
| [`src/protocol.ts`](src/protocol.ts) | 通道名、回调路径与共享应答信封 |
| [`src/pricing.ts`](src/pricing.ts) | 加盟价格体系、利润带保护与插件收入分成 |
| [`src/xunhupay-notify.ts`](src/xunhupay-notify.ts) | 回调签名、验签与结算派发 |
| [`src/client/index.ts`](src/client/index.ts) | 浏览器控制台、设置分区与注入的 `call` face |
| [`src/client/locales.ts`](src/client/locales.ts) | `xyaiCommerce` locale 词典 |

</details>

**运行时不变式：** 不发布伴生入口。每个商户值只属于一个已注册的设置命名空间，每次通道调用只由一个端点应答，因此本包不拥有任何两个独立观测可能分歧的关系。

-----

<a id="further-exploration"></a>
## 进一步探索

- [Connection](../connection/README.zh.md)——经过认证的 RPC 通道与 Host 精确路由。
- [Settings](../../settings/settings/README.zh.md)——命名空间注册表与密钥字段角色。
- [Web server](../../host/webserver/README.zh.md)——浏览器源之下的精确 HTTP 路由。
- [客户端组地图](../README.zh.md)——浏览器服务与 UI 功能包。

-----

<a id="model-experience"></a>
## 模型体验

无。本包只在浏览器与 Host 之间传输商户配置、订单与授权，不注册任何面向模型的内容。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

以下限制适用于商业化界面本身。

- **结算只读取一个部署后端**：`stats/get` 从已配置的 `xyai-sys-config` 基础地址请求 `{baseUrl}/api/xyai/stats`，默认值为 `https://www.cnxy.tech`；没有该后端的部署会渲染空控制台。
- **订单与佣金不在本地持久化**：Host 在 `xyai-plugin-license` 中发放并延长授权，而已付款订单行与佣金行仍留在部署后端。
- **只支持支付宝**：`pay/create` 只构造一个虎皮椒支付宝订单；微信支付、Stripe、退款与对账均未实现。
- **卡片正文只有简体中文**：`xyaiCommerce` 词典拥有十个 slot 标签，而控制台与设置卡片正文通过 `React.createElement` 子节点渲染中文字面量，`verify-client-ui-i18n` 不检查这一形式。
- **一套安装一个商户**：一组设置命名空间只承载一份商户配置，因此未实现按渠道隔离。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
