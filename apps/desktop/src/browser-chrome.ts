/**
 * XYAI Studio desktop — 内置浏览器工具栏（chrome）页。
 *
 * 提供类 Chrome 的浏览器常用能力：
 *   - 多标签页（新建 / 切换 / 关闭）
 *   - 后退 / 前进 / 刷新 / 主页
 *   - 地址栏（回车导航）
 *   - 收藏夹（收藏 / 取消 / 点击打开）
 *
 * 工具栏为本地 data URL，通过 preload 暴露的 window.xyosBrowser 与主进程通信，
 * 主进程再通过 `xyos:browser-state` 事件把标签/收藏夹状态推送给本页。
 */

export const BROWSER_CHROME_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 13px; color: #1f3a5f; user-select: none;
    background: linear-gradient(180deg, #f2f8ff 0%, #e7f2fd 100%);
    border-bottom: 1px solid #d4e4f7;
  }
  #tabstrip { display: flex; align-items: flex-end; height: 36px; padding: 4px 8px 0; gap: 4px; }
  #tabs { display: flex; align-items: center; gap: 4px; overflow-x: auto; flex: 1; min-width: 0; height: 32px; }
  #tabs::-webkit-scrollbar { height: 0; }
  .tab {
    display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto;
    max-width: 200px; height: 30px; padding: 0 8px 0 12px; border-radius: 9px 9px 0 0;
    background: rgba(173,205,240,.55); color: #274b73; cursor: pointer; position: relative;
    border: 1px solid #cfe0f4; border-bottom: none;
  }
  .tab.active { background: #ffffff; color: #1457a0; font-weight: 600; }
  .tab .ttl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
  .tab .x {
    display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px;
    border-radius: 50%; font-size: 13px; line-height: 1; color: #5b7ea6;
  }
  .tab .x:hover { background: rgba(20,87,160,.15); color: #1457a0; }
  #new-tab {
    flex: 0 0 auto; width: 28px; height: 28px; border-radius: 8px; border: none;
    background: transparent; color: #3b6ea5; font-size: 18px; cursor: pointer; line-height: 1;
  }
  #new-tab:hover { background: rgba(20,87,160,.12); }

  #navrow { display: flex; align-items: center; gap: 4px; height: 42px; padding: 0 10px; }
  #navrow button {
    min-width: 30px; height: 30px; padding: 0 8px; border: none; border-radius: 8px;
    background: transparent; color: #3b6ea5; font-size: 15px; cursor: pointer;
  }
  #navrow button:hover { background: rgba(20,87,160,.12); }
  #navrow button:disabled { opacity: .35; cursor: default; }
  #navrow button:disabled:hover { background: transparent; }
  #url {
    flex: 1; height: 32px; margin: 0 4px; padding: 0 14px; border: 1px solid #d3e3f6;
    border-radius: 16px; background: #ffffff; color: #16324f; font-size: 13px; outline: none;
  }
  #url:focus { border-color: #5aa0ec; box-shadow: 0 0 0 2px rgba(90,160,236,.25); }
  #star { font-size: 18px; color: #b7c9df; }
  #star.on { color: #f5a623; }

  #bookmarks { display: flex; align-items: center; gap: 4px; height: 34px; padding: 0 10px 4px; overflow-x: auto; }
  #bookmarks::-webkit-scrollbar { height: 0; }
  .bm {
    display: inline-flex; align-items: center; gap: 3px; flex: 0 0 auto; height: 26px;
    padding: 0 6px 0 10px; border-radius: 13px; background: rgba(20,87,160,.10);
    color: #2b5c93; cursor: pointer; white-space: nowrap;
  }
  .bm:hover { background: rgba(20,87,160,.18); }
  .bm .bm-x { color: #7fa3c7; font-size: 14px; padding: 0 2px; }
  .bm .bm-x:hover { color: #d23c3c; }
</style>
</head>
<body>
  <div id="tabstrip">
    <div id="tabs"></div>
    <button id="new-tab" title="新建标签页">＋</button>
  </div>
  <div id="navrow">
    <button id="back" title="后退">←</button>
    <button id="forward" title="前进">→</button>
    <button id="reload" title="刷新">⟳</button>
    <button id="home" title="主页">⌂</button>
    <input id="url" type="text" placeholder="输入网址，回车访问" spellcheck="false" autocomplete="off" />
    <button id="star" title="收藏当前页面">☆</button>
  </div>
  <div id="bookmarks"></div>

<script>
  var input = document.getElementById('url');
  var starBtn = document.getElementById('star');
  var tabsEl = document.getElementById('tabs');
  var bmEl = document.getElementById('bookmarks');
  var urlFocused = false;
  var state = { tabs: [], bookmarks: [], activeUrl: '', canGoBack: false, canGoForward: false };

  input.addEventListener('focus', function () { urlFocused = true; });
  input.addEventListener('blur', function () { urlFocused = false; });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var v = input.value.trim();
      if (v) window.xyosBrowser.navigate(v);
    }
  });
  document.getElementById('back').onclick = function () { window.xyosBrowser.back(); };
  document.getElementById('forward').onclick = function () { window.xyosBrowser.forward(); };
  document.getElementById('reload').onclick = function () { window.xyosBrowser.reload(); };
  document.getElementById('home').onclick = function () { window.xyosBrowser.home(); };
  document.getElementById('new-tab').onclick = function () { window.xyosBrowser.newTab(); };
  starBtn.onclick = function () {
    var starred = state.bookmarks.some(function (b) { return b.url === state.activeUrl; });
    if (starred) window.xyosBrowser.removeBookmark(state.activeUrl);
    else window.xyosBrowser.addBookmark();
  };

  function render() {
    renderTabs(); renderBookmarks(); renderNav();
  }
  function renderTabs() {
    tabsEl.innerHTML = '';
    state.tabs.forEach(function (t) {
      var el = document.createElement('div');
      el.className = 'tab' + (t.active ? ' active' : '');
      el.title = t.url || '';
      var ttl = document.createElement('span');
      ttl.className = 'ttl';
      ttl.textContent = t.title || t.url || '新标签页';
      el.appendChild(ttl);
      var x = document.createElement('span');
      x.className = 'x';
      x.textContent = '×';
      x.onclick = function (ev) { ev.stopPropagation(); window.xyosBrowser.closeTab(t.id); };
      el.appendChild(x);
      el.onclick = function () { window.xyosBrowser.activateTab(t.id); };
      tabsEl.appendChild(el);
    });
  }
  function renderBookmarks() {
    bmEl.innerHTML = '';
    state.bookmarks.forEach(function (b) {
      var el = document.createElement('span');
      el.className = 'bm';
      el.title = b.url;
      var a = document.createElement('span');
      a.textContent = b.title;
      el.appendChild(a);
      var x = document.createElement('span');
      x.className = 'bm-x';
      x.textContent = '×';
      x.onclick = function (ev) { ev.stopPropagation(); window.xyosBrowser.removeBookmark(b.url); };
      el.appendChild(x);
      el.onclick = function () { window.xyosBrowser.openBookmark(b.url); };
      bmEl.appendChild(el);
    });
  }
  function renderNav() {
    document.getElementById('back').disabled = !state.canGoBack;
    document.getElementById('forward').disabled = !state.canGoForward;
    var starred = state.bookmarks.some(function (b) { return b.url === state.activeUrl; });
    starBtn.textContent = starred ? '★' : '☆';
    starBtn.className = starred ? 'on' : '';
    if (!urlFocused) input.value = state.activeUrl;
  }

  if (window.xyosBrowser && window.xyosBrowser.onState) {
    window.xyosBrowser.onState(function (s) { state = s; render(); });
  }
</script>
</body>
</html>`
