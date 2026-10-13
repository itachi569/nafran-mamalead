// GENERATED FILE · do not edit by hand.
// Source: .reference/app-doc.js. Regenerate with: node scripts/build-reference-ui.mjs
//
// Demo copy and sample rows, exactly as the reference app declares them. A real run replaces
// the sample rows with captured leads; the layout and copy around them stay identical.

export type LeadRow = [string, string, string, string, string, number, number, number, number, string]
export interface ExportScope { label: string; n: number; file: string }
export interface ExportMode { title: string; note: string; scopes: ExportScope[]; cols: [string, boolean][] }

export const LEAD_FILTERS: [string, string][] = [['All', '128'], ['Has phone', '96'], ['Has email', '74'], ['Has socials', '34'], ['No contact yet', '11']];
export const RUN_FILTERS: [string, string][] = [['All runs', '42'], ['Maps', '31'], ['Imports', '7'], ['Failed', '3']];
export const DELIMS: [string, string][] = [['Comma', '.csv'], ['Semicolon', '.csv'], ['Tab', '.tsv'], ['Excel (.xlsx)', '.xlsx']];
export const VIEW_NAMES: Record<string, string> = {
  dashboard: 'Dashboard', maps: 'Google Maps', social: 'Social Profiles', email: 'Email Finder',
  phone: 'Phone Finder', dm: 'Decision Makers', website: 'Website Lookup',
  leads: 'All Leads', lists: 'Saved Lists', runs: 'Run History', settings: 'Workspace & Settings'
};
export const DEMO_NOTES: Record<string, string> = {
  'Show all': 'Every row from this set is loaded.',
  'Load 20 more': '20 more leads pulled from the ledger — 28 of 128 showing.',
  'Older runs': 'Loaded runs 7–20 of 42.',
  'Older invoices': 'Loaded invoices 7–14.',
  'Refresh': 'Re-checked in 1.2s — no new records since the last pass.',
  'Run the cascade': 'Cascade queued: socials, then email, then phone. 63 leads in line.',
  'Deep enrich missing': 'Deep enrichment queued for the 94 leads with gaps.',
  'Enrich all pending': 'Enrichment queued for 63 pending leads.',
  'Enrich all missing': 'Enrichment queued for 117 leads.',
  'Deep search missing': 'Deep search running on 75 domains.',
  'Deep enrich all missing': 'Deep enrichment queued for every lead with a gap.',
  'Find & verify needed': '24 addresses queued for SMTP verification.',
  'Advanced SMTP check': 'Advanced check running on 12 risky addresses.',
  'Bulk import keywords': 'Paste or drop a keyword list — one per line.',
  'Paste from clipboard': 'Clipboard read: 12 domains queued.',
  'Upload CSV': 'Reading the first column as the domain.',
  'Choose file': 'File picker opened.',
  'New list': 'Name the list, then drop the bookmarked leads in.',
};
export const CHAT_CHIPS: string[] = [
  'How do I scrape Google Maps leads?',
  'Why are emails missing?',
  'How do I export a CSV?',
];
export const PICKS: LeadRow[] = [
  ['DP', 'Deansgate Physio Rooms', 'deansgatephysio.co.uk', 'Deansgate', '4.9 ★ 641', 100, 1, 1, 1, 'Director named'],
  ['NS', 'Northern Spine & Sports Clinic', 'northernspine.co.uk', 'Ancoats', '4.8 ★ 213', 96, 1, 1, 1, '5 emails'],
  ['GS', 'Glow Skin Studio', 'glowskin.mcr', 'Northern Quarter', '4.7 ★ 302', 94, 1, 1, 0, 'Instagram only'],
  ['SQ', 'Salford Quays Rehab Lab', 'rehablab.uk', 'Salford', '4.7 ★ 88', 92, 1, 1, 0, '6 emails'],
  ['AT', 'Ancoats Therapy Co', 'ancoatstherapy.co', 'Ancoats', '4.6 ★ 176', 89, 1, 1, 1, 'Multi-site'],
  ['CM', 'Chorlton Movement Clinic', 'chorltonmovement.com', 'Chorlton', '4.6 ★ 154', 87, 1, 1, 1, '3 emails'],
  ['DR', 'Didsbury Derma Rooms', 'dermarooms.co.uk', 'Didsbury', '4.5 ★ 121', 81, 1, 0, 1, 'No email found'],
  ['HR', 'Hulme Recovery Studio', 'hulmerecovery.uk', 'Hulme', '4.4 ★ 64', 74, 1, 1, 0, 'Sole trader'],
  ['BW', 'Bury Wellness Rooms', 'burywellness.co.uk', 'Bury', '4.3 ★ 52', 68, 1, 0, 0, 'Out of radius'],
  ['PL', 'Prestwich Lower Limb Studio', 'No website found', 'Prestwich', '4.4 ★ 37', 61, 1, 0, 0, 'Phone only']
];
export const LIST_TARGETS: [string, number][] = [['Manchester Physio · Tier 1', 24], ['Skin & Derma · Warm', 18], ['Salford & Quays', 16], ['New list', 0]];
export const EXP_MODES: Record<string, ExportMode> = {
  leads: {
    title: 'Export leads',
    note: 'Written straight to disk — nothing leaves this machine. Blank cells stay blank rather than guessing.',
    scopes: [
      { label: 'Last run', n: 18, file: 'run-2026-09-02-manchester.csv' },
      { label: 'Filtered view', n: 8, file: 'filtered-leads.csv' },
      { label: 'All saved leads', n: 128, file: 'all-leads-128.csv' }
    ],
    cols: [
      ['Business name', true], ['Domain', true], ['Phone', true], ['Email', true],
      ['Address', true], ['Rating', true], ['Review count', false], ['Socials', true],
      ['Score', true], ['Decision maker', false], ['Source', false], ['Saved date', true]
    ]
  },
  runs: {
    title: 'Export run log',
    note: 'One row per run, in the order they happened. Failed runs keep their error reason.',
    scopes: [
      { label: 'Last 6 runs', n: 6, file: 'runs-recent.csv' },
      { label: 'This month', n: 14, file: 'runs-2026-09.csv' },
      { label: 'All runs', n: 42, file: 'runs-all-42.csv' }
    ],
    cols: [
      ['Started at', true], ['Keywords', true], ['Source', true], ['Location', true],
      ['Places captured', true], ['Duration', true], ['Status', true], ['Error reason', false],
      ['Credits used', false]
    ]
  },
  invoices: {
    title: 'Download invoices',
    note: 'Statement rows for the accountant. PDF copies are linked in the last column.',
    scopes: [
      { label: 'This year', n: 9, file: 'invoices-2026.csv' },
      { label: 'Last 12 months', n: 12, file: 'invoices-12m.csv' },
      { label: 'All invoices', n: 14, file: 'invoices-all.csv' }
    ],
    cols: [
      ['Invoice number', true], ['Issued', true], ['Description', true], ['Net', true],
      ['VAT', true], ['Total', true], ['Status', true], ['PDF link', false]
    ]
  }
};
export const LABELS: Record<string, string> = {

 leads: 'All Leads', lists: 'Saved Lists',
  runs: 'Run History', settings: 'Settings'
};
