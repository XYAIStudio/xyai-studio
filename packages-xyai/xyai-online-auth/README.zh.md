---
description: "通过 OAuth 设备授权流把一套桌面安装关联到 www.cnxyai.cn 账号，并把 bearer token 作为 Host 密钥保存。"
kind: "package-reference"
---

# @xyai/dsh-online-auth

[English](README.md) | 中文

## 概述

本包通过 OAuth 设备授权流把一套桌面安装关联到一个 www.cnxyai.cn 账号。Host 申请设备码，运营者在自己已登录的浏览器会话里确认该设备码，Host 再用设备码换取 bearer token；此后每次调用线上 API 都会以 `Authorization: Bearer` 附带该 token。token 是 `xyai-online` 设置命名空间里的 `role('secret')` 字段，因此没有任何线路接口能读回它，浏览器半只能看到被关联的账号。一个设置分区通过本包自己的 Connection RPC 通道 `/xyai-online` 驱动整个流程。

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

在提供 `connection` 与 `settings` 的组合中挂载本包；浏览器半随后在设置里渲染线上账号关联分区。

### 何时选择它

当一套桌面安装必须以某个已有 www.cnxyai.cn 用户的身份行事——同步该账号的授权与插件——并且运营者能完成一次浏览器确认步骤时，选择本包。如果这套安装是销售插件 SKU 并自行结算支付订单，那属于 [@xyai/dsh-commerce](../xyai-commerce/README.zh.md)；如果部署环境根本连不上线上后端，也不要选择本包。

### 最小配置

```yaml
- id: xyai-online-auth
  name: '@xyai/dsh-online-auth'
```

本包没有 Cordis 配置字段。被关联的账号存放在 `xyai-online` 设置命名空间中：`accessToken`（密钥）、`loggedAt`、`userId`、`userName`、`userEmail` 与 `userIsAdmin`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Host 半拥有一个 `OnlineBackend`。它的构造函数在插件自身生命周期上注册 `xyai-online` 命名空间，`apply` 以 `ctx.effect` 注册 `/xyai-online` 通道。每个动词都会重新读取账号分区，因此一个动词的写入无需缓存即可对下一次调用可见。每个请求都是一次 JSON POST，发往 `https://www.cnxyai.cn/app/api/`——流程走 `device.php`，会话走 `auth.php`——后端应答一个扁平的 `{ ok, message, ...fields }` 记录。非 JSON 的响应体会解码为空记录，因此调用方按信封自身字段路由，而不是按传输异常路由。

流程有五个端点。`status` 报告已存的关联状态且不含 token。`device/code` 申请一个新的设备码，并连同用户码、确认地址与有效期一起返回。`device/poll` 用一个设备码换取 bearer token：`authorized` 会把 token 与它所授权的账号一起存下，而 `pending`、`issued`、`denied`、`expired` 与 `invalid` 是卡片据以路由的普通轮询结果，不是失败。`me` 重新校验已存 token，成功时刷新账号，后端拒绝时重置整个分区。`logout` 结束线上会话并丢弃 token，即使后端已经先行失效该会话。

浏览器半在 `ctx.get('connection').rpc.call` 之上构造一个 `call` 闭包，并把它作为业务 face 注入唯一的 `settings.section` 条目。一次失败的 Connection 结果会映射进同一个 `OnlineEnvelope`——`errcode` 携带失败码，`errmsg` 携带原因——因此卡片用同一个字段处理传输拒绝和后端拒绝。卡片渲染四个阶段：空闲、已发码、已关联、失败。

| `/xyai-online` 上的端点 | 信封之外的应答字段 |
|---|---|
| `status` | `baseUrl`、`loggedIn`、`user` |
| `device/code` | `deviceCode`、`userCode`、`verificationUri`、`expiresIn` |
| `device/poll` | `status`、`user` |
| `me` | `user` |
| `logout` | 无 |

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Host 动词、账号命名空间与通道注册 |
| [`src/protocol.ts`](src/protocol.ts) | 通道名、应答信封与被关联账号记录 |
| [`src/client/index.ts`](src/client/index.ts) | 关联卡片与注入的 `call` face |
| [`src/client/locales.ts`](src/client/locales.ts) | `xyaiOnlineAuth` locale 词典 |

</details>

**运行时不变式：** 不发布伴生入口。被关联的账号只属于一个已注册的设置命名空间，每次通道调用只由一个端点应答，因此本包不拥有任何两个独立观测可能分歧的关系。唯一值得检查的边界——线上后端是否仍然承认已存 token——由 `me` 按需重新校验，而不是持续断言。

-----

<a id="further-exploration"></a>
## 进一步探索

- [Connection](../connection/README.zh.md)——经过认证的 RPC 通道与 Host 精确路由。
- [Settings](../../settings/settings/README.zh.md)——命名空间注册表与密钥字段角色。
- [@xyai/dsh-commerce](../xyai-commerce/README.zh.md)——自行结算支付订单的同族 XYAI 插件。
- [客户端组地图](../README.zh.md)——浏览器服务与 UI 功能包。

-----

<a id="model-experience"></a>
## 模型体验

无。本包只把一套安装关联到一个线上账号，不注册任何面向模型的内容。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

以下限制适用于账号关联本身。

- **只有一个规范线上源**：Host 调用 `https://www.cnxyai.cn/app/api/`，也就是本包设备流契约据以验证的源；指向其他后端需要一个本包尚未声明的 Cordis `Config` 字段。
- **token 携带后端的完整权限范围**：本包按签发原样保存 bearer token，从不收窄它，因此吊销由线上后端决定。
- **没有 token 刷新**：`me` 报告会话失效时，Host 重置整个账号分区，运营者需要重走设备流。
- **轮询由运营者触发**：卡片在运营者按下确认按钮时才用设备码换 token，不按定时器轮询，因此浏览器里完成的授权会在下一次按下时被取走。
- **卡片正文只有简体中文**：`xyaiOnlineAuth` 词典拥有分区标签，而卡片正文通过 `React.createElement` 子节点渲染中文字面量，`verify-client-ui-i18n` 不检查这一形式。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
