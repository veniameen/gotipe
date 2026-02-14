import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const outDir = '/Users/veniameen/Projects/gotipe/output/playwright/notion-step1'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const tag = `turn${Date.now().toString().slice(-6)}`
const screenshotsDir = path.join(outDir, `turn-into-${stamp}`)
await fs.mkdir(screenshotsDir, { recursive: true })

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

const shot = async (name) => {
  const file = path.join(screenshotsDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  return file
}

await page.mouse.click(760, 860)
await page.keyboard.type(`${tag}-source-line`)
await page.waitForTimeout(200)
const source = page.locator(`text=${tag}-source-line`).first()
await source.waitFor({ state: 'visible', timeout: 12000 })
const box = await source.boundingBox()

if (!box) throw new Error('source block box not found')

const snapshotBlock = async () =>
  page.evaluate((needle) => {
    const blocks = [...document.querySelectorAll('.notion-selectable')]
    const block = blocks.find((el) => (el.textContent || '').includes(needle))
    if (!block) return null
    const rect = block.getBoundingClientRect()
    const headingLeaf = block.querySelector('h1,h2,h3')
    const computed = getComputedStyle((headingLeaf || block))
    const hasCheckbox = !!block.querySelector('input[type=\"checkbox\"]')
    return {
      className: (block.className || '').toString(),
      text: (block.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      hasCheckbox,
      headingTag: headingLeaf?.tagName || null,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    }
  }, `${tag}-source-line`)

const rowY = box.y + box.height / 2
const plusX = Math.max(20, box.x - 42)
const handleX = Math.max(24, box.x - 20)

await page.mouse.move(handleX, rowY)
await page.waitForTimeout(140)
await shot('01-hover')
const beforeTransform = await snapshotBlock()

await page.mouse.click(handleX, rowY)
await page.waitForTimeout(220)
await shot('02-menu-open')

const hasTurnInto = (await page.getByText('Turn into', { exact: true }).count()) > 0
if (!hasTurnInto) {
  // Fallback: sometimes first click hits "+", try the handle once more.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(80)
  await page.mouse.move(handleX + 10, rowY)
  await page.waitForTimeout(100)
  await page.mouse.click(handleX + 10, rowY)
  await page.waitForTimeout(240)
}

const menuItems = await page.evaluate(() =>
  [...document.querySelectorAll('div[role=\"menuitem\"],button[role=\"menuitem\"],div[role=\"option\"]')]
    .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 120),
)

if ((await page.getByText('Turn into', { exact: true }).count()) > 0) {
  await page.getByText('Turn into', { exact: true }).first().click()
  await page.waitForTimeout(140)
  await page.getByText('Heading 2', { exact: true }).first().click()
  await page.waitForTimeout(280)
  await shot('03-turned-heading2')
  var afterHeading2 = await snapshotBlock()

  await page.mouse.move(handleX, rowY)
  await page.waitForTimeout(120)
  await page.mouse.click(handleX, rowY)
  await page.waitForTimeout(220)
  await page.getByText('Turn into', { exact: true }).first().click()
  await page.waitForTimeout(120)
  await page.getByText('To-do list', { exact: true }).first().click()
  await page.waitForTimeout(260)
  await shot('04-turned-todo')
  var afterTodo = await snapshotBlock()
}

const summary = {
  tag,
  pageUrl: page.url(),
  sourceBox: box,
  clickPoints: { plusX, handleX, rowY },
  beforeTransform,
  afterHeading2: typeof afterHeading2 === 'undefined' ? null : afterHeading2,
  afterTodo: typeof afterTodo === 'undefined' ? null : afterTodo,
  menuItems,
  screenshotsDir,
}

const jsonPath = path.join(outDir, `turn-into-${stamp}.json`)
await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2))
console.log(`Saved: ${jsonPath}`)
console.log(`Screenshots: ${screenshotsDir}`)

await browser.close()
