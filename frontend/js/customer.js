import { api, requireAuth } from './api.js';

if (!requireAuth()) throw new Error('unauthenticated');

const customerId = new URLSearchParams(location.search).get('id');
if (!customerId) { location.href = '/dashboard'; throw new Error('no id'); }

let customer = null;
let editMode = false;
let selectedTone = null;

// ── タブ切り替え ─────────────────────────────────
document.querySelectorAll('.tab-nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── 初期ロード ───────────────────────────────────
async function init() {
  await Promise.all([loadCustomer(), loadLogs()]);
  document.getElementById('log-date').value = new Date().toISOString().slice(0, 10);
}

// ── 顧客ヘッダー + カルテ描画 ────────────────────
async function loadCustomer() {
  try {
    customer = await api(`/api/customers/${customerId}`);
    renderHeader();
    renderKarte();
    document.querySelector('.cockpit-header').style.background = customer.bg_color || '#1a1a2e';
  // アーカイブ状態でボタンラベルを変更
  const deleteBtn = document.getElementById('delete-btn');
  deleteBtn.textContent = customer.archived ? '📦 戻す' : '📦 アーカイブ';
  deleteBtn.className = customer.archived ? 'btn btn-secondary' : 'btn btn-secondary';
  deleteBtn.style.cssText = 'width:auto;padding:0 12px;font-size:0.8rem;min-height:36px';
  } catch (err) {
    document.getElementById('karte-header').innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

function renderHeader() {
  // LINE開くボタン: 公式チャットURL優先、なければ個人LINE ID
  let lineBtn = '';
  if (customer.line_chat_url) {
    lineBtn = `<button class="btn btn-line" onclick="window.open('${customer.line_chat_url}','_blank')">💬 LINEチャットを開く</button>`;
  } else if (customer.line_id) {
    lineBtn = `<button class="btn btn-line" onclick="window.open('https://line.me/R/ti/p/${encodeURIComponent(customer.line_id)}','_blank')">💬 LINE を開く</button>`;
  } else {
    lineBtn = `<div class="text-secondary mt-8" style="font-size:0.78rem">カルテ編集からLINEチャットURLを登録するとワンタップで開けます</div>`;
  }

  document.getElementById('karte-header').innerHTML = `
    <div class="customer-name-big">${esc(customer.name)}</div>
    ${customer.nickname ? `<div style="color:var(--text-secondary);font-size:0.9rem">（${esc(customer.nickname)}）</div>` : ''}
    ${lineBtn}`;
}

function renderKarte() {
  const fields = [
    { key: 'appearance',       label: '見た目メモ',        full: true, type: 'textarea' },
    { key: 'occupation',       label: '職業' },
    { key: 'hobbies',          label: '趣味' },
    { key: 'drink_preference', label: '酒の好み' },
    { key: 'birthday',         label: '誕生日' },
    { key: 'ng_topics',        label: 'NG話題',            full: true, type: 'textarea' },
    { key: 'line_chat_url',    label: 'LINEチャットURL',   full: true, placeholder: 'LINEで相手のメッセージを長押し→リンクをコピー して貼り付け' },
    { key: 'notes',            label: '自由メモ',          full: true, type: 'textarea' },
  ];

  const specialFields = `
    <div class="karte-item">
      <label>温度感 (0-100)</label>
      <span id="disp-temperature">${customer.temperature ?? 50}</span>
      <input id="edit-temperature" class="hidden" type="number" min="0" max="100" value="${customer.temperature ?? 50}">
    </div>
    <div class="karte-item">
      <label>背景色</label>
      <span id="disp-bg_color" style="display:flex;align-items:center;gap:8px;">
        <span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${customer.bg_color || '#1a1a2e'};border:1px solid rgba(255,255,255,0.3)"></span>
        ${esc(customer.bg_color || '#1a1a2e')}
      </span>
      <input id="edit-bg_color" class="hidden" type="color" value="${customer.bg_color || '#1a1a2e'}" style="height:36px;padding:2px 6px;width:100%;">
    </div>`;

  document.getElementById('karte-fields-area').innerHTML = `
    <div id="karte-error" class="error-msg hidden"></div>
    <div class="karte-grid">
      ${fields.map((f) => {
        const val = esc(customer[f.key] ?? '');
        const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '';
        const inputEl = f.type === 'textarea'
          ? `<textarea id="edit-${f.key}" class="hidden" style="min-height:60px" ${ph}>${val}</textarea>`
          : `<input id="edit-${f.key}" class="hidden" type="text" value="${val}" ${ph}>`;
        return `
          <div class="karte-item ${f.full ? 'full' : ''}">
            <label>${f.label}</label>
            <span id="disp-${f.key}">${esc(customer[f.key]) || '<span style="color:var(--text-secondary)">-</span>'}</span>
            ${inputEl}
          </div>`;
      }).join('')}
      ${specialFields}
    </div>
    <div id="edit-actions" style="display:none;gap:8px;margin-top:16px">
      <button class="btn btn-secondary" id="cancel-edit-btn">キャンセル</button>
      <button class="btn btn-primary"   id="save-btn">保存する</button>
    </div>
    <button class="btn btn-secondary" id="edit-btn" style="margin-top:12px">✏️ 編集</button>`;

  document.getElementById('edit-btn').addEventListener('click', toggleEdit);
}

// 編集モード切り替え
function toggleEdit() {
  editMode = !editMode;
  const allKeys = ['appearance','occupation','hobbies','drink_preference','birthday','ng_topics','line_chat_url','notes','temperature','bg_color'];
  allKeys.forEach((k) => {
    document.getElementById(`disp-${k}`)?.classList.toggle('hidden', editMode);
    document.getElementById(`edit-${k}`)?.classList.toggle('hidden', !editMode);
  });
  const editActions = document.getElementById('edit-actions');
  editActions.style.display = editMode ? 'flex' : 'none';
  document.getElementById('edit-btn').style.display = editMode ? 'none' : '';

  if (editMode) {
    document.getElementById('save-btn').onclick = saveCustomer;
    document.getElementById('cancel-edit-btn').onclick = () => { editMode = false; renderKarte(); };
  }
}

async function saveCustomer() {
  const saveBtn = document.getElementById('save-btn');
  const karteErr = document.getElementById('karte-error');
  karteErr.classList.add('hidden');
  saveBtn.disabled = true;

  const val = (id) => document.getElementById(id)?.value?.trim() || null;
  // LINEチャットURLは ?messageId=... を除去して保存
  const lineChatRaw = val('edit-line_chat_url');
  const lineChatUrl = lineChatRaw ? lineChatRaw.replace(/\?.*$/, '') : null;

  try {
    await api(`/api/customers/${customerId}`, {
      method: 'PUT',
      body: JSON.stringify({
        appearance:       val('edit-appearance'),
        occupation:       val('edit-occupation'),
        hobbies:          val('edit-hobbies'),
        drink_preference: val('edit-drink_preference'),
        birthday:         val('edit-birthday'),
        line_id:          val('edit-line_id'),
        ng_topics:        val('edit-ng_topics'),
        line_chat_url:    lineChatUrl,
        notes:            val('edit-notes'),
        temperature:      Number(val('edit-temperature')) || null,
        bg_color:         val('edit-bg_color'),
      }),
    });
    await loadCustomer();
    editMode = false;
  } catch (err) {
    karteErr.textContent = err.message;
    karteErr.classList.remove('hidden');
    saveBtn.disabled = false;
  }
}

// ── 削除 / アーカイブ ────────────────────────────
document.getElementById('delete-btn').addEventListener('click', async () => {
  const name = customer?.name ?? '';
  const isArchived = customer?.archived;

  const choice = confirm(
    isArchived
      ? `「${name}」をアーカイブから戻しますか？\n\nOK → 通常に戻す\nキャンセル → そのまま`
      : `「${name}」をどうしますか？\n\nOK → アーカイブ（非表示、後から戻せる）\nキャンセル → 何もしない`
  );
  if (!choice) return;

  if (isArchived) {
    // アーカイブ解除
    try {
      await api(`/api/customers/${customerId}`, {
        method: 'PUT',
        body: JSON.stringify({ archived: 0 }),
      });
      location.href = '/dashboard';
    } catch (err) { alert(err.message); }
  } else {
    // アーカイブ
    try {
      await api(`/api/customers/${customerId}`, {
        method: 'PUT',
        body: JSON.stringify({ archived: 1 }),
      });
      location.href = '/dashboard';
    } catch (err) { alert(err.message); }
  }
});

// ── AI返信生成 ────────────────────────────────────
const toneButtons   = document.querySelectorAll('.btn-tone');
const generateBtn   = document.getElementById('generate-btn');
const suggestionsEl = document.getElementById('suggestions');
const aiError       = document.getElementById('ai-error');

toneButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedTone = btn.dataset.tone;
    toneButtons.forEach((b) => b.className = 'btn-tone');
    btn.classList.add(`active-${selectedTone.toLowerCase()}`);
  });
});

