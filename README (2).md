# Rolling Crunchy's — Job & Maintenance Tracker (Next.js)

Next.js 14 (App Router) version of the standalone HTML tracker. All state lives in the browser's `localStorage`; there is no backend.

## Run locally

```bash
cd nextjs
npm install
npm run dev
```

Open <http://localhost:3000> in your browser.

## Production build

```bash
npm run build
npm start
```

## Project structure

```
nextjs/
├── package.json          # next 14, react 18
├── next.config.js
├── jsconfig.json
├── app/
│   ├── layout.js         # root layout (loads Playfair Display via next/font)
│   ├── globals.css       # global CSS — classes used throughout
│   └── page.js           # entire app in one file (client component)
└── README.md
```

## What's included

Every feature from the standalone HTML version is preserved:

- 📊 **Dashboard** — stat cards, status breakdown, team workload (double-click to drill into a member), critical-pending badges, overdue jobs panel, WhatsApp bulk panel
- ⚡ **Active Jobs** — sortable/filterable table with search, type/category/status/member filters, inline expansion to a full job detail card
- 📁 **History** — completed jobs in tabular form with `🏆 N days early` / `✓ On Time` / `⚠ N days late` timing tags, full timeline auto-expanded
- 🔧 **Maintenance** — separate tracker with categories master (default assignee + SLA days), before/after photos, estimate flow with two-step Accounts + Manager approval, vendor/invoice/amount on resolution, analytics by category
- 🎫 **Ticket numbers** — auto-assigned `RC-NNNN` (jobs) and `MNT-NNNN` (maintenance)
- 👥 **Team master** — names, WhatsApp phones, role toggles (Requestor / Assignee / Accounts Approver / Manager Approver)
- 📤 **WhatsApp integration** — single-job send, multi-recipient with CC chips, assignment + reminder messages, approval request + reminder
- 🤝 **Sequential handoff** between assignees with completion notes
- 📸 **Photo capture** — before/after, compressed in-browser to JPEG @ 70% / max 1000px, stored in localStorage as base64

## Notes

- The whole UI is a client component. The page is gated behind a `mounted` check at the bottom of `app/page.js` so SSR doesn't try to read `localStorage`.
- Inline styles + a single global CSS file. No CSS-in-JS or Tailwind required.
- Photos in `localStorage` (~5 MB browser quota) — fine for ~25–50 photos. For production, move photo storage to IndexedDB or an object store and persist job records to a real database. The existing handler functions (`saveJob`, `saveMaintRequest`, etc.) are the seams where you'd swap in API calls.
- Replace the inline SVG `RCLogo` with a real `<Image>` (place a PNG at `public/logo.png` then `import Image from "next/image"` and `<Image src="/logo.png" width={56} height={56} alt="Rolling Crunchy's" />`).
- Currency is hardcoded to ₹ (Indian rupees) with Indian number formatting in `formatINR()`.

## Migrating data from the standalone HTML

The Next.js app uses the **same localStorage keys** as the HTML build (`rc_jobs`, `rc_team`, `rc_types`, `rc_phones`, `rc_member_roles`, `rc_maint_requests`, `rc_maint_categories`, `rc_ticket_counter`, `rc_maint_counter`, `rc_cleanup_v2`). If you open both at the same origin (e.g. both at `localhost`) they'll share state; otherwise export from the HTML's localStorage via DevTools and re-import in the Next.js origin.
