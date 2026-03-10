/* ══════════════════════════════════════
   SkinCalm – app.js
   Full app logic: Calendar, Logbook,
   Log Entry Modal, Triggers, Photos
   ══════════════════════════════════════ */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let entries = {};          // keyed by "YYYY-MM-DD"
let settings = {
  reminderTime: '21:00',
  notifGranted: false,
};

let viewDate = new Date();    // currently displayed month
let modalDate = null;         // date currently being edited
let pendingPhotos = [];       // base64 strings staged in modal

// ─── Storage ──────────────────────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem('skincalm-entries', JSON.stringify(entries));
    localStorage.setItem('skincalm-settings', JSON.stringify(settings));
  } catch (e) {
    // Storage full (photos) – warn the user
    showToast('⚠️ Storage nearly full. Consider exporting data.');
  }
}

function load() {
  try {
    const e = localStorage.getItem('skincalm-entries');
    const s = localStorage.getItem('skincalm-settings');
    if (e) entries = JSON.parse(e);
    if (s) settings = { ...settings, ...JSON.parse(s) };
  } catch (e) { console.error('Load failed', e); }
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────
function todayKey() {
  const d = new Date();
  return isoKey(d);
}

function isoKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function readableDate(key) {
  return keyToDate(key).toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function shortDate(key) {
  return keyToDate(key).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

// ─── Calendar Rendering ───────────────────────────────────────────────────────
function renderCalendar() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const today = todayKey();

  // Month label
  document.getElementById('month-label').textContent =
    new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const firstDay = new Date(year, month, 1).getDay();  // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  // Leading blanks (prev month)
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = newDayCell(daysInPrev - i, null, true);
    grid.appendChild(d);
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${pad(month + 1)}-${pad(day)}`;
    const entry = entries[key];
    const isToday = key === today;

    const cell = document.createElement('button');
    cell.className = 'cal-day';
    cell.textContent = day;
    cell.setAttribute('aria-label', `${day} ${new Date(year, month, day).toLocaleString('en-US', { month: 'long' })}`);

    if (isToday) cell.classList.add('today');

    if (entry) {
      // Flare colour
      if (entry.flare && entry.flare !== 'none') {
        cell.classList.add(`flare-${entry.flare}`);
      } else if (entry.flare === 'none') {
        cell.classList.add('status-none');
      }
      // Cream dot
      if (entry.creamApplied === 'yes') {
        const dot = document.createElement('span');
        dot.className = 'cream-dot';
        cell.appendChild(dot);
      }
    }

    cell.addEventListener('click', () => openModal(key));
    grid.appendChild(cell);
  }

  // Trailing blanks
  const totalCells = firstDay + daysInMonth;
  const trailingCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= trailingCount; i++) {
    grid.appendChild(newDayCell(i, null, true));
  }

  renderQuickStats(year, month);
}

function newDayCell(n, key, otherMonth) {
  const el = document.createElement('div');
  el.className = 'cal-day other-month';
  el.textContent = n;
  return el;
}

function renderQuickStats(year, month) {
  const statsEl = document.getElementById('quick-stats');
  statsEl.innerHTML = '';

  // Count entries for this month
  let flareDays = 0, creamDays = 0, clearDays = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${pad(month + 1)}-${pad(d)}`;
    const e = entries[key];
    if (!e) continue;
    if (e.flare && e.flare !== 'none') flareDays++;
    if (e.flare === 'none') clearDays++;
    if (e.creamApplied === 'yes') creamDays++;
  }

  const stats = [
    { val: flareDays, label: 'Flare days' },
    { val: creamDays, label: 'Cream apps' },
    { val: clearDays, label: 'Clear days' },
  ];

  stats.forEach(s => {
    const card = document.createElement('div');
    card.className = 'qs-card';
    card.innerHTML = `<div class="qs-val">${s.val}</div><div class="qs-label">${s.label}</div>`;
    statsEl.appendChild(card);
  });
}

// ─── Logbook Rendering ────────────────────────────────────────────────────────
function renderLogbook() {
  const list = document.getElementById('logbook-list');
  const empty = document.getElementById('logbook-empty');
  list.innerHTML = '';

  const keys = Object.keys(entries).sort((a, b) => b.localeCompare(a));

  if (keys.length === 0) {
    list.appendChild(empty);
    empty.classList.remove('hidden');
    return;
  }

  keys.forEach(key => {
    const entry = entries[key];
    const card = buildLogCard(key, entry);
    list.appendChild(card);
  });
}

function buildLogCard(key, entry) {
  const d = keyToDate(key);
  const day = d.getDate();
  const mon = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();

  const flareLabel = { none: '✨ Clear', mild: '🟡 Mild flare', moderate: '🟠 Moderate flare', severe: '🔴 Severe flare' };
  const flareTag = entry.flare ? (flareLabel[entry.flare] || '') : '';
  const tagClass = entry.flare ? `tag-${entry.flare}` : '';
  const creamLine = entry.creamName
    ? `<span class="log-cream-line">💊 <strong>${entry.creamName}</strong>${entry.taperPhase ? ' · ' + phaseLabel(entry.taperPhase) : ''}</span>`
    : (entry.taperPhase ? `<span class="log-cream-line">${phaseLabel(entry.taperPhase)}</span>` : '');

  const card = document.createElement('div');
  card.className = 'log-card';
  card.innerHTML = `
    <div class="log-card-top">
      <div class="log-date-badge">
        <div class="log-date-day">${day}</div>
        <div class="log-date-mon">${mon}</div>
      </div>
      <div class="log-card-info">
        ${flareTag ? `<div class="log-status-tag ${tagClass}">${flareTag}</div>` : ''}
        ${creamLine}
      </div>
    </div>
  `;

  // Symptoms
  if (entry.symptoms && entry.symptoms.length > 0) {
    const sym = document.createElement('div');
    sym.className = 'log-card-symptoms';
    entry.symptoms.forEach(s => {
      const chip = document.createElement('span');
      chip.className = 'sym-tag';
      chip.textContent = sympLabel(s);
      sym.appendChild(chip);
    });
    if (entry.itchLevel > 0) {
      const ic = document.createElement('span');
      ic.className = 'sym-tag';
      ic.textContent = `Itch ${entry.itchLevel}/10`;
      sym.appendChild(ic);
    }
    card.appendChild(sym);
  }

  // Trigger tags
  const triggerBits = [];
  if (entry.weather) triggerBits.push(weatherLabel(entry.weather));
  if (entry.stress > 0) triggerBits.push(`Stress ${entry.stress}/10`);
  if (entry.diet) triggerBits.push(dietLabel(entry.diet));
  if (entry.water) triggerBits.push(`💧 ${capitalize(entry.water)}`);
  if (entry.nailPolish) triggerBits.push('💅 Nail polish');
  if (entry.wetHands) triggerBits.push('🧼 Wet hands');
  if (entry.gloves) triggerBits.push('🧤 Gloves');

  if (triggerBits.length > 0) {
    const trig = document.createElement('div');
    trig.className = 'log-card-symptoms';
    triggerBits.forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'sym-tag';
      chip.style.background = 'var(--accent-bg)';
      chip.style.color = 'var(--accent)';
      chip.textContent = t;
      trig.appendChild(chip);
    });
    card.appendChild(trig);
  }

  // Photos
  if (entry.photos && entry.photos.length > 0) {
    const photoRow = document.createElement('div');
    photoRow.className = 'log-card-photos';
    entry.photos.forEach((src, i) => {
      const img = document.createElement('img');
      img.className = 'log-photo-thumb';
      img.src = src;
      img.alt = `Hand photo ${i + 1}`;
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        openLightbox(src, readableDate(key));
      });
      photoRow.appendChild(img);
    });
    card.appendChild(photoRow);
  }

  // Notes
  if (entry.notes && entry.notes.trim()) {
    const note = document.createElement('div');
    note.className = 'log-card-note';
    note.textContent = entry.notes;
    card.appendChild(note);
  }

  // Click to edit
  card.addEventListener('click', () => openModal(key));
  return card;
}

