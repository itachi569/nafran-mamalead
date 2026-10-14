import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { _electron as electron } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const directory = mkdtempSync(join(tmpdir(), 'nafran-assist-'))
const key = 'csk_test_device_key_1234567890'
let requests = 0
const provider = createServer(async (request, response) => {
  assert.equal(request.url, '/v1/chat/completions')
  assert.equal(request.headers.authorization, `Bearer ${key}`)
  let body = ''
  for await (const chunk of request) body += chunk
  assert.ok(JSON.parse(body).messages.some((message) => message.role === 'user'))
  requests += 1
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ choices: [{ message: { content: 'Hello! I can help with your leads.' } }] }))
})
let desktop
try {
  await new Promise((resolve, reject) => provider.once('error', reject).listen(0, '127.0.0.1', resolve))
  const env = { ...process.env, APPDATA: join(directory, 'appdata'), CEREBRAS_API_URL: `http://127.0.0.1:${provider.address().port}/v1` }
  for (const name of ['CEREBRAS_API_KEY', 'CEREBRAS_API_KEY_FILE', 'NAFRAN_ASSIST_API_KEY', 'NAFRAN_ASSIST_API_KEY_FILE', 'OPENAI_API_KEY', 'OPENAI_API_KEY_FILE']) delete env[name]
  const packaged = process.env.NAFRAN_TEST_PACKAGED === '1'
  desktop = await electron.launch(packaged ? {
    executablePath: resolve(root, 'release/win-unpacked/Nafran Leads Scraper.exe'),
    args: [`--user-data-dir=${join(directory, 'profile')}`], env, timeout: 60_000,
  } : { cwd: root, args: ['.', `--user-data-dir=${join(directory, 'profile')}`], env, timeout: 60_000 })
  const page = await desktop.firstWindow()
  assert.equal((await page.evaluate(() => window.desktop.assist.status())).configured, false)
  await page.locator('[data-view="settings"]').first().click()
  await page.locator('[data-stab="acct"]').click()
  await page.locator('#nafran-assist-key').fill(key)
  await page.getByRole('button', { name: 'Save key' }).click()
  await page.getByText('Nafran Assist key saved securely on this device.', { exact: false }).waitFor()
  assert.equal((await page.evaluate(() => window.desktop.assist.status())).configured, true)
  const userData = await desktop.evaluate(({ app }) => app.getPath('userData'))
  const encrypted = readFileSync(join(userData, 'secrets', 'cerebras.key.enc'))
  assert.equal(encrypted.includes(Buffer.from(key)), false)
  console.log('PASS  new device saves the AI key encrypted and never shows it again')

  await page.getByRole('button', { name: 'Test connection' }).click()
  await page.getByText('Nafran Assist is working on this device', { exact: false }).waitFor()
  await page.locator('[data-assist="1"]').click()
  await page.locator('[data-chatinput="1"]').fill('hi')
  await page.locator('[data-chatinput="1"]').press('Enter')
  await page.getByText('Hello! I can help with your leads.', { exact: true }).waitFor()
  assert.ok(requests >= 2)
  console.log('PASS  connection test and chat both use the configured provider key')

  await page.getByRole('button', { name: 'Close chat' }).click()
  await page.getByRole('button', { name: 'Remove key' }).click()
  await page.getByText('Nafran Assist key removed from this device.', { exact: true }).waitFor()
  assert.equal((await page.evaluate(() => window.desktop.assist.status())).configured, false)
  console.log('PASS  removing the key disables AI on this device')
} finally {
  if (desktop) await desktop.close().catch(() => {})
  await new Promise((resolve) => provider.close(resolve))
  const tempRoot = realpathSync(tmpdir()) + sep
  if (realpathSync(directory).startsWith(tempRoot)) rmSync(directory, { recursive: true, force: true })
}
