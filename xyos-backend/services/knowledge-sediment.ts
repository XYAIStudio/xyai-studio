import { dbGet, dbAll, dbRun } from "../db";

// 从消息中提取知识
export function extractKnowledge(message: string, senderName: string, chatId: number, tenantId: number = 1): number {
  let extracted = 0;
  
  // 提取器1：链接提取
  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = message.match(urlPattern);
  if (urls) {
    for (const url of urls) {
      const context = message.substring(Math.max(0, message.indexOf(url) - 50), message.indexOf(url) + url.length + 50);
      saveKnowledge('link', url, context, senderName, chatId, tenantId);
      extracted++;
    }
  }
  
  // 提取器2：代码块提取
  const codePattern = /```(\w*)\n([\s\S]*?)```/g;
  let codeMatch;
  while ((codeMatch = codePattern.exec(message)) !== null) {
    const language = codeMatch[1] || 'text';
    const code = codeMatch[2].trim();
    if (code.length > 20 && code.length < 5000) {
      saveKnowledge('code', code, `语言: ${language}`, senderName, chatId, tenantId);
      extracted++;
    }
  }
  
  // 提取器3：决策提取
  const decisionPatterns = [
    /(?:决定|确认|通过|驳回|批准|同意|方案是|最终方案)[：:]\s*(.+)/,
    /(?:会议决定|决议)[：:]\s*(.+)/,
  ];
  
  for (const pattern of decisionPatterns) {
    const match = message.match(pattern);
    if (match) {
      saveKnowledge('decision', match[0], `决策人: ${senderName}`, senderName, chatId, tenantId);
      extracted++;
    }
  }
  
  return extracted;
}

// 保存知识
function saveKnowledge(type: string, content: string, context: string, senderName: string, chatId: number, tenantId: number): void {
  const title = `${type === 'link' ? '链接' : type === 'code' ? '代码' : '决策'}: ${content.substring(0, 50)}`;
  
  dbRun(
    `INSERT INTO knowledge_notes (title, content, source, tags, company_id, tenant_id)
     VALUES (?, ?, ?, ?, 1, ?)`,
    [title, `${context}\n\n${content}`, `聊天:${chatId} by ${senderName}`, `${type},auto`, tenantId]
  );
  
  // 记录提取日志
  dbRun(
    `INSERT INTO knowledge_sediment_log (chat_id, message_type, content_preview, extracted_count, tenant_id)
     VALUES (?, ?, ?, 1, ?)`,
    [chatId, type, content.substring(0, 100), tenantId]
  );
}

// 获取知识沉淀日志
export function getSedimentLogs(tenantId: number = 1, limit: number = 50): any[] {
  return dbAll(
    "SELECT * FROM knowledge_sediment_log WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?",
    [tenantId, limit]
  );
}
