// ===== JOBCLAW CONTENT SCRIPT =====
// Injected into job sites to detect and fill application form fields

'use strict';

// ─── Field Detection Map ──────────────────────────────────────────────────────
// Maps profile keys → arrays of selector strategies (label text / name / id / placeholder patterns)
const FIELD_MAP = {
  name: {
    label: 'name',
    label_full: 'full name',
    placeholders: ['full name', 'your name'],
    names: ['name', 'fullname', 'full_name', 'applicant_name', 'candidate_name'],
    ids: ['name', 'fullName', 'full-name', 'applicantName']
  },
  firstName: {
    label: 'first name',
    placeholders: ['first name', 'first'],
    names: ['first_name', 'firstname', 'first-name', 'fname'],
    ids: ['firstName', 'first_name', 'first-name', 'fname']
  },
  lastName: {
    label: 'last name',
    placeholders: ['last name', 'last', 'surname'],
    names: ['last_name', 'lastname', 'last-name', 'lname', 'surname'],
    ids: ['lastName', 'last_name', 'last-name', 'lname']
  },
  email: {
    label: 'email',
    placeholders: ['email', 'e-mail', 'your email'],
    names: ['email', 'email_address', 'emailAddress'],
    ids: ['email', 'emailAddress', 'email-address'],
    type: 'email'
  },
  phone: {
    label: 'phone',
    label_full: 'phone number',
    placeholders: ['phone', 'phone number', 'mobile', 'cell'],
    names: ['phone', 'phone_number', 'phoneNumber', 'mobile', 'cell'],
    ids: ['phone', 'phoneNumber', 'phone-number', 'mobile'],
    type: 'tel'
  },
  linkedin: {
    label: 'linkedin',
    placeholders: ['linkedin', 'linkedin url', 'linkedin profile'],
    names: ['linkedin', 'linkedin_url', 'linkedinUrl'],
    ids: ['linkedin', 'linkedinUrl', 'linkedin-url']
  },
  github: {
    label: 'github',
    placeholders: ['github', 'github url', 'github profile'],
    names: ['github', 'github_url', 'githubUrl'],
    ids: ['github', 'githubUrl', 'github-url']
  },
  website: {
    label: 'website',
    label_full: 'portfolio',
    placeholders: ['website', 'portfolio', 'personal website', 'personal site'],
    names: ['website', 'portfolio', 'personal_website', 'websiteUrl'],
    ids: ['website', 'portfolio', 'websiteUrl', 'personal-website']
  },
  location: {
    label: 'location',
    label_full: 'city',
    placeholders: ['city', 'location', 'city, state', 'where do you live'],
    names: ['location', 'city', 'address', 'city_state'],
    ids: ['location', 'city', 'address']
  },
  summary: {
    label: 'cover letter',
    label_full: 'summary',
    placeholders: ['cover letter', 'tell us about yourself', 'introduction', 'summary'],
    names: ['cover_letter', 'coverLetter', 'summary', 'message', 'bio'],
    ids: ['coverLetter', 'cover-letter', 'summary', 'bio'],
    tag: 'textarea'
  }
};

// ─── Expose functions to extension ───────────────────────────────────────────
window.__jobclawDetect = detectFields;
window.__jobclawFill   = fillFields;

// ─── Field Detection ──────────────────────────────────────────────────────────
function detectFields() {
  const detected = [];

  for (const [key, config] of Object.entries(FIELD_MAP)) {
    const el = findField(config);
    if (el) detected.push(friendlyName(key));
  }

  return detected;
}

// ─── Fill Fields ──────────────────────────────────────────────────────────────
function fillFields(profile) {
  if (!profile) return;

  // Derived values
  const nameParts = (profile.name || '').trim().split(/\s+/);
  const derived = {
    ...profile,
    firstName: profile.firstName || nameParts[0] || '',
    lastName:  profile.lastName  || nameParts.slice(1).join(' ') || ''
  };

  let filled = 0;

  for (const [key, config] of Object.entries(FIELD_MAP)) {
    const value = derived[key];
    if (!value) continue;

    const el = findField(config);
    if (!el) continue;

    const current = el.value || el.textContent || '';
    if (current.trim()) continue; // Don't overwrite existing values

    setFieldValue(el, value);
    highlightField(el);
    filled++;
  }

  // Show fill notification
  if (filled > 0) showFillBanner(filled);

  return filled;
}

