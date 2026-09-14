/**
 * Hero layout that does not depend on hashed CSS-module class names.
 *
 * XYAI welcome occupies `conversation.hero.brand.mark` inside DSH EmptyHero's
 * fish hitbox. Adjacent official headline + preview badge stay in the next
 * sibling span. Selectors key off `[data-xyai-hero-welcome]` so a rebuilt
 * `HeroShell.module.css` hash cannot restore the double headline.
 */

/** Injected `<style>` text for the XYAI welcome hero and leftover boot hide. */
export const HERO_LAYOUT_CSS = `
span:has([data-xyai-hero-welcome]) {
  display: flex !important;
  flex: 1 1 100% !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  justify-content: center;
  align-items: center;
}
div:has(> span:has([data-xyai-hero-welcome])) {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center;
  width: 100% !important;
  min-width: 0 !important;
  flex-wrap: nowrap !important;
}
span:has([data-xyai-hero-welcome]) + span {
  display: none !important;
}
[data-xyai-hero-welcome] {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 280px;
  max-width: 640px;
  margin: 0 auto;
  padding: 4px 16px 8px;
  box-sizing: border-box;
  text-align: center;
  writing-mode: horizontal-tb;
  white-space: normal;
  word-break: normal;
  overflow-wrap: break-word;
}
[data-xyai-hero-welcome] [data-xyai-hero-kicker] {
  font-size: 12px;
  letter-spacing: 0.12em;
  opacity: 0.75;
  white-space: nowrap;
}
[data-xyai-hero-welcome] [data-xyai-hero-title] {
  font-size: 22px;
  line-height: 1.3;
  font-weight: 800;
}
[data-xyai-hero-welcome] [data-xyai-hero-slogan] {
  display: block;
  font-size: 13.5px;
  line-height: 1.8;
  opacity: 0.85;
  max-width: 560px;
  white-space: normal;
  word-break: normal;
}
[data-slot="root"] ~ [data-dsh-boot],
[data-dsh-boot]:has(~ [data-slot="root"]),
[data-slot="root"] [data-dsh-boot] {
  display: none !important;
}
`
