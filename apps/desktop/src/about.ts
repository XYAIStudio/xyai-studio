/**
 * XYAI Studio desktop — 关于我们页面（天蓝过渡蓝渐变 + 毛玻璃质感，风格对齐 https://cnxy.ai 国际站）。
 *
 * 页面以「XYAI 生态」为主题，介绍四个站点：
 *   1. cnxy.ai        — XYAI 国际站
 *   2. www.cnxyai.com — XYAI Labs 中国站
 *   3. www.cnxyai.cn  — XYAI Studio 雄元智能工作站
 *   4. ai.cnxy.tech   — XYAI 生态伙伴链接中枢
 */

export const ABOUT_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    color: #0b3a66;
    overflow-x: hidden;
    overflow-y: auto;
    background: linear-gradient(165deg, #2b87de 0%, #4aa8ef 34%, #7ecaf6 68%, #d9f1ff 100%);
  }
  /* 装饰光斑（毛玻璃底下的柔光） */
  .blob { position: fixed; border-radius: 50%; filter: blur(80px); opacity: .55; pointer-events: none; z-index: 0; }
  .blob.b1 { width: 460px; height: 460px; left: -140px; top: -140px; background: #cfeaff; }
  .blob.b2 { width: 560px; height: 560px; right: -180px; top: 16%; background: #7ecaf6; }
  .blob.b3 { width: 400px; height: 400px; left: 32%; bottom: -160px; background: #eaf7ff; }
  .logo {
    position: fixed; top: 24px; left: 28px; width: 72px; height: 72px; object-fit: contain;
    filter: drop-shadow(0 2px 10px rgba(13,71,161,.28)); z-index: 2;
  }
  .wrap { position: relative; z-index: 1; max-width: 1040px; margin: 0 auto; padding: 60px 28px 76px; }
  .hero { text-align: center; margin-bottom: 46px; }
  .hero .badge {
    display: inline-block; padding: 6px 18px; border-radius: 999px;
    background: rgba(255,255,255,.22); border: 1px solid rgba(255,255,255,.42);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    color: #fff; font-size: 13px; letter-spacing: 2px;
  }
  .hero h1 { margin: 20px 0 14px; font-size: 44px; font-weight: 800; color: #fff; letter-spacing: 1px; text-shadow: 0 2px 18px rgba(13,71,161,.4); }
  .hero p { font-size: 15px; color: rgba(255,255,255,.94); line-height: 1.8; max-width: 660px; margin: 0 auto; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
  .card {
    position: relative; border-radius: 20px; padding: 28px 28px 26px;
    background: rgba(255,255,255,.16);
    border: 1px solid rgba(255,255,255,.36);
    backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
    box-shadow: 0 12px 32px rgba(13,71,161,.18), inset 0 1px 0 rgba(255,255,255,.55);
    transition: transform .18s ease, box-shadow .18s ease;
  }
  .card:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(13,71,161,.28), inset 0 1px 0 rgba(255,255,255,.55); }
  .card .top { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
  .card h2 { font-size: 20px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(13,71,161,.45); }
  .card .tag {
    font-size: 11px; padding: 3px 10px; border-radius: 999px; color: #1565c0;
    background: rgba(255,255,255,.72); font-weight: 600; white-space: nowrap;
  }
  .card p { font-size: 14px; line-height: 1.8; color: rgba(255,255,255,.96); }
  .card a {
    display: inline-block; margin-top: 18px; font-size: 13px; color: #fff;
    text-decoration: none; padding: 8px 18px; border-radius: 999px;
    background: rgba(21,101,192,.55); border: 1px solid rgba(255,255,255,.38);
    transition: background .15s ease, transform .15s ease;
  }
  .card a:hover { background: rgba(21,101,192,.82); }
  .foot { text-align: center; margin-top: 48px; font-size: 12.5px; color: rgba(255,255,255,.82); letter-spacing: .5px; }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .hero h1 { font-size: 30px; } }
</style>
</head>
<body>
  <div class="blob b1"></div>
  <div class="blob b2"></div>
  <div class="blob b3"></div>
  <img class="logo" src="__LOGO__" alt="XYAI" onerror="this.style.display='none'" />
  <div class="wrap">
    <div class="hero">
      <span class="badge">ABOUT · 关于我们</span>
      <h1>XYAI 生态</h1>
      <p>面向全球开发者与生态伙伴的可信智能系统生态，覆盖国际站、中国站、智能工作站与生态伙伴链接中枢。</p>
    </div>
    <div class="grid">
      <div class="card">
        <div class="top"><h2>XYAI 国际站</h2><span class="tag">国际站</span></div>
        <p>面向国际开发者和生态资源贡献者，今后将单独开发中英文多语言版本。</p>
        <a href="https://cnxy.ai/">cnxy.ai</a>
      </div>
      <div class="card">
        <div class="top"><h2>XYAI Labs 中国站</h2><span class="tag">中国站</span></div>
        <p>面向国内各类生态伙伴，承接行业经验向可信智能系统转化的编译及服务功能。</p>
        <a href="https://www.cnxyai.com/">www.cnxyai.com</a>
      </div>
      <div class="card">
        <div class="top"><h2>XYAI Studio 雄元智能工作站</h2><span class="tag">智能工作站</span></div>
        <p>集成开发空间 DeepSeek Harness、业务空间雄元智脑 XYOS、生态空间：人工智能联合实验室 XYAI Labs、浏览器为一体的 web H5、APP、桌面端等多端工具。</p>
        <a href="https://www.cnxyai.cn/">www.cnxyai.cn</a>
      </div>
      <div class="card">
        <div class="top"><h2>XYAI 生态伙伴链接中枢</h2><span class="tag">链接中枢</span></div>
        <p>XYAI 生态伙伴链接中枢。</p>
        <a href="https://ai.cnxy.tech/">ai.cnxy.tech</a>
      </div>
    </div>
    <div class="foot">XYAI Studio · 可信智能系统</div>
  </div>
</body>
</html>`
