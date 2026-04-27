import { api, requireAuth, getCastId } from './api.js';
import { initChatWidget, openChatPanel } from './chat-widget.js';

if (!requireAuth()) throw new Error('unauthenticated');

const listEl        = document.getElementById('customer-list');
const searchEl      = document.getElementById('search-input');
const sortEl        = document.getElementById('sort-select');
const archiveToggle = document.getElementById('archive-toggle');
const addModal      = document.getElementById('add-modal');
const addError      = document.getElementById('add-error');
const addBtn        = document.getElementById('add-btn');
const addCancel     = document.getElementById('add-cancel');
const addSubmit     = document.getElementById('add-submit');
const logoutBtn     = document.getElementById('logout-btn');

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
  if (!lastVisit) return { label: '📅 対応履歴なし', color: 'var(--text-secondary)' };
  const days = Math.floor((Date.now() - new Date(lastVisit)) / 86400000);
  if (days <= 10) return null;
  if (days <= 21) return { label: `⚡ ${days}日未連絡`, color: 'var(--accent-business)' };
  if (days <= 45) return { label: `⚠️ ${days}日未連絡`, color: 'var(--accent-rose)' };
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
initConcierge();
initChatWidget();
syncConciergeAvatar();

document.getElementById('inline-chat-bar').addEventListener('click', () => {
  openChatPanel('');
});

function syncConciergeAvatar() {
  const el = document.getElementById('concierge-avatar-icon');
  if (!el) return;
  const cached = localStorage.getItem('aireply_avatar');
  if (cached) el.textContent = cached;
  api('/api/cast/settings').then(data => {
    if (data.chat_avatar) {
      localStorage.setItem('aireply_avatar', data.chat_avatar);
      el.textContent = data.chat_avatar;
    }
  }).catch(() => {});
}

// ────────────────────────────────────────────────────
// AI コンシェルジュ（挨拶 + 要連絡カード）
// ────────────────────────────────────────────────────
async function initConcierge() {
  const greetingEl = document.getElementById('concierge-greeting');
  const alertEl    = document.getElementById('concierge-alert');

  // 時間帯別挨拶
  const h = new Date().getHours();
  const greeting =
    h >= 20 || h < 4  ? '今夜もお疲れ様💕 いい営業できてる？' :
    h < 12             ? 'おはよう☀️ 今日も頑張ろう！' :
                         'お昼だね🌙 ゆっくり休めてる？';
  greetingEl.textContent = greeting;

  // 要連絡顧客を表示
  try {
    const { alert_customers } = await api('/api/ai/dashboard');
    if (alert_customers?.length) {
      alertEl.innerHTML = `
        <div style="font-size:0.78rem;color:var(--accent-gold);margin-bottom:4px">そろそろ連絡したほうがいいかも✨</div>
        ${alert_customers.map(c => {
          const days = c.last_visit
            ? Math.floor((Date.now() - new Date(c.last_visit)) / 86400000)
            : null;
          return `<div style="font-size:0.82rem;color:var(--text-secondary)">
            • ${esc(c.name)}（温度感${c.temperature}、${days ? `${days}日未連絡` : '来店記録なし'}）
          </div>`;
        }).join('')}`;
    }
  } catch {}
}

