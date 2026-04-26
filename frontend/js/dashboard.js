import { api, requireAuth } from './api.js';

if (!requireAuth()) throw new Error('unauthenticated');

const listEl       = document.getElementById('customer-list');
const searchEl     = document.getElementById('search-input');
const sortEl       = document.getElementById('sort-select');
const archiveToggle= document.getElementById('archive-toggle');
const addModal     = document.getElementById('add-modal');
const addError     = document.getElementById('add-error');
const addBtn       = document.getElementById('add-btn');
const addCancel    = document.getElementById('add-cancel');
const addSubmit    = document.getElementById('add-submit');
const logoutBtn    = document.getElementById('logout-btn');

let showArchived = false;

// ── 顧客一覧描画 ─────────────────────────────────
async function loadCustomers(q = '') {
  listEl.innerHTML = '<div class="loading"><div class="spinner"></div>読み込み中...</div>';
  try {
    const sort = sortEl.value;
    const archived = showArchived ? '1' : '0';
    let endpoint = `/api/customers?sort=${sort}&archived=${archived}`;
    if (q) endpoint += `&q=${encodeURIComponent(q)}`;
    const customers = await api(endpoint);
    renderList(customers);
  } catch (err) {
    listEl.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

// 放置日数を計算
function neglectBadge(lastVisit) {
  if (!lastVisit) return null;
  const days = Math.floor((Date.now() - new Date(lastVisit)) / 86400000);
  if (days <= 10) return null;
  if (days <= 21) return { label: `⚡ ${days}日`, color: 'var(--accent-business)' };
  if (days <= 45) return { label: `⚠️ ${days}日`, color: 'var(--accent-rose)' };
  return               { label: `🚨 ${days}日放置`, color: '#ff4444' };
}

function renderList(customers) {
  if (!customers.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div style="font-size:3rem">${showArchived ? '📦' : '👥'}</div>
        <p>${showArchived ? 'アーカイブはありません' : '顧客がいません<br>右下の＋から追加してください'}</p>
      </div>`;
    return;
  }

  // 温度感の説明
  const legend = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;padding:0 0 10px;font-size:0.72rem;color:var(--text-secondary)">
      <span>🔥 80以上=ぜひ呼びたい</span>
      <span>😊 50〜79=良好</span>
      <span>😐 30〜49=要フォロー</span>
      <span>❄️ 30未満=要アラート</span>
    </div>`;

  listEl.innerHTML = legend + customers.map((c) => {
    const badge    = tempBadge(c.temperature);
    const neglect  = neglectBadge(c.last_visit);
    const lastVisit = c.last_visit ? `最終来店: ${c.last_visit}` : '来店記録なし';
    const archivedMark = c.archived ? '<span style="font-size:0.7rem;color:var(--text-secondary);margin-left:4px">📦</span>' : '';
    const neglectTag = neglect
      ? `<span style="font-size:0.72rem;padding:2px 7px;border-radius:99px;background:rgba(255,68,68,0.15);color:${neglect.color};margin-left:6px">${neglect.label}</span>`
      : '';
    return `
      <div class="customer-card" data-id="${c.id}"
           style="background-color: ${c.bg_color || '#1a1a2e'}">
        <div class="customer-card-avatar">👤</div>
        <div style="flex:1;min-width:0">
          <div class="customer-card-name">${esc(c.name)}${archivedMark}${neglectTag}</div>
          <div class="customer-card-meta">${lastVisit}</div>
        </div>
        <span class="badge ${badge.cls}">${badge.label}</span>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.customer-card').forEach((card) => {
    card.addEventListener('click', () => {
      location.href = `/customer?id=${card.dataset.id}`;
    });
  });
}

function tempBadge(temp) {
  if (temp >= 80) return { cls: 'badge-hot',  label: '🔥 熱い' };
  if (temp >= 50) return { cls: 'badge-warm', label: '😊 普通' };
  if (temp >= 30) return { cls: 'badge-cool', label: '😐 微妙' };
  return               { cls: 'badge-cold', label: '❄️ 冷え' };
}

// ── 並び替え ─────────────────────────────────────
sortEl.addEventListener('change', () => loadCustomers(searchEl.value.trim()));

// ── アーカイブ切り替え ────────────────────────────
archiveToggle.addEventListener('click', () => {
  showArchived = !showArchived;
  archiveToggle.textContent = showArchived ? '通常表示' : 'アーカイブ表示';
  archiveToggle.style.color = showArchived ? 'var(--accent-gold)' : '';
  loadCustomers(searchEl.value.trim());
});

// ── 検索 ─────────────────────────────────────────
let searchTimer;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadCustomers(searchEl.value.trim()), 300);
});

// ── 新規追加モーダル ──────────────────────────────
addBtn.addEventListener('click',   () => addModal.classList.remove('hidden'));
addCancel.addEventListener('click', closeModal);
addModal.addEventListener('click', (e) => { if (e.target === addModal) closeModal(); });

function closeModal() {
  addModal.classList.add('hidden');
  addError.classList.add('hidden');
  document.getElementById('add-name').value = '';
  document.getElementById('add-nickname').value = '';
}

addSubmit.addEventListener('click', async () => {
  addError.classList.add('hidden');
  const name = document.getElementById('add-name').value.trim();
  if (!name) { showAddError('名前を入力してください'); return; }

  addSubmit.disabled = true;
  try {
    const { id } = await api('/api/customers', {
      method: 'POST',
      body: JSON.stringify({
        name,
        nickname: document.getElementById('add-nickname').value.trim() || null,
        bg_color: document.getElementById('add-bgcolor').value,
      }),
    });
    location.href = `/customer?id=${id}`;
  } catch (err) {
    showAddError(err.message);
    addSubmit.disabled = false;
  }
});

function showAddError(msg) {
  addError.textContent = msg;
  addError.classList.remove('hidden');
}

// ── ログアウト ────────────────────────────────────
logoutBtn.addEventListener('click', () => {
  if (!confirm('ログアウトしますか？')) return;
  localStorage.removeItem('castline_token');
  localStorage.removeItem('castline_cast_id');
  location.href = '/';
});

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

loadCustomers();
