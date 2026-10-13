# Prompt for Claude Design — update the landing page to match the app

Paste the block below into the Claude Design project that holds `Leads Scraper Landing.dc.html`.
Attach the 11 screenshots from `screenshots/app-pages/` (dashboard, maps, maps-results, social, email,
phone, dm, website, leads, lists, runs, settings) before sending it, so the page can use the real
product screenshots instead of mockups.

---

## The prompt (copy from here)

This landing page is for **Nafran Leads Scraper**, a Windows desktop app I have already built. Please
update the page so that every claim, section and image matches what the app actually does today. Do
not invent features, and do not promise anything on the "must not promise" list below.

**What the product is**
A local-first lead generation desktop app for one operator (agency or freelancer) selling to local
businesses. The flow: scrape Google Maps for a keyword + city → get the businesses (name, address,
phone, website, rating, reviews) → enrich each one by reading its own website (social profiles, email
addresses, phone numbers, named decision makers) → work the list (score, filter, save to lists,
export). Everything is stored on the user's own machine in a local SQLite database. No cloud, no
account, no telemetry.

**Facts the page must state correctly**
- Platform: **Windows 10/11, 64-bit desktop app**. Only the Windows build exists; do not offer macOS
  or Linux downloads.
- **Everything stays on the machine** — the database lives at
  `%APPDATA%\nafran-leads-scraper\leads.db`, and nothing is uploaded anywhere.
- **No signup, no account, no credit card to start.** The app never asks for an email address.
- Scraping runs through **the user's own Google account**, inside the app's own browser window (it
  never touches the user's normal browser profile). A run will not start until Google is connected.
- The **paid extras are optional and use the user's own credentials**, entered in Settings: DataForSEO for
  the "deep search" over Google results (about $0.0024 per lead), and a LeadsAngel licence ZIP
  for SMTP email verification. This app does not bill for either service.
- **Export is CSV or Excel, written straight to disk**, with a scope and column picker.
- It paces itself between places (default 1.5–3 seconds, adjustable up to 10) and can run headless or
  with the browser window visible.

**The eight modules to present (one short block each, with the matching screenshot)**
1. **Google Maps Scraper** — keywords + city, filters (minimum rating, minimum reviews, has website,
   has phone), a live map with pins as places land, a live activity log, and a results table with a
   lead score and a decision column.
2. **Social Profiles** — every social profile each business publishes, with a state filter and an
   import for pasted profile URLs or handles.
3. **Email Finder** — reads the lead's own website (contact / about / team pages, mailto links,
   schema.org), shows a coverage cascade and a confidence mix, and can verify addresses through
   the imported LeadsAngel licence.
4. **Phone Finder** — types each number as reception, direct or mobile, groups them by area code, and
   tells you how many of the missing ones can still be filled from a website.
5. **Decision Makers** — names the person to ask for, with the evidence it came from. Suggestions must
   be confirmed by a human before they count as a contact.
6. **Website Lookup** — paste one domain or many and get a filled-in card per site.
7. **All Leads, Saved Lists, Run History** — the local ledger grouped by day, named lists, and a run log
   where any past scrape can be re-run with one click.
8. **Settings** — plan and usage, the API keys, light/dark theme, and where the data lives.

**Changes to make on the page**
1. **Hero** — say plainly that it is a Windows desktop app that keeps all data on the machine. The
   headline should promise lead lists, not "AI magic".
2. **Screenshots** — replace any mockups or placeholder art with the real screenshots I attached.
   Caption each one with what the user is looking at, and keep them large enough to read.
3. **Pricing** — show the three tiers as **Free / Pro £39 per month / Studio £89 per month**, and list
   what each includes (Maps scrapes per month, email/phone/social/decision-maker lookups, seats,
   exports). The button under each tier must be **"Download for Windows"** or **"Join the waitlist"** —
   not "Subscribe" or "Buy now", because there is no checkout in the app yet. Add one honest line:
   *"In-app purchasing is coming; today the app is activated per machine."*
4. **Download section** — one Windows button, the file size (~100 MB), and this note in small text:
   *"Windows may show a SmartScreen warning because this build is not code-signed yet. Choose More info
   → Run anyway."*
5. **How it works** — three steps (scrape → enrich → export), each with one screenshot, in plain
   language a non-technical buyer understands.
6. **Privacy / trust block** — where the database lives, that nothing is uploaded, that there is no
   account, and that the file can be backed up like any other file.
7. **FAQ** — answer these honestly:
   - Do I need an API key? *(No. Only the optional paid extras need one.)*
   - Is scraping Google Maps allowed? *(It reads public listings through your own signed-in browser, at
     a human pace with an adjustable delay, for your own outreach.)*
   - Which countries? *(The app knows 22 markets including the UK, Pakistan, India, UAE, Saudi Arabia,
     Bangladesh, US, Canada, Australia, Ireland, Germany, France, Spain, Italy, Netherlands, Turkey,
     Malaysia, Singapore, South Africa, Qatar, Kuwait, Oman and Bahrain.)*
   - Where is my data, and what happens if I uninstall? *(A file on your machine; uninstalling does not
     delete it.)*
   - Does it need to stay open? *(A run does; everything is saved as it goes.)*
8. **Design language** — keep it consistent with the app: Satoshi font, `#EFEFEF` page background,
   cards `#F5F5F4` with 22px radius, 999px pills, the green family `#C8D5BB` / `#A9BC9B` / `#8FA382`,
   dark sections `#1C1C1C`, and the big dot-grid numbers.

**Must NOT appear anywhere on the page**
- Any macOS or Linux download button.
- "Sign up", "Create an account", "Log in" as a required step.
- A web app, browser dashboard, or "work from any device" claim.
- Automatic updates as a feature.
- "Subscribe now", "Cancel anytime" checkout flows, or free-trial counts that imply billing exists.
- Invented numbers (user counts, ratings, "10,000 leads scraped") — do not fabricate social proof.
- Claims about AI writing emails or sending outreach: the app finds and exports data, it does not
  contact anyone.

**Deliverable**
The updated `Leads Scraper Landing.dc.html`, same design system, with real screenshots placed, honest
pricing, the download section and the FAQ. Keep alt text on every image, and keep the page responsive
at mobile width.

## (end of prompt)

---

## After they make the changes

Bring the updated file back and drop it into the `landing/` folder of the source zip, so the app code
and the landing page stay together. If anything on the updated page contradicts section 8 of
`docs/APP-BRIEF-FOR-WEBSITE.md`, that file is the source of truth — it describes the app as built.
