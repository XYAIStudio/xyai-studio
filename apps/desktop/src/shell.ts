/**
 * XYAI Studio desktop — 窗口 shell 页（纯蓝渐变顶栏 + 三空间 + 内置浏览器 + 关于我们）。
 *
 * 结构：
 *   ┌───────────────────────────────────────────────────────────────────────────┐
 *   │ 纯蓝渐变顶栏                                                               │
 *   │ XYAI Studio │ 开发空间 │ 业务空间 │ 生态空间 │ 🌐 浏览器 │ 关于我们 │
 *   ├───────────────────────────────────────────────────────────────────────────┤
 *   │   WebContentsView（dsh / xyos / eco / browser / about 五视图，主进程切换）    │
 *   └───────────────────────────────────────────────────────────────────────────┘
 * 切换/导航通过 preload 暴露的 window.xyosShell 走 IPC。
 */

export const SHELL_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #eaf6ff; overflow: hidden; }
  #bar {
    height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 6px;
    padding: 0 152px 0 12px;
    position: relative; overflow: hidden;
    background: linear-gradient(180deg, #3f8fe4 0%, #5aa8e9 54%, #8fc9f2 100%);
    -webkit-app-region: drag; user-select: none;
    box-shadow: 0 1px 8px rgba(21,101,192,0.35);
  }
  /* 左侧导航分组（品牌 + 空间标签） */
  #nav-left { position: relative; z-index: 2; display: flex; align-items: center; gap: 6px; }
  #brand { position: relative; z-index: 2; color: #ffffff; font-weight: 800; font-size: 14px; margin-right: 14px; letter-spacing: .4px; text-shadow: 0 1px 3px rgba(21,101,192,0.5); }
  .tab {
    position: relative; z-index: 2; padding: 6px 16px; border-radius: 14px;
    color: #ffffff; font-size: 13px; cursor: pointer; -webkit-app-region: no-drag;
    transition: background .15s, color .15s; text-shadow: 0 1px 2px rgba(13,71,161,0.55);
    white-space: nowrap;
  }
  .tab:hover { background: rgba(13,71,161,0.38); }
  .tab.active { background: #1565c0; color: #ffffff; font-weight: 600; box-shadow: 0 2px 6px rgba(13,71,161,0.45); }
  #nav-right { position: relative; z-index: 2; display: flex; align-items: center; gap: 6px; -webkit-app-region: no-drag; }
  #theme-toggle {
    padding: 5px 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.45);
    background: rgba(13,71,161,0.28); color: #ffffff; font-size: 12px; font-weight: 600;
    cursor: pointer; white-space: nowrap; text-shadow: 0 1px 2px rgba(13,71,161,0.55);
  }
  #theme-toggle:hover { background: rgba(13,71,161,0.5); }
  #theme-toggle:focus { outline: 2px solid #fff; outline-offset: 2px; }
</style>
</head>
<body>
  <div id="bar">
    <div id="nav-left">
      <span id="brand">XYAI Studio</span>
      <span id="tab-dev" class="tab active" onclick="switchSpace('dev')">开发空间</span>
      <span id="tab-biz" class="tab" onclick="switchSpace('biz')">业务空间</span>
      <span id="tab-eco" class="tab" onclick="switchSpace('eco')">生态空间</span>
      <span id="tab-browser" class="tab" onclick="switchSpace('browser')">🌐 浏览器</span>
    </div>
    <div id="nav-right">
      <button type="button" id="theme-toggle" aria-label="切换明暗主题" title="切换明暗主题">🌙 暗色</button>
      <span id="tab-about" class="tab" onclick="switchSpace('about')">关于我们</span>
    </div>
  </div>
<script>
  function switchSpace(space) {
    if (window.xyosShell) window.xyosShell.switch(space)
  }
  function paint(space) {
    document.getElementById('tab-dev').className = 'tab' + (space === 'dev' ? ' active' : '')
    document.getElementById('tab-biz').className = 'tab' + (space === 'biz' ? ' active' : '')
    document.getElementById('tab-eco').className = 'tab' + (space === 'eco' ? ' active' : '')
    document.getElementById('tab-browser').className = 'tab' + (space === 'browser' ? ' active' : '')
    document.getElementById('tab-about').className = 'tab' + (space === 'about' ? ' active' : '')
  }
  function paintTheme(state) {
    var btn = document.getElementById('theme-toggle')
    if (!btn || !state) return
    var dark = !!state.dark
    var preference = state.preference || 'system'
    if (preference === 'system') btn.textContent = dark ? '☀️ 跟随·暗' : '🌙 跟随·亮'
    else btn.textContent = dark ? '☀️ 亮色' : '🌙 暗色'
    btn.title = '外观：' + (preference === 'system' ? '跟随系统' : (preference === 'dark' ? '手动暗色' : '手动亮色'))
      + '（当前' + (dark ? '暗色' : '亮色') + '）。点击切换：跟随系统 → 亮色 → 暗色'
  }
  document.getElementById('theme-toggle').onclick = function () {
    if (window.xyosShell && window.xyosShell.cycleTheme) window.xyosShell.cycleTheme()
  }
  if (window.xyosShell) {
    if (window.xyosShell.onSpaceChange) window.xyosShell.onSpaceChange(paint)
    if (window.xyosShell.getTheme) window.xyosShell.getTheme().then(paintTheme)
    if (window.xyosShell.onThemeChange) window.xyosShell.onThemeChange(paintTheme)
  }
</script>
</body>
</html>`
