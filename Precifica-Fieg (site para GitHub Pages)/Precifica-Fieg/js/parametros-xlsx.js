/* parametros-xlsx.js - planilha de parâmetros: baixar a base (valores, tipos de avaliação, tabela de exames, PPR, ergonomia)
   em Excel para editar e importar de volta. As chaves (coluna A) identificam cada parâmetro e não devem ser alteradas. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ParametrosXLSX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const AZUL = 'FF002E7F', GELO = 'FFE5EDF4';

  function achatar(obj, pre, out) {
    out = out || [];
    for (const [k, v] of Object.entries(obj || {})) {
      if (Array.isArray(v) || k === 'fonte') continue;
      if (v && typeof v === 'object') achatar(v, (pre ? pre + '.' : '') + k, out);
      else if (typeof v === 'number') out.push([(pre ? pre + '.' : '') + k, v]);
    }
    return out;
  }
  function definir(obj, chave, valor) {
    const ps = chave.split('.'); let o = obj;
    for (let i = 0; i < ps.length - 1; i++) { if (!o[ps[i]] || typeof o[ps[i]] !== 'object') return false; o = o[ps[i]]; }
    if (!(ps[ps.length - 1] in o) || typeof o[ps[ps.length - 1]] !== 'number') return false;
    o[ps[ps.length - 1]] = valor; return true;
  }
  function val(c) {
    const v = c && c.value;
    if (v && typeof v === 'object') { if ('result' in v) return v.result; if (v.richText) return v.richText.map(t => t.text).join(''); if ('text' in v) return v.text; }
    return v;
  }
  const numero = v => { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return v; const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; };

  function cabecalho(ws, titulos, larguras) {
    ws.columns = titulos.map((t, i) => ({ header: t, width: larguras[i] || 16 }));
    const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.height = 20;
    r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }; c.alignment = { vertical: 'middle', wrapText: true }; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  function travarChave(ws) { ws.getColumn(1).eachCell((c, n) => { if (n > 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GELO } }; }); }

  async function exportar(regras, exames, PPR, Ergonomia) {
    const wb = new ExcelJS.Workbook(); wb.creator = 'Precifica';
    const li = wb.addWorksheet('Leia-me'); li.getColumn(1).width = 110;
    ['PRECIFICA | Planilha de parâmetros', '', 'Como usar:', '1. Altere somente as colunas de valor (brancas). A coluna A (cinza) é a chave de cada parâmetro: não mude.', '2. Percentuais: use o formato de porcentagem do Excel (ex.: 30%) ou fração (0,3).', '3. Tabela de exames: altere os preços por vigência. Linhas novas no fim são incluídas como exames novos.', '4. Salve e, na plataforma, em Parâmetros, use "Importar planilha de parâmetros".', '5. As alterações ficam salvas no navegador. Para valer para todos, baixe o regras.json e publique no site.', '', 'Versão das regras: ' + (regras.versao || '') + ' | Exportado em ' + new Date().toLocaleString('pt-BR')]
      .forEach((t, i) => { const c = li.getCell('A' + (i + 1)); c.value = t; if (i === 0) c.font = { bold: true, size: 14, color: { argb: AZUL } }; });

    const wv = wb.addWorksheet('Valores'); cabecalho(wv, ['Chave', 'Descrição', 'Valor', 'Formato', 'Observação'], [26, 60, 14, 10, 50]);
    for (const [k, p] of Object.entries(regras.valores)) {
      const r = wv.addRow([k, p.rotulo || k, Number(p.valor), p.formato || '', p.obs || p.fonte || '']);
      if (p.formato === 'pct') r.getCell(3).numFmt = '0.00%'; else r.getCell(3).numFmt = '#,##0.00##';
    }
    travarChave(wv);

    const wt = wb.addWorksheet('Tipos de avaliação'); cabecalho(wt, ['Tipo', 'Horas TST por avaliação', 'Avaliações por dia', 'Valor fixo (R$)', 'Regra'], [30, 14, 14, 14, 70]);
    for (const [t, tp] of Object.entries(regras.tipos)) wt.addRow([t, Number(tp.horas) || 0, Number(tp.por_dia) || 0, Number(tp.fixo) || 0, tp.regra || '']);
    travarChave(wt);

    const vig = exames.vigencias || [];
    const we = wb.addWorksheet('Tabela de exames'); cabecalho(we, ['Exame', 'Item'].concat(vig.map(v => (v.rotulo || v.campo) + ' (' + v.campo + ')')), [58, 8].concat(vig.map(() => 18)));
    for (const it of exames.itens.filter(x => !x.extra)) { const r = we.addRow([it.nome, it.item].concat(vig.map(v => Number(it[v.campo]) || 0))); vig.forEach((_, i) => r.getCell(3 + i).numFmt = '#,##0.00'); }
    travarChave(we);

    const P = PPR.params(regras);
    const wp = wb.addWorksheet('PPR'); cabecalho(wp, ['Chave', 'Valor'], [30, 14]);
    for (const [k, v] of achatar(P)) { const r = wp.addRow([k, v]); if (/bdi/.test(k)) r.getCell(2).numFmt = '0.00%'; }
    travarChave(wp);
    const wpf = wb.addWorksheet('PPR faixas'); cabecalho(wpf, ['Até (trabalhadores)', 'Faixa', 'Valor (R$)'], [18, 30, 14]);
    for (const f of P.faixas) wpf.addRow([f.ate, f.rotulo, f.valor]);
    const wpt = wb.addWorksheet('PPR treinamentos'); cabecalho(wpt, ['Treinamento', 'Horas', 'Substitui os demais (Sim/Não)'], [44, 10, 26]);
    for (const t of P.treinamentos) wpt.addRow([t.nome, t.horas, t.todos ? 'Sim' : 'Não']);

    const E = Ergonomia.params(regras);
    const wg = wb.addWorksheet('Ergonomia'); cabecalho(wg, ['Chave', 'Valor'], [30, 14]);
    for (const [k, v] of achatar(E)) { const r = wg.addRow([k, v]); if (/bdi/.test(k)) r.getCell(2).numFmt = '0.00%'; }
    travarChave(wg);
    const wf = wb.addWorksheet('FRP faixas'); cabecalho(wf, ['Até (trabalhadores, vazio = acima)', 'Faixa', 'Dias'], [26, 26, 10]);
    for (const f of E.frp.faixas) wf.addRow([f.ate === null || f.ate === undefined ? '' : f.ate, f.rotulo, f.dias]);

    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* aplica a planilha editada: devolve { regras, exames, log[] } (cópias novas) */
  async function importar(arrayBuffer, regras0, exames0, PPR, Ergonomia) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(arrayBuffer);
    const regras = JSON.parse(JSON.stringify(regras0)); const exames = JSON.parse(JSON.stringify(exames0));
    const log = []; let n = 0;
    const rows = ws => { const out = []; ws.eachRow((r, i) => { if (i > 1) out.push(r); }); return out; };
    const wv = wb.getWorksheet('Valores');
    if (wv) for (const r of rows(wv)) {
      const k = String(val(r.getCell(1)) || '').trim(), v = numero(val(r.getCell(3)));
      if (!k || v === null || !regras.valores[k]) continue;
      if (Number(regras.valores[k].valor) !== v) { log.push(`${regras.valores[k].rotulo || k}: ${regras.valores[k].valor} para ${v}`); regras.valores[k].valor = v; n++; }
    }
    const wt = wb.getWorksheet('Tipos de avaliação');
    if (wt) for (const r of rows(wt)) {
      const t = String(val(r.getCell(1)) || '').trim(); const tp = regras.tipos[t]; if (!tp) continue;
      [['horas', 2], ['por_dia', 3], ['fixo', 4]].forEach(([c, col]) => { const v = numero(val(r.getCell(col))); if (v !== null && Number(tp[c]) !== v) { log.push(`${t} (${c}): ${tp[c]} para ${v}`); tp[c] = v; n++; } });
    }
    const we = wb.getWorksheet('Tabela de exames');
    if (we) {
      const campos = []; we.getRow(1).eachCell((c, i) => { const m = /\(([^)]+)\)\s*$/.exec(String(val(c) || '')); if (i >= 3 && m) campos.push([i, m[1]]); });
      for (const r of rows(we)) {
        const nome = String(val(r.getCell(1)) || '').trim(); if (!nome) continue;
        let it = exames.itens.find(x => x.nome === nome && !x.extra);
        if (!it) { it = { item: 'P' + (exames.itens.length + 1), nome, manual: true, fonte: 'Incluído pela planilha de parâmetros' }; exames.itens.push(it); log.push(`Exame novo: ${nome}`); n++; }
        for (const [col, campo] of campos) { const v = numero(val(r.getCell(col))); if (v !== null && Number(it[campo]) !== v) { if (it[campo] !== undefined) log.push(`${nome} (${campo}): ${it[campo]} para ${v}`); it[campo] = v; n++; } }
      }
    }
    const aplicarChaves = (ws, alvo, rotulo) => {
      if (!ws) return;
      for (const r of rows(ws)) { const k = String(val(r.getCell(1)) || '').trim(), v = numero(val(r.getCell(2))); if (!k || v === null) continue; const antes = k.split('.').reduce((o, p) => o && o[p], alvo); if (antes !== v && definir(alvo, k, v)) { log.push(`${rotulo} ${k}: ${antes} para ${v}`); n++; } }
    };
    regras.ppr = PPR.params(regras); aplicarChaves(wb.getWorksheet('PPR'), regras.ppr, 'PPR');
    const wpf = wb.getWorksheet('PPR faixas');
    if (wpf) { const fx = rows(wpf).map(r => ({ ate: numero(val(r.getCell(1))), rotulo: String(val(r.getCell(2)) || ''), valor: numero(val(r.getCell(3))) })).filter(f => f.ate !== null && f.valor !== null); if (fx.length && JSON.stringify(fx) !== JSON.stringify(regras.ppr.faixas.map(f => ({ ate: f.ate, rotulo: f.rotulo, valor: f.valor })))) { regras.ppr.faixas = fx; log.push('PPR: faixas atualizadas'); n++; } }
    const wpt = wb.getWorksheet('PPR treinamentos');
    if (wpt) { const tr = rows(wpt).map(r => ({ nome: String(val(r.getCell(1)) || '').trim(), horas: numero(val(r.getCell(2))), todos: /^s/i.test(String(val(r.getCell(3)) || '')) })).filter(t => t.nome && t.horas !== null).map(t => t.todos ? t : { nome: t.nome, horas: t.horas }); if (tr.length && JSON.stringify(tr) !== JSON.stringify(regras.ppr.treinamentos)) { regras.ppr.treinamentos = tr; log.push('PPR: treinamentos atualizados'); n++; } }
    regras.ergonomia = Ergonomia.params(regras); aplicarChaves(wb.getWorksheet('Ergonomia'), regras.ergonomia, 'Ergonomia');
    const wf = wb.getWorksheet('FRP faixas');
    if (wf) { const fx = rows(wf).map(r => { const a = numero(val(r.getCell(1))); return { ate: a, rotulo: String(val(r.getCell(2)) || ''), dias: numero(val(r.getCell(3))) }; }).filter(f => f.dias !== null && f.rotulo); if (fx.length && JSON.stringify(fx) !== JSON.stringify(regras.ergonomia.frp.faixas)) { regras.ergonomia.frp.faixas = fx; log.push('FRP: faixas atualizadas'); n++; } }
    return { regras, exames, log, n };
  }

  return { exportar, importar, achatar };
});
