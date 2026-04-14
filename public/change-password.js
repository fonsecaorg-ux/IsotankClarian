(function () {
  'use strict';

  function ensureStyles() {
    if (document.getElementById('changePasswordStyles')) return;
    const style = document.createElement('style');
    style.id = 'changePasswordStyles';
    style.textContent = `
      .change-password-link {
        border: 1px solid var(--color-border, #edebe9);
        background: var(--color-surface, #fff);
        color: var(--color-primary, #0078d4);
        border-radius: 8px;
        min-height: 36px;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .cp-modal-bg {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, .6);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 3000;
        padding: 12px;
      }
      .cp-modal-bg.active { display: flex; }
      .cp-modal {
        width: min(460px, 100%);
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border, #edebe9);
        border-radius: 10px;
        padding: 12px;
      }
      .cp-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }
      .cp-title {
        font-size: 16px;
        font-weight: 800;
        color: var(--color-primary, #0078d4);
      }
      .cp-field { margin-bottom: 10px; }
      .cp-field label {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        color: var(--color-text-muted, #605e5c);
      }
      .cp-field input {
        width: 100%;
        height: 40px;
        border: 1px solid var(--color-border, #edebe9);
        border-radius: 8px;
        padding: 0 10px;
        background: var(--color-surface, #fff);
        color: var(--color-text, #323130);
      }
      .cp-inline-error {
        min-height: 14px;
        font-size: 12px;
        color: #a80000;
        margin-top: 4px;
      }
      .cp-strength-wrap { margin: 6px 0 10px; }
      .cp-strength-bar {
        width: 100%;
        height: 8px;
        border-radius: 999px;
        background: #edebe9;
        overflow: hidden;
      }
      .cp-strength-fill {
        height: 100%;
        width: 0%;
        transition: width .2s ease;
      }
      .cp-strength-label {
        margin-top: 4px;
        font-size: 12px;
        color: var(--color-text-muted, #605e5c);
      }
      .cp-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 10px;
      }
      .cp-btn {
        border: 1px solid var(--color-border, #edebe9);
        background: var(--color-surface, #fff);
        color: var(--color-text, #323130);
        border-radius: 8px;
        min-height: 38px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .cp-btn.primary {
        border-color: var(--color-primary, #0078d4);
        background: var(--color-primary, #0078d4);
        color: #fff;
      }
      .cp-global-error {
        min-height: 16px;
        font-size: 12px;
        color: #a80000;
      }
    `;
    document.head.appendChild(style);
  }

  function showToast(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'success');
      return;
    }

    let toast = document.getElementById('cpFallbackToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cpFallbackToast';
      toast.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:4000;padding:8px 14px;border-radius:999px;background:#fff;border:1px solid #edebe9;font-size:12px;font-weight:700;';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.display = 'none'; }, 3000);
  }

  function scorePassword(password) {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  }

  function strengthMeta(score) {
    if (score <= 1) return { label: 'Força: fraca', width: '33%', color: '#a80000' };
    if (score <= 3) return { label: 'Força: média', width: '66%', color: '#ff8c00' };
    return { label: 'Força: forte', width: '100%', color: '#107c10' };
  }

  function createModal() {
    const bg = document.createElement('div');
    bg.className = 'cp-modal-bg';
    bg.innerHTML = `
      <div class="cp-modal">
        <div class="cp-modal-head">
          <h3 class="cp-title">Alterar senha</h3>
          <button type="button" class="cp-btn" id="cpClose">Fechar</button>
        </div>
        <form id="cpForm" novalidate>
          <div class="cp-field">
            <label for="cpSenhaAtual">Senha atual</label>
            <input id="cpSenhaAtual" type="password" autocomplete="current-password" required>
            <p class="cp-inline-error" id="cpErrAtual"></p>
          </div>
          <div class="cp-field">
            <label for="cpNovaSenha">Nova senha</label>
            <input id="cpNovaSenha" type="password" autocomplete="new-password" required>
            <p class="cp-inline-error" id="cpErrNova"></p>
          </div>
          <div class="cp-strength-wrap">
            <div class="cp-strength-bar"><div class="cp-strength-fill" id="cpStrengthFill"></div></div>
            <p class="cp-strength-label" id="cpStrengthLabel">Força: fraca</p>
          </div>
          <div class="cp-field">
            <label for="cpConfirmarSenha">Confirmar nova senha</label>
            <input id="cpConfirmarSenha" type="password" autocomplete="new-password" required>
            <p class="cp-inline-error" id="cpErrConfirmar"></p>
          </div>
          <p class="cp-global-error" id="cpGlobalError"></p>
          <div class="cp-actions">
            <button type="button" class="cp-btn" id="cpCancel">Cancelar</button>
            <button type="submit" class="cp-btn primary" id="cpSave">Salvar</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(bg);
    return bg;
  }

  async function apiPatchPassword(payload) {
    const res = await fetch('/auth/password', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro ao alterar senha.');
    return data;
  }

  function mountChangePassword() {
    const logoutBtn = document.getElementById('btnLogout');
    if (!logoutBtn || document.getElementById('btnChangePassword')) return;

    ensureStyles();

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.id = 'btnChangePassword';
    openBtn.className = 'change-password-link';
    openBtn.textContent = 'Alterar senha';
    logoutBtn.parentElement.insertBefore(openBtn, logoutBtn);

    const modalBg = createModal();
    const cpForm = modalBg.querySelector('#cpForm');
    const cpClose = modalBg.querySelector('#cpClose');
    const cpCancel = modalBg.querySelector('#cpCancel');
    const cpSave = modalBg.querySelector('#cpSave');
    const cpSenhaAtual = modalBg.querySelector('#cpSenhaAtual');
    const cpNovaSenha = modalBg.querySelector('#cpNovaSenha');
    const cpConfirmarSenha = modalBg.querySelector('#cpConfirmarSenha');
    const cpErrAtual = modalBg.querySelector('#cpErrAtual');
    const cpErrNova = modalBg.querySelector('#cpErrNova');
    const cpErrConfirmar = modalBg.querySelector('#cpErrConfirmar');
    const cpGlobalError = modalBg.querySelector('#cpGlobalError');
    const cpStrengthFill = modalBg.querySelector('#cpStrengthFill');
    const cpStrengthLabel = modalBg.querySelector('#cpStrengthLabel');

    function clearErrors() {
      cpErrAtual.textContent = '';
      cpErrNova.textContent = '';
      cpErrConfirmar.textContent = '';
      cpGlobalError.textContent = '';
    }

    function closeModal() {
      modalBg.classList.remove('active');
      cpForm.reset();
      clearErrors();
      const meta = strengthMeta(0);
      cpStrengthFill.style.width = meta.width;
      cpStrengthFill.style.background = meta.color;
      cpStrengthLabel.textContent = meta.label;
    }

    function openModal() {
      modalBg.classList.add('active');
      cpSenhaAtual.focus();
    }

    cpNovaSenha.addEventListener('input', () => {
      const meta = strengthMeta(scorePassword(cpNovaSenha.value || ''));
      cpStrengthFill.style.width = meta.width;
      cpStrengthFill.style.background = meta.color;
      cpStrengthLabel.textContent = meta.label;
    });

    openBtn.addEventListener('click', openModal);
    cpClose.addEventListener('click', closeModal);
    cpCancel.addEventListener('click', closeModal);
    modalBg.addEventListener('click', (ev) => {
      if (ev.target === modalBg) closeModal();
    });

    cpForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      clearErrors();

      const payload = {
        senhaAtual: String(cpSenhaAtual.value || ''),
        novaSenha: String(cpNovaSenha.value || ''),
        confirmarSenha: String(cpConfirmarSenha.value || ''),
      };

      let hasError = false;
      if (!payload.senhaAtual) { cpErrAtual.textContent = 'Informe a senha atual.'; hasError = true; }
      if (!payload.novaSenha) { cpErrNova.textContent = 'Informe a nova senha.'; hasError = true; }
      if (!payload.confirmarSenha) { cpErrConfirmar.textContent = 'Confirme a nova senha.'; hasError = true; }
      if (payload.novaSenha && payload.novaSenha.length < 8) { cpErrNova.textContent = 'Mínimo de 8 caracteres.'; hasError = true; }
      if (payload.novaSenha && !/[A-Z]/.test(payload.novaSenha)) { cpErrNova.textContent = 'Inclua pelo menos 1 letra maiúscula.'; hasError = true; }
      if (payload.novaSenha && !/\d/.test(payload.novaSenha)) { cpErrNova.textContent = 'Inclua pelo menos 1 número.'; hasError = true; }
      if (payload.novaSenha && payload.confirmarSenha && payload.novaSenha !== payload.confirmarSenha) {
        cpErrConfirmar.textContent = 'As senhas não conferem.';
        hasError = true;
      }
      if (hasError) return;

      cpSave.disabled = true;
      try {
        await apiPatchPassword(payload);
        closeModal();
        showToast('Senha alterada com sucesso', 'success');
      } catch (err) {
        cpGlobalError.textContent = err.message;
      } finally {
        cpSave.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountChangePassword);
  } else {
    mountChangePassword();
  }
})();