function phaseLabel(v) {
  const map = { daily: 'Daily', eod: 'Every other day', e3d: 'Every 3rd day', e2w: 'Twice a week', stopped: 'Stopped 🎉' };
  return map[v] || v;
}

function sympLabel(s) {
  const map = {
    blisters: '🔵 Fluid blisters',
    itching: '😣 Itchiness',
    inflammation: '🔴 Inflammation',
    dryness: '🏜️ Dry skin',
    cracks: '💔 Cracks & fissures',
    pain: '⚡ Pain / soreness',
    sweating: '💦 Excess sweating',
    nailchanges: '💅 Nail changes',
  };
  return map[s] || s;
}

function weatherLabel(v) {
  const map = {
    sunny: '☀️ Sunny', humid: '💧 Humid', hot: '🔆 Hot',
    dry: '🏜️ Dry', cold: '❄️ Cold', rainy: '🌧️ Rainy'
  };
  return map[v] || v;
}

function dietLabel(v) {
  const map = { healthy: '🥦 Healthy diet', mixed: '😐 Mixed diet', unhealthy: '🍟 Unhealthy diet' };
  return map[v] || v;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─── Log Modal ────────────────────────────────────────────────────────────────
function openModal(key) {
  modalDate = key;
  pendingPhotos = [];

  const entry = entries[key] || {};
  const isEdit = !!entries[key];

  // Title
  document.getElementById('log-modal-title').textContent =
    key === todayKey() ? 'Today – ' + shortDate(key) : readableDate(key);

  // Reset all form fields
  resetModal();

  // Populate existing entry
  if (isEdit) {
    setPill('flare-status-group', entry.flare);
    if (entry.symptoms) entry.symptoms.forEach(s => setChip(s));
    setPill('cream-applied-group', entry.creamApplied);
    document.getElementById('cream-name-input').value = entry.creamName || '';
    setPill('taper-phase-group', entry.taperPhase);
    setSlider('itch-slider', 'itch-val', entry.itchLevel || 0);
    setPill('weather-group', entry.weather);
    setSlider('stress-slider', 'stress-val', entry.stress || 0);
    setPill('diet-group', entry.diet);
    setPill('water-group', entry.water);
    document.getElementById('nail-polish-toggle').checked = !!entry.nailPolish;
    document.getElementById('wet-hands-toggle').checked = !!entry.wetHands;
    document.getElementById('gloves-toggle').checked = !!entry.gloves;
    document.getElementById('notes-input').value = entry.notes || '';
    pendingPhotos = entry.photos ? [...entry.photos] : [];
  }

  // Populate cream datalist from history
  const datalist = document.getElementById('cream-history-list');
  datalist.innerHTML = '';
  const creams = getKnownCreams();
  creams.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    datalist.appendChild(opt);
  });

  renderPendingPhotos();

  document.getElementById('delete-entry-btn').classList.toggle('hidden', !isEdit);
  document.getElementById('log-modal-backdrop').classList.remove('hidden');
}

