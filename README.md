# 🦞 JobClaw — Job Application Assistant

A polished Chrome extension for job seekers. Auto-fill applications, track your job hunt, and reuse cover letter snippets — all stored locally, no account needed.

---

## ✨ Features

### ⚡ Auto-Fill
- Detects form fields on popular job sites (LinkedIn Easy Apply, Indeed, Glassdoor, Lever, Greenhouse, Workday, Jobvite, SmartRecruiters, Ashby)
- Fills: name, email, phone, LinkedIn, GitHub, portfolio, location, summary
- Smart field detection: by input type, label text, placeholder, name attribute, and aria-label
- Won't overwrite fields that already have values
- Purple highlight animation shows which fields were filled
- In-page toast notification confirms how many fields were filled

### 📋 Job Tracker
- Add jobs manually or save with one click while browsing
- Statuses: Saved → Applied → Interview → Offer / Rejected
- Quick-change status inline from the tracker list
- Stats dashboard: counts by status at a glance
- Search and filter by status
- Notes field for salary info, contacts, deadlines
- Badge on extension icon shows count of active applications (Applied + Interview)

### 📝 Cover Letter Snippets
- Store reusable paragraphs: opening lines, skill summaries, closers
- Tag snippets (Intro, Skills, Closing, etc.) and filter by tag
- **Insert** directly into focused text fields on any page
- **Copy** to clipboard with one click
- Ships with 3 example snippets to get started

### 👤 Profile
- Full name, email, phone, location
- LinkedIn, GitHub, portfolio website, Twitter/X
- Job title, years of experience, key skills
- Professional summary (used for cover letter / bio fields)
- Profile completeness progress bar
- Export all data as JSON
- Clear all data option

---

## 🚀 How to Install (Developer Mode)

Chrome hasn't approved this extension yet — install as an unpacked extension:

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `job-seeker-extension/` folder
5. The 🦞 JobClaw icon will appear in your toolbar

> **Tip:** Pin it by clicking the puzzle piece icon and pinning JobClaw.

---

## 🎯 How to Use

### First Time Setup
1. Click the JobClaw icon → go to **Profile** tab
2. Fill in your info (at minimum: name, email, phone, LinkedIn)
3. Click **Save Profile**

### Auto-Filling an Application
1. Navigate to a job application page (LinkedIn Easy Apply, Greenhouse form, etc.)
2. Click the JobClaw icon
3. Click **Detect Fields** to preview what fields were found
4. Click **Fill Now** to populate them
5. Review and submit as normal

### Saving a Job
**From the Autofill tab:** Fill in the job title/company at the bottom and click Save Job.

**From the Tracker tab:** Click **+ Add Job** and fill in the form.

**From the context menu:** Right-click anywhere on a job listing page → "🦞 Save this job to JobClaw"

### Using Snippets
1. Go to **Snippets** tab and add your reusable paragraphs
2. On a job application page, click into a cover letter text field
3. Come back to JobClaw → Snippets → click **Insert** on the snippet you want
4. Or click **Copy** and paste manually

---

## 🗂️ File Structure

```
job-seeker-extension/
├── manifest.json      — Chrome Manifest V3 config
├── popup.html         — Extension popup UI
├── popup.js           — Popup logic (tabs, storage, UI)
├── content.js         — Page-injected script (detect & fill)
├── background.js      — Service worker (badge, context menus)
├── styles.css         — Dark mode UI styles
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 🔒 Privacy

**100% local.** All your data (profile, jobs, snippets) is stored in `chrome.storage.local` on your own machine. Nothing is sent to any server. No analytics, no tracking, no account required.

---

## 💡 Monetization Ideas

If you want to build this into a real product:

### Free / Freemium
| Feature | Free | Pro |
|---------|------|-----|
| Autofill | ✅ | ✅ |
| Job tracker (up to 25 jobs) | ✅ | ✅ |
| Snippets (up to 5) | ✅ | ✅ |
| Unlimited jobs & snippets | — | ✅ |
| Cloud sync across browsers | — | ✅ |
| AI cover letter generation | — | ✅ |
| Export to CSV / Notion | — | ✅ |
| Interview prep notes | — | ✅ |

**Price suggestion:** $4.99/month or $39/year

### Additional Revenue Streams
- **One-time lifetime deal** on AppSumo ($49–$79)
- **Resume review affiliate links** (Resume.io, Kickresume)
- **Job board affiliate programs** (LinkedIn, Indeed, ZipRecruiter all have them)
- **AI integration** — OpenAI API-powered cover letter drafts per-use ($0.50/generation)
- **Chrome Web Store** listing builds organic discovery (free listing)

### Growth Tactics
- ProductHunt launch (works well for dev tools)
- r/cscareerquestions, r/jobsearchhacks, r/learnprogramming
- YouTube "job hunting tools" videos
- TikTok / Instagram reels showing the autofill in action

---

## 🛠️ Supported Job Sites

| Site | Autofill | Context Menu |
|------|----------|--------------|
| LinkedIn Easy Apply | ✅ | ✅ |
| Indeed | ✅ | ✅ |
| Glassdoor | ✅ | ✅ |
| Lever | ✅ | ✅ |
| Greenhouse | ✅ | ✅ |
| Workday | ✅ | ✅ |
| Jobvite | ✅ | ✅ |
| SmartRecruiters | ✅ | ✅ |
| Ashby | ✅ | ✅ |

---

## 🔧 Development Notes

- Built with **Chrome Manifest V3** (latest standard, required for new submissions)
- Uses `chrome.scripting.executeScript` for content injection (MV3 pattern)
- Badge count updates via `chrome.storage.onChanged` listener
- Context menus registered on install/startup
- Field detection uses multi-strategy matching (type → id → name → placeholder → label → aria-label)
- React/Vue/Angular compatibility: uses `Object.getOwnPropertyDescriptor` native setter + dispatches `input`/`change`/`keyup` events

---

*Built with ❤️ by JobClaw v1.0.0*