// ────────────────────────────────────────────────────
// チャットはchat-widget.jsに移行済み
// ────────────────────────────────────────────────────
function _deprecated_initChat() {
  const panel    = document.getElementById('chat-panel');
  const openBtn  = document.getElementById('chat-open-btn');
  const closeBtn = document.getElementById('chat-close-btn');
  const input    = document.getElementById('chat-input');
  const sendBtn  = document.getElementById('chat-send-btn');
  const messages = document.getElementById('chat-messages');

  openBtn.addEventListener('click', () => {
    panel.classList.remove('hidden');
    if (!messages.children.length) addSystemMsg('こんにちは！何でも話しかけてね💕');
    input.focus();
  });
  closeBtn.addEventListener('click', () => panel.classList.add('hidden'));

  // Enter送信（Shift+Enterは改行）
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener('click', sendMessage);

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    addBubble('user', text);

    const aiBubble = addBubble('ai', '');
    aiBubble.innerHTML = '<span class="spinner" style="width:16px;height:16px;display:inline-block"></span>';

    const token     = localStorage.getItem('castline_token');
    const conversationId = localStorage.getItem(STORAGE_KEY) || '';

    try {
      const BASE_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
        ? 'http://localhost:8787' : 'https://aireply.aidbase11.workers.dev';

      const res = await fetch(`${BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, conversation_id: conversationId }),
      });

      if (!res.ok) throw new Error(`エラー: ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let fullText = '';

      aiBubble.textContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const data = JSON.parse(raw);
            if (data.answer) {
              fullText += data.answer;
              aiBubble.textContent = fullText;
              messages.scrollTop = messages.scrollHeight;
            }
            if (data.conversation_id) {
              localStorage.setItem(STORAGE_KEY, data.conversation_id);
            }
          } catch {}
        }
      }
    } catch (err) {
      aiBubble.textContent = `エラー: ${err.message}`;
      aiBubble.style.color = 'var(--accent-rose)';
    }
  }

  function addBubble(role, text) {
    const div = document.createElement('div');
    div.style.cssText = `
      max-width: 85%; padding: 10px 14px; border-radius: 16px; font-size: 0.9rem; line-height: 1.6;
      ${role === 'user'
        ? 'align-self:flex-end;background:linear-gradient(135deg,#d4af37,#b8902a);color:#0d0d1a;border-bottom-right-radius:4px'
        : 'align-self:flex-start;background:var(--bg-card);color:var(--text-primary);border-bottom-left-radius:4px'}
    `;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  function addSystemMsg(text) {
    const div = document.createElement('div');
    div.style.cssText = 'text-align:center;font-size:0.78rem;color:var(--text-secondary);padding:4px 0';
    div.textContent = text;
    messages.appendChild(div);
  }
}

// ────────────────────────────────────────────────────
// 長期記憶管理（chat-widget.jsに移行済み）
// ────────────────────────────────────────────────────
function _deprecated_initMemory() {
  const modal     = document.getElementById('memory-modal');
  const openBtn   = document.getElementById('memory-btn');
  const closeBtn  = document.getElementById('memory-close-btn');
  const saveBtn   = document.getElementById('memory-save-btn');
  const inputEl   = document.getElementById('memory-input');
  const listEl    = document.getElementById('memory-list');

  openBtn.addEventListener('click', () => { modal.classList.remove('hidden'); loadMemories(); });
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

  saveBtn.addEventListener('click', async () => {
    const content = inputEl.value.trim();
    if (!content) return;
    saveBtn.disabled = true;
    try {
      await api('/api/memories', { method: 'POST', body: JSON.stringify({ content }) });
      inputEl.value = '';
      await loadMemories();
    } catch (err) { alert(err.message); }
    finally { saveBtn.disabled = false; }
  });

  async function loadMemories() {
    listEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const mems = await api('/api/memories');
      if (!mems.length) { listEl.innerHTML = '<div class="text-secondary" style="font-size:0.82rem">まだ記憶がありません</div>'; return; }
      listEl.innerHTML = mems.map(m => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
          <div style="flex:1;font-size:0.85rem">${esc(m.content)}</div>
          <button class="btn btn-danger mem-del" data-id="${m.id}"
                  style="width:32px;height:32px;padding:0;font-size:0.8rem;flex-shrink:0">🗑</button>
        </div>`).join('');
      listEl.querySelectorAll('.mem-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          await api(`/api/memories/${btn.dataset.id}`, { method: 'DELETE' });
          await loadMemories();
        });
      });
    } catch { listEl.innerHTML = ''; }
  }
}