generateBtn.addEventListener('click', async () => {
  aiError.classList.add('hidden');
  if (!selectedTone) {
    aiError.textContent = 'トーンを選択してください';
    aiError.classList.remove('hidden');
    return;
  }
  generateBtn.disabled = true;
  generateBtn.textContent = '考え中... ✨';
  suggestionsEl.innerHTML = '<div class="loading"><div class="spinner"></div>AI返信を生成中...</div>';

  try {
    const { suggestions } = await api('/api/ai/generate', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId,
        tone: selectedTone,
        additional_context: document.getElementById('ai-context').value.trim() || null,
      }),
    });
    renderSuggestions(suggestions);
  } catch (err) {
    aiError.textContent = err.message;
    aiError.classList.remove('hidden');
    suggestionsEl.innerHTML = '';
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '返信を考える ✨';
  }
});

function renderSuggestions(suggestions) {
  suggestionsEl.innerHTML = suggestions.map((text) => `
    <div class="suggestion-card card" style="margin-bottom:10px">
      <div class="suggestion-text">${esc(text)}</div>
      <button class="btn btn-secondary suggestion-copy" data-text="${esc(text)}">コピー</button>
    </div>`).join('');

  suggestionsEl.querySelectorAll('.suggestion-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(btn.dataset.text);
      btn.textContent = '✓ コピー済み';
      setTimeout(() => { btn.textContent = 'コピー'; }, 2000);
    });
  });
}

