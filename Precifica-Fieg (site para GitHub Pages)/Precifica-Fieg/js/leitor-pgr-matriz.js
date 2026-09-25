/* leitor-pgr-matriz.js - lê PGR de terceiros no layout "matriz de avaliação de risco":
   páginas em paisagem com "GHE N", "Nº de Expostos N", tabela Categoria | Perigo | Forma de Exposição ...
   e, embaixo, Gerência | Setor | Cargo/Função | Expostos. Depende de pdf-geom.js.
   Resultado no mesmo formato do LeitorPGR: { cadastro, ges:[{codigo, nome, expostos, cargos, riscos}], avisos, layout:'matriz' } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pdf-geom.js'));
  else root.LeitorPGRMatriz = factory(root.PdfGeom);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  function norm(s) { return (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function limpa(s) { return (s || '').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim(); }
  const GRUPO = { 'fisico': 'fisicos', 'quimico': 'quimicos', 'biologico': 'biologicos', 'ergonomico': 'ergonomicos', 'mecanico ou de acidentes': 'acidentes', 'acidentes': 'acidentes', 'mecanico': 'acidentes', 'psicossocial': 'psicossociais' };

  function textoNaFaixa(geo, x0, x1, top, bottom) {
    const ts = geo.textos.filter(t => { const cx = (t.x + t.x1) / 2; return cx >= x0 - 1 && cx <= x1 + 1 && t.y - t.fs * 0.35 >= top - 1 && t.y - t.fs * 0.35 <= bottom + 1; });
    ts.sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x));
    return limpa(G.juntar(ts));
  }
  function vizinhoDireita(cels, c) { const v = cels.filter(d => Math.abs(d.top - c.top) < 3 && Math.abs(d.x0 - c.x1) < 4 && d !== c); return v.find(d => d.texto) || v[0]; }

  async function lerPGR(doc, onProgress) {
    const cadastro = { empresa: '', fantasia: '', cnpj: '', cidade: '', uf: '', cnae: '', grau: '', n_trab: '' };
    const ges = {}; const avisos = []; let atual = null; let paginasGHE = 0; let colCargo = null;
    const n = doc.numPages;
    let textoInicio = '';
    for (let p = 1; p <= n; p++) {
      if (onProgress) onProgress(p, n);
      const geo = await G.extrair(await doc.getPage(p));
      const linhas = G.linhasTexto(geo);
      const texto = linhas.map(l => l.texto).join('\n');
      if (p <= 12) textoInicio += texto + '\n';
      const cels = G.celulas(geo);
      const cGHE = cels.find(c => /^GHE$/i.test(c.texto.trim()) && c.w < 120);
      const cCat = cels.find(c => /^Categoria$/i.test(c.texto.trim()));
      const cCargo = cels.find(c => /^Cargo\s*\/?\s*Fun[cç][aã]o$/i.test(c.texto.trim()) || /^Cargo$/i.test(c.texto.trim()));
      if (cGHE) {
        const v = vizinhoDireita(cels, cGHE);
        const m = v && /(\d+)/.exec(v.texto);
        if (m) {
          const cod = parseInt(m[1], 10);
          if (!ges[cod]) ges[cod] = { codigo: cod, nome: '', expostos: null, cargos: [], riscos: [], setores: [] };
          atual = cod; paginasGHE++;
          const cExp = cels.find(c => /^N[ºo°]?\s*de\s*Expostos$/i.test(c.texto.trim()));
          const vExp = cExp && vizinhoDireita(cels, cExp);
          const me = vExp && /(\d+)/.exec(vExp.texto);
          if (me && ges[cod].expostos === null) ges[cod].expostos = parseInt(me[1], 10);
          // áreas com percentual: linha de nomes acima da linha de "%"
          const linPct = linhas.find(l => /^(\d+%\s*)+$/.test(l.texto.trim()));
          if (linPct && !ges[cod].nome) {
            const areas = cels.filter(c => c.bottom <= linPct.y + 2 && c.bottom >= linPct.y - 14 && c.h > 12 && c.texto && !/%/.test(c.texto));
            const pcts = cels.filter(c => Math.abs(c.top - (linPct.y - 8)) < 8 && /%$/.test(c.texto.trim()));
            let melhor = null, mp = -1;
            for (const a of areas) {
              const pc = pcts.find(x => Math.abs(x.x0 - a.x0) < 3); const val = pc ? parseInt(pc.texto, 10) : 0;
              if (val > mp) { mp = val; melhor = a; }
            }
            if (melhor) ges[cod].nome = limpa(melhor.texto) + (mp > 0 ? ` (${mp}%)` : '');
            ges[cod].setores = areas.map(a => limpa(a.texto));
          }
        }
      }
      if (atual === null) continue;
      // tabela de riscos: célula "Categoria" define a coluna; "Perigo" define a faixa do nome do risco
      if (cCat) {
        const cPer = cels.find(c => /^Perigo$/i.test(c.texto.trim()) && Math.abs(c.top - cCat.top) < 4);
        const px0 = cPer ? cPer.x0 : cCat.x1, px1 = cPer ? cPer.x1 : cCat.x1 + 60;
        for (const c of cels) {
          if (Math.abs(c.x0 - cCat.x0) > 4 || c.top <= cCat.bottom - 2 || c.w > cCat.w + 6) continue;
          const g = GRUPO[norm(c.texto)]; if (!g) continue;
          const fator = textoNaFaixa(geo, px0, px1, c.top, c.bottom);
          if (fator && !/^n\.?a\.?$/i.test(fator) && !/\bN\.?A\.?$/i.test(fator) && !/^(de ?outra|ou ?de ?baixa|n[aã]o ?especific|solubilidade|maneira)/i.test(fator)) ges[atual].riscos.push({ grupo: g, fator });
        }
      }
      // cargos: colunas Gerência | Setor | Cargo/Função | Expostos. As linhas vêm das células de qualquer
      // uma das três primeiras colunas (nem todas as colunas têm borda em todas as páginas). Em páginas de
      // continuação (sem cabeçalho) valem as posições da página anterior.
      if (cCargo) {
        const mesmaLinha = re => cels.find(c => re.test(c.texto.trim()) && Math.abs(c.top - cCargo.top) < 4);
        const cGer = mesmaLinha(/^Ger[eê]ncia$/i), cSet = mesmaLinha(/^Setor$/i), cExp = mesmaLinha(/^Expostos$/i);
        colCargo = { cols: [cGer, cSet, cCargo].filter(Boolean).map(c => ({ x0: c.x0, w: c.w })), cargo: [cCargo.x0, cCargo.x1], exp: cExp ? [cExp.x0, cExp.x1] : null, bottom: cCargo.bottom };
      }
      if (colCargo && (cCargo || (!cGHE && !cCat))) {
        const topo = cCargo ? cCargo.bottom - 2 : 0;
        const tops = [];
        for (const c of cels) {
          if (c.top <= topo || c.h < 6 || !c.texto) continue;
          if (!colCargo.cols.some(k => Math.abs(c.x0 - k.x0) < 4 && Math.abs(c.w - k.w) < 8)) continue;
          if (!tops.some(t => Math.abs(t.top - c.top) < 3)) tops.push({ top: c.top, bottom: c.bottom });
        }
        for (const t of tops) {
          const nome = limpa(textoNaFaixa(geo, colCargo.cargo[0], colCargo.cargo[1], t.top, t.bottom));
          if (!nome || /^(Cargo|Fun[cç][aã]o|EPIs?)/i.test(nome) || nome.length > 80) continue;
          let exp = null;
          if (colCargo.exp) { const m = /(\d+)/.exec(textoNaFaixa(geo, colCargo.exp[0], colCargo.exp[1], t.top, t.bottom)); if (m) exp = parseInt(m[1], 10); }
          if (!ges[atual].cargos.includes(nome)) { ges[atual].cargos.push(nome); ges[atual].cargosExp = ges[atual].cargosExp || {}; ges[atual].cargosExp[nome] = exp; }
        }
      }
    }
    // cadastro (texto corrido das primeiras páginas)
    let m;
    if ((m = /RAZ[AÃ]O SOCIAL\s*:\s*(.+)/i.exec(textoInicio))) cadastro.empresa = limpa(m[1]).replace(/\s+CNPJ.*$/i, '');
    if ((m = /CNPJ\s*:?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i.exec(textoInicio))) cadastro.cnpj = m[1];
    if ((m = /CIDADE\s*:\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú ]+?)(?:\s{2,}|\s+ESTADO|\n)/i.exec(textoInicio))) cadastro.cidade = limpa(m[1]);
    if ((m = /ESTADO\s*:\s*([A-ZÀ-Ú ]+)/i.exec(textoInicio))) cadastro.uf = limpa(m[1]).slice(0, 20);
    if ((m = /CNAE[\s\S]{0,80}?(\d{2}\.\d{2}-\d-\d{2}|\d{4}-\d\/\d{2})/i.exec(textoInicio))) cadastro.cnae = m[1];
    if ((m = /GRAU DE RISCO[\s\S]{0,80}?\b([1-4])\b/i.exec(textoInicio))) cadastro.grau = parseInt(m[1], 10);
    if ((m = /N[ºo°]\s*DE EMPREGADOS[^\n]*\n\s*(\d{1,6})/i.exec(textoInicio))) cadastro.n_trab = parseInt(m[1], 10);
    if (!cadastro.empresa) { const l = textoInicio.split('\n').map(x => x.trim()).filter(x => /LTDA|S\.?A\.?|EIRELI|ME$/i.test(x)); if (l.length) cadastro.empresa = l[0]; }
    const lista = Object.values(ges).sort((a, b) => a.codigo - b.codigo);
    for (const g of lista) {
      const vistos = new Set();
      g.riscos = g.riscos.filter(r => { const k = r.grupo + '|' + norm(r.fator).slice(0, 30); if (vistos.has(k)) return false; vistos.add(k); return true; });
      if (!g.nome) g.nome = g.cargos[0] ? g.cargos[0] : 'GHE ' + g.codigo;
      if (g.expostos === null) { g.expostos = 0; avisos.push(`GHE ${g.codigo}: Nº de Expostos não encontrado`); }
    }
    if (lista.length) avisos.push(`PGR de terceiros (layout matriz): ${lista.length} GHE em ${paginasGHE} páginas. Confira os agentes e os expostos antes de orçar.`);
    return { cadastro, ges: lista, avisos, layout: 'matriz' };
  }
  return { lerPGR };
});
