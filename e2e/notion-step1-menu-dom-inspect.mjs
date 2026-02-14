import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const outDir = '/Users/veniameen/Projects/gotipe/output/playwright/notion-step1'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const jsonPath = path.join(outDir, `menu-dom-inspect-${stamp}.json`)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  storageState: '/Users/veniameen/Projects/gotipe/output/playwright/notion-app-storage.json',
  viewport: { width: 1440, height: 960 },
})
const page = await context.newPage()
await page.goto('https://www.notion.so/3065ab020ff680b7b379c78bb0e7504d?source=copy_link', {
  waitUntil: 'domcontentloaded',
  timeout: 120000,
})
await page.waitForTimeout(3000)

await page.mouse.click(760, 860)
await page.keyboard.type('/text')
await page.waitForTimeout(150)
await page.keyboard.press('Enter')
await page.keyboard.type('menu-dom-inspect')
await page.keyboard.press('Enter')
await page.keyboard.press('Enter')
await page.keyboard.type('/')
await page.waitForTimeout(280)

const data = await page.evaluate(() => {
  const sel = window.getSelection()
  const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
  let caret = null
  if (range) {
    range.collapse(true)
    const r = range.getBoundingClientRect()
    caret = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }

  const probePoints = [
    caret ? { x: caret.x + 8, y: Math.max(24, caret.y - 260) } : { x: 520, y: 520 },
    caret ? { x: caret.x + 24, y: Math.max(40, caret.y - 200) } : { x: 550, y: 560 },
    { x: 520, y: 500 },
    { x: 560, y: 540 },
  ]

  const atPoint = probePoints.map((p) => {
    const stack = document.elementsFromPoint(p.x, p.y).slice(0, 8)
    return {
      point: p,
      stack: stack.map((el) => {
        const rect = el.getBoundingClientRect()
        return {
          tag: el.tagName,
          role: el.getAttribute('role') || '',
          aria: el.getAttribute('aria-label') || '',
          className: (el.className || '').toString().slice(0, 140),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          bg: getComputedStyle(el).backgroundColor,
          border: getComputedStyle(el).borderColor,
        }
      }),
    }
  })

  return { caret, atPoint }
})

await page.screenshot({ path: path.join(outDir, `menu-dom-inspect-${stamp}.png`), fullPage: false })
await fs.writeFile(jsonPath, JSON.stringify(data, null, 2))
console.log(`Saved: ${jsonPath}`)

await browser.close()
