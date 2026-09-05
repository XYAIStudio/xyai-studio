/**
 * 飞书机器人 Webhook 推送服务
 * 用于合同进度款到期预警 + 智能助手对话日志推送
 */

interface FeishuPaymentAlert {
  contractTitle: string;
  contractNo: string;
  direction: "receivable" | "payable";
  partyB: string;
  paymentLabel: string;
  amount: number;
  dueDate: string;
  daysLeft: number;
}

interface AssistantLogData {
  sessionId: string;
  ip: string;
  city: string;
  region: string;
  country: string;
  messageCount: number;
  leadCaptured: boolean;
  leadInfo?: { phone?: string; email?: string; name?: string; company?: string } | null;
  messages: { role: string; text?: string; content?: string }[];
}

/** 智能助手对话日志推送到飞书 */
export async function sendAssistantLog(webhook: string, data: AssistantLogData): Promise<void> {
  try {
    const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const location = [data.country, data.region, data.city].filter(Boolean).join(" ") || "未知";
    const leadStatus = data.leadCaptured
      ? `✅ 已留资（${data.leadInfo?.phone || data.leadInfo?.email || "有联系方式"}）`
      : "❌ 未留资";

    // 对话摘要（最后10条）
    const recentMsgs = data.messages.slice(-10);
    const summaryLines = recentMsgs.map((m: any) => {
      const role = m.role === "user" ? "👤 访客" : "🤖 小雄";
      const text = (m.text || m.content || "").replace(/\n/g, " ").slice(0, 80);
      return `${role}：${text}`;
    });

    const cardContent = [
      `⏰ 时间：${now}`,
      `🌐 IP：${data.ip}`,
      `📍 位置：${location}`,
      `💬 对话轮次：${data.messageCount} 条`,
      `📊 留资状态：${leadStatus}`,
      `🔗 会话ID：${data.sessionId.slice(0, 8)}...`,
      `---`,
      `📝 对话摘要：`,
      ...summaryLines,
    ].join("  \n");

    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "interactive",
        card: {
          header: {
            title: { tag: "plain_text", content: `📊 智能助手 · 新对话` },
            template: data.leadCaptured ? "green" : "blue",
          },
          elements: [
            {
              tag: "div",
              text: { tag: "lark_md", content: cardContent },
            },
            data.leadCaptured ? {
              tag: "note",
              elements: [{ tag: "plain_text", content: "⚠️ 请及时跟进留资线索" }],
            } : null,
          ].filter(Boolean),
        },
      }),
    });

    if (!resp.ok) {
      console.error(`[飞书] 助手日志推送失败: ${resp.status} ${resp.statusText}`);
    }
  } catch (err: any) {
    console.error(`[飞书] 助手日志推送异常: ${err.message}`);
  }
}

export async function sendPaymentAlert(webhook: string, data: FeishuPaymentAlert): Promise<void> {
  const directionLabel = data.direction === "payable" ? "应付预警" : "应收预警";
  const directionEmoji = data.direction === "payable" ? "📤" : "📥";

  try {
    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "interactive",
        card: {
          header: {
            title: { tag: "plain_text", content: `⚠️ ${directionLabel}` },
            template: data.direction === "payable" ? "orange" : "blue",
          },
          elements: [
            {
              tag: "div",
              text: {
                tag: "lark_md",
                content: [
                  `${directionEmoji} **${data.contractTitle}**`,
                  `合同编号：${data.contractNo}`,
                  `对方：${data.partyB}`,
                  `付款节点：${data.paymentLabel}`,
                  `金额：¥${(data.amount / 10000).toFixed(2)}万`,
                  `到期日：${data.dueDate}（${data.daysLeft}天后）`,
                  `---`,
                  `请及时${data.direction === "payable" ? "安排付款" : "跟进收款"}`,
                ].join("  \n"),
              },
            },
          ],
        },
      }),
    });

    if (!resp.ok) {
      console.error(`[飞书] 推送失败: ${resp.status} ${resp.statusText}`);
    }
  } catch (err: any) {
    console.error(`[飞书] 推送异常: ${err.message}`);
  }
}
