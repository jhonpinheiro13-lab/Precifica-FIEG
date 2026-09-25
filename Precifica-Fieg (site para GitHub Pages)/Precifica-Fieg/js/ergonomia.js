/* ergonomia.js - módulos AEP (Análise Ergonômica Preliminar), AET (Análise Ergonômica do Trabalho) e FRP
   (Fatores de Risco Psicossociais relacionados ao trabalho), conforme a Tabela de Preços Corporativa 2025 v7 (SESI-GO 2026).
   Inclui a lista de postos (setor, função/atividade) importada do PGR e a troca de dados entre as abas. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ergonomia = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PADRAO = {
    fonte: 'Tabela de preços corporativa 2025 v7 atualizada (SESI-DR/GO 2026): abas AEP, AET e FRPRT',
    diaria: 250, meia_diaria: 90, folha: 0.65, veiculo: 30, km: 1.5, alimentacao: 55, bdi: 0.3,
    aep: { hora: 35.79, campo_min: 20, lanc_min: 100 },
    aet: { hora: 35.79, adm: { campo_min: 20, lanc_min: 220 }, prod: { campo_min: 30, lanc_min: 330 } },
    frp: { hora: 40, tabulacao_min: 480, relatorio_min: 480, aplicacao_min: 480, limite_consulta: 500,
      faixas: [{ ate: 20, rotulo: 'Até 20', dias: 1 }, { ate: 30, rotulo: 'De 21 a 30', dias: 2 }, { ate: 100, rotulo: 'De 31 a 100', dias: 3 }, { ate: 300, rotulo: 'De 101 a 300', dias: 4 }, { ate: 500, rotulo: 'De 301 a 500', dias: 5 }, { ate: null, rotulo: 'Acima de 500', dias: 6 }] }
  };
  const TITULO = { aep: 'AEP - Análise Ergonômica Preliminar', aet: 'AET - Análise Ergonômica do Trabalho', frp: 'FRP - Fatores de Risco Psicossociais relacionados ao trabalho' };
  const r2 = x => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
  const num = x => (x === '' || x === null || x === undefined || isNaN(Number(x))) ? 0 : Number(x);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  function params(regras) {
    const e = (regras && regras.ergonomia) || {};
    return Object.assign({}, PADRAO, e, { aep: Object.assign({}, PADRAO.aep, e.aep || {}), aet: Object.assign({}, PADRAO.aet, e.aet || {}), frp: Object.assign({}, PADRAO.frp, e.frp || {}) });
  }
  function estadoNovo() { return { empresa: '', cnpj: '', cidade: '', ntrab: '', resp: '', data: '', postos: [], diarias: '', meias: '', km: '', veiculo: '', alim: '', folhas: '', desconto: '', diasFrp: '' }; }

  const RE_ADM = /administ|escritorio|analista|assistente|gerente|coordenador|diretor|recepcion|secretari|comprador|compras|financeir|contab|faturament|recursos humanos|\brh\b|departamento pessoal|\bdp\b|informatica|\bti\b|vendedor|vendas|comercial|atendente|telefonista|juridico|advogad|engenheir|tecnico de seguranca|planejador|programador|controller|consultor|supervisor administrativo|auxiliar de escritorio|office|marketing|faturista|caixa\b|tesour|auditor|qualidade/;
  function tipoPosto(funcao, setor) { return RE_ADM.test(norm(funcao)) || RE_ADM.test(norm(setor)) ? 'adm' : 'prod'; }

  /* Lista de postos a partir do PGR lido: uma linha por setor + função (a mesma função em setores diferentes conta separado) */
  function postosDoPGR(pgr) {
    if (!pgr) return [];
    const out = [], vistos = new Set();
    const add = (ges, setor, funcao, exp) => {
      funcao = String(funcao || '').trim(); setor = String(setor || '').trim(); if (!funcao) return;
      const k = norm(setor) + '|' + norm(funcao); if (vistos.has(k)) return; vistos.add(k);
      out.push({ incluir: true, ges: ges ?? '', setor, funcao, atividade: '', tipo: tipoPosto(funcao, setor), expostos: exp ?? '' });
    };
    if (pgr.porCargo && pgr.porCargo.length) for (const b of pgr.porCargo) add(b.codigo, (b.setores || [])[0] || '', b.nome, b.expostos);
    else for (const g of pgr.ges || []) {
      const setor = (g.setores && g.setores.length ? g.setores.join(' / ') : g.nome) || '';
      for (const c of g.cargos || []) add(g.codigo, setor, c, g.cargosExp && g.cargosExp[c] != null ? g.cargosExp[c] : (g.cargos.length === 1 ? g.expostos : ''));
    }
    return out.sort((a, b) => (Number(a.ges) || 0) - (Number(b.ges) || 0));
  }

  function faixaFrp(P, n) { return P.frp.faixas.find(f => f.ate === null || f.ate === undefined || n <= f.ate); }

  /* cálculo de uma aba: devolve seções no layout da planilha corporativa */
  function calcular(mod, st, P) {
    const secoes = [], avisos = [];
    const lin = (desc, qtd, unit, obs) => ({ desc, qtd: num(qtd), unit: num(unit), total: r2(num(qtd) * num(unit)), obs: obs || '' });
    const s1 = [lin('Diária completa', st.diarias, P.diaria), lin('Meia diária', st.meias, P.meia_diaria)];
    const transp = [lin('Veículo alugado', st.veiculo, P.veiculo), lin('Km rodado (ida e volta)', st.km, P.km), lin('Outros (alimentação, passagens etc.)', st.alim, P.alimentacao)];
    const mat = [lin('Material administrativo (folha de papel + impressão)', st.folhas, P.folha)];
    const incl = (st.postos || []).filter(p => p.incluir);
    let serv = [];
    if (mod === 'aep') {
      const unit = r2((P.aep.campo_min + P.aep.lanc_min) * P.aep.hora / 60);
      serv = [lin('Funções administrativas e produção (postos)', incl.length, unit, `${P.aep.campo_min} min de campo + ${P.aep.lanc_min} min de lançamento por posto, a R$ ${P.aep.hora.toFixed(2).replace('.', ',')}/h`)];
      if (!incl.length) avisos.push('Nenhum posto incluído: importe a lista do PGR ou inclua os postos.');
    } else if (mod === 'aet') {
      const ua = r2((P.aet.adm.campo_min + P.aet.adm.lanc_min) * P.aet.hora / 60), up = r2((P.aet.prod.campo_min + P.aet.prod.lanc_min) * P.aet.hora / 60);
      const na = incl.filter(p => p.tipo === 'adm').length, np = incl.length - na;
      serv = [lin('Funções administrativas (postos)', na, ua, `${P.aet.adm.campo_min} min de campo + ${P.aet.adm.lanc_min} min de lançamento por posto`), lin('Funções de produção (postos)', np, up, `${P.aet.prod.campo_min} min de campo + ${P.aet.prod.lanc_min} min de lançamento por posto`)];
      if (!incl.length) avisos.push('Nenhum posto incluído: importe a lista do PGR ou inclua os postos.');
    } else {
      const n = num(st.ntrab); const fx = n > 0 ? faixaFrp(P, n) : null;
      const dias = st.diasFrp !== '' && st.diasFrp !== null && st.diasFrp !== undefined ? num(st.diasFrp) : (fx ? fx.dias : 0);
      const v = m => r2(m * P.frp.hora / 60);
      serv = [lin('Aplicação da metodologia SESI (APR)', dias, v(P.frp.aplicacao_min), `${P.frp.aplicacao_min} min por dia`), lin('Tabulação de dados', dias, v(P.frp.tabulacao_min), `${P.frp.tabulacao_min} min por dia`), lin('Elaboração do relatório técnico (APR)', dias, v(P.frp.relatorio_min), `${P.frp.relatorio_min} min por dia`)];
      if (fx && (fx.ate === null || fx.ate === undefined)) avisos.push(`Acima de ${P.frp.limite_consulta} colaboradores: a equipe de mercado deve consultar antes a área técnica, Central de SST (profissional ergonomista).`);
      if (!n) avisos.push('Informe o número de trabalhadores para definir a faixa.');
      secoes.faixa = fx; secoes.dias = dias;
    }
    const sec = (titulo, linhas) => ({ titulo, linhas, subtotal: r2(linhas.reduce((s, l) => s + l.total, 0)) });
    secoes.push(sec('1 - Despesas com colaboradores', s1), sec('2 - Serviços técnicos', serv), sec('3 - Despesas com transporte e alimentação', transp), sec('4 - Material de expediente', mat));
    const total = r2(secoes.reduce((s, x) => s + x.subtotal, 0));
    const bdi = r2(total * P.bdi); const descPct = num(st.desconto) / 100; const desc = r2((total + bdi) * descPct);
    return { secoes, total, bdiPct: P.bdi, bdi, descPct, desc, final: r2(total + bdi - desc), avisos, nPostos: incl.length, faixa: secoes.faixa, dias: secoes.dias };
  }

  /* ---------------------------------------------------------------- interface */
  function iniciar(ctx) {
    const { S, $, $$, fmt, esc, baixar } = ctx;
    S.ergo = S.ergo || { aep: estadoNovo(), aet: estadoNovo(), frp: estadoNovo() };
    let mod = 'aep';
    const P = () => params(S.regras);
    const st = () => S.ergo[mod];
    const CAMPOS = { 'er-empresa': 'empresa', 'er-cnpj': 'cnpj', 'er-cidade': 'cidade', 'er-ntrab': 'ntrab', 'er-resp': 'resp', 'er-data': 'data', 'er-diarias': 'diarias', 'er-meias': 'meias', 'er-km': 'km', 'er-veiculo': 'veiculo', 'er-alim': 'alim', 'er-folhas': 'folhas', 'er-desc': 'desconto', 'er-diasfrp': 'diasFrp' };

    /* dados de cada aba num formato comum, para importar de uma aba em outra */
    function dadosDe(origem) {
      if (origem === 'pgr') {
        const c = S.cadastro, L = S.logistica;
        if (!c.empresa && !S.pgr) return null;
        return { empresa: c.empresa, cnpj: c.cnpj, cidade: c.cidade, ntrab: c.n_trab, resp: L.responsavel, data: L.data, km: L.distancia ? L.distancia * 2 : '', postos: S.pgr ? postosDoPGR(S.pgr) : null };
      }
      if (origem === 'ppr') { const p = S.ppr; if (!p || !p.empresa) return null; return { empresa: p.empresa, cnpj: p.cnpj, cidade: p.cidade, ntrab: p.ntrab, resp: p.resp, data: p.data, km: p.km ? num(p.km) * 2 : '', diarias: p.diarias }; }
      const e = S.ergo[origem]; if (!e || (!e.empresa && !(e.postos || []).length)) return null;
      return { empresa: e.empresa, cnpj: e.cnpj, cidade: e.cidade, ntrab: e.ntrab, resp: e.resp, data: e.data, km: e.km, diarias: e.diarias, meias: e.meias, veiculo: e.veiculo, alim: e.alim, folhas: e.folhas, postos: (e.postos || []).length ? JSON.parse(JSON.stringify(e.postos)) : null };
    }
    function importar(destino, origem) {
      const d = dadosDe(origem);
      if (!d) return 'Não há dados em "' + ROT_ORIGEM[origem] + '" para importar.';
      const alvo = destino === 'ppr' ? S.ppr : S.ergo[destino];
      for (const k of ['empresa', 'cnpj', 'cidade', 'ntrab', 'resp', 'data']) if (d[k] !== undefined && d[k] !== '' && d[k] !== null) alvo[k] = d[k];
      if (destino === 'ppr') { if (d.km) alvo.km = num(d.km) / 2; if (d.diarias) alvo.diarias = d.diarias; }
      else {
        for (const k of ['km', 'diarias', 'meias', 'veiculo', 'alim', 'folhas']) if (d[k] !== undefined && d[k] !== '' && d[k] !== null) alvo[k] = d[k];
        if (destino !== 'frp' && d.postos) alvo.postos = d.postos;
      }
      if (ctx.registrar) ctx.registrar(`Dados importados de ${ROT_ORIGEM[origem]} para ${ROT_ORIGEM[destino]}`);
      return 'Importado de ' + ROT_ORIGEM[origem] + (destino !== 'frp' && destino !== 'ppr' && d.postos ? ` (${d.postos.length} postos)` : '') + '.';
    }
    const ROT_ORIGEM = { pgr: 'PGR lido (Esboço / LTCAT)', ppr: 'PPR', aep: 'AEP', aet: 'AET', frp: 'FRP' };

    function renderPostos() {
      const e = st(); const el = $('#er-postos');
      const tipoSel = p => `<select data-pt="tipo" style="width:auto"><option value="adm" ${p.tipo === 'adm' ? 'selected' : ''}>Administrativa</option><option value="prod" ${p.tipo === 'prod' ? 'selected' : ''}>Produção</option></select>`;
      let h = '<table class="custos"><thead><tr><th>Item</th><th>Incluir</th><th>GES</th><th>Setor</th><th>Função</th><th>Atividade (quando a mesma função faz coisas diferentes)</th><th>Tipo</th><th>Expostos</th><th></th></tr></thead><tbody>';
      e.postos.forEach((p, i) => {
        h += `<tr data-i="${i}"${p.incluir ? '' : ' style="opacity:.55"'}><td>${i + 1}</td><td><input type="checkbox" data-pt="incluir" ${p.incluir ? 'checked' : ''}></td><td><input data-pt="ges" value="${esc(p.ges)}" class="w60"></td><td><input data-pt="setor" value="${esc(p.setor)}"></td><td><input data-pt="funcao" value="${esc(p.funcao)}"></td><td><input data-pt="atividade" value="${esc(p.atividade)}" placeholder="descreva se for diferente"></td><td>${tipoSel(p)}</td><td><input data-pt="expostos" value="${esc(p.expostos)}" class="w60"></td><td style="white-space:nowrap"><button class="mini2" data-dup title="Mesma função com outra atividade">Duplicar</button> <button class="mini" data-del>x</button></td></tr>`;
      });
      if (!e.postos.length) h += '<tr><td colspan="9"><i>Nenhum posto. Importe do PGR lido ou inclua manualmente.</i></td></tr>';
      el.innerHTML = h + '</tbody></table>';
      const na = e.postos.filter(p => p.incluir && p.tipo === 'adm').length, np = e.postos.filter(p => p.incluir && p.tipo !== 'adm').length;
      $('#er-postos-info').textContent = `${e.postos.length} posto(s) na lista, ${na + np} incluído(s): ${na} administrativo(s) e ${np} de produção. Cada linha é um setor + função/atividade.`;
      el.querySelectorAll('tr[data-i]').forEach(tr => {
        const p = e.postos[Number(tr.dataset.i)];
        tr.querySelectorAll('[data-pt]').forEach(inp => inp.addEventListener('change', () => { const k = inp.dataset.pt; p[k] = k === 'incluir' ? inp.checked : inp.value; setTimeout(render, 0); }));
        tr.querySelector('[data-dup]').addEventListener('click', () => { e.postos.splice(Number(tr.dataset.i) + 1, 0, Object.assign({}, p, { atividade: '' })); render(); });
        tr.querySelector('[data-del]').addEventListener('click', () => { e.postos.splice(Number(tr.dataset.i), 1); render(); });
      });
    }
    function renderFrp(R) {
      const p = P(); const n = num(st().ntrab);
      $('#er-faixas').innerHTML = '<table class="param"><tr><th>Item</th><th>Total de trabalhadores</th><th>Dias</th></tr>' + p.frp.faixas.map((f, i) => `<tr${R.faixa === f ? ' style="background:#dbe9f6;font-weight:bold"' : ''}><td>${i + 1}</td><td>${esc(f.rotulo)}</td><td class="num">${f.dias}</td></tr>`).join('') + '</table>' + `<small>Valor por dia de serviço: R$ ${fmt(r2((p.frp.aplicacao_min + p.frp.tabulacao_min + p.frp.relatorio_min) * p.frp.hora / 60))} (aplicação, tabulação e relatório, a R$ ${fmt(p.frp.hora)}/h). ${n ? 'Faixa usada: ' + (R.faixa ? R.faixa.rotulo : '') + ', ' + R.dias + ' dia(s).' : ''}</small>`;
    }
    function render() {
      const e = st(), p = P();
      $('#er-titulo').textContent = TITULO[mod];
      for (const [id, k] of Object.entries(CAMPOS)) { const el = $('#' + id); if (el && document.activeElement !== el) el.value = e[k] ?? ''; }
      $('#er-card-postos').hidden = mod === 'frp'; $('#er-card-frp').hidden = mod !== 'frp';
      $('#er-imp-origem').innerHTML = Object.entries(ROT_ORIGEM).filter(([k]) => k !== mod).map(([k, r]) => `<option value="${k}">${r}</option>`).join('');
      const R = calcular(mod, e, p);
      if (mod === 'frp') renderFrp(R); else renderPostos();
      let h = R.avisos.map(a => `<div class="alerta-forte">${esc(a)}</div>`).join('');
      h += '<table class="custos"><thead><tr><th>Item</th><th>Descrição</th><th class="num">Quant.</th><th class="num">Valor unit. (R$)</th><th class="num">Total (R$)</th></tr></thead><tbody>';
      let it = 0;
      for (const s of R.secoes) {
        h += `<tr><th colspan="5">${esc(s.titulo)}</th></tr>`;
        for (const l of s.linhas) h += `<tr><td>${++it}</td><td>${esc(l.desc)}${l.obs ? `<br><small>${esc(l.obs)}</small>` : ''}</td><td class="num">${l.qtd.toLocaleString('pt-BR')}</td><td class="num">${fmt(l.unit)}</td><td class="num">${fmt(l.total)}</td></tr>`;
        h += `<tr class="sub"><td></td><td colspan="3">Subtotal</td><td class="num">${fmt(s.subtotal)}</td></tr>`;
      }
      h += `<tr class="tot"><td></td><td colspan="3">Custos totais</td><td class="num">${fmt(R.total)}</td></tr><tr><td></td><td colspan="3">BDI (${(R.bdiPct * 100).toFixed(0)}%)</td><td class="num">${fmt(R.bdi)}</td></tr><tr><td></td><td colspan="3">Desconto exclusivo (${(R.descPct * 100).toLocaleString('pt-BR')}%)</td><td class="num">${fmt(R.desc)}</td></tr><tr class="tot"><td></td><td colspan="3">Valor total da proposta</td><td class="num">${fmt(R.final)}</td></tr></tbody></table>`;
      $('#er-tabela').innerHTML = h;
      return R;
    }
    function nome() { return (mod === 'frp' ? 'Precificação FRP' : 'Precificação ' + mod.toUpperCase()) + ' - ' + String(st().empresa || 'empresa').replace(/[\\/:*?"<>|]/g, '').slice(0, 60); }
    function docHTML() {
      const e = st(), R = calcular(mod, e, P());
      let h = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(nome())}</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1c2430}h1{font-size:16px;color:#002E7F;margin:0}h2{font-size:13px;color:#002E7F;margin:14px 0 6px;break-after:avoid}table{border-collapse:collapse;width:100%}th,td{border:1px solid #b9c2cf;padding:3px 6px;text-align:left;vertical-align:top}tr{break-inside:avoid}.num{text-align:right}th{background:#eef2f7}tr.sub td{background:#fff8cc;font-weight:bold}tr.tot td{background:#dbe9f6;font-weight:bold}small{color:#667}.ass{margin-top:36px;text-align:center}.alerta-forte{border:1px solid #e89a9a;background:#ffe0e0;padding:5px 8px;margin:6px 0}</style></head><body>`;
      h += `<h1>SESI - DR/GOIÁS - Planilha de Custos: ${esc(TITULO[mod])}</h1><small>${esc(P().fonte)}</small>`;
      h += `<table style="margin-top:8px"><tr><td><b>Empresa:</b> ${esc(e.empresa)}${e.cnpj ? ' | CNPJ ' + esc(e.cnpj) : ''}</td><td><b>Local:</b> ${esc(e.cidade)}</td><td><b>Nº de empregados:</b> ${esc(e.ntrab)}</td></tr><tr><td><b>Responsável:</b> ${esc(e.resp)}</td><td><b>Data:</b> ${esc(e.data ? String(e.data).split('-').reverse().join('/') : '')}</td><td>${mod === 'frp' ? '<b>Faixa:</b> ' + esc(R.faixa ? R.faixa.rotulo : '') + ', ' + R.dias + ' dia(s)' : '<b>Postos:</b> ' + R.nPostos}</td></tr></table>`;
      h += '<h2>Planilha de custos</h2>' + $('#er-tabela').innerHTML.replace(/<thead>/g, '<tbody>').replace(/<\/thead>/g, '</tbody>');
      if (mod !== 'frp') {
        const ps = e.postos.filter(p => p.incluir);
        h += '<h2>Postos avaliados (setor, função/atividade)</h2><table><tbody><tr><th>Item</th><th>GES</th><th>Setor</th><th>Função</th><th>Atividade</th><th>Tipo</th><th>Expostos</th></tr>' + ps.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.ges)}</td><td>${esc(p.setor)}</td><td>${esc(p.funcao)}</td><td>${esc(p.atividade)}</td><td>${p.tipo === 'adm' ? 'Administrativa' : 'Produção'}</td><td>${esc(p.expostos)}</td></tr>`).join('') + '</tbody></table>';
      }
      return h + `<div class="ass">_______________________________________<br><b>${esc(e.resp || 'Responsável pela precificação')}</b><br>Central de SST SESI Goiás</div><p><small>Gerado em ${new Date().toLocaleString('pt-BR')} pelo Precifica-Fieg.</small></p></body></html>`;
    }
    async function excel() {
      const e = st(), R = calcular(mod, e, P());
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(mod === 'frp' ? 'FRP' : mod.toUpperCase());
      ws.columns = [{ width: 7 }, { width: 60 }, { width: 12 }, { width: 16 }, { width: 16 }];
      ws.mergeCells('A1:E1'); ws.getCell('A1').value = 'SESI - DR/GOIÁS - Planilha de Custos: ' + TITULO[mod]; ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF002E7F' } };
      [['Empresa', e.empresa], ['CNPJ', e.cnpj], ['Local', e.cidade], ['Nº de empregados', e.ntrab], ['Responsável', e.resp], ['Data', e.data ? String(e.data).split('-').reverse().join('/') : '']].forEach((r, i) => { ws.getCell('A' + (3 + i)).value = r[0]; ws.getCell('A' + (3 + i)).font = { bold: true }; ws.mergeCells(`B${3 + i}:E${3 + i}`); ws.getCell('B' + (3 + i)).value = r[1] ?? ''; });
      let row = 10; const hdr = ['Item', 'Descrição', 'Quantidade', 'Valor unit. (R$)', 'Total (R$)'];
      hdr.forEach((t, i) => { const c = ws.getRow(row).getCell(i + 1); c.value = t; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002E7F' } }; });
      row++; let it = 0; const subs = [];
      for (const s of R.secoes) {
        ws.getCell('B' + row).value = s.titulo; ws.getCell('B' + row).font = { bold: true }; row++;
        const ini = row;
        for (const l of s.linhas) { const r = ws.getRow(row); r.getCell(1).value = ++it; r.getCell(2).value = l.desc + (l.obs ? ' (' + l.obs + ')' : ''); r.getCell(3).value = l.qtd; r.getCell(4).value = l.unit; r.getCell(5).value = { formula: `C${row}*D${row}`, result: l.total }; r.getCell(4).numFmt = r.getCell(5).numFmt = '#,##0.00'; row++; }
        ws.getCell('B' + row).value = 'Subtotal'; ws.getCell('E' + row).value = { formula: `SUM(E${ini}:E${row - 1})`, result: s.subtotal }; ws.getCell('E' + row).numFmt = '#,##0.00'; ws.getCell('B' + row).font = ws.getCell('E' + row).font = { bold: true }; subs.push('E' + row); row += 2;
      }
      const lt = row;
      ws.getCell('B' + lt).value = 'Custos totais'; ws.getCell('E' + lt).value = { formula: subs.join('+'), result: R.total };
      ws.getCell('B' + (lt + 1)).value = 'BDI (%)'; ws.getCell('D' + (lt + 1)).value = R.bdiPct; ws.getCell('D' + (lt + 1)).numFmt = '0%'; ws.getCell('E' + (lt + 1)).value = { formula: `E${lt}*D${lt + 1}`, result: R.bdi };
      ws.getCell('B' + (lt + 2)).value = 'Desconto exclusivo (%)'; ws.getCell('D' + (lt + 2)).value = R.descPct; ws.getCell('D' + (lt + 2)).numFmt = '0.0%'; ws.getCell('E' + (lt + 2)).value = { formula: `(E${lt}+E${lt + 1})*D${lt + 2}`, result: R.desc };
      ws.getCell('B' + (lt + 3)).value = 'Valor total da proposta'; ws.getCell('E' + (lt + 3)).value = { formula: `E${lt}+E${lt + 1}-E${lt + 2}`, result: R.final };
      for (let r = lt; r <= lt + 3; r++) { ws.getCell('B' + r).font = { bold: true }; ws.getCell('E' + r).font = { bold: true }; ws.getCell('E' + r).numFmt = '#,##0.00'; }
      if (mod !== 'frp') {
        const w2 = wb.addWorksheet('Postos');
        w2.columns = [{ header: 'Item', width: 6 }, { header: 'GES', width: 8 }, { header: 'Setor', width: 34 }, { header: 'Função', width: 34 }, { header: 'Atividade', width: 40 }, { header: 'Tipo', width: 14 }, { header: 'Expostos', width: 10 }, { header: 'Incluído', width: 10 }];
        w2.getRow(1).font = { bold: true };
        e.postos.forEach((p, i) => w2.addRow([i + 1, p.ges, p.setor, p.funcao, p.atividade, p.tipo === 'adm' ? 'Administrativa' : 'Produção', p.expostos, p.incluir ? 'Sim' : 'Não']));
      }
      const buf = await wb.xlsx.writeBuffer();
      return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    function ligar() {
      for (const [id, k] of Object.entries(CAMPOS)) { const el = $('#' + id); if (el) el.addEventListener('change', () => { st()[k] = el.value; render(); }); }
      $('#er-imp-btn').addEventListener('click', () => { $('#er-imp-info').textContent = importar(mod, $('#er-imp-origem').value); render(); });
      $('#er-postos-pgr').addEventListener('click', () => {
        if (!S.pgr) { $('#er-postos-info').textContent = 'Nenhum PGR lido. Leia o PGR no módulo Esboço ou LTCAT (passo 1) e volte aqui.'; return; }
        st().postos = postosDoPGR(S.pgr); if (ctx.registrar) ctx.registrar(`${TITULO[mod]}: lista de postos importada do PGR (${st().postos.length})`); render();
      });
      $('#er-postos-add').addEventListener('click', () => { st().postos.push({ incluir: true, ges: '', setor: '', funcao: '', atividade: '', tipo: 'prod', expostos: '' }); render(); });
      $('#er-postos-adm').addEventListener('click', () => { st().postos.forEach(p => p.tipo = tipoPosto(p.funcao, p.setor)); render(); });
      $('#er-excel').addEventListener('click', async () => { try { baixar(await excel(), nome() + '.xlsx'); } catch (err) { alert('Erro ao gerar Excel: ' + err.message); } });
      $('#er-json').addEventListener('click', () => baixar(new Blob([JSON.stringify({ app: 'Precifica-Fieg', modulo: mod, salvoEm: new Date().toISOString(), regrasVersao: S.regras.versao, parametros: P(), dados: st(), resultado: calcular(mod, st(), P()) }, null, 1)], { type: 'application/json' }), nome() + '.json'));
      $('#er-print').addEventListener('click', () => { const w = window.open('', '_blank'); const html = docHTML(); if (!w) { baixar(new Blob([html], { type: 'text/html' }), nome() + '.html'); return; } w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400); });
      $('#er-pasta').addEventListener('click', async () => {
        const stt = $('#er-status');
        if (!window.PastaLocal || !PastaLocal.suportado()) { stt.textContent = 'Salvar em pasta só funciona no Chrome ou Edge.'; return; }
        try {
          const arqs = [[nome() + '.xlsx', await excel()], [nome() + '.html', new Blob([docHTML()], { type: 'text/html' })], [nome() + '.json', new Blob([JSON.stringify({ app: 'Precifica-Fieg', modulo: mod, dados: st(), resultado: calcular(mod, st(), P()) }, null, 1)], { type: 'application/json' })]];
          const cliente = (st().cnpj ? String(st().cnpj).replace(/\D/g, '').slice(0, 8) + ' - ' : '') + (st().empresa || 'cliente');
          const r = await PastaLocal.salvarCliente(cliente, arqs, m => stt.textContent = m);
          stt.innerHTML = `Salvo em <b>${esc(r.raiz)} / ${esc(r.pasta)}</b>`;
        } catch (err) { stt.textContent = err.name === 'AbortError' ? 'Cancelado.' : 'Erro: ' + err.message; }
      });
    }
    ligar();
    return { abrir(m) { mod = m; if (!S.ergo[m].empresa) { const d = dadosDe('pgr'); if (d) { for (const k of ['empresa', 'cnpj', 'cidade', 'ntrab', 'resp', 'data']) if (d[k]) S.ergo[m][k] = d[k]; if (d.km && !S.ergo[m].km) S.ergo[m].km = d.km; } } if (m !== 'frp' && !S.ergo[m].postos.length && S.pgr) S.ergo[m].postos = postosDoPGR(S.pgr); return render(); }, importar, dadosDe, calcular: (m) => calcular(m, S.ergo[m], P()), docHTML };
  }

  return { PADRAO, params, estadoNovo, calcular, postosDoPGR, tipoPosto, iniciar };
});
