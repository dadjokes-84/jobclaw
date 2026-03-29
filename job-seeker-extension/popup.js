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

  initResumeUpload();
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

// ─── RESUME UPLOAD & PARSING ──────────────────────────────────────────────────

let parsedResumeFields = {};

function initResumeUpload() {
  const dropZone  = document.getElementById('resume-drop-zone');
  const fileInput = document.getElementById('resume-file-input');

  // Click to browse
  dropZone.addEventListener('click', () => fileInput.click());

  // File selected via input
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleResumeFile(e.target.files[0]);
    fileInput.value = ''; // reset so same file can be re-uploaded
  });

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleResumeFile(file);
  });

  // Apply / discard buttons
  document.getElementById('btn-resume-apply').addEventListener('click', applyResumeFields);
  document.getElementById('btn-resume-discard').addEventListener('click', clearResumePreview);
  document.getElementById('btn-resume-clear').addEventListener('click', clearResumePreview);
}

async function handleResumeFile(file) {
  const name = file.name.toLowerCase();
  setResumeStatus('⏳ Parsing resume…', 'info');
  showResumeDropZone(false);

  try {
    let text = '';
    if (name.endsWith('.pdf')) {
      text = await extractTextFromPDF(file);
    } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
      text = await extractTextFromDOCX(file);
    } else if (name.endsWith('.txt')) {
      text = await file.text();
    } else {
      throw new Error('Unsupported file type. Please use PDF, DOCX, or TXT.');
    }

    if (!text || text.trim().length < 20) {
      throw new Error('Could not extract text from this file. Try a different format.');
    }

    parsedResumeFields = parseResumeText(text);
    const fieldCount = Object.keys(parsedResumeFields).length;

    if (fieldCount === 0) {
      throw new Error('No recognizable fields found. Try a plain-text or simpler PDF.');
    }

    setResumeStatus('', '');
    showResumePreview(parsedResumeFields);
  } catch (err) {
    setResumeStatus(`❌ ${err.message}`, 'error');
    showResumeDropZone(true);
  }
}

// ── PDF extraction via pdf.js ─────────────────────────────────────────────────
async function extractTextFromPDF(file) {
  // pdf.js must be loaded; use global pdfjsLib
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('PDF parser not loaded. Check your internet connection.');
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

// ── DOCX extraction via raw XML ───────────────────────────────────────────────
async function extractTextFromDOCX(file) {
  // DOCX is a ZIP. We need JSZip or we do a simple regex pass on the raw bytes.
  // Fallback: try to read the word/document.xml directly using a lightweight approach.
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Convert to binary string and look for XML text content
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  // Try to find word/document.xml content between XML tags
  // This works for uncompressed/stored entries in some DOCX files,
  // but for proper deflate-compressed DOCX we need a real unzip.
  // Use DecompressionStream if available (Chrome 80+).
  try {
    const text = await unzipDocx(arrayBuffer);
    if (text && text.length > 10) return text;
  } catch (_) { /* fallthrough */ }

  // Last resort: scrape visible ASCII text from binary
  const ascii = binary.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n');
  return ascii;
}

async function unzipDocx(arrayBuffer) {
  // Locate the Local File Header signature (PK\x03\x04) for word/document.xml
  const data = new Uint8Array(arrayBuffer);
  const targetPath = 'word/document.xml';
  const pathBytes  = new TextEncoder().encode(targetPath);

  let offset = 0;
  while (offset < data.length - 30) {
    // Local file header signature
    if (data[offset]===0x50 && data[offset+1]===0x4B &&
        data[offset+2]===0x03 && data[offset+3]===0x04) {

      const compression  = data[offset+8]  | (data[offset+9]  << 8);
      const compSize     = data[offset+18] | (data[offset+19] << 8) |
                          (data[offset+20] << 16) | (data[offset+21] << 24);
      const fnLen        = data[offset+26] | (data[offset+27] << 8);
      const extraLen     = data[offset+28] | (data[offset+29] << 8);
      const fnStart      = offset + 30;
      const fnBytes      = data.slice(fnStart, fnStart + fnLen);
      const fileName     = new TextDecoder().decode(fnBytes);
      const dataStart    = fnStart + fnLen + extraLen;

      if (fileName === targetPath) {
        const compData = data.slice(dataStart, dataStart + compSize);

        let xmlBytes;
        if (compression === 0) {
          // Stored (uncompressed)
          xmlBytes = compData;
        } else if (compression === 8 && typeof DecompressionStream !== 'undefined') {
          // Deflate — add raw deflate wrapper
          const ds     = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          const reader = ds.readable.getReader();
          writer.write(compData);
          writer.close();

          const chunks = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          const totalLen = chunks.reduce((s, c) => s + c.length, 0);
          xmlBytes = new Uint8Array(totalLen);
          let pos = 0;
          for (const chunk of chunks) {
            xmlBytes.set(chunk, pos);
            pos += chunk.length;
          }
        } else {
          throw new Error('Unsupported compression');
        }

        const xml = new TextDecoder().decode(xmlBytes);
        // Strip XML tags, keep text
        return xml.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, '\n').trim();
      }

      offset = dataStart + compSize;
    } else {
      offset++;
    }
  }
  throw new Error('word/document.xml not found');
}

