// ===== JOBCLAW POPUP SCRIPT =====
// Handles all popup UI logic: profile, tracker, snippets, autofill

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let profile = {};
let jobs = [];
let snippets = [];
let editingJobId = null;
let editingSnippetId = null;
let currentFilter = 'all';
let currentSnipFilter = 'all';

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadAllData();
  initTabs();
  initAutofill();
  initTracker();
  initSnippets();
  initProfile();
  updateBadge();
});

async function loadAllData() {
  const data = await chrome.storage.local.get(['profile', 'jobs', 'snippets']);
  profile  = data.profile   || {};
  jobs     = data.jobs      || [];
  snippets = data.snippets  || getDefaultSnippets();
  if (!data.snippets) saveSnippets();
}

function getDefaultSnippets() {
  return [
    {
      id: uid(),
      title: 'Enthusiastic Opener',
      tag: 'Intro',
      content: "I'm excited to apply for this position. With my background in [field], I bring a passion for solving complex problems and building user-focused solutions.",
      createdAt: Date.now()
    },
    {
      id: uid(),
      title: 'Collaborative Team Player',
      tag: 'Skills',
      content: "I thrive in collaborative environments and have a proven track record of working cross-functionally to deliver projects on time and within scope.",
      createdAt: Date.now()
    },
    {
      id: uid(),
      title: 'Strong Closer',
      tag: 'Closing',
      content: "I'd love the opportunity to discuss how my skills align with your team's goals. Thank you for your time and consideration — I look forward to hearing from you.",
      createdAt: Date.now()
    }
  ];
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────
function initTabs() {
  const tabs    = document.querySelectorAll('.nav-tab');
  const panels  = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t  => t.classList.toggle('active', t.dataset.tab === target));
      panels.forEach(p => p.classList.toggle('active', p.id === `tab-${target}`));
      if (target === 'tracker') renderJobs();
      if (target === 'snippets') renderSnippets();
    });
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    // Jump to profile tab
    document.querySelector('[data-tab="profile"]').click();
  });

  document.getElementById('btn-go-profile').addEventListener('click', () => {
    document.querySelector('[data-tab="profile"]').click();
  });
}

// ─── AUTOFILL TAB ─────────────────────────────────────────────────────────────
function initAutofill() {
  checkProfileForAutofill();

  document.getElementById('btn-detect').addEventListener('click', detectFields);
  document.getElementById('btn-autofill').addEventListener('click', doAutofill);
  document.getElementById('btn-save-job-quick').addEventListener('click', saveQuickJob);

  // Pre-fill quick save with current page URL
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const url = tabs[0].url;
      const title = tabs[0].title || '';
      // Attempt to extract job title from page title
      const titleField = document.getElementById('quick-job-title');
      if (!titleField.value && title) {
        // Strip common suffixes like "| Company | LinkedIn"
        const cleaned = title.replace(/\s*[\|—–-].*$/, '').trim();
        if (cleaned.length < 80) titleField.value = cleaned;
      }
    }
  });
}

function checkProfileForAutofill() {
  const hasProfile = profile.name || profile.email;
  document.getElementById('autofill-no-profile').classList.toggle('hidden', !!hasProfile);
  document.getElementById('autofill-main').classList.toggle('hidden', !hasProfile);
}

async function detectFields() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return showStatus('No active tab found.', 'error');

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__jobclawDetect && window.__jobclawDetect()
    });
    const detected = results?.[0]?.result || [];
    renderDetectedFields(detected);
  } catch (e) {
    showStatus('⚠️ Cannot access this page (restricted URL).', 'warning');
  }
}

function renderDetectedFields(fields) {
  const section = document.getElementById('detected-fields-section');
  const list    = document.getElementById('detected-fields-list');

  if (!fields.length) {
    showStatus('No form fields detected on this page.', 'info');
    section.classList.add('hidden');
    return;
  }

  showStatus(`✅ Found ${fields.length} fillable field${fields.length > 1 ? 's' : ''}.`, 'success');
  section.classList.remove('hidden');
  list.innerHTML = fields.map(f =>
    `<span class="field-chip">✓ ${f}</span>`
  ).join('');
}

