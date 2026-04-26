import { api, requireAuth } from './api.js';

if (!requireAuth()) throw new Error('unauthenticated');

const stageNameEl      = document.getElementById('stage-name');
const characterEl      = document.getElementById('character-prompt');
const sampleLinesEl    = document.getElementById('sample-lines');
const saveBtn          = document.getElementById('save-btn');
const errorEl          = document.getElementById('settings-error');
const successEl        = document.getElementById('settings-success');

// ── 現在の設定を読み込む ──────────────────────────
async function loadSettings() {
  try {
    const data = await api('/api/cast/settings');
    stageNameEl.value   = data.stage_name ?? '';
    characterEl.value   = data.character_prompt ?? '';

    // sample_lines は JSON配列 or テキスト
    if (data.sample_lines) {
      try {
        const arr = JSON.parse(data.sample_lines);
        sampleLinesEl.value = Array.isArray(arr) ? arr.join('\n') : data.sample_lines;
      } catch {
        sampleLinesEl.value = data.sample_lines;
      }
    }
  } catch (err) {
    showError(err.message);
  }
}

// ── 保存 ─────────────────────────────────────────
saveBtn.addEventListener('click', async () => {
  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  // テキストエリアの各行を配列に変換
  const sampleLines = sampleLinesEl.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  try {
    await api('/api/cast/settings', {
      method: 'PUT',
      body: JSON.stringify({
        stage_name:        stageNameEl.value.trim() || null,
        character_prompt:  characterEl.value.trim() || null,
        sample_lines:      sampleLines.length ? sampleLines : null,
      }),
    });
    successEl.classList.remove('hidden');
    setTimeout(() => successEl.classList.add('hidden'), 3000);
  } catch (err) {
    showError(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '設定を保存';
  }
});

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

loadSettings();