// ── Resume text parser ────────────────────────────────────────────────────────
function parseResumeText(text) {
  const fields = {};
  const lines  = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  // ── Email ──────────────────────────────────────────────────────────────────
  const emailMatch = text.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/);
  if (emailMatch) fields.email = emailMatch[0];

  // ── Phone ──────────────────────────────────────────────────────────────────
  const phoneMatch = text.match(
    /(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/
  );
  if (phoneMatch) fields.phone = phoneMatch[0].replace(/\s+/g, ' ').trim();

  // ── LinkedIn ───────────────────────────────────────────────────────────────
  const linkedinMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_]+\/?/i
  );
  if (linkedinMatch) {
    fields.linkedin = linkedinMatch[0].startsWith('http')
      ? linkedinMatch[0]
      : 'https://' + linkedinMatch[0];
  }

  // ── GitHub ─────────────────────────────────────────────────────────────────
  const githubMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9\-_]+\/?/i
  );
  if (githubMatch) {
    fields.github = githubMatch[0].startsWith('http')
      ? githubMatch[0]
      : 'https://' + githubMatch[0];
  }

  // ── Portfolio / Website ────────────────────────────────────────────────────
  const websiteMatch = text.match(
    /https?:\/\/(?!(?:www\.)?(?:linkedin|github|twitter|x)\.com)[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?\b/i
  );
  if (websiteMatch) fields.website = websiteMatch[0];

  // ── Twitter / X ────────────────────────────────────────────────────────────
  const twitterMatch = text.match(
    /(?:twitter\.com\/|x\.com\/)(@?[a-zA-Z0-9_]+)|@([a-zA-Z0-9_]{2,})/i
  );
  if (twitterMatch) {
    const handle = twitterMatch[1] || twitterMatch[2];
    if (handle) fields.twitter = handle.startsWith('@') ? handle : '@' + handle;
  }

  // ── Name (first line that looks like a name, before contact details) ───────
  for (const line of lines.slice(0, 6)) {
    // Skip lines with email/phone/URL
    if (/[@()\d\/]/.test(line)) continue;
    // Skip common resume headers
    if (/^(resume|curriculum|vitae|objective|summary|experience|education|skills|contact)/i.test(line)) continue;
    // Name: 2-4 words, each capitalized, reasonable length
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 5 &&
        words.every(w => /^[A-Z][a-zA-Z'\-\.]+$/.test(w)) &&
        line.length < 60) {
      fields.name = line;
      break;
    }
  }

  // ── Location ───────────────────────────────────────────────────────────────
  // Pattern: City, ST or City, State
  const locationMatch = text.match(
    /\b([A-Z][a-zA-Z\s]+),\s*([A-Z]{2}|Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming|Remote)\b/
  );
  if (locationMatch) fields.location = locationMatch[0].trim();

  // ── Job Title ──────────────────────────────────────────────────────────────
  const titleKeywords = [
    'engineer','developer','designer','manager','analyst','scientist','architect',
    'lead','senior','junior','director','coordinator','specialist','consultant',
    'administrator','officer','executive','intern','associate','principal'
  ];
  const titlePattern = new RegExp(
    `\\b(?:${titleKeywords.join('|')})\\b`,
    'i'
  );
  for (const line of lines.slice(0, 15)) {
    if (titlePattern.test(line) && line.length < 80 &&
        !/@/.test(line) && !/\d{4}/.test(line)) {
      fields.title = line;
      break;
    }
  }

  // ── Skills ─────────────────────────────────────────────────────────────────
  // Find a skills section and extract comma/bullet-separated items
  const skillSectionIdx = lines.findIndex(l =>
    /^(skills|technical skills|core competencies|technologies|tools|stack)/i.test(l)
  );

  if (skillSectionIdx !== -1) {
    const skillLines = lines.slice(skillSectionIdx + 1, skillSectionIdx + 8);
    const raw = skillLines.join(' ');
    // Extract items separated by commas, pipes, bullets, semicolons
    const items = raw
      .split(/[,|•·;\/]/)
      .map(s => s.replace(/^[-–•\s*]+/, '').trim())
      .filter(s => s.length > 1 && s.length < 40 && !/^(and|the|or|with|in|to|for)$/i.test(s));
    if (items.length > 0) {
      fields.skills = items.slice(0, 20).join(', ');
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const summaryIdx = lines.findIndex(l =>
    /^(summary|professional summary|objective|about|profile)/i.test(l)
  );
  if (summaryIdx !== -1) {
    const summaryLines = [];
    for (let i = summaryIdx + 1; i < Math.min(summaryIdx + 8, lines.length); i++) {
      const line = lines[i];
      // Stop at next section header (all caps or known header keywords)
      if (/^(experience|education|skills|projects|certifications|awards|references)/i.test(line)) break;
      if (line.toUpperCase() === line && line.length > 4) break;
      summaryLines.push(line);
    }
    if (summaryLines.length > 0) {
      fields.summary = summaryLines.join(' ').slice(0, 500);
    }
  }

  // ── Years of Experience ────────────────────────────────────────────────────
  const expMatch = text.match(/(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|exp)/i);
  if (expMatch) fields.experience = expMatch[1];

  return fields;
}

// ── Resume preview UI ─────────────────────────────────────────────────────────
const FIELD_LABELS = {
  name:       'Name',
  email:      'Email',
  phone:      'Phone',
  location:   'Location',
  linkedin:   'LinkedIn',
  github:     'GitHub',
  website:    'Website',
  twitter:    'Twitter/X',
  title:      'Job Title',
  experience: 'Yrs Exp',
  skills:     'Skills',
  summary:    'Summary',
};

function showResumePreview(fields) {
  const preview  = document.getElementById('resume-preview');
  const listEl   = document.getElementById('resume-fields-list');

  listEl.innerHTML = '';

  Object.entries(fields).forEach(([key, val]) => {
    if (!val) return;
    const label = FIELD_LABELS[key] || key;
    const row   = document.createElement('div');
    row.className = 'resume-field-row';
    row.innerHTML = `
      <input type="checkbox" class="resume-field-check" data-key="${escHtml(key)}" checked>
      <span class="resume-field-key">${escHtml(label)}</span>
      <span class="resume-field-val">${escHtml(String(val))}</span>
    `;
    listEl.appendChild(row);
  });

  preview.classList.remove('hidden');
}

function setResumeStatus(msg, type) {
  const el = document.getElementById('resume-parse-status');
  if (!msg) { el.classList.add('hidden'); return; }
  el.className = `status-banner ${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showResumeDropZone(show) {
  document.getElementById('resume-drop-zone').classList.toggle('hidden', !show);
}

function clearResumePreview() {
  parsedResumeFields = {};
  document.getElementById('resume-preview').classList.add('hidden');
  setResumeStatus('', '');
  showResumeDropZone(true);
}

function applyResumeFields() {
  const checks = document.querySelectorAll('.resume-field-check');
  let applied  = 0;

  checks.forEach(cb => {
    if (!cb.checked) return;
    const key = cb.dataset.key;
    const val = parsedResumeFields[key];
    if (!val) return;

    const el = document.getElementById(`profile-${key}`);
    if (el) {
      el.value = val;
      applied++;
    }
  });

  updateProfileCompletion();
  clearResumePreview();
  showToast(`✅ Applied ${applied} field${applied !== 1 ? 's' : ''} to your profile!`, 'success');
}