function resetModal() {
  // Clear pills
  ['flare-status-group', 'cream-applied-group', 'taper-phase-group',
    'weather-group', 'diet-group', 'water-group'].forEach(id => {
      document.querySelectorAll(`#${id} .pill`).forEach(p => p.classList.remove('active', 'active-none', 'active-mild', 'active-moderate', 'active-severe'));
    });
  // Clear chips
  document.querySelectorAll('.symptom-chip').forEach(c => c.classList.remove('active'));
  // Reset sliders
  setSlider('itch-slider', 'itch-val', 0);
  setSlider('stress-slider', 'stress-val', 0);
  // Reset inputs
  document.getElementById('cream-name-input').value = '';
  document.getElementById('notes-input').value = '';
  document.getElementById('nail-polish-toggle').checked = false;
  document.getElementById('wet-hands-toggle').checked = false;
  document.getElementById('gloves-toggle').checked = false;
  document.getElementById('photo-thumbs').innerHTML = '';
}

function setPill(groupId, val) {
  if (!val) return;
  const btn = document.querySelector(`#${groupId} [data-val="${val}"]`);
  if (!btn) return;
  btn.classList.add('active');
  // Add semantic active class for flare pills
  if (groupId === 'flare-status-group') btn.classList.add(`active-${val}`);
}

function setChip(sym) {
  const chip = document.querySelector(`.symptom-chip[data-sym="${sym}"]`);
  if (chip) chip.classList.add('active');
}

function setSlider(sliderId, valId, value) {
  const slider = document.getElementById(sliderId);
  const valEl = document.getElementById(valId);
  if (slider) slider.value = value;
  if (valEl) valEl.textContent = value;
}

function closeModal() {
  document.getElementById('log-modal-backdrop').classList.add('hidden');
  pendingPhotos = [];
  modalDate = null;
}

function getActivePill(groupId) {
  const active = document.querySelector(`#${groupId} .pill.active`);
  return active ? active.dataset.val : null;
}

