/**
 * IMA 知识库 OpenAPI 客户端（Node 版）
 * 规范来源：https://ima.qq.com/agent-interface（ima_api_ref.md）
 *
 * 协议：HTTP POST JSON，Base Path /openapi/wiki/v1/
 * 认证：Header ima-openapi-clientid + ima-openapi-apikey
 * 响应：{code, msg, data}，code=0 成功，code≠0 直接把 msg 展示给用户
 * 翻页：cursor 首次传空，is_end/next_cursor 控制
 */
const IMA_BASE = "https://ima.qq.com/openapi/wiki/v1/";

export interface ImaKnowledgeBase {
  id: string;
  name: string;
  cover_url?: string;
  description?: string;
}

export interface ImaKnowledgeItem {
  media_id: string;
  title: string;
  parent_folder_id?: string;
}

/** 可拉取文本的媒体类型（网页2/公众号6/Markdown7/TXT13/Excel5）；PDF1/Word3/PPT4/图片9/录音15 等二进制或笔记类型跳过 */
const TEXT_MEDIA_TYPES = new Set([2, 5, 6, 7, 13]);

async function imaFetch(
  clientId: string,
  apiKey: string,
  endpoint: string,
  payload: Record<string, unknown>
): Promise<any> {
  const res = await fetch(`${IMA_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ima-openapi-clientid": clientId,
      "ima-openapi-apikey": apiKey,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/** 列出当前用户有权限访问的知识库（get_addable_knowledge_base_list，自动翻页） */
export async function listImaKnowledgeBases(clientId: string, apiKey: string): Promise<ImaKnowledgeBase[]> {
  const bases: ImaKnowledgeBase[] = [];
  let cursor = "";
  for (let page = 0; page < 10; page++) {
    const data = await imaFetch(clientId, apiKey, "get_addable_knowledge_base_list", { cursor, limit: 50 });
    if (data.code !== 0) throw new Error(data.msg || "连接 IMA 失败（请检查 API Key 与 ClientID）");
    const list = data.data?.addable_knowledge_base_list ?? [];
    bases.push(...list);
    if (data.data?.is_end !== false) break;
    cursor = data.data?.next_cursor ?? "";
    if (!cursor) break;
  }
  return bases;
}

/** 浏览知识库内容（get_knowledge_list，自动翻页） */
export async function listImaKnowledgeItems(
  clientId: string,
  apiKey: string,
  knowledgeBaseId: string
): Promise<ImaKnowledgeItem[]> {
  const items: ImaKnowledgeItem[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const data = await imaFetch(clientId, apiKey, "get_knowledge_list", {
      cursor, limit: 50, knowledge_base_id: knowledgeBaseId,
    });
    if (data.code !== 0) throw new Error(data.msg || "浏览知识库失败");
    items.push(...(data.data?.knowledge_list ?? []));
    if (data.data?.is_end !== false) break;
    cursor = data.data?.next_cursor ?? "";
    if (!cursor) break;
  }
  return items;
}

/** 获取单个媒体的文本内容（get_media_info → url_info.url → 下载文本）
 * 返回 null 表示该媒体类型不可文本拉取（PDF/Word/图片等，需在 ima 客户端查看） */
export async function getImaMediaContent(
  clientId: string,
  apiKey: string,
  mediaId: string
): Promise<string | null> {
  const info = await imaFetch(clientId, apiKey, "get_media_info", { media_id: mediaId });
  if (info.code !== 0) throw new Error(info.msg || "获取媒体信息失败");

  const mediaType: number = info.data?.media_type;
  if (!TEXT_MEDIA_TYPES.has(mediaType)) return null;

  const urlInfo = info.data?.url_info;
  const url: string | undefined = urlInfo?.url;
  if (!url) return null;

  const headers: Record<string, string> = urlInfo?.headers || {};
  const res = await fetch(url, { headers: Object.keys(headers).length ? headers : undefined });
  if (!res.ok) return null;
  const text = await res.text();
  const trimmed = text.replace(/\0/g, "").trim();
  return trimmed ? trimmed.slice(0, 50000) : null;
}
