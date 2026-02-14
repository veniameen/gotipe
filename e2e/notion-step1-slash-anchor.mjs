import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const outDir = '/Users/veniameen/Projects/gotipe/output/playwright/notion-step1'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const tag = `slash${Date.now().toString().slice(-6)}`
const screenshotsDir = path.join(outDir, `slash-anchor-${stamp}`)
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
await page.waitForTimeout(3000)

await page.mouse.click(760, 860)
await page.keyboard.type('/text')
await page.waitForTimeout(220)
await page.keyboard.press('Enter')
await page.waitForTimeout(160)
await page.keyboard.type(`${tag}-anchor`)
await page.keyboard.press('Enter')
await page.keyboard.press('Enter')
await page.keyboard.type('/')
const caretBeforeMenu = await page.evaluate(() => {
  const sel = window.getSelection()
  if (sel && sel.rangeCount) {
    const range = sel.getRangeAt(0).cloneRange()
    range.collapse(true)
    const rect = range.getBoundingClientRect()
    if (rect.x !== 0 || rect.y !== 0 || rect.height !== 0) {
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      }
    }
  }
  const focused =
    document.activeElement?.closest('[contenteditable=\"true\"]') || document.querySelector('[contenteditable=\"true\"]:focus')
  if (focused) {
    const rect = focused.getBoundingClientRect()
    return {
      x: Math.round(rect.x + 12),
      y: Math.round(rect.y + Math.min(18, Math.max(0, rect.height - 1))),
      w: 0,
      h: 18,
    }
  }
  return null
})
await page.waitForTimeout(280)

const data = await page.evaluate(() => {
  const candidates = []
  const all = [...document.querySelectorAll('*')]
  for (const el of all) {
    const aria = el.getAttribute('aria-label') || ''
    const role = el.getAttribute('role') || ''
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (!aria.includes('Command menu')) continue
    const rect = el.getBoundingClientRect()
    candidates.push({
      source: 'aria-label',
      tag: el.tagName,
      role,
      aria,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      text: text.slice(0, 160),
    })
  }

  if (!candidates.length) {
    const options = [...document.querySelectorAll('[role=\"menuitem\"], [role=\"option\"]')].filter((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text) return false
      const rect = el.getBoundingClientRect()
      if (rect.width < 80 || rect.height < 20) return false
      const style = getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden'
    })

    if (options.length) {
      const first = options[0]
      let container = first
      while (container.parentElement) {
        const parent = container.parentElement
        const role = parent.getAttribute('role') || ''
        const rect = parent.getBoundingClientRect()
        if ((role === 'dialog' || role === 'listbox') && rect.width > 180 && rect.width < 500 && rect.height > 120 && rect.height < 560) {
          container = parent
          break
        }
        container = parent
      }
      const r = container.getBoundingClientRect()
      candidates.push({
        source: 'option-ancestor',
        tag: container.tagName,
        role: container.getAttribute('role') || '',
        aria: '',
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        text: options
          .slice(0, 10)
          .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
          .join(' | ')
          .slice(0, 160),
      })
    }
  }

  if (!candidates.length) {
    for (const el of all) {
      const role = el.getAttribute('role') || ''
      if (role !== 'menu' && role !== 'listbox' && role !== 'dialog') continue
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      const hasHeading = text.includes('Heading 1')
      const hasBullet = text.includes('Bulleted list') || text.includes('Bullet List')
      if (!hasHeading || !hasBullet) continue
      const rect = el.getBoundingClientRect()
      candidates.push({
        source: `role-${role}`,
        tag: el.tagName,
        role,
        aria: el.getAttribute('aria-label') || '',
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        text: text.slice(0, 160),
      })
    }
  }

  if (!candidates.length) {
    for (const el of all) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text.includes('Heading 1') || !text.includes('Bullet List') || !text.includes('Numbered List')) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 180 || rect.width > 500 || rect.height < 160 || rect.height > 540) continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      candidates.push({
        source: 'text-heuristic',
        tag: el.tagName,
        role: el.getAttribute('role') || '',
        aria: el.getAttribute('aria-label') || '',
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        text: text.slice(0, 160),
      })
    }
  }

  candidates.sort((a, b) => a.w * a.h - b.w * b.h)
  const menu = candidates[0] || null
  return { menu, candidateCount: candidates.length, candidates: candidates.slice(0, 10) }
})

const screenshot = path.join(screenshotsDir, 'slash-anchor.png')
await page.screenshot({ path: screenshot, fullPage: false })

const jsonPath = path.join(outDir, `slash-anchor-${stamp}.json`)
await fs.writeFile(
  jsonPath,
  JSON.stringify(
    {
      tag,
      url: page.url(),
      screenshot,
      caret: caretBeforeMenu,
      delta: data.menu && caretBeforeMenu ? { dx: data.menu.x - caretBeforeMenu.x, dy: data.menu.y - caretBeforeMenu.y } : null,
      ...data,
    },
    null,
    2,
  ),
)
console.log(`Saved: ${jsonPath}`)
console.log(`Screenshot: ${screenshot}`)

await browser.close()