function getActiveSymptoms() {
  return [...document.querySelectorAll('.symptom-chip.active')].map(c => c.dataset.sym);
}

function saveEntry() {
  if (!modalDate) return;

  const creamApplied = getActivePill('cream-applied-group');
  const creamName = document.getElementById('cream-name-input').value.trim();

  const entry = {
    flare: getActivePill('flare-status-group'),
    symptoms: getActiveSymptoms(),
    itchLevel: parseInt(document.getElementById('itch-slider').value),
    creamApplied,
    creamName,
    taperPhase: getActivePill('taper-phase-group'),
    weather: getActivePill('weather-group'),
    stress: parseInt(document.getElementById('stress-slider').value),
    diet: getActivePill('diet-group'),
    water: getActivePill('water-group'),
    nailPolish: document.getElementById('nail-polish-toggle').checked,
    wetHands: document.getElementById('wet-hands-toggle').checked,
    gloves: document.getElementById('gloves-toggle').checked,
    notes: document.getElementById('notes-input').value.trim(),
    photos: [...pendingPhotos],
    savedAt: new Date().toISOString(),
  };

  entries[modalDate] = entry;
  save();
  closeModal();
  renderCalendar();
  renderLogbook();
  showToast('✅ Entry saved!');
}

function deleteEntry() {
  if (!modalDate) return;
  delete entries[modalDate];
  save();
  closeModal();
  renderCalendar();
  renderLogbook();
  showToast('🗑️ Entry deleted.');
}

// ─── Photos ───────────────────────────────────────────────────────────────────
function renderPendingPhotos() {
  const thumbs = document.getElementById('photo-thumbs');
  thumbs.innerHTML = '';
  pendingPhotos.forEach((src, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb-wrap';

    const img = document.createElement('img');
    img.className = 'photo-thumb';
    img.src = src;
    img.alt = `Photo ${i + 1}`;
    img.addEventListener('click', () => openLightbox(src, 'Preview'));

    const rm = document.createElement('button');
    rm.className = 'photo-remove';
    rm.textContent = '×';
    rm.title = 'Remove photo';
    rm.addEventListener('click', () => {
      pendingPhotos.splice(i, 1);
      renderPendingPhotos();
    });

    wrap.appendChild(img);
    wrap.appendChild(rm);
    thumbs.appendChild(wrap);
  });
}

document.getElementById('photo-input').addEventListener('change', function () {
  const files = Array.from(this.files);
  if (!files.length) return;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // Compress to reasonable size
      compressImage(e.target.result, 800, 0.7, (compressed) => {
        pendingPhotos.push(compressed);
        renderPendingPhotos();
      });
    };
    reader.readAsDataURL(file);
  });
  this.value = ''; // reset so same file can be re-added
});

function compressImage(dataUrl, maxSize, quality, callback) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    let { width, height } = img;
    if (width > maxSize || height > maxSize) {
      if (width > height) { height = Math.round(height * maxSize / width); width = maxSize; }
      else { width = Math.round(width * maxSize / height); height = maxSize; }
    }
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
  img.src = dataUrl;
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function openLightbox(src, caption) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-caption').textContent = caption || '';
  document.getElementById('lightbox').classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.getElementById('lightbox-img').src = '';
}

