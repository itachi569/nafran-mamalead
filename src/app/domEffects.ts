// The reference app renders once and then adjusts the DOM directly: responsive grids, table
// column fitting, hover styling and Lottie mounting all happen outside the template. These
// functions are that same behaviour, kept deliberately close to the original so the port
// behaves identically. They run after every render, as the reference did on every update.
import lottie, { type AnimationItem } from 'lottie-web'
import aiFlowData from '../assets/lottie/ai-flow.json'
import chatAnimData from '../assets/lottie/chat-anim.json'

interface RowConfig {
  hide: string[]
  tpl: string
  fixed: number
  gaps: number
  flex: number
  min: number
}

const MAIL_ROWS: RowConfig[] = [
  { hide: [], tpl: '22px 34px minmax(0,1.3fr) minmax(0,1.2fr) minmax(0,1.5fr) 148px 88px', fixed: 292, gaps: 6, flex: 3, min: 112 },
  { hide: ['idx'], tpl: '22px minmax(0,1.3fr) minmax(0,1.2fr) minmax(0,1.5fr) 148px 88px', fixed: 258, gaps: 5, flex: 3, min: 108 },
  { hide: ['idx', 'dom'], tpl: '22px minmax(0,1.3fr) minmax(0,1.6fr) 148px 88px', fixed: 258, gaps: 4, flex: 2, min: 124 },
  { hide: ['idx', 'dom', 'status'], tpl: '22px minmax(0,1.3fr) minmax(0,1.6fr) 148px', fixed: 170, gaps: 3, flex: 2, min: 130 },
]

const PHONE_ROWS: RowConfig[] = [
  { hide: [], tpl: '22px 34px minmax(0,1.3fr) 156px 104px 70px minmax(0,1.6fr)', fixed: 386, gaps: 6, flex: 2, min: 130 },
  { hide: ['idx'], tpl: '22px minmax(0,1.3fr) 156px 104px 70px minmax(0,1.6fr)', fixed: 352, gaps: 5, flex: 2, min: 126 },
  { hide: ['idx', 'area'], tpl: '22px minmax(0,1.3fr) 156px 104px minmax(0,1.6fr)', fixed: 282, gaps: 4, flex: 2, min: 124 },
  { hide: ['idx', 'area', 'addr'], tpl: '22px minmax(0,1fr) 156px 104px', fixed: 282, gaps: 3, flex: 1, min: 150 },
]

const LEAD_ROWS: RowConfig[] = [
  { hide: [], tpl: '40px minmax(0,1.5fr) minmax(0,1.45fr) minmax(0,1.2fr) 68px 54px 58px 88px', fixed: 308, gaps: 7, flex: 3, min: 112 },
  { hide: ['addr'], tpl: '40px minmax(0,1.6fr) minmax(0,1.5fr) 68px 54px 58px 88px', fixed: 308, gaps: 6, flex: 2, min: 150 },
  { hide: ['addr', 'soc'], tpl: '40px minmax(0,1.6fr) minmax(0,1.5fr) 68px 58px 88px', fixed: 254, gaps: 5, flex: 2, min: 145 },
  { hide: ['addr', 'soc', 'rate'], tpl: '40px minmax(0,1.6fr) minmax(0,1.5fr) 58px 88px', fixed: 186, gaps: 4, flex: 2, min: 138 },
]

const SOCIAL_ROWS: RowConfig[] = [
  { hide: [], tpl: '22px 34px minmax(0,1.35fr) minmax(0,1.2fr) minmax(0,1.5fr) 96px', fixed: 152, gaps: 5, flex: 3, min: 118 },
  { hide: ['idx'], tpl: '22px minmax(0,1.35fr) minmax(0,1.2fr) minmax(0,1.5fr) 96px', fixed: 118, gaps: 4, flex: 3, min: 112 },
  { hide: ['idx', 'dom'], tpl: '22px minmax(0,1.4fr) minmax(0,1.6fr) 96px', fixed: 118, gaps: 3, flex: 2, min: 130 },
]

