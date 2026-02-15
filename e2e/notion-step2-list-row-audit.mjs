import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const pageUrl =
  process.env.NOTION_PAGE_URL ||
  'https://www.notion.so/3065ab020ff680b7b379c78bb0e7504d?source=copy_link'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const tag = `s2${Date.now().toString().slice(-6)}`
const outDir = '/Users/veniameen/Projects/gotipe/output/playwright/notion-step2'
const screenshotsDir = path.join(outDir, `list-row-${stamp}`)
await fs.mkdir(screenshotsDir, { recursive: true })

const report = {
  startedAt: new Date().toISOString(),
  pageUrl,
  runTag: tag,
  markers: {},
  steps: [],
}

const markers = {
  bulletA: `${tag}-bullet-a`,
  bulletB: `${tag}-bullet-b`,
  bulletC: `${tag}-bullet-c`,
  todoA: `${tag}-todo-a`,
  todoB: `${tag}-todo-b`,
  todoC: `${tag}-todo-c`,
  orderedA: `${tag}-ordered-a`,
  orderedB: `${tag}-ordered-b`,
  orderedC: `${tag}-ordered-c`,
}
report.markers = markers

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

async function slash(command) {
  await page.keyboard.type(`/${command}`)
  await page.waitForTimeout(260)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(280)
}

async function addStep(id, title, details, screenshotName = null) {
  const screenshot = screenshotName ? await shot(screenshotName) : null
  report.steps.push({ id, title, details, screenshot })
}

async function getTextBox(text, timeout = 8000) {
  const loc = page.locator(`text=${text}`).first()
  try {
    await loc.waitFor({ state: 'visible', timeout })
    const box = await loc.boundingBox()
    return box ? { locator: loc, box } : null
  } catch {
    return null
  }
}

