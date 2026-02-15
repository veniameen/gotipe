import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const pageUrl =
  process.env.NOTION_PAGE_URL ||
  'https://www.notion.so/heading-1-3065ab020ff680b7b379c78bb0e7504d'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const tag = `s2r${Date.now().toString().slice(-6)}`
const outDir = '/Users/veniameen/Projects/gotipe/output/playwright/notion-step2'
const screenshotsDir = path.join(outDir, `row-transition-${stamp}`)
await fs.mkdir(screenshotsDir, { recursive: true })

const report = {
  startedAt: new Date().toISOString(),
  pageUrl,
  runTag: tag,
  markers: {
    alpha: `${tag}-line-alpha`,
    beta: `${tag}-line-beta`,
    gamma: `${tag}-line-gamma`,
  },
  steps: [],
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  storageState: '/Users/veniameen/Projects/gotipe/output/playwright/notion-app-storage.json',
  viewport: { width: 1440, height: 960 },
})
const page = await context.newPage()

async function shot(name) {
  const file = path.join(screenshotsDir, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  return file
}

async function getTextBox(text, timeout = 12000) {
  const loc = page.locator(`text=${text}`).first()
  try {
    await loc.waitFor({ state: 'visible', timeout })
    const box = await loc.boundingBox()
    return box ? { locator: loc, box } : null
  } catch {
    return null
  }
}

async function collectControlsAt(rowX, rowY) {
  return page.evaluate(({ x, y }) => {
    const controls = [...document.querySelectorAll('button,[role="button"]')]
      .map((el) => {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        return {
          aria: el.getAttribute('aria-label') || '',
          text: (el.textContent || '').trim().slice(0, 40),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          opacity: s.opacity,
          transitionDuration: s.transitionDuration,
          transitionProperty: s.transitionProperty,
        }
      })
      .filter((item) => Math.abs(item.y + item.h / 2 - y) < 28 && item.x <= x + 20 && item.x >= x - 120)

    return controls
  }, { x: rowX, y: rowY })
}

async function sample(label, rowX, rowY, screenshotName) {
  const controls = await collectControlsAt(rowX, rowY)
  const screenshot = await shot(screenshotName)
  report.steps.push({
    label,
    row: { x: Math.round(rowX), y: Math.round(rowY) },
    controls,
    screenshot,
  })
}

await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForTimeout(4500)
await shot('01-opened')

// Seed deterministic plain rows for hover-transition sampling.
await page.mouse.click(760, 860)
await page.keyboard.type(report.markers.alpha)
await page.keyboard.press('Enter')
await page.keyboard.type(report.markers.beta)
await page.keyboard.press('Enter')
await page.keyboard.type(report.markers.gamma)
await page.waitForTimeout(260)
await shot('02-seeded-rows')

const alpha = await getTextBox(report.markers.alpha)
const beta = await getTextBox(report.markers.beta)
const gamma = await getTextBox(report.markers.gamma)
if (!alpha?.box || !beta?.box || !gamma?.box) {
  throw new Error('Failed to locate seeded rows for transition audit')
}

const row = (box) => ({
  textX: box.x,
  y: box.y + box.height / 2,
  gutterX: Math.max(20, box.x - 22),
})

const rA = row(alpha.box)
const rB = row(beta.box)
const rC = row(gamma.box)

// A: move into row A gutter and sample reveal.
await page.mouse.move(1200, 120)
await page.waitForTimeout(80)
await sample('A-before-hover', rA.textX, rA.y, '03-a-before-hover')

await page.mouse.move(rA.gutterX, rA.y)
await page.waitForTimeout(10)
await sample('A-hover-10ms', rA.textX, rA.y, '04-a-hover-10ms')
await page.waitForTimeout(30)
await sample('A-hover-40ms', rA.textX, rA.y, '05-a-hover-40ms')
await page.waitForTimeout(220)
await sample('A-hover-260ms', rA.textX, rA.y, '06-a-hover-260ms')

// Transition A -> neutral zone (hide).
await page.mouse.move(1200, rA.y)
await page.waitForTimeout(20)
await sample('A-leave-neutral-20ms', rA.textX, rA.y, '07-a-leave-neutral-20ms')
await page.waitForTimeout(80)
await sample('A-leave-neutral-100ms', rA.textX, rA.y, '08-a-leave-neutral-100ms')

// Transition neutral -> B (reveal on next row).
await page.mouse.move(rB.gutterX, rB.y)
await page.waitForTimeout(10)
await sample('B-hover-10ms', rB.textX, rB.y, '09-b-hover-10ms')
await page.waitForTimeout(30)
await sample('B-hover-40ms', rB.textX, rB.y, '10-b-hover-40ms')
await page.waitForTimeout(80)
await sample('B-hover-120ms', rB.textX, rB.y, '11-b-hover-120ms')

// Transition B -> C (row-to-row move).
await page.mouse.move(rC.gutterX, rC.y)
await page.waitForTimeout(10)
await sample('C-hover-10ms', rC.textX, rC.y, '12-c-hover-10ms')
await page.waitForTimeout(30)
await sample('C-hover-40ms', rC.textX, rC.y, '13-c-hover-40ms')
await page.waitForTimeout(80)
await sample('C-hover-120ms', rC.textX, rC.y, '14-c-hover-120ms')

report.finishedAt = new Date().toISOString()
const jsonPath = path.join(outDir, `row-transition-audit-${stamp}.json`)
await fs.writeFile(jsonPath, JSON.stringify(report, null, 2))

console.log(`Saved report JSON: ${jsonPath}`)
console.log(`Screenshots: ${screenshotsDir}`)

await browser.close()
