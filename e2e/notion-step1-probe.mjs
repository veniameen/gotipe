import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const url = 'https://www.notion.so/3065ab020ff680b7b379c78bb0e7504d?source=copy_link'
const outDir = '/Users/veniameen/Projects/gotipe/output/playwright/notion-step1'

await fs.mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  storageState: '/Users/veniameen/Projects/gotipe/output/playwright/notion-app-storage.json',
  viewport: { width: 1440, height: 960 },
})
const page = await context.newPage()

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForTimeout(5000)

const bodyText = (await page.locator('body').innerText()).slice(0, 800)

const buttonsBefore = await page.$$eval('button', (elements) =>
  elements
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
        display: style.display,
        visibility: style.visibility,
      }
    })
    .filter((item) => item.text || item.aria || item.title)
    .slice(0, 200),
)

await page.mouse.move(180, 260)
await page.waitForTimeout(350)

const buttonsAfterHover = await page.$$eval('button', (elements) =>
  elements
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
        display: style.display,
        visibility: style.visibility,
      }
    })
    .filter((item) => (item.text || item.aria || item.title) && item.x < 280)
    .slice(0, 200),
)

await page.screenshot({
  path: path.join(outDir, 'probe.png'),
  fullPage: false,
})

const report = {
  currentUrl: page.url(),
  bodyText,
  buttonsBefore,
  buttonsAfterHover,
}

await fs.writeFile(path.join(outDir, 'probe.json'), JSON.stringify(report, null, 2))

console.log(`Saved: ${path.join(outDir, 'probe.json')}`)
console.log(`Screenshot: ${path.join(outDir, 'probe.png')}`)

await browser.close()
