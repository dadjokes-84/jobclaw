// ===== JOBCLAW SERVICE WORKER =====
// Handles background tasks: badge updates, context menus, message routing

'use strict';

// ─── Install / Startup ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Set initial badge
    await updateBadge();

    // Open popup on first install to guide user
    chrome.tabs.create({ url: 'https://www.google.com' });
  }
  if (details.reason === 'update') {
    await updateBadge();
  }
  setupContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  await updateBadge();
  setupContextMenus();
});

// ─── Badge Updater ────────────────────────────────────────────────────────────
async function updateBadge() {
  const data = await chrome.storage.local.get('jobs');
  const jobs = data.jobs || [];
  const active = jobs.filter(j => j.status === 'applied' || j.status === 'interview').length;

  await chrome.action.setBadgeText({ text: active > 0 ? String(active) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#6c63ff' });
}

// ─── Context Menus ────────────────────────────────────────────────────────────
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'jobclaw-save-job',
      title: '🦞 Save this job to JobClaw',
      contexts: ['page', 'link'],
      documentUrlPatterns: [
        'https://www.linkedin.com/*',
        'https://www.indeed.com/*',
        'https://www.glassdoor.com/*',
        'https://*.lever.co/*',
        'https://boards.greenhouse.io/*',
        'https://*.greenhouse.io/*',
        'https://*.workday.com/*',
        'https://*.jobvite.com/*',
        'https://*.smartrecruiters.com/*',
        'https://*.ashbyhq.com/*'
      ]
    });

    chrome.contextMenus.create({
      id: 'jobclaw-autofill',
      title: '⚡ JobClaw: Fill this form',
      contexts: ['editable'],
      documentUrlPatterns: [
        'https://www.linkedin.com/*',
        'https://www.indeed.com/*',
        'https://www.glassdoor.com/*',
        'https://*.lever.co/*',
        'https://boards.greenhouse.io/*',
        'https://*.greenhouse.io/*',
        'https://*.workday.com/*',
        'https://*.jobvite.com/*',
        'https://*.smartrecruiters.com/*',
        'https://*.ashbyhq.com/*'
      ]
    });
  });
}

// ─── Context Menu Handler ─────────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'jobclaw-save-job') {
    // Quick save current page as "applied"
    const data = await chrome.storage.local.get('jobs');
    const jobs = data.jobs || [];

    const newJob = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      title: tab.title?.replace(/\s*[\|—–-].*$/, '').trim() || 'Job Listing',
      company: extractCompany(tab.url, tab.title),
      status: 'applied',
      url: info.linkUrl || tab.url,
      notes: '',
      createdAt: Date.now()
    };

    jobs.unshift(newJob);
    await chrome.storage.local.set({ jobs });
    await updateBadge();

    // Notify user via the content script
    chrome.tabs.sendMessage(tab.id, {
      type: 'JOBCLAW_SAVED',
      job: newJob
    }).catch(() => {}); // ignore if content script not loaded
  }

  if (info.menuItemId === 'jobclaw-autofill') {
    const profileData = await chrome.storage.local.get('profile');
    const profile = profileData.profile || {};

    if (!profile.name && !profile.email) {
      chrome.tabs.sendMessage(tab.id, { type: 'JOBCLAW_NO_PROFILE' }).catch(() => {});
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (profileData) => window.__jobclawFill && window.__jobclawFill(profileData),
      args: [profile]
    }).catch(() => {});
  }
});

// ─── Message Handler (from content scripts / popup) ───────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_BADGE') {
    updateBadge().then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async
  }

  if (message.type === 'GET_JOB_COUNT') {
    chrome.storage.local.get('jobs').then(data => {
      const jobs = data.jobs || [];
      const active = jobs.filter(j => j.status === 'applied' || j.status === 'interview').length;
      sendResponse({ count: active, total: jobs.length });
    });
    return true;
  }
});

// ─── Storage Change Listener ──────────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.jobs) updateBadge();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractCompany(url, title) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    // Common job boards — don't use hostname as company
    const jobBoards = ['linkedin.com','indeed.com','glassdoor.com','lever.co','greenhouse.io',
                       'workday.com','jobvite.com','smartrecruiters.com','ashbyhq.com'];
    if (jobBoards.some(b => hostname.includes(b))) {
      // Try to extract from title: "Job Title at Company | Board"
      const atMatch = title?.match(/\bat\s+([^|—–\n]+)/i);
      if (atMatch) return atMatch[1].trim();
      return 'Unknown Company';
    }
    return hostname;
  } catch {
    return 'Unknown Company';
  }
}
