// The reference app has no CSS variables. Every colour is inline, and dark mode works by
// remapping those colours in place (see src/app/themeMaps.ts). This module is a direct port
// of that behaviour: same property rules, same text-content heuristic, same observer.
import { INK, INK_RGB, SURF, SURF_RGB, SURF_T, SURF_T_RGB } from './themeMaps'

const INK_PROP = /^\s*(color|-webkit-text-fill-color|caret-color|fill|stroke)\s*$/
const PAINTED = ['style', 'fill', 'stroke'] as const

type Painted = (typeof PAINTED)[number]

const originalAttributes = new WeakMap<Element, Partial<Record<Painted, string>>>()
const appliedAttributes = new WeakMap<Element, Partial<Record<Painted, string>>>()

let observer: MutationObserver | null = null

function tintValue(prop: string, value: string, texty: boolean, forceInk = false): string {
  const ink = forceInk || INK_PROP.test(prop)
  const hex = ink ? INK : texty ? SURF_T : SURF
  const rgb = ink ? INK_RGB : texty ? SURF_T_RGB : SURF_RGB
  return value
    .replace(/#[0-9A-Fa-f]{6}/g, (hit) => hex[hit.toUpperCase()] ?? hit)
    .replace(
      /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*(?:[,\/]\s*([\d.]+)\s*)?\)/g,
      (full, r: string, g: string, b: string, a?: string) => {
        const hit = rgb[`${r},${g},${b}`]
        if (a === undefined || Number(a) >= 1) return hit ? `rgb(${hit})` : full
        if (ink) return hit ? `rgba(${hit},${a})` : full
        if (r === '255' && g === '255' && b === '255') return 'rgba(255,255,255,.07)'
        return hit ? `rgba(${hit},${a})` : full
      },
    )
}

function tintStyle(css: string, texty: boolean): string {
  const clipped = /background-clip\s*:\s*text/.test(css)
  return css
    .split(';')
    .map((declaration) => {
      const index = declaration.indexOf(':')
      if (index < 0) return declaration
      const prop = declaration.slice(0, index)
      const asInk = clipped && /^\s*(-webkit-)?background(-image)?\s*$/.test(prop)
      return `${prop}:${tintValue(prop, declaration.slice(index + 1), texty, asInk)}`
    })
    .join(';')
}

export function skinElement(element: Element): void {
  const texty = Boolean(element.textContent && element.textContent.trim())
  for (const attribute of PAINTED) {
    const current = element.getAttribute(attribute)
    if (!current || !/#|rgb/.test(current)) continue
    if (appliedAttributes.get(element)?.[attribute] === current) continue
    const next = attribute === 'style' ? tintStyle(current, texty) : tintValue(attribute, current, texty)
    if (next === current) continue
    const originals = originalAttributes.get(element) ?? {}
    const applied = appliedAttributes.get(element) ?? {}
    originals[attribute] = current
    applied[attribute] = next
    originalAttributes.set(element, originals)
    appliedAttributes.set(element, applied)
    element.setAttribute(attribute, next)
  }
}

function restore(): void {
  document.querySelectorAll('[style],[fill],[stroke]').forEach((element) => {
    const originals = originalAttributes.get(element)
    if (!originals) return
    for (const attribute of Object.keys(originals) as Painted[]) {
      const value = originals[attribute]
      if (value !== undefined) element.setAttribute(attribute, value)
    }
    originalAttributes.delete(element)
    appliedAttributes.delete(element)
  })
}

export function paintTheme(dark: boolean): void {
  document.body.setAttribute('data-theme', dark ? 'dark' : 'light')
  if (dark) {
    document.querySelectorAll('[style]').forEach(skinElement)
    document.querySelectorAll('[fill],[stroke]').forEach(skinElement)
    if (!observer) {
      observer = new MutationObserver((records) => {
        records.forEach((record) => {
          if (record.target.nodeType === 1) skinElement(record.target as Element)
        })
      })
      observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'fill', 'stroke'] })
    }
    return
  }
  observer?.disconnect()
  observer = null
  restore()
}

export function readStoredTheme(): boolean {
  try {
    return localStorage.getItem('ls-theme') === 'dark'
  } catch {
    return false
  }
}

export function storeTheme(dark: boolean): void {
  try {
    localStorage.setItem('ls-theme', dark ? 'dark' : 'light')
  } catch {
    // Storage can be unavailable; the in-memory theme still applies.
  }
}
