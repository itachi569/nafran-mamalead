// How the browser behaves during a run, and how fast it is allowed to go.
//
// Two knobs that were previously build-time constants. Both exist for the same reason: Google
// Maps decides how much it will serve, and a run that looks like a machine gets less. Running with
// the window visible and slowing the pacing are the two legitimate levers on that — neither of them
// touches a bot check, and both are what the scraper's own guidance recommends when a run is
// throttled.
//
// The values are kept in local storage so a choice survives a restart, and every read is clamped:
// a hand-edited store cannot set a pacing fast enough to hammer Google.

export interface ScraperSettings {
  sessionMode?: 'guest' | 'google'
  /** Show the Chromium window while scraping instead of running it headless. */
  visible: boolean
  /** Version of the explicit browser choice in the pre-run dialog. */
  windowChoiceVersion?: number
  /** Seconds to wait between visiting each place, as a slowest/fastest pair. */
  paceMinSeconds: number
  paceMaxSeconds: number
  /**
   * A browser executable to drive instead of Playwright's bundled Chromium.
   *
   * An executable only — a program, never a profile directory and never the user's own browser
   * session. Profiles are covered by `googleProfile` below, which is the app's own folder.
   */
  browserPath: string
  /**
   * Reuse the profile the "Sign in to Google…" window signed in with.
   *
   * Off, every run starts a throwaway profile: Google has no account to offer, and its pages treat
   * the run as a stranger. On, runs start from the saved profile, so the account chosen once is
   * still there. It is this app's profile, in the app's own folder — never the browser the user
   * browses with.
   */
  googleProfile: boolean
}

/** The pacing the scraper has always used, in seconds. */
export const DEFAULT_SCRAPER_SETTINGS: ScraperSettings = {
  visible: true,
  windowChoiceVersion: 1,
  paceMinSeconds: 3,
  paceMaxSeconds: 3,
  browserPath: '',
  googleProfile: false,
}

/** The same bounds the main process enforces, so the UI cannot promise what the runner rejects. */
export const PACE_LIMITS = { min: 0.5, max: 30 } as const

const KEY = 'ls-scraper-settings'

function clampSeconds(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(PACE_LIMITS.max, Math.max(PACE_LIMITS.min, Math.round(number * 10) / 10))
}

/** Reads the saved settings, falling back per field so a partial store is still usable. */
export function readScraperSettings(): ScraperSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SCRAPER_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<ScraperSettings>
    const paceMinSeconds = clampSeconds(parsed.paceMinSeconds, DEFAULT_SCRAPER_SETTINGS.paceMinSeconds)
    const paceMaxSeconds = clampSeconds(parsed.paceMaxSeconds, DEFAULT_SCRAPER_SETTINGS.paceMaxSeconds)
    return {
      // Old installs silently defaulted to hidden. Start the new dialog with its window
      // enabled once; subsequent explicit choices (including background scans) persist.
      visible: parsed.windowChoiceVersion === 1 ? parsed.visible !== false : true,
      windowChoiceVersion: 1,
      paceMinSeconds,
      // The pair has to stay ordered, or the random wait is built from an inverted range.
      paceMaxSeconds: Math.max(paceMinSeconds, paceMaxSeconds),
      browserPath: typeof parsed.browserPath === 'string' ? parsed.browserPath.trim() : '',
      googleProfile: parsed.googleProfile === true,
      sessionMode: parsed.sessionMode === 'guest' || parsed.sessionMode === 'google' ? parsed.sessionMode : undefined,
    }
  } catch {
    return { ...DEFAULT_SCRAPER_SETTINGS }
  }
}

export function storeScraperSettings(settings: ScraperSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Storage can be unavailable; the in-memory settings still apply to this session.
  }
}

/** The delay pair in milliseconds, ready for the run query. */
export function paceToMs(settings: ScraperSettings): { minDelayMs: number; maxDelayMs: number } {
  return {
    minDelayMs: Math.round(settings.paceMinSeconds * 1000),
    maxDelayMs: Math.round(settings.paceMaxSeconds * 1000),
  }
}