// ─── Known Creams (from history) ──────────────────────────────────────────────
function getKnownCreams() {
  const set = new Set();
  Object.values(entries).forEach(e => {
    if (e.creamName && e.creamName.trim()) set.add(e.creamName.trim());
  });
  return [...set];
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function switchView(view) {
  document.getElementById('view-calendar').classList.toggle('hidden', view !== 'calendar');
  document.getElementById('view-logbook').classList.toggle('hidden', view !== 'logbook');
  document.getElementById('nav-calendar').classList.toggle('active', view === 'calendar');
  document.getElementById('nav-logbook').classList.toggle('active', view === 'logbook');

  if (view === 'logbook') renderLogbook();
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function openSettings() {
  document.getElementById('reminder-time').value = settings.reminderTime;
  document.getElementById('settings-backdrop').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-backdrop').classList.add('hidden');
}

// ─── Notifications ────────────────────────────────────────────────────────────
function enableNotifications() {
  if (!('Notification' in window)) {
    showToast('❌ Notifications not supported in this browser.');
    return;
  }
  Notification.requestPermission().then(result => {
    settings.notifGranted = result === 'granted';
    settings.reminderTime = document.getElementById('reminder-time').value || '21:00';
    save();
    if (result === 'granted') {
      showToast('✅ Reminder set for ' + settings.reminderTime + ' nightly!');
      scheduleNextReminder();
    } else {
      showToast('Notifications blocked. Enable in browser settings.');
    }
  });
}

function scheduleNextReminder() {
  if (!settings.notifGranted || Notification.permission !== 'granted') return;
  const [hh, mm] = settings.reminderTime.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const ms = target - now;
  setTimeout(() => {
    new Notification('🌿 SkinCalm', {
      body: "Time to apply your cream and log today's entry!",
    });
    scheduleNextReminder();
  }, ms);
}

// ─── Export ───────────────────────────────────────────────────────────────────
function exportData() {
  // Export without photo data to keep size manageable; or include all
  const data = { entries, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `skincalm-export-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Exported successfully!');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 300);
  }, 2800);
}

// ─── Pill & Chip Interactivity ────────────────────────────────────────────────
function initPillGroup(groupId, { exclusive = true, semanticActive = false } = {}) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const isActive = btn.classList.contains('active');
      if (exclusive) {
        group.querySelectorAll('.pill').forEach(b => {
          b.classList.remove('active', 'active-none', 'active-mild', 'active-moderate', 'active-severe');
        });
      }
      if (!isActive) {
        btn.classList.add('active');
        if (semanticActive) btn.classList.add(`active-${btn.dataset.val}`);
      }
    });
  });
}

function initSymptomChips() {
  document.querySelectorAll('.symptom-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
  });
}

function initSlider(sliderId, valId) {
  const slider = document.getElementById(sliderId);
  const valEl = document.getElementById(valId);
  if (!slider || !valEl) return;
  slider.addEventListener('input', () => { valEl.textContent = slider.value; });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  load();

  // ── Service worker registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').then((reg) => {
        console.log('SW Registered', reg);
      }).catch((err) => {
        console.log('SW Service worker registration failed', err);
      });
    });
  }

  renderCalendar();

  if (settings.notifGranted && Notification.permission === 'granted') {
    scheduleNextReminder();
  }

  // ── Pill groups
  initPillGroup('flare-status-group', { semanticActive: true });
  initPillGroup('cream-applied-group');
  initPillGroup('taper-phase-group');
  initPillGroup('weather-group');
  initPillGroup('diet-group');
  initPillGroup('water-group');

  // ── Symptom chips
  initSymptomChips();

  // ── Sliders
  initSlider('itch-slider', 'itch-val');
  initSlider('stress-slider', 'stress-val');

  // ── Navigation
  document.getElementById('nav-calendar').addEventListener('click', () => switchView('calendar'));
  document.getElementById('nav-logbook').addEventListener('click', () => switchView('logbook'));

  // ── Month navigation
  document.getElementById('prev-month').addEventListener('click', () => {
    viewDate.setMonth(viewDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    viewDate.setMonth(viewDate.getMonth() + 1);
    renderCalendar();
  });

  // ── FAB – log today
  document.getElementById('fab-log').addEventListener('click', () => openModal(todayKey()));

  // ── Modal close
  document.getElementById('log-modal-close').addEventListener('click', closeModal);
  document.getElementById('log-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === document.getElementById('log-modal-backdrop')) closeModal();
  });

  // ── Save / Delete
  document.getElementById('save-entry-btn').addEventListener('click', saveEntry);
  document.getElementById('delete-entry-btn').addEventListener('click', () => {
    if (confirm('Delete this entry?')) deleteEntry();
  });

  // ── Settings
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('settings-backdrop').addEventListener('click', (e) => {
    if (e.target === document.getElementById('settings-backdrop')) closeSettings();
  });

  // ── Settings actions
  document.getElementById('enable-notif-btn').addEventListener('click', enableNotifications);
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('clear-all-btn').addEventListener('click', () => {
    if (confirm('Clear ALL data? This cannot be undone.')) {
      entries = {};
      save();
      renderCalendar();
      closeSettings();
      showToast('🗑️ All data cleared.');
    }
  });

  // ── Lightbox
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target === document.getElementById('lightbox')) closeLightbox();
  });

  // ── Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeLightbox();
      closeSettings();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
