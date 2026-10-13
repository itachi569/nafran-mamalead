// Generates src/app/ReferenceApp.tsx from the bundled reference document.
//
// The reference app ships as a declarative template: static markup with {{ value }}
// bindings, <sc-for> loops and <sc-if> conditionals, where the values come from a
// renderVals() object. This script performs the mechanical half of the port · markup to
// JSX · so the design stays byte-for-byte faithful, and leaves the state half to
// src/app/useAppValues.ts, which must satisfy every binding referenced here.
//
// Usage: node scripts/build-reference-ui.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { parse } from 'parse5'
import { applyReferenceUiOverrides } from './reference-ui-overrides.mjs'

/**
 * Writes a generated file, and checks it landed.
 *
 * A generated file that reads back empty breaks the TypeScript build with a message about a module
 * that is not a module, which says nothing about the cause — a write that was truncated by
 * something else on the machine. Writing again is cheap, and saying so is cheaper than working it
 * out from the compiler's complaint.
 */
function writeGenerated(path, contents) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    writeFileSync(path, contents, 'utf8')
    if (readFileSync(path, 'utf8').length === contents.length) return
    console.warn(`[generate] ${path} did not land intact (attempt ${attempt}); writing it again`)
  }
  throw new Error(`could not write ${path} — it is still not what was generated`)
}

/**
 * Writes every generated file, and checks them all again at the end.
 *
 * A generated file has been seen to come back empty *after* being written — the check inside
 * `writeGenerated` passes, and the file is nothing by the time the compiler reads it, which fails
 * with "is not a module" and says nothing about the cause. The second pass is the repair: anything
 * that did not survive is written once more, and a file that will not stay written is an error
 * rather than a mystery in the type checker.
 */
const generated = new Map()
function generate(path, contents) {
  generated.set(path, contents)
  writeGenerated(path, contents)
}

function verifyGenerated() {
  for (const [path, contents] of generated) {
    if (readFileSync(path, 'utf8').length === contents.length) continue
    console.warn(`[generate] ${path} came back empty; writing it again`)
    writeGenerated(path, contents)
  }
}

const SRC = '.reference/markup.html'
const OUT = 'src/app/ReferenceApp.tsx'

const ATTR_RENAMES = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  minlength: 'minLength',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus',
  contenteditable: 'contentEditable',
  enctype: 'encType',
  accesskey: 'accessKey',
  srcset: 'srcSet',
  novalidate: 'noValidate',
  datetime: 'dateTime',
  usemap: 'useMap',
  frameborder: 'frameBorder',
  allowfullscreen: 'allowFullScreen',
  crossorigin: 'crossOrigin',
  spellcheck: 'spellCheck',
  preserveaspectratio: 'preserveAspectRatio',
  viewbox: 'viewBox',
  // The document writes React's own spelling, and HTML parsing lower-cases it on the way in. The
  // handler names are the ones React accepts, so they are restored here rather than passed through.
  onclick: 'onClick',
  oninput: 'onInput',
  onchange: 'onChange',
  onkeydown: 'onKeyDown',
  onkeyup: 'onKeyUp',
  onblur: 'onBlur',
  onfocus: 'onFocus',
  onsubmit: 'onSubmit',
  onscroll: 'onScroll',
  onmouseenter: 'onMouseEnter',
  onmouseleave: 'onMouseLeave',
  // The react-shaped props the document writes and HTML parsing lower-cases, like the handlers.
  defaultvalue: 'defaultValue',
  defaultchecked: 'defaultChecked',
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'track', 'wbr', 'col', 'area', 'base', 'embed', 'param'])

const referenced = new Set()
const loopAliasesByScope = []

let html = readFileSync(SRC, 'utf8')
const helmetEnd = html.indexOf('</helmet>')
if (helmetEnd >= 0) html = html.slice(helmetEnd + '</helmet>'.length)

const camel = (name) => name.replace(/[-:]([a-z])/g, (_, c) => c.toUpperCase())

function attrName(name) {
  if (name === 'class') return 'className'
  if (name === 'for') return 'htmlFor'
  if (name.startsWith('data-') || name.startsWith('aria-')) return name
  if (ATTR_RENAMES[name]) return ATTR_RENAMES[name]
  if (name === 'sc-raw-select') return 'select'
  if (name.includes('-') || name.includes(':')) return camel(name)
  return name
}

function activeAliases() {
  return new Set(loopAliasesByScope.flat())
}

/**
 * Emits a subtree with an alias in scope, the way the loop that will hold it does.
 *
 * A template is written once and emitted inside `sc-for`, so its bindings resolve against the loop
 * alias — `{{ h.label }}` becomes `h.label`, not a lookup on the values object of a name that is
 * not there. Anything that reads an emitted template before it is placed has to say which alias it
 * is being read under, which is what this does.
 */
function scope(alias, node) {
  loopAliasesByScope.push([alias])
  try {
    return emit(node, 0)
  } finally {
    loopAliasesByScope.pop()
  }
}

/**
 * Names the generated component holds itself, beside the values object.
 *
 * A row or a chip carries its own callback, and the callbacks live in a map in the component rather
 * than on the values, so a binding that names one of these maps is already an expression.
 */
const LOCAL_SCOPES = new Set(['socialPicks'])

function transformExpr(raw) {
  const expr = raw.trim().replace(/^\{\{/, '').replace(/\}\}$/, '').trim()
  if (/^(true|false|null|undefined)$/.test(expr) || /^-?\d+(\.\d+)?$/.test(expr)) return expr
  // An expression of its own rather than a name on the values object: a callback written out in the
  // document, a lookup into a map, or a call of one.
  if (/^[([]/.test(expr) || /^[A-Za-z_$][\w$]*\s*=>/.test(expr)) return expr
  if (LOCAL_SCOPES.has(expr.match(/^([A-Za-z_$][\w$]*)/)?.[1] ?? '')) return expr
  const root = expr.match(/^([A-Za-z_$][\w$]*)\./)
  if (root && activeAliases().has(root[1])) return expr
  const bare = expr.match(/^([A-Za-z_$][\w$]*)$/)
  if (bare) referenced.add(bare[1])
  else {
    const head = expr.match(/^([A-Za-z_$][\w$]*)/)
    if (head && !activeAliases().has(head[1])) referenced.add(head[1])
  }
  return `V.${expr}`
}

function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function jsxText(value) {
  const parts = []
  // The same shape the attribute binding uses: an expression may contain braces of its own, so a
  // closing `}}` that is followed by another one is part of the expression, not the end of it.
  const re = /\{\{([\s\S]*?)\}\}(?!\s*\})/g
  let last = 0
  let match
  const pushText = (text) => {
    if (!text) return
    parts.push(escapeText(text).replace(/\{/g, "{'{'}").replace(/\}/g, "{'}'}"))
  }
  while ((match = re.exec(value))) {
    pushText(value.slice(last, match.index))
    parts.push(`{${transformExpr(match[1])}}`)
    last = re.lastIndex
  }
  pushText(value.slice(last))
  return parts.join('')
}

// JSX drops whitespace that sits against a line break, which is where every text node lands
// once it is emitted on its own line. The reference keeps those spaces · a chip reads
// "High 95 12", not "High 9512" · so any that touch an edge are emitted explicitly.
function jsxEdgeText(value) {
  const text = jsxText(value)
  if (!text.trim()) return ''
  const lead = /^\s/.test(value) ? "{' '}" : ''
  const tail = /\s$/.test(value) ? "{' '}" : ''
  return `${lead}${text.replace(/^\s+/, '').replace(/\s+$/, '')}${tail}`
}

function styleObject(css) {
  // Style attributes in the reference repeat properties (a base colour plus a resolved one).
  // CSS resolves that by letting the last declaration win, so collapse to a single key here
  // rather than emitting an object literal TypeScript rejects. A declaration whose value is a
  // binding keeps its expression, which is how data-driven sizes reach the inline styles.
  const entries = new Map()
  for (const declaration of css.split(';')) {
    const index = declaration.indexOf(':')
    if (index < 0) continue
    const prop = declaration.slice(0, index).trim()
    const value = declaration.slice(index + 1).trim()
    if (!prop) continue
    const key = prop.startsWith('--') ? JSON.stringify(prop) : camel(prop)
    const binding = value.match(/^\{\{([^}]*)\}\}$/)
    entries.set(key, binding ? transformExpr(binding[1]) : JSON.stringify(value))
  }
  return `{${[...entries].map(([key, value]) => `${key}: ${value}`).join(', ')}}`
}

function attrValue(name, value) {
  if (name === 'style') {
    const single = value.trim().match(/^\{\{([\s\S]*)\}\}$/)
    if (single) return `style={${transformExpr(single[1])}}`
    return `style={${styleObject(value)}}`
  }
  const placeholders = [...value.matchAll(/\{\{([\s\S]*?)\}\}(?!\s*\})/g)]
  if (!placeholders.length) return `${name}=${JSON.stringify(value)}`
  if (placeholders.length === 1 && value.trim() === placeholders[0][0].trim()) {
    return `${name}={${transformExpr(placeholders[0][1])}}`
  }
  let template = ''
  let last = 0
  for (const match of placeholders) {
    template += value.slice(last, match.index).replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
    template += '${' + transformExpr(match[1]) + '}'
    last = match.index + match[0].length
  }
  template += value.slice(last).replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  return `${name}={\`${template}\`}`
}

function emit(node, depth) {
  const pad = '  '.repeat(depth)
  // Only elements and text are emittable. A loop's list is the expression that fills it, and a walk
  // that reached one would try to emit a string as if it were markup.
  if (!node || typeof node !== 'object') return ''
  if (node.nodeName === '#text') {
    const text = jsxEdgeText(node.value ?? '')
    return text.trim() ? `${pad}${text}\n` : ''
  }
  if (node.nodeName === '#comment') return ''
  if (node.nodeName === '#document' || node.nodeName === '#document-fragment') {
    return (node.childNodes ?? []).map((child) => emit(child, depth)).join('')
  }
  if (!node.tagName) return ''

  const tag = node.tagName
  if (tag === 'script') return ''
  if (tag === 'body') return node.childNodes.map((child) => emit(child, depth)).join('')

  const attrs = new Map((node.attrs ?? []).map((attr) => [attr.name, attr.value]))
  if (tag === 'sc-if') {
    const condition = transformExpr(attrs.get('value') ?? 'false')
    const children = node.childNodes.map((child) => emit(child, depth + 1)).join('')
    // `shows` is what decides whether the section is on screen: the document writes false as the
    // string `'0'` as well as the boolean, and `'0'` is truthy, so a bare check would show every
    // section at once. The helper covers both spellings and anything else that means "nothing".
    return `${pad}{shows(${condition}) ? (\n${pad}  <>\n${children}${pad}  </>\n${pad}) : null}\n`
  }
  if (tag === 'sc-for') {
    const list = transformExpr(attrs.get('list') ?? '[]')
    const alias = attrs.get('as') ?? 'item'
    loopAliasesByScope.push([alias])
    const children = node.childNodes.map((child) => emit(child, depth + 2)).join('')
    loopAliasesByScope.pop()
    return `${pad}{(${list} ?? []).map((${alias}, __i${alias}) => (\n${pad}  <Fragment key={__i${alias}}>\n${children}${pad}  </Fragment>\n${pad}))}\n`
  }

  const outTag = tag === 'sc-raw-select' ? 'select' : tag
  const rendered = []
  for (const [rawName, rawValue] of attrs) {
    if (rawName.startsWith('hint-placeholder')) continue
    if (rawName.startsWith('sc-camel-')) {
      const prop = camel(rawName.slice('sc-camel-'.length))
      rendered.push(attrValue(prop, rawValue))
      continue
    }
    // The document's own lowercase handlers, which React spells differently. Without this the
    // generated element carries `oninput` as an unknown attribute instead of a handler.
    // `data-demo` was the reference export's name for a delegated click hook. It is an internal
    // production action in this app, so do not ship the design's demo marker to the DOM.
    const prop =
      rawName === 'data-demo'
        ? 'data-action'
        : rawName === 'oninput'
          ? 'onInput'
          : rawName === 'onchange'
            ? 'onChange'
            : attrName(rawName)
    rendered.push(attrValue(prop, rawValue))
  }
  const open = rendered.length ? `<${outTag} ${rendered.join(' ')}` : `<${outTag}`
  if (VOID_TAGS.has(outTag) && !node.childNodes.length) return `${pad}${open} />\n`

  const children = (node.childNodes ?? []).map((child) => emit(child, depth + 1)).join('')
  if (!children.trim()) {
    if (VOID_TAGS.has(outTag)) return `${pad}${open} />\n`
    return `${pad}${open}></${outTag}>\n`
  }
  const inline = (node.childNodes ?? []).every((child) => child?.nodeName === '#text')
  if (inline) {
    const text = (node.childNodes ?? []).map((child) => jsxEdgeText(child.value ?? '')).join('')
    return `${pad}${open}>${text}</${outTag}>\n`
  }
  return `${pad}${open}>\n${children}${pad}</${outTag}>\n`
}

// ---------------------------------------------------------------- social page data binding
//
// The reference document paints the Social Profiles page with fixed sample rows. The markup
// below turns those same rows into a template: identical elements and inline styles, with the
// text and the few dynamic attributes replaced by bindings. Nothing is redesigned · each
// variant the page already contained (a chip, "No profiles found", the Done and Pending pills)
// is reused, so the rendered result is unchanged when the data matches.

const XHTML = 'http://www.w3.org/1999/xhtml'

const htmlElement = (tag, attrs = [], children = []) => ({ nodeName: tag, tagName: tag, namespaceURI: XHTML, attrs, childNodes: children, parentNode: null })
const textNode = (value) => ({ nodeName: '#text', value })
const childElements = (node) => (node.childNodes ?? []).filter((child) => child && child.tagName)
const getAttr = (node, name) => node.attrs?.find((attr) => attr.name === name)?.value

/**
 * The click handler on a node, whichever spelling the export gave it.
 *
 * The design tool writes a handler as `onClick` in a `.dc.html` source and as `sc-camel-on-click` in
 * a bundled export of the same document — the two are the same interface, exported two ways. A
 * binder that has to find a button by the action it runs therefore has to accept both, or it works
 * against one export and silently skips the other.
 */
function clickHandlerOf(node) {
  for (const name of ['onclick', 'sc-camel-on-click']) {
    const value = getAttr(node, name)
    if (value) return value
  }
  return undefined
}

/** The first node under `within` whose own action is the binding named. */
function findByHandler(within, binding) {
  return findElement(within, (node) => clickHandlerOf(node) === binding)
}

/**
 * Takes an attribute off a node by the React prop it becomes, whatever the export called it.
 *
 * The same prop arrives as `defaultValue` from a `.dc.html` source and as `sc-camel-default-value`
 * from a bundled export, because the tool rewrites its own props on the way out. Reading it by the
 * prop it ends up as means a binder works against either export instead of silently doing nothing
 * against one of them.
 */
function takeAttr(node, prop) {
  const match = (node.attrs ?? []).find((entry) => {
    const name = entry.name.startsWith('sc-camel-') ? camel(entry.name.slice('sc-camel-'.length)) : entry.name
    return name.toLowerCase() === prop.toLowerCase()
  })
  if (!match) return undefined
  node.attrs = node.attrs.filter((entry) => entry !== match)
  return match.value
}
const textOf = (node) => {
  if (!walkable(node)) return ''
  return (node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(textOf).join('')).replace(/\s+/g, ' ').trim()
}

function setAttr(node, name, value) {
  const attr = node.attrs.find((entry) => entry.name === name)
  if (attr) attr.value = value
  else node.attrs.push({ name, value })
}

/**
 * Walks a node, skipping anything that is not one.
 *
 * `childNodes` normally holds elements and text, but a loop's list is the expression string that
 * fills it, and a walk that iterates a string walks its characters. Nothing here should ever treat
 * a binding as a node.
 */
function walkable(node) {
  return node && typeof node === 'object'
}

function findElement(node, predicate) {
  if (!walkable(node)) return null
  if (node.tagName && predicate(node)) return node
  for (const child of node.childNodes ?? []) {
    const found = findElement(child, predicate)
    if (found) return found
  }
  return null
}

function cloneNode(node) {
  if (node.nodeName === '#text') return textNode(node.value)
  return htmlElement(node.tagName, (node.attrs ?? []).map((attr) => ({ ...attr })), (node.childNodes ?? []).map(cloneNode))
}

/**
 * Points every node at the one above it.
 *
 * Several binders walk up from an element they can find to the card or the list that holds it, and
 * a parsed tree has no parent links until this runs. It is done once, on the whole document, so no
 * binder has to guess how many levels up its element sits.
 */
function linkParents(node, parent = null) {
  if (!walkable(node)) return
  node.parentNode = parent
  for (const child of node.childNodes ?? []) linkParents(child, node)
}

function replaceText(node, from, to) {
  const text = findTextNode(node, from)
  if (!text) throw new Error(`expected to find the text "${from}" while binding the Social Profiles page`)
  text.value = to
}

/**
 * Rewrites a run of text if the document still carries it.
 *
 * The document is both the input and, once it has been edited, the source of truth: a phrase this
 * script already replaced is not there to replace again, and re-running the generator must not fail
 * over work it has already done. The caller is told which way it went so it can bind the rest of
 * the element accordingly.
 */
function replaceTextIfPresent(node, from, to) {
  const text = findTextNode(node, from)
  if (!text) return false
  text.value = to
  return true
}

function findTextNode(node, value) {
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === '#text' && child.value.trim() === value) return child
    const nested = findTextNode(child, value)
    if (nested) return nested
  }
  return null
}

function setText(node, value) {
  node.childNodes = [textNode(value)]
}

// A text node worth rewriting is rarely equal to what it prints: "128 SAVED" keeps its count
// beside a dot, "24 leads" its noun, and "Showing 8 of 128 saved leads" two numbers. These
// helpers rewrite one part of a node in place and leave the rest of the string alone, so the
// markup keeps wrapping its content in the elements it always used.
function replaceTextValue(node, from, to) {
  const found = findTextNodeValue(node, from)
  if (!found) throw new Error(`expected to find the text "${from}" while binding a page`)
  found.value = found.value.replace(from, to)
}

/** The same rewrite, for a document that may already carry it. Says which way it went. */
function replaceTextValueIfPresent(node, from, to) {
  const found = findTextNodeValue(node, from)
  if (!found) return false
  found.value = found.value.replace(from, to)
  return true
}

function findTextNodeValue(node, value) {
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === '#text' && child.value.includes(value)) return child
    const nested = findTextNodeValue(child, value)
    if (nested) return nested
  }
  return null
}

/** The ul that directly holds the data-row li elements, which the rows themselves do not know. */
function owningList(rowElement) {
  let node = rowElement.parentNode
  while (node && !(node.tagName === 'ul' && childElements(node).some((child) => getAttr(child, 'data-row') === '1'))) {
    node = node.parentNode
  }
  return node
}

/**
 * The nearest ul under the given root that holds the chosen element. parse5 gives real elements
 * their parent links, so this walks up from a row that came out of the parsed document.
 */
function listHolding(root, element) {
  const lists = []
  const collect = (node) => {
    if (node.tagName === 'ul') lists.push(node)
    for (const child of node.childNodes ?? []) collect(child)
  }
  collect(root)
  return lists.find((list) => childElements(list).includes(element)) ?? null
}

/** Every element under the root that the predicate accepts. */
function findAll(root, predicate) {
  const found = []
  const walk = (node) => {
    if (predicate(node)) found.push(node)
    for (const child of node.childNodes ?? []) walk(child)
  }
  walk(root)
  return found
}

const loop = (list, alias, children) => htmlElement('sc-for', [{ name: 'list', value: list }, { name: 'as', value: alias }], children)
const when = (value, children) => htmlElement('sc-if', [{ name: 'value', value }], children)

function socialView(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isSocial }}')
  if (!view) throw new Error('could not find the Social Profiles view in the reference markup')
  return view
}

function bindSocialList(view) {
  const list = findElement(view, (node) => node.tagName === 'ul' && getAttr(node, 'data-soclist') === '1')
  if (!list) throw new Error('could not find the social profiles list')
  const items = childElements(list).filter((node) => node.tagName === 'li')
  const spansOf = (item) => childElements(item)
  const isChipRow = (item) => childElements(spansOf(item)[4] ?? {}).some((chip) => getAttr(chip, 'title'))

  const chipRow = items.find(isChipRow)
  const plainRow = items.find((item) => !isChipRow(item))
  if (!chipRow || !plainRow) throw new Error('expected a row with chips and a row without')

  const row = cloneNode(chipRow)
  const spans = spansOf(row)
  replaceText(spans[1], textOf(spans[1]), '{{ s.index }}')
  setText(spans[2], '{{ s.name }}')
  setAttr(spans[3], 'title', '{{ s.domain }}')
  setText(spans[3], '{{ s.domain }}')

  const chip = cloneNode(childElements(spansOf(chipRow)[4])[0])
  setAttr(chip, 'title', '{{ p.label }}')
  setText(chip, '{{ p.short }}')
  const blank = cloneNode(childElements(spansOf(plainRow)[4])[0])
  spans[4].childNodes = [loop('{{ s.profiles }}', 'p', [chip]), when('{{ s.noProfiles }}', [blank])]

  const pillFor = (label) => items.map((item) => spansOf(item)[5]).find((pill) => pill && textOf(pill) === label)
  const statusAt = row.childNodes.indexOf(spans[5])
  row.childNodes.splice(statusAt, 1, when('{{ s.isDone }}', [cloneNode(pillFor('Done'))]), when('{{ s.isPending }}', [cloneNode(pillFor('Pending'))]))

  const stateRow = htmlElement('li', [{ name: 'style', value: 'display:flex;align-items:center;gap:10px;padding:13px 0;border-top:1px solid #E4E5E2;color:#5A5F5C;font-size:13.5px' }], [textNode('{{ socialState }}')])
  list.childNodes = [when('{{ socialState }}', [stateRow]), loop('{{ socialRows }}', 's', [row])]
}

function bindSocialDonuts(view) {
  const arc = findElement(view, (node) => getAttr(node, 'stroke-dashoffset'))
  if (!arc) throw new Error('could not find the platform coverage rings')
  // circle · · svg · · ring span · · card · · container
  const card = arc.parentNode.parentNode.parentNode
  const container = card.parentNode
  const template = cloneNode(card)
  replaceText(template, '79', '{{ c.pct }}')
  replaceText(template, '27 leads', '{{ c.count }} leads')
  replaceText(template, 'Instagram', '{{ c.label }}')
  const arcTemplate = findElement(template, (node) => getAttr(node, 'stroke-dashoffset'))
  setAttr(arcTemplate, 'stroke-dashoffset', '{{ c.offset }}')
  container.childNodes = [loop('{{ socialDonuts }}', 'c', [template])]
}