async function doAutofill() {
  if (!profile.name && !profile.email) {
    showStatus('Please set up your profile first.', 'warning');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (profileData) => window.__jobclawFill && window.__jobclawFill(profileData),
      args: [profile]
    });
    showStatus('⚡ Fields filled successfully!', 'success');
  } catch (e) {
    showStatus('⚠️ Unable to fill — try on a supported job site.', 'warning');
  }
}

function saveQuickJob() {
  const title   = document.getElementById('quick-job-title').value.trim();
  const company = document.getElementById('quick-job-company').value.trim();
  const status  = document.getElementById('quick-job-status').value;

  if (!title || !company) {
    showToast('Please enter a job title and company.', 'error');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    addJob({ title, company, status, url, notes: '' });
    document.getElementById('quick-job-title').value  = '';
    document.getElementById('quick-job-company').value = '';
    showToast(`✅ Saved "${title}" at ${company}`, 'success');
  });
}

function showStatus(msg, type = 'info') {
  const el = document.getElementById('autofill-status');
  el.className = `status-banner ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ─── JOB TRACKER ──────────────────────────────────────────────────────────────
function initTracker() {
  renderJobs();

  document.getElementById('btn-add-job').addEventListener('click', () => {
    toggleAddJobForm(true);
  });
  document.getElementById('btn-cancel-job').addEventListener('click', () => {
    toggleAddJobForm(false);
  });
  document.getElementById('btn-save-job').addEventListener('click', saveJobFromForm);
  document.getElementById('job-search').addEventListener('input', renderJobs);

  // Filter chips
  document.querySelectorAll('[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(c =>
        c.classList.toggle('active', c.dataset.filter === currentFilter)
      );
      renderJobs();
    });
  });
}

function toggleAddJobForm(show) {
  const form = document.getElementById('add-job-form');
  form.classList.toggle('hidden', !show);
  if (!show) {
    editingJobId = null;
    clearJobForm();
  }
}

function clearJobForm() {
  ['new-job-title','new-job-company','new-job-url','new-job-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('new-job-status').value = 'applied';
}

function saveJobFromForm() {
  const title   = document.getElementById('new-job-title').value.trim();
  const company = document.getElementById('new-job-company').value.trim();
  const status  = document.getElementById('new-job-status').value;
  const url     = document.getElementById('new-job-url').value.trim();
  const notes   = document.getElementById('new-job-notes').value.trim();

  if (!title || !company) {
    showToast('Title and company are required.', 'error');
    return;
  }

  if (editingJobId) {
    const job = jobs.find(j => j.id === editingJobId);
    if (job) Object.assign(job, { title, company, status, url, notes, updatedAt: Date.now() });
    editingJobId = null;
  } else {
    addJob({ title, company, status, url, notes });
  }

  toggleAddJobForm(false);
  renderJobs();
  updateBadge();
}

function addJob({ title, company, status, url, notes }) {
  const job = { id: uid(), title, company, status, url, notes, createdAt: Date.now() };
  jobs.unshift(job);
  saveJobs();
  renderJobs();
  updateBadge();
}

function deleteJob(id) {
  jobs = jobs.filter(j => j.id !== id);
  saveJobs();
  renderJobs();
  updateBadge();
  showToast('Job removed.', 'success');
}

function editJob(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;

  editingJobId = id;
  document.getElementById('new-job-title').value   = job.title;
  document.getElementById('new-job-company').value = job.company;
  document.getElementById('new-job-status').value  = job.status;
  document.getElementById('new-job-url').value     = job.url || '';
  document.getElementById('new-job-notes').value   = job.notes || '';
  toggleAddJobForm(true);
  document.getElementById('add-job-form').scrollIntoView({ behavior: 'smooth' });
}

function updateJobStatus(id, status) {
  const job = jobs.find(j => j.id === id);
  if (job) { job.status = status; job.updatedAt = Date.now(); saveJobs(); renderJobs(); updateBadge(); }
}

function renderJobs() {
  const searchTerm = document.getElementById('job-search').value.toLowerCase();

  // Stats
  const counts = { applied: 0, interview: 0, offer: 0, rejected: 0, saved: 0 };
  jobs.forEach(j => { if (counts[j.status] !== undefined) counts[j.status]++; });
  document.getElementById('stat-applied').textContent   = counts.applied;
  document.getElementById('stat-interview').textContent = counts.interview;
  document.getElementById('stat-offer').textContent     = counts.offer;
  document.getElementById('stat-rejected').textContent  = counts.rejected;

  let filtered = jobs.filter(j => {
    const matchFilter = currentFilter === 'all' || j.status === currentFilter;
    const matchSearch = !searchTerm ||
      j.title.toLowerCase().includes(searchTerm) ||
      j.company.toLowerCase().includes(searchTerm);
    return matchFilter && matchSearch;
  });

  const list  = document.getElementById('job-list');
  const empty = document.getElementById('jobs-empty');

  if (!filtered.length) {
    empty.classList.remove('hidden');
    // Remove existing job items
    list.querySelectorAll('.job-item').forEach(el => el.remove());
    return;
  }

  empty.classList.add('hidden');
  list.querySelectorAll('.job-item').forEach(el => el.remove());

  filtered.forEach(job => {
    const item = document.createElement('div');
    item.className = 'job-item';
    item.dataset.id = job.id;

    const statusEmoji = { saved:'💾', applied:'📨', interview:'💬', offer:'🎉', rejected:'❌' }[job.status] || '📋';
    const date = new Date(job.createdAt).toLocaleDateString('en-US', { month:'short', day:'numeric' });

    item.innerHTML = `
      <div class="job-item-header">
        <div>
          <div class="job-title">${escHtml(job.title)}</div>
          <div class="job-company">${escHtml(job.company)}</div>
          ${job.url ? `<a class="job-url" href="${escHtml(job.url)}" target="_blank" title="${escHtml(job.url)}">🔗 ${escHtml(shortUrl(job.url))}</a>` : ''}
        </div>
        <span class="badge badge-${job.status}">${statusEmoji} ${capitalize(job.status)}</span>
      </div>
      ${job.notes ? `<div class="notes-text">${escHtml(job.notes)}</div>` : ''}
      <div class="job-meta">
        <span class="job-date">Added ${date}</span>
        <div class="job-actions">
          <select class="status-quick-select" title="Change status" style="
            background:var(--bg-input); border:1px solid var(--border); color:var(--text-secondary);
            border-radius:var(--radius-sm); font-size:10px; padding:3px 4px; cursor:pointer;
          ">
            <option value="saved"     ${job.status==='saved'     ?'selected':''}>💾 Saved</option>
            <option value="applied"   ${job.status==='applied'   ?'selected':''}>📨 Applied</option>
            <option value="interview" ${job.status==='interview' ?'selected':''}>💬 Interview</option>
            <option value="offer"     ${job.status==='offer'     ?'selected':''}>🎉 Offer</option>
            <option value="rejected"  ${job.status==='rejected'  ?'selected':''}>❌ Rejected</option>
          </select>
          <button class="btn-icon btn-edit-job" title="Edit">✏️</button>
          <button class="btn-icon btn-delete-job" title="Delete">🗑️</button>
        </div>
      </div>
    `;

    item.querySelector('.status-quick-select').addEventListener('change', (e) => {
      updateJobStatus(job.id, e.target.value);
    });
    item.querySelector('.btn-edit-job').addEventListener('click', () => editJob(job.id));
    item.querySelector('.btn-delete-job').addEventListener('click', () => {
      if (confirm(`Remove "${job.title}" from tracker?`)) deleteJob(job.id);
    });

    list.insertBefore(item, empty);
  });
}

// ─── SNIPPETS ─────────────────────────────────────────────────────────────────
function initSnippets() {
  renderSnippets();

  document.getElementById('btn-add-snippet').addEventListener('click', () => {
    editingSnippetId = null;
    document.getElementById('snippet-form-title').textContent = 'New Snippet';
    document.getElementById('snippet-title-input').value   = '';
    document.getElementById('snippet-tag-input').value     = '';
    document.getElementById('snippet-content-input').value = '';
    toggleSnippetForm(true);
  });

  document.getElementById('btn-cancel-snippet').addEventListener('click', () => {
    toggleSnippetForm(false);
  });

  document.getElementById('btn-save-snippet').addEventListener('click', saveSnippetFromForm);
}

function toggleSnippetForm(show) {
  document.getElementById('snippet-form').classList.toggle('hidden', !show);
}

function saveSnippetFromForm() {
  const title   = document.getElementById('snippet-title-input').value.trim();
  const tag     = document.getElementById('snippet-tag-input').value.trim();
  const content = document.getElementById('snippet-content-input').value.trim();

  if (!title || !content) {
    showToast('Title and content are required.', 'error');
    return;
  }

  if (editingSnippetId) {
    const s = snippets.find(s => s.id === editingSnippetId);
    if (s) Object.assign(s, { title, tag, content, updatedAt: Date.now() });
    editingSnippetId = null;
  } else {
    snippets.unshift({ id: uid(), title, tag, content, createdAt: Date.now() });
  }

  saveSnippets();
  toggleSnippetForm(false);
  renderSnippets();
  showToast('Snippet saved!', 'success');
}

function deleteSnippet(id) {
  snippets = snippets.filter(s => s.id !== id);
  saveSnippets();
  renderSnippets();
  showToast('Snippet deleted.', 'success');
}

function editSnippet(id) {
  const s = snippets.find(s => s.id === id);
  if (!s) return;
  editingSnippetId = id;
  document.getElementById('snippet-form-title').textContent = 'Edit Snippet';
  document.getElementById('snippet-title-input').value   = s.title;
  document.getElementById('snippet-tag-input').value     = s.tag || '';
  document.getElementById('snippet-content-input').value = s.content;
  toggleSnippetForm(true);
  document.getElementById('snippet-form').scrollIntoView({ behavior: 'smooth' });
}

async function copySnippet(content) {
  try {
    await navigator.clipboard.writeText(content);
    showToast('📋 Copied to clipboard!', 'success');
  } catch {
    showToast('Could not copy.', 'error');
  }
}

async function insertSnippet(content) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        const el = document.activeElement;
        if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ||
            el.contentEditable === 'true')) {
          if (el.contentEditable === 'true') {
            document.execCommand('insertText', false, text);
          } else {
            const start = el.selectionStart;
            const end   = el.selectionEnd;
            const val   = el.value;
            el.value = val.slice(0, start) + text + val.slice(end);
            el.selectionStart = el.selectionEnd = start + text.length;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return true;
        }
        return false;
      },
      args: [content]
    });
    showToast('✍️ Snippet inserted!', 'success');
  } catch {
    await copySnippet(content);
  }
}

function renderSnippets() {
  const allTags = [...new Set(snippets.map(s => s.tag).filter(Boolean))];
  const filterRow = document.getElementById('snippet-filter-row');

  // Rebuild filter chips
  filterRow.innerHTML = `<button class="filter-chip ${currentSnipFilter==='all'?'active':''}" data-snip-filter="all">All</button>`;
  allTags.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = `filter-chip ${currentSnipFilter === tag ? 'active' : ''}`;
    btn.dataset.snipFilter = tag;
    btn.textContent = tag;
    filterRow.appendChild(btn);
  });

  filterRow.querySelectorAll('[data-snip-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      currentSnipFilter = chip.dataset.snipFilter;
      filterRow.querySelectorAll('[data-snip-filter]').forEach(c =>
        c.classList.toggle('active', c.dataset.snipFilter === currentSnipFilter)
      );
      renderSnippets();
    });
  });

  const list  = document.getElementById('snippets-list');
  const empty = document.getElementById('snippets-empty');

  const filtered = currentSnipFilter === 'all'
    ? snippets
    : snippets.filter(s => s.tag === currentSnipFilter);

  list.querySelectorAll('.snippet-item').forEach(el => el.remove());

  if (!filtered.length) {
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  filtered.forEach(s => {
    const item = document.createElement('div');
    item.className = 'snippet-item';

    item.innerHTML = `
      <div class="snippet-header">
        <span class="snippet-title">${escHtml(s.title)}</span>
        ${s.tag ? `<span class="snippet-tag">${escHtml(s.tag)}</span>` : ''}
      </div>
      <div class="snippet-preview">${escHtml(s.content)}</div>
      <div class="snippet-actions">
        <button class="btn btn-secondary btn-sm btn-insert" title="Insert into focused field">
          ✍️ Insert
        </button>
        <button class="btn btn-secondary btn-sm btn-copy" title="Copy to clipboard">
          📋 Copy
        </button>
        <button class="btn-icon btn-edit-snip" title="Edit">✏️</button>
        <button class="btn-icon btn-delete-snip" title="Delete" style="margin-left:auto">🗑️</button>
      </div>
    `;

    item.querySelector('.btn-insert').addEventListener('click', () => insertSnippet(s.content));
    item.querySelector('.btn-copy').addEventListener('click', () => copySnippet(s.content));
    item.querySelector('.btn-edit-snip').addEventListener('click', () => editSnippet(s.id));
    item.querySelector('.btn-delete-snip').addEventListener('click', () => {
      if (confirm(`Delete snippet "${s.title}"?`)) deleteSnippet(s.id);
    });

    list.insertBefore(item, empty);
  });
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────
function initProfile() {
  loadProfileIntoForm();
  updateProfileCompletion();

  const fields = ['name','email','phone','location','linkedin','github','website','twitter','title','experience','skills','summary'];
  fields.forEach(f => {
    document.getElementById(`profile-${f}`)?.addEventListener('input', updateProfileCompletion);
  });

  document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
  document.getElementById('btn-export-data').addEventListener('click', exportData);
  document.getElementById('btn-clear-data').addEventListener('click', clearData);
}

function loadProfileIntoForm() {
  const fields = ['name','email','phone','location','linkedin','github','website','twitter','title','experience','skills','summary'];
  fields.forEach(f => {
    const el = document.getElementById(`profile-${f}`);
    if (el) el.value = profile[f] || '';
  });
}

function updateProfileCompletion() {
  const fields = ['name','email','phone','location','linkedin','github','title','skills','summary'];
  let filled = 0;
  fields.forEach(f => {
    const el = document.getElementById(`profile-${f}`);
    if (el && el.value.trim()) filled++;
  });
  const pct = Math.round((filled / fields.length) * 100);
  document.getElementById('profile-percent').textContent = `${pct}%`;
  document.getElementById('profile-progress').style.width = `${pct}%`;
}

async function saveProfile() {
  const fields = ['name','email','phone','location','linkedin','github','website','twitter','title','experience','skills','summary'];
  fields.forEach(f => {
    const el = document.getElementById(`profile-${f}`);
    if (el) profile[f] = el.value.trim();
  });

  await chrome.storage.local.set({ profile });
  checkProfileForAutofill();
  showToast('✅ Profile saved!', 'success');
  updateProfileCompletion();
}

function exportData() {
  const data = JSON.stringify({ profile, jobs, snippets }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `jobclaw-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 Data exported!', 'success');
}

function clearData() {
  if (!confirm('⚠️ This will delete ALL your data (profile, jobs, snippets). Are you sure?')) return;
  chrome.storage.local.clear(() => {
    profile = {}; jobs = []; snippets = [];
    loadProfileIntoForm();
    renderJobs();
    renderSnippets();
    updateBadge();
    updateProfileCompletion();
    showToast('All data cleared.', 'error');
  });
}

// ─── BADGE ────────────────────────────────────────────────────────────────────
function updateBadge() {
  const active = jobs.filter(j => j.status === 'applied' || j.status === 'interview').length;
  chrome.action.setBadgeText({ text: active > 0 ? String(active) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#6c63ff' });
}

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────
function saveJobs()    { chrome.storage.local.set({ jobs }); }
function saveSnippets(){ chrome.storage.local.set({ snippets }); }

// ─── TOAST ────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname.length > 30 ? u.pathname.slice(0, 30) + '…' : u.pathname);
  } catch { return url.slice(0, 40); }
}
