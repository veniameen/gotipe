import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const pageUrl = 'https://www.notion.so/3065ab020ff680b7b379c78bb0e7504d?source=copy_link'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const tag = `ref${Date.now().toString().slice(-6)}`

const outDir = '/Users/veniameen/Projects/gotipe/output/playwright/notion-step1'
const docsDir = '/Users/veniameen/Projects/gotipe/docs/notion-like-qa'
const screenshotsDir = path.join(outDir, `deep-${stamp}`)
await fs.mkdir(screenshotsDir, { recursive: true })
await fs.mkdir(docsDir, { recursive: true })

const report = {
  startedAt: new Date().toISOString(),
  pageUrl,
  runTag: tag,
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

async function activeContext(label) {
  const info = await page.evaluate(() => {
    const sel = window.getSelection()
    const focusNode = sel?.focusNode || null
    const focusElement =
      focusNode instanceof Element
        ? focusNode
        : focusNode?.parentElement || document.activeElement
    const editable = focusElement?.closest('[contenteditable=\"true\"]')
    const block = focusElement?.closest('[data-block-id]') || editable?.parentElement || editable
    const blockRect = block?.getBoundingClientRect()
    const beforeChain = []
    let current = editable
    for (let i = 0; i < 4 && current; i += 1) {
      beforeChain.push({
        tag: current.tagName,
        className: (current.className || '').toString().slice(0, 120),
        before: getComputedStyle(current, '::before').content,
      })
      current = current.parentElement
    }
    return {
      selectionCollapsed: sel ? sel.isCollapsed : null,
      activeTag: document.activeElement?.tagName || null,
      activeClass: (document.activeElement?.className || '').toString().slice(0, 120),
      editableText: (editable?.textContent || '').slice(0, 200),
      editableRect: editable?.getBoundingClientRect()
        ? {
            x: Math.round(editable.getBoundingClientRect().x),
            y: Math.round(editable.getBoundingClientRect().y),
            w: Math.round(editable.getBoundingClientRect().width),
            h: Math.round(editable.getBoundingClientRect().height),
          }
        : null,
      blockRect: blockRect
        ? {
            x: Math.round(blockRect.x),
            y: Math.round(blockRect.y),
            w: Math.round(blockRect.width),
            h: Math.round(blockRect.height),
          }
        : null,
      beforeChain,
    }
  })
  return { label, info }
}

async function getTextBox(text, timeout = 15000) {
  const locator = page.locator(`text=${text}`).first()
  try {
    await locator.waitFor({ state: 'visible', timeout })
    return { locator, box: await locator.boundingBox() }
  } catch {
    return null
  }
}

async function inspectGutterForText(text) {
  const { box } = await getTextBox(text)
  if (!box) return { text, error: 'no box' }
  const rowX = box.x
  const rowY = box.y + box.height / 2
  const hoverX = Math.max(20, rowX - 20)
  await page.mouse.move(1200, 120)
  await page.waitForTimeout(80)

  const collect = async () =>
    page.evaluate(({ y, rowX }) => {
      const items = [...document.querySelectorAll('button,[role=\"button\"]')]
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
        .filter((x) => x.x >= rowX - 120 && x.x <= rowX + 20 && Math.abs(x.y + x.h / 2 - y) < 28)
      return items
    }, { y: rowY, rowX })

  const before = await collect()
  await page.mouse.move(hoverX, rowY)
  await page.waitForTimeout(40)
  const hover40 = await collect()
  await page.waitForTimeout(220)
  const hover260 = await collect()
  return { text, rowX: Math.round(rowX), rowY: Math.round(rowY), before, hover40, hover260 }
}

async function addStep(id, title, details, screenshotName) {
  const screenshot = screenshotName ? await shot(screenshotName) : null
  report.steps.push({ id, title, details, screenshot })
}

async function slash(command) {
  await page.keyboard.type(`/${command}`)
  await page.waitForTimeout(220)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(240)
}

await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForTimeout(4500)
await addStep('S01', 'Baseline page opened', { url: page.url(), title: await page.title() }, '01-baseline')

// Seed paragraphs for hover analysis.
await page.mouse.click(720, 860)
await page.keyboard.type(`${tag}-hover-alpha`)
await page.keyboard.press('Enter')
await page.keyboard.type(`${tag}-hover-beta`)
await page.keyboard.press('Enter')
await page.keyboard.type(`${tag}-hover-gamma`)
await page.waitForTimeout(220)

const hoverAlpha = await inspectGutterForText(`${tag}-hover-alpha`)
const hoverBeta = await inspectGutterForText(`${tag}-hover-beta`)
const hoverGamma = await inspectGutterForText(`${tag}-hover-gamma`)
await addStep('S02', 'Left gutter controls appear on row hover', { hoverAlpha, hoverBeta, hoverGamma }, '02-gutter-hover')

// Slash menu anchor at caret.
await page.keyboard.press('Enter')
await page.keyboard.type('/')
await page.waitForTimeout(260)
const slashAnchor = await page.evaluate(() => {
  const sel = window.getSelection()
  const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
  let caret = null
  if (range) {
    range.collapse(true)
    const rect = range.getBoundingClientRect()
    caret = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
  }
  const nodes = [...document.querySelectorAll('div,section,aside')]
  const candidates = nodes
    .map((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text.includes('Heading 1') || !text.includes('Bullet List')) return null
      const rect = el.getBoundingClientRect()
      if (rect.width < 180 || rect.width > 500 || rect.height < 140 || rect.height > 560) return null
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return null
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.w * a.h - b.w * b.h)
  return { caret, menu: candidates[0] || null }
})
await addStep('S03', 'Slash menu position sampled vs caret', slashAnchor, '03-slash-menu')
await page.keyboard.press('Escape')
await page.waitForTimeout(120)

// Heading 1 placeholder behavior.
await slash('heading 1')
const headingBeforeTyping = await activeContext('heading1-after-transform-before-text')
await addStep('S04', 'Heading 1 transform and placeholder state', headingBeforeTyping, '04-heading-placeholder')
await page.keyboard.type(`${tag} heading text`)
await page.keyboard.press('Enter')
const headingAfterEnter = await activeContext('after-enter-from-heading1')
await addStep('S05', 'After Enter from Heading 1', headingAfterEnter, '05-heading-enter')

// Block matrix via slash + Enter behavior snapshots.
const matrix = [
  { name: 'Heading 2', cmd: 'heading 2', sample: `${tag} h2 text` },
  { name: 'Heading 3', cmd: 'heading 3', sample: `${tag} h3 text` },
  { name: 'Bullet List', cmd: 'bullet list', sample: `${tag} bullet item` },
  { name: 'Numbered List', cmd: 'numbered list', sample: `${tag} numbered item` },
  { name: 'To-do List', cmd: 'to-do list', sample: `${tag} todo item` },
  { name: 'Quote', cmd: 'blockquote', sample: `${tag} quote text` },
  { name: 'Code Block', cmd: 'code', sample: `${tag} const x = 1;` },
]
for (const item of matrix) {
  await page.keyboard.press('Enter')
  await slash(item.cmd)
  const beforeText = await activeContext(`${item.name}-before-text`)
  await page.keyboard.type(item.sample)
  await page.keyboard.press('Enter')
  const afterEnter = await activeContext(`${item.name}-after-enter`)
  if (item.name === 'Code Block') {
    // Notion keeps Enter inside code blocks; Meta+Enter exits to the next paragraph.
    await page.keyboard.press('Meta+Enter')
    await page.waitForTimeout(200)
  }
  report.steps.push({
    id: `M-${item.name.replace(/\s+/g, '-').toLowerCase()}`,
    title: `Block matrix: ${item.name}`,
    details: { beforeText, afterEnter },
    screenshot: await shot(`matrix-${item.name.replace(/\s+/g, '-').toLowerCase()}`),
  })
}

// Turn into via drag handle menu.
await page.keyboard.press('Enter')
await page.mouse.click(720, 860)
await page.keyboard.type(`${tag}-turn-source`)
await page.waitForTimeout(160)
const src = await getTextBox(`${tag}-turn-source`, 6000)
if (src?.box) {
  await page.mouse.move(Math.max(20, src.box.x - 20), src.box.y + src.box.height / 2)
  await page.waitForTimeout(120)
  const handle = page.locator('button[aria-label*=\"Drag to move\"]').first()
  if (await handle.count()) {
    await handle.click()
    await page.waitForTimeout(180)
    await page.getByText('Turn into', { exact: true }).first().click()
    await page.waitForTimeout(120)
    await page.getByText('Heading 2', { exact: true }).first().click()
    await page.waitForTimeout(220)
    await addStep('S06', 'Turn into: paragraph -> Heading 2 via handle menu', await activeContext('after-turn-into-heading2'), '06-turn-into-h2')

    await page.mouse.move(Math.max(20, src.box.x - 20), src.box.y + src.box.height / 2)
    await page.waitForTimeout(120)
    await handle.click()
    await page.waitForTimeout(180)
    await page.getByText('Turn into', { exact: true }).first().click()
    await page.waitForTimeout(120)
    await page.getByText('To-do list', { exact: true }).first().click()
    await page.waitForTimeout(220)
    await addStep('S07', 'Turn into: Heading 2 -> To-do list', await activeContext('after-turn-into-todo'), '07-turn-into-todo')
  }
} else {
  await addStep('S06', 'Turn into: source block lookup', { error: 'turn-source block not found' }, '06-turn-into-missing')
}

// List transform scenario similar to bug reports.
await page.keyboard.press('Enter')
await slash('to-do list')
await page.keyboard.type(`${tag}-todo-a`)
await page.keyboard.press('Enter')
await page.keyboard.type(`${tag}-todo-b`)
await page.keyboard.press('Enter')
await page.keyboard.type('/heading 1')
await page.waitForTimeout(200)
await page.keyboard.press('Enter')
await page.waitForTimeout(260)
await addStep('S08', 'Scenario: to-do third row /heading 1 transform', {
  context: await activeContext('todo-third-slash-heading1'),
  nearbyText: await page.locator('body').innerText().then((t) => t.slice(-1000)),
}, '08-todo-third-transform')

const jsonPath = path.join(outDir, `deep-audit-${stamp}.json`)
await fs.writeFile(jsonPath, JSON.stringify(report, null, 2))

console.log(`Saved report JSON: ${jsonPath}`)
console.log(`Screenshots directory: ${screenshotsDir}`)

await browser.close()
