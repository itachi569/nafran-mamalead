// GENERATED FILE · do not edit by hand.
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

export const DEMO_EMAIL_ROWS: DemoEmailRow[] = [
  {
    "index": "001",
    "name": "Northern Spine & Sports Clinic",
    "domain": "northernspine.co.uk",
    "primary": "hello@northernspine.co.uk",
    "hasExtras": true,
    "extrasLabel": "+4",
    "tone": "domain",
    "label": "Domain · 45",
    "statusLabel": "Found 5",
    "isFound": true,
    "isMuted": false
  },
  {
    "index": "002",
    "name": "Deansgate Physio Rooms",
    "domain": "deansgatephysio.co.uk",
    "primary": "info@deansgatephysio.co.uk",
    "hasExtras": true,
    "extrasLabel": "+2",
    "tone": "high",
    "label": "High · 95",
    "statusLabel": "Found 3",
    "isFound": true,
    "isMuted": false
  },
  {
    "index": "003",
    "name": "Salford Quays Rehab Lab",
    "domain": "rehablab.uk",
    "primary": "team@rehablab.uk",
    "hasExtras": true,
    "extrasLabel": "+6",
    "tone": "low",
    "label": "Low · 35",
    "statusLabel": "Found 7",
    "isFound": true,
    "isMuted": false
  },
  {
    "index": "004",
    "name": "Chorlton Movement Clinic",
    "domain": "chorltonmovement.com",
    "primary": "admin@chorltonmovement.com",
    "hasExtras": true,
    "extrasLabel": "+3",
    "tone": "domain",
    "label": "Domain · 45",
    "statusLabel": "Found 4",
    "isFound": true,
    "isMuted": false
  },
  {
    "index": "005",
    "name": "Prestwich Lower Limb Studio",
    "domain": "—",
    "primary": "No email found",
    "hasExtras": false,
    "extrasLabel": "",
    "tone": "no-website",
    "label": "No website",
    "statusLabel": "No website",
    "isFound": false,
    "isMuted": true
  },
  {
    "index": "006",
    "name": "Ancoats Sports Therapy",
    "domain": "ancoatssportstherapy.co.uk",
    "primary": "No email found",
    "hasExtras": false,
    "extrasLabel": "",
    "tone": "unverified",
    "label": "Not verified",
    "statusLabel": "No email",
    "isFound": false,
    "isMuted": true
  },
  {
    "index": "007",
    "name": "Didsbury Pilates Collective",
    "domain": "didsburypilates.com",
    "primary": "hello@didsburypilates.com",
    "hasExtras": true,
    "extrasLabel": "+1",
    "tone": "high",
    "label": "High · 95",
    "statusLabel": "Found 2",
    "isFound": true,
    "isMuted": false
  },
  {
    "index": "008",
    "name": "Trafford Yoga Barn",
    "domain": "traffordyoga.co.uk",
    "primary": "No email found",
    "hasExtras": false,
    "extrasLabel": "",
    "tone": "pending",
    "label": "Pending",
    "statusLabel": "Pending",
    "isFound": false,
    "isMuted": true
  },
  {
    "index": "009",
    "name": "Eccles Spine & Posture",
    "domain": "—",
    "primary": "No email found",
    "hasExtras": false,
    "extrasLabel": "",
    "tone": "no-website",
    "label": "No website",
    "statusLabel": "No website",
    "isFound": false,
    "isMuted": true
  },
  {
    "index": "010",
    "name": "Levenshulme Sports Injury Co",
    "domain": "levsportsinjury.co.uk",
    "primary": "book@levsportsinjury.co.uk",
    "hasExtras": true,
    "extrasLabel": "+2",
    "tone": "domain",
    "label": "Domain · 45",
    "statusLabel": "Found 3",
    "isFound": true,
    "isMuted": false
  }
]