async function inspectRowControls(text) {
  const node = await getTextBox(text)
  if (!node?.box) return { text, error: 'row-not-found' }

  const rowX = node.box.x
  const rowY = node.box.y + node.box.height / 2
  const hoverX = Math.max(20, rowX - 22)

  const collect = async () =>
    page.evaluate(({ x, y }) => {
      const controls = [...document.querySelectorAll('button,[role="button"]')]
        .map((el) => {
          const r = el.getBoundingClientRect()
          const s = getComputedStyle(el)
          return {
            aria: el.getAttribute('aria-label') || '',
            title: el.getAttribute('title') || '',
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

      const stack = document
        .elementsFromPoint(x, y)
        .slice(0, 8)
        .map((el) => ({
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 120),
          text: (el.textContent || '').trim().slice(0, 40),
        }))

      return { controls, stack }
    }, { x: rowX, y: rowY })

  await page.mouse.move(1200, 120)
  await page.waitForTimeout(80)
  const before = await collect()

  await page.mouse.move(hoverX, rowY)
  await page.waitForTimeout(40)
  const hover40 = await collect()

  await page.waitForTimeout(220)
  const hover260 = await collect()

  return {
    text,
    row: { x: Math.round(rowX), y: Math.round(rowY) },
    before,
    hover40,
    hover260,
  }
}

await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForTimeout(4200)
await addStep('S2-01', 'Opened Notion page', { url: page.url(), title: await page.title() }, '01-opened')

// Seed deterministic rows for list-row behavior audit.
await page.mouse.click(760, 860)
await slash('bullet list')
await page.keyboard.type(markers.bulletA)
await page.keyboard.press('Enter')
await page.keyboard.type(markers.bulletB)
await page.keyboard.press('Enter')
await page.keyboard.type(markers.bulletC)
await page.keyboard.press('Enter')
await page.keyboard.press('Enter')

await slash('to-do list')
await page.keyboard.type(markers.todoA)
await page.keyboard.press('Enter')
await page.keyboard.type(markers.todoB)
await page.keyboard.press('Enter')
await page.keyboard.type(markers.todoC)
await page.keyboard.press('Enter')
await page.keyboard.press('Enter')

await slash('numbered list')
await page.keyboard.type(markers.orderedA)
await page.keyboard.press('Enter')
await page.keyboard.type(markers.orderedB)
await page.keyboard.press('Enter')
await page.keyboard.type(markers.orderedC)
await page.waitForTimeout(260)
await addStep('S2-02', 'Inserted list rows for audit', { markers }, '02-seeded-rows')

const rowInspections = {
  bulletA: await inspectRowControls(markers.bulletA),
  bulletC: await inspectRowControls(markers.bulletC),
  todoA: await inspectRowControls(markers.todoA),
  todoC: await inspectRowControls(markers.todoC),
  orderedA: await inspectRowControls(markers.orderedA),
  orderedC: await inspectRowControls(markers.orderedC),
}
await addStep('S2-03', 'Row hover controls on list rows', rowInspections, '03-row-hover')

// Slash behavior probe: requires boundary before slash.
const slashProbe = async (text, withLeadingSpace) => {
  const row = await getTextBox(text)
  if (!row?.box) return { text, withLeadingSpace, error: 'row-not-found' }
  await page.mouse.click(row.box.x + Math.max(20, row.box.width - 20), row.box.y + row.box.height / 2)
  await page.waitForTimeout(120)
  if (withLeadingSpace) {
    await page.keyboard.type(' /to')
  } else {
    await page.keyboard.type('/to')
  }
  await page.waitForTimeout(260)
  const state = await page.evaluate(() => {
    const menu = [...document.querySelectorAll('div[role="menu"],div[role="listbox"],div[role="dialog"]')]
      .find((el) => (el.textContent || '').includes('Heading 1') && (el.textContent || '').includes('To-do'))
    const sel = window.getSelection()
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
    if (range) range.collapse(true)
    const caret = range?.getBoundingClientRect() ?? null
    const rect = menu?.getBoundingClientRect() ?? null
    return {
      hasMenu: !!menu,
      caret: caret
        ? { x: Math.round(caret.x), y: Math.round(caret.y), w: Math.round(caret.width), h: Math.round(caret.height) }
        : null,
      menu: rect
        ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
        : null,
    }
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  return { text, withLeadingSpace, state }
}

const slashChecks = {
  bulletBoundary: await slashProbe(markers.bulletB, true),
  bulletInline: await slashProbe(markers.bulletB, false),
  todoBoundary: await slashProbe(markers.todoB, true),
  todoInline: await slashProbe(markers.todoB, false),
}
await addStep('S2-04', 'Slash menu boundary behavior inside list rows', slashChecks, '04-slash-probe')

// Drag handle menu open on list rows.
const menuProbe = async (text) => {
  const row = await getTextBox(text)
  if (!row?.box) return { text, error: 'row-not-found' }
  const y = row.box.y + row.box.height / 2
  const hoverX = Math.max(20, row.box.x - 22)
  await page.mouse.move(hoverX, y)
  await page.waitForTimeout(140)

  const handlePoint = await page.evaluate(({ rowX, rowY }) => {
    const controls = [...document.querySelectorAll('button,[role="button"]')]
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          aria: el.getAttribute('aria-label') || '',
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
        }
      })
      .filter((item) => Math.abs(item.y + item.h / 2 - rowY) < 28 && item.x <= rowX + 20 && item.x >= rowX - 120)
      .find((item) => item.aria.includes('Drag to move'))
    if (!controls) return null
    return {
      x: Math.round(controls.x + controls.w / 2),
      y: Math.round(controls.y + controls.h / 2),
      aria: controls.aria,
    }
  }, { rowX: row.box.x, rowY: y })

  if (!handlePoint) return { text, error: 'handle-not-found' }

  await page.mouse.click(handlePoint.x, handlePoint.y)
  await page.waitForTimeout(220)

  const items = await page.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"],button[role="menuitem"],div[role="option"]')]
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 60),
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  return { text, clickPoint: handlePoint, items }
}

const menuChecks = {
  bullet: await menuProbe(markers.bulletA),
  todo: await menuProbe(markers.todoA),
  ordered: await menuProbe(markers.orderedA),
}
await addStep('S2-05', 'Drag handle menu items on list rows', menuChecks, '05-handle-menu')

report.finishedAt = new Date().toISOString()
const jsonPath = path.join(outDir, `list-row-audit-${stamp}.json`)
await fs.writeFile(jsonPath, JSON.stringify(report, null, 2))

console.log(`Saved report JSON: ${jsonPath}`)
console.log(`Screenshots: ${screenshotsDir}`)

await browser.close()
