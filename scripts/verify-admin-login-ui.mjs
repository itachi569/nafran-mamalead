import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { chromium } from 'playwright'
import { createAdminServer } from '../admin-dashboard/server/local-server.mjs'
import { hashOwnerPassword } from '../admin-dashboard/server/owner-password.mjs'

const token = randomBytes(32).toString('base64url')
const password = 'test-owner-password-12345'
const service = await createAdminServer({
  env: {
    ADMIN_OWNER_EMAIL: 'owner@gmail.com',
    ADMIN_PASSWORD_HASH: await hashOwnerPassword(password),
    ADMIN_TOKEN_SHA256: createHash('sha256').update(token).digest('hex'),
    ADMIN_SESSION_SECRET: randomBytes(32).toString('base64url'),
    ADMIN_LOG: '0',
  },
  store: {
    installations: async () => [],
    licenses: async () => [],
    trialLicenses: async () => [],
  },
})
let browser
try {
  await new Promise((resolve, reject) => service.server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${service.server.address().port}`
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`${origin}/admin/`)
  await page.getByRole('heading', { name: 'Owner sign-in' }).waitFor()
  await page.getByLabel('Owner Gmail address').fill('owner@gmail.com')
  await page.getByLabel('Owner password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('alert').getByText('Invalid owner sign-in details.').waitFor()
  assert.equal(await page.getByLabel('Owner password').inputValue(), '')
  await page.getByLabel('Owner password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out' }).waitFor()
  await page.reload()
  await page.getByRole('button', { name: 'Sign out' }).waitFor()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.getByRole('heading', { name: 'Owner sign-in' }).waitFor()
  console.log('PASS  admin Gmail/password form rejects invalid details, opens a persistent owner session, and signs out')
} finally {
  if (browser) await browser.close()
  await new Promise((resolve) => service.server.close(resolve))
}
