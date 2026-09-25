/* motor.js - motor de cálculo da precificação (mesmas regras do modelo Excel "Precificação LTCAT-LI").
   Entrada: { linhas, logistica, regras, exames, vigencia }
     linhas: [{ges, nome, expostos, tipo, agente, qtdAjustada, escopo:'cobrar'|'plano'|'nao', obs}]
     logistica: { distancia (km só ida), pernoite (bool), diasAjustado (null|n) }
   Saída: { linhas (com cálculo), dias, totalAv, custos, secao4, resumoProposta } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Motor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const T = {
    RUIDO: 'Ruído (dosimetria)', CALOR: 'Calor (IBUTG)', VCI: 'Vibração corpo inteiro', VMB: 'Vibração mãos e braços',
    QUIM: 'Químico (laboratório)', QUAL: 'Avaliação qualitativa', AUS: 'Ausência de risco', LP: 'Periculosidade (por cargo)'
  };

  /* grupo de risco da linha, para as flags de precificação (químicos, físicos, biológicos) */
  function grupoLinha(l) {
    if ([T.RUIDO, T.CALOR, T.VCI, T.VMB].includes(l.tipo)) return 'fisicos';
    if (l.tipo === T.QUIM) return 'quimicos';
    if (l.tipo === T.QUAL) {
      if (l.fisico) return 'fisicos';
      if (l.grupo === 'biologicos' || /^biol[oó]gico/i.test(l.agente || '')) return 'biologicos';
      return 'quimicos';
    }
    return null;
  }
  const excluida = (l, ex) => !!(ex && ex.length && ex.includes(grupoLinha(l)));
  function v(regras, k) { const r = regras.valores[k]; return r ? Number(r.valor) : 0; }
  function tipo(regras, t) { return regras.tipos[t] || { horas: 0, por_dia: 0, fixo: 0 }; }
  function r2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }

  function precoExame(exames, nome, vigencia) {
    const it = exames.itens.find(e => e.nome === nome);
    if (!it) return null;
    return Number(it[vigencia || 'v2026']) || 0;
  }

  const RE_POEIRA = /poeira|s[ií]lica|particulad|pnos/i;
  function qtdSugerida(l, regras, opts) {
    const exp = l.expostos === '' || l.expostos === null || l.expostos === undefined ? null : Number(l.expostos);
    if (opts && opts.mineracao && l.tipo === T.QUIM && RE_POEIRA.test(l.agente || '') && (exp === null || exp > 0)) return Math.max(1, Number(v(regras, 'nr22_medicoes_poeira')) || 3);
    if (l.tipo === T.RUIDO) {
      if (exp === null) return 1;
      if (exp > v(regras, 'dosimetria_limiar')) return Math.max(1, Math.ceil(Math.round(exp * v(regras, 'dosimetria_pct') * 1e6) / 1e6));
      return exp > 0 ? 1 : 0;
    }
    if (l.tipo === T.AUS) return 0;
    if (l.tipo === T.LP) return 1;
    return (exp === null || exp > 0) ? 1 : 0;
  }

  /* Ruído com base no GES (decisão da gestão, 25/09/2026). Quando o levantamento está por cargo, os cargos do
     mesmo GHE são somados: dosimetrias do GES = teto(20% dos expostos do GES) acima do limiar, senão 1.
     As dosimetrias são distribuídas entre os cargos pelo número de expostos (maior resto). */
  function ruidoPorGes(linhas, R, EX) {
    if (!v(R, 'ruido_base_ges')) return;
    const grupos = {};
    for (const l of linhas) {
      if (l.tipo !== T.RUIDO || !l.unidadeCargo || l.escopo === 'nao' || excluida(l, EX)) continue;
      const g = String(l.ges || '').trim();
      if (!g || /^s\/?n$/i.test(g)) continue;
      (grupos[g] = grupos[g] || []).push(l);
    }
    for (const [g, ls] of Object.entries(grupos)) {
      if (ls.length < 2 || ls.every(l => l.expostos === null || l.expostos === '' || l.expostos === undefined)) continue;
      const tot = ls.reduce((s, l) => s + (Number(l.expostos) || 0), 0);
      const q = qtdSugerida({ tipo: T.RUIDO, expostos: tot }, R);
      const base = ls.map(l => tot > 0 ? (Number(l.expostos) || 0) / tot * q : q / ls.length);
      const parte = base.map(Math.floor);
      let resto = q - parte.reduce((s, x) => s + x, 0);
      base.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (resto > 0) { parte[i]++; resto--; } });
      ls.forEach((l, i) => {
        l.qtdSugerida = parte[i];
        l.notaRuido = `Ruído por GES: ${q} dosimetria(s) para ${tot} expostos no GHE ${g} (${ls.length} cargos)`;
        if (l.qtdAjustada === null || l.qtdAjustada === undefined || l.qtdAjustada === '') l.qtd = parte[i];
      });
    }
  }

  /* quantidades sugeridas e finais de todas as linhas (inclui a regra do ruído por GES) */
  function sugeridas(linhas, R, opts, EX) {
    for (const l of linhas) {
      l.qtdSugerida = qtdSugerida(l, R, opts);
      l.qtd = (l.qtdAjustada === null || l.qtdAjustada === undefined || l.qtdAjustada === '') ? l.qtdSugerida : Number(l.qtdAjustada);
      delete l.notaRuido;
    }
    ruidoPorGes(linhas, R, EX);
  }

  /* modo: 'adicional' (só escopo cobrar) ou 'total' (cobrar + coberto pelo plano) */
  function calcular(ent, modo) {
    modo = modo || 'adicional';
    const R = ent.regras, EX = ent.exames, vig = ent.vigencia || 'v2026';
    const log = ent.logistica || {};
    const dist = Number(log.distancia) || 0, pernoite = !!log.pernoite;

    const GX = ent.gruposExcluidos || [];
    const ativas = ent.linhas.filter(l => l.tipo && l.escopo !== 'nao' && !excluida(l, GX) && (modo === 'total' || l.escopo !== 'plano'));
    // quantidades
    sugeridas(ent.linhas, R, { mineracao: !!ent.mineracao }, GX);
    const nQual = ativas.filter(l => l.tipo === T.QUAL).reduce((s, l) => s + l.qtd, 0);
    const nLP = ativas.filter(l => l.tipo === T.LP).reduce((s, l) => s + l.qtd, 0);
    const out = [];
    for (const l of ent.linhas) {
      const ativa = ativas.includes(l);
      const tp = tipo(R, l.tipo);
      let unit = 0, semPreco = false;
      const manual = l.valorManual !== null && l.valorManual !== undefined && l.valorManual !== '' && !isNaN(Number(l.valorManual));
      if (manual) unit = Number(l.valorManual);
      else if (l.tipo === T.QUIM) { const p = precoExame(EX, l.agente, vig); unit = p === null ? 0 : p; semPreco = p === null; }
      else if (l.tipo === T.QUAL) unit = nQual > 1 ? v(R, 'qualitativa_varias') : v(R, 'qualitativa_unica');
      else if (l.tipo === T.LP) unit = nLP >= v(R, 'lp_muitos_limiar') ? v(R, 'lp_muitos_valor') : v(R, 'lp_por_cargo');
      else unit = Number(tp.fixo) || 0;
      const c = Object.assign({}, l, {
        ativa, valorUnit: unit, semPreco, grupoExcluido: excluida(l, GX), escopo: excluida(l, GX) ? 'nao' : l.escopo,
        obs: l.notaRuido ? (l.obs ? l.obs + ' | ' : '') + l.notaRuido : l.obs,
        custo: ativa ? r2(l.qtd * unit) : 0,
        horas: ativa ? l.qtd * (Number(tp.horas) || 0) : 0,
        folhas: ativa ? l.qtd * v(R, 'folhas_por_avaliacao') : 0,
        diasFrac: ativa && tp.por_dia > 0 ? l.qtd / tp.por_dia : 0
      });
      out.push(c);
    }
    const A = out.filter(l => l.ativa);
    const totalAv = A.reduce((s, l) => s + l.qtd, 0);
    // dias de campo: soma de (qtd / avaliações por dia) por tipo. Químicos (bombas) podem correr em paralelo
    // aos dias de dosimetria: nesse caso só contam os dias de químico que excedem os de dosimetria.
    const fr = t => A.filter(l => l.tipo === t).reduce((s, l) => s + l.diasFrac, 0);
    const dDos = fr(T.RUIDO), dQui = fr(T.QUIM), dOut = A.filter(l => l.tipo !== T.RUIDO && l.tipo !== T.QUIM).reduce((s, l) => s + l.diasFrac, 0);
    const paralelo = v(R, 'quimicos_em_paralelo') ? true : false;
    const diasSug = totalAv === 0 ? 0 : Math.max(1, Math.ceil((paralelo ? Math.max(dDos, dQui) : dDos + dQui) + dOut - 1e-9));
    const dias = (log.diasAjustado === null || log.diasAjustado === undefined || log.diasAjustado === '') ? diasSug : Number(log.diasAjustado);
    // horas de campo = dias x jornada técnica (anotação da Central: 10 h por dia de dosimetria)
    const horasCampo = dias * v(R, 'horas_dia_campo');
    const folhas = Math.min(totalAv * v(R, 'folhas_por_avaliacao'), v(R, 'folhas_teto') || Infinity);
    const temQuim = A.some(l => l.tipo === T.QUIM && l.qtd > 0);

    // logística: ida e volta diária x pernoite (modo 'auto' escolhe a mais barata)
    const livre = dist * 2 <= v(R, 'km_livre_ida_volta');
    const viagens = dias > 0 ? Math.ceil(dias / Math.max(1, v(R, 'dias_por_viagem'))) : 0;
    const opDiario = (() => {
      const meiaQ = dist > v(R, 'dist_diaria_ida') ? dias : 0;
      const refQ = dist <= v(R, 'dist_diaria_ida') ? dias : 0;
      const kmQ = livre ? 0 : dist * 2 * dias;
      return { modo: 'diario', diariaQ: 0, meiaQ, refQ, kmQ, viagens: dias, custo: meiaQ * v(R, 'meia_diaria') + refQ * v(R, 'refeicao') + kmQ * v(R, 'km') };
    })();
    const opPernoite = (() => {
      const diariaQ = dias, meiaQ = viagens, kmQ = livre ? 0 : dist * 2 * viagens;
      return { modo: 'pernoite', diariaQ, meiaQ, refQ: 0, kmQ, viagens, custo: diariaQ * v(R, 'diaria_completa') + meiaQ * v(R, 'meia_diaria') + kmQ * v(R, 'km') };
    })();
    const modoLog = log.modo || (log.pernoite ? 'pernoite' : 'auto');
    const L = modoLog === 'pernoite' ? opPernoite : modoLog === 'diario' ? opDiario : (dist * 2 > v(R, 'km_livre_ida_volta') && opPernoite.custo < opDiario.custo ? opPernoite : opDiario);
    const diariaQ = L.diariaQ, meiaQ = L.meiaQ;
    // 1 - colaboradores: diárias
    const c1 = r2(diariaQ * v(R, 'diaria_completa') + meiaQ * v(R, 'meia_diaria'));
    // 2 - horas: lançamento e revisão proporcionais às horas de campo
    const hLevEng = v(R, 'levantamento_h_eng');
    const hLanc = totalAv === 0 ? 0 : Math.max(v(R, 'lancamento_h_min'), r2(horasCampo * v(R, 'lancamento_pct')));
    const hRev = totalAv === 0 ? 0 : Math.max(v(R, 'revisao_h_eng'), r2(horasCampo * v(R, 'revisao_pct'))), hEnt = v(R, 'entrega_h_eng');
    const c2 = r2(hLevEng * v(R, 'hora_engenheiro') + horasCampo * v(R, 'hora_tst') + hLanc * v(R, 'hora_tst') + hRev * v(R, 'hora_engenheiro') + hEnt * v(R, 'hora_engenheiro'));
    // 5 - transporte
    const kmQ = L.kmQ, refQ = L.refQ;
    const c5 = r2(kmQ * v(R, 'km') + refQ * v(R, 'refeicao'));
    // 6 - material: postagem por viagem (mínimo configurado) quando há químico
    const postAuto = temQuim ? Math.max(v(R, 'postagens_com_quimico'), L.modo === 'pernoite' ? L.viagens : Math.ceil(dias / Math.max(1, v(R, 'dias_por_viagem')))) : 0;
    // o usuário pode ajustar (ex.: químicos feitos em semanas diferentes geram mais envios ao laboratório)
    const postAj = log.postagensAjustado;
    const postQ = (postAj === null || postAj === undefined || postAj === '' || isNaN(Number(postAj))) ? postAuto : Math.max(0, Math.round(Number(postAj)));
    const c6 = r2(v(R, 'art') + postQ * v(R, 'postagem') + folhas * v(R, 'folha'));
    // 7 - serviços
    const c7 = r2(A.reduce((s, l) => s + l.custo, 0));
    const total = r2(c1 + c2 + c5 + c6 + c7);
    const bdi = r2(total * v(R, 'bdi'));
    const descPct = (ent.descontoPct === null || ent.descontoPct === undefined || ent.descontoPct === '') ? v(R, 'desconto') : Number(ent.descontoPct);
    const desc = r2(descPct * (total + bdi));
    const ausencia = totalAv === 0;
    const proposta = ausencia ? v(R, 'ausencia_valor') : r2(total + bdi - desc);

    // seção 4 (outros serviços) e itens da proposta ao cliente
    const secao4 = [];
    const fixos = [[T.RUIDO, 'Dosimetria de ruído'], [T.CALOR, 'Avaliação de calor (IBUTG)'], [T.VCI, 'Vibração de corpo inteiro'], [T.VMB, 'Vibração de mãos e braços'], [T.QUAL, 'Avaliação qualitativa'], [T.LP, 'Laudo de Periculosidade (cargos)']];
    for (const [t, rot] of fixos) {
      const ls = A.filter(l => l.tipo === t); const q = ls.reduce((s, l) => s + l.qtd, 0);
      const custo = r2(ls.reduce((s, l) => s + l.custo, 0));
      let detalhe = '';
      if (t === T.QUAL && q) {
        // quais avaliações qualitativas: agente e quantidade (ex.: Radiação ultravioleta 4; Biológico 1)
        const ag = {};
        for (const l of ls) { const k = String(l.agente || l.fatorOriginal || 'não especificado').replace(/^Biológico:\s*/i, 'Biológico: ').trim(); ag[k] = (ag[k] || 0) + l.qtd; }
        detalhe = Object.entries(ag).map(([k, n]) => `${k} (${n})`).join('; ');
      }
      secao4.push({ descricao: rot, tipo: t, qtd: q, valorUnit: q ? r2(custo / q) : (tipo(R, t).fixo || 0), total: custo, detalhe });
    }
    const quim = {};
    for (const l of A.filter(l => l.tipo === T.QUIM)) {
      const k = (l.agente || l.fatorOriginal || 'Outros') + (l.valorManual != null && l.valorManual !== '' ? ' (valor manual)' : ''); quim[k] = quim[k] || { descricao: k, tipo: T.QUIM, qtd: 0, valorUnit: l.valorUnit, total: 0 };
      quim[k].qtd += l.qtd; quim[k].total = r2(quim[k].total + l.custo);
    }
    for (const k of Object.keys(quim)) secao4.push(quim[k]);

    const propostaItens = secao4.filter(s => s.qtd > 0).map(s => ({ descricao: s.descricao + (s.detalhe ? ': ' + s.detalhe : ''), qtd: s.qtd }));

    return {
      linhas: out, dias, diasSug, totalAv, horasCampo, folhas, ausencia, modo, logistica: { modo: L.modo, viagens: L.viagens, opDiario: r2(opDiario.custo), opPernoite: r2(opPernoite.custo), escolhido: modoLog },
      custos: {
        c1: { total: c1, diariaQ, meiaQ, diariaV: v(R, 'diaria_completa'), meiaV: v(R, 'meia_diaria') },
        c2: { total: c2, hLevEng, hCampo: horasCampo, hLanc, hRev, hEnt, hEng: v(R, 'hora_engenheiro'), hTst: v(R, 'hora_tst') },
        c3: { total: 0 }, c4: { total: 0 },
        c5: { total: c5, kmQ, kmV: v(R, 'km'), refQ, refV: v(R, 'refeicao') },
        c6: { total: c6, art: v(R, 'art'), postQ, postAuto, postV: v(R, 'postagem'), folhas, folhaV: v(R, 'folha') },
        c7: { total: c7 },
        total, bdiPct: v(R, 'bdi'), bdi, descPct, desc, proposta
      },
      secao4, propostaItens
    };
  }

  /* Aplica o plano: marca como 'plano' as linhas cobertas; mantém 'nao' e ajustes manuais se pedido. */
  function aplicarPlano(linhas, regras, plano, preservarManual) {
    const cobre = (regras.planos[plano] || { cobre: [] }).cobre;
    for (const l of linhas) {
      if (preservarManual && l.escopoManual) continue;
      const coberto = cobre.includes(l.tipo) || (cobre.includes('fisico_qualitativo') && l.tipo === T.QUAL && l.fisico);
      l.escopo = coberto ? 'plano' : (l.escopo === 'nao' ? 'nao' : 'cobrar');
    }
    return linhas;
  }

  return { T, calcular, aplicarPlano, qtdSugerida, sugeridas, precoExame, grupoLinha };
});
