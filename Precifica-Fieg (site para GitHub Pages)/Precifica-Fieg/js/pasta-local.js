/* pasta-local.js - salva os arquivos numa pasta do computador escolhida uma vez (ex.: a pasta do Google Drive
   para desktop ou do OneDrive), criando uma subpasta por cliente. Usa a File System Access API (Chrome/Edge).
   A pasta escolhida fica lembrada no navegador (IndexedDB); na próxima vez só pede a confirmação de acesso. */
(function (root) {
  'use strict';
  const DB = 'precifica-fieg', STORE = 'pastas', KEY = 'raiz';

  function suportado() { return typeof root.showDirectoryPicker === 'function'; }

  function abrirDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function guardar(handle) {
    try { const db = await abrirDB(); await new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(handle, KEY); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (_) { /* ignora */ }
  }
  async function lembrada() {
    try { const db = await abrirDB(); return await new Promise((res, rej) => { const t = db.transaction(STORE, 'readonly'); const g = t.objectStore(STORE).get(KEY); g.onsuccess = () => res(g.result || null); g.onerror = () => rej(g.error); }); } catch (_) { return null; }
  }
  async function esquecer() {
    try { const db = await abrirDB(); await new Promise((res) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(KEY); t.oncomplete = res; t.onerror = res; }); } catch (_) { /* ignora */ }
  }

  async function escolherPasta() {
    if (!suportado()) throw new Error('Este navegador não permite salvar em pasta. Use Chrome ou Edge.');
    const h = await root.showDirectoryPicker({ mode: 'readwrite', id: 'precifica-raiz' });
    await guardar(h);
    return h;
  }
  async function pastaRaiz(pedirSeFaltar) {
    let h = await lembrada();
    if (h) {
      let perm = await h.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await h.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') return h;
    }
    if (pedirSeFaltar) return escolherPasta();
    return null;
  }
  function nomeSeguro(s) { return String(s || 'cliente').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'cliente'; }

  /* arquivos: [[nome, blob], ...]. Cria <raiz>/<cliente>/ e grava (sobrescreve se já existir). */
  async function salvarCliente(cliente, arquivos, onStatus) {
    const raiz = await pastaRaiz(true);
    onStatus && onStatus('Abrindo a pasta do cliente...');
    const dir = await raiz.getDirectoryHandle(nomeSeguro(cliente), { create: true });
    const out = [];
    for (const [nome, blob] of arquivos) {
      onStatus && onStatus('Gravando ' + nome + '...');
      const fh = await dir.getFileHandle(nomeSeguro(nome), { create: true });
      const w = await fh.createWritable();
      await w.write(blob); await w.close();
      out.push(nomeSeguro(nome));
    }
    return { raiz: raiz.name, pasta: nomeSeguro(cliente), arquivos: out };
  }
  async function nomeRaiz() { const h = await lembrada(); return h ? h.name : null; }

  root.PastaLocal = { suportado, escolherPasta, salvarCliente, nomeRaiz, esquecer };
})(typeof self !== 'undefined' ? self : this);
