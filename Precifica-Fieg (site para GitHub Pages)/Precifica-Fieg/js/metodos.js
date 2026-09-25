/* metodos.js - aba de pesquisa no Guia de Métodos do laboratório (agente, CAS, método, amostrador, vazão, volume, cuidados). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Metodos = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  function grupoAmostrador(r) {
    const a = norm(r.amostrador + ' ' + r.metodo);
    if (/passivo/.test(a)) return 'Amostrador passivo';
    if (/tubo/.test(a)) return 'Tubo adsorvente';
    if (/cassete|filtro/.test(a)) return 'Cassete / filtro';
    if (/impinger|borbulhador|frasco/.test(a)) return 'Impinger / frasco';
    if (/bag|saco/.test(a)) return 'Bag';
    return 'Outros';
  }

  function pesquisar(itens, q, filtros) {
    const termos = norm(q).split(' ').filter(Boolean);
    const res = itens.filter(r => {
      if (filtros && filtros.grupo && r._grupo !== filtros.grupo) return false;
      if (filtros && filtros.comPreco && !r.exame) return false;
      if (!termos.length) return true;
      return termos.every(t => r._busca.includes(t));
    });
    if (!termos.length) return res;
    // primeiro o que casa no nome do agente (começando pelo termo), depois o resto
    const peso = r => { const a = norm(r.agente); return termos.every(t => a.startsWith(t) || a.includes(' ' + t)) ? 0 : termos.every(t => a.includes(t)) ? 1 : 2; };
    return res.map((r, i) => [peso(r), i, r]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map(x => x[2]);
  }

  function iniciar(ctx) {
    const { $, esc, fmt, precoExame } = ctx;
    let dados = null;
    const carregar = async () => {
      if (dados) return dados;
      const IN = window.PRECIFICA_INLINE;
      const j = IN && IN.metodos ? IN.metodos : await fetch('dados/metodos.json').then(x => x.json());
      for (const r of j.itens) { r._grupo = grupoAmostrador(r); r._busca = norm([r.agente, r.cas, r.metodo, r.descricao, r.amostrador, r.codAmostrador, r.exame].join(' ')); }
      dados = j; return j;
    };
    async function render() {
      const j = await carregar();
      const sel = $('#met-grupo');
      if (!sel.options.length) {
        const gs = Array.from(new Set(j.itens.map(r => r._grupo))).sort();
        sel.innerHTML = '<option value="">Todos os amostradores</option>' + gs.map(g => `<option>${esc(g)}</option>`).join('');
        $('#met-fonte').textContent = `${j.total} métodos de ${new Set(j.itens.map(r => r.agente)).size} agentes. Fonte: ${j.fonte}.`;
      }
      const res = pesquisar(j.itens, $('#met-q').value, { grupo: sel.value, comPreco: $('#met-preco').checked });
      const max = 150;
      let h = `<p><b>${res.length}</b> resultado(s)${res.length > max ? `, mostrando os ${max} primeiros. Refine a busca.` : '.'}</p>`;
      h += '<div style="overflow:auto"><table class="custos metodos"><thead><tr><th>Item</th><th>Agente</th><th>Método</th><th>Amostrador</th><th>Vazão / volume</th><th>Cuidados com a amostra</th><th>Tabela do laboratório</th></tr></thead><tbody>';
      res.slice(0, max).forEach((r, i) => {
        const p = r.exame ? precoExame(r.exame) : null;
        h += `<tr><td>${i + 1}</td><td><b>${esc(r.agente)}</b>${r.marca ? ` <span class="tag ver" title="Marcação ${esc(r.marca)} que consta no guia do laboratório ao lado do nome">${esc(r.marca)} no guia</span>` : ''}<br><small>CAS ${esc(r.cas || 'não informado')} | ${esc(r.unidade)}</small></td>`
          + `<td>${esc(r.metodo)}<br><small>${esc(r.descricao)}</small></td>`
          + `<td>${esc(r.amostrador)}<br><small>${esc(r.codAmostrador)} | ${esc(r._grupo)}</small></td>`
          + `<td>${esc(r.vazao)}<br><small>${esc(r.volume)}</small></td>`
          + `<td><small>${esc(r.cuidados)}</small></td>`
          + `<td>${r.exame ? `${esc(r.exame)}<br><b>R$ ${p === null ? '?' : fmt(p)}</b>` : '<small>sem item com o mesmo nome na tabela de preços</small>'}</td></tr>`;
      });
      $('#met-res').innerHTML = h + '</tbody></table></div>';
    }
    let t = null;
    $('#met-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 200); });
    $('#met-grupo').addEventListener('change', render);
    $('#met-preco').addEventListener('change', render);
    $('#met-limpar').addEventListener('click', () => { $('#met-q').value = ''; $('#met-grupo').value = ''; $('#met-preco').checked = false; render(); });
    return { render, buscar: q => { $('#met-q').value = q || ''; return render(); } };
  }

  return { norm, grupoAmostrador, pesquisar, iniciar };
});