export const DEMO_EMAIL_COVERAGE: DemoEmailCoverage = {
  "badge": "32%",
  "total": 128,
  "extracted": 53,
  "needsVerify": 24,
  "risky": 12,
  "noAddress": 75,
  "perLead": "3.1",
  "showing": 10,
  "cascade": [
    {
      "label": "Scraped",
      "note": "from Google Maps",
      "count": 128,
      "width": "100%",
      "arrow": true
    },
    {
      "label": "Website found",
      "note": "76% of scraped",
      "count": 97,
      "width": "76%",
      "arrow": true
    },
    {
      "label": "Emails extracted",
      "note": "41% of scraped",
      "count": 53,
      "width": "41%",
      "arrow": true
    },
    {
      "label": "Verified",
      "note": "32% of scraped",
      "count": 41,
      "width": "32%",
      "arrow": false
    }
  ],
  "buckets": [
    {
      "from": 0,
      "to": 5,
      "count": 0,
      "height": "3%",
      "color": "#E7E8E5"
    },
    {
      "from": 5,
      "to": 10,
      "count": 0,
      "height": "3%",
      "color": "#E7E8E5"
    },
    {
      "from": 10,
      "to": 15,
      "count": 0,
      "height": "3%",
      "color": "#E7E8E5"
    },
    {
      "from": 15,
      "to": 20,
      "count": 0,
      "height": "3%",
      "color": "#E7E8E5"
    },
    {
      "from": 20,
      "to": 25,
      "count": 0,
      "height": "3%",
      "color": "#E7E8E5"
    },
    {
      "from": 25,
      "to": 30,
      "count": 0,
      "height": "3%",
      "color": "#E7E8E5"
    },
    {
      "from": 30,
      "to": 35,
      "count": 2,
      "height": "17%",
      "color": "#C8D5BB"
    },
    {
      "from": 35,
      "to": 40,
      "count": 3,
      "height": "25%",
      "color": "#C8D5BB"
    },
    {
      "from": 40,
      "to": 45,
      "count": 3,
      "height": "25%",
      "color": "#C8D5BB"
    },
    {
      "from": 45,
      "to": 50,
      "count": 0,
      "height": "3%",
      "color": "#E7E8E5"
    },
    {
      "from": 50,
      "to": 55,
      "count": 1,
      "height": "8%",
      "color": "#8FA382"
    },
    {
      "from": 55,
      "to": 60,
      "count": 4,
      "height": "33%",
      "color": "#8FA382"
    },
    {
      "from": 60,
      "to": 65,
      "count": 9,
      "height": "75%",
      "color": "#8FA382"
    },
    {
      "from": 65,
      "to": 70,
      "count": 7,
      "height": "58%",
      "color": "#8FA382"
    },
    {
      "from": 70,
      "to": 75,
      "count": 5,
      "height": "42%",
      "color": "#8FA382"
    },
    {
      "from": 75,
      "to": 80,
      "count": 0,
      "height": "3%",
      "color": "#E7E8E5"
    },
    {
      "from": 80,
      "to": 85,
      "count": 1,
      "height": "8%",
      "color": "#C8D5BB"
    },
    {
      "from": 85,
      "to": 90,
      "count": 2,
      "height": "17%",
      "color": "#C8D5BB"
    },
    {
      "from": 90,
      "to": 95,
      "count": 4,
      "height": "33%",
      "color": "#1C1C1C"
    },
    {
      "from": 95,
      "to": 100,
      "count": 12,
      "height": "100%",
      "color": "#1C1C1C"
    }
  ],
  "chips": [
    {
      "label": "High 95",
      "count": 12,
      "color": "#1C1C1C"
    },
    {
      "label": "Domain 45",
      "count": 29,
      "color": "#8FA382"
    },
    {
      "label": "Low 35",
      "count": 8,
      "color": "#C8D5BB"
    },
    {
      "label": "Not verified",
      "count": 4,
      "color": "#D8DAD6"
    }
  ]
}
