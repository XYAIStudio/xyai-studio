import { expect, it } from 'vitest'
import { HERO_LAYOUT_CSS } from '../src/client/hero-layout.ts'
import { en, zh } from '../src/client/locales.ts'

it('hides the official DSH headline without hashed CSS-module class names', () => {
  expect(HERO_LAYOUT_CSS).not.toMatch(/p[A-Za-z0-9]{5,}_/)
  expect(HERO_LAYOUT_CSS).toContain('[data-xyai-hero-welcome]')
  expect(HERO_LAYOUT_CSS).toContain('span:has([data-xyai-hero-welcome]) + span')
  expect(HERO_LAYOUT_CSS).toContain('display: none !important')
  expect(HERO_LAYOUT_CSS).toContain('[data-slot="root"] ~ [data-dsh-boot]')
})

it('owns the hero kicker in the brand locale dictionaries', () => {
  expect(en['brand.heroKicker']).toBe('Desktop development workspace')
  expect(zh['brand.heroKicker']).toBe('桌面开发工作台')
})
