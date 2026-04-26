import { api, requireAuth } from './api.js';

if (!requireAuth()) throw new Error('unauthenticated');

const listEl     = document.getElementById('customer-list');
const searchEl   = document.getElementById('search-input');
const addModal   = document.getElementById('add-modal');
const addError   = document.getElementById('add-error');
const addBtn     = document.getElementById('add-btn');
const addCancel  = document.getElementById('add-cancel');
const addSubmit  = document.getElementById('add-submit');
const logoutBtn  = document.getElementById('logout-btn');

// ── 顧客一覧描画 ─────────────────────────────────
async function loadCustomers(q = '') {
  listEl.innerHTML = '<div class="loading"><div class="spinner"></div>読み込み中...</div>';
  try {
    const endpoint = q ? `/api/customers?q=${encodeURIComponent(q)}` : '/api/customers';
    const customers = await api(endpoint);
    renderList(customers);
  } catch (err) {
    listEl.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

function renderList(customers) {
  if (!customers.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div style="font-size:3rem">👥</div>
        <p>顧客がいません<br>右下の＋から追加してください</p>
      </div>`;
    return;
  }

  listEl.innerHTML = customers.map((c) => {
    const badge = tempBadge(c.temperature);
    const lastVisit = c.last_visit
      ? `最終来店: ${c.last_visit}`
      : '来店記録なし';
    return `
      <div class="customer-card" data-id="${c.id}"
           style="background-color: ${c.bg_color || '#1a1a2e'}">
        <div class="customer-card-avatar">👤</div>
        <div style="flex:1;min-width:0">
          <div class="customer-card-name">${esc(c.name)}</div>
          <div class="customer-card-meta">${lastVisit}</div>
        </div>
        <span class="badge ${badge.cls}">${badge.label}</span>
      </div>`;
  }).join('');

  // onclick をinline属性ではなくevent delegationで設定
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

// ── HTML エスケープ ───────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

loadCustomers();
