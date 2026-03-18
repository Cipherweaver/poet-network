import { chromium, devices } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:4173'

async function run() {
  const browser = await chromium.launch({ headless: true })
  const results = []

  try {
    console.log('[audit] desktop:start')
    results.push(await auditDesktop(browser))
    console.log('[audit] mobile:start')
    results.push(await auditMobile(browser))
    console.log('[audit] done')
    console.log(JSON.stringify(results, null, 2))
  } finally {
    await browser.close()
  }
}

async function auditDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  const consoleMessages = []
  const pageErrors = []

  page.on('console', (message) => {
    consoleMessages.push({ text: message.text(), type: message.type() })
  })
  page.on('pageerror', (error) => {
    pageErrors.push(String(error))
  })

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'playwright-desktop-home.png', fullPage: true })

  const introText = await page.locator('.intro-card').innerText()
  const introHasEnglish = /literary constellation|yuan/i.test(introText)
  const selected = await selectAnyPoet(page)
  const sidebarVisible = await page.locator('.sidebar').isVisible().catch(() => false)
  const compactIntro = sidebarVisible
    ? {
        className: await page.locator('.intro-card').getAttribute('class'),
        text: await page.locator('.intro-card').innerText(),
      }
    : null

  let firstRelationTitle = null
  let modalVisible = false
  let modalScrollable = false
  let modalText = ''
  let escapeClosesSidebar = false
  let interactionAudit = null

  if (sidebarVisible) {
    await page.screenshot({ path: 'playwright-desktop-selected.png', fullPage: true })
    interactionAudit = await auditSceneInteractions(page)
    if (!(await page.locator('.sidebar').isVisible().catch(() => false))) {
      await selectAnyPoet(page)
      await page.waitForTimeout(180)
    }
    const firstRelation = page.locator('.relation-card-button').first()
    firstRelationTitle = await firstRelation.locator('.relation-header strong').textContent()
    await firstRelation.click()
    await page.waitForTimeout(300)
    modalVisible = await page.locator('.poem-modal').isVisible().catch(() => false)
    modalText = modalVisible ? await page.locator('.poem-modal').innerText() : ''
    modalScrollable = modalVisible
      ? await page.locator('.poem-modal').evaluate((node) => node.scrollHeight > node.clientHeight)
      : false
    if (modalVisible) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      escapeClosesSidebar = !(await page.locator('.sidebar').isVisible().catch(() => false))
      await page.screenshot({ path: 'playwright-desktop-modal.png', fullPage: true })
    }
  }

  await page.close()
  return {
    consoleMessages,
    introText,
    introHasEnglish,
    compactIntro,
    interactionAudit,
    modalScrollable,
    modalText,
    pageErrors,
    selected,
    sidebarVisible,
    type: 'desktop',
    firstRelationTitle,
    modalVisible,
    escapeClosesSidebar,
  }
}

async function auditMobile(browser) {
  const page = await browser.newPage({
    ...devices['iPhone 13'],
  })
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })

  const selected = await selectAnyPoet(page)
  const sidebarVisible = await page.locator('.sidebar').isVisible().catch(() => false)
  const introText = await page.locator('.intro-card').innerText()
  let modalScrollable = false
  let sidebarScrollable = false
  let modalBodyText = ''

  if (sidebarVisible) {
    sidebarScrollable = await page.locator('.sidebar-inner').evaluate((node) => node.scrollHeight > node.clientHeight)
    const firstRelation = page.locator('.relation-card-button').first()
    await firstRelation.click()
    await page.waitForTimeout(300)
    const modal = page.locator('.poem-modal')
    const modalVisible = await modal.isVisible().catch(() => false)
    if (modalVisible) {
      modalScrollable = await modal.evaluate((node) => node.scrollHeight > node.clientHeight)
      modalBodyText = await modal.innerText()
      await page.screenshot({ path: 'playwright-mobile-modal.png', fullPage: true })
    }
  }

  await page.close()
  return {
    modalBodyText,
    modalScrollable,
    introText,
    selected,
    sidebarScrollable,
    sidebarVisible,
    type: 'mobile',
  }
}

