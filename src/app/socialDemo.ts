// GENERATED FILE · do not edit by hand.
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

export const DEMO_SOCIAL_ROWS: DemoSocialRow[] = [
  {
    "index": "001",
    "name": "Northern Spine & Sports Clinic",
    "domain": "northernspine.co.uk",
    "profiles": [
      {
        "label": "Facebook",
        "platform": "facebook",
        "short": "f"
      },
      {
        "label": "Instagram",
        "platform": "instagram",
        "short": "ig"
      }
    ],
    "status": "done"
  },
  {
    "index": "002",
    "name": "Deansgate Physio Rooms",
    "domain": "deansgatephysio.co.uk",
    "profiles": [
      {
        "label": "Instagram",
        "platform": "instagram",
        "short": "ig"
      },
      {
        "label": "LinkedIn",
        "platform": "linkedin",
        "short": "in"
      }
    ],
    "status": "done"
  },
  {
    "index": "003",
    "name": "Salford Quays Rehab Lab",
    "domain": "rehablab.uk",
    "profiles": [],
    "status": "pending"
  },
  {
    "index": "004",
    "name": "Chorlton Movement Clinic",
    "domain": "chorltonmovement.com",
    "profiles": [
      {
        "label": "Facebook",
        "platform": "facebook",
        "short": "f"
      }
    ],
    "status": "done"
  },
  {
    "index": "005",
    "name": "Prestwich Lower Limb Studio",
    "domain": "No website",
    "profiles": [],
    "status": "pending"
  },
  {
    "index": "006",
    "name": "Ancoats Sports Therapy",
    "domain": "ancoatssportstherapy.co.uk",
    "profiles": [
      {
        "label": "Instagram",
        "platform": "instagram",
        "short": "ig"
      },
      {
        "label": "TikTok",
        "platform": "tiktok",
        "short": "tt"
      },
      {
        "label": "YouTube",
        "platform": "youtube",
        "short": "yt"
      }
    ],
    "status": "done"
  },
  {
    "index": "007",
    "name": "Didsbury Pilates Collective",
    "domain": "didsburypilates.com",
    "profiles": [
      {
        "label": "Instagram",
        "platform": "instagram",
        "short": "ig"
      },
      {
        "label": "Facebook",
        "platform": "facebook",
        "short": "f"
      },
      {
        "label": "LinkedIn",
        "platform": "linkedin",
        "short": "in"
      }
    ],
    "status": "done"
  },
  {
    "index": "008",
    "name": "Trafford Yoga Barn",
    "domain": "traffordyoga.co.uk",
    "profiles": [
      {
        "label": "Instagram",
        "platform": "instagram",
        "short": "ig"
      },
      {
        "label": "YouTube",
        "platform": "youtube",
        "short": "yt"
      }
    ],
    "status": "done"
  },
  {
    "index": "009",
    "name": "Eccles Spine & Posture",
    "domain": "No website",
    "profiles": [],
    "status": "pending"
  },
  {
    "index": "010",
    "name": "Levenshulme Sports Injury Co",
    "domain": "levsportsinjury.co.uk",
    "profiles": [],
    "status": "pending"
  }
]

export const DEMO_SOCIAL_DONUTS: DemoSocialDonut[] = [
  {
    "label": "Other",
    "platform": "other",
    "short": "·\u001a··",
    "pct": "0",
    "count": 0,
    "offset": "{{ r.off }}"
  }
]

export const DEMO_SOCIAL_EXTRAS: DemoSocialExtra[] = [
  {
    "label": "{{ b.name }}",
    "platform": "other",
    "short": "{{ b.tag }}",
    "count": 0,
    "width": "{{ b.w }}"
  }
]
