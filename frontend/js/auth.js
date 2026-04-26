import { api } from './api.js';

const form      = document.getElementById('auth-form');
const emailEl   = document.getElementById('email');
const passEl    = document.getElementById('password');
const submitBtn = document.getElementById('submit-btn');
const errorMsg  = document.getElementById('error-msg');
const tabLogin  = document.getElementById('tab-login');
const tabReg    = document.getElementById('tab-register');

let mode = 'login'; // 'login' | 'register'

tabLogin.addEventListener('click', () => setMode('login'));
tabReg.addEventListener('click',   () => setMode('register'));

function setMode(m) {
  mode = m;
  tabLogin.classList.toggle('active', m === 'login');
  tabReg.classList.toggle('active',   m === 'register');
  submitBtn.textContent = m === 'login' ? 'ログイン' : '新規登録';
  errorMsg.classList.add('hidden');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = '処理中...';

  try {
    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const data = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify({ email: emailEl.value, password: passEl.value }),
    });

    localStorage.setItem('castline_token',   data.token);
    localStorage.setItem('castline_cast_id', data.castId);
    location.href = '/dashboard';
  } catch (err) {
    errorMsg.textContent = err.message;
    errorMsg.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'login' ? 'ログイン' : '新規登録';
  }
});

// 既にログイン済みならダッシュボードへ
if (localStorage.getItem('castline_token')) {
  location.href = '/dashboard';
}