// ─── Field Finder ─────────────────────────────────────────────────────────────
function findField(config) {
  const tag = config.tag || 'input';

  // 1. By input type (email, tel)
  if (config.type) {
    const el = document.querySelector(`input[type="${config.type}"]`);
    if (el && isVisible(el)) return el;
  }

  // 2. By id
  for (const id of (config.ids || [])) {
    const el = document.getElementById(id) ||
               document.querySelector(`[id*="${id}" i]`);
    if (el && isVisible(el)) return el;
  }

  // 3. By name attribute
  for (const name of (config.names || [])) {
    const el = document.querySelector(`[name="${name}"]`) ||
               document.querySelector(`[name*="${name}" i]`);
    if (el && isVisible(el)) return el;
  }

  // 4. By placeholder
  for (const ph of (config.placeholders || [])) {
    const el = document.querySelector(`${tag}[placeholder*="${ph}" i]`) ||
               document.querySelector(`input[placeholder*="${ph}" i]`);
    if (el && isVisible(el)) return el;
  }

  // 5. By associated label text
  const labelTexts = [config.label, config.label_full].filter(Boolean);
  for (const labelText of labelTexts) {
    const labels = document.querySelectorAll('label');
    for (const label of labels) {
      if (label.textContent.toLowerCase().includes(labelText.toLowerCase())) {
        // Try for= attribute
        if (label.htmlFor) {
          const el = document.getElementById(label.htmlFor);
          if (el && isVisible(el)) return el;
        }
        // Try next sibling or child
        const el = label.querySelector('input, textarea') ||
                   label.nextElementSibling;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && isVisible(el)) {
          return el;
        }
        // Try parent's input
        const parentEl = label.closest('.form-field, .field, .form-group, [class*="field"], [class*="input"]');
        if (parentEl) {
          const child = parentEl.querySelector('input, textarea');
          if (child && isVisible(child)) return child;
        }
      }
    }
  }

  // 6. Aria-label
  for (const labelText of labelTexts) {
    const el = document.querySelector(`[aria-label*="${labelText}" i]`);
    if (el && isVisible(el)) return el;
  }

  return null;
}

// ─── Set Field Value ──────────────────────────────────────────────────────────
function setFieldValue(el, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (el.tagName === 'TEXTAREA' && nativeTextareaSetter) {
    nativeTextareaSetter.call(el, value);
  } else if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }

  // Trigger React/Vue/Angular change events
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

// ─── Highlight Filled Field ───────────────────────────────────────────────────
function highlightField(el) {
  el.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
  el.style.boxShadow  = '0 0 0 2px rgba(108, 99, 255, 0.5)';
  el.style.borderColor = '#6c63ff';
  setTimeout(() => {
    el.style.boxShadow  = '';
    el.style.borderColor = '';
  }, 2000);
}

// ─── Fill Banner ──────────────────────────────────────────────────────────────
function showFillBanner(count) {
  // Remove existing banner if any
  const existing = document.getElementById('__jobclaw_banner__');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = '__jobclaw_banner__';
  banner.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 999999;
    background: #1e2130;
    color: #e8eaf0;
    border: 1px solid #6c63ff;
    border-radius: 10px;
    padding: 12px 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 300px;
    animation: __jc_slide_in 0.3s ease;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes __jc_slide_in {
      from { opacity: 0; transform: translateX(20px); }
      to   { opacity: 1; transform: translateX(0); }
    }
  `;
  document.head.appendChild(style);

  banner.innerHTML = `
    <span style="font-size:18px">⚡</span>
    <span>JobClaw filled <strong>${count}</strong> field${count > 1 ? 's' : ''}!</span>
    <button onclick="this.parentElement.remove()" style="
      margin-left:auto; background:none; border:none; color:#8b90a7;
      cursor:pointer; font-size:16px; padding:0 4px; line-height:1;
    ">×</button>
  `;

  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 4000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function friendlyName(key) {
  const names = {
    name:      'Full Name',
    firstName: 'First Name',
    lastName:  'Last Name',
    email:     'Email',
    phone:     'Phone',
    linkedin:  'LinkedIn',
    github:    'GitHub',
    website:   'Website/Portfolio',
    location:  'Location',
    summary:   'Cover Letter/Summary'
  };
  return names[key] || key;
}

// ─── Site-Specific Helpers ────────────────────────────────────────────────────
// LinkedIn Easy Apply — handle their custom components
function handleLinkedIn(profile) {
  const inputs = document.querySelectorAll('.jobs-easy-apply-form-section input, .jobs-easy-apply-form-section textarea');
  inputs.forEach(input => {
    const label = input.closest('.fb-form-element')?.querySelector('label')?.textContent?.toLowerCase() || '';
    if (label.includes('phone') && profile.phone && !input.value) {
      setFieldValue(input, profile.phone);
      highlightField(input);
    }
  });
}
