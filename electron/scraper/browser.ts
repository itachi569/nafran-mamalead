// What a browser is launched with, in one place.
//
// Two things decide whether Google offers an account chooser at all: what the browser says about
// itself, and whether it has any account to offer. A build that announces itself as automation is
// refused the sign-in outright — "this browser or app may not be secure" — and a profile that is
// thrown away after every run has nothing left signed in to choose between. The first is settled
// here; the second is the saved profile a run can be pointed at.

/** Playwright's own default that turns `navigator.webdriver` on and labels the window as driven. */
export const IGNORED_DEFAULT_ARGS: string[] = ['--enable-automation']

/**
 * What every launch adds instead.
 *
 * `AutomationControlled` is the blink feature behind `navigator.webdriver`, so switching it off is
 * what stops the browser answering "yes, a robot" before a page can ask. The other two only keep
 * Chromium from opening first-run chrome — a profile picker or a default-browser prompt — over the
 * page a run is about to read.
 */
export const AUTOMATION_ARGS: string[] = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
]

/**
 * The user-agent every launch presents.
 *
 * Chromium's own string is the automation build's: `HeadlessChrome` in a headless run, a bare
 * `Chromium` in a visible one. Google's sign-in reads exactly that, so the engine — which *is*
 * Chrome's engine — reports itself as the desktop Chrome it is, at the version it actually is.
 */
export function chromeUserAgent(): string {
  const version = process.versions.chrome ?? '124.0.0.0'
  const platform =
    process.platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : process.platform === 'win32'
        ? 'Windows NT 10.0; Win64; x64'
        : 'X11; Linux x86_64'
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`
}