function bindSocialExtras(view) {
  const bar = findElement(view, (node) => /#8FA382/.test(getAttr(node, 'style') ?? ''))
  if (!bar) throw new Error('could not find the secondary platform list')
  // bar · · track · · item · · list
  const list = bar.parentNode.parentNode.parentNode
  const template = cloneNode(bar.parentNode.parentNode)
  replaceText(template, 'yt', '{{ p.short }}')
  replaceText(template, 'YouTube', '{{ p.label }}')
  replaceText(template, '9', '{{ p.count }}')
  const barTemplate = findElement(template, (node) => /#8FA382/.test(getAttr(node, 'style') ?? ''))
  setAttr(barTemplate, 'style', (getAttr(barTemplate, 'style') ?? '').replace(/width:[^;]+/, 'width:{{ p.width }}'))
  list.childNodes = [loop('{{ socialExtras }}', 'p', [template])]
}

function bindSocialRefresh(view) {
  const button = findElement(view, (node) => getAttr(node, 'data-socrefresh') === '1')
  if (!button) throw new Error('could not find the Refresh button on the Social Profiles page')
  setAttr(button, 'sc-camel-on-click', '{{ refreshSocial }}')
}

/**
 * The line above the list states how many leads the table is drawn from.
 *
 * It counts the social page's own read, not the whole ledger: the page reads every lead it can and
 * the search and the filter narrow that, so a figure taken from elsewhere would describe a
 * different set of rows than the table shows. Each replacement is skipped when the document already
 * carries the binding, so this is safe to run over a document that has been through it once.
 */
function bindSocialHeader(view) {
  replaceTextValueIfPresent(view, 'Showing 10 of 128 leads.', 'Showing {{ socialShowing }} of {{ socialTotal }} leads.')
  // The reach card repeats the same population beside its share.
  replaceTextValueIfPresent(view, 'of 128 leads · 27%', 'of {{ socialTotal }} leads · {{ socialReachPct }}%')
}

/**
 * The search box and the platform filter above the list, both of which narrow it.
 *
 * They are uncontrolled in the reference: the box reports every keystroke and the select reports
 * its value, and what they are set to lives in the hook rather than in the DOM.
 */
function bindSocialControls(view) {
  for (const [marker, handler] of [
    ['data-socsearch', '{{ onSocialSearch }}'],
    ['data-socfilter', '{{ onSocialFilter }}'],
  ]) {
    const control = findElement(view, (node) => getAttr(node, marker) === '1')
    if (!control) throw new Error(`could not find the social ${marker} control`)
    setAttr(control, marker === 'data-socsearch' ? 'oninput' : 'onchange', handler)
  }
  // The toolbar's Import button opens the modal; the modal's own button runs the import.
  const opener = findElement(view, (node) => node.tagName === 'button' && textOf(node).trim() === 'Import profiles')
  if (!opener) throw new Error('could not find the Import profiles button on the Social Profiles page')
  setAttr(opener, 'sc-camel-on-click', '{{ openSocialImp }}')
}

/** The modal that turns a pasted list of profile URLs into profiles on the leads they name. */
function bindSocialImportModal(view) {
  const box = findElement(view, (node) => getAttr(node, 'data-socimpinput') === '1')
  if (!box) throw new Error('could not find the social import textarea')
  setAttr(box, 'oninput', '{{ onSocialImpInput }}')

  const platform = findElement(view, (node) => getAttr(node, 'data-socimpplatform') === '1')
  if (!platform) throw new Error('could not find the social import platform control')
  setAttr(platform, 'onchange', '{{ onSocialImpPlatform }}')

  // The modal's own two buttons, found by their markers: the run button's label is a binding now
  // ("Import 2 profiles"), so there is no fixed text to find it by.
  for (const [marker, handler] of [
    ['data-socimpgo', '{{ runSocialImp }}'],
    ['data-socimpcancel', '{{ closeSocialImp }}'],
  ]) {
    const button = findElement(view, (node) => getAttr(node, marker) === '1')
    if (!button) throw new Error(`could not find the ${marker} button in the social import modal`)
    setAttr(button, 'sc-camel-on-click', handler)
  }
}

/**
 * Lifts the controls out of the Profiles card and makes them a bar at the top of the page.
 *
 * The reference draws the heading, the search, the filter and the buttons inside the same card as
 * the list. That card holds every row — twelve thousand pixels of it with a real database behind it
 * — and a sticky element cannot leave its own container, so the controls scrolled away with the
 * card. They become a bar of their own above it, and the list keeps a card to itself.
 */
function restructureSocialToolbar(root) {
  const view = socialView(root)
  const card = findElement(view, (node) => getAttr(node, 'data-card') === '1' && textOf(node).includes('Profiles'))
  if (!card) throw new Error('could not find the Profiles card on the Social Profiles page')
  const children = childElements(card)
  const header = children[0]
  const rows = children.find((node) => getAttr(node, 'data-rowsblock') === '1')
  if (!header || !rows || header === rows) throw new Error('the Profiles card is not shaped as expected')
  if (!/Profiles/i.test(textOf(header))) throw new Error('the first child of the Profiles card is not its heading')

  // The card's own look is split between the two: the bar keeps the padding and the surface, the
  // list keeps them too, and only the bar is pinned. Everything that is not the table stays up in
  // the bar — the recent searches sit there, beside the search box that fills them.
  const decor = (getAttr(card, 'style') ?? '').replace(/transition:[^;]*;?/, '')
  setAttr(card, 'data-soctoolbar', '1')
  setAttr(card, 'style', `position:sticky;top:clamp(6px,1vh,12px);z-index:20;margin-bottom:clamp(12px,1.5vw,20px);${decor}`)
  card.childNodes = children.filter((node) => node !== rows)
  for (const child of card.childNodes) child.parentNode = card

  // The table keeps a card of its own, with the same surface the heading used to share with it.
  const list = htmlElement('section', [
    { name: 'data-card', value: '1' },
    { name: 'style', value: decor },
  ], [rows])
  rows.parentNode = list

  // The card sits inside one of the view's layout blocks, not directly under the wrapper, so the
  // list goes in beside it and the bar stays where the card already is.
  const holder = card.parentNode
  if (!holder || !(holder.childNodes ?? []).includes(card)) throw new Error('the Profiles card has no parent to sit in')
  const index = holder.childNodes.indexOf(card)
  holder.childNodes.splice(index + 1, 0, list)
}

/**
 * The row of searches made before, under the search box.
 *
 * The sample chip becomes a template: the term is its text, the count rides along in the muted
 * span the reference already draws beside it, and picking one runs that search again. The line
 * that says searches are kept here is shown only while there are none to show.
 */
function bindSocialRecents(view) {
  const row = findElement(view, (node) => getAttr(node, 'data-socrecents') === '1')
  if (!row) throw new Error('could not find the recent-searches row on the Social Profiles page')
  const chip = findElement(row, (node) => getAttr(node, 'data-socrecent') === '1')
  if (!chip) throw new Error('could not find the sample search chip')
  const empty = findElement(row, (node) => getAttr(node, 'data-socrecentempty') === '1')
  if (!empty) throw new Error('could not find the empty history note')

  const template = cloneNode(chip)
  replaceText(template, 'physio', '{{ h.label }}')
  // The element the count rides in, looked for among the chip's children: the chip is a span too,
  // and a search that starts at the node itself would find the chip and overwrite its contents.
  const count = childElements(template).find((node) => node.tagName === 'span')
  if (count) {
    count.childNodes = [when('{{ h.hasCount }}', [textNode('{{ h.count }}')])]
    setAttr(count, 'data-soccount', '{{ h.hasCount }}')
  }
  template.attrs = [
    ...template.attrs.filter((attr) => attr.name !== 'sc-camel-on-click'),
    // The chip names its own term, and the callback that runs on it is looked up by that term: a
    // search term is data, so there is nothing fixed to bind the click to.
    { name: 'sc-camel-on-click', value: '{{ () => { socialPicks[h.term]?.() } }}' },
  ]
  // Read once under the alias the loop will hold it in, which is what turns `{{ h.label }}` into a
  // reference to the row rather than a lookup for a name the values object has never heard of.
  scope('h', template)

  row.childNodes = [
    ...row.childNodes.slice(0, row.childNodes.indexOf(chip)),
    when('{{ socialHistoryOn }}', [loop('{{ socialHistory }}', 'h', [template])]),
    when('{{ socialHistoryOff }}', [empty]),
  ]
}

/** The history panel's rows.
 *
 * The reference draws this list in its prototype rather than in the document, so the row is built
 * here out of the same parts the document uses elsewhere: the icon tile, the two lines beside it,
 * the chevron, and the panel that opens under an entry with what it was about.
 */
function bindSocialLog(view) {
  const list = findElement(view, (node) => getAttr(node, 'data-shlist') === '1')
  if (!list) throw new Error('could not find the history list on the Social Profiles page')

  const span = (style, child) => htmlElement('span', [{ name: 'style', value: style }], [child])
  const line = (style, value) => htmlElement('span', [{ name: 'style', value: style }], [textNode(value)])
  const cell = htmlElement('span', [{ name: 'style', value: 'min-width:0' }], [
    line('display:block;font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', '{{ e.title }}'),
    line('display:block;margin-top:2px;font-size:12px;color:#5A5F5C', '{{ e.meta }}'),
  ])
  const tile = htmlElement('span', [
    { name: 'data-shkind', value: '{{ e.kind }}' },
    { name: 'aria-hidden', value: 'true' },
    { name: 'style', value: 'display:grid;place-items:center;width:32px;height:32px;border-radius:10px;font-size:13px' },
  ], [textNode('{{ e.icon }}')])

  const toggle = htmlElement('button', [
    { name: 'type', value: 'button' },
    { name: 'aria-expanded', value: '{{ e.open === "1" }}' },
    { name: 'data-shrow', value: '1' },
    { name: 'style', value: 'display:grid;grid-template-columns:34px minmax(0,1fr) 16px;align-items:center;gap:12px;width:100%;padding:12px 0;border:0;background:transparent;font-family:inherit;color:inherit;text-align:left;cursor:pointer' },
    { name: 'sc-camel-on-click', value: '{{ e.toggle }}' },
  ], [
    tile,
    cell,
    htmlElement('span', [
      { name: 'data-chev', value: '{{ e.open }}' },
      { name: 'aria-hidden', value: 'true' },
      { name: 'style', value: 'font-size:12px;color:#4A4F4B;transition:transform .3s cubic-bezier(.22,1,.36,1)' },
    ], [textNode('⌄')]),
  ])

  const item = htmlElement(
    'li',
    [{ name: 'style', value: 'font-size:13px;line-height:1.5;color:#1C1C1C;overflow-wrap:anywhere;user-select:text' }],
    [textNode('{{ it.text }}')],
  )
  const run = htmlElement('button', [
    { name: 'type', value: 'button' },
    { name: 'data-shist', value: '1' },
    { name: 'style', value: 'margin-top:10px;height:30px;padding:0 12px;border:0;border-radius:999px;background:#1C1C1C;color:#F0F0F0;font-family:inherit;font-size:12px;cursor:pointer' },
    { name: 'sc-camel-on-click', value: '{{ e.run }}' },
  ], [textNode('Run again')])

  const detail = htmlElement(
    'div',
    [{ name: 'style', value: 'margin:0 0 12px 46px;padding:12px 14px;border-radius:14px;background:#EAEAE8;animation:lsPanelIn .35s cubic-bezier(.22,1,.36,1) both' }],
    [
      when('{{ e.hasItems }}', [
        htmlElement('ol', [{ name: 'style', value: 'list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px' }], [
          loop('{{ e.items }}', 'it', [item]),
        ]),
      ]),
      when('{{ e.canRun }}', [run]),
    ],
  )

  const row = htmlElement('li', [{ name: 'style', value: 'border-top:1px solid #E4E5E2' }], [
    toggle,
    when('{{ e.isOpen }}', [detail]),
  ])
  // Read once under the alias the loop will hold it in, which is what makes `{{ e.title }}` a
  // reference to the row rather than a lookup for a name the values object has never heard of.
  scope('e', row)
  list.childNodes = [loop('{{ shRows }}', 'e', [row])]
}

/** The history panel: the toolbar button that opens it, and the tabs inside it. */
function bindSocialHistory(view) {
  const opener = findElement(view, (node) => getAttr(node, 'data-shistopen') === '1')
  if (!opener) throw new Error('could not find the History button on the Social Profiles page')
  setAttr(opener, 'sc-camel-on-click', '{{ openShist }}')

  // The tabs are found inside the panel itself: "All" is also how the filter dropdown above reads,
  // and a search from the view would find that one first.
  const panel = findElement(view, (node) => node.tagName === 'aside' && getAttr(node, 'aria-label') === 'Social history')
  if (!panel) throw new Error('could not find the history panel on the Social Profiles page')
  const tabs = { All: '{{ shAll }}', Searches: '{{ shSearch }}', Imports: '{{ shImport }}' }
  for (const [label, handler] of Object.entries(tabs)) {
    const button = findElement(panel, (node) => getAttr(node, 'data-r') === label)
    if (!button) throw new Error(`could not find the ${label} tab in the history panel`)
    setAttr(button, 'sc-camel-on-click', handler)
  }
}

/** The import modal's preview: one line per pasted URL, and what the import will make of it. */
function bindSocialImportPreview(view) {
  const list = findElement(view, (node) => getAttr(node, 'data-socimprows') === '1')
  if (!list) throw new Error('could not find the import preview list on the Social Profiles page')

  const tag = htmlElement('span', [
    { name: 'data-imptag', value: '{{ r.kind }}' },
    { name: 'style', value: 'display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#E3E4E1;font-size:11px;font-weight:700;flex:none' },
  ], [textNode('{{ r.tag }}')])
  const name = htmlElement('span', [
    { name: 'style', value: 'display:block;font-size:13px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' },
  ], [textNode('{{ r.handle }}')])
  const detail = htmlElement('span', [
    { name: 'style', value: 'display:block;margin-top:2px;font-size:12px;color:#5A5F5C' },
  ], [textNode('{{ r.detail }}')])
  const result = htmlElement('span', [
    { name: 'data-impresult', value: '{{ r.kind }}' },
    { name: 'style', value: 'font-size:11.5px;font-weight:500;padding:5px 10px;border-radius:999px;background:#EAEAE8;white-space:nowrap;flex:none' },
  ], [textNode('{{ r.result }}')])

  const row = htmlElement('li', [
    { name: 'data-improw', value: '1' },
    { name: 'style', value: 'display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:14px;background:#F1F1EF' },
  ], [tag, htmlElement('span', [{ name: 'style', value: 'flex:1;min-width:0' }], [name, detail]), result])

  // Read under the alias the loop will hold it in, as the other row templates are.
  scope('r', row)
  list.childNodes = [loop('{{ importPreview }}', 'r', [row])]
}

/**
 * The scan overlay's rows.
 *
 * One line per pasted URL, ticked as its profile lands. The reference animates these in its
 * prototype; here they are the real work — each row is one URL the import is filing.
 */
function bindSocialScanRows(root) {
  const list = findElement(root, (node) => getAttr(node, 'data-scanrows') === '1')
  if (!list) throw new Error('could not find the scan overlay list')
  const row = htmlElement('li', [
    { name: 'data-scanrow', value: '1' },
    { name: 'style', value: 'display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:14px;background:#EAEAE8' },
  ], [
    htmlElement('span', [
      { name: 'data-scanstate', value: '{{ s.state }}' },
      { name: 'style', value: 'display:grid;place-items:center;width:22px;height:22px;border-radius:999px;background:#C8D5BB;font-size:11px;flex:none' },
    ], [textNode('{{ s.mark }}')]),
    htmlElement('span', [
      { name: 'style', value: 'flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' },
    ], [textNode('{{ s.url }}')]),
    htmlElement('span', [
      { name: 'style', value: 'font-size:12px;color:#5A5F5C;white-space:nowrap' },
    ], [textNode('{{ s.note }}')]),
  ])
  scope('s', row)
  list.childNodes = [loop('{{ scanRows }}', 's', [row])]
}

/**
 * The Social Profiles page.
 *
 * The updated design draws its own rows, rings and controls, so there is almost nothing left to
 * rebuild here: what this adds is the two lists the document still writes out by hand — the
 * history panel's entries and the scan overlay's — and the markers the automated checks find the
 * page's controls by. The document binds everything else itself.
 */
/**
 * The Social Profiles page.
 *
 * The updated design writes its own rows, rings, chips and controls, binds them itself, and covers
 * the states this page needs — the history panel's entries, the scan overlay, the coverage bars.
 * There is nothing left to rebuild from sample rows, so what this does is mark the controls the
 * automated checks find the page by, and take out the sample rows the document still ships as
 * placeholders for what the database returns.
 */
/**
 * Runs a binder, or says which part of the design it no longer recognises.
 *
 * The updated design draws several pages itself — their rows, rings, chips and controls are all in
 * the document, bound by the document — so a binder written for the previous shape has nothing left
 * to find. Skipping it with a line of output keeps one unfinished page from stopping the build,
 * which is how a page that has not been brought over yet is meant to behave.
 */
function tryBind(name, run) {
  try {
    run()
  } catch (error) {
    console.warn(`[generate] skipped ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Marks the recent-search chips of one page and takes the history panel's marker off them.
 *
 * The document gives a chip and the panel's own "Run again" button the same attribute, because they
 * do the same thing to the same term. They are still different controls — one sits in the toolbar,
 * the other inside the drawer — and a check that works one must not find the other, so the chips
 * get a marker of their own and give the shared one up.
 */
function markRecentChips(scope) {
  const chips = findElements(scope, (node) => node.tagName === 'button' && getAttr(node, 'data-shist') === '1')
  for (const chip of chips) {
    const inDrawer = (() => {
      let current = chip
      while (current && current !== current.parentNode) {
        if (current.tagName === 'aside') return true
        current = current.parentNode
      }
      return false
    })()
    if (inDrawer) continue
    chip.attrs = chip.attrs.filter((entry) => entry.name !== 'data-shist')
    setAttr(chip, 'data-socrecent', '1')
  }
}

function bindSocialPage(root) {
  const view = socialView(root)
  tryBind('bindSocialHeader', () => bindSocialHeader(view))

  const mark = (predicate, attribute, value = '1') => {
    const found = findElement(view, predicate)
    if (found) setAttr(found, attribute, value)
    return found
  }
  mark((node) => node.tagName === 'button' && /^History/.test(textOf(node)), 'data-shistopen')
  mark((node) => node.tagName === 'button' && textOf(node).trim() === 'Refresh', 'data-socrefresh')
  // The updated design has one Import button per page and one shared modal, so the button that
  // opens it is marked on the page whose import it is, and the modal's own parts are marked once.
  mark((node) => node.tagName === 'button' && /^Import/.test(textOf(node)), 'data-socimpopen')
  mark((node) => node.tagName === 'button' && textOf(node).trim() === 'Show all leads', 'data-exitscan')
  mark((node) => getAttr(node, 'data-socq') === '1', 'data-socsearch')
  mark((node) => getAttr(node, 'data-soclist') === '1', 'data-soclist')
  // The recent-search chips: each one re-runs the term it carries.
  markRecentChips(view)
  // The state filter beside the search box: the design leaves it unmarked, so the check that works
  // it finds it by the label the design gave it. The design writes a real `<select>` as
  // `sc-raw-select`, so both spellings have to count.
  mark(
    (node) =>
      (node.tagName === 'select' || node.tagName === 'sc-raw-select') && getAttr(node, 'aria-label') === 'Profile state',
    'data-socfilter',
  )

  // The scan panel is bound with the other shared dialogs: it sits outside every view, beside the
  // history drawer and the import modal, because a scan can be started from any page.

  const search = findElement(view, (node) => getAttr(node, 'data-socsearch') === '1')
  const bar = search
    ? (() => {
        let current = search
        while (current && current !== current.parentNode) {
          if (/position:\s*sticky/.test(getAttr(current, 'style') ?? '')) return current
          current = current.parentNode
        }
        return null
      })()
    : null
  if (bar) setAttr(bar, 'data-soctoolbar', '1')

  // The AI Insights line: the design states a fixed overlap between two platforms, which is a
  // claim about a workspace it never saw. It is rebuilt from the platform totals on the page.
  const insight = findElement(view, (node) => node.tagName === 'p' && /overlap on \d+ leads/.test(textOf(node)))
  if (insight) setText(insight, '{{ socialInsight }}')

  // The search box is controlled, so a remembered term picked from the chips appears in it: the
  // design writes `defaultValue`, which React reads once and never again.
  if (search) {
    const value = takeAttr(search, 'defaultValue')
    if (value) setAttr(search, 'value', value)
  }

  // The sample rows are placeholders: the list is drawn from state, so they come out. The state row
  // goes in first — a search that matches nothing has to say so rather than leaving the card blank,
  // and it is the list's own first child so it reads as one of the rows.
  const list = findElement(view, (node) => getAttr(node, 'data-soclist') === '1')
  if (list) {
    list.childNodes = (list.childNodes ?? []).filter((child) => !isSampleRow(child))
    const stateRow = htmlElement(
      'li',
      [{ name: 'style', value: 'display:flex;align-items:center;gap:10px;padding:13px 0;border-top:1px solid #E4E5E2;color:#5A5F5C;font-size:13.5px' }],
      [textNode('{{ socialState }}')],
    )
    list.childNodes = [when('{{ socialState }}', [stateRow]), ...list.childNodes]
  }
}

/**
 * The DataForSEO key, as a Settings row.
 *
 * The design's Account tab is a list of rows — a label, the value, and a button that acts on it —
 * and the deep pass needs the same thing for the one credential the app asks the user for. The row
 * is built from that list's own first row, so it is the same shape as the ones around it rather
 * than a new kind of control, and the value it shows is never the key itself: a credential on
 * screen is a credential in a screenshot.
 */
function bindDeepKeyRow(root) {
  const heading = findElement(root, (node) => node.tagName === 'h2' && textOf(node).trim() === 'Nafran Iqbal')
  const section = heading ? findElement(root, (node) => node.tagName === 'section' && /Workspace name/.test(textOf(node))) : null
  const list = section ? findElements(section, (node) => node.tagName === 'div' && /border-top:1px solid #E4E5E2/.test(getAttr(node, 'style') ?? '')) : []
  const sample = list.find((row) => /Workspace name/.test(textOf(row)))
  if (!sample) throw new Error('could not find the Account tab rows')

  const row = cloneNode(sample)
  const parts = childElements(row)
  const [label, value, button] = parts
  setText(label, 'DataForSEO key')
  // The value cell becomes the field itself: the key is typed here, and the text is masked.
  const input = htmlElement(
    'input',
    [
      { name: 'type', value: 'password' },
      { name: 'data-deepkey', value: '1' },
      { name: 'placeholder', value: '{{ deepKeyLabel }}' },
      { name: 'aria-label', value: 'DataForSEO API key' },
      { name: 'value', value: '{{ deepKeyDraft }}' },
      { name: 'oninput', value: '{{ onDeepKeyInput }}' },
      { name: 'autocomplete', value: 'off' },
      { name: 'spellcheck', value: 'false' },
      {
        name: 'style',
        value:
          'flex:1;min-width:180px;height:40px;padding:0 14px;border:0;border-radius:999px;background:#EAEAE8;font-family:inherit;font-size:13.5px;color:#1C1C1C;outline:none',
      },
    ],
    [],
  )
  row.childNodes[row.childNodes.indexOf(value)] = input

  // Two buttons where the design had one: save, and check the key against the account. Each carries
  // its own marker, because "Save" and "Test" are words the rest of the app also uses.
  const save = cloneNode(button)
  save.childNodes = [textNode('Save')]
  setAttr(save, 'sc-camel-on-click', '{{ saveDeepKey }}')
  setAttr(save, 'data-deepsave', '1')
  const test = cloneNode(button)
  test.childNodes = [textNode('Test')]
  setAttr(test, 'sc-camel-on-click', '{{ testDeepKey }}')
  setAttr(test, 'data-deeptest', '1')

  const holder = htmlElement('span', [{ name: 'style', value: 'display:flex;gap:8px;flex:none' }], [save, test])
  row.childNodes[row.childNodes.indexOf(button)] = holder

  // The note under the row says whether a key is saved and what the account last answered.
  const note = htmlElement(
    'p',
    [{ name: 'data-deepnote', value: '1' }, { name: 'style', value: 'margin:8px 0 0 162px;font-size:12.5px;line-height:1.5;color:#5A5F5C;text-wrap:pretty' }],
    [textNode('{{ deepKeyNote }}')],
  )
  const block = sample.parentNode
  const licence = block.childNodes.find((node) => getAttr(node, 'style')?.includes('border-top:1px solid #E4E5E2') && /LeadsAngel SMTP licence/.test(textOf(node)))
  block.childNodes.splice(block.childNodes.indexOf(licence ?? sample), 0, row, note)
}

/**
 * The three buttons that start a deep pass.
 *
 * The design gives the Decision Makers page its own header action, the toolbar's own action on that
 * page, and the "Deep Enrich" card's first button — all three say the same thing, so all three start
 * the same pass. Naming them here means the page needs no hand-editing to be wired.
 */
function bindDeepButtons(root) {
  let marked = 0
  for (const label of ['Deep enrich missing', 'Deep enrich all missing', 'Enrich all missing']) {
    const button = findElement(root, (node) => node.tagName === 'button' && getAttr(node, 'data-demo') === label)
    if (!button) continue
    button.attrs = button.attrs.filter((entry) => entry.name !== 'data-demo')
    setAttr(button, 'sc-camel-on-click', '{{ deepRun }}')
    setAttr(button, 'data-deeprun', '1')
    // The card's own button states how many leads the pass would run on, which is the same figure
    // the coverage card calls missing. It is bound here because this is the button that acts on it.
    if (label === 'Enrich all missing') {
      const spans = childElements(button)
      if (spans.length) setText(spans[spans.length - 1], '{{ dmMissing }}')
    }
    marked += 1
  }
  if (!marked) throw new Error('could not find the deep enrich buttons')
}

/**
 * The scan panel, which is where every page's scan reports itself.
 *
 * It sits outside the views, beside the history drawer and the import modal, because a scan can be
 * started from any page. The design guards it with `scanOverlay`; what this adds is the marker a
 * check uses to watch a scan run and finish.
 */
function bindScanPanel(root) {
  const overlay = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ scanOverlay }}')
  if (!overlay) throw new Error('could not find the scan panel')
  const scrim = findElement(overlay, (node) => node.tagName === 'div' && /position:fixed/.test(getAttr(node, 'style') ?? ''))
  if (!scrim) throw new Error('the scan panel carries no scrim')
  setAttr(scrim, 'data-scanscrim', '1')
}

/**
 * The one import modal every page shares.
 *
 * It is a single element in the document — a paste box, a button that appears once there is
 * something to paste, and a Cancel — so it is marked once here whatever page opened it. On Social
 * Profiles the same box takes profile URLs and the button's label says how many are ready, which is
 * what the automated checks read.
 */
function bindSharedImportModal(root) {
  // The box is the surest handle on the modal: it is the only paste box in the document, so the
  // modal is found upwards from it rather than guessed at from a style that several scrims share.
  const box = findElement(root, (node) => getAttr(node, 'data-imptext') === '1')
  if (!box) throw new Error('could not find the import textarea')
  setAttr(box, 'data-socimpinput', '1')
  setAttr(box, 'sc-camel-value', '{{ impValue }}')

  let scrim = box
  while (scrim && !/position:\s*fixed/.test(getAttr(scrim, 'style') ?? '')) scrim = scrim.parentNode
  if (!scrim) throw new Error('the import textarea is not inside a modal')
  setAttr(scrim, 'data-socimp', '1')
  setAttr(scrim, 'data-impmodal', '1')

  const run = findElement(scrim, (node) => getAttr(node, 'data-run') === '1')
  if (!run) throw new Error('could not find the import modal run button')
  setAttr(run, 'data-socimpgo', '1')

  const cancel = findElement(scrim, (node) => node.tagName === 'button' && textOf(node).trim() === 'Cancel')
  if (!cancel) throw new Error('could not find the import modal Cancel button')
  setAttr(cancel, 'data-socimpcancel', '1')
}

/**
 * The controls the automated checks find the three finder pages by.
 *
 * The pages bind their own controls in the document, so there is nothing to rebuild: what this adds
 * is the markers a check uses to address them, on the action each page offers, the search box, the
 * list, and the "Show all leads" that ends a scan.
 */
function bindFinderPages(root) {
  const scopeFor = (view) =>
    findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === `{{ ${view} }}`)
  for (const [view, alias] of [
    ['isEmail', 'fEmail'],
    ['isPhone', 'fPhone'],
    ['isDm', 'fDm'],
  ]) {
    const scope = scopeFor(view)
    if (!scope) throw new Error(`could not find the ${view} page`)
    const act = findByHandler(scope, `{{ ${alias}.act }}`)
    if (!act) throw new Error(`could not find the ${alias} action button`)
    setAttr(act, 'data-fact', alias)
    const exit = findByHandler(scope, `{{ ${alias}.exit }}`)
    if (!exit) throw new Error(`could not find the ${alias} Show all leads button`)
    setAttr(exit, 'data-exitscan', '1')
    // The way out of a scan is on screen for the whole scan, not only once it has finished.
    //
    // The design guards the bar with `scanDone`, which reads as "the result is ready" — but a pass
    // the reader does not want to wait for would then leave the panel with no way out of it. The bar
    // is guarded by `scanOn` instead, and the words inside it already say which of the two states
    // the scan is in.
    // Walk up to the conditional the bar sits in: the button is inside a div inside that guard.
    let bar = exit.parentNode
    while (bar && bar.tagName !== 'sc-if' && bar !== bar.parentNode) bar = bar.parentNode
    if (bar && bar.tagName === 'sc-if') setAttr(bar, 'value', `{{ ${alias}.scanOn }}`)
    // Each finder page keeps its own recent searches, so each has its own chips.
    markRecentChips(scope)

    // The row-count note beside Recent used to repeat the design's ten sample rows. It is the
    // current page's own count, so bind it to the same value used by the table footer.
    const visibleCount = view === 'isEmail' ? 'emailShowing' : view === 'isPhone' ? 'phoneShowing' : null
    const countNote = findElement(scope, (node) => getAttr(node, 'data-fcount') === alias.slice(1).toLowerCase())
    if (countNote && visibleCount) setText(countNote, `{{ ${visibleCount} }} rows on screen`)

    // The search box is controlled: a remembered term has to appear in it, and a box that only
    // carried the first value would go on showing what was typed while the table showed something
    // else. The design writes it as `defaultValue`, which React only reads once.
    const search = findElement(scope, (node) => node.tagName === 'input' && getAttr(node, 'data-fq'))
    if (search) {
      const value = takeAttr(search, 'defaultValue')
      if (value) setAttr(search, 'value', value)
    }
  }
}

/** A row the reference drew by hand: a list item with no binding in it anywhere. */
function isSampleRow(node) {
  if (!node || node.nodeName !== 'li') return false
  const hasBinding = (child) => {
    if (!child || typeof child !== 'object') return false
    if (child.nodeName === '#text' && /\{\{/.test(child.value ?? '')) return true
    if ((child.attrs ?? []).some((attr) => /\{\{/.test(attr.value ?? ''))) return true
    return (child.childNodes ?? []).some(hasBinding)
  }
  return !hasBinding(node)
}


const PLATFORM_BY_LABEL = { Instagram: 'instagram', Facebook: 'facebook', LinkedIn: 'linkedin', TikTok: 'tiktok', YouTube: 'youtube', 'Twitter / X': 'x' }
const SHORT_BY_LABEL = { Instagram: 'ig', Facebook: 'f', LinkedIn: 'in', TikTok: 'tt', YouTube: 'yt', 'Twitter / X': 'x' }

function extractSocialDemo(root) {
  const view = socialView(root)
  const list = findElement(view, (node) => node.tagName === 'ul' && getAttr(node, 'data-soclist') === '1')
  const rows = childElements(list)
    .filter((node) => node.tagName === 'li')
    .map((item) => {
      const spans = childElements(item)
      const chips = childElements(spans[4])
        .map((chip) => getAttr(chip, 'title'))
        .filter(Boolean)
        .map((label) => ({ label, platform: PLATFORM_BY_LABEL[label] ?? 'other', short: SHORT_BY_LABEL[label] ?? '···' }))
      const status = textOf(spans[5]).toLowerCase() === 'done' ? 'done' : 'pending'
      return { index: textOf(spans[1]), name: textOf(spans[2]), domain: getAttr(spans[3], 'title') ?? '', profiles: chips, status }
    })

  const firstArc = findElement(view, (node) => getAttr(node, 'stroke-dashoffset'))
  const donutContainer = firstArc.parentNode.parentNode.parentNode.parentNode
  const donuts = childElements(donutContainer).map((card) => {
    const arc = findElement(card, (node) => getAttr(node, 'stroke-dashoffset'))
    const texts = []
    const walk = (node) => {
      if (node.nodeName === '#text') texts.push(node.value.trim())
      ;(node.childNodes ?? []).forEach(walk)
    }
    walk(card)
    const percent = texts.find((value) => /^\d+$/.test(value)) ?? '0'
    const label = texts.find((value) => PLATFORM_BY_LABEL[value]) ?? 'Other'
    const count = (texts.find((value) => /leads$/.test(value)) ?? '0 leads').split(' ')[0]
    return { label, platform: PLATFORM_BY_LABEL[label] ?? 'other', short: SHORT_BY_LABEL[label] ?? '···', pct: percent, count: Number(count), offset: getAttr(arc, 'stroke-dashoffset') ?? '0' }
  })

  const firstBar = findElement(view, (node) => /#8FA382/.test(getAttr(node, 'style') ?? ''))
  const extrasList = firstBar.parentNode.parentNode.parentNode
  const extras = childElements(extrasList).map((item) => {
    const spans = childElements(item)
    const label = textOf(spans[1])
    const bar = findElement(item, (node) => /#8FA382/.test(getAttr(node, 'style') ?? ''))
    const width = bar ? (getAttr(bar, 'style') ?? '').match(/width:([^;]+)/)?.[1] ?? '0%' : '0%'
    // A slot still holding a `{{ }}` binding has no number in it yet, so it keeps the binding's
    // zero stand-in rather than being written out as `null` and failing the type it declares.
    const countText = textOf(spans[3])
    return { label, platform: PLATFORM_BY_LABEL[label] ?? 'other', short: textOf(spans[0]), count: Number(countText) || 0, width }
  })

  return { rows, donuts, extras }
}

// ---------------------------------------------------------------- email page data binding
//
// The reference document paints the Email Finder page with fixed sample figures: a four-step
// cascade, a twenty-bar confidence mix and ten address rows. The markup below turns those same
// elements into templates · identical elements and inline styles, with the text and the few
// dynamic attributes replaced by bindings. Every variant the page already contained is reused
// (each of the six chip tones, the four meter fills, the found and the muted status), so the
// rendered result is unchanged when the data matches.

function emailView(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isEmail }}')
  if (!view) throw new Error('could not find the Email Finder view in the reference markup')
  return view
}

function emailList(view) {
  // The updated design marks the list itself rather than the block around it, so the list is found
  // by its own marker first and only then by the block the older document wrapped it in.
  const marked = findElement(view, (node) => node.tagName === 'ul' && getAttr(node, 'data-flist') === 'email')
  if (marked) return marked
  const block = findElement(view, (node) => getAttr(node, 'data-rowsblock') === '1')
  if (!block) throw new Error('could not find the address rows on the Email Finder page')
  return findElement(block, (node) => node.tagName === 'ul')
}

/** Chip copy to tone: "High · 95" · · high, "Not verified" · · unverified, and so on. */
function emailTone(label) {
  if (label.startsWith('High')) return 'high'
  if (label.startsWith('Domain')) return 'domain'
  if (label.startsWith('Low')) return 'low'
  if (label === 'No website') return 'no-website'
  if (label === 'Pending') return 'pending'
  return 'unverified'
}

/** The chip's copy without the <strong> count that follows it: "High 95 12" · · "High 95". */
function chipLabel(chip) {
  const count = findElement(chip, (node) => node.tagName === 'strong')
  let label = ''
  const walk = (node) => {
    if (node === count) return
    if (node.nodeName === '#text') label += node.value
    ;(node.childNodes ?? []).forEach(walk)
  }
  walk(chip)
  return label.replace(/\s+/g, ' ').trim()
}

/** The cell spans of an address row: checkbox, index, business, domain, emails, verification, status. */
const emailCells = (row) => childElements(row)
const emailChip = (row) => childElements(emailCells(row)[5])[0]
const emailMeter = (row) => childElements(emailCells(row)[5])[1]

function bindEmailCascade(view) {
  // The document may already carry the binding, so this rewrites only what is still literal.
  replaceTextIfPresent(view, 'Where the 128 scraped leads currently sit in the pipeline.', 'Where the {{ emailTotal }} scraped leads currently sit in the pipeline.')
  replaceText(view, '32%', '{{ emailBadge }}')

  const container = findElement(view, (node) => getAttr(node, 'data-cascade') === '1')
  if (!container) throw new Error('could not find the pipeline cascade')
  const steps = childElements(container)
  if (steps.length !== 4) throw new Error('expected four cascade steps')

  const template = cloneNode(steps[0])
  const parts = childElements(childElements(template)[0])
  setText(parts[0], '{{ k.count }}')
  setText(parts[1], '{{ k.label }}')
  setText(parts[2], '{{ k.note }}')
  const bar = childElements(parts[3])[0]
  setAttr(bar, 'style', (getAttr(bar, 'style') ?? '').replace(/width:[^;]+/, 'width:{{ k.width }}'))
  // The pipeline draws an arrow between steps, but not after the last one.
  const arrow = childElements(template)[1]
  template.childNodes[template.childNodes.indexOf(arrow)] = when('{{ k.arrow }}', [cloneNode(arrow)])
  container.childNodes = [loop('{{ emailCascade }}', 'k', [template])]
}

function bindEmailMix(view) {
  replaceTextIfPresent(view, 'Deliverability score of all 53 extracted addresses.', 'Deliverability score of all {{ emailExtracted }} extracted addresses.')
  replaceText(view, '24 leads', '{{ emailNeedsVerify }} leads')
  replaceText(view, '3.1 emails', '{{ emailPerLead }} emails')

  // The first bar of the mix, found by the title the document gives it whether that title still
  // carries its own numbers or has already been replaced by the binding written below.
  const firstBucket = findElement(view, (node) => /^score (\d|\{\{ b\.from \}\})/.test(getAttr(node, 'title') ?? ''))
  if (!firstBucket) throw new Error('could not find the confidence mix bars')
  const histogram = firstBucket.parentNode
  const bucket = cloneNode(firstBucket)
  setAttr(bucket, 'title', 'score {{ b.from }}·{{ b.to }}: {{ b.count }}')
  const fill = childElements(bucket)[0]
  setAttr(fill, 'style', (getAttr(fill, 'style') ?? '').replace(/height:[^;]+/, 'height:{{ b.height }}').replace(/background:[^;]+/, 'background:{{ b.color }}'))
  histogram.childNodes = [loop('{{ emailBuckets }}', 'b', [bucket])]

  const chipTemplate = findElement(view, (node) => node.tagName === 'span' && /^(High \d|\{\{ c\.label \}\})/.test(textOf(node)) && findElement(node, (child) => child.tagName === 'strong'))
  if (!chipTemplate) throw new Error('could not find the confidence mix chips')
  const chip = cloneNode(chipTemplate)
  const swatch = childElements(chip)[0]
  setAttr(swatch, 'style', (getAttr(swatch, 'style') ?? '').replace(/background:[^;]+/, 'background:{{ c.color }}'))
  // The label keeps the space the count used to follow it by, so the chip reads "High 95 12".
  replaceTextIfPresent(chip, 'High 95', '{{ c.label }} ')
  setText(findElement(chip, (node) => node.tagName === 'strong'), '{{ c.count }}')
  chipTemplate.parentNode.childNodes = [loop('{{ emailChips }}', 'c', [chip])]
}

function bindEmailBulk(view) {
  replaceTextIfPresent(view, '75 leads still have no address on file.', '{{ emailNoAddress }} leads still have no address on file.')

  const countOf = (label, binding) => {
    const button = findElement(view, (node) => node.tagName === 'button' && getAttr(node, 'data-demo') === label)
    if (!button) throw new Error(`could not find the ${label} button on the Email Finder page`)
    const spans = childElements(button)
    setText(spans[spans.length - 1], binding)
  }
  countOf('Find & verify needed', '{{ emailNeedsVerify }}')
  countOf('Advanced SMTP check', '{{ emailRisky }}')
  countOf('Deep search missing', '{{ emailNoAddress }}')
  // This button now has its own MailVerifier handler. `data-demo` is kept in the source long
  // enough for the sample extractor above to read the design's risky count, then removed so the
  // generated component does not also dispatch the old delegated enrichment action.
  const validity = findElement(view, (node) => node.tagName === 'button' && getAttr(node, 'data-demo') === 'Advanced SMTP check')
  if (validity) validity.attrs = validity.attrs.filter((attr) => attr.name !== 'data-demo')
}

function bindEmailRows(view) {
  const list = emailList(view)
  if (!list) throw new Error('could not find the addresses list on the Email Finder page')
  const rows = childElements(list).filter((node) => node.tagName === 'li')
  const variant = (tone) => {
    const found = rows.find((row) => emailTone(chipLabel(emailChip(row))) === tone)
    if (!found) throw new Error(`could not find a "${tone}" address row in the reference markup`)
    return found
  }
  const toneIs = (tone) => `{{ isTone(r.tone, '${tone}') }}`

  const template = cloneNode(variant('high'))
  const cells = emailCells(template)
  replaceText(cells[1], textOf(cells[1]), '{{ r.index }}')
  setText(cells[2], '{{ r.name }}')
  setAttr(cells[3], 'title', '{{ r.domain }}')
  setText(cells[3], '{{ r.domain }}')

  const emails = cells[4]
  setAttr(emails, 'title', '{{ r.primary }}')
  const address = emails.childNodes.find((child) => child.nodeName === '#text')
  address.value = '{{ r.primary }} '
  const extras = findElement(emails, (node) => /^\+\d+$/.test(textOf(node)))
  if (!extras) throw new Error('expected an address row carrying a "+N" badge')
  setText(extras, '{{ r.extrasLabel }}')
  emails.childNodes[emails.childNodes.indexOf(extras)] = when('{{ r.hasExtras }}', [cloneNode(extras)])

  // One chip and one meter variant per tone; the empty meter also serves the rows with no
  // address at all, exactly as the reference reuses it.
  const verification = cells[5]
  const tones = ['high', 'domain', 'low', 'unverified', 'no-website', 'pending']
  const meters = { 'no-website': 'unverified', pending: 'unverified' }
  verification.childNodes = [
    ...tones.map((tone) => {
      const chip = cloneNode(emailChip(variant(tone)))
      setText(chip, '{{ r.label }}')
      return when(toneIs(tone), [chip])
    }),
    ...tones
      .filter((tone) => !meters[tone])
      .map((tone) => when(toneIs(tone), [cloneNode(emailMeter(variant(tone)))])),
    when(toneIs('no-website'), [cloneNode(emailMeter(variant('unverified')))]),
    when(toneIs('pending'), [cloneNode(emailMeter(variant('unverified')))]),
  ]

  // The status cell keeps its two variants: a found lead states the count, every other lead
  // reads muted.
  const status = cells[6]
  const statusOf = (found) => rows.map((row) => emailCells(row)[6]).find((cell) => /^Found /.test(textOf(cell)) === found)
  const foundCell = cloneNode(statusOf(true))
  setText(foundCell, '{{ r.statusLabel }}')
  const mutedCell = cloneNode(statusOf(false))
  setText(mutedCell, '{{ r.statusLabel }}')
  template.childNodes.splice(
    template.childNodes.indexOf(status),
    1,
    when('{{ r.isFound }}', [foundCell]),
    when('{{ r.isMuted }}', [mutedCell]),
  )

  // The table is drawn from the finder's own rows rather than from the page's whole read: the bar
  // above it narrows what is on screen, and a list that ignored the search beside it would be
  // disagreeing with its own controls. The finder's row carries the same fields as this one.
  list.childNodes = [loop('{{ fEmail.rows }}', 'r', [template])]
}

function bindEmailHeader(view) {
  // The footer states how much of the workspace the page is showing, so it counts the rows rather
  // than repeating the design's own "Showing 10 of 128 leads.".
  replaceText(view, 'Showing 10 of 128 leads.', 'Showing {{ emailShowing }} of {{ emailTotal }} leads.')

  // The Refresh button reads the sites on file again. The design once left it as a demo control;
  // it now carries its own handler, so this only rebinds a copy that still does not.
  const button = findElement(view, (node) => node.tagName === 'button' && getAttr(node, 'data-demo') === 'Refresh')
  if (!button) return
  button.attrs = button.attrs.filter((attr) => attr.name !== 'data-demo')
  setAttr(button, 'sc-camel-on-click', '{{ refreshEmail }}')
}

function bindEmailStateRow(view) {
  const list = emailList(view)
  if (!list) throw new Error('could not find the addresses list on the Email Finder page')
  const stateRow = htmlElement('li', [{ name: 'style', value: 'display:flex;align-items:center;gap:10px;padding:13px 0;border-top:1px solid #E4E5E2;color:#5A5F5C;font-size:13.5px' }], [textNode('{{ emailState }}')])
  list.childNodes = [when('{{ emailState }}', [stateRow]), ...list.childNodes]
}

/**
 * The export modal's Download button used to close the dialog and nothing else. It now writes
 * the file, so it is rebound from closeExp to the export action.
 */
function bindExportModal(root) {
  tryBind('bindExportModal', () => {
    const button = findElement(root, (node) => node.tagName === 'button' && /Export/i.test(textOf(node)))
    if (!button) throw new Error('could not find the export modal')
    setAttr(button, 'sc-camel-on-click', '{{ runExport }}')
    setAttr(button, 'data-exportgo', '1')
  })
}

function bindEmailPage(root) {
  const view = emailView(root)
  tryBind('bindEmailCascade', () => bindEmailCascade(view))
  tryBind('bindEmailMix', () => bindEmailMix(view))
  tryBind('bindEmailBulk', () => bindEmailBulk(view))
  // The address rows: the columns, the tier chips, the meters and the status cell are the design's
  // own variants, reassembled as one row template over the finder's rows.
  tryBind('bindEmailRows', () => bindEmailRows(view))
  tryBind('bindEmailStateRow', () => bindEmailStateRow(view))
  // The footer states how much of the workspace the page is showing, so it is bound like the rows.
  tryBind('bindEmailHeader', () => bindEmailHeader(view))
}

function extractEmailDemo(root) {
  const view = emailView(root)
  const textMatching = (pattern) => {
    const node = findElement(view, (element) => pattern.test(textOf(element)))
    if (!node) throw new Error(`could not find ${pattern} on the Email Finder page`)
    return textOf(node)
  }
  const numberMatching = (pattern) => Number((textMatching(pattern).match(/\d+(?:\.\d+)?/) ?? ['0'])[0])

  const cascade = childElements(findElement(view, (node) => getAttr(node, 'data-cascade') === '1')).map((step) => {
    const parts = childElements(childElements(step)[0])
    const bar = childElements(parts[3])[0]
    return {
      label: textOf(parts[1]),
      note: textOf(parts[2]),
      count: Number(textOf(parts[0])),
      width: (getAttr(bar, 'style') ?? '').match(/width:([^;]+)/)?.[1] ?? '100%',
      arrow: childElements(step).length > 1,
    }
  })

  // The bucket titles are bindings in the document by the time this runs, so the sample figures are
  // read from the attributes that are there — a title that still carries the document's own numbers
  // is read as those numbers, and one that carries a binding stands for the bucket's own range.
  const firstBucket = findElement(view, (node) => /^score /.test(getAttr(node, 'title') ?? ''))
  const buckets = childElements(firstBucket.parentNode).map((bar, index) => {
    const title = getAttr(bar, 'title') ?? ''
    const literal = title.match(/score (\d+)[·–](\d+): (\d+)/)
    const from = literal ? Number(literal[1]) : index * 5
    const to = literal ? Number(literal[2]) : from + 5
    const style = getAttr(childElements(bar)[0], 'style') ?? ''
    return {
      from,
      to,
      count: literal ? Number(literal[3]) : 0,
      height: style.match(/height:([^;]+)/)?.[1] ?? '3%',
      color: style.match(/background:([^;]+)/)?.[1] ?? '#E7E8E5',
    }
  })

  const chipTemplate = findElement(view, (node) => node.tagName === 'span' && /^High \d/.test(textOf(node)) && findElement(node, (child) => child.tagName === 'strong'))
  const chips = childElements(chipTemplate.parentNode).map((chip) => ({
    label: chipLabel(chip),
    count: Number(textOf(findElement(chip, (node) => node.tagName === 'strong'))),
    color: (getAttr(childElements(chip)[0], 'style') ?? '').match(/background:([^;]+)/)?.[1] ?? '#EAEAE8',
  }))

  const rows = childElements(emailList(view))
    .filter((node) => node.tagName === 'li')
    .map((row) => {
      const cells = emailCells(row)
      const label = chipLabel(emailChip(row))
      const statusLabel = textOf(cells[6])
      const extras = findElement(cells[4], (node) => /^\+\d+$/.test(textOf(node)))
      const isFound = /^Found /.test(statusLabel)
      return {
        index: textOf(cells[1]),
        name: textOf(cells[2]),
        domain: textOf(cells[3]),
        primary: getAttr(cells[4], 'title') ?? '',
        hasExtras: Boolean(extras),
        extrasLabel: extras ? textOf(extras) : '',
        tone: emailTone(label),
        label,
        statusLabel,
        isFound,
        isMuted: !isFound,
      }
    })

  const riskyButton = childElements(findElement(view, (node) => node.tagName === 'button' && getAttr(node, 'data-demo') === 'Advanced SMTP check'))

  return {
    badge: textOf(findElement(view, (node) => node.tagName === 'strong' && /^\d+%$/.test(textOf(node)))),
    total: numberMatching(/^Where the (?:\d+|\{\{ emailTotal \}\}) scraped leads currently sit in the pipeline\.$/),
    extracted: numberMatching(/^Deliverability score of all (?:\d+|\{\{ emailExtracted \}\}) extracted addresses\.$/),
    needsVerify: numberMatching(/^\d+ leads$/),
    risky: Number(textOf(riskyButton[riskyButton.length - 1])),
    noAddress: numberMatching(/^(?:\d+|\{\{ emailNoAddress \}\}) leads still have no address on file\.$/),
    perLead: (textMatching(/^\d+(\.\d+)? emails$/).match(/\d+(\.\d+)?/) ?? ['0'])[0],
    showing: numberMatching(/^Showing \d+ of \d+ leads\.$/),
    cascade,
    buckets,
    chips,
    rows,
  }
}

// ---------------------------------------------------------------- all leads data binding
//
// The reference paints All Leads with eight hand-written rows under two day headings. The rows
// become a template over the same elements and inline styles, so captured leads land in the
// table the reference already designed. The day headings go: real rows carry their own saved
// date in the final cell, and a fixed "Today" strip above them would contradict it.
//
// Every variant the reference already contained is reused rather than styled here: the on-file
// chip reads its state from its background (#C8D5BB on, #E9EAE7 off), the source pill from its
// label (Maps, Import, Manual), and the score pill from the band the reference gave it.

function leadsView(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isLeads }}')
  if (!view) throw new Error('could not find the All Leads view in the reference markup')
  return view
}

/**
 * The chip for the named flag in the requested state. The reference only ever drew an "off"
 * chip for Email and Socials · every sample lead has a phone · so a missing state is produced
 * by recolouring the chip it did draw, using the two backgrounds the reference itself uses.
 */
function chipVariant(rows, label, on) {
  let fallback = null
  for (const row of rows) {
    for (const chip of childElements(childElements(row)[2] ?? {})) {
      if (getAttr(chip, 'title') !== label) continue
      const style = getAttr(chip, 'style') ?? ''
      if (/#C8D5BB/i.test(style) === on) return chip
      fallback ??= chip
    }
  }
  if (!fallback) throw new Error(`could not find a "${label}" chip at all`)
  const recoloured = cloneNode(fallback)
  setAttr(
    recoloured,
    'style',
    (getAttr(recoloured, 'style') ?? '').replace(/#(C8D5BB|E9EAE7)/i, on ? '#C8D5BB' : '#E9EAE7').replace(/color:#(1C1C1C|5A5F5C)/i, on ? 'color:#1C1C1C' : 'color:#5A5F5C'),
  )
  return recoloured
}

function sourcePill(view, label) {
  const pill = findElement(view, (node) => node.tagName === 'span' && textOf(node) === label && /border-radius:999px/.test(getAttr(node, 'style') ?? ''))
  if (!pill) throw new Error(`could not find the "${label}" source pill`)
  return pill
}

/**
 * The permanent-store card: the headline count, the file's own line, and the two breakdowns.
 *
 * Its sample figures are the design's — 128 leads, 96/20/12 by source, 96/74/34 with a percentage
 * each — and every one of them is a claim about what the workspace holds. The bindings are written
 * here rather than in the document so a newer design export can still be dropped in and rebound.
 */
function bindStoreCard(card) {
  // The headline figure: the large number in the card's first block. It is found by its own style
  // rather than by its value, so the binding lands on the number and not on the block around it.
  const headline = findElement(card, (node) => /^[\d,]+$/.test(textOf(node)) && /clamp\(44px/.test(getAttr(node, 'style') ?? ''))
  if (headline) setText(headline, '{{ storeCount }}')

  // The line under it, which says where the file is and how big it is.
  const where = findElement(card, (node) => node.tagName === 'p' && /^Stored on this machine at/.test(textOf(node)))
  if (where) setText(where, '{{ storeWhere }}')

  // The source split: a flex width on each bar and a count beside each name.
  const bars = findElements(card, (node) => /flex:\d+;height:14px/.test(getAttr(node, 'style') ?? ''))
  bars.forEach((bar, index) => {
    setAttr(bar, 'style', (getAttr(bar, 'style') ?? '').replace(/flex:\d+/, `flex:{{ storeSources[${index}].flex }}`))
  })
  const legend = findElements(card, (node) => node.tagName === 'strong' && /^\d+$/.test(textOf(node)))
  legend.forEach((node, index) => setText(node, `{{ storeSources[${index}].count }}`))

  // What is on file: a count and a share on each row, in the order the design draws them. The rows
  // are found by the name they start with, so nothing else in the card can be mistaken for one.
  const rows = findElements(card, (node) => {
    const text = textOf(node)
    return (
      /^(Phone numbers|Email addresses|Social profiles)\d/.test(text) &&
      /border-radius:14px/.test(getAttr(node, 'style') ?? '') &&
      childElements(node).length >= 3
    )
  })
  rows.forEach((row, index) => {
    const spans = childElements(row)
    setText(spans[1], `{{ storeOnFile[${index}].count }}`)
    setText(spans[2], `{{ storeOnFile[${index}].pct }}`)
  })
}

/** Every element in the tree that matches, in document order. */
function findElements(node, predicate, found = []) {
  if (!walkable(node)) return found
  if (node.tagName && predicate(node)) found.push(node)
  for (const child of node.childNodes ?? []) findElements(child, predicate, found)
  return found
}

/**
 * The Phone Book, bound the way the address rows are.
 *
 * The design hand-writes two sample rows: a reception line and one that reads as a direct line.
 * What they actually differ in is the pill's colour and wording, so the row is rebuilt once round
 * the first of them and the pill cell carries both variants, guarded by the ledger's own line type
 * — a number the listing gave is the switchboard, one read from the site is the direct line, and a
 * lead with no number says so.
 */
function bindPhoneBook(view) {
  const list = findElement(view, (node) => node.tagName === 'ul' && getAttr(node, 'data-flist') === 'phone')
  if (!list) throw new Error('could not find the phone book')
  const rows = childElements(list).filter((node) => getAttr(node, 'data-row') === '1')
  if (rows.length < 2) throw new Error('expected the phone book to carry its two row variants')

  const row = cloneNode(rows[0])
  const cells = childElements(row)
  setText(cells[1], '{{ p.index }}')
  setText(cells[2], '{{ p.name }}')
  setText(cells[3], '{{ p.phone }}')
  setText(cells[5], '{{ p.areaCode }}')
  setText(cells[6], '{{ p.address }}')

  // The pill: the reception wording in the design's own green, the direct line in its dark variant,
  // and a muted one for a lead with no number yet. Each keeps the shape and size of the sample.
  const pill = childElements(cells[4])[0]
  const direct = cloneNode(pill)
  setAttr(
    direct,
    'style',
    (getAttr(direct, 'style') ?? '').replace(/background:#[0-9A-Fa-f]{6}/, 'background:#1C1C1C').replace(/font-weight:500/, 'font-weight:500;color:#F0F0F0'),
  )
  const missing = cloneNode(pill)
  setAttr(
    missing,
    'style',
    (getAttr(missing, 'style') ?? '').replace(/background:#[0-9A-Fa-f]{6}/, 'background:#EAEAE8').replace(/font-weight:500/, 'font-weight:400;color:#4A4F4B'),
  )
  cells[4].childNodes = [
    when('{{ p.isReception }}', [pill]),
    when('{{ p.isDirect }}', [direct]),
    when('{{ p.isMissing }}', [missing]),
  ]

  list.childNodes = [loop('{{ fPhone.rows }}', 'p', [row])]
}

/** The band shades a score pill, which the stylesheet already drives from data-sc. */
function bindLeadsPage(root) {
  tryBind('bindLeadsPage', () => {
    const view = leadsView(root)
    const list = findElement(view, (node) => node.tagName === 'ul' && findElement(node, (child) => getAttr(child, 'data-row') === '1'))
    if (!list) throw new Error('could not find the leads ledger')

    // The search box narrows the ledger from the same state the rows are drawn from, so the heading
    // above it and the list below it cannot disagree about how many leads are on screen.
    const search = findElement(view, (node) => node.tagName === 'input' && getAttr(node, 'aria-label') === 'Search leads')
    if (search) {
      setAttr(search, 'data-leadsearch', '1')
      setAttr(search, 'value', '{{ leadQuery }}')
      setAttr(search, 'oninput', '{{ onLeadInput }}')
      setAttr(search, 'placeholder', '{{ leadSearchPlaceholder }}')
    }

    const items = childElements(list)
    const heading = items.find((node) => getAttr(node, 'data-row') !== '1')
    const rows = items.filter((node) => getAttr(node, 'data-row') === '1')
    if (!heading || !rows.length) throw new Error('the leads ledger is not shaped as expected')

    const row = rows[0]
    const cells = childElements(row)
    // The avatar keeps its shape and takes the lead's own initials.
    setText(cells[0], '{{ lc.ini }}')
    const business = childElements(cells[1])
    setText(business[0], '{{ lc.name }}')
    setText(business[1], '{{ lc.domain }}')

    // The three on-file chips: the reference draws every variant it knows, so each one is cloned
    // and guarded by the lead's own flag rather than restyled here.
    const onFile = childElements(cells[2])
    cells[2].childNodes = onFile.map((chip) =>
      when(`{{ lc.${(getAttr(chip, 'title') ?? '').startsWith('Phone') ? 'hp' : (getAttr(chip, 'title') ?? '').startsWith('Email') ? 'he' : 'hs'} }}`, [cloneNode(chip)]),
    )

    setText(findElement(cells[3], (node) => node.tagName === 'span') ?? cells[3], '{{ lc.source }}')
    setText(cells[4], '{{ lc.score }}')
    setText(cells[5], '{{ lc.saved }}')

    // The store card's own figures: how many leads are on file, where the file is, and what share
    // of the ledger each source and each kind of detail accounts for. Every one of them is a
    // statement about the workspace, so none of them can stay the sample figure the design drew.
    const store = findElement(view, (node) => node.tagName === 'section' && /Permanent store/i.test(textOf(node)))
    if (store) bindStoreCard(store)

    // The footer under the table: how many rows the page is showing of everything on file. The
    // design's "Showing 8 of 128 saved leads" was a fixed claim about a workspace it never saw.
    const footer = findElement(view, (node) => node.tagName === 'span' && /^Showing \d+ of [\d,]+ saved leads$/.test(textOf(node)))
    if (footer) {
      setText(footer, 'Showing {{ leadsShowing }} of {{ leadsOnFileTotal }} saved leads')
      // Its own "Load 20 more" raises the page the table is drawing rather than reporting that it
      // pulled rows out of a ledger it was already holding. It is offered only while there are more
      // leads on file than the page shows.
      const more = footer.parentNode ? findElement(footer.parentNode, (node) => node.tagName === 'button') : null
      if (more) {
        more.attrs = more.attrs.filter((attr) => attr.name !== 'data-demo')
        setAttr(more, 'sc-camel-on-click', '{{ showMoreLeads }}')
        more.parentNode.childNodes = (more.parentNode.childNodes ?? []).map((child) =>
          child === more ? when('{{ leadsMoreOn }}', [more]) : child,
        )
      }
    }

    // A workspace with nothing on file says so, in the table's own first row, rather than drawing
    // an empty frame under a heading that claims otherwise.
    const stateRow = htmlElement(
      'li',
      [{ name: 'style', value: 'padding:26px 0;border-top:1px solid #E4E5E2;color:#5A5F5C;font-size:13.5px' }],
      [textNode('{{ leadsState }}')],
    )

    // The day heading becomes the group's own label and count, and the ledger becomes a list of
    // days, each holding its rows — that is what "grouped by the day it was saved" means.
    const dayHeading = cloneNode(heading)
    const parts = childElements(dayHeading)
    setText(parts[0], '{{ day.label }}')
    setText(parts[2], '{{ day.count }}')
    list.childNodes = [
      when('{{ leadsState }}', [stateRow]),
      loop('{{ leadDays }}', 'day', [dayHeading, loop('{{ day.rows }}', 'lc', [row])]),
    ]
  })
}

// ---------------------------------------------------------------- shell and saved lists
//
// The sidebar states the plan usage and how many leads are on file, and the Saved Lists page
// lists the lists a workspace actually has. Both were fixed numbers in the reference; neither
// survives contact with real data, so both are bound.

/**
 * The sidebar's own figures.
 *
 * The rail states what the workspace has used and what it holds, and the design draws those as the
 * sample numbers on its plan card: "614 of 2,000 Maps scrapes", "128 leads on file", "22 days left",
 * with a bar split 31/69 to match. Every one of them is a claim about this machine, so all four are
 * bound — a fresh install that says it has 128 leads is worse than one that says nothing.
 */
function bindShell(root) {
  const rail = findElement(root, (node) => node.tagName === 'span' && /^of [\d,]+ Maps scrapes$/.test(textOf(node)))
  if (!rail) throw new Error('could not find the sidebar usage line')
  const used = findElement(rail.parentNode, (node) => /^[\d,]+$/.test(textOf(node)) && /font-size:22px/.test(getAttr(node, 'style') ?? ''))
  if (!used) throw new Error('could not find the sidebar usage figure')
  setText(used, '{{ scrapeUsed }}')
  setText(rail, 'of {{ scrapeLimit }} Maps scrapes')

  const bar = rail.parentNode?.parentNode
  const segments = bar ? findElements(bar, (node) => /height:6px/.test(getAttr(node, 'style') ?? '')) : []
  if (segments.length === 2) {
    setAttr(segments[0], 'style', (getAttr(segments[0], 'style') ?? '').replace(/flex:\d+/, 'flex:{{ scrapeUsedFlex }}'))
    setAttr(segments[1], 'style', (getAttr(segments[1], 'style') ?? '').replace(/flex:\d+/, 'flex:{{ scrapeFreeFlex }}'))
  }

  const foot = findElement(root, (node) => node.tagName === 'span' && /^\d+ leads? on file$/.test(textOf(node)))
  if (foot) setText(foot, '{{ sidebarLeads }}')
  const days = findElement(root, (node) => node.tagName === 'span' && /^\d+ days? left$/.test(textOf(node)))
  if (days) setText(days, '{{ sidebarDays }}')

  // The Theme button in the top bar is the app's single theme control. The sidebar copy is removed
  // from the source markup so the setting stays beside the notification bell.
  const themeButton = findElement(root, (node) => node.tagName === 'button' && getAttr(node, 'data-demo') === 'Theme')
  if (themeButton) {
    themeButton.attrs = themeButton.attrs.filter((attr) => attr.name !== 'data-demo')
    setAttr(themeButton, 'data-theme-btn', '1')
    setAttr(themeButton, 'data-on', '{{ themeOn }}')
    setAttr(themeButton, 'sc-camel-on-click', '{{ toggleTheme }}')
    setAttr(themeButton, 'aria-label', '{{ themeLabel }}')
    setAttr(themeButton, 'title', '{{ themeLabel }}')
  }

  // Website Lookup actions read real clipboard/file input instead of falling through to the demo
  // toast handler. The renderer opens the same import modal with the extracted domains.
  const clipboardButton = findElement(root, (node) => node.tagName === 'button' && getAttr(node, 'data-demo') === 'Paste from clipboard')
  if (clipboardButton) {
    clipboardButton.attrs = clipboardButton.attrs.filter((attr) => attr.name !== 'data-demo')
    setAttr(clipboardButton, 'data-lookup-action', 'clipboard')
    setAttr(clipboardButton, 'sc-camel-on-click', '{{ pasteWebsiteClipboard }}')
  }
  const csvButton = findElement(root, (node) => node.tagName === 'button' && getAttr(node, 'data-demo') === 'Upload CSV')
  if (csvButton) {
    csvButton.attrs = csvButton.attrs.filter((attr) => attr.name !== 'data-demo')
    setAttr(csvButton, 'data-lookup-action', 'csv')
    setAttr(csvButton, 'sc-camel-on-click', '{{ uploadWebsiteCsv }}')
  }

  // The reference draws a bell with no panel behind it. Keep its icon and placement, then attach
  // the desktop app's saved notification history and unread actions to that same control.
  const bell = findElement(root, (node) => node.tagName === 'button' && getAttr(node, 'data-demo') === 'Notifications')
  if (bell?.parentNode) {
    bell.attrs = bell.attrs.filter((attr) => attr.name !== 'data-demo')
    setAttr(bell, 'data-notifications-button', '1')
    setAttr(bell, 'sc-camel-on-click', '{{ openNotifications }}')
    setAttr(bell, 'aria-expanded', '{{ notificationsOpen }}')
    setAttr(bell, 'aria-controls', 'notifications-panel')
    setAttr(bell, 'style', (getAttr(bell, 'style') ?? '') + ';position:relative')
    bell.childNodes.push(when('{{ unreadNotifications }}', [
      htmlElement('span', [
        { name: 'data-notifications-badge', value: '1' },
        { name: 'aria-label', value: '{{ unreadNotifications }} unread notifications' },
        { name: 'style', value: 'position:absolute;top:-4px;right:-4px;display:grid;place-items:center;min-width:19px;height:19px;padding:0 4px;border-radius:999px;background:#A9BC9B;color:#1C1C1C;font-size:10px;font-weight:700;line-height:1' },
      ], [textNode('{{ unreadNotifications }}')]),
    ]))
    setAttr(bell.parentNode, 'style', (getAttr(bell.parentNode, 'style') ?? '') + ';position:relative')

    const panel = htmlElement('section', [
      { name: 'id', value: 'notifications-panel' },
      { name: 'data-notifications-panel', value: '1' },
      { name: 'aria-label', value: 'Notifications' },
      { name: 'style', value: 'position:absolute;top:56px;right:0;z-index:120;width:min(380px,calc(100vw - 32px));max-height:min(490px,75vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid #E4E5E2;border-radius:20px;background:#F5F5F4;box-shadow:0 24px 58px -26px rgba(28,28,28,.42)' },
    ], [
      htmlElement('div', [
        { name: 'style', value: 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 18px;border-bottom:1px solid #E4E5E2' },
      ], [
        htmlElement('div', [{ name: 'style', value: 'display:flex;align-items:center;gap:9px' }], [
          htmlElement('button', [
            { name: 'type', value: 'button' },
            { name: 'data-notifications-close', value: '1' },
            { name: 'aria-label', value: 'Back' },
            { name: 'title', value: 'Back to page' },
            { name: 'sc-camel-on-click', value: '{{ closeNotifications }}' },
            { name: 'style', value: 'display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:999px;background:#E5E5E5;color:#1C1C1C;font-family:inherit;font-size:17px;line-height:1;cursor:pointer' },
          ], [textNode('←')]),
          htmlElement('div', [], [
          htmlElement('h2', [{ name: 'style', value: 'margin:0;font-size:17px;font-weight:600' }], [textNode('Notifications')]),
          htmlElement('span', [{ name: 'style', value: 'font-size:11px;color:#5A5F5C' }], [textNode('{{ notificationsCountLabel }}')]),
          ]),
        ]),
        when('{{ unreadNotifications }}', [htmlElement('button', [
          { name: 'type', value: 'button' },
          { name: 'data-notifications-read', value: '1' },
          { name: 'sc-camel-on-click', value: '{{ markNotificationsRead }}' },
          { name: 'style', value: 'padding:7px 10px;border:0;border-radius:999px;background:#E5E5E5;color:#1C1C1C;font-family:inherit;font-size:11px;cursor:pointer' },
        ], [textNode('Mark all read')])]),
      ]),
      when('{{ notificationsEmpty }}', [htmlElement('p', [
        { name: 'data-notifications-empty', value: '1' },
        { name: 'style', value: 'margin:0;padding:28px 18px;color:#5A5F5C;font-size:13px;line-height:1.5' },
      ], [textNode('No notifications yet. Finished scans and lookups will appear here.')])]),
      htmlElement('div', [{ name: 'style', value: 'overflow:auto;min-height:0' }], [
        loop('{{ notificationRows }}', 'n', [htmlElement('div', [
          { name: 'data-notification', value: '{{ n.id }}' },
          { name: 'data-unread', value: '{{ n.unread }}' },
          { name: 'style', value: 'display:flex;align-items:flex-start;gap:10px;width:100%;padding:14px 18px;border-bottom:1px solid #E4E5E2;background:transparent;color:#1C1C1C;font-family:inherit;text-align:left' },
        ], [
          htmlElement('span', [
            { name: 'aria-hidden', value: 'true' },
            { name: 'data-level', value: '{{ n.level }}' },
            { name: 'style', value: 'width:8px;height:8px;margin-top:5px;border-radius:999px;background:{{ n.color }};flex:none' },
          ]),
          htmlElement('span', [{ name: 'style', value: 'display:block;min-width:0;flex:1' }], [
            htmlElement('strong', [{ name: 'style', value: 'display:block;font-size:13px;font-weight:600;line-height:1.35' }], [textNode('{{ n.title }}')]),
            htmlElement('span', [{ name: 'style', value: 'display:block;margin-top:3px;color:#5A5F5C;font-size:12px;line-height:1.45' }], [textNode('{{ n.body }}')]),
            htmlElement('time', [{ name: 'date-time', value: '{{ n.at }}' }, { name: 'style', value: 'display:block;margin-top:7px;color:#6C766F;font-size:10.5px' }], [textNode('{{ n.when }}')]),
          ]),
          when('{{ n.unread }}', [htmlElement('span', [{ name: 'aria-label', value: 'Unread' }, { name: 'style', value: 'width:6px;height:6px;margin-top:6px;border-radius:999px;background:#6F8060;flex:none' }])]),
          htmlElement('button', [
            { name: 'type', value: 'button' },
            { name: 'data-notification-read', value: '{{ n.id }}' },
            { name: 'aria-label', value: 'Mark notification read' },
            { name: 'title', value: 'Mark as read' },
            { name: 'sc-camel-on-click', value: '{{ n.read }}' },
            { name: 'style', value: 'align-self:flex-start;padding:3px 6px;border:0;border-radius:6px;background:transparent;color:#6C766F;font-family:inherit;font-size:10px;cursor:pointer' },
          ], [textNode('Read')]),
          htmlElement('button', [
            { name: 'type', value: 'button' },
            { name: 'data-notification-delete', value: '{{ n.id }}' },
            { name: 'aria-label', value: 'Delete notification: {{ n.title }}' },
            { name: 'title', value: 'Delete notification' },
            { name: 'sc-camel-on-click', value: '{{ n.remove }}' },
            { name: 'style', value: 'align-self:flex-start;padding:3px 6px;border:0;border-radius:6px;background:transparent;color:#A85F59;font-family:inherit;font-size:10px;font-weight:600;cursor:pointer' },
          ], [textNode('Delete')]),
        ])]),
      ]),
    ])
    bell.parentNode.childNodes.push(when('{{ notificationsOpen }}', [panel]))
  }

  const warnToggle = findElement(root, (node) => node.tagName === 'button' && /Warn me at 80% of any credit pool/.test(textOf(node)))
  if (warnToggle) {
    const title = findElement(warnToggle, (node) => node.tagName === 'span' && textOf(node) === 'Warn me at 80% of any credit pool')
    const note = findElement(warnToggle, (node) => node.tagName === 'span' && /One desktop notification per pool/.test(textOf(node)))
    if (title) setText(title, 'Desktop notifications')
    if (note) setText(note, 'Show alerts for finished scans, lookups and app updates.')
  }

  // The build number, in the rail and in the status strip. Both are bound to the version the
  // package is actually on, rather than the number the design was drawn with.
  const railVersion = findElement(root, (node) => node.tagName === 'div' && /^v\d+\.\d+\.\d+$/.test(textOf(node)))
  if (railVersion) setText(railVersion, '{{ appVersion }}')
  const build = findElement(root, (node) => node.tagName === 'span' && /^BUILD v\d+\.\d+\.\d+$/.test(textOf(node)))
  if (build) setText(build, '{{ buildLabel }}')
}

function listsView(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isLists }}')
  if (!view) throw new Error('could not find the Saved Lists view in the reference markup')
  return view
}

/**
 * Saved Lists: the picks from the last run, and the lists a workspace actually has.
 *
 * The design draws ten sample picks, a running total, four sample list cards and a fixed "6 lists ·
 * 82 leads" badge. Every one of those is a statement about the workspace, so the two figures above
 * the picks are bound, the list cards become a loop over the real lists, and the page states how
 * many lists there are rather than how many the design happened to draw.
 */
function bindListsPage(root) {
  tryBind('bindListsPage', () => {
    const view = listsView(root)

    // The card that states what the last run brought back: its own two figures and the filter line.
    const heading = findElement(view, (node) => node.tagName === 'h2' && /places to sort through/.test(textOf(node)))
    if (heading) setText(heading, '{{ pickCount }} to sort through')
    const runLine = findElement(view, (node) =>
      node.tagName === 'p' && /near .* · /.test(textOf(node)) && /physiotherapy|skin care|sports massage/.test(textOf(node)),
    )
    if (runLine) setText(runLine, '{{ lastRunLine }}')

    // The running total beside "of 10 bookmarked": the total is the picks on screen.
    const bookmarkLine = findElement(view, (node) => node.tagName === 'span' && /^of \d+/.test(textOf(node)))
    if (bookmarkLine) setText(bookmarkLine, '{{ pickTotalLabel }}')

    // The lists section: its heading badge, then one card per list.
    const listsHeading = findElement(view, (node) => node.tagName === 'h2' && textOf(node).trim() === 'Your lists')
    const listsBadge = listsHeading
      ? findElement(listsHeading.parentNode.parentNode, (node) => node.tagName === 'span' && /lists ·/.test(textOf(node)))
      : null
    if (listsBadge) setText(listsBadge, '{{ listTotals }}')

    const grid = findElements(view, (node) => /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,252px\)/.test(getAttr(node, 'style') ?? ''))[0]
    if (!grid) throw new Error('could not find the saved lists grid')
    const cards = childElements(grid).filter((node) => node.tagName === 'section')
    if (!cards.length) throw new Error('the saved lists grid carries no sample card')

    const card = cloneNode(cards[0])
    const name = findElement(card, (node) => node.tagName === 'h3')
    setText(name, '{{ l.name }}')
    setText(findElement(card, (node) => node.tagName === 'span' && /^\d+ leads?$/.test(textOf(node))), '{{ l.members }}')
    setText(findElement(card, (node) => node.tagName === 'p'), '{{ l.note }}')

    // The avatar stack: three initials, each with the design's own background, from the list's
    // members. The pips already carry their fills as inline styles, so they are left as drawn.
    const stack = findElements(card, (node) => /border-radius:999px/.test(getAttr(node, 'style') ?? '') && /border:2px solid/.test(getAttr(node, 'style') ?? ''))[0]
    if (stack) {
      stack.childNodes = [
        loop('{{ l.avatars }}', 'a', [
          htmlElement('span', [
            { name: 'aria-hidden', value: 'true' },
            { name: 'style', value: 'display:grid;place-items:center;width:30px;height:30px;margin-left:-9px;border-radius:999px;background:#DDE3D6;border:2px solid #F5F5F4;font-size:10px;font-weight:700' },
          ], [textNode('{{ a.ini }}')]),
        ]),
      ]
    }

    const updated = findElements(card, (node) => node.tagName === 'span' && /^Updated |Nothing added/.test(textOf(node)))[0]
    if (updated) setText(updated, '{{ l.updated }}')

    grid.childNodes = [loop('{{ savedLists }}', 'l', [card])]
  })
}

/**
 * Run History used to be six hand-written rows. The log is real, so the rows are bound to it:
 * each entry keeps the timeline dot and bar chart the reference drew, and takes its time,
 * keywords, summary line and status pill from the stored run.
 */
function runsView(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isRuns }}')
  if (!view) throw new Error('could not find the Run History view in the reference markup')
  return view
}

/**
 * Run History: the four headline figures, and one timeline entry per stored run.
 *
 * The design hand-writes its timeline rows: a dot on the rail, the time and terms, the summary
 * line, a small bar chart and a status pill. All five come from the stored run, so the row is
 * rebuilt once round the first sample and the pill keeps the design's three variants — done,
 * failed and the muted one a run that never finished reads as.
 */
function bindRunsPage(root) {
  tryBind('bindRunsPage', () => {
    const view = runsView(root)

    // The badge beside the heading, and the four figures under it.
    const badge = findElement(view, (node) => node.tagName === 'span' && /^\d+ RUNS$/.test(textOf(node)))
    if (badge) setText(badge, '{{ runBadge }}')
    // The four figures under it. Each tile is a row of its own: a large number, often a smaller
    // half beside it, a badge on the right, the label under it and a row of pips. Only the number
    // and the badge are bound, and the last tile's number is a fraction rather than one figure.
    // The number is found by where it sits — the first span of a row that has no children of its
    // own — because the block around it carries the same font rule.
    const tiles = findElements(view, (node) => /clamp\(40px,/.test(getAttr(node, 'style') ?? '') && !childElements(node).length)
    const figures = ['runCount', 'runPlaces', 'runMedian', 'runClean']
    if (tiles.length !== 4) throw new Error(`expected four run figures, found ${tiles.length}`)
    tiles.forEach((tile, index) => {
      const headRow = tile.parentNode
      const head = childElements(headRow)
      const label = figures[index] === 'runClean' ? 'runCleanNum' : figures[index]
      if (label) setText(tile, `{{ ${label} }}`)
      // The badge is the last span in the head row: "+18 today", "Median", "93%", "All time".
      const tag = head[head.length - 1]
      if (tag && tag !== tile) setText(tag, `{{ ${figures[index]}Badge }}`)
      // The half beside a split figure — ":12" on the duration, "/42" on the clean count.
      if (head[1] && head[1] !== tile && head[1] !== tag) {
        setText(head[1], figures[index] === 'runClean' ? '{{ runCleanTotal }}' : '{{ runMedianHalf }}')
      }
    })

    // The timeline list: its sample rows become one row template.
    const rail = findElement(view, (node) => node.tagName === 'ul' && findElement(node, (child) => /padding:16px 0 16px 44px/.test(getAttr(child, 'style') ?? '')))
    if (!rail) throw new Error('could not find the run timeline')
    const samples = childElements(rail).filter((node) => /padding:16px 0 16px 44px/.test(getAttr(node, 'style') ?? ''))
    if (!samples.length) throw new Error('the run timeline carries no sample row')

    const row = cloneNode(samples[0])
    const rowParts = childElements(row)
    if (rowParts.length < 3) throw new Error('the run timeline row is not shaped as expected')
    // The three parts of a row: the dot on the rail, the body that states the run, and the right
    // side that carries the chart, the status pill and the Re-run button.
    const body = rowParts[1]
    const right = rowParts[2]
    const lines = childElements(body)
    if (lines.length < 2) throw new Error('the run timeline row states nothing')
    const head = childElements(lines[0])
    if (head.length < 2) throw new Error('the run timeline row carries no time or terms')
    setText(head[0], '{{ r.when }}')
    setText(head[1], '{{ r.keywords }}')
    setText(lines[1], '{{ r.summary }}')

    // The chart: one bar per keyword pass, each keeping the design's own bar style.
    const rightParts = childElements(right)
    const chart = rightParts[0]
    const pill = rightParts[1]
    if (!chart || !pill) throw new Error('the run timeline row carries no chart or status pill')
    const bar = cloneNode(childElements(chart)[0])
    setAttr(bar, 'style', (getAttr(bar, 'style') ?? '').replace(/height:[^;]+/, 'height:{{ b.height }}'))
    chart.childNodes = [loop('{{ r.bars }}', 'b', [bar])]

    // The pill: the design draws a done pill, and the other two states are its own colours.
    const failed = cloneNode(pill)
    setAttr(failed, 'style', (getAttr(failed, 'style') ?? '').replace(/background:#[0-9A-Fa-f]{6}/, 'background:#F0DEDC').replace(/color:#[0-9A-Fa-f]{6}/, 'color:#7A2E27'))
    setText(failed, '{{ r.failed }}')
    const pending = cloneNode(pill)
    setAttr(pending, 'style', (getAttr(pending, 'style') ?? '').replace(/background:#[0-9A-Fa-f]{6}/, 'background:#EAEAE8').replace(/color:#[0-9A-Fa-f]{6}/, 'color:#4A4F4B'))
    setText(pending, '{{ r.cancelled }}')
    setText(pill, '{{ r.done }}')
    // Everything before the sample pill is kept — the chart — then the three states, then whatever
    // followed the sample pill, which is the Re-run button. The sample pill itself goes. The split
    // is by position in the whole list, not in the element list, because `childNodes` also holds
    // the whitespace between the elements.
    const pillAt = right.childNodes.indexOf(pill)
    if (pillAt < 0) throw new Error('the status pill is not among the row’s own nodes')
    right.childNodes = [
      ...right.childNodes.slice(0, pillAt),
      when('{{ r.isDone }}', [pill]),
      when('{{ r.isFailed }}', [failed]),
      when('{{ r.isCancelled }}', [pending]),
      ...right.childNodes.slice(pillAt + 1),
    ]

    // The rail is drawn from the log alone: the rows the design wrote by hand are placeholders, and
    // one left beside the real entries would be a run that never happened.
    rail.childNodes = [loop('{{ runRows }}', 'r', [row])]

    // The footer under the rail: how many of the logged runs the page is showing.
    replaceText(view, 'Showing 6 of 42 runs · log kept for 90 days', 'Showing {{ runShowing }} of {{ runCount }} runs · log kept for 90 days')

    // Its own "Older runs" reads the next page of the log, and is offered only while there is one.
    const more = findElement(view, (node) => node.tagName === 'button' && /^Older runs/.test(textOf(node).trim()))
    if (more) {
      more.attrs = more.attrs.filter((attr) => attr.name !== 'data-demo')
      setAttr(more, 'sc-camel-on-click', '{{ showMoreRuns }}')
      more.parentNode.childNodes = (more.parentNode.childNodes ?? []).map((child) =>
        child === more ? when('{{ runsMoreOn }}', [more]) : child,
      )
    }
  })
}

// ---------------------------------------------------------------- dashboard data binding
//
// The dashboard is the page that most obviously cannot be drawn from fixed numbers: it claims to
// summarise the workspace. The four headline tiles, the coverage rings, the platform mix, the
// category list and the "needs attention" counts all come from one aggregate query, so the page
// cannot disagree with the tables behind it.
//
// The decorative chart bars are left as the reference drew them; every figure that reads as a
// statement about the data is bound.

function dashboardView(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isDashboard }}')
  if (!view) throw new Error('could not find the Dashboard view in the reference markup')
  return view
}

// Which figure, denominator and note each headline tile carries.
const DASH_TILES = [
  ['Total Leads', 'dashTotal', 'dashTotalNote', ''],
  ['Enriched', 'dashEnriched', 'dashTotal', 'dashEnrichedPct'],
  ['With Phone', 'dashWithPhone', 'dashTotal', 'dashPhoneNote'],
  ['Ready to Export', 'dashExportReady', 'dashTotal', 'dashExportNote'],
]

/**
 * The dashboard's Contact Coverage card.
 *
 * Four rings, each stating what share of the database one channel reaches. They are the design's
 * own arcs and percentage spans, so each ring only takes its own share and the offset that draws
 * it — the phone ring the phone share, the email ring the email share, in the order drawn.
 */
function bindContactCoverage(root) {
  const heading = findElement(root, (node) => node.tagName === 'h2' && textOf(node).trim() === 'Contact Coverage')
  if (!heading) throw new Error('could not find the Contact Coverage card')
  const card = findElement(root, (node) => node.tagName === 'section' && /Contact Coverage/.test(textOf(node)))
  if (!card) throw new Error('could not find the Contact Coverage section')
  const rings = findElements(card, (node) => /width:86px/.test(getAttr(node, 'style') ?? ''))
  if (rings.length !== 4) throw new Error(`expected four coverage rings, found ${rings.length}`)
  const sources = [
    { pct: 'dashPhonePct', off: 'dashPhoneOffset' },
    { pct: 'dashEmailPct', off: 'dashEmailOffset' },
    { pct: 'dashSocialPct', off: 'dashSocialOffset' },
    { pct: 'dashDmPct', off: 'dashDmOffset' },
  ]
  rings.forEach((ring, index) => {
    const source = sources[index]
    const arc = findElement(ring, (node) => getAttr(node, 'stroke-dashoffset'))
    if (arc) setAttr(arc, 'stroke-dashoffset', `{{ ${source.off} }}`)
    // The design writes the ring's figure and its "%" in one span — "70%". The arc was bound while
    // the number beside it stayed the designer's own, so the ring drew one share and stated another.
    // Both halves are the same figure, so the span is rebuilt with the binding in both places.
    const label = findElement(ring, (node) => node.tagName === 'span' && /font-size:20px/.test(getAttr(node, 'style') ?? ''))
    if (!label) throw new Error('a coverage ring carries no percentage')
    label.childNodes = [
      textNode(`{{ ${source.pct} }}`),
      htmlElement('span', [{ name: 'style', value: 'font-size:11px;color:#5A5F5C' }], [textNode('%')]),
    ]
  })
}

function bindDashboardPage(root) {
  tryBind('bindDashboardPage', () => {
    bindContactCoverage(root)

    const view = dashboardView(root)

    // The headline cards are claims about the local database. Bind both the numerator and the
    // denominator (where the design shows one), plus the small badge at the right of each card.
    // The reference's four sample figures were easy to miss because their labels were already
    // correct; locating each tile by its label keeps the binding independent of its grid order.
    const headlineTiles = DASH_TILES.map(([label, figure, denominator, badge]) => {
      const labelNode = findElement(view, (node) => node.tagName === 'div' && textOf(node).trim() === label)
      if (!labelNode?.parentNode) throw new Error(`could not find the ${label} dashboard tile`)
      const tile = labelNode.parentNode
      const head = childElements(tile)[0]
      const parts = head ? childElements(head) : []
      if (!parts.length) throw new Error(`the ${label} dashboard tile has no figure row`)
      setText(parts[0], `{{ ${figure} }}`)
      if (denominator && parts[1]) setText(parts[1], `/{{ ${denominator} }}`)
      const tag = parts[parts.length - 1]
      if (tag && tag !== parts[0]) setText(tag, `{{ ${badge || 'dashTotalNote'} }}`)
      return tile
    })
    if (headlineTiles.length !== DASH_TILES.length) throw new Error('not all dashboard headline tiles were bound')

    // Scrape Volume compares this month with the previous thirty-day window. The percentage is
    // calculated in useAppValues; the period label remains the design's useful context.
    const delta = findElement(view, (node) => node.tagName === 'strong' && textOf(node).trim() === '+42%')
    if (delta) setText(delta, '{{ dashScrapeDelta }}')

    // Data Quality is another aggregate figure in the same hero grid. Bind its score and status
    // so the card cannot disagree with the dashboard query while the other tiles are live.
    const quality = findElement(view, (node) => node.tagName === 'section' && /Data Quality/.test(textOf(node)))
    if (quality) {
      const score = findElement(quality, (node) => /clamp\(52px,5\.5vw,74px\)/.test(getAttr(node, 'style') ?? '') && !childElements(node).length)
      if (score) setText(score, '{{ dashQuality }}')
      const status = findElement(quality, (node) => node.tagName === 'span' && /^(Good|Fair|Thin|No data)$/.test(textOf(node).trim()))
      if (status) setText(status, '{{ dashQualityLabel }}')
    }

    // The three small tiles beside the scrape-volume chart: what the last week brought in, the best
    // single run, and the average. Each is read from the run log rather than left as the design's
    // own 34, 21 and 8.5 leads.
    const tiles = findElements(view, (node) => node.tagName === 'div' && /font-size:16px;font-weight:700/.test(getAttr(node, 'style') ?? ''))
    const tileValues = ['dashWeekLeads', 'dashBestRun', 'dashAvgRun']
    tiles.slice(0, 3).forEach((tile, index) => setText(tile, `{{ ${tileValues[index]} }}`))

    // The insight line under the AI Insights heading. The design states its own workspace's gap —
    // "38 leads have a website but no email" — which this workspace has to state for itself.
    const insight = findElement(view, (node) => node.tagName === 'p' && /^\d+ leads have a website but no email/.test(textOf(node)))
    if (insight) setText(insight, '{{ dashInsight }}')

    // The "Needs Attention" card: one row per gap, each with the number of leads behind it. A gap
    // this workspace does not have has no row, and the badge counts the rows that are left.
    const needs = findElement(view, (node) => node.tagName === 'section' && /Needs Attention/.test(textOf(node)))
    if (needs) {
      const rows = findElements(needs, (node) => node.tagName === 'div' && /background:#252625/.test(getAttr(node, 'style') ?? ''))
      const figures = ['dashNoEmail', 'dashNoPhone', 'dashExportReady']
      const flags = ['dashNoEmailOn', 'dashNoPhoneOn', 'dashExportReadyOn']
      rows.slice(0, 3).forEach((row, index) => {
        const figure = findElement(row, (node) => node.tagName === 'strong')
        if (figure) setText(figure, `{{ ${figures[index]} }}`)
        row.parentNode.childNodes = (row.parentNode.childNodes ?? []).map((child) =>
          child === row ? when(`{{ ${flags[index]} }}`, [row]) : child,
        )
      })
      const badge = findElement(needs, (node) => node.tagName === 'span' && /^\d+ actions?$/.test(textOf(node)))
      if (badge) setText(badge, '{{ dashActionCount }}')
    }

    // Social Platform Coverage. The drawing is a ranking: eight columns, tallest first, each with
    // its platform code and count underneath. The columns keep their shapes and take the platform
    // that belongs in their place, so the chart ranks this workspace's platforms rather than the
    // designer's.
    const coverage = findElement(view, (node) => node.tagName === 'section' && /Social Platform Coverage/.test(textOf(node)))
    if (coverage) {
      const legendRow = findElement(coverage, (node) => node.tagName === 'div' && /gap:8px;margin-top:12px/.test(getAttr(node, 'style') ?? ''))
      if (!legendRow) throw new Error('could not find the platform legend')
      childElements(legendRow).forEach((label, index) => {
        const figure = findElement(label, (node) => node.tagName === 'strong')
        const figureStyle = figure ? (getAttr(figure, 'style') ?? 'font-weight:700;font-size:13px') : 'font-weight:700;font-size:13px'
        label.childNodes = [
          textNode(`{{ dashPlatformColumns[${index}].short }}`),
          htmlElement('br', [], []),
          htmlElement('strong', [{ name: 'style', value: figureStyle }], [textNode(`{{ dashPlatformColumns[${index}].count }}`)]),
        ]
      })
    }

    // Top Categories: the rows are drawn from the aggregate, so the list is rebuilt once round the
    // design's first row and the whole list is a loop. A workspace with no categories yet says so.
    const categories = findElement(view, (node) => node.tagName === 'section' && /Top Categories/.test(textOf(node)))
    if (categories) {
      const list = findElement(categories, (node) => node.tagName === 'ul')
      const sample = list ? childElements(list)[0] : null
      if (sample) {
        const row = cloneNode(sample)
        const parts = childElements(row)
        setText(parts[0], '{{ c.name }}')
        setText(parts[1], '{{ c.count }}')
        setText(parts[2], '{{ c.badge }}')
        const stateRow = htmlElement(
          'li',
          [{ name: 'style', value: 'padding:16px 0;border-top:1px solid #E4E5E2;color:#5A5F5C;font-size:13.5px' }],
          [textNode('{{ dashCategoriesEmpty }}')],
        )
        list.childNodes = [when('{{ dashCategoriesEmpty }}', [stateRow]), loop('{{ dashCategoryRows }}', 'c', [row])]
      }
    }

    // Run Timeline: the milestone chips, the bar chart and its axis.
    const timeline = findElement(view, (node) => node.tagName === 'section' && /Run Timeline/.test(textOf(node)))
    if (timeline) {
      const chipRow = findElement(timeline, (node) => node.tagName === 'div' && /gap:10px;margin-top:16px/.test(getAttr(node, 'style') ?? ''))
      const chips = chipRow ? childElements(chipRow) : []
      chips.slice(0, 5).forEach((chip, index) => {
        setText(chip, `{{ dashMile${index + 1} }}`)
        chip.parentNode.childNodes = (chip.parentNode.childNodes ?? []).map((child) =>
          child === chip ? when(`{{ dashMile${index + 1}On }}`, [chip]) : child,
        )
      })

      // The chart itself: the design left an empty strip once its sample bars were taken out, so
      // one bar is rebuilt from the volume chart's own bar and the strip becomes a loop over runs.
      const strip = findElement(timeline, (node) => getAttr(node, 'data-timeline') === '1')
      const volume = findElement(view, (node) => node.tagName === 'section' && /Scrape Volume/.test(textOf(node)))
      const barSample = volume ? findElement(volume, (node) => /border-radius:2px 2px 0 0/.test(getAttr(node, 'style') ?? '')) : null
      if (strip && barSample) {
        const bar = cloneNode(barSample)
        setAttr(bar, 'style', 'flex:1;height:{{ b.height }};border-radius:2px 2px 0 0;background:#C8D5BB;transform-origin:bottom')
        strip.childNodes = [loop('{{ dashTimelineBars }}', 'b', [bar])]
      }
      if (strip) {
        const empty = htmlElement('span', [{ name: 'style', value: 'font-size:12.5px;color:#5A5F5C' }], [textNode('{{ dashTimelineEmpty }}')])
        strip.childNodes = [when('{{ dashTimelineEmpty }}', [empty]), ...(strip.childNodes ?? [])]
      }

      // The axis under it names the period the runs cover, so it is drawn from the log as well. It
      // is found by where it sits — the row right after the bars — because the card's own header is
      // also a flex row that spreads its children apart.
      const after = strip ? (strip.parentNode.childNodes ?? []).slice((strip.parentNode.childNodes ?? []).indexOf(strip) + 1) : []
      const axis = after.find((node) => node.tagName === 'div')
      if (axis) {
        const sample = childElements(axis)[0] ?? null
        if (sample) {
          const label = cloneNode(sample)
          setText(label, '{{ x.label }}')
          axis.childNodes = [loop('{{ dashTimelineAxis }}', 'x', [label])]
        }
      }
    }
  })
}

// ---------------------------------------------------------------- billing data binding
//
// The billing page states a plan, a price, a renewal date and a set of usage meters. There is no
// billing provider behind a local app, so the plan is the one the workspace actually holds and
// the meters report the enrichment passes that have actually run. Anything the app cannot know ·
// a card number, a VAT number · is out of scope and left as the reference drew it.

function settingsView(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isSettings }}')
  if (!view) throw new Error('could not find the Billing & Account view in the reference markup')
  return view
}

/**
 * Each usage meter is a label beside a used figure, a window and a bar.
 *
 * Maps scrapes are counted against the plan's own allowance ("43 of 2,000"). The four lookup pools
 * have no quota behind them — the counts are real, the limits never were — so each states the window
 * it covers instead of an allowance nobody enforces.
 */
const BILLING_METERS = [
  ['Maps scrapes', 'usedScrapes', 'scrapeLimit', 'meterScrapes', 'of'],
  ['Email lookups', 'usedEmailLookups', 'lookupWindowNote', 'meterEmail', 'note'],
  ['Phone lookups', 'usedPhoneLookups', 'lookupWindowNote', 'meterPhone', 'note'],
  ['Social lookups', 'usedSocialLookups', 'lookupWindowNote', 'meterSocial', 'note'],
  ['Decision-maker lookups', 'usedDmLookups', 'lookupWindowNote', 'meterDm', 'note'],
  ['AI insight summaries', 'usedAiLookups', null, 'meterAi', 'none'],
]

/**
 * Billing & Account.
 *
 * The page is a subscription page for a product that has no subscription: there is no payment
 * provider behind a desktop app, so anything that would name a card, an invoice or a charge is
 * replaced with what is true — nothing has been billed. What the app does know is bound: the plan
 * it is running under, the renewal date, and the six meters, each measured against its allowance.
 * The switches and the tab strip are already wired; this is the figures.
 */
function bindBillingPage(root) {
  tryBind('bindBillingPage', () => {
    const view = settingsView(root)
    const tab = (name) => {
      const found = findElement(view, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === `{{ ${name} }}`)
      if (!found) throw new Error(`could not find the ${name} tab`)
      return found
    }

    const plan = tab('tabPlan')

    // The tab rail's badges and the panel under them. The rail sits beside the tabs rather than
    // inside one, so it is bound once from the page.
    const rail = findElement(view, (node) => getAttr(node, 'data-tabs') === '1')
    if (rail) {
      const badges = [
        ['Pro', 'planBadgeShort'],
        ['2 cards', 'cardBadge'],
        ['14', 'invoiceBadge'],
        ['3 of 5', 'seatsBadge'],
      ]
      for (const [text, value] of badges) {
        const badge = findElement(rail, (node) => node.tagName === 'span' && textOf(node).trim() === text)
        if (badge) setText(badge, `{{ ${value} }}`)
      }
      const charge = findElement(rail, (node) => node.tagName === 'span' && textOf(node).trim() === '£39.00')
      if (charge) setText(charge, '{{ nextChargeValue }}')
      const when = findElement(rail, (node) => node.tagName === 'p' && /Visa •••• 4242/.test(textOf(node)))
      if (when) setText(when, '{{ nextChargeNote }}')
    }
    const name = findElement(plan, (node) => node.tagName === 'h2' && textOf(node).trim() === 'Nafran Pro')
    if (name) setText(name, '{{ planName }}')
    const summary = findElement(plan, (node) => node.tagName === 'p' && /Maps scrapes, 1,500 email/.test(textOf(node)))
    if (summary) setText(summary, '{{ planSummary }}')
    const price = findElement(plan, (node) => /clamp\(40px,4\.2vw,54px\)/.test(getAttr(node, 'style') ?? '') && !childElements(node).length)
    if (price) setText(price, '{{ planPriceValue }}')
    replaceTextIfPresent(plan, '2 Oct 2026', '{{ renewsOn }}')
    replaceTextIfPresent(plan, 'Member since 14 Mar 2025', '{{ memberSince }}')
    replaceTextIfPresent(plan, '18 invoices paid', '{{ invoiceNote }}')
    replaceTextValueIfPresent(plan, '2 Sep – 2 Oct 2026', '{{ cycleRange }}')
    replaceTextIfPresent(plan, '22 days left', '{{ sidebarDays }}')

    // The six meters. Each row is found by its own label, so the figures cannot land on the wrong
    // row: what is used, what window or allowance it is counted over, and how full the bar is.
    for (const [label, used, limit, meter, kind] of BILLING_METERS) {
      const labelNode = findElement(plan, (node) => node.tagName === 'span' && textOf(node).trim() === label)
      if (!labelNode) throw new Error(`could not find the ${label} meter`)
      const row = labelNode.parentNode
      const parts = childElements(row)
      if (parts[1]) setText(parts[1], `{{ ${used} }}`)
      if (parts[2] && kind === 'of') setText(parts[2], `of {{ ${limit} }}`)
      if (parts[2] && kind === 'note') setText(parts[2], `{{ ${limit} }}`)
      if (parts[2] && kind === 'none') setText(parts[2], '')
      const bar = row.parentNode ? findElement(row.parentNode, (node) => /width:\d+%/.test(getAttr(node, 'style') ?? '')) : null
      if (bar) setAttr(bar, 'style', (getAttr(bar, 'style') ?? '').replace(/width:[^;]+/, `width:{{ ${meter} }}`))
    }

    // Payment methods. There is no card: the two sample cards go, and one panel states it.
    const pay = tab('tabPay')
    const cards = findElement(pay, (node) => /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,276px\)/.test(getAttr(node, 'style') ?? ''))
    if (cards) {
      const samples = childElements(cards).filter((node) => node.tagName === 'div' && /border-radius:18px/.test(getAttr(node, 'style') ?? ''))
      if (samples.length) {
        const note = cloneNode(samples[1])
        note.childNodes = [htmlElement('div', [{ name: 'style', value: 'font-size:14px;font-weight:500' }], [textNode('No card on file')]), htmlElement('p', [{ name: 'style', value: 'margin:8px 0 0;font-size:12.5px;line-height:1.5;color:#5A5F5C' }], [textNode('This app runs on your machine and has never charged you, so there is no card to manage here.')])]
        cards.childNodes = [when('{{ cardMissing }}', [note])]
      }
    }
    // "Add card" has nothing behind it, so it is not offered.
    const addCard = findElement(pay, (node) => node.tagName === 'button' && /^Add card$/.test(textOf(node).trim()))
    if (addCard) addCard.parentNode.childNodes = (addCard.parentNode.childNodes ?? []).filter((child) => child !== addCard)

    // Billing details: nothing has been set, because nothing has ever been billed. The rows keep
    // their shape and their labels, and each value says so.
    const details = findElement(pay, (node) => node.tagName === 'section' && /Printed on every invoice/.test(textOf(node)))
    if (details) {
      const rows = findElements(details, (node) => node.tagName === 'div' && /border-top:1px solid #E4E5E2/.test(getAttr(node, 'style') ?? ''))
      for (const row of rows) {
        const parts = childElements(row)
        if (parts[1]) setText(parts[1], '{{ billingNotSet }}')
        // The Edit button behind each row has no editor behind it.
        if (parts[2]) row.childNodes = (row.childNodes ?? []).filter((child) => child !== parts[2])
      }
    }

    // Invoices. There are none, and a table of six sample ones names amounts that were never
    // charged, so the table states that instead.
    const invoices = tab('tabInv')
    const note = findElement(invoices, (node) => node.tagName === 'p' && /invoices · £/.test(textOf(node)))
    if (note) setText(note, '{{ invoiceNoteLong }}')
    const list = findElement(invoices, (node) => node.tagName === 'ul')
    if (list) {
      const stateRow = htmlElement(
        'li',
        [{ name: 'style', value: 'padding:22px 0;border-top:1px solid #E4E5E2;color:#5A5F5C;font-size:13.5px' }],
        [textNode('{{ invoiceState }}')],
      )
      list.childNodes = [stateRow]
    }
    const footer = findElement(invoices, (node) => node.tagName === 'span' && /^Showing \d+ of \d+ invoices$/.test(textOf(node)))
    if (footer && footer.parentNode) footer.parentNode.childNodes = (footer.parentNode.childNodes ?? []).filter((child) => child === footer ? false : !(child.tagName === 'button'))

    // The account tab's own claim about the data: how many leads stay on this machine.
    const acct = tab('tabAcct')
    replaceTextValueIfPresent(acct, '128 saved leads', '{{ storedLeadCount }} saved leads')
  })
}

// ---------------------------------------------------------------- phone finder binding
//
// The phone book is one row per lead, including the leads with no number, because the gaps are
// what the page is for. Each row keeps the reference's own line-type pill, chosen by state.

function phoneView(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isPhone }}')
  if (!view) throw new Error('could not find the Phone Finder view in the reference markup')
  return view
}

function bindPhonePage(root) {
  tryBind('bindPhonePage', () => {
    const view = phoneView(root)
    bindPhoneBook(view)
    // The footer under the book states how much of the workspace the page is showing. The design
    // writes it as a fixed "Showing 10 of 128 leads", which is a claim about a workspace it never
    // saw, so it counts the rows on the page against the leads the run covers.
    replaceText(view, 'Showing 10 of 128 leads.', 'Showing {{ phoneShowing }} of {{ phoneTotal }} leads.')

    // The dark card above the book: how many leads a call would reach, out of how many, and how
    // many of those numbers are a direct line. All three are the phone summary's own figures.
    const reachable = findElement(view, (node) => /clamp\(46px/.test(getAttr(node, 'style') ?? '') && !childElements(node).length)
    if (reachable) setText(reachable, '{{ phoneReachable }}')
    replaceText(view, 'of 128 leads · 70% callable', 'of {{ phoneTotal }} leads · {{ phoneCallablePct }}% callable')
    // The area-code card's own note names the same population.
    replaceText(view, 'Where the 89 numbers dial to.', 'Where the {{ phoneReachable }} numbers dial to.')
    const direct = findElement(view, (node) => node.tagName === 'span' && /direct lines, no gatekeeper/.test(textOf(node)))
    if (direct) {
      const figure = findElement(direct, (node) => node.tagName === 'strong')
      if (figure) setText(figure, '{{ phoneDirect }}')
    }

    // The line-type ladder under the summary: one tile per kind of number, each as wide as its own
    // share of the book. The design's figures were its own workspace's.
    const ladder = findElement(view, (node) => getAttr(node, 'data-ladder') === '1')
    if (ladder) {
      const figures = ['phoneDirect', 'phoneReception', 'phoneMobile', 'phoneMissing']
      const widths = ['phoneDirectWidth', 'phoneReceptionWidth', 'phoneMobileWidth', 'phoneMissingWidth']
      childElements(ladder).slice(0, 4).forEach((tile, index) => {
        setAttr(tile, 'style', (getAttr(tile, 'style') ?? '').replace(/flex:\d+/, `flex:{{ ${widths[index]} }}`))
        const parts = childElements(tile)
        if (parts[1]) setText(parts[1], `{{ ${figures[index]} }}`)
      })
    }

    // The Backfill card: what filling the missing numbers would take, and what cannot be filled.
    replaceTextValueIfPresent(view, '27 of the 39 missing leads have a website to scrape.', '{{ phoneBackfillNote }}')
    const backfill = findElement(view, (node) => node.tagName === 'section' && /Backfill/.test(textOf(node)))
    if (backfill) {
      const tiles = findElements(backfill, (node) => /font-size:16px;font-weight:700/.test(getAttr(node, 'style') ?? ''))
      const figures = ['phoneCanBackfill', 'phoneNoWebsite']
      tiles.slice(0, 2).forEach((tile, index) => setText(tile, `{{ ${figures[index]} }}`))
      const button = findElement(backfill, (node) => node.tagName === 'button' && /Find phones for missing/.test(textOf(node)))
      const count = button ? findElement(button, (node) => node.tagName === 'span' && /^\d+$/.test(textOf(node).trim())) : null
      if (count) setText(count, '{{ phoneCanBackfill }}')
    }

    // Area codes are a summary of the phone ledger, not a sample list of Manchester numbers. Keep
    // the card's row shape and bar styling, but draw as many rows as the database actually has.
    const areaCard = findElement(view, (node) => node.tagName === 'section' && /By Area Code/.test(textOf(node)))
    const areaList = areaCard ? findElement(areaCard, (node) => node.tagName === 'ul') : null
    const areaSample = areaList ? childElements(areaList)[0] : null
    if (areaList && areaSample) {
      const row = cloneNode(areaSample)
      const cells = childElements(row)
      if (cells.length < 4) throw new Error('the area-code rows are not shaped as expected')
      setText(cells[0], '{{ a.code }}')
      setText(cells[1], '{{ a.label }}')
      const bar = childElements(cells[2])[0]
      if (bar) setAttr(bar, 'style', (getAttr(bar, 'style') ?? '').replace(/width:[^;]+/, 'width:{{ a.width }}'))
      setText(cells[3], '{{ a.count }}')
      areaList.childNodes = [loop('{{ phoneAreas }}', 'a', [row])]
    }
  })
}

// ---------------------------------------------------------------- decision makers binding
//
// The person cards and the match funnel both come from decision_makers: the funnel counts how
// many leads reached each step, and the cards show the people it produced. A workspace with no
// named contacts yet shows an empty grid rather than four invented people.

function decisionMakersView(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isDm }}')
  if (!view) throw new Error('could not find the Decision Makers view in the reference markup')
  return view
}

/**
 * Decision Makers: the coverage figure, the seniority mix, and one card per named contact.
 *
 * The design hand-writes eleven matched people and a four-row seniority list. Both are statements
 * about the workspace, so the cards become a loop over the named contacts and the mix becomes a
 * loop over the titles those contacts actually carry. Each card keeps the design's own two badges —
 * a title that names a role reads as a strong match, anything else as a likely one.
 */
function bindDecisionMakersPage(root) {
  tryBind('bindDecisionMakersPage', () => {
    const view = decisionMakersView(root)

    // The paid deep pass is deliberately selectable: a user can send one lead for a smoke test or
    // a larger batch, and the value handed to useAppValues is the same value the button queues.
    // Put the control beside the page action so it remains visible on the actual Decision Makers
    // journey rather than hiding it in Settings.
    const deepButton = findElement(view, (node) => getAttr(node, 'data-deeprun') === '1')
    if (deepButton?.parentNode) {
      const selector = htmlElement(
        'div',
        [{ name: 'data-dm-picker', value: '1' }, { name: 'style', value: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }],
        [
          htmlElement('label', [{ name: 'style', value: 'display:flex;align-items:center;gap:8px;font-size:12.5px;color:#4A4F4B' }], [
            textNode('Leads'),
            htmlElement(
              'input',
              [
                { name: 'data-dm-limit', value: '1' },
                { name: 'type', value: 'number' },
                { name: 'min', value: '1' },
                { name: 'max', value: '{{ dmLeadLimitMax }}' },
                { name: 'value', value: '{{ dmLeadLimit }}' },
                { name: 'sc-camel-on-change', value: '{{ onDmLeadLimitInput }}' },
                { name: 'aria-label', value: 'Leads per deep pass' },
                { name: 'style', value: 'width:72px;height:36px;padding:0 10px;border:0;border-radius:999px;background:#EAEAE8;font-family:inherit;font-size:13px;color:#1C1C1C;outline:none' },
              ],
              [],
            ),
          ]),
          htmlElement('span', [{ name: 'data-dm-selection', value: '1' }, { name: 'style', value: 'font-size:12px;color:#5A5F5C;white-space:nowrap' }], [textNode('{{ dmSelectedLabel }}')]),
        ],
      )
      const at = deepButton.parentNode.childNodes.indexOf(deepButton)
      deepButton.parentNode.childNodes.splice(Math.max(0, at), 0, selector)
    }

    // The coverage card: the matched count, the share, and the two lines under the bar.
    const coverage = findElement(view, (node) => node.tagName === 'section' && /Coverage/.test(textOf(node)) && /have a named contact/.test(textOf(node)))
    if (coverage) {
      const big = findElement(coverage, (node) => /clamp\(44px/.test(getAttr(node, 'style') ?? '') && !childElements(node).length)
      if (big) setText(big, '{{ dmMatched }}')
      const of = findElement(coverage, (node) => node.tagName === 'span' && /^of \d+$/.test(textOf(node)))
      if (of) setText(of, 'of {{ dmTotal }}')
      const fill = findElement(coverage, (node) => /width:\d+%/.test(getAttr(node, 'style') ?? ''))
      if (fill) setAttr(fill, 'style', (getAttr(fill, 'style') ?? '').replace(/width:\d+%/, 'width:{{ dmCoveragePct }}%'))
      const lines = findElements(coverage, (node) => node.tagName === 'span' && /named contact$|missing$/.test(textOf(node)))
      if (lines[0]) setText(lines[0], '{{ dmCoveragePct }}% have a named contact')
      if (lines[1]) setText(lines[1], '{{ dmMissing }} missing')
    }

    // The seniority mix: its note, then one row per title.
    const mix = findElement(view, (node) => node.tagName === 'section' && /Seniority Mix/.test(textOf(node)))
    if (mix) {
      const note = findElement(mix, (node) => node.tagName === 'p')
      if (note) setText(note, '{{ dmSeniorityNote }}')
      const list = findElement(mix, (node) => node.tagName === 'ul')
      const sample = childElements(list)[0]
      if (sample) {
        const row = cloneNode(sample)
        const parts = childElements(row)
        setText(parts[0], '{{ s.role }}')
        setText(parts[parts.length - 1], '{{ s.count }}')
        list.childNodes = [loop('{{ dmSeniority }}', 's', [row])]
      }
    }

    // The matched contacts: the line above the grid, then one card per person.
    const heading = findElement(view, (node) => node.tagName === 'h2' && textOf(node).trim() === 'Matched Contacts')
    if (heading) {
      const note = findElement(heading.parentNode, (node) => node.tagName === 'p')
      if (note) setText(note, '{{ dmShowingLabel }}')
      const showAll = findElement(view, (node) => node.tagName === 'button' && /^Show all \d+$/.test(textOf(node)))
      // The grid draws a page of named contacts; this control reveals the rest of them, so it runs
      // the page's own limit and is hidden once every contact is already on screen.
      if (showAll) {
        showAll.attrs = showAll.attrs.filter((attr) => attr.name !== 'data-demo')
        setAttr(showAll, 'sc-camel-on-click', '{{ showAllDmContacts }}')
        setText(showAll, '{{ dmShowAllLabel }}')
        showAll.parentNode.childNodes = (showAll.parentNode.childNodes ?? []).map((child) =>
          child === showAll ? when('{{ dmMoreContactsOn }}', [showAll]) : child,
        )
      }
    }

    // The funnel: the five stages, each with its own count, share and loss.
    const funnelHeading = findElement(view, (node) => node.tagName === 'h2' && textOf(node).trim() === 'Where Matches Drop Off')
    if (funnelHeading) {
      const card = findElement(view, (node) => node.tagName === 'section' && /Where Matches Drop Off/.test(textOf(node)))
      const list = card ? findElement(card, (node) => node.tagName === 'ul') : null
      const sample = list ? childElements(list)[0] : null
      if (list && sample) {
        const stage = cloneNode(sample)
        // A stage holds two spans pinned to its left — the dot and the rail — and then the row
        // itself, which is the one that carries the count, the label and the loss.
        const parts = childElements(stage)
        const row = parts.find((node) => /display:flex;flex-wrap:wrap;align-items:baseline/.test(getAttr(node, 'style') ?? ''))
        if (!row) throw new Error('a funnel stage carries no row')
        const cells = childElements(row)
        setText(cells[0], '{{ st.count }}')
        setText(cells[1], '{{ st.label }}')
        // The loss is the design's own trailing note; the first stage has none, so it is guarded.
        if (cells[2]) {
          setText(cells[2], '{{ st.loss }}')
          row.childNodes[row.childNodes.indexOf(cells[2])] = when('{{ st.loss }}', [cells[2]])
        }
        const bar = parts.find((node) => /height:7px/.test(getAttr(node, 'style') ?? ''))
        const fill = bar ? findElement(bar, (node) => /width:\d+%/.test(getAttr(node, 'style') ?? '')) : null
        if (fill) setAttr(fill, 'style', (getAttr(fill, 'style') ?? '').replace(/width:\d+%/, 'width:{{ st.width }}'))
        list.childNodes = [loop('{{ dmStages }}', 'st', [stage])]
      }
    }

    // The unmatched leads: the note above them, the filter, then one row per blocked lead.
    const awaiting = findElement(view, (node) => node.tagName === 'h2' && textOf(node).trim() === 'Awaiting a Match')
    if (awaiting) {
      const note = findElement(awaiting.parentNode, (node) => node.tagName === 'p')
      if (note) setText(note, '{{ dmBlockerNote }}')
      const filter = findElement(awaiting.parentNode.parentNode, (node) => node.tagName === 'select')
      if (filter) setAttr(filter, 'onchange', '{{ dmBlockerFilter }}')
    }
    const blockerList = findElement(view, (node) => getAttr(node, 'data-flist') === 'dm' && getAttr(node, 'data-fpart') === 'blockers')
    if (blockerList) {
      const samples = childElements(blockerList).filter((node) => getAttr(node, 'data-row') === '1')
      if (samples.length) {
        const row = cloneNode(samples[0])
        const cells = childElements(row)
        setText(cells[1], '{{ b.name }}')
        setAttr(cells[2], 'title', '{{ b.domain }}')
        setText(cells[2], '{{ b.domain }}')
        setText(cells[3], '{{ b.blocker }}')
        blockerList.childNodes = [loop('{{ dmBlockers }}', 'b', [row])]
      }
      // The footer under the blocker list counts the rows it is showing against the leads that have
      // no named contact — the design's own "Showing 6 of 117" was a fixed claim about neither.
      const footer = findElement(view, (node) => node.tagName === 'span' && /^Showing \d+ of \d+$/.test(textOf(node)))
      if (footer) {
        setText(footer, 'Showing {{ dmBlockersShowing }} of {{ dmMissing }}')
        // Its own "Show all": the list is drawn forty at a time, so this reveals the rest of them
        // rather than closing over a control that only looks like it does something.
        const more = footer.parentNode ? findElement(footer.parentNode, (node) => node.tagName === 'button') : null
        if (more) {
          more.attrs = more.attrs.filter((attr) => attr.name !== 'data-demo')
          setAttr(more, 'sc-camel-on-click', '{{ showAllDmBlockers }}')
          const label = findTextNodeValue(more, 'Show all')
          if (label) label.value = label.value.replace(/Show all[\s\d,]*/, '{{ dmBlockerShowAllLabel }} ')
          more.parentNode.childNodes = (more.parentNode.childNodes ?? []).map((child) =>
            child === more ? when('{{ dmBlockerMoreOn }}', [more]) : child,
          )
        }
      }
    }

    // The row count beside the filter chips. The pages that share this control count their own
    // rows; the Decision Makers page was the one left stating the designer's ten.
    const count = findElement(view, (node) => getAttr(node, 'data-fcount') === 'dm')
    if (count) setText(count, '{{ dmShowing }} rows on screen')

    const grid = findElement(view, (node) => getAttr(node, 'data-flist') === 'dm' && getAttr(node, 'data-fpart') === 'contacts')
    if (!grid) throw new Error('could not find the matched contacts grid')
    const samples = childElements(grid).filter((node) => getAttr(node, 'data-person') === '1')
    if (!samples.length) throw new Error('the matched contacts grid carries no sample card')

    const card = cloneNode(samples[0])
    const parts = childElements(card)
    const top = childElements(parts[0])
    setText(top[0], '{{ d.ini }}')
    // Two badge variants, the design's own: strong for a title that names a role, likely otherwise.
    const badge = top[1]
    const likely = cloneNode(badge)
    setAttr(likely, 'style', (getAttr(likely, 'style') ?? '').replace(/background:#[0-9A-Fa-f]{6}/, 'background:#C8D5BB').replace(/color:#[0-9A-Fa-f]{6}/, 'color:#1C1C1C'))
    setText(likely, '{{ d.likely }}')
    setText(badge, '{{ d.strong }}')
    parts[0].childNodes = [top[0], when('{{ d.isStrong }}', [badge]), when('{{ d.isLikely }}', [likely])]

    const who = childElements(parts[1])
    setText(who[0], '{{ d.name }}')
    setText(who[1], '{{ d.title }}')
    const where = childElements(parts[2])
    setText(where[0], '{{ d.lead }}')
    setText(where[1], '{{ d.domain }}')

    // The reference export calls this a button, but a matched contact already carries the
    // LinkedIn profile URL in `d.linkedinUrl`. Render it as a real external link so Electron's
    // window-open handler can hand it to the user's default browser. Cards without a profile URL
    // do not show an active control, which avoids a misleading toast or an empty tab.
    const profile = findElement(card, (node) =>
      node.tagName === 'button' && (getAttr(node, 'data-demo') === 'View profile' || /View profile/.test(textOf(node))),
    )
    if (profile) {
      profile.nodeName = 'a'
      profile.tagName = 'a'
      profile.attrs = profile.attrs.filter((attr) => attr.name !== 'type' && attr.name !== 'data-demo')
      setAttr(profile, 'href', '{{ d.linkedinUrl }}')
      setAttr(profile, 'target', '_blank')
      setAttr(profile, 'rel', 'noopener noreferrer')
      setAttr(profile, 'data-profile-link', '{{ d.linkedinUrl }}')
      setAttr(profile, 'role', 'button')
      setAttr(profile, 'style', `${getAttr(profile, 'style') ?? ''};text-decoration:none`)
      const profileAt = card.childNodes.indexOf(profile)
      if (profileAt >= 0) card.childNodes[profileAt] = when('{{ d.showProfile }}', [profile])
    }

    grid.childNodes = [loop('{{ dmRows }}', 'd', [card])]
  })
}

/**
 * Adds the suggestion card above "Awaiting a Match".
 *
 * A suggestion is a lead rather than a fact: a name read from an email address or a company page
 * still has to be confirmed by a person before it counts. The card is built from the elements the
 * reference already uses, so it sits in the page without inventing a new style.
 */
function bindSuggestionCard(view) {
  const awaiting = findElement(view, (node) => node.tagName === 'h2' && textOf(node) === 'Awaiting a Match')
  if (!awaiting) return
  const awaitingSection = findAll(view, (node) => childElements(node).includes(awaiting))[0]
  const host = awaitingSection ? findAll(view, (node) => childElements(node).includes(awaitingSection))[0] : null
  if (!host || !awaitingSection) return

  const buttonStyle = 'display:inline-flex;align-items:center;justify-content:center;gap:9px;height:40px;padding:0 18px;border:0;border-radius:999px;background:#E5E5E5;color:#1C1C1C;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer'
  const confirmStyle = 'flex:1;height:36px;border:0;border-radius:999px;background:#1C1C1C;color:#F0F0F0;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer'
  const dismissStyle = 'flex:1;height:36px;border:0;border-radius:999px;background:#EAEAE8;color:#4A4F4B;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer'

  const candidateCard = htmlElement('article', [
    { name: 'data-candidate', value: '{{ s.id }}' },
    { name: 'style', value: 'display:flex;flex-direction:column;gap:12px;padding:18px;border-radius:18px;background:#FFFFFF;border:1px dashed #C6C8C4' },
  ], [
    htmlElement('div', [{ name: 'style', value: 'display:flex;align-items:center;gap:10px' }], [
      htmlElement('span', [{ name: 'aria-hidden', value: 'true' }, { name: 'style', value: 'display:grid;place-items:center;width:36px;height:36px;border-radius:999px;background:#DDE3D6;font-size:12px;font-weight:700;flex:none' }], [textNode('{{ s.ini }}')]),
      htmlElement('span', [{ name: 'style', value: 'flex:1;min-width:0' }], [
        htmlElement('span', [{ name: 'style', value: 'display:block;font-size:14.5px;font-weight:500' }], [textNode('{{ s.name }}')]),
        htmlElement('span', [{ name: 'style', value: 'display:block;margin-top:2px;font-size:12px;color:#5A5F5C;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }], [textNode('{{ s.title }}')]),
      ]),
    ]),
    htmlElement('div', [{ name: 'style', value: 'font-size:12.5px;color:#4A4F4B' }], [textNode('{{ s.lead }}')]),
    htmlElement('div', [{ name: 'style', value: 'font-size:12px;color:#5A5F5C;font-style:italic' }], [textNode('{{ s.evidence }}')]),
    htmlElement('div', [{ name: 'style', value: 'display:flex;gap:8px;margin-top:auto;padding-top:10px;border-top:1px solid #E4E5E2' }], [
      htmlElement('button', [
        { name: 'type', value: 'button' },
        { name: 'data-confirm', value: '{{ s.id }}' },
        { name: 'sc-camel-on-click', value: '{{ s.confirm }}' },
        { name: 'style', value: confirmStyle },
      ], [textNode('Confirm')]),
      htmlElement('button', [
        { name: 'type', value: 'button' },
        { name: 'data-dismiss', value: '{{ s.id }}' },
        { name: 'sc-camel-on-click', value: '{{ s.dismiss }}' },
        { name: 'style', value: dismissStyle },
      ], [textNode('Dismiss')]),
    ]),
  ])

  const card = htmlElement('section', [
    { name: 'data-card', value: '1' },
    { name: 'data-suggestions', value: '1' },
    { name: 'style', value: 'padding:22px 24px;border-radius:22px;background:#F5F5F4;transition:transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear' },
  ], [
    htmlElement('div', [{ name: 'style', value: 'display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px' }], [
      htmlElement('div', [], [
        htmlElement('div', [{ name: 'style', value: 'font-size:10.5px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:#555956' }], [textNode('Needs confirming')]),
        htmlElement('h2', [{ name: 'style', value: 'margin:10px 0 0;font-size:19px;font-weight:500;letter-spacing:-.01em' }], [textNode('Suggested Contacts')]),
        htmlElement('p', [{ name: 'style', value: 'margin:4px 0 0;font-size:13.5px;color:#5A5F5C' }], [textNode('{{ dmSuggestionNote }}')]),
      ]),
      htmlElement('button', [
        { name: 'type', value: 'button' },
        { name: 'data-ghost', value: '1' },
        { name: 'data-suggestbuild', value: '1' },
        { name: 'sc-camel-on-click', value: '{{ buildSuggestions }}' },
        { name: 'style', value: buttonStyle },
      ], [textNode('Look for suggestions')]),
    ]),
    when('{{ dmSuggestionEmpty }}', [
      htmlElement('div', [{ name: 'style', value: 'margin-top:16px;padding:18px;border:1px dashed #C6C8C4;border-radius:16px;font-size:13.5px;color:#5A5F5C' }], [
        textNode('{{ dmSuggestionHint }}'),
      ]),
    ]),
    htmlElement('div', [{ name: 'style', value: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,252px),1fr));gap:12px;margin-top:16px' }], [
      loop('{{ dmSuggestions }}', 's', [candidateCard]),
    ]),
  ])

  const index = host.childNodes.indexOf(awaitingSection)
  host.childNodes.splice(index < 0 ? host.childNodes.length : index, 0, card)
}

// ---------------------------------------------------------------- website lookup binding
//
// The page has two states: before an import it invites one, and after it reports what the
// importer did. The reference's "28 lines - 3 duplicates skipped" and its example card are
// statements about data the app now holds.

function websiteView(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isWebsite }}')
  if (!view) throw new Error('could not find the Website Lookup view in the reference markup')
  return view
}

function bindWebsitePage(root) {
  tryBind('bindWebsitePage', () => {
    const view = websiteView(root)

    // The chip at the top of the page: what the last import did, or that there has not been one.
    const chip = findElement(view, (node) => node.tagName === 'span' && /^(Nothing imported yet|\d+ imports on file)$/.test(textOf(node)))
    if (chip) setText(chip, '{{ importStatus }}')

    // The line beside the paste box: the last batch's own count, not a figure the design chose.
    const pasteLine = findElement(view, (node) => node.tagName === 'span' && /^\d+ lines · \d+ duplicates skipped$/.test(textOf(node)))
    if (pasteLine) setText(pasteLine, '{{ importSummary }}')

    // The three skeleton rows are what the design draws before anything is imported; each is a
    // placeholder for a site, so the list becomes one row template over the imported leads.
    const heading = findElement(view, (node) => node.tagName === 'h2' && textOf(node).trim() === 'Results preview')
    if (!heading) throw new Error('could not find the Results preview card')
    const card = findElement(view, (node) => node.tagName === 'section' && /Results preview/.test(textOf(node)))
    if (!card) throw new Error('could not find the Results preview section')
    const list = findElement(card, (node) => node.tagName === 'ul' && findElement(node, (child) => /grid-template-columns:minmax\(0,1\.4fr\)/.test(getAttr(child, 'style') ?? '')))
    if (!list) throw new Error('could not find the results preview list')

    // The two figures beside the heading: how many sites are on file, and what each one carries.
    const figures = findElements(
      heading.parentNode.parentNode,
      (node) => /font-size:26px/.test(getAttr(node, 'style') ?? '') && !childElements(node).length,
    )
    if (figures[0]) setText(figures[0], '{{ importAdded }}')
    const tally = findElement(heading.parentNode.parentNode, (node) => node.tagName === 'span' && /with email/.test(textOf(node)))
    if (tally) setText(tally, '{{ importTally }}')

    const samples = childElements(list)
    if (!samples.length) throw new Error('the results preview carries no sample row')
    const row = cloneNode(samples[0])
    const cells = childElements(row)
    const bind = (cell, binding, colour) => {
      const span = htmlElement(
        'span',
        [{ name: 'style', value: `display:block;font-size:13.5px;color:${colour};white-space:nowrap;overflow:hidden;text-overflow:ellipsis` }],
        [textNode(binding)],
      )
      cell.childNodes = [span]
    }
    bind(cells[0], '{{ r.domain }}', '#1C1C1C')
    bind(cells[1], '{{ r.detail }}', '#1C1C1C')
    bind(cells[2], '{{ r.contact }}', '#4A4F4B')
    cells[3].childNodes = [
      htmlElement(
        'span',
        [{ name: 'style', value: 'display:block;padding:5px 10px;border-radius:999px;background:#C8D5BB;color:#1C1C1C;font-size:11.5px;text-align:center;white-space:nowrap' }],
        [textNode('{{ r.status }}')],
      ),
    ]
    list.childNodes = [loop('{{ importRows }}', 'r', [row])]

    // The empty state stays for a workspace that has imported nothing: it is what says where the
    // rows come from, and it is the design's own wording. It goes once there are rows to show.
    const empty = findElement(card, (node) => node.tagName === 'p' && /No websites imported yet/.test(textOf(node)))
    if (empty) {
      setText(empty, '{{ importEmpty }}')
      const block = empty.parentNode
      const at = card.childNodes.indexOf(block)
      if (at >= 0) card.childNodes[at] = when('{{ importEmptyOn }}', [block])
    }

    // The Contact Coverage rings are bound with the rest of the dashboard, which is where the card
    // lives: see bindDashboardPage.
  })
}

/** Binds the import modal: its textarea is the input, its button commits the list. */
/**
 * Marks the shared import modal's own run button.
 *
 * The updated design has one modal with a paste box, a button whose label states what it will do
 * and a Cancel, and the button is the modal's only `data-run` element. The modal itself is marked
 * by `bindSharedImportModal`; this adds the marker a check uses to press it.
 */
function bindImportModal(root) {
  tryBind('bindImportModal', () => {
    const box = findElement(root, (node) => getAttr(node, 'data-imptext') === '1')
    if (!box) throw new Error('could not find the import modal')
    let modal = box
    while (modal && !/position:fixed/.test(getAttr(modal, 'style') ?? '')) modal = modal.parentNode
    const start = modal ? findElement(modal, (node) => getAttr(node, 'data-run') === '1') : null
    if (!start) throw new Error('could not find the Start lookup button in the import modal')
    setAttr(start, 'data-importgo', '1')
  })
}

// ---------------------------------------------------------------- maps results binding
//
// The Maps page draws its results table from five hand-written rows. Those become a template over
// the same cells, so a run fills the table the reference already designed.

function mapsView(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isMaps }}')
  if (!view) throw new Error('could not find the Google Maps view in the reference markup')
  return view
}

/**
 * The run-behaviour controls: showing the browser window, the pace between places, and splitting a
 * city into districts.
 *
 * These are additions rather than reference markup, so the only transformation they need is the
 * one the generator already applies — `{{ }}` in text or an attribute becomes a binding. The
 * function exists so that transform is asserted to have happened: if the markup block is ever
 * renamed, the build fails here instead of rendering controls that quietly do nothing.
 */
function bindMapsRunControls(view) {
  const block = findElement(view, (node) => getAttr(node, 'data-runspeed') === '1')
  if (!block) throw new Error('could not find the run-behaviour block on the Google Maps page')
  for (const handler of ['toggleVisible', 'paceFast', 'paceSlow', 'splitByDistrict', 'clearDistricts', 'pickBrowser', 'clearBrowser', 'signInGoogle', 'toggleGoogleProfile']) {
    const bound = findElement(block, (node) => getAttr(node, 'sc-camel-on-click') === `{{ ${handler} }}`)
    if (!bound) throw new Error(`the run-behaviour block is missing its ${handler} control`)
  }
  for (const binding of ['runVisible', 'paceLabel', 'splitNote', 'splitNoteOn', 'districtsOn', 'browserLabel', 'browserChosen', 'googleProfileOn', 'googleNote']) {
    const hasText = Boolean(
      findElement(block, (node) =>
        (node.childNodes ?? []).some((kid) => typeof kid.value === 'string' && kid.value.includes(`{{ ${binding} }}`)),
      ),
    )
    // `attrs` is an array of { name, value }, so the values are read rather than looked up.
    const hasAttr = Boolean(
      findElement(block, (node) => (node.attrs ?? []).some((attr) => attr.value === `{{ ${binding} }}`)),
    )
    if (!hasText && !hasAttr) throw new Error(`the run-behaviour block is missing its ${binding} binding`)
  }
}

/**
 * The Google Maps page.
 *
 * Like the Social Profiles page, the updated design writes its own Run Behaviour controls, run
 * button and results table, and binds them itself. This adds the markers the automated checks find
 * the page by and takes out the sample result rows the document ships as placeholders.
 */
/**
 * The two dropdowns on Run Behaviour: the delay between places, and the browser program.
 *
 * The design draws both as a `<select>` whose options are decorations — nothing is selected and
 * nothing is reported — so neither one can be worked. They become real pickers here: the chosen
 * option is the one the settings hold, and a change is reported to the app, which is what makes
 * "Delay between places" mean the delay between places.
 *
 * The options are written out rather than looped because an `<sc-for>` inside a `<select>` is
 * dropped in parsing — only option and optgroup may sit there.
 */
function bindRunBehaviour(root) {
  const select = (label) => {
    // The design writes a real `<select>` as `sc-raw-select`, because the tool's own `select` is a
    // component it replaces. Both spellings end up as the same element in the app.
    const found = findElement(
      root,
      (node) => (node.tagName === 'select' || node.tagName === 'sc-raw-select') && getAttr(node, 'aria-label') === label,
    )
    if (!found) throw new Error(`could not find the ${label} picker`)
    return found
  }

  const pace = select('Delay between places')
  pace.childNodes = [
    '1.5 s · quick',
    '3 s · steady',
    '6 s · careful',
    '10 s · very gentle',
  ].map((label) => htmlElement('option', [], [textNode(label)]))
  setAttr(pace, 'defaultvalue', '{{ paceLabel }}')
  setAttr(pace, 'onchange', '{{ onPaceChoice }}')

  const browser = select('Browser program')
  browser.childNodes = [
    'Bundled Chromium',
    'Google Chrome (x86)',
    'Google Chrome',
    'Microsoft Edge',
    'Brave',
  ].map((label) => htmlElement('option', [], [textNode(label)]))
  setAttr(browser, 'defaultvalue', '{{ browserLabel }}')
  setAttr(browser, 'onchange', '{{ onBrowserChoice }}')
}

function bindMapsResults(root) {
  const view = findElement(root, (node) => node.tagName === 'sc-if' && getAttr(node, 'value') === '{{ isMaps }}')
  if (!view) throw new Error('could not find the Google Maps view')

  const mark = (predicate, attribute, value = '1') => {
    const found = findElement(root, predicate)
    if (found) setAttr(found, attribute, value)
    return found
  }
  const set = (predicate, attribute, value) => {
    const found = findElement(root, predicate)
    if (found) setAttr(found, attribute, value)
  }
  set((node) => node.tagName === 'input' && getAttr(node, 'data-kwinput') === '1', 'data-kwinput', '1')
  // The design labels this input with visible text rather than aria-label. If we only look for an
  // aria attribute the field is never marked, runScrape reads an empty value, and its safety
  // fallback makes every search look like Manchester. Keep the aria path for future exports, then
  // fall back to the input inside the visible Location label used by the current design.
  const locationByAria = findElement(root, (node) => node.tagName === 'input' && /Location/i.test(getAttr(node, 'aria-label') ?? ''))
  const locationLabel = findElement(
    view,
    (node) =>
      node.tagName === 'label' &&
      Boolean(findElement(node, (child) => child.tagName === 'span' && /^Location$/i.test(textOf(child)))),
  )
  const location = locationByAria ?? (locationLabel ? findElement(locationLabel, (node) => node.tagName === 'input') : null)
  if (location) setAttr(location, 'data-location', '1')
  mark((node) => node.tagName === 'button' && getAttr(node, 'data-runbtn') === '1', 'data-runbtn')
  mark((node) => node.tagName === 'button' && /^History/.test(textOf(node)), 'data-maphistopen')
  mark((node) => getAttr(node, 'data-results') === '1', 'data-results')

  // The caption follows the request that produced the pins. It must not keep saying Manchester
  // after a Lahore (or any other) run.
  const caption = findElement(view, (node) => node.tagName === 'p' && /Manchester · 12 km radius/.test(textOf(node)))
  if (caption) setText(caption, '{{ mapsAreas }} · {{ mapsRadius }}. Pins land as each place is captured.')
  const runningTitle = findElement(view, (node) => node.tagName === 'h2' && textOf(node).trim() === 'Scanning Manchester')
  if (runningTitle) setText(runningTitle, 'Scanning {{ runLocation }}')
  const source = findElement(view, (node) => node.tagName === 'span' && /Source: Google Maps · Manchester/.test(textOf(node)))
  if (source) setText(source, 'Source: Google Maps · {{ runLocation }}')

  // The summary strip: progress, phones, websites and emails.
  //
  // The design draws four tiles, each a large figure over a total, a badge and a four-segment
  // strip; every figure is a claim about the run, so all of them are read from it. The tiles are
  // told apart by document order, which is how the design arranges them.
  const tiles = findElements(view, (node) => /clamp\(40px,/.test(getAttr(node, 'style') ?? '') && !childElements(node).length)
  if (tiles.length !== 4) throw new Error(`expected four maps summary tiles, found ${tiles.length}`)
  const tileFigures = ['mapsProgress', 'mapsWithPhone', 'mapsWithWebsite', 'mapsWithEmail']
  const tileBadges = ['mapsProgressBadge', 'mapsPhonePct', 'mapsWebsitePct', 'mapsEmailPct']
  const tileBars = ['mapsProgressBars', 'mapsPhoneBars', 'mapsWebsiteBars', 'mapsEmailBars']
  tiles.forEach((tile, index) => {
    const head = childElements(tile.parentNode)
    setText(tile, `{{ ${tileFigures[index]} }}`)
    if (head[1]) setText(head[1], index === 0 ? '/{{ mapsProgressTotal }}' : '/{{ mapsTotal }}')
    if (head[2]) setText(head[2], `{{ ${tileBadges[index]} }}`)

    // The strip under the label: the design's four segments become a loop, each keeping its own
    // shape and taking its fill from the share it stands for.
    const stack = tile.parentNode?.parentNode
    const strip = stack ? findElement(stack, (node) => /display:flex;gap:4px/.test(getAttr(node, 'style') ?? '')) : null
    if (!strip) throw new Error(`the maps summary tile ${index + 1} carries no strip`)
    const segment = cloneNode(childElements(strip)[0])
    setAttr(segment, 'style', '{{ b.style }}')
    strip.childNodes = [loop(`{{ ${tileBars[index]} }}`, 'b', [segment])]
  })

  // The Live Activity panel. The design hand-writes six entries with its own timestamps and its own
  // businesses; the run log is real, so one entry becomes the template and the panel is drawn from
  // the log — a scrape in flight, the enrichment passes, and the recent Maps runs.
  const activity = findElement(view, (node) => node.tagName === 'section' && /Live Activity/.test(textOf(node)))
  if (activity) {
    const log = findElement(activity, (node) => node.tagName === 'ul' && findElement(node, (child) => /border-bottom:1px solid #2E302F/.test(getAttr(child, 'style') ?? '')))
    if (log) {
      const samples = childElements(log).filter((node) => /border-bottom:1px solid #2E302F/.test(getAttr(node, 'style') ?? ''))
      if (!samples.length) throw new Error('the Live Activity panel carries no entry')
      const entry = cloneNode(samples[0])
      const rows = childElements(entry)
      const head = childElements(rows[0])
      setText(head[0], '{{ a.when }}')
      setText(head[1], '{{ a.level }}')
      setText(rows[1], '{{ a.title }}')
      if (rows[2]) setText(rows[2], '{{ a.detail }}')

      // The level pill keeps the design's three tones: a warning, a finished pass, and the muted
      // one an informational line reads as.
      const warn = cloneNode(head[1])
      setAttr(warn, 'style', 'padding:3px 9px;border-radius:7px;background:#8C4A3F;color:#F7EDEA;font-size:10px;font-weight:700;letter-spacing:.08em')
      const live = cloneNode(head[1])
      setAttr(live, 'style', 'padding:3px 9px;border-radius:7px;background:#C8D5BB;color:#1C1C1C;font-size:10px;font-weight:700;letter-spacing:.08em')
      setText(live, 'LIVE')
      const info = cloneNode(head[1])
      setAttr(info, 'style', 'padding:3px 9px;border-radius:7px;background:#2E302F;color:#B9BEB7;font-size:10px;font-weight:700;letter-spacing:.08em')
      setText(info, 'INFO')
      setText(head[1], 'OK')
      rows[0].childNodes = [
        head[0],
        when('{{ a.isWarn }}', [warn]),
        when('{{ a.isLive }}', [live]),
        when('{{ a.isInfo }}', [info]),
        when('{{ a.isOk }}', [head[1]]),
      ]

      const stateRow = htmlElement(
        'li',
        [{ name: 'style', value: 'padding:12px 0;border-bottom:1px solid #2E302F;font-size:12.5px;color:#9BA29C' }],
        [textNode('{{ mapsActivityEmpty }}')],
      )
      log.childNodes = [when('{{ mapsActivityEmpty }}', [stateRow]), loop('{{ mapsActivity }}', 'a', [entry])]
    }
  }

  // The results card: what this run captured, and the places themselves.
  const subtitle = findElement(view, (node) => node.tagName === 'p' && /businesses captured this run/.test(textOf(node)))
  if (subtitle) setText(subtitle, '{{ mapsCaptured }}')

  // The filter beside the Export button narrows the table by hand.
  const filter = findElement(view, (node) => node.tagName === 'input' && getAttr(node, 'aria-label') === 'Filter leads')
  if (filter) {
    setAttr(filter, 'data-mapsfilter', '1')
    setAttr(filter, 'value', '{{ mapsQueryText }}')
    setAttr(filter, 'oninput', '{{ onMapsInput }}')
  }

  // The table. The design hand-writes five sample places; the rows come from the run instead, so
  // one of them becomes the template and the rest go. Eight columns, in the design's own order:
  // the badge, the business, its phone and email, the address, the rating, the socials, the score
  // and the decision.
  const list = findElement(view, (node) => node.tagName === 'ul' && findElement(node, (child) => getAttr(child, 'data-rowgrid') === '1'))
  if (!list) throw new Error('could not find the maps results table')
  const samples = childElements(list).filter((node) => getAttr(node, 'data-rowgrid') === '1')
  if (!samples.length) throw new Error('the maps results table carries no sample row')

  const row = cloneNode(samples[0])
  const cells = childElements(row)
  if (cells.length < 8) throw new Error('the maps results row is not shaped as expected')
  setText(cells[0], '{{ mr.ini }}')

  const business = childElements(cells[1])
  setText(business[0], '{{ mr.name }}')
  setText(business[1], '{{ mr.domain }}')
  setAttr(business[1], 'title', '{{ mr.domain }}')
  if (business[2]) setText(business[2], '{{ mr.address }}')

  const contact = childElements(cells[2])
  setText(contact[0], '{{ mr.phone }}')
  if (contact[1]) {
    // The address the site published, with the design's own extras chip left out: how many other
    // addresses were found is stated on the Email Finder page rather than guessed at here.
    setAttr(contact[1], 'title', '{{ mr.email }}')
    setText(contact[1], '{{ mr.email }}')
  }

  const address = childElements(cells[3])
  void address
  cells[3].childNodes = [textNode('{{ mr.addressLine1 }}'), htmlElement('br', [], []), textNode('{{ mr.addressLine2 }}')]
  cells[4].childNodes = [
    textNode('{{ mr.rating }}'),
    htmlElement('br', [], []),
    htmlElement('span', [{ name: 'style', value: 'color:#5A5F5C' }], [textNode('{{ mr.reviews }}')]),
  ]

  // The socials cell shows one chip per profile; a lead with none says so in the design's own word.
  const socIcon = findElement(cells[5], (node) => node.tagName === 'span')
  if (!socIcon) throw new Error('the maps results row carries no socials chip')
  const icon = cloneNode(socIcon)
  setText(icon, '{{ sn.short }}')
  cells[5].childNodes = [when('{{ mr.noSocials }}', [textNode('none')]), loop('{{ mr.socials }}', 'sn', [icon])]

  setText(cells[6], '{{ mr.score }}')
  setAttr(cells[6], 'style', 'padding:5px 10px;border-radius:999px;background:{{ mr.scoreBg }};color:{{ mr.scoreColor }};font-weight:500;font-size:11.5px;min-width:46px;text-align:center')
  setText(cells[7], '{{ mr.decision }}')
  setAttr(cells[7], 'style', 'padding:5px 10px;border-radius:999px;background:{{ mr.decisionBg }};color:{{ mr.decisionColor }};font-size:11.5px;min-width:78px;text-align:center')

  // A workspace that has captured nothing, or a filter that matches nothing, says so in the
  // table's own first row rather than under a heading that claims eighteen places.
  const stateRow = htmlElement(
    'li',
    [{ name: 'style', value: 'padding:26px 0;border-top:1px solid #E4E5E2;color:#5A5F5C;font-size:13.5px' }],
    [textNode('{{ mapsState }}')],
  )
  list.childNodes = [when('{{ mapsState }}', [stateRow]), loop('{{ mapsRows }}', 'mr', [row])]

  // The footer: how many places of the run's own total the table is showing.
  const footer = findElement(view, (node) => node.tagName === 'span' && /^Showing \d+ of \d+ results$/.test(textOf(node)))
  if (footer) {
    setText(footer, 'Showing {{ mapsShowing }} of {{ mapsTotal }} results')
    const more = footer.parentNode ? findElement(footer.parentNode, (node) => node.tagName === 'button') : null
    if (more) {
      more.attrs = more.attrs.filter((attr) => attr.name !== 'data-demo')
      setAttr(more, 'sc-camel-on-click', '{{ showMoreMaps }}')
      const label = findTextNodeValue(more, 'Show all')
      if (label) label.value = label.value.replace(/Show all[\s\d,]*/, '{{ mapsMoreLabel }} ')
      more.parentNode.childNodes = (more.parentNode.childNodes ?? []).map((child) =>
        child === more ? when('{{ mapsMoreOn }}', [more]) : child,
      )
    }
  }
  void set
}

/**
 * Both plots' pins.
 *
 * The map is a schematic drawn by the reference, but its pins named its own sample businesses —
 * Deansgate Physio, Salford Quays and so on — which stayed on screen whatever the run searched
 * for. There are two plots: the running panel's, and the Coverage Map card's. Each one's pins
 * become a loop over the captured leads, so both name the businesses the run actually found and
 * both fade in as the places land.
 *
 * The running panel is the one exception to the reference's fixed `data-on="y"`: its pins are
 * meant to appear one at a time, so its flags stay bound to `p1`…`p8` and the map's are always on.
 */
function bindMapsPins(root) {
  const body = findBody(root) ?? root
  const view = mapsView(body)

  // A plot is the element that holds a sweep highlight and the pins; the pins are the sweep's
  // siblings, so the plot is the sweep's parent. Both plots are structurally identical and are
  // told apart by document order: the Coverage Map's follows the Coverage Map heading.
  const plots = []
  let headingSeen = false
  const walk = (node) => {
    if (node.tagName === 'h2' && textOf(node) === 'Coverage Map') headingSeen = true
    if (getAttr(node, 'data-sweep') === '1') {
      const parent = node.parentNode
      if (parent && getAttr(parent, 'data-pin') !== '1' && childElements(parent).some((kid) => getAttr(kid, 'data-pin') === '1')) {
        plots.push({ plot: parent, coverage: headingSeen })
      }
    }
    for (const child of childElements(node)) walk(child)
  }
  walk(view)

  for (const { plot, coverage } of plots) {
    const sample = childElements(plot).filter((kid) => getAttr(kid, 'data-pin') === '1')
    if (!sample.length) continue
    // The reference varies each pin's pill colour. `mapsPins` carries those values so the map keeps
    // the reference's alternation; the binding transform only understands `V.x` and `pin.x`, so an
    // expression such as `i % 4` would be rewritten and break.
    const positioned = (getAttr(sample[0], 'style') ?? '')
      .replace(/left:[^;]+/, 'left:{{ pin.x }}')
      .replace(/top:[^;]+/, 'top:{{ pin.y }}')
      .replace(/background:[^;]+/, 'background:{{ pin.color }}')
    plot.childNodes = [
      loop('{{ mapsPins }}', 'pin', [
        htmlElement('span', [
          // `data-pin` marks the element; `data-on` is what the stylesheet fades in. The reference
          // put the on/off value in `data-pin` and relied on a fixed `data-on="y"`, so binding both
          // from the loop is what makes the pins actually paint. The running panel reveals its pins
          // one at a time as places land; the map shows every pin it has.
          { name: 'data-pin', value: '1' },
          { name: 'data-on', value: coverage ? '{{ pin.on }}' : '{{ pin.reveal }}' },
          { name: 'data-name', value: '{{ pin.name }}' },
          { name: 'title', value: '{{ pin.name }}' },
          { name: 'style', value: positioned },
        ], [
          htmlElement('span', [
            { name: 'style', value: 'display:grid;place-items:center;width:20px;height:20px;border-radius:999px;background:#1C1C1C;color:#F0F0F0;font-size:8.5px;font-weight:700' },
          ], [textNode('{{ pin.ini }}')]),
          textNode('{{ pin.name }}'),
        ]),
      ]),
    ]
  }
}

function findBody(node) {
  if (node.tagName === 'body') return node
  for (const child of node.childNodes ?? []) {
    const found = findBody(child)
    if (found) return found
  }
  return null
}

const document_ = parse(html)
// Every binder that walks up from an element to the card holding it needs the tree linked first.
linkParents(document_)
// Read the sample rows before they are replaced by bindings: with no database behind the
// page still renders exactly what the reference showed.
const socialDemo = extractSocialDemo(document_)
bindSocialPage(document_)
tryBind('bindSharedImportModal', () => bindSharedImportModal(document_))
tryBind('bindScanPanel', () => bindScanPanel(document_))
tryBind('bindDeepKeyRow', () => bindDeepKeyRow(document_))
tryBind('bindDeepButtons', () => bindDeepButtons(document_))
tryBind('bindFinderPages', () => bindFinderPages(document_))
const emailDemo = extractEmailDemo(document_)
bindEmailPage(document_)
bindLeadsPage(document_)
bindListsPage(document_)
bindRunsPage(document_)
bindDashboardPage(document_)
bindBillingPage(document_)
bindPhonePage(document_)
bindDecisionMakersPage(document_)
bindWebsitePage(document_)
bindMapsResults(document_)
bindMapsPins(document_)
tryBind('bindRunBehaviour', () => bindRunBehaviour(document_))
bindImportModal(document_)
bindShell(document_)
bindExportModal(document_)
const body = findBody(document_)
if (!body) throw new Error('could not locate <body> in the reference markup')
const tree = emit(body, 3)

const names = [...referenced].sort()
const header = `// GENERATED FILE · do not edit by hand.
// Source: .reference/markup.html (the Leads Scraper document bundled by the reference app).
// Regenerate with: node scripts/build-reference-ui.mjs
//
// Every {{ value }} binding resolves against the object returned by useAppValues(), so a
// missing or renamed binding fails the TypeScript build instead of silently rendering wrong.
import { Fragment, type ReactElement } from 'react'
import type { AppValues } from './useAppValues'

/**
 * Whether a section the document guards with a binding is on screen.
 *
 * The document writes a false flag as the string '0' as often as it writes the boolean, and '0' is
 * truthy: without this, every section guarded that way would render at once. A missing or empty
 * binding counts as false too, so an unset value hides its section rather than showing it empty.
 */
function shows(value: unknown): boolean {
  return value !== false && value !== '0' && value !== '' && value != null
}

export function ReferenceApp({ V }: { V: AppValues }): ReactElement {
  // The recent-search callbacks: a chip names its own term, so they are held in a map beside the
  // values instead of the values carrying one action per search that was ever made.
  const socialPicks = V.socialPicks
  return (
    <>
${tree}    </>
  )
}
`

mkdirSync(dirname(OUT), { recursive: true })
generate(OUT, applyReferenceUiOverrides(header))

console.log(`wrote ${OUT}`)
console.log(`bindings referenced: ${names.length}`)

// The dark theme works by remapping every hard-coded colour in inline styles. Lift the
// mapping tables out of the reference logic verbatim so the port cannot drift from them.
const doc = readFileSync('.reference/app-doc.js', 'utf8')
const mapNames = ['SURF', 'SURF_T', 'INK', 'SURF_RGB', 'SURF_T_RGB', 'INK_RGB']
const tables = []
for (const name of mapNames) {
  const match = doc.match(new RegExp(`static ${name} = (\\{[^\\n]*?\\});`))
  if (!match) throw new Error(`could not find ${name} in .reference/app-doc.js`)
  tables.push(`export const ${name}: Record<string, string> = ${match[1]}`)
}
const themeOut = `// GENERATED FILE · do not edit by hand.
// Source: .reference/app-doc.js. Regenerate with: node scripts/build-reference-ui.mjs
//
// The reference app has no CSS variables: it keeps every colour inline and, in dark mode,
// rewrites those colours with the tables below. Porting the tables verbatim keeps the port
// pixel-identical to the reference.

${tables.join('\n\n')}
`
generate('src/app/themeMaps.ts', themeOut)
console.log(`wrote src/app/themeMaps.ts (${mapNames.length} tables)`)

// The demo dataset and copy live in the reference logic. Lift the literal block verbatim
// and add the minimal typing needed for strict mode.
const dataEnd = doc.indexOf('\nclass Component')
if (dataEnd < 0) throw new Error('could not find the reference data boundary')
const dataBlock = doc.slice(0, dataEnd).trimEnd()
const typeHeader = `// GENERATED FILE · do not edit by hand.
// Source: .reference/app-doc.js. Regenerate with: node scripts/build-reference-ui.mjs
//
// Demo copy and sample rows, exactly as the reference app declares them. A real run replaces
// the sample rows with captured leads; the layout and copy around them stay identical.

export type LeadRow = [string, string, string, string, string, number, number, number, number, string]
export interface ExportScope { label: string; n: number; file: string }
export interface ExportMode { title: string; note: string; scopes: ExportScope[]; cols: [string, boolean][] }

`
const typed = dataBlock
  .replace(/^const /gm, 'export const ')
  .replace('export const LEAD_FILTERS =', 'export const LEAD_FILTERS: [string, string][] =')
  .replace('export const RUN_FILTERS =', 'export const RUN_FILTERS: [string, string][] =')
  .replace('export const DELIMS =', 'export const DELIMS: [string, string][] =')
  .replace('export const VIEW_NAMES =', 'export const VIEW_NAMES: Record<string, string> =')
  .replace("settings: 'Billing & Account'", "settings: 'Workspace & Settings'")
  .replace("  'Find phones for missing': 'Phone lookup queued for 27 leads.',\n", '')
  .replace(/^  '(?:Buy extra credits|Change plan|Upgrade to Studio|Compare plans|Billing portal|Add card|PDF|Download all|Revoke|Invite member|Seat history|Cancel subscription|Edit profile|Nafran)':.*\n/gm, '')
  .replace('export const DEMO_NOTES =', 'export const DEMO_NOTES: Record<string, string> =')
  .replace('export const CHAT_CHIPS =', 'export const CHAT_CHIPS: string[] =')
  .replace('export const PICKS =', 'export const PICKS: LeadRow[] =')
  .replace('export const LIST_TARGETS =', 'export const LIST_TARGETS: [string, number][] =')
  .replace('export const EXP_MODES =', 'export const EXP_MODES: Record<string, ExportMode> =')
  .replace('export const LABELS =', 'export const LABELS: Record<string, string> =')
generate('src/app/referenceData.ts', `${typeHeader}${typed}\n`)
console.log('wrote src/app/referenceData.ts')

// The design system is plain CSS with no build step in the reference, so it carries over
// verbatim. Only the font URLs change: the bundler's opaque uuid filenames become the
// Satoshi files shipped in src/assets/fonts.
const FONT_FILES = {
  'b367f795-2122-4db1-8a83-f0ab05c8b97f': 'satoshi-300.woff2',
  'eee769ef-cc54-456b-9663-baba6ddd1a29': 'satoshi-300.woff',
  '86cd4f41-7171-4777-b926-ae040d624ee4': 'satoshi-300.ttf',
  '212b710c-95be-41d3-a883-0b9cae6be6a8': 'satoshi-400.woff2',
  '038f7919-56fd-4dd1-aeba-e219814a8657': 'satoshi-400.woff',
  '486049b4-c101-423e-bfdc-dbc0f58a8b6f': 'satoshi-400.ttf',
  '26aac758-0a1f-4571-9ea9-ab0c3d9de5f3': 'satoshi-500.woff2',
  '09a41ff2-efe9-4c35-8abc-5fa35e0bc573': 'satoshi-500.woff',
  'e934992f-7385-445a-9147-f0df09f879e6': 'satoshi-500.ttf',
  'da53819b-e0f8-4144-9818-7ef488986f89': 'satoshi-700.woff2',
  '3de81ada-6c1f-422d-933d-69dfbac3757d': 'satoshi-700.woff',
  '4d9ec27f-88e0-4f07-b531-4674e856a62b': 'satoshi-700.ttf',
  '4431833d-d2ab-43f7-8fc2-04ea8c957399': 'satoshi-900.woff2',
  'c1882a0b-d2db-400b-8d78-1f3f4413308f': 'satoshi-900.woff',
  'db38aeed-9f12-40bd-b82b-02c604f98b2e': 'satoshi-900.ttf',
}
let css = readFileSync('.reference/styles.css', 'utf8')
css = css.replace(/<\/?style>/g, '')
for (const [uuid, file] of Object.entries(FONT_FILES)) {
  css = css.split(uuid).join(`./assets/fonts/${file}`)
}
// Additions this app makes to the reference's design system, kept apart from it so a re-read of
// `.reference/styles.css` cannot drop them. The district note fades in only once a split is
// active, which is the same treatment the pin and sweep layers get.
css = `${css.trim()}

/* App additions: not part of the reference design system. */
[data-splitnote]{opacity:0;transition:opacity .4s linear}
[data-splitnote][data-on="y"]{opacity:1}
/* The chosen browser is always readable; "Use bundled" only matters once one has been chosen. */
[data-clearbrowser]{opacity:0;pointer-events:none;transition:opacity .4s linear}
[data-clearbrowser][data-on="y"]{opacity:1;pointer-events:auto}
`
generate('src/styles.css', `/* GENERATED FILE · do not edit by hand.\n * Source: .reference/styles.css. Regenerate with: node scripts/build-reference-ui.mjs\n *\n * The reference design system, unchanged apart from the font URLs.\n */\n${css.trim()}\n`)
console.log('wrote src/styles.css')

const demoModule = `// GENERATED FILE · do not edit by hand.
// Source: the sample rows on the Social Profiles page of .reference/markup.html.
// Regenerate with: node scripts/build-reference-ui.mjs
//
// Offline demo mode uses these rows so the page renders exactly what the reference showed when
// there is no database behind the window. With one present the page reads real rows instead.

export type DemoPlatform = 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'youtube' | 'x' | 'other'

export interface DemoSocialProfile { platform: DemoPlatform; label: string; short: string }
export interface DemoSocialRow { index: string; name: string; domain: string; profiles: DemoSocialProfile[]; status: 'done' | 'pending' }
export interface DemoSocialDonut { label: string; platform: DemoPlatform; short: string; pct: string; count: number; offset: string }
export interface DemoSocialExtra { label: string; platform: DemoPlatform; short: string; count: number; width: string }

export const DEMO_SOCIAL_ROWS: DemoSocialRow[] = ${JSON.stringify(socialDemo.rows, null, 2)}

export const DEMO_SOCIAL_DONUTS: DemoSocialDonut[] = ${JSON.stringify(socialDemo.donuts, null, 2)}

export const DEMO_SOCIAL_EXTRAS: DemoSocialExtra[] = ${JSON.stringify(socialDemo.extras, null, 2)}
`
generate('src/app/socialDemo.ts', demoModule)
console.log(`wrote src/app/socialDemo.ts (${socialDemo.rows.length} rows, ${socialDemo.donuts.length} donuts, ${socialDemo.extras.length} extras)`)

const emailModule = `// GENERATED FILE · do not edit by hand.
// Source: the sample figures on the Email Finder page of .reference/markup.html.
// Regenerate with: node scripts/build-reference-ui.mjs
//
// Offline demo mode uses these figures so the page renders exactly what the reference showed
// when there is no database behind the window. With one present the page reads real rows instead.

export type DemoEmailTone = 'high' | 'domain' | 'low' | 'unverified' | 'no-website' | 'pending'

export interface DemoEmailRow {
  index: string
  name: string
  domain: string
  primary: string
  hasExtras: boolean
  extrasLabel: string
  tone: DemoEmailTone
  label: string
  statusLabel: string
  isFound: boolean
  isMuted: boolean
}
export interface DemoEmailCascadeStep { label: string; note: string; count: number; width: string; arrow: boolean }
export interface DemoEmailBucket { from: number; to: number; count: number; height: string; color: string }
export interface DemoEmailChip { label: string; count: number; color: string }

export interface DemoEmailCoverage {
  badge: string
  total: number
  extracted: number
  needsVerify: number
  risky: number
  noAddress: number
  perLead: string
  showing: number
  cascade: DemoEmailCascadeStep[]
  buckets: DemoEmailBucket[]
  chips: DemoEmailChip[]
}

export const DEMO_EMAIL_ROWS: DemoEmailRow[] = ${JSON.stringify(emailDemo.rows, null, 2)}

export const DEMO_EMAIL_COVERAGE: DemoEmailCoverage = ${JSON.stringify(
  {
    badge: emailDemo.badge,
    total: emailDemo.total,
    extracted: emailDemo.extracted,
    needsVerify: emailDemo.needsVerify,
    risky: emailDemo.risky,
    noAddress: emailDemo.noAddress,
    perLead: emailDemo.perLead,
    showing: emailDemo.showing,
    cascade: emailDemo.cascade,
    buckets: emailDemo.buckets,
    chips: emailDemo.chips,
  },
  null,
  2,
)}
`
generate('src/app/emailDemo.ts', emailModule)
console.log(`wrote src/app/emailDemo.ts (${emailDemo.rows.length} rows, ${emailDemo.buckets.length} bands, ${emailDemo.chips.length} chips)`)

// Last, once every file has been written: anything that did not survive is written again.
verifyGenerated()
