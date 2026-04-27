/**
 * AI秘書チャットウィジェット
 * dashboard.html / customer.html 両方から import して使う
 */
import { api, getCastId } from './api.js';

const BASE_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:8787'
  : 'https://aireply.aidbase11.workers.dev';

const AVATARS = ['🤖','✨','💫','🌙','👑','💎','🦋','🌸','⭐','🎀'];
const STORAGE_CID = `aireply_cid_${getCastId()}`;

let chatAvatar = localStorage.getItem('aireply_avatar') || '🤖';

export function initChatWidget() {
  injectHTML();
  loadAvatar();
  bindEvents();
}

// ── HTML を body に注入 ─────────────────────────────
function injectHTML() {
  if (document.getElementById('aw-panel')) return; // 二重初期化防止

  document.body.insertAdjacentHTML('beforeend', `
    <!-- チャット起動ボタン -->
    <button id="aw-btn" title="AI秘書に話しかける"
      style="position:fixed;bottom:84px;right:20px;width:52px;height:52px;border-radius:50%;
             background:var(--bg-card);border:2px solid rgba(212,175,55,0.5);
             font-size:1.4rem;cursor:pointer;z-index:210;display:flex;align-items:center;justify-content:center;
             box-shadow:0 4px 16px rgba(0,0,0,0.4)">
      <span id="aw-btn-icon">${chatAvatar}</span>
    </button>

    <!-- チャットパネル -->
    <div id="aw-panel" style="position:fixed;inset:0;background:var(--bg-primary);z-index:400;
         display:none;flex-direction:column">
      <!-- ヘッダー -->
      <div style="display:flex;align-items:center;padding:12px 16px;
                  background:var(--bg-card);border-bottom:1px solid rgba(255,255,255,0.08);gap:10px">
        <button id="aw-close" style="background:none;border:none;color:var(--text-primary);font-size:1.2rem;cursor:pointer">✕</button>
        <span id="aw-avatar-display" style="font-size:1.5rem">${chatAvatar}</span>
        <span class="brand" style="font-size:0.95rem">AI秘書 あいりぷ</span>
        <div style="flex:1"></div>
        <button id="aw-avatar-btn" class="btn btn-secondary" style="width:auto;padding:0 10px;font-size:0.78rem;min-height:32px">顔を変える</button>
        <button id="aw-memory-btn" class="btn btn-secondary" style="width:auto;padding:0 10px;font-size:0.78rem;min-height:32px">🧠</button>
      </div>

      <!-- メッセージ一覧 -->
      <div id="aw-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px"></div>

      <!-- 入力欄 -->
      <div style="padding:12px 16px;background:var(--bg-card);border-top:1px solid rgba(255,255,255,0.08)">
        <div style="display:flex;gap:8px">
          <textarea id="aw-input" placeholder="話しかけてみて..." rows="1"
            style="flex:1;min-height:44px;max-height:120px;resize:none;font-size:0.95rem;
                   padding:10px 12px;background:var(--bg-input);border:1px solid rgba(255,255,255,0.1);
                   border-radius:8px;color:var(--text-primary);font-family:inherit"></textarea>
          <button id="aw-send" class="btn btn-primary"
            style="width:44px;min-height:44px;padding:0;font-size:1.2rem;flex-shrink:0">↑</button>
        </div>
      </div>
    </div>

    <!-- アバター選択パネル -->
    <div id="aw-avatar-panel" style="position:fixed;bottom:160px;right:20px;
         background:var(--bg-card);border:1px solid rgba(212,175,55,0.3);
         border-radius:12px;padding:12px;z-index:500;display:none;
         box-shadow:0 4px 20px rgba(0,0,0,0.5)">
      <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:8px">アイコンを選んでね</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
        ${AVATARS.map(a => `<button class="aw-avatar-choice" data-avatar="${a}"
          style="font-size:1.5rem;background:none;border:2px solid transparent;border-radius:8px;
                 padding:4px;cursor:pointer;line-height:1">${a}</button>`).join('')}
      </div>
    </div>

    <!-- 記憶管理パネル -->
    <div id="aw-memory-panel" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-title">🧠 AI秘書の長期記憶</div>
        <div class="form-group">
          <textarea id="aw-mem-input" placeholder="例: 火曜は気分が落ち込みやすい" style="min-height:70px"></textarea>
        </div>
        <button class="btn btn-primary" id="aw-mem-save" style="margin-bottom:16px">追加</button>
        <div class="section-label">保存済みの記憶</div>
        <div id="aw-mem-list" class="mt-8"></div>
        <button class="btn btn-secondary" id="aw-mem-close" style="margin-top:16px">閉じる</button>
      </div>
    </div>
  `);
}

// ── アバターを設定から読み込み ─────────────────────
async function loadAvatar() {
  try {
    const data = await api('/api/cast/settings');
    if (data.chat_avatar) {
      chatAvatar = data.chat_avatar;
      localStorage.setItem('aireply_avatar', chatAvatar);
      updateAvatarDisplay();
    }
  } catch {}
}

function updateAvatarDisplay() {
  const btn  = document.getElementById('aw-btn-icon');
  const disp = document.getElementById('aw-avatar-display');
  if (btn)  btn.textContent  = chatAvatar;
  if (disp) disp.textContent = chatAvatar;
  document.querySelectorAll('.aw-avatar-choice').forEach(b => {
    b.style.borderColor = b.dataset.avatar === chatAvatar ? 'var(--accent-gold)' : 'transparent';
  });
}

// ── イベントバインド ────────────────────────────────
function bindEvents() {
  const panel      = document.getElementById('aw-panel');
  const messages   = document.getElementById('aw-messages');
  const input      = document.getElementById('aw-input');
  const sendBtn    = document.getElementById('aw-send');
  const openBtn    = document.getElementById('aw-btn');
  const closeBtn   = document.getElementById('aw-close');
  const avatarBtn  = document.getElementById('aw-avatar-btn');
  const avatarPane = document.getElementById('aw-avatar-panel');
  const memBtn     = document.getElementById('aw-memory-btn');
  const memPanel   = document.getElementById('aw-memory-panel');
  const memClose   = document.getElementById('aw-mem-close');
  const memSave    = document.getElementById('aw-mem-save');
  const memList    = document.getElementById('aw-mem-list');

  // 開く
  openBtn.addEventListener('click', () => {
    panel.style.display = 'flex';
    if (!messages.children.length) addSystemMsg('こんにちは！何でも話しかけてね💕');
    input.focus();
  });

  // 閉じる
  closeBtn.addEventListener('click', () => { panel.style.display = 'none'; });

  // アバター選択
  avatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    avatarPane.style.display = avatarPane.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => { avatarPane.style.display = 'none'; });

  document.querySelectorAll('.aw-avatar-choice').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      chatAvatar = btn.dataset.avatar;
      localStorage.setItem('aireply_avatar', chatAvatar);
      updateAvatarDisplay();
      avatarPane.style.display = 'none';
      // DBに保存
      await api('/api/cast/settings', { method: 'PUT', body: JSON.stringify({ chat_avatar: chatAvatar }) });
    });
  });

  // 記憶モーダル
  memBtn.addEventListener('click', () => { memPanel.classList.remove('hidden'); loadMemories(); });
  memClose.addEventListener('click', () => memPanel.classList.add('hidden'));
  memPanel.addEventListener('click', (e) => { if (e.target === memPanel) memPanel.classList.add('hidden'); });
  memSave.addEventListener('click', async () => {
    const content = document.getElementById('aw-mem-input').value.trim();
    if (!content) return;
    memSave.disabled = true;
    await api('/api/memories', { method: 'POST', body: JSON.stringify({ content }) });
    document.getElementById('aw-mem-input').value = '';
    await loadMemories();
    memSave.disabled = false;
  });

  // 送信
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener('click', sendMessage);

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    input.value = '';
    sendBtn.disabled = true;

    addBubble('user', text);
    const aiBubble = addBubble('ai', '');
    aiBubble.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block"></span>';

    const token = localStorage.getItem('castline_token');
    const cid   = localStorage.getItem(STORAGE_CID) || '';

    try {
      const res = await fetch(`${BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, conversation_id: cid }),
      });

      if (!res.ok) throw new Error(`エラー: ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', fullText = '';
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
          if (raw === '[DONE]') continue;
          try {
            const data = JSON.parse(raw);
            if (data.answer) { fullText += data.answer; aiBubble.textContent = fullText; messages.scrollTop = messages.scrollHeight; }
            if (data.conversation_id) localStorage.setItem(STORAGE_CID, data.conversation_id);
          } catch {}
        }
      }
    } catch (err) {
      aiBubble.textContent = `エラー: ${err.message}`;
      aiBubble.style.color = 'var(--accent-rose)';
    } finally {
      sendBtn.disabled = false;
    }
  }

  function addBubble(role, text) {
    const div = document.createElement('div');
    if (role === 'ai') {
      div.style.cssText = 'display:flex;align-items:flex-start;gap:8px;max-width:90%';
      div.innerHTML = `<span style="font-size:1.3rem;flex-shrink:0;margin-top:2px">${chatAvatar}</span>
        <div style="background:var(--bg-card);color:var(--text-primary);padding:10px 14px;
                    border-radius:0 16px 16px 16px;font-size:0.9rem;line-height:1.6;flex:1"></div>`;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return div.querySelector('div');
    } else {
      div.style.cssText = 'align-self:flex-end;max-width:85%;padding:10px 14px;border-radius:16px 16px 4px 16px;background:linear-gradient(135deg,#d4af37,#b8902a);color:#0d0d1a;font-size:0.9rem;line-height:1.6';
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return div;
    }
  }

  function addSystemMsg(text) {
    const div = document.createElement('div');
    div.style.cssText = 'text-align:center;font-size:0.75rem;color:var(--text-secondary);padding:4px 0';
    div.textContent = text;
    messages.appendChild(div);
  }

  async function loadMemories() {
    memList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const mems = await api('/api/memories');
    if (!mems.length) { memList.innerHTML = '<div class="text-secondary" style="font-size:0.82rem">まだ記憶がありません</div>'; return; }
    memList.innerHTML = mems.map(m => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div style="flex:1;font-size:0.85rem">${esc(m.content)}</div>
        <button class="btn btn-danger aw-mem-del" data-id="${m.id}"
                style="width:30px;height:30px;padding:0;font-size:0.75rem;flex-shrink:0">🗑</button>
      </div>`).join('');
    memList.querySelectorAll('.aw-mem-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api(`/api/memories/${btn.dataset.id}`, { method: 'DELETE' });
        await loadMemories();
      });
    });
  }
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}
