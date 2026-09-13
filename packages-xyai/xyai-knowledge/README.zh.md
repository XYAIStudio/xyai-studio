---
description: "XYAI 知识库 provider：本地抽取、Ollama 蒸馏、ima 元数据浏览和对话检索。"
kind: "package-reference"
---

# @xyai/dsh-knowledge

[English](README.md) | 中文

## 概要

Host 把本地目录挂接为只读来源，抽取支持的文档，并把文本和结构化语义产物写入 `$DSH_HOME/xyai-studio/knowledge/v1/<mount-id>`。它通过真实生成请求实测已安装的 Ollama 模型并选择吞吐量最高者；没有模型响应时，抽取文本保留为 `extracted` 状态，不会被误报成已经蒸馏。

ima provider 通过官方 OpenAPI 校验凭据，把每个挂接的凭据保存到 DSH credential provider，并且只持久化文件元数据。Client 按需逐级浏览云端文件夹，不解析文件。对话调用 `knowledge_search` 时，如果 ima 检索没有返回正文高亮，Host 会通过 provider 的签名内容地址临时读取命中文件，在内存中解析支持的文本、PDF 和 DOCX，并把有长度限制的片段通过 DSH 已记录日志的工具路径返回。云端正文不会作为本地知识库产物持久化。

Client 注册 DSH 设置页、对话页和壳层浮层入口。总览、本地挂接向导、ima 连接向导、来源详情、文件状态、预览、刷新、改名和解除挂接操作均调用经过认证的 Host RPC。

## 配置

`artifactRoot` 可覆盖应用解析产物根目录；留空时使用 `$DSH_HOME/xyai-studio/knowledge/v1`。`maxFileBytes` 和 `maxFiles` 限制单次扫描。目录遍历没有应用层级上限，拒绝符号链接，同时仍受操作系统路径长度和权限约束。

`ollamaEndpoint`、`benchmarkTimeoutMs`、`modelTimeoutMs`、`distillChunkChars` 和 `maxBenchmarkModels` 控制真实本地模型执行。`cloudEndpoint`、`cloudTimeoutMs`、`cloudPageSize`、`cloudContentBytes` 和 `cloudHydrateLimit` 控制 ima 调用及受限的按需正文读取。默认地址为本机 Ollama 和 `https://ima.qq.com/openapi/wiki/v1`。

支持的本地文件包括 UTF 文本类（`.txt`、`.md`、`.json`、`.csv`）、DOCX 正文以及有可抽取文字层的 PDF。每个语义 JSON 记录源文件指纹、所选模型及实测结果、蒸馏时间，以及分块摘要、关键词、主题、实体和问题。

## 操作

| 操作 | 行为 |
| --- | --- |
| `precheck` / `mountLocal` | 校验可读取目录并创建带所有者标记的应用解析产物目录。 |
| `scan` / `retry` | 同步本地文件，抽取文本，实测本地模型，并蒸馏已变更或未完成文档。 |
| `tree` / `preview` | 逐层浏览本地目录，读取受所有者校验保护的抽取或语义产物。 |
| `imaTest` / `mountIma` | 校验凭据、列出可见知识库，并持久化只含元数据的挂接。 |
| `refreshIma` / `cloudList` | 刷新根目录元数据或逐级浏览云端文件夹，不下载文件正文。 |
| `rename` / `unmount` | 更新或删除登记；本地源文件和解析产物保留，解除 ima 时删除对应凭据。 |

## 模型体验

`knowledge_search` 对模型可见，并由 DSH 工具运行时记入日志。本地结果来自应用目录中的抽取文本；ima 结果优先使用远程检索高亮，当 ima 只返回命中文件名时，再通过临时签名地址读取支持的文件并在内存中抽取受限片段。工具结果标明 provider、挂接、文档、标题、来源位置和来源片段。

#### KV Cache 影响

每次检索结果作为普通工具结果文本进入当前模型上下文。本地结果最多二十条且片段长度受限；ima 返回页由云端控制。

## 安全和生命周期

源目录不会被写入、移动或删除。每次读取和写入解析产物都会重新校验所有者标记和路径包含关系。凭据不会进入 Client 快照或设置文档。扫描会串行化变更，在文件之间让出事件循环，持久化文档进度，并在插件卸载前等待任务结束。

## 限制

本地检索目前使用抽取文本子串匹配。OCR、图片型 PDF、DOCX 之外的 Office 格式、嵌入向量、向量排序、文件系统监听和经过所有者校验的解析产物删除尚未包含。ima 实际验收需要目标账号颁发的凭据，本地蒸馏需要运行中的 Ollama 服务和至少一个可响应模型。
