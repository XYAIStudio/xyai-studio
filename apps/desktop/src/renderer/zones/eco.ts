/**
 * 生态空间 — full-bleed webview to https://cnxy.ai
 */

const ECO_URL = 'https://cnxy.ai';
let mounted = false;
let loaded = false;

export function mountEcoZone(root: HTMLElement): { activate: () => void } {
  if (!mounted) {
    mounted = true;
    root.innerHTML = '';
    root.classList.add('zone-embed');
    const webview = document.createElement('webview') as HTMLElement & {
      src: string;
    };
    webview.id = 'eco-webview';
    webview.className = 'zone-webview';
    webview.setAttribute('partition', 'persist:eco');
    webview.setAttribute('allowpopups', 'true');
    root.appendChild(webview);
  }

  function activate(): void {
    const webview = document.getElementById('eco-webview') as
      | (HTMLElement & { src: string })
      | null;
    if (!webview) return;
    if (!loaded) {
      webview.src = ECO_URL;
      loaded = true;
    }
  }

  return { activate };
}
