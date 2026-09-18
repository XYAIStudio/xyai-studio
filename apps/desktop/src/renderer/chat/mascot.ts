/**
 * XYAI 小精灵 — cute robot mascot poses for empty transcript / about.
 */

export const MASCOT_POSES = [
  'wave',
  'thumbs',
  'hearts',
  'idea',
  'think',
] as const;

export type MascotPose = (typeof MASCOT_POSES)[number];

export const MASCOT_CYCLE_MS = 3500;

export function mascotSrc(pose: MascotPose): string {
  return `./assets/mascot/${pose}.png`;
}

export const LOGO_SRC = './assets/logo.png';

export const EMPTY_TAGLINE = '我是 XYAI 小精灵，随时帮你写代码～';

export const EMPTY_HINT =
  '开始一段对话。支持多轮上下文与流式输出；生成中可点「停止」。Enter 发送，Shift+Enter 换行。';

/** Build empty-state DOM with cycling mascot; returns disposer for interval. */
export function mountEmptyMascot(container: HTMLElement): () => void {
  container.className = 'empty empty-mascot';

  const stage = document.createElement('div');
  stage.className = 'mascot-stage';
  stage.setAttribute('aria-hidden', 'true');

  const imgs: HTMLImageElement[] = [];
  for (let i = 0; i < MASCOT_POSES.length; i++) {
    const pose = MASCOT_POSES[i]!;
    const img = document.createElement('img');
    img.className = 'mascot-frame' + (i === 0 ? ' is-active' : '');
    img.src = mascotSrc(pose);
    img.alt = '';
    img.draggable = false;
    imgs.push(img);
    stage.appendChild(img);
  }

  const tagline = document.createElement('p');
  tagline.className = 'empty-tagline';
  tagline.textContent = EMPTY_TAGLINE;

  const hint = document.createElement('p');
  hint.className = 'empty-hint';
  hint.textContent = EMPTY_HINT;

  container.appendChild(stage);
  container.appendChild(tagline);
  container.appendChild(hint);

  let idx = 0;
  const timer = window.setInterval(() => {
    imgs[idx]!.classList.remove('is-active');
    idx = (idx + 1) % imgs.length;
    imgs[idx]!.classList.add('is-active');
  }, MASCOT_CYCLE_MS);

  return () => {
    window.clearInterval(timer);
  };
}
