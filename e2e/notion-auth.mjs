import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const profileDir = path.resolve('output/playwright/notion-app-profile')
const storageStatePath = path.resolve('output/playwright/notion-app-storage.json')
const timeoutMs = 15 * 60 * 1000
const pollMs = 1500

await fs.mkdir(path.dirname(storageStatePath), { recursive: true })
await fs.mkdir(profileDir, { recursive: true })

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1400, height: 900 },
})

let page = context.pages()[0]
if (!page) page = await context.newPage()

await page.goto('https://www.notion.so/login', { waitUntil: 'domcontentloaded' })

console.log('Open browser launched.')
console.log('Please complete Notion login in the opened window (including 2FA).')
console.log('Session will be saved when login page is left and editor shell is detected.')

const startedAt = Date.now()
let loggedIn = false

while (Date.now() - startedAt < timeoutMs) {
  const currentUrl = page.url()
  const cookies = await context.cookies('https://www.notion.so')
  const hasToken = cookies.some((cookie) => cookie.name === 'token_v2')
  const isOnLogin = /\/login(?:[/?#]|$)/.test(currentUrl)
  const editorShell =
    (await page.locator('[role=\"tree\"]').count()) > 0 ||
    (await page.locator('[data-testid=\"notion-topbar\"]').count()) > 0

  if (hasToken && !isOnLogin && editorShell) {
    loggedIn = true
    break
  }
  await page.waitForTimeout(pollMs)
}

if (loggedIn) {
  await context.storageState({ path: storageStatePath })
  console.log(`Saved storage state: ${storageStatePath}`)
  console.log(`Profile directory: ${profileDir}`)
} else {
  console.error('Timeout: auth cookie not detected. Try again.')
  process.exitCode = 1
}

await context.close()
