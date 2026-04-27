import { api, requireAuth } from './api.js';

if (!requireAuth()) throw new Error('unauthenticated');

const customerId = new URLSearchParams(location.search).get('id');
if (!customerId) { location.href = '/dashboard'; throw new Error('no id'); }

let customer = null;
let editMode = false;
let selectedTone = null;

// ── AIカルテ分析（なげっぱなし入力） ─────────────
function initAnalyzeBtn() {
  const btn    = document.getElementById('analyze-btn');
  const memo   = document.getElementById('analyze-memo');
  const errEl  = document.getElementById('analyze-error');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    errEl.classList.add('hidden');
    const text = memo.value.trim();
    if (!text) { errEl.textContent = 'メモを入力してください'; errEl.classList.remove('hidden'); return; }

    btn.disabled = true;
    btn.textContent = '分析中... ✨';
    try {
      const { fields } = await api('/api/ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ customer_id: customerId, memo_text: text }),
      });

      // 編集モードを自動でONにして結果を流し込む
      if (!editMode) toggleEdit();

      const fieldMap = {
        appearance: 'edit-appearance', occupation: 'edit-occupation',
        hobbies: 'edit-hobbies', drink_preference: 'edit-drink_preference',
        birthday: 'edit-birthday', ng_topics: 'edit-ng_topics', notes: 'edit-notes',
      };
      let filled = 0;
      for (const [key, elId] of Object.entries(fieldMap)) {
        if (fields[key]) {
          const el = document.getElementById(elId);
          if (el) { el.value = fields[key]; filled++; }
        }
      }
      memo.value = '';
      btn.textContent = `✅ ${filled}項目を入力しました。確認して保存してください。`;
      setTimeout(() => { btn.textContent = '✨ AIに整理してもらう'; }, 4000);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.textContent = '✨ AIに整理してもらう';
    } finally {
      btn.disabled = false;
    }
  });
}

// ── タブ切り替え ─────────────────────────────────
document.querySelectorAll('.tab-nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-nav-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── キャッシュ（前回生成結果の復元） ─────────────────
const CACHE_KEY = `airipu_sugg_${customerId}`;

function saveSuggestionsCache(suggestions, tone) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ suggestions, tone, ts: Date.now() }));
  } catch {}
}

function loadSuggestionsCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (Date.now() - d.ts > 3600000) { localStorage.removeItem(CACHE_KEY); return null; }
    return d;
  } catch { return null; }
}

function clearSuggestionsCache() {
  localStorage.removeItem(CACHE_KEY);
}

// ── 初期ロード ───────────────────────────────────
async function init() {
  await Promise.all([loadCustomer(), loadLogs(), loadAiHistory()]);
  document.getElementById('log-date').value = new Date().toISOString().slice(0, 10);
  initAnalyzeBtn();

  // 前回の生成結果をキャッシュから復元
  const cached = loadSuggestionsCache();
  if (cached?.suggestions?.length) {
    const label = document.createElement('div');
    label.style.cssText = 'font-size:0.72rem;color:var(--text-secondary);text-align:center;padding:4px 0 6px';
    label.textContent = '↩ 前回の生成結果（新しく生成すると更新されます）';
    suggestionsEl.before(label);
    renderSavedSuggestions(cached.suggestions);
  }
}