const TIMELINE_HEIGHTS = [16, 9, 34, 12, 8, 22, 58, 14, 26, 9, 40, 88, 18, 11, 30, 8, 21, 13, 52, 10, 19, 8, 28, 15, 44, 9, 14, 36, 11, 24, 74, 12, 17, 9, 31, 14, 20, 10, 48, 16]

function gridColumns(selector: string, narrow: boolean, wide: string): void {
  const element = document.querySelector<HTMLElement>(selector)
  if (element) element.style.gridTemplateColumns = narrow ? 'minmax(0,1fr)' : wide
}

function measureRows(headSelector: string, configs: RowConfig[]) {
  const head = document.querySelector<HTMLElement>(headSelector)
  const block = head?.closest<HTMLElement>('[data-rowsblock]')
  if (!head || !block) return
  const list = head.nextElementSibling as HTMLElement | null
  if (!list) return
  const width = list.clientWidth
  const pick = configs.find((config) => width >= config.fixed + config.gaps * 10 + config.flex * config.min)
  return { head, block, pick }
}

function fitRows(measurement: ReturnType<typeof measureRows>): void {
  if (!measurement) return
  const { head, block, pick } = measurement
  block.querySelectorAll<HTMLElement>('[data-rowgrid]').forEach((row) => {
    row.style.display = pick ? 'grid' : 'flex'
    if (pick) row.style.gridTemplateColumns = pick.tpl
    Array.from(row.children).forEach((child) => {
      const cell = child as HTMLElement
      if (cell.dataset.mw === undefined) cell.dataset.mw = cell.style.minWidth || ''
      cell.style.minWidth = pick ? '0' : cell.dataset.mw
      if (cell.dataset.col) {
        if (cell.dataset.disp === undefined) cell.dataset.disp = cell.style.display || ''
        cell.style.display = pick && pick.hide.includes(cell.dataset.col) ? 'none' : cell.dataset.disp
      }
    })
    const inline = row.querySelector<HTMLElement>('[data-inline-addr]')
    if (inline) inline.style.display = pick && pick.hide.includes('addr') ? 'block' : 'none'
  })
  head.style.display = pick ? 'grid' : 'none'
}

export function layout(): void {
  const shell = document.querySelector<HTMLElement>('[data-shell]')
  const side = document.querySelector<HTMLElement>('[data-sidebar]')
  if (!shell || !side) return
  const width = window.innerWidth
  const narrow = width < 940
  shell.style.gridTemplateColumns = narrow ? 'minmax(0,1fr)' : '262px minmax(0,1fr)'

  gridColumns('[data-hero]', width < 1080, 'minmax(0,1.7fr) minmax(0,1fr)')
  gridColumns('[data-setup]', width < 780, 'minmax(0,1.05fr) minmax(0,1fr)')
  gridColumns('[data-results]', true, 'minmax(0,1fr)')
  // Settings responds to its own available width through container queries.
  // A window-width inline override would keep its navigation beside a cramped panel.
  gridColumns('[data-socialtop]', width < 1080, 'minmax(0,1.5fr) minmax(0,1fr)')
  gridColumns('[data-podium]', width < 1080, 'minmax(0,1.6fr) minmax(0,1fr)')
  gridColumns('[data-emailtop]', width < 1080, 'minmax(0,1.4fr) minmax(0,1fr)')
  gridColumns('[data-phonetop]', width < 1080, 'minmax(0,1.25fr) minmax(0,1fr)')
  gridColumns('[data-dmbody]', width < 1080, '300px minmax(0,1fr)')
  gridColumns('[data-lookuptop]', width < 1080, 'minmax(0,1.45fr) minmax(0,1fr)')

  const wide = width >= 1080
  for (const selector of ['[data-results]', '[data-hero]', '[data-socialtop]', '[data-podium]', '[data-emailtop]', '[data-phonetop]', '[data-dmbody]', '[data-lookuptop]']) {
    const group = document.querySelector<HTMLElement>(selector)
    if (group) group.style.alignItems = wide ? 'stretch' : 'start'
  }

  // Read all geometry together before changing rows. Interleaving each table's reads and
  // writes forced the browser to lay out thousands of cells repeatedly on every click.
  const sideHeight = side.scrollHeight
  const reach = document.querySelector<HTMLElement>('[data-reach]')
  const reachWidth = reach?.clientWidth
  const tables = [measureRows('[data-mailhead]', MAIL_ROWS), measureRows('[data-phhead]', PHONE_ROWS),
    measureRows('[data-rowhead]', LEAD_ROWS), measureRows('[data-sochead]', SOCIAL_ROWS)]
  side.style.position = !narrow && window.innerHeight >= sideHeight + 40 ? 'sticky' : 'static'
  if (reach && reachWidth !== undefined) reach.style.gridTemplateColumns = reachWidth < 460 ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1.05fr)'
  tables.forEach(fitRows)

  const status = document.querySelector<HTMLElement>('[data-status]')
  if (status) status.style.display = 'flex'
}

