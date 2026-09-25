/* drive.js - salva arquivos no Google Drive direto do navegador (Google Identity Services + Drive API v3).
   Precisa de dados/config.json com { "googleClientId": "xxxx.apps.googleusercontent.com", "drivePasta": "Precifica-Fieg" }.
   O script https://accounts.google.com/gsi/client é carregado sob demanda. */
(function (root) {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  let token = null, tokenExp = 0;

  function carregarGis() {
    return new Promise((res, rej) => {
      if (root.google && root.google.accounts) return res();
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.onload = res; s.onerror = () => rej(new Error('não foi possível carregar o Google Identity')); document.head.appendChild(s);
    });
  }
  async function obterToken(config) {
    if (token && Date.now() < tokenExp - 60000) return token;
    await carregarGis();
    return new Promise((res, rej) => {
      const client = root.google.accounts.oauth2.initTokenClient({
        client_id: config.googleClientId, scope: SCOPE,
        callback: r => { if (r.error) return rej(new Error(r.error)); token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000; res(token); }
      });
      client.requestAccessToken({ prompt: token ? '' : 'consent' });
    });
  }
  async function api(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error('Drive ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return r.json();
  }
  async function pastaId(tok, nome, pai) {
    const q = encodeURIComponent(`name='${nome.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (pai ? ` and '${pai}' in parents` : ''));
    const r = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, { headers: { Authorization: 'Bearer ' + tok } });
    if (r.files && r.files.length) return r.files[0].id;
    const meta = { name: nome, mimeType: 'application/vnd.google-apps.folder' }; if (pai) meta.parents = [pai];
    const c = await api('https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(meta) });
    return c.id;
  }
  async function enviar(tok, pasta, nome, blob) {
    const meta = { name: nome, parents: [pasta] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', blob);
    const r = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: form });
    return { nome: r.name, link: r.webViewLink };
  }
  /* arquivos: [[nome, blob], ...] */
  async function salvar(config, pasta, arquivos, onStatus, cliente) {
    const tok = await obterToken(config);
    onStatus && onStatus('Localizando a pasta ' + pasta + '...');
    let pid = await pastaId(tok, pasta);
    if (cliente) { onStatus && onStatus('Pasta do cliente ' + cliente + '...'); pid = await pastaId(tok, cliente.replace(/[\\/:*?"<>|]/g, '').slice(0, 80), pid); }
    const out = [];
    for (const [nome, blob] of arquivos) { onStatus && onStatus('Enviando ' + nome + '...'); out.push(await enviar(tok, pid, nome, blob)); }
    return out;
  }
  root.Drive = { salvar };
})(typeof self !== 'undefined' ? self : this);