async function auditSceneInteractions(page) {
  console.log('[audit] interactions:start')
  const scene = page.locator('.scene')
  const canvas = page.locator('canvas').first()
  const before = await readSceneMetrics(scene)
  const box = await canvas.boundingBox()

  if (!box) {
    return { available: false }
  }

  const startX = box.x + box.width * 0.5
  const startY = box.y + box.height * 0.48

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 160, startY + 24, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(260)
  const afterLeftDrag = await readSceneMetrics(scene)
  console.log('[audit] interactions:left-drag')

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 8, startY - 150, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(260)
  const afterVerticalDrag = await readSceneMetrics(scene)
  console.log('[audit] interactions:vertical-drag')

  await page.mouse.move(startX, startY)
  await page.mouse.wheel(0, -720)
  await page.waitForTimeout(320)
  const afterZoomIn = await readSceneMetrics(scene)

  await page.mouse.wheel(0, 520)
  await page.waitForTimeout(320)
  const afterZoomOut = await readSceneMetrics(scene)
  console.log('[audit] interactions:zoom')

  const currentName = await getSidebarName(page)
  const switched = await selectDifferentPoet(page, currentName?.trim() ?? '')
  console.log('[audit] interactions:switch-1')
  const switchedAgain = switched.success
    ? await selectDifferentPoet(page, switched.name ?? currentName?.trim() ?? '')
    : { attempts: 0, success: false }
  console.log('[audit] interactions:switch-2')

  return {
    afterLeftDrag,
    afterVerticalDrag,
    afterZoomIn,
    afterZoomOut,
    before,
    leftDragChangedYaw: before.yaw !== afterLeftDrag.yaw,
    verticalDragChangedPitch: afterLeftDrag.pitch !== afterVerticalDrag.pitch,
    switched,
    switchedAgain,
    zoomChanged:
      before.zoom !== afterZoomIn.zoom || afterZoomIn.zoom !== afterZoomOut.zoom,
  }
}

async function readSceneMetrics(scene) {
  return scene.evaluate((node) => ({
    pitch: node.getAttribute('data-pitch'),
    selected: node.getAttribute('data-selected'),
    yaw: node.getAttribute('data-yaw'),
    zoom: node.getAttribute('data-zoom'),
  }))
}

async function selectAnyPoet(page) {
  const canvas = page.locator('canvas').first()
  await canvas.waitFor({ state: 'visible' })
  const box = await canvas.boundingBox()
  if (!box) {
    return { attempts: 0, success: false }
  }

  const points = []
  const cols = 7
  const rows = 5
  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      points.push({
        x: box.x + (box.width / (cols + 1)) * col,
        y: box.y + (box.height / (rows + 1)) * row,
      })
    }
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    await page.mouse.click(point.x, point.y)
    await page.waitForTimeout(120)
    if (await page.locator('.sidebar').isVisible().catch(() => false)) {
      return { attempts: index + 1, point, success: true }
    }
  }

  return { attempts: points.length, success: false }
}

async function selectDifferentPoet(page, currentName) {
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (!box) {
    return { attempts: 0, success: false }
  }

  const points = []
  const cols = 8
  const rows = 5
  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      points.push({
        x: box.x + (box.width / (cols + 1)) * col,
        y: box.y + (box.height / (rows + 1)) * row,
      })
    }
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    await page.mouse.click(point.x, point.y)
    await page.waitForTimeout(140)
    const nextName = (await getSidebarName(page))?.trim() ?? ''
    if (nextName && nextName !== currentName) {
      return { attempts: index + 1, name: nextName, point, success: true }
    }
  }

  return { attempts: points.length, name: currentName, success: false }
}

async function getSidebarName(page) {
  return page.locator('.sidebar-header h2').textContent({ timeout: 180 }).catch(() => null)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