// ── 顧客ヘッダー + カルテ描画 ────────────────────
async function loadCustomer() {
  try {
    customer = await api(`/api/customers/${customerId}`);
    renderHeader();
    renderKarte();
    document.querySelector('.cockpit-header').style.background = customer.bg_color || '#1a1a2e';

    // カルテにデータがあればAIタブをデフォルト表示
    const hasKarte = customer.appearance || customer.occupation || customer.hobbies ||
                     customer.notes || customer.ng_topics || customer.drink_preference;
    if (hasKarte) {
      document.querySelectorAll('.tab-nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="ai"]').classList.add('active');
      document.getElementById('tab-ai').classList.add('active');
    }

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
    { key: 'name',             label: '名前',              full: true },
    { key: 'nickname',         label: '呼び名' },
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
    <div class="karte-item full">
      <label>温度感 (0-100)</label>
      <span id="disp-temperature" style="font-size:1.1rem;font-weight:700">${customer.temperature ?? 50}</span>
      <input id="edit-temperature" class="hidden" type="number" min="0" max="100" value="${customer.temperature ?? 50}">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:0.72rem;color:var(--text-secondary)">
        <span>🔥 80以上 = ぜひ呼びたい</span>
        <span>😊 50〜79 = 良好</span>
        <span>😐 30〜49 = 要フォロー</span>
        <span>❄️ 30未満 = 要アラート</span>
      </div>
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
  const allKeys = ['name','nickname','appearance','occupation','hobbies','drink_preference','birthday','ng_topics','line_chat_url','notes','temperature','bg_color'];
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
    const newName = val('edit-name');
    if (!newName) {
      karteErr.textContent = '名前は必須です';
      karteErr.classList.remove('hidden');
      saveBtn.disabled = false;
      return;
    }

    await api(`/api/customers/${customerId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name:             newName,
        nickname:         val('edit-nickname'),
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
let currentLogId    = null;

toneButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedTone = btn.dataset.tone;
    toneButtons.forEach((b) => b.className = 'btn-tone');
    btn.classList.add(`active-${selectedTone.toLowerCase()}`);
  });
});

generateBtn.addEventListener('click', () => runGenerate());

async function runGenerate(refineText = null) {
  aiError.classList.add('hidden');
  if (!selectedTone) {
    aiError.textContent = 'トーンを選択してください';
    aiError.classList.remove('hidden');
    return;
  }
  generateBtn.disabled = true;
  generateBtn.textContent = '考え中... ✨';

  const contextEl = document.getElementById('ai-context');
  let context = contextEl.value.trim() || null;
  if (refineText) {
    context = `【修正依頼】元の文章: "${refineText}" / 修正内容: ${context || '自然に改善してください'}`;
  }

  // キャッシュラベルを削除して新規生成開始
  suggestionsEl.previousElementSibling?.remove?.();
  suggestionsEl.innerHTML = '';
  const slots = [0, 1, 2].map(i => {
    const card = document.createElement('div');
    card.className = 'suggestion-card card';
    card.style.cssText = `opacity:${i === 0 ? '1' : '0'};transform:translateY(${i === 0 ? '0' : '8px'});transition:opacity 0.3s,transform 0.3s;min-height:54px`;
    const textEl = document.createElement('div');
    textEl.className = 'suggestion-text';
    textEl.style.color = 'var(--text-secondary)';
    textEl.innerHTML = i === 0
      ? '<span class="spinner" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:6px"></span>生成中...'
      : '待機中...';
    card.appendChild(textEl);
    suggestionsEl.appendChild(card);
    return card;
  });

  const token = localStorage.getItem('castline_token');
  const BASE_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:8787' : 'https://aireply.aidbase11.workers.dev';

  try {
    const res = await fetch(`${BASE_URL}/api/ai/generate-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ customer_id: customerId, tone: selectedTone, additional_context: context }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const data = JSON.parse(raw);

          // text_chunk: 文字が届くたびにカードを更新
          if (data.event === 'text_chunk' && data.data?.text) {
            accumulated += data.data.text;
            updateSlots(accumulated, slots);
          }

          // workflow_finished: 確定テキストでカードをFinalize
          if (data.event === 'workflow_finished') {
            const outputs = data.data?.outputs ?? {};
            const rawText =
              outputs['text'] || outputs['result'] ||
              Object.values(outputs).find(v => typeof v === 'string') || accumulated;
            if (rawText) {
              const suggestions = parseSuggestions(String(rawText));
              finalizeSlots(slots, suggestions);
              saveSuggestionsCache(suggestions, selectedTone);
              // Dify2回目不要: 生成済みテキストをそのままDBに保存
              api('/api/ai/save-generated-log', {
                method: 'POST',
                body: JSON.stringify({ customer_id: customerId, tone: selectedTone, texts: suggestions, additional_context: context }),
              }).then(r => { if (r?.log_id) currentLogId = r.log_id; }).catch(() => {});
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    aiError.textContent = err.message;
    aiError.classList.remove('hidden');
    suggestionsEl.innerHTML = '';
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '返信を考える ✨';
  }
}

function parseSuggestions(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr) && arr.every(v => typeof v === 'string')) return arr.slice(0, 3);
    } catch {}
  }
  const byDelim = text.split(/\n?={3,}\n?|\n?-{3,}\n?/).map(s => s.trim()).filter(Boolean);
  if (byDelim.length >= 2) return byDelim.slice(0, 3);
  const byNum = text.split(/\n?\d+[\.\)]\s+/).map(s => s.trim()).filter(Boolean);
  if (byNum.length >= 2) return byNum.slice(0, 3);
  return [text.trim()];
}

// キャッシュから復元した提案を表示（スロットなし即時表示）
function renderSavedSuggestions(suggestions) {
  suggestionsEl.innerHTML = '';
  const slots = suggestions.map(() => {
    const card = document.createElement('div');
    card.className = 'suggestion-card card';
    card.style.cssText = 'opacity:1';
    const textEl = document.createElement('div');
    textEl.className = 'suggestion-text';
    card.appendChild(textEl);
    suggestionsEl.appendChild(card);
    return card;
  });
  finalizeSlots(slots, suggestions);
}

