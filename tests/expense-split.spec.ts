import { test, expect, Page } from '@playwright/test'

const FRONTEND_URL = 'http://localhost:3000'

// ─── helpers ─────────────────────────────────────────────────────────────────

async function createGroup(page: Page, groupName: string, members: string[]) {
  await page.goto(FRONTEND_URL)
  await page.getByTestId('group-name-input').fill(groupName)
  for (const member of members) {
    await page.getByTestId('member-name-input').fill(member)
    await page.getByTestId('add-member-btn').click()
  }
  await page.getByTestId('create-group-btn').click()
  await page.waitForURL(/\/g\//)
}

/**
 * Uncheck the split-among checkbox for the named member.
 * Walks every `expense-member-checkbox` and unchecks the one whose
 * nearest enclosing label/li/div contains the member's name.
 */
async function uncheckMember(page: Page, memberName: string) {
  const checkboxes = page.getByTestId('expense-member-checkbox')
  const count = await checkboxes.count()
  for (let i = 0; i < count; i++) {
    const cb = checkboxes.nth(i)
    const nearby = await cb.evaluate((el: Element) => {
      const container = el.closest('label, li, tr') ?? el.parentElement
      return container?.textContent ?? ''
    })
    if (nearby.toLowerCase().includes(memberName.toLowerCase())) {
      await cb.uncheck()
      return
    }
  }
  throw new Error(`No checkbox found for member: ${memberName}`)
}

// ─── TC-01 through TC-06 — sequential main flow ───────────────────────────────

test.describe.serial('main flow', () => {
  let sharedPage: Page
  let groupUrl: string

  test.beforeAll(async ({ browser }) => {
    sharedPage = await browser.newPage()
  })

  test.afterAll(async () => {
    await sharedPage.close()
  })

  // ── TC-01 ──────────────────────────────────────────────────────────────────
  test('TC-01: create group and land on group page', async () => {
    await sharedPage.goto(FRONTEND_URL)
    await sharedPage.getByTestId('group-name-input').fill('Trip to Vegas')
    for (const member of ['Alice', 'Bob', 'Charlie']) {
      await sharedPage.getByTestId('member-name-input').fill(member)
      await sharedPage.getByTestId('add-member-btn').click()
    }

    await sharedPage.getByTestId('create-group-btn').click()
    await sharedPage.waitForURL(/\/g\//)
    groupUrl = sharedPage.url()

    expect(groupUrl).toMatch(/\/g\/[^/]+/)
    await expect(sharedPage.getByTestId('group-title')).toContainText('Trip to Vegas')

    // shareable-link is visible and its content includes the current URL
    const shareableLink = sharedPage.getByTestId('shareable-link')
    await expect(shareableLink).toBeVisible()
    const linkContent = await shareableLink.evaluate((el: Element) => {
      return (
        (el as HTMLInputElement).value ||
        el.textContent ||
        el.getAttribute('href') ||
        ''
      )
    })
    expect(linkContent.trim()).toContain(groupUrl)

    // no debts yet
    await expect(sharedPage.getByTestId('balance-empty')).toBeVisible()

    // empty activity feed
    await expect(sharedPage.getByTestId('activity-feed')).toBeVisible()
    await expect(sharedPage.getByTestId('activity-item')).toHaveCount(0)
  })

  // ── TC-02 ──────────────────────────────────────────────────────────────────
  test('TC-02: add first expense; verify initial balance', async () => {
    await sharedPage.getByTestId('add-expense-btn').click()
    await sharedPage.getByTestId('expense-description-input').fill('Dinner')
    await sharedPage.getByTestId('expense-amount-input').fill('90')
    await sharedPage.getByTestId('expense-payer-select').selectOption('Alice')

    // all 3 member checkboxes pre-checked
    const checkboxes = sharedPage.getByTestId('expense-member-checkbox')
    await expect(checkboxes).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      await expect(checkboxes.nth(i)).toBeChecked()
    }

    await sharedPage.getByTestId('expense-submit').click()

    // form dismissed
    await expect(sharedPage.getByTestId('expense-submit')).not.toBeVisible()

    // balance-empty gone; exactly 2 debt rows
    await expect(sharedPage.getByTestId('balance-empty')).not.toBeVisible()
    await expect(sharedPage.getByTestId('debt-row')).toHaveCount(2)

    const debtTexts = await sharedPage.getByTestId('debt-description').allTextContents()
    expect(debtTexts.some(t => /bob/i.test(t) && /alice/i.test(t) && /30/.test(t))).toBe(true)
    expect(debtTexts.some(t => /charlie/i.test(t) && /alice/i.test(t) && /30/.test(t))).toBe(true)

    // exactly 1 activity item referencing Dinner, Alice, $90
    await expect(sharedPage.getByTestId('activity-item')).toHaveCount(1)
    const itemText = (await sharedPage.getByTestId('activity-item').first().textContent()) ?? ''
    expect(itemText).toMatch(/dinner/i)
    expect(itemText).toMatch(/alice/i)
    expect(itemText).toMatch(/90/)
  })

  // ── TC-03 ──────────────────────────────────────────────────────────────────
  test('TC-03: add second expense; verify debt simplification', async () => {
    await sharedPage.getByTestId('add-expense-btn').click()
    await sharedPage.getByTestId('expense-description-input').fill('Hotel')
    await sharedPage.getByTestId('expense-amount-input').fill('60')
    await sharedPage.getByTestId('expense-payer-select').selectOption('Bob')

    // all 3 checkboxes pre-checked
    const checkboxes = sharedPage.getByTestId('expense-member-checkbox')
    await expect(checkboxes).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      await expect(checkboxes.nth(i)).toBeChecked()
    }

    await sharedPage.getByTestId('expense-submit').click()
    await expect(sharedPage.getByTestId('expense-submit')).not.toBeVisible()

    // simplified to 2 rows (not 3 raw debts)
    await expect(sharedPage.getByTestId('debt-row')).toHaveCount(2)

    const debtTexts = await sharedPage.getByTestId('debt-description').allTextContents()
    expect(debtTexts.some(t => /charlie/i.test(t) && /alice/i.test(t) && /40/.test(t))).toBe(true)
    expect(debtTexts.some(t => /charlie/i.test(t) && /bob/i.test(t) && /10/.test(t))).toBe(true)

    await expect(sharedPage.getByTestId('activity-item')).toHaveCount(2)
  })

  // ── TC-04 ──────────────────────────────────────────────────────────────────
  test('TC-04: settle a debt; verify balance updates', async () => {
    // find the Charlie→Bob $10 row and settle it
    const targetRow = sharedPage
      .getByTestId('debt-row')
      .filter({ hasText: /charlie/i })
      .filter({ hasText: /bob/i })
    await targetRow.getByTestId('settle-btn').click()

    // one row remaining
    await expect(sharedPage.getByTestId('debt-row')).toHaveCount(1)

    const remainingText = (await sharedPage.getByTestId('debt-description').first().textContent()) ?? ''
    expect(remainingText).toMatch(/charlie/i)
    expect(remainingText).toMatch(/alice/i)
    expect(remainingText).toMatch(/40/)

    // Bob no longer appears as a creditor (or at all) in the balance sheet
    const allDebtTexts = await sharedPage.getByTestId('debt-description').allTextContents()
    expect(allDebtTexts.every(t => !/bob/i.test(t))).toBe(true)

    // 3 activity items; newest references the Charlie/Bob $10 settlement
    await expect(sharedPage.getByTestId('activity-item')).toHaveCount(3)
    const newestText = (await sharedPage.getByTestId('activity-item').last().textContent()) ?? ''
    expect(newestText).toMatch(/charlie/i)
    expect(newestText).toMatch(/bob/i)
    expect(newestText).toMatch(/10/)
  })

  // ── TC-05 ──────────────────────────────────────────────────────────────────
  test('TC-05: activity feed is in chronological order (oldest first)', async () => {
    const items = sharedPage.getByTestId('activity-item')
    await expect(items).toHaveCount(3)

    const t0 = (await items.nth(0).textContent()) ?? ''
    const t1 = (await items.nth(1).textContent()) ?? ''
    const t2 = (await items.nth(2).textContent()) ?? ''

    // 1st: Dinner expense — Alice paid $90
    expect(t0).toMatch(/dinner/i)
    expect(t0).toMatch(/alice/i)
    expect(t0).toMatch(/90/)

    // 2nd: Hotel expense — Bob paid $60
    expect(t1).toMatch(/hotel/i)
    expect(t1).toMatch(/bob/i)
    expect(t1).toMatch(/60/)

    // 3rd: settlement — Charlie paid Bob $10
    expect(t2).toMatch(/charlie/i)
    expect(t2).toMatch(/bob/i)
    expect(t2).toMatch(/10/)
  })

  // ── TC-06 ──────────────────────────────────────────────────────────────────
  test('TC-06: data persists when opening the shareable link in a new tab', async () => {
    const newTab = await sharedPage.context().newPage()
    try {
      await newTab.goto(groupUrl)

      await expect(newTab.getByTestId('group-title')).toContainText('Trip to Vegas')

      // exactly 1 debt row: Charlie owes Alice $40
      await expect(newTab.getByTestId('debt-row')).toHaveCount(1)
      const debtText = (await newTab.getByTestId('debt-description').first().textContent()) ?? ''
      expect(debtText).toMatch(/charlie/i)
      expect(debtText).toMatch(/alice/i)
      expect(debtText).toMatch(/40/)

      // 3 activity items in original chronological order
      const items = newTab.getByTestId('activity-item')
      await expect(items).toHaveCount(3)

      const t0 = (await items.nth(0).textContent()) ?? ''
      const t1 = (await items.nth(1).textContent()) ?? ''
      const t2 = (await items.nth(2).textContent()) ?? ''

      expect(t0).toMatch(/dinner/i)
      expect(t1).toMatch(/hotel/i)
      expect(t2).toMatch(/charlie/i)
      expect(t2).toMatch(/bob/i)
    } finally {
      await newTab.close()
    }
  })
})

