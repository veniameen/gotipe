import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const outDir = '/Users/veniameen/Projects/gotipe/output/playwright/notion-step1'
await fs.mkdir(outDir, { recursive: true })

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
await page.waitForTimeout(3500)

// Focus page body and create three paragraph blocks.
await page.mouse.click(640, 260)
await page.keyboard.type('qa-line-alpha')
await page.keyboard.press('Enter')
await page.keyboard.type('qa-line-beta')
await page.keyboard.press('Enter')
await page.keyboard.type('qa-line-gamma')
await page.waitForTimeout(400)

const rows = [
  page.locator('text=qa-line-alpha').first(),
  page.locator('text=qa-line-beta').first(),
  page.locator('text=qa-line-gamma').first(),
]

const report = {
  url: page.url(),
  rows: [],
}

for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index]
  const box = await row.boundingBox()
  if (!box) continue
  const targetX = Math.max(16, box.x - 24)
  const targetY = box.y + box.height / 2

  const before = await page.evaluate(({ x, y, rowX }) => {
    const collect = () => {
      const buttons = [...document.querySelectorAll('button,[role=\"button\"]')]
      return buttons
        .map((el) => {
          const rect = el.getBoundingClientRect()
          const style = getComputedStyle(el)
          return {
            text: (el.textContent || '').trim().slice(0, 50),
            aria: el.getAttribute('aria-label') || '',
            title: el.getAttribute('title') || '',
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
            opacity: style.opacity,
            transitionProperty: style.transitionProperty,
            transitionDuration: style.transitionDuration,
            visibility: style.visibility,
          }
        })
        .filter((item) => item.x >= rowX - 120 && item.x <= rowX + 16 && Math.abs(item.y + item.h / 2 - y) < 28)
    }
    const elementsFromPoint = document
      .elementsFromPoint(x, y)
      .slice(0, 8)
      .map((el) => ({
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 120),
        text: (el.textContent || '').trim().slice(0, 40),
      }))
    return { controls: collect(), elementsFromPoint }
  }, { x: targetX, y: targetY, rowX: box.x })

  await page.mouse.move(targetX, targetY)
  await page.waitForTimeout(60)
  const hover60 = await page.evaluate(({ y, rowX }) => {
    const buttons = [...document.querySelectorAll('button,[role=\"button\"]')]
    return buttons
      .map((el) => {
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return {
          text: (el.textContent || '').trim().slice(0, 50),
          aria: el.getAttribute('aria-label') || '',
          title: el.getAttribute('title') || '',
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          opacity: style.opacity,
          transitionProperty: style.transitionProperty,
          transitionDuration: style.transitionDuration,
          visibility: style.visibility,
        }
      })
      .filter((item) => item.x >= rowX - 120 && item.x <= rowX + 16 && Math.abs(item.y + item.h / 2 - y) < 28)
  }, { y: targetY, rowX: box.x })

  await page.waitForTimeout(220)
  const hover280 = await page.evaluate(({ y, rowX }) => {
    const buttons = [...document.querySelectorAll('button,[role=\"button\"]')]
    return buttons
      .map((el) => {
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return {
          text: (el.textContent || '').trim().slice(0, 50),
          aria: el.getAttribute('aria-label') || '',
          title: el.getAttribute('title') || '',
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          opacity: style.opacity,
          transitionProperty: style.transitionProperty,
          transitionDuration: style.transitionDuration,
          visibility: style.visibility,
        }
      })
      .filter((item) => item.x >= rowX - 120 && item.x <= rowX + 16 && Math.abs(item.y + item.h / 2 - y) < 28)
  }, { y: targetY, rowX: box.x })

  await page.screenshot({
    path: path.join(outDir, `controls-row-${index + 1}.png`),
    fullPage: false,
  })

  report.rows.push({
    row: index + 1,
    text: await row.textContent(),
    box,
    before,
    hover60,
    hover280,
  })
}

await fs.writeFile(path.join(outDir, 'controls-inspect.json'), JSON.stringify(report, null, 2))
console.log(`Saved: ${path.join(outDir, 'controls-inspect.json')}`)
await browser.close()
