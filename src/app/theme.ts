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

// Hover and layout updates can change one property while the rest is already dark. Recover
// untouched properties from their light values before storing the updated source style.
function sourceStyle(current: string, original: string, applied: string): string {
  const parse = (css: string): CSSStyleDeclaration => {
    const style = document.createElement('span').style
    style.cssText = css
    return style
  }
  const live = parse(current)
  const before = parse(original)
  const tinted = parse(applied)
  const source = parse('')
  for (let index = 0; index < live.length; index += 1) {
    const prop = live.item(index)
    const value = live.getPropertyValue(prop)
    const priority = live.getPropertyPriority(prop)
    const unchanged = value === tinted.getPropertyValue(prop)
      && priority === tinted.getPropertyPriority(prop)
      && before.getPropertyValue(prop) !== ''
    source.setProperty(prop, unchanged ? before.getPropertyValue(prop) : value, unchanged ? before.getPropertyPriority(prop) : priority)
  }
  return source.cssText
}

export function skinElement(element: Element): void {
  const texty = Boolean(element.textContent && element.textContent.trim())
  for (const attribute of PAINTED) {
    const current = element.getAttribute(attribute)
    if (!current) {
      delete originalAttributes.get(element)?.[attribute]
      delete appliedAttributes.get(element)?.[attribute]
      continue
    }
    if (appliedAttributes.get(element)?.[attribute] === current) continue
    const originals = originalAttributes.get(element) ?? {}
    const applied = appliedAttributes.get(element) ?? {}
    const source = attribute === 'style' && originals.style && applied.style
      ? sourceStyle(current, originals.style, applied.style)
      : current
    const next = attribute === 'style' ? tintStyle(source, texty) : tintValue(attribute, source, texty)
    if (next === current && originals[attribute] === undefined) continue
    originals[attribute] = source
    applied[attribute] = next
    originalAttributes.set(element, originals)
    appliedAttributes.set(element, applied)
    if (next !== current) element.setAttribute(attribute, next)
  }
}

function skinTree(element: Element): void {
  skinElement(element)
  element.querySelectorAll('[style],[fill],[stroke]').forEach(skinElement)
}

function skinChanges(records: MutationRecord[]): void {
  records.forEach((record) => {
    if (record.type === 'attributes' && record.target.nodeType === 1) skinElement(record.target as Element)
    if (record.type === 'childList') record.addedNodes.forEach((node) => {
      if (node.nodeType === 1) skinTree(node as Element)
    })
  })
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
      observer = new MutationObserver(skinChanges)
      observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['style', 'fill', 'stroke'] })
    }
    return
  }
  if (observer) skinChanges(observer.takeRecords())
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