function once(element: HTMLElement, key: string): boolean {
  if (element.dataset[key] === '1') return false
  element.dataset[key] = '1'
  return true
}

export function bindHover(): void {
  document.querySelectorAll<HTMLElement>('[data-card]').forEach((card) => {
    if (!once(card, 'bound')) return
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-3px)'
      card.style.boxShadow = '0 30px 60px -44px rgba(28,28,28,.45)'
    })
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'none'
      card.style.boxShadow = 'none'
    })
  })

  document.querySelectorAll<HTMLElement>('[data-icon],[data-open]').forEach((button) => {
    if (!once(button, 'bound')) return
    const background = button.style.background
    const color = button.style.color
    button.addEventListener('mouseenter', () => {
      button.style.background = '#1C1C1C'
      button.style.color = '#F0F0F0'
    })
    button.addEventListener('mouseleave', () => {
      button.style.background = background
      button.style.color = color
    })
  })

  document.querySelectorAll<HTMLElement>('[data-qa]').forEach((button) => {
    if (!once(button, 'bound')) return
    const arrow = button.querySelector<HTMLElement>('[data-qa-arrow]')
    button.addEventListener('mouseenter', () => {
      button.style.background = '#E2E4DF'
      if (arrow) arrow.style.transform = 'translateX(3px)'
    })
    button.addEventListener('mouseleave', () => {
      button.style.background = '#EAEAE8'
      if (arrow) arrow.style.transform = 'none'
    })
  })

  document.querySelectorAll<HTMLElement>('[data-attn]').forEach((button) => {
    if (!once(button, 'bound')) return
    const background = button.style.background
    const color = button.style.color
    button.addEventListener('mouseenter', () => {
      button.style.background = '#F0F0F0'
      button.style.color = '#1C1C1C'
    })
    button.addEventListener('mouseleave', () => {
      button.style.background = background
      button.style.color = color
    })
  })

  document.querySelectorAll<HTMLElement>('[data-person]').forEach((person) => {
    if (!once(person, 'bound')) return
    person.addEventListener('mouseenter', () => {
      person.style.transform = 'translateY(-3px)'
      person.style.boxShadow = '0 24px 44px -34px rgba(28,28,28,.5)'
    })
    person.addEventListener('mouseleave', () => {
      person.style.transform = 'none'
      person.style.boxShadow = 'none'
    })
  })

  document.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
    if (!once(row, 'bound')) return
    row.addEventListener('mouseenter', () => {
      row.style.background = '#EDEEEB'
    })
    row.addEventListener('mouseleave', () => {
      row.style.background = 'transparent'
    })
  })

  document.querySelectorAll<HTMLElement>('[data-ghost],[data-step],[data-more],[data-bulk]').forEach((button) => {
    if (!once(button, 'bound')) return
    const background = button.style.background
    button.addEventListener('mouseenter', () => {
      button.style.background = '#DEDFDC'
      button.style.borderColor = '#9BA29C'
    })
    button.addEventListener('mouseleave', () => {
      button.style.background = background
      button.style.borderColor = '#C6C8C4'
    })
  })

  for (const selector of ['[data-cta]', '[data-run]']) {
    const element = document.querySelector<HTMLElement>(selector)
    if (!element || !once(element, 'bound')) continue
    element.addEventListener('mouseenter', () => {
      element.style.transform = 'translateY(-2px)'
    })
    element.addEventListener('mouseleave', () => {
      element.style.transform = 'none'
    })
  }
}

