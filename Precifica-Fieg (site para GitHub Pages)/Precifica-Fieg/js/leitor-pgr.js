/* leitor-pgr.js - lê um PGR do S+ (SESI/FIEG), formato antigo (GHE) ou novo (GES), a partir de um
   documento do pdf.js. Depende de pdf-geom.js.
   Resultado: { cadastro, ges: [{codigo, nome, expostos, cargos, riscos:[{grupo, fator}]}], avisos } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pdf-geom.js'));
  else root.LeitorPGR = factory(root.PdfGeom);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  const GRUPOS = ['fisicos', 'quimicos', 'biologicos', 'ergonomicos', 'acidentes', 'mecanicos', 'psicossociais'];
  const RE_GES = /^\s*(GHE|GES)\s*(\d{3,5})\s*[-–]\s*(.+)$/i;
  const RE_EXP = /Total de trabalhadores[^:]*:\s*(\d+)/i;

  function norm(s) {
    return (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function limpa(s) {
    return (s || '').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim();
  }

  async function lerPGR(doc, onProgress) {
    const cadastro = { empresa: '', fantasia: '', cnpj: '', cidade: '', uf: '', cnae: '', grau: '', n_trab: '' };
    const ges = {};
    const avisos = [];
    let atual = null, cadastroLido = false, fimInventario = false;
    const n = doc.numPages;
    for (let p = 1; p <= n && !fimInventario; p++) {
      if (onProgress) onProgress(p, n);
      const page = await doc.getPage(p);
      const geo = await G.extrair(page);
      const cels = G.celulas(geo);
      const linhas = G.linhasTexto(geo);
      const textoPag = linhas.map(l => l.texto).join('\n');

      // ---- cadastro da unidade
      if (!cadastroLido && /CADASTRO DA UNIDADE/i.test(textoPag) && /Raz[aã]o Social/i.test(textoPag)) {
        const mapa = { 'razao social': 'empresa', 'nome': 'fantasia', 'cnpj': 'cnpj', 'cidade': 'cidade', 'uf': 'uf', 'cnae': 'cnae', 'grau de risco': 'grau', 'quantidade total de trabalhadores': 'n_trab' };
        for (const c of cels) {
          if (c.linhas.length < 2) continue;
          const k = mapa[norm(c.linhas[0])];
          if (k && !cadastro[k]) cadastro[k] = limpa(c.linhas.slice(1).join(' '));
        }
        if (cadastro.empresa) cadastroLido = true;
      }

      // ---- fim do inventário
      const temTotal = RE_EXP.test(textoPag);
      const primeiraLinha = linhas.slice(0, 6).map(l => l.texto).join(' ');
      if (atual !== null && !temTotal && /PLANO DE A[CÇ][AÃ]O|CONSIDERA[CÇ][OÕ]ES FINAIS/i.test(primeiraLinha)) {
        fimInventario = true; break;
      }

      // ---- cabeçalho do GES nesta página
      let cabecalho = null;
      for (const c of cels) {
        const m = RE_GES.exec(c.texto);
        if (m && c.w > 300) { cabecalho = c; break; }
      }
      if (cabecalho && temTotal) {
        const m = RE_GES.exec(cabecalho.texto);
        const cod = parseInt(m[2], 10);
        const nome = limpa(m[3]).replace(/\s*\(.*$/, '').trim() || limpa(m[3]);
        if (!ges[cod]) ges[cod] = { codigo: cod, nome: limpa(m[3]), expostos: null, cargos: [], riscos: [], setores: [] };
        atual = cod;
        const me = RE_EXP.exec(textoPag);
        if (me && ges[cod].expostos === null) ges[cod].expostos = parseInt(me[1], 10);
        // cargos
        const hdr = cels.find(c => /^Cargos?$/i.test(c.texto.trim()) && c.top > cabecalho.top);
        const riscoHdr = cels.find(c => /^(Agente|Grupo de risco)$/i.test(c.texto.trim()) && c.top > cabecalho.top);
        const limite = riscoHdr ? riscoHdr.top : geo.altura;
        if (hdr) {
          for (const c of cels) {
            if (Math.abs(c.x0 - hdr.x0) < 3 && Math.abs(c.w - hdr.w) < 3 && c.top > hdr.top + 2 && c.top < limite && c.texto) {
              const nomeCargo = limpa(c.texto);
              if (nomeCargo && !ges[cod].cargos.includes(nomeCargo)) ges[cod].cargos.push(nomeCargo);
            }
          }
        }
        const setHdr = cels.find(c => /^Setor \/ Ambiente$/i.test(c.texto.trim()) && c.top > cabecalho.top);
        if (setHdr) {
          for (const c of cels) {
            if (Math.abs(c.x0 - setHdr.x0) < 3 && Math.abs(c.w - setHdr.w) < 3 && c.top > setHdr.top + 2 && c.top < (hdr ? hdr.top : limite) && c.texto && !/^Cargos?$/i.test(c.texto)) {
              const s = limpa(c.texto);
              if (s && !ges[cod].setores.includes(s)) ges[cod].setores.push(s);
            }
          }
        }
      }
      if (atual === null) continue;

      // ---- linhas da tabela de riscos (nesta página, inclusive continuação)
      for (const c of cels) {
        if (c.w > 70) continue;
        const g = norm(c.texto);
        if (!GRUPOS.includes(g)) continue;
        const fatorCel = cels.find(d => Math.abs(d.top - c.top) < 2.5 && Math.abs(d.x0 - c.x1) < 4 && d !== c);
        const fator = fatorCel ? limpa(fatorCel.texto) : '';
        if (fator) ges[atual].riscos.push({ grupo: g, fator });
      }
    }
    // dedupe de riscos e ordenação
    const lista = Object.values(ges).sort((a, b) => a.codigo - b.codigo);
    for (const g of lista) {
      const vistos = new Set();
      g.riscos = g.riscos.filter(r => {
        const k = r.grupo + '|' + norm(r.fator).slice(0, 25);
        if (vistos.has(k)) return false;
        vistos.add(k); return true;
      });
      if (g.expostos === null) { g.expostos = 0; avisos.push(`${g.codigo}: total de expostos não encontrado`); }
    }
    if (!cadastro.empresa) {
      try {
        const geo = await G.extrair(await doc.getPage(1));
        const l = G.linhasTexto(geo);
        cadastro.empresa = l[0] ? l[0].texto : '';
        const m = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/.exec(l.map(x => x.texto).join(' '));
        if (m) cadastro.cnpj = m[1];
      } catch (e) { /* ignora */ }
    }
    if (!lista.length) avisos.push('Nenhum GES/GHE encontrado no inventário de riscos. O PDF está no padrão S+?');
    for (const k of ['grau', 'n_trab']) { const m = /\d+/.exec(String(cadastro[k])); cadastro[k] = m ? parseInt(m[0], 10) : ''; }
    return { cadastro, ges: lista, avisos };
  }

  return { lerPGR, norm, limpa };
});