// ─── TC-07 — partial split (subset of members) ───────────────────────────────

test('TC-07: partial split (subset of members)', async ({ page }) => {
  await createGroup(page, 'Coffee Group', ['Alice', 'Bob', 'Charlie'])

  await page.getByTestId('add-expense-btn').click()
  await page.getByTestId('expense-description-input').fill('Coffee')
  await page.getByTestId('expense-amount-input').fill('20')
  await page.getByTestId('expense-payer-select').selectOption('Alice')

  // uncheck Charlie — only Alice and Bob share the expense
  await uncheckMember(page, 'Charlie')

  await page.getByTestId('expense-submit').click()

  // Bob owes Alice $10 (20 / 2)
  await expect(page.getByTestId('debt-row')).toHaveCount(1)
  const debtText = (await page.getByTestId('debt-description').first().textContent()) ?? ''
  expect(debtText).toMatch(/bob/i)
  expect(debtText).toMatch(/alice/i)
  expect(debtText).toMatch(/10/)

  // Charlie has no debt
  const allDebtTexts = await page.getByTestId('debt-description').allTextContents()
  expect(allDebtTexts.every(t => !/charlie/i.test(t))).toBe(true)
})

// ─── TC-08 — full settlement clears balance sheet ────────────────────────────

test('TC-08: full settlement clears balance sheet', async ({ page }) => {
  await createGroup(page, 'Small Group', ['Alice', 'Bob'])

  // Alice pays $30, split equally between Alice and Bob → Bob owes Alice $15
  await page.getByTestId('add-expense-btn').click()
  await page.getByTestId('expense-description-input').fill('Lunch')
  await page.getByTestId('expense-amount-input').fill('30')
  await page.getByTestId('expense-payer-select').selectOption('Alice')
  // both checkboxes pre-checked by default
  await page.getByTestId('expense-submit').click()

  // confirm the expected debt before settling
  await expect(page.getByTestId('debt-row')).toHaveCount(1)
  const debtText = (await page.getByTestId('debt-description').first().textContent()) ?? ''
  expect(debtText).toMatch(/bob/i)
  expect(debtText).toMatch(/alice/i)
  expect(debtText).toMatch(/15/)

  // settle the only debt
  await page.getByTestId('settle-btn').click()

  // balance sheet cleared
  await expect(page.getByTestId('balance-empty')).toBeVisible()
  await expect(page.getByTestId('debt-row')).toHaveCount(0)

  // settlement appears in the activity feed
  const activityTexts = await page.getByTestId('activity-item').allTextContents()
  const settlementEntry = activityTexts.find(
    t => /bob/i.test(t) && /alice/i.test(t) && /15/.test(t),
  )
  expect(settlementEntry).toBeTruthy()
})
