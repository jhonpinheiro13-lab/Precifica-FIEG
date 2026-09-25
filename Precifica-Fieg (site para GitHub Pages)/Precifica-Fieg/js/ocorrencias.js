/* ocorrencias.js - relatório técnico de ocorrências e alterações da precificação.
   Registra as decisões tomadas (pontos críticos resolvidos, edições do levantamento, ajustes do resultado),
   levanta as alterações manuais em relação às regras e gera um relatório em HTML (para imprimir em PDF). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ocorrencias = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmt = n => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const agora = () => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const ESCOPO = { cobrar: 'Adicional (cobrar)', plano: 'Coberto pelo plano', nao: 'Não entra' };

  function registrar(S, r) {
    S.historico = S.historico || [];
    S.historico.push(Object.assign({ quando: agora(), responsavel: (S.logistica && S.logistica.responsavel) || 'não informado' }, r));
  }

  function chavePonto(c) { return c.tipo + '|' + String(c.agente || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

  /* Texto padrão do parecer técnico para uma ocorrência que ficou pendente (por que não adotamos) */
  function parecerPadrao(c) {
    const ag = c.agente || 'agente não especificado';
    const t = c.tipo || '';
    if (/^OUTROS/.test(t)) return `O PGR registra o agente como "${ag}", sem identificar a substância. Sem a identificação do produto (FISPQ ou rótulo) não é possível definir o método de coleta nem o exame do laboratório. Não adotamos exame substituto para não precificar um método que pode não corresponder ao agente real. O item ficou fora do preço e deve ser confirmado com o cliente antes da medição.`;
    if (/sem identifica|sem exame/i.test(t)) return `O agente "${ag}" não tem exame correspondente na tabela do laboratório contratado. Não adotamos exame por semelhança de nome sem validação técnica, porque o método de coleta e a análise podem ser diferentes. Pendente de cotação com o laboratório ou de definição do responsável técnico; o item ficou fora do preço.`;
    if (/aproxima/i.test(t)) return `O exame foi associado a "${ag}" por semelhança de nome e ainda não foi confirmado. Mantivemos o exame sugerido apenas como referência, sujeito à validação do responsável técnico antes da proposta.`;
    if (/ionizante/i.test(t)) return `O PGR registra radiação ionizante (${ag}). Essa avaliação exige metodologia específica (normas CNEN) e pode caracterizar periculosidade, não sendo uma avaliação qualitativa comum. Não adotamos a precificação como qualitativa simples; é preciso confirmar com o cliente a existência e o tipo da fonte.`;
    if (/f[ií]sico n[aã]o reconhecido/i.test(t)) return `O agente físico "${ag}" não corresponde a nenhuma avaliação padronizada da Central. Mantivemos como avaliação qualitativa até a definição do tipo de avaliação pelo responsável técnico.`;
    if (/vibra/i.test(t)) return `O PGR não informa se a vibração é de corpo inteiro ou de mãos e braços. Mantivemos como corpo inteiro até a confirmação da atividade com o cliente.`;
    return `Ocorrência "${t}" (${ag}) mantida sem alteração, aguardando validação do responsável técnico.`;
  }

  /* Alterações manuais em relação às regras (estado atual do orçamento) */
  function alteracoes(S, R, precoTabela) {
    const out = [];
    const add = (chave, onde, oque, de, para, motivo) => out.push({ chave, onde, oque, de, para, motivo: motivo || (S.motivos && S.motivos[chave]) || '' });
    for (const l of (R ? R.linhas : S.linhas)) {
      const id = `GES ${l.ges ?? ''} ${l.nome ? '(' + String(l.nome).slice(0, 40) + ')' : ''}`.trim();
      const ag = l.agente || l.fatorOriginal || l.tipo;
      const base = [l.ges, l.nome, l.tipo, l.agente || l.fatorOriginal].join('|');
      if (l.qtdAjustada !== null && l.qtdAjustada !== undefined && l.qtdAjustada !== '' && Number(l.qtdAjustada) !== Number(l.qtdSugerida))
        add('qtd|' + base, id, `Quantidade de ${l.tipo}: ${ag}`, String(l.qtdSugerida ?? ''), String(l.qtdAjustada));
      if (l.valorManual !== null && l.valorManual !== undefined && l.valorManual !== '') {
        const p = precoTabela ? precoTabela(l) : null;
        add('valor|' + base, id, `Valor unitário manual: ${ag}`, p === null || p === undefined ? 'sem preço na tabela' : 'R$ ' + fmt(p), 'R$ ' + fmt(l.valorManual), l.motivoManual || '');
      }
      if (l.escopoManual && l.escopo) add('escopo|' + base, id, `Escopo definido manualmente: ${ag}`, 'regra do plano', ESCOPO[l.escopo] || l.escopo, l.motivoEscopo || '');
      if (l.manual) add('nova|' + base, id, `Linha incluída manualmente: ${l.tipo} ${l.agente || ''}`.trim(), 'não consta no PGR', 'incluída');
    }
    if (S.gruposExcluidos && S.gruposExcluidos.length) { const RG = { quimicos: 'Químicos', fisicos: 'Físicos', biologicos: 'Biológicos' }; add('grupos', 'Levantamento', 'Grupos de risco fora da precificação', 'todos os grupos do PGR', S.gruposExcluidos.map(g => RG[g] || g).join(', ')); }
    const L = S.logistica || {};
    if (R && L.diasAjustado !== null && L.diasAjustado !== undefined && L.diasAjustado !== '') add('dias', 'Logística', 'Dias em campo', String(R.diasSug), String(L.diasAjustado));
    if (L.modo && L.modo !== 'auto' && R) add('logmodo', 'Logística', 'Modo de logística definido manualmente', 'automático (' + (R.logistica.opPernoite < R.logistica.opDiario ? 'pernoite' : 'ida e volta diária') + ')', L.modo === 'pernoite' ? 'pernoite' : 'ida e volta diária');
    if (R && L.postagensAjustado !== null && L.postagensAjustado !== undefined && L.postagensAjustado !== '') add('postagens', 'Resultado', 'Postagens para amostra', String(R.custos.c6.postAuto), String(R.custos.c6.postQ), L.motivoPostagens || '');
    if (S.descontoPct !== null && S.descontoPct !== undefined && S.descontoPct !== '' && Number(S.descontoPct) > 0) add('desconto', 'Resultado', 'Desconto exclusivo', '0%', (Number(S.descontoPct) * 100).toFixed(1).replace('.', ',') + '%');
    if (S.regrasLocais) add('regras', 'Parâmetros', 'Parâmetros editados neste navegador (diferentes do padrão publicado)', 'regras ' + (S.regras.versao || ''), 'valores locais');
    return out;
  }

  function tabela(cab, linhas, larguras) {
    let h = '<table><thead><tr>' + cab.map((c, i) => `<th${larguras && larguras[i] ? ` style="width:${larguras[i]}"` : ''}>${esc(c)}</th>`).join('') + '</tr></thead><tbody>';
    if (!linhas.length) h += `<tr><td colspan="${cab.length}"><i>Nenhuma.</i></td></tr>`;
    for (const r of linhas) h += '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>';
    return h + '</tbody></table>';
  }

  /* HTML completo do relatório.
     ctx: { S, R (resultado), pontos (pontos críticos atuais), precoTabela(l) } */
  function html(ctx) {
    const { S, R, pontos } = ctx;
    const c = S.cadastro || {}, L = S.logistica || {};
    const pend = pontos.filter(p => p.acao !== 'info');
    const info = pontos.filter(p => p.acao === 'info');
    const trat = (S.historico || []).filter(h => h.origem === 'Ponto crítico');
    const outrosHist = (S.historico || []).filter(h => h.origem !== 'Ponto crítico');
    const alts = alteracoes(S, R, ctx.precoTabela);
    const semMotivo = alts.filter(a => !a.motivo).length;
    const gesTxt = p => { const g = Array.from(p.ges || []); return g.length > 6 ? g.length + ' GES' : g.join(', '); };
    const cu = R ? R.custos : null;
    let h = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Ocorrências - ${esc(c.empresa || '')}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1c2430;margin:28px}h1{font-size:18px;color:#002E7F;margin:0 0 4px}h2{font-size:14px;color:#002E7F;margin:18px 0 6px;border-bottom:1px solid #c9d3e0;padding-bottom:3px}
table{border-collapse:collapse;width:100%;margin-bottom:6px}th,td{border:1px solid #b9c2cf;padding:4px 6px;vertical-align:top;text-align:left}th{background:#002E7F;color:#fff;font-size:11px}td{font-size:11px}
.cab td{border:0;padding:2px 8px 2px 0}.res{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}.res div{background:#f3f5f8;border:1px solid #d6dbe3;border-radius:6px;padding:6px 10px}.res b{display:block;font-size:16px;color:#002E7F}
.pend td{background:#fff8e1}.ok td{background:#f1f8f3}small{color:#667}.ass{margin-top:40px;text-align:center}@media print{body{margin:12mm}h2{page-break-after:avoid}tr{page-break-inside:avoid}}</style></head><body>`;
    h += `<h1>Relatório técnico de ocorrências da precificação</h1><div><small>Precifica-Fieg | Central de SST SESI Goiás</small></div>`;
    h += `<table class="cab"><tr><td><b>Empresa:</b> ${esc(c.empresa || '')}</td><td><b>CNPJ:</b> ${esc(c.cnpj || '')}</td><td><b>Cidade:</b> ${esc(c.cidade || '')}</td></tr>
<tr><td><b>Responsável:</b> ${esc(L.responsavel || 'não informado')}</td><td><b>Data:</b> ${esc(L.data ? L.data.split('-').reverse().join('/') : '')}</td><td><b>Plano:</b> ${esc(S.plano || '')}</td></tr>
<tr><td><b>Documento:</b> ${esc(S.arquivos && S.arquivos.pgr ? S.arquivos.pgr.name : (S.pgrNome || 'não informado'))}</td><td><b>Regras:</b> ${esc(S.regras.versao || '')}</td><td><b>Tabela de exames:</b> ${esc((S.exames && S.exames.fonte) || '')} (${esc(L.vigencia || '')})</td></tr></table>`;
    h += `<div class="res"><div><b>${trat.length + pend.length}</b>ocorrências identificadas</div><div><b>${trat.length}</b>tratadas</div><div><b>${pend.length}</b>pendentes (com parecer)</div><div><b>${alts.length}</b>alterações manuais${semMotivo ? ` (${semMotivo} sem motivo)` : ''}</div>${cu ? `<div><b>R$ ${fmt(cu.proposta)}</b>valor da proposta</div>` : ''}</div>`;
    const semPreco = R ? R.linhas.filter(l => l.ativa && l.semPreco).length : 0;
    if (semPreco) h += `<p><b>Atenção:</b> ${semPreco} linha(s) do levantamento estão sem valor e fora do preço (itens pendentes abaixo).</p>`;

    h += '<h2>1. Ocorrências identificadas e tratadas</h2>';
    h += tabela(['Item', 'Ocorrência', 'GES', 'Agente no PGR', 'Tratamento adotado', 'Responsável e data'],
      trat.map((t, i) => [String(i + 1), esc(t.ocorrencia), esc(t.ges || ''), esc(t.agente || ''), esc(t.acao) + (t.detalhe ? '<br><small>' + esc(t.detalhe) + '</small>' : ''), esc(t.responsavel) + '<br><small>' + esc(t.quando) + '</small>']), ['4%', '18%', '10%', '18%', '34%', '16%']).replace(/<tr><td>/g, '<tr class="ok"><td>');

    h += '<h2>2. Ocorrências pendentes e parecer técnico</h2><p><small>Itens que não adotamos no preço, com a justificativa técnica.</small></p>';
    h += tabela(['Item', 'Ocorrência', 'GES', 'Agente no PGR', 'Parecer (por que não adotamos)'],
      pend.map((p, i) => [String(i + 1), esc(p.tipo), esc(gesTxt(p)), esc(p.agente), esc((S.pareceres && S.pareceres[chavePonto(p)]) || parecerPadrao(p))]), ['4%', '18%', '10%', '18%', '50%']).replace(/<tr><td>/g, '<tr class="pend"><td>');

    h += '<h2>3. Alterações manuais em relação às regras</h2>';
    h += tabela(['Item', 'Onde', 'O que mudou', 'Regra / antes', 'Adotado', 'Motivo'],
      alts.map((a, i) => [String(i + 1), esc(a.onde), esc(a.oque), esc(a.de), esc(a.para), a.motivo ? esc(a.motivo) : '<i>não registrado</i>']), ['4%', '16%', '28%', '14%', '12%', '26%']);

    if (info.length) {
      h += '<h2>4. Pontos informativos da leitura do PGR</h2>';
      h += tabela(['Item', 'Tipo', 'Detalhe'], info.map((p, i) => [String(i + 1), esc(p.tipo), esc(p.msg ? p.msg.split('\n').slice(0, 15).join('; ') + (p.msg.split('\n').length > 15 ? '; ...' : '') : p.agente)]), ['4%', '30%', '66%']);
    }
    if (outrosHist.length) {
      h += `<h2>${info.length ? 5 : 4}. Histórico de ações no orçamento</h2>`;
      h += tabela(['Item', 'Quando', 'Onde', 'Ação'], outrosHist.map((t, i) => [String(i + 1), esc(t.quando), esc(t.origem), esc(t.acao) + (t.detalhe ? '<br><small>' + esc(t.detalhe) + '</small>' : '')]), ['4%', '14%', '16%', '66%']);
    }
    h += `<div class="ass">_______________________________________<br><b>${esc(L.responsavel || 'Responsável pela precificação')}</b><br>Central de SST SESI Goiás</div>`;
    h += `<p><small>Gerado em ${agora()} pelo Precifica-Fieg (regras ${esc(S.regras.versao || '')}).</small></p></body></html>`;
    return h;
  }

  return { registrar, parecerPadrao, chavePonto, alteracoes, html };
});
