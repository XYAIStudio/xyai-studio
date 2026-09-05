/**
 * 雄元智脑XYOS — 支付回调（渠道直调，无需登录）
 *
 * POST /api/payment/notify/:provider
 * 渠道（虎皮椒等）在用户支付完成后回调本接口；服务端验签后激活订阅。
 */
import { Router, Request, Response } from "express";
import { handleNotify } from "../services/payment";

const router = Router();

router.post("/notify/:provider", async (req: Request, res: Response) => {
  const provider = req.params.provider;
  try {
    const result = await handleNotify(provider, req.body || {});
    // 虎皮椒约定：返回文本 success 表示处理成功
    if (result.ok) return res.send(result.message === "success" ? "success" : result.message);
    res.status(400).send(result.message);
  } catch (err: any) {
    res.status(500).send(`error: ${err.message}`);
  }
});

export const paymentNotifyRoutes = router;
