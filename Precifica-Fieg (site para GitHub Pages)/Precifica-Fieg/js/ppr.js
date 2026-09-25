/* ppr.js - módulo de precificação do PPR (Programa de Proteção Respiratória), conforme a tabela de precificação PPR da Central
   (planilha TRIGOBEL): documento base por faixa de trabalhadores, amostra química, treinamentos, fit test, km, diárias,
   ajuda de custo, ART, material administrativo e BDI. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PPR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PADRAO = {
    fonte: 'Tabela de precificação PPR (planilha TRIGOBEL, SESI-GO 2024)',
    faixas: [{ ate: 20, rotulo: '1 a 20 trabalhadores', valor: 2000 }, { ate: 50, rotulo: '21 a 50 trabalhadores', valor: 2600 }, { ate: 100, rotulo: '51 a 100 trabalhadores', valor: 3300 }, { ate: 250, rotulo: '101 a 250 trabalhadores', valor: 4500 }, { ate: 400, rotulo: '251 a 400 trabalhadores', valor: 5500 }],
    hora_treinamento: 120,
    treinamentos: [{ nome: 'Administrador do PPR', horas: 8 }, { nome: 'SESMT', horas: 1 }, { nome: 'Supervisor', horas: 1 }, { nome: 'Distribuidor de EPR', horas: 1 }, { nome: 'Usuário', horas: 2 }, { nome: 'Emergência', horas: 1 }, { nome: 'Terceiros', horas: 2 }, { nome: 'Todos os treinamentos citados no PPR', horas: 16, todos: true }],
    fit_test: 50, km: 1.5, diaria: 250, art: 250, material: 350, bdi: 0.3, bdi_amostra: 0.15
  };
  const r2 = x => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
  const num = x => (x === '' || x === null || x === undefined || isNaN(Number(x))) ? 0 : Number(x);

  function params(regras) { return Object.assign({}, PADRAO, (regras && regras.ppr) || {}); }
  function estadoNovo() { return { ntrab: '', baseManual: '', amostra: '', amostraInfo: '', treinamentos: [], fit: '', km: '', diarias: '', alim: '' }; }

  function faixaDe(P, n) {
    if (!(n > 0)) return null;
    return P.faixas.find(f => n <= f.ate) || null;
  }

  /* cálculo puro: devolve os itens da planilha e os totais */
  function calcular(st, P) {
    const n = num(st.ntrab);
    const fx = faixaDe(P, n);
    const acima = n > 0 && !fx;
    const base = fx ? fx.valor : num(st.baseManual);
    const sel = P.treinamentos.filter(t => (st.treinamentos || []).includes(t.nome));
    const todos = sel.find(t => t.todos);
    const horasTrein = todos ? todos.horas : sel.reduce((s, t) => s + t.horas, 0);
    const itens = [
      { desc: 'Elaboração do PPR (documento base)' + (fx ? ': ' + fx.rotulo : acima ? ': acima da última faixa, valor manual' : ''), qtd: 1, unit: base, total: base },
      { desc: 'Amostra química (avaliação ambiental)', qtd: 1, unit: num(st.amostra), total: num(st.amostra), obs: st.amostraInfo || '' },
      { desc: 'Treinamentos: ' + (sel.length ? (todos ? todos.nome : sel.map(t => `${t.nome} (${t.horas} h)`).join('; ')) : 'nenhum'), qtd: horasTrein, unid: 'h', unit: P.hora_treinamento, total: horasTrein * P.hora_treinamento },
      { desc: 'Teste de vedação qualitativo (fit test)', qtd: num(st.fit), unit: P.fit_test, total: num(st.fit) * P.fit_test },
      { desc: 'Km rodado (ida e volta)', qtd: num(st.km) * 2, unid: 'km', unit: P.km, total: num(st.km) * 2 * P.km },
      { desc: 'Diárias', qtd: num(st.diarias), unit: P.diaria, total: num(st.diarias) * P.diaria },
      { desc: 'Ajuda de custo com alimentação', qtd: 1, unit: num(st.alim), total: num(st.alim) },
      { desc: 'ART', qtd: 1, unit: P.art, total: P.art },
      { desc: 'Material administrativo', qtd: 1, unit: P.material, total: P.material }
    ].map(i => Object.assign(i, { total: r2(i.total) }));
    const total = r2(itens.reduce((s, i) => s + i.total, 0));
    const bdi = r2(total * P.bdi);
    return { itens, total, bdiPct: P.bdi, bdi, final: r2(total + bdi), faixa: fx, acima, horasTrein };
  }

  /* ---------------------------------------------------------------- interface (navegador) */
  function iniciar(ctx) {
    const { S, $, fmt, esc, baixar } = ctx;
    if (!S.ppr) S.ppr = estadoNovo();
    const P = () => params(S.regras);

    function preencherDoCadastro() {
      const c = S.cadastro, st = S.ppr;
      if (!st.empresa) st.empresa = c.empresa || ''; if (!st.cnpj) st.cnpj = c.cnpj || ''; if (!st.cidade) st.cidade = c.cidade || '';
      if (!st.data) st.data = S.logistica.data; if (!st.resp) st.resp = S.logistica.responsavel || '';
      if (st.ntrab === '' && c.n_trab) st.ntrab = Number(String(c.n_trab).replace(/\D/g, '')) || '';
      if (st.km === '' && S.logistica.distancia) st.km = S.logistica.distancia;
    }
    function render() {
      preencherDoCadastro();
      const st = S.ppr, p = P();
      const campos = { 'ppr-empresa': 'empresa', 'ppr-cnpj': 'cnpj', 'ppr-cidade': 'cidade', 'ppr-data': 'data', 'ppr-resp': 'resp', 'ppr-ntrab': 'ntrab', 'ppr-base-manual': 'baseManual', 'ppr-amostra': 'amostra', 'ppr-fit': 'fit', 'ppr-km': 'km', 'ppr-diarias': 'diarias', 'ppr-alim': 'alim' };
      for (const [id, k] of Object.entries(campos)) { const el = $('#' + id); if (document.activeElement !== el) el.value = st[k] ?? ''; }
      const R = calcular(st, p);
      $('#ppr-faixa').innerHTML = '<table class="param ppr"><tr><th>Item</th><th>Faixa</th><th>Valor (R$)</th></tr>' + p.faixas.map((f, i) => `<tr${R.faixa === f ? ' style="background:#dbe9f6;font-weight:bold"' : ''}><td>${i + 1}</td><td>${esc(f.rotulo)}</td><td class="num">${fmt(f.valor)}</td></tr>`).join('') + '</table>' + (R.acima ? '<div class="alerta-forte">Acima da última faixa da tabela: informe o valor manual do documento base.</div>' : '');
      $('#ppr-base-manual').closest('.campo').hidden = !R.acima && !(num(st.ntrab) === 0 && st.baseManual !== '');
      $('#ppr-trein').innerHTML = p.treinamentos.map(t => `<label><input type="checkbox" data-trein="${esc(t.nome)}" ${st.treinamentos.includes(t.nome) ? 'checked' : ''}> ${esc(t.nome)} (${t.horas} h, R$ ${fmt(t.horas * p.hora_treinamento)})</label>`).join('') + `<small>Hora de treinamento: R$ ${fmt(p.hora_treinamento)}. "Todos" substitui os demais.</small>`;
      $('#ppr-trein').querySelectorAll('[data-trein]').forEach(cb => cb.addEventListener('change', () => {
        const nome = cb.dataset.trein, t = p.treinamentos.find(x => x.nome === nome);
        let sel = st.treinamentos.filter(x => x !== nome);
        if (cb.checked) sel = t.todos ? [nome] : sel.filter(x => !(p.treinamentos.find(y => y.nome === x) || {}).todos).concat(nome);
        st.treinamentos = sel; render();
      }));
      $('#ppr-amostra-info').textContent = st.amostraInfo || 'Informe o valor ou calcule a partir das linhas químicas do módulo LTCAT (planilha de custos completa com BDI da avaliação ambiental de ' + (p.bdi_amostra * 100) + '%).';
      let h = '<table class="custos ppr"><thead><tr><th>Item</th><th>Descrição</th><th class="num">Quant.</th><th class="num">Valor unit. (R$)</th><th class="num">Total (R$)</th></tr></thead><tbody>';
      R.itens.forEach((i, k) => { h += `<tr><td>${k + 1}</td><td>${esc(i.desc)}${i.obs ? '<br><small>' + esc(i.obs) + '</small>' : ''}</td><td class="num">${i.qtd}${i.unid ? ' ' + i.unid : ''}</td><td class="num">${fmt(i.unit)}</td><td class="num">${fmt(i.total)}</td></tr>`; });
      h += `<tr class="tot"><td colspan="4">Total</td><td class="num">${fmt(R.total)}</td></tr><tr><td colspan="4">BDI (${(R.bdiPct * 100).toFixed(0)}%)</td><td class="num">${fmt(R.bdi)}</td></tr><tr class="tot"><td colspan="4">Valor total da proposta</td><td class="num">${fmt(R.final)}</td></tr></tbody></table>`;
      $('#ppr-tabela').innerHTML = h;
      const ks = [['hora_treinamento', 'Hora de treinamento (R$)'], ['fit_test', 'Fit test qualitativo, unitário (R$)'], ['km', 'Km rodado (R$)'], ['diaria', 'Diária (R$)'], ['art', 'ART (R$)'], ['material', 'Material administrativo (R$)'], ['bdi', 'BDI (%)'], ['bdi_amostra', 'BDI da amostra química (%)']];
      $('#ppr-param').innerHTML = '<table class="param">' + ks.map(([k, r]) => `<tr><td>${r}</td><td><input data-pp="${k}" type="number" step="any" value="${/bdi/.test(k) ? +(p[k] * 100).toFixed(2) : p[k]}"></td></tr>`).join('') + p.faixas.map((f, i) => `<tr><td>Faixa ${esc(f.rotulo)} (R$)</td><td><input data-pf="${i}" type="number" step="any" value="${f.valor}"></td></tr>`).join('') + `</table><small>Fonte: ${esc(p.fonte)}. Alterações ficam salvas neste navegador.</small>`;
      $('#ppr-param').querySelectorAll('[data-pp]').forEach(i => i.addEventListener('change', () => { S.regras.ppr = Object.assign(P(), S.regras.ppr || {}); S.regras.ppr[i.dataset.pp] = /bdi/.test(i.dataset.pp) ? Number(i.value) / 100 : Number(i.value); ctx.salvarRegrasLocal(); render(); }));
      $('#ppr-param').querySelectorAll('[data-pf]').forEach(i => i.addEventListener('change', () => { S.regras.ppr = Object.assign(P(), S.regras.ppr || {}); S.regras.ppr.faixas = S.regras.ppr.faixas.map((f, k) => k === Number(i.dataset.pf) ? Object.assign({}, f, { valor: Number(i.value) }) : f); ctx.salvarRegrasLocal(); render(); }));
      return R;
    }
    function ligar() {
      const campos = { 'ppr-empresa': 'empresa', 'ppr-cnpj': 'cnpj', 'ppr-cidade': 'cidade', 'ppr-data': 'data', 'ppr-resp': 'resp', 'ppr-ntrab': 'ntrab', 'ppr-base-manual': 'baseManual', 'ppr-amostra': 'amostra', 'ppr-fit': 'fit', 'ppr-km': 'km', 'ppr-diarias': 'diarias', 'ppr-alim': 'alim' };
      for (const [id, k] of Object.entries(campos)) $('#' + id).addEventListener('change', () => { S.ppr[k] = $('#' + id).value; if (k === 'amostra') S.ppr.amostraInfo = 'Valor informado manualmente.'; render(); });
      $('#btn-ppr-amostra').addEventListener('click', () => {
        const r = ctx.amostraDoLevantamento(params(S.regras).bdi_amostra);
        if (!r) { S.ppr.amostraInfo = 'Não há linhas químicas no levantamento. Leia o PGR no módulo LTCAT ou informe o valor.'; render(); return; }
        S.ppr.amostra = r.valor; S.ppr.amostraInfo = r.info; render();
      });
      $('#btn-ppr-print').addEventListener('click', () => window.print());
      $('#btn-ppr-json').addEventListener('click', () => baixar(new Blob([JSON.stringify({ app: 'Precifica-Fieg', modulo: 'PPR', salvoEm: new Date().toISOString(), regrasVersao: S.regras.versao, parametros: params(S.regras), ppr: S.ppr, resultado: calcular(S.ppr, params(S.regras)) }, null, 1)], { type: 'application/json' }), nome() + '.json'));
      $('#btn-ppr-excel').addEventListener('click', async () => { try { baixar(await excel(), nome() + '.xlsx'); } catch (e) { alert('Erro ao gerar Excel: ' + e.message); } });
      $('#btn-ppr-pasta').addEventListener('click', async () => {
        const stt = $('#ppr-status');
        if (!window.PastaLocal || !PastaLocal.suportado()) { stt.textContent = 'Salvar em pasta só funciona no Chrome ou Edge.'; return; }
        try {
          const arqs = [[nome() + '.xlsx', await excel()], [nome() + '.json', new Blob([JSON.stringify({ app: 'Precifica-Fieg', modulo: 'PPR', ppr: S.ppr, resultado: calcular(S.ppr, params(S.regras)) }, null, 1)], { type: 'application/json' })]];
          const cliente = (S.ppr.cnpj ? String(S.ppr.cnpj).replace(/\D/g, '').slice(0, 8) + ' - ' : '') + (S.ppr.empresa || 'cliente');
          const r = await PastaLocal.salvarCliente(cliente, arqs, m => stt.textContent = m);
          stt.innerHTML = `Salvo em <b>${esc(r.raiz)} / ${esc(r.pasta)}</b>`;
        } catch (e) { stt.textContent = e.name === 'AbortError' ? 'Cancelado.' : 'Erro: ' + e.message; }
      });
    }
    function nome() { return 'Precificação PPR - ' + String(S.ppr.empresa || 'empresa').replace(/[\\/:*?"<>|]/g, '').slice(0, 60); }
    async function excel() {
      const st = S.ppr, p = params(S.regras), R = calcular(st, p);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Precificação PPR');
      ws.columns = [{ width: 7 }, { width: 62 }, { width: 12 }, { width: 16 }, { width: 16 }];
      ws.mergeCells('A1:E1'); ws.getCell('A1').value = 'SESI - DR/GOIÁS - TABELA DE PRECIFICAÇÃO PPR'; ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF002E7F' } };
      const info = [['Empresa', st.empresa], ['CNPJ', st.cnpj], ['Município', st.cidade], ['Data', st.data ? String(st.data).split('-').reverse().join('/') : ''], ['Responsável', st.resp], ['Nº de trabalhadores', st.ntrab]];
      info.forEach((r, i) => { ws.getCell('A' + (3 + i)).value = r[0]; ws.getCell('A' + (3 + i)).font = { bold: true }; ws.mergeCells(`B${3 + i}:E${3 + i}`); ws.getCell('B' + (3 + i)).value = r[1] ?? ''; });
      const h0 = 10; ['Item', 'Descrição', 'Quantidade', 'Valor unit. (R$)', 'Total (R$)'].forEach((t, i) => { const c = ws.getRow(h0).getCell(i + 1); c.value = t; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002E7F' } }; });
      R.itens.forEach((it, k) => { const r = ws.getRow(h0 + 1 + k); r.getCell(1).value = k + 1; r.getCell(2).value = it.desc + (it.obs ? ' (' + it.obs + ')' : ''); r.getCell(3).value = it.qtd; r.getCell(4).value = it.unit; r.getCell(5).value = { formula: `C${h0 + 1 + k}*D${h0 + 1 + k}`, result: it.total }; r.getCell(4).numFmt = r.getCell(5).numFmt = '#,##0.00'; });
      const lt = h0 + 1 + R.itens.length;
      ws.getCell('B' + lt).value = 'Total'; ws.getCell('E' + lt).value = { formula: `SUM(E${h0 + 1}:E${lt - 1})`, result: R.total };
      ws.getCell('B' + (lt + 1)).value = 'BDI (%)'; ws.getCell('D' + (lt + 1)).value = R.bdiPct; ws.getCell('D' + (lt + 1)).numFmt = '0%'; ws.getCell('E' + (lt + 1)).value = { formula: `E${lt}*D${lt + 1}`, result: R.bdi };
      ws.getCell('B' + (lt + 2)).value = 'Valor total da proposta'; ws.getCell('E' + (lt + 2)).value = { formula: `E${lt}+E${lt + 1}`, result: R.final };
      for (const r of [lt, lt + 1, lt + 2]) { ws.getCell('B' + r).font = { bold: true }; ws.getCell('E' + r).font = { bold: true }; ws.getCell('E' + r).numFmt = '#,##0.00'; }
      ws.getCell('B' + (lt + 4)).value = 'Fonte dos valores: ' + p.fonte + '. Gerado pelo Precifica-Fieg em ' + new Date().toLocaleDateString('pt-BR') + '.';
      ws.getCell('B' + (lt + 4)).font = { italic: true, size: 9, color: { argb: 'FF666666' } };
      const buf = await wb.xlsx.writeBuffer();
      return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    ligar();
    return { render, excel };
  }

  return { PADRAO, params, estadoNovo, calcular, iniciar };
});
