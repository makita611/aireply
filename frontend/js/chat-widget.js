/**
 * AI秘書チャットウィジェット
 * dashboard.html / customer.html 両方から import して使う
 */
import { api, getCastId } from './api.js';

const BASE_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:8787'
  : 'https://aireply.aidbase11.workers.dev';

const STORAGE_CID = `aireply_cid_${getCastId()}`;
const AVATAR_IMG = `<img src="/img/airipu-avatar.svg" style="width:100%;height:100%;border-radius:50%;display:block">`;

let chatExpanded = false;
let _openChatFn = null;

export function initChatWidget() {
  injectHTML();
  bindEvents();
}

export function openChatPanel(initialMessage = '') {
  if (_openChatFn) _openChatFn(initialMessage);
}

// ── HTML を body に注入 ─────────────────────────────
function injectHTML() {
  if (document.getElementById('aw-panel')) return; // 二重初期化防止

  document.body.insertAdjacentHTML('beforeend', `
    <!-- チャット起動ボタン -->
    <button id="aw-btn" title="AI秘書に話しかける"
      style="position:fixed;bottom:84px;right:20px;width:52px;height:52px;border-radius:50%;
             background:var(--bg-card);border:2px solid rgba(212,175,55,0.5);
             padding:3px;cursor:pointer;z-index:210;display:flex;align-items:center;justify-content:center;
             box-shadow:0 4px 16px rgba(0,0,0,0.4)">
      ${AVATAR_IMG}
    </button>

    <!-- チャットパネル（初期: 画面下半分、展開で全画面） -->
    <div id="aw-panel" style="position:fixed;bottom:0;left:0;right:0;height:52vh;
         background:var(--bg-primary);z-index:400;display:none;flex-direction:column;
         border-radius:20px 20px 0 0;box-shadow:0 -4px 30px rgba(0,0,0,0.5);
         transition:height 0.3s ease, border-radius 0.3s ease">
      <!-- ドラッグハンドル＋ヘッダー -->
      <div style="background:var(--bg-card);border-radius:20px 20px 0 0;border-bottom:1px solid rgba(255,255,255,0.08)">
        <!-- ドラッグハンドル（タップで拡大/縮小） -->
        <div id="aw-resize-handle" style="display:flex;justify-content:center;padding:8px 0;cursor:pointer">
          <div style="width:40px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px"></div>
        </div>
        <div style="display:flex;align-items:center;padding:0 16px 10px;gap:10px">
          <div style="width:32px;height:32px;border-radius:50%;border:1.5px solid rgba(212,175,55,0.4);overflow:hidden;flex-shrink:0">${AVATAR_IMG}</div>
          <span class="brand" style="font-size:0.9rem">AI秘書 アイリプ</span>
          <div style="flex:1"></div>
          <button id="aw-expand-btn" style="background:none;border:none;color:var(--text-secondary);font-size:1rem;cursor:pointer;padding:4px" title="全画面">⤢</button>
          <button id="aw-memory-btn" style="background:none;border:none;color:var(--text-secondary);font-size:1rem;cursor:pointer;padding:4px">🧠</button>
          <button id="aw-close" style="background:none;border:none;color:var(--text-secondary);font-size:1.1rem;cursor:pointer;padding:4px">✕</button>
        </div>
      </div>

      <!-- メッセージ一覧 -->
      <div id="aw-messages" style="flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px"></div>

      <!-- 入力欄 -->
      <div style="padding:10px 16px 12px;background:var(--bg-card);border-top:1px solid rgba(255,255,255,0.08)">
        <div style="display:flex;gap:8px">
          <textarea id="aw-input" placeholder="話しかけてみて..." rows="1"
            style="flex:1;min-height:40px;max-height:100px;resize:none;font-size:0.9rem;
                   padding:8px 12px;background:var(--bg-input);border:1px solid rgba(255,255,255,0.1);
                   border-radius:8px;color:var(--text-primary);font-family:inherit"></textarea>
          <button id="aw-send" class="btn btn-primary"
            style="width:40px;min-height:40px;padding:0;font-size:1.1rem;flex-shrink:0">↑</button>
        </div>
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

// ── イベントバインド ────────────────────────────────
function bindEvents() {
  const panel      = document.getElementById('aw-panel');
  const messages   = document.getElementById('aw-messages');
  const input      = document.getElementById('aw-input');
  const sendBtn    = document.getElementById('aw-send');
  const openBtn    = document.getElementById('aw-btn');
  const closeBtn   = document.getElementById('aw-close');
  const memBtn     = document.getElementById('aw-memory-btn');
  const memPanel   = document.getElementById('aw-memory-panel');
  const memClose   = document.getElementById('aw-mem-close');
  const memSave    = document.getElementById('aw-mem-save');
  const memList    = document.getElementById('aw-mem-list');

  const expandBtn    = document.getElementById('aw-expand-btn');
  const resizeHandle = document.getElementById('aw-resize-handle');

  function openPanel(fullScreen, initialMessage) {
    panel.style.display = 'flex';
    setExpanded(fullScreen);
    if (!messages.children.length) addSystemMsg('こんにちは！何でも話しかけてね💕');
    if (initialMessage) {
      input.value = initialMessage;
      sendMessage();
    }
    setTimeout(() => input.focus(), 100);
  }

  function setExpanded(expand) {
    chatExpanded = expand;
    if (expand) {
      panel.style.height = '100dvh';
      panel.style.borderRadius = '0';
      expandBtn.textContent = '⤡';
    } else {
      panel.style.height = '52vh';
      panel.style.borderRadius = '20px 20px 0 0';
      expandBtn.textContent = '⤢';
    }
  }

  // 外部からチャット画面を開く（インラインチャット入力から呼ばれる）
  _openChatFn = (msg) => openPanel(true, msg);

  // フローティングボタンで開く（下半分→続けると全画面）
  openBtn.addEventListener('click', () => openPanel(false, ''));

  // 閉じる
  closeBtn.addEventListener('click', () => { panel.style.display = 'none'; });

  // 拡大/縮小ボタン
  expandBtn.addEventListener('click', () => setExpanded(!chatExpanded));

  // ハンドルをタップで拡大/縮小
  resizeHandle.addEventListener('click', () => setExpanded(!chatExpanded));

  // メッセージが増えたら自動で拡大
  const msgObserver = new MutationObserver(() => {
    if (!chatExpanded && messages.children.length >= 4) setExpanded(true);
  });
  msgObserver.observe(messages, { childList: true });

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
      div.innerHTML = `<div style="width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0;margin-top:2px;border:1px solid rgba(212,175,55,0.3)">${AVATAR_IMG}</div>
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
