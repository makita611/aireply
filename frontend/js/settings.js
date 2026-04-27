import { api, requireAuth } from './api.js';

if (!requireAuth()) throw new Error('unauthenticated');

const stageNameEl   = document.getElementById('stage-name');
const castAgeEl     = document.getElementById('cast-age');
const shopNameEl    = document.getElementById('shop-name');
const castHobbiesEl = document.getElementById('cast-hobbies');
const characterEl   = document.getElementById('character-prompt');
const sampleLinesEl = document.getElementById('sample-lines');
const saveBtn       = document.getElementById('save-btn');
const errorEl       = document.getElementById('settings-error');
const successEl     = document.getElementById('settings-success');

const AVATARS = ['🤖','✨','💫','🌙','👑','💎','🦋','🌸','⭐','🎀','🌺','🔮','🦄','🍀','💝'];
let selectedAvatar = '🤖';

// アバターグリッドを生成
const avatarGrid = document.getElementById('avatar-grid');
avatarGrid.innerHTML = AVATARS.map(a => `
  <button class="avatar-choice" data-avatar="${a}"
    style="font-size:1.8rem;background:var(--bg-input);border:2px solid transparent;
           border-radius:10px;padding:8px;cursor:pointer;line-height:1;transition:all 0.15s">
    ${a}
  </button>`).join('');

avatarGrid.querySelectorAll('.avatar-choice').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedAvatar = btn.dataset.avatar;
    updateAvatarGrid();
  });
});

function updateAvatarGrid() {
  avatarGrid.querySelectorAll('.avatar-choice').forEach(btn => {
    btn.style.borderColor = btn.dataset.avatar === selectedAvatar ? 'var(--accent-gold)' : 'transparent';
    btn.style.background  = btn.dataset.avatar === selectedAvatar ? 'rgba(212,175,55,0.15)' : 'var(--bg-input)';
  });
}

async function loadSettings() {
  try {
    const data = await api('/api/cast/settings');
    stageNameEl.value   = data.stage_name ?? '';
    castAgeEl.value     = data.age ?? '';
    shopNameEl.value    = data.shop_name ?? '';
    castHobbiesEl.value = data.cast_hobbies ?? '';
    characterEl.value   = data.character_prompt ?? '';
    if (data.chat_avatar) { selectedAvatar = data.chat_avatar; updateAvatarGrid(); }

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

saveBtn.addEventListener('click', async () => {
  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  const sampleLines = sampleLinesEl.value
    .split('\n').map((l) => l.trim()).filter(Boolean);

  try {
    await api('/api/cast/settings', {
      method: 'PUT',
      body: JSON.stringify({
        stage_name:       stageNameEl.value.trim() || null,
        age:              castAgeEl.value ? Number(castAgeEl.value) : null,
        shop_name:        shopNameEl.value.trim() || null,
        cast_hobbies:     castHobbiesEl.value.trim() || null,
        character_prompt: characterEl.value.trim() || null,
        sample_lines:     sampleLines.length ? sampleLines : null,
        chat_avatar:      selectedAvatar,
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