// streaming中: text_chunkが届くたびにカードを更新
function updateSlots(accumulated, slots) {
  const trimmed = accumulated.trim();

  // JSON形式の場合はカード1に「生成中」表示のみ（完了後に確定）
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return;

  // === または --- で分割してリアルタイム更新
  const parts = accumulated.split(/\n?={3,}\n?|\n?-{3,}\n?/);

  for (let i = 0; i < Math.min(parts.length, 3); i++) {
    const part = parts[i];
    const card = slots[i];
    const textEl = card.querySelector('.suggestion-text');

    // カードを表示
    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';
    textEl.style.color = 'var(--text-primary)';
    textEl.textContent = part;

    // 次のカードが「待機中」のままなら「生成中」に切り替え
    if (i < parts.length - 1 && i + 1 < 3) {
      const next = slots[i + 1];
      next.style.opacity = '0.6';
      next.style.transform = 'translateY(0)';
      const nextText = next.querySelector('.suggestion-text');
      if (nextText.textContent === '待機中...') {
        nextText.innerHTML = '<span class="spinner" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:6px"></span>生成中...';
      }
    }
  }
}

// workflow_finished後: 確定テキストでカードを完成させてボタンを追加
function finalizeSlots(slots, suggestions) {
  // 余分なスロットを削除
  for (let i = suggestions.length; i < slots.length; i++) slots[i].remove();

  suggestions.forEach((text, i) => {
    const card = slots[i];
    if (!card) return;

    card.style.opacity = '1';
    card.style.transform = 'translateY(0)';

    const textEl = card.querySelector('.suggestion-text');
    textEl.textContent = text;
    textEl.style.color = 'var(--text-primary)';

    // ボタン行を追加（既存があれば削除）
    card.querySelector('.suggestion-btns')?.remove();
    const btnRow = document.createElement('div');
    btnRow.className = 'suggestion-btns';

    const refineBtn = document.createElement('button');
    refineBtn.className = 'btn btn-secondary';
    refineBtn.textContent = '✏️ 修正';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-primary';
    copyBtn.textContent = '📋 コピー';

    btnRow.appendChild(refineBtn);
    btnRow.appendChild(copyBtn);
    card.appendChild(btnRow);

    // 修正エリア
    const refineArea = document.createElement('div');
    refineArea.className = 'refine-area hidden';
    refineArea.style.marginTop = '10px';
    const refineInput = document.createElement('input');
    refineInput.type = 'text';
    refineInput.placeholder = '修正内容（例: もっと短く、絵文字を増やす）';
    const refineSubmit = document.createElement('button');
    refineSubmit.className = 'btn btn-secondary';
    refineSubmit.style.cssText = 'margin-top:6px;font-size:0.85rem';
    refineSubmit.textContent = '再生成する';
    refineArea.appendChild(refineInput);
    refineArea.appendChild(refineSubmit);
    card.appendChild(refineArea);

    const rawText = text;
    const idx = i;

    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(rawText);
      copyBtn.textContent = '✓ コピー済み';
      copyBtn.style.background = 'rgba(129,199,132,0.3)';
      setTimeout(() => { copyBtn.textContent = '📋 コピー'; copyBtn.style.background = ''; }, 3000);
      clearSuggestionsCache(); // コピーしたらキャッシュクリア（次回は履歴のみ）
      if (currentLogId) {
        api(`/api/ai/logs/${currentLogId}`, {
          method: 'PUT',
          body: JSON.stringify({ selected_index: idx }),
        }).then(() => loadAiHistory()).catch(() => {});
      }
    });

    refineBtn.addEventListener('click', () => refineArea.classList.toggle('hidden'));

    refineSubmit.addEventListener('click', () => {
      const note = refineInput.value.trim();
      if (!note) { refineInput.placeholder = '修正内容を入力してください'; return; }
      document.getElementById('ai-context').value = note;
      runGenerate(rawText);
    });
  });
}

// 採用返信の履歴を読み込み・表示
async function loadAiHistory() {
  const histEl = document.getElementById('ai-history');
  if (!histEl) return;
  try {
    const logs = await api(`/api/customers/${customerId}/ai-logs`);
    if (!logs.length) {
      histEl.innerHTML = '<div class="text-secondary" style="font-size:0.82rem">採用した返信がまだありません</div>';
      return;
    }
    const TONE_ICONS = { Sweet:'💕', Cool:'😎', Business:'💼', Care:'🤗' };
    histEl.innerHTML = logs.map((l) => `
      <div class="card" style="margin-bottom:8px;padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:0.75rem;color:var(--text-secondary)">${l.created_at?.slice(0,10)} ${TONE_ICONS[l.tone]||''} ${l.tone}</span>
          <button class="btn btn-secondary hist-copy" data-text="${esc(l.selected_text)}"
                  style="font-size:0.75rem;padding:3px 10px;min-height:28px;width:auto">再利用</button>
        </div>
        <div style="font-size:0.88rem;line-height:1.6">${esc(l.selected_text)}</div>
      </div>`).join('');

    histEl.querySelectorAll('.hist-copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(btn.dataset.text);
        btn.textContent = '✓ コピー';
        setTimeout(() => { btn.textContent = '再利用'; }, 2000);
      });
    });
  } catch {
    histEl.innerHTML = '';
  }
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