// ── 対応履歴 ─────────────────────────────────────
const LOG_ICONS = { '来店':'🍾', 'LINE':'💬', '店外':'☕', 'その他':'📌' };
const LOG_TYPES_LIST = ['来店', 'LINE', '店外', 'その他'];

async function loadLogs() {
  const logList = document.getElementById('log-list');
  try {
    const logs = await api(`/api/customers/${customerId}/logs`);
    if (!logs.length) {
      logList.innerHTML = '<div class="text-secondary">対応履歴がありません</div>';
      return;
    }
    logList.innerHTML = logs.map((l) => {
      const icon = LOG_ICONS[l.log_type] || '📌';
      const drinkInfo = l.drink_ordered && l.log_type === '来店'
        ? `<span style="color:var(--accent-gold);font-size:0.8rem;margin-left:8px">🍶 ${esc(l.drink_ordered)}</span>`
        : '';
      return `
        <div class="log-item" data-log-id="${l.id}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <div class="log-view">
              <div class="log-date">
                ${icon} <strong>${esc(l.log_type)}</strong>
                <span style="margin-left:8px;color:var(--text-secondary)">${l.log_date}</span>
                ${drinkInfo}
              </div>
              <div class="log-memo" style="margin-top:4px">${esc(l.memo) || '<span style="color:var(--text-secondary);font-size:0.85rem">メモなし</span>'}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button class="btn btn-icon log-edit-btn" data-id="${l.id}" style="width:36px;height:36px;font-size:0.8rem" title="編集">✏️</button>
              <button class="btn btn-danger log-del-btn"  data-id="${l.id}" style="width:36px;height:36px;font-size:0.8rem" title="削除">🗑</button>
            </div>
          </div>
          <div class="log-edit-form" data-id="${l.id}" style="display:none;margin-top:10px;padding:12px;background:var(--bg-input);border-radius:8px">
            <div class="form-group">
              <label>日にち</label>
              <input type="date" class="log-edit-date" value="${l.log_date}">
            </div>
            <div class="form-group">
              <label>種別</label>
              <select class="log-edit-type">
                ${LOG_TYPES_LIST.map(t => `<option value="${t}" ${t === l.log_type ? 'selected' : ''}>${LOG_ICONS[t]} ${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>メモ</label>
              <textarea class="log-edit-memo" style="min-height:60px">${esc(l.memo ?? '')}</textarea>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-secondary log-edit-cancel" style="font-size:0.85rem">キャンセル</button>
              <button class="btn btn-primary  log-edit-save"   style="font-size:0.85rem" data-id="${l.id}">保存</button>
            </div>
          </div>
        </div>`;
    }).join('');

    // 編集ボタン
    logList.querySelectorAll('.log-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = logList.querySelector(`.log-edit-form[data-id="${btn.dataset.id}"]`);
        const view = form.previousElementSibling.querySelector('.log-view');
        const isOpen = form.style.display !== 'none';
        form.style.display = isOpen ? 'none' : 'block';
        btn.textContent = isOpen ? '✏️' : '✕';
      });
    });

    // 保存ボタン
    logList.querySelectorAll('.log-edit-save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const logId = btn.dataset.id;
        const form = logList.querySelector(`.log-edit-form[data-id="${logId}"]`);
        btn.disabled = true;
        try {
          await api(`/api/customers/${customerId}/logs/${logId}`, {
            method: 'PUT',
            body: JSON.stringify({
              log_date:     form.querySelector('.log-edit-date').value,
              log_type:     form.querySelector('.log-edit-type').value,
              memo:         form.querySelector('.log-edit-memo').value.trim() || null,
            }),
          });
          await loadLogs();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });

    // キャンセルボタン
    logList.querySelectorAll('.log-edit-cancel').forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = btn.closest('.log-edit-form');
        form.style.display = 'none';
        form.closest('.log-item').querySelector('.log-edit-btn').textContent = '✏️';
      });
    });

    // 削除ボタン
    logList.querySelectorAll('.log-del-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('この対応履歴を削除しますか？')) return;
        try {
          await api(`/api/customers/${customerId}/logs/${btn.dataset.id}`, { method: 'DELETE' });
          await loadLogs();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    logList.innerHTML = `<div class="error-msg">${err.message}</div>`;
  }
}

// 種別に応じてお酒フィールドを表示/非表示
document.getElementById('log-type').addEventListener('change', (e) => {
  document.getElementById('drink-field').style.display =
    e.target.value === '来店' ? '' : 'none';
});

document.getElementById('log-submit').addEventListener('click', async () => {
  const date  = document.getElementById('log-date').value;
  const type  = document.getElementById('log-type').value;
  const memo  = document.getElementById('log-memo').value.trim();
  const drink = document.getElementById('log-drink').value.trim();
  if (!date) { alert('日にちを入力してください'); return; }

  const btn = document.getElementById('log-submit');
  btn.disabled = true;
  try {
    await api(`/api/customers/${customerId}/logs`, {
      method: 'POST',
      body: JSON.stringify({
        log_date: date,
        log_type: type,
        memo: memo || null,
        drink_ordered: type === '来店' ? (drink || null) : null,
      }),
    });
    document.getElementById('log-memo').value  = '';
    document.getElementById('log-drink').value = '';
    await loadLogs();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

// ── ヘルパー ─────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

init();
