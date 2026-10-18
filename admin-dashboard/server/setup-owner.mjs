import { stdin, stdout } from 'node:process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { hashOwnerPassword, normalizeOwnerEmail } from './owner-password.mjs'

async function hiddenPrompt(label) {
  if (!stdin.isTTY || !stdin.setRawMode) throw new Error('Run this setup in an interactive terminal so the password stays hidden.')
  stdout.write(label)
  stdin.setRawMode(true)
  stdin.resume()
  return new Promise((resolvePrompt, reject) => {
    let value = ''
    const finish = (error) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
      error ? reject(error) : resolvePrompt(value)
    }
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\r' || character === '\n') { finish(); return }
        if (character === '\u0003') { finish(new Error('Setup cancelled.')); return }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1)
        else if (character >= ' ' && character !== '\u007f') value += character
      }
    }
    stdin.on('data', onData)
  })
}

export async function setupOwner() {
  const directory = resolve(import.meta.dirname, '../..', '.secrets')
  const savedEmail = normalizeOwnerEmail(await readFile(resolve(directory, 'admin-owner-email.local'), 'utf8').catch(() => ''))
  const prompt = createInterface({ input: stdin, output: stdout })
  let email
  try { email = normalizeOwnerEmail((await prompt.question(`Owner Gmail address${savedEmail ? ` [${savedEmail}]` : ''}: `)).trim() || savedEmail) }
  finally { prompt.close() }
  if (!email || !email.endsWith('@gmail.com')) throw new Error('Enter a valid Gmail address.')
  const password = await hiddenPrompt('Choose a password (hidden, at least 12 characters): ')
  const confirmation = await hiddenPrompt('Confirm password (hidden): ')
  if (password !== confirmation) throw new Error('Passwords did not match.')
  const hash = await hashOwnerPassword(password)
  await mkdir(directory, { recursive: true })
  const path = resolve(directory, 'admin-owner.env')
  await writeFile(path, `ADMIN_OWNER_EMAIL=${email}\nADMIN_PASSWORD_HASH=${hash}\nADMIN_ALLOW_TOKEN_LOGIN=0\n`, { encoding: 'utf8', mode: 0o600, flag: process.argv.includes('--replace') ? 'w' : 'wx' })
  stdout.write(`Owner login saved in ${path}. Keep this file private and add its values to the admin server environment when you deploy.\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  setupOwner().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
