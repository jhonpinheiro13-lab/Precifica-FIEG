/* pdf-geom.js - extrai células (retângulos) e textos posicionados de uma página do pdf.js,
   já no espaço de exibição (rotação aplicada, y crescendo para baixo), parecido com o pdfplumber.
   Funciona no navegador (window.PdfGeom) e no Node (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PdfGeom = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mul(m1, m2) { // m1 * m2 (aplica m1 depois m2?) -> convenção pdf.js: Util.transform(m1, m2)
    return [
      m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }
  function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

  // OPS do pdf.js (constantes estáveis nas versões 2.x/3.x)
  const OPS = { save: 10, restore: 11, transform: 12, moveTo: 13, lineTo: 14, closePath: 18, rectangle: 19, constructPath: 91 };

  async function extrair(page) {
    const vp = page.getViewport({ scale: 1 });
    const base = vp.transform;
    const ops = await page.getOperatorList();
    const rects = [];
    const linhas = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const pilha = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === OPS.save) pilha.push(ctm.slice());
      else if (fn === OPS.restore) { if (pilha.length) ctm = pilha.pop(); }
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.constructPath) {
        const sub = args[0], a = args[1];
        let k = 0, cur = null;
        const m = mul(base, ctm);
        for (const op of sub) {
          if (op === OPS.rectangle) {
            const x = a[k], y = a[k + 1], w = a[k + 2], h = a[k + 3]; k += 4;
            const p1 = apply(m, x, y), p2 = apply(m, x + w, y + h);
            rects.push(norm(p1, p2));
          } else if (op === OPS.moveTo) { cur = apply(m, a[k], a[k + 1]); k += 2; }
          else if (op === OPS.lineTo) {
            const p = apply(m, a[k], a[k + 1]); k += 2;
            if (cur) linhas.push(norm(cur, p));
            cur = p;
          } else if (op === OPS.closePath) { /* nada */ }
          else { break; } // curvas: ignora o resto do path
        }
      }
    }
    // textos
    const tc = await page.getTextContent();
    const textos = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = mul(base, it.transform);
      const p0 = apply(t, 0, 0);
      // tamanho da fonte no espaço de exibição
      const fs = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]);
      // largura no espaço de exibição
      const pw = apply(t, it.width / (Math.hypot(it.transform[0], it.transform[1]) || 1), 0);
      const w = Math.hypot(pw[0] - p0[0], pw[1] - p0[1]);
      textos.push({ str: it.str, x: p0[0], y: p0[1], x1: p0[0] + w, top: p0[1] - fs * 0.85, fs: fs, hasEOL: it.hasEOL });
    }
    return { largura: vp.width, altura: vp.height, rects, linhas, textos };
  }

  function norm(p1, p2) {
    const x0 = Math.min(p1[0], p2[0]), x1 = Math.max(p1[0], p2[0]);
    const y0 = Math.min(p1[1], p2[1]), y1 = Math.max(p1[1], p2[1]);
    return { x0, x1, top: y0, bottom: y1, w: x1 - x0, h: y1 - y0 };
  }

  /* Constrói "células" a partir dos retângulos: cada rect é uma célula (o S+ desenha um rect por célula).
     Atribui a cada célula os textos cujo centro cai dentro dela, ordenados por linha. */
  function celulas(geo, minW, minH) {
    minW = minW || 4; minH = minH || 4;
    const cels = geo.rects.filter(r => r.w >= minW && r.h >= minH && r.w < geo.largura * 0.98)
      .map(r => Object.assign({ textos: [] }, r));
    // células desenhadas com segmentos de linha (tabela de riscos do S+): pares de segmentos
    // horizontais com o mesmo vão (x0,x1), consecutivos em y, formam uma célula
    const grupos = {};
    for (const l of geo.linhas) {
      if (l.h > 1 || l.w < minW) continue;
      const k = Math.round(l.x0) + ',' + Math.round(l.x1);
      (grupos[k] = grupos[k] || []).push(l.top);
    }
    // bordas dos retângulos também contam como segmentos (a 1ª linha da tabela encosta no cabeçalho)
    for (const r of geo.rects) {
      if (r.w < minW || r.w >= geo.largura * 0.98) continue;
      const k = Math.round(r.x0) + ',' + Math.round(r.x1);
      (grupos[k] = grupos[k] || []).push(r.top, r.bottom);
    }
    for (const k in grupos) {
      const ys = Array.from(new Set(grupos[k].map(y => Math.round(y)))).sort((a, b) => a - b);
      const [x0, x1] = k.split(',').map(Number);
      for (let i = 0; i + 1 < ys.length; i++) {
        const h = ys[i + 1] - ys[i];
        if (h >= minH && h < geo.altura * 0.9) cels.push({ x0, x1, top: ys[i], bottom: ys[i + 1], w: x1 - x0, h, textos: [] });
      }
    }
    // remove duplicatas exatas
    const seen = new Set(); const out = [];
    for (const c of cels) {
      const k = [c.x0, c.top, c.x1, c.bottom].map(v => Math.round(v)).join(',');
      if (seen.has(k)) continue; seen.add(k); out.push(c);
    }
    for (const t of geo.textos) {
      const cx = (t.x + t.x1) / 2, cy = t.y - t.fs * 0.35;
      // menor célula que contém o ponto
      let best = null;
      for (const c of out) {
        if (cx >= c.x0 - 1 && cx <= c.x1 + 1 && cy >= c.top - 1 && cy <= c.bottom + 1) {
          if (!best || c.w * c.h < best.w * best.h) best = c;
        }
      }
      if (best) best.textos.push(t);
    }
    for (const c of out) {
      c.textos.sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x));
      c.texto = juntar(c.textos);
      c.linhas = [];
      let cur = null;
      for (const t of c.textos) {
        if (!cur || Math.abs(t.y - cur.y) > 2) { cur = { y: t.y, itens: [t] }; c.linhas.push(cur); }
        else cur.itens.push(t);
      }
      c.linhas = c.linhas.map(l => juntar(l.itens));
    }
    out.sort((a, b) => (Math.abs(a.top - b.top) > 2 ? a.top - b.top : a.x0 - b.x0));
    return out;
  }

  function juntar(ts) {
    let s = '', lastY = null, lastX1 = null;
    for (const t of ts) {
      if (lastY !== null && Math.abs(t.y - lastY) > 2) s += ' ';
      else if (lastX1 !== null && t.x - lastX1 > Math.max(0.6, t.fs * 0.1)) s += ' ';
      s += t.str; lastY = t.y; lastX1 = t.x1;
    }
    return s.replace(/\s+/g, ' ').trim();
  }

  /* Linhas de texto da página (sem tabela), ordenadas de cima para baixo. */
  function linhasTexto(geo) {
    const ts = geo.textos.slice().sort((a, b) => (Math.abs(a.y - b.y) > 2.5 ? a.y - b.y : a.x - b.x));
    const linhas = []; let cur = null;
    for (const t of ts) {
      if (!cur || Math.abs(t.y - cur.y) > 2.5) { cur = { y: t.y, itens: [t] }; linhas.push(cur); }
      else cur.itens.push(t);
    }
    return linhas.map(l => ({ y: l.y, x: l.itens[0].x, texto: juntar(l.itens), itens: l.itens }));
  }

  return { extrair, celulas, linhasTexto, juntar };
});