export function buildTimeline(): void {
  const host = document.querySelector<HTMLElement>('[data-timeline]')
  if (!host || host.dataset.built === '1') return
  host.dataset.built = '1'
  TIMELINE_HEIGHTS.forEach((height, index) => {
    const wrap = document.createElement('span')
    wrap.style.cssText = 'position:relative;flex:1;display:flex;align-items:flex-end;justify-content:center;height:100%'
    const bar = document.createElement('span')
    const big = height > 45
    bar.style.cssText = `width:${big ? '3px' : '2px'};height:${height}%;border-radius:2px;background:${big ? '#1C1C1C' : '#B9BDB8'};transform-origin:bottom;animation:lsRise .8s cubic-bezier(.22,1,.36,1) ${(index * 0.015).toFixed(3)}s both`
    wrap.appendChild(bar)
    if (big) {
      const dot = document.createElement('span')
      dot.style.cssText = `position:absolute;bottom:calc(${height}% - 3px);width:7px;height:7px;border-radius:999px;background:#1C1C1C`
      wrap.appendChild(dot)
    }
    host.appendChild(wrap)
  })
}

const mounted: Record<string, { anim: AnimationItem | null; host: Element | null }> = {}

/**
 * One observer for every animation, so an off-screen lottie stops drawing.
 *
 * Each animation renders to a canvas on requestAnimationFrame, which runs whether or not anyone
 * can see it. Two of the three live in views that are hidden most of the time, and a hidden
 * element intersects nothing, so `isIntersecting` is exactly the signal needed. Without this the
 * renderer sat at roughly a full core while the app was idle.
 */
let visibility: IntersectionObserver | null = null
/** The animation a given host element belongs to, so an entry is resolved without a scan. */
const hostKeys = new Map<Element, string>()

function observeVisibility(key: string, host: Element): void {
  if (!visibility) {
    visibility = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const state = mounted[hostKeys.get(entry.target) ?? '']
          if (!state?.anim) continue
          // play() restarts a stopped animation from frame zero, so a resumed loop picks up where
          // it left off instead of jumping.
          if (entry.isIntersecting) state.anim.play()
          else state.anim.pause()
        }
      },
      { threshold: 0 },
    )
  }
  hostKeys.set(host, key)
  visibility.observe(host)
}

function mountAnim(key: string, host: Element | null, data: unknown): void {
  const state = mounted[key] ?? (mounted[key] = { anim: null, host: null })
  if (!host) {
    if (state.host) {
      hostKeys.delete(state.host)
      visibility?.unobserve(state.host)
    }
    state.anim?.destroy()
    state.anim = null
    state.host = null
    return
  }
  if (state.host === host) return
  if (state.host) {
    hostKeys.delete(state.host)
    visibility?.unobserve(state.host)
  }
  state.anim?.destroy()
  state.host = host
  state.anim = lottie.loadAnimation({
    container: host as HTMLElement,
    renderer: 'canvas',
    loop: true,
    autoplay: true,
    animationData: data,
  })
  observeVisibility(key, host)
}

export function mountLottie(): void {
  mountAnim('ai', document.querySelector('[data-lottie]'), aiFlowData)
  mountAnim('assist', document.querySelector('[data-chatlottie]'), chatAnimData)
  mountAnim('chathead', document.querySelector('[data-chatlottie2]'), chatAnimData)
}

export function scrollChat(): void {
  const element = document.querySelector<HTMLElement>('[data-chatscroll]')
  if (element) element.scrollTop = element.scrollHeight
}

// Hover styling is bound once per element, but a Lottie host that unmounts must release its
// animation, so teardown only removes animation state when the node has left the document.
export function releaseDetachedAnimations(): void {
  for (const state of Object.values(mounted)) {
    if (state.host && !document.contains(state.host)) {
      state.anim?.destroy()
      state.anim = null
      state.host = null
    }
  }
}
