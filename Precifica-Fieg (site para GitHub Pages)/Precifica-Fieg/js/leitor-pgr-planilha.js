/* leitor-pgr-planilha.js - PGR de terceiros no layout "planilha por cargo":
   blocos "PLANILHA DE ANÁLISE DE CONDIÇÕES DO MEIO AMBIENTE NO TRABALHO" com SETOR | CARGO | CARGA HORÁRIA |
   QNTDE DE FUNCIONÁRIOS [| GHE] e tabela RISCOS | CODIGO ESOCIAL | AGENTES/FONTES GERADORAS | ...
   Opcionalmente um anexo "Funções | GHE | Atividades..." que diz a qual GHE cada função pertence.
   Resultado no mesmo formato do LeitorPGR: { cadastro, ges, avisos, layout:'planilha', criticos } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pdf-geom.js'));
  else root.LeitorPGRPlanilha = factory(root.PdfGeom);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';
  function norm(s) { return (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function limpa(s) { return (s || '').replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim(); }
  const GRUPO_COD = { '01': 'fisicos', '02': 'quimicos', '03': 'biologicos', '04': 'ergonomicos', '05': 'acidentes', '06': 'periculosidade' };
  const GRUPO_NOME = { 'fisico': 'fisicos', 'fisicos': 'fisicos', 'quimico': 'quimicos', 'quimicos': 'quimicos', 'biologico': 'biologicos', 'biologicos': 'biologicos', 'ergonomico': 'ergonomicos', 'ergonomicos': 'ergonomicos', 'acidentes': 'acidentes', 'acidente': 'acidentes', 'mecanico': 'acidentes' };
  function normCargo(s) { return norm(s).replace(/\(a\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function bigramas(s) { const t = s.replace(/\s/g, ''); const b = new Set(); for (let i = 0; i + 1 < t.length; i++) b.add(t.slice(i, i + 2)); return b; }
  function similar(a, b) { const A = bigramas(a), B = bigramas(b); let i = 0; for (const x of A) if (B.has(x)) i++; return (2 * i) / (A.size + B.size || 1); }
  const RE_QUIM_NOME = /glifosato|2,4[- ]?d\b|diuron|herbicid|agrot[oó]x|defensiv|adubo|fertiliz|inseticid|fungicid|produtos? qu[ií]mic|solvente|tinta|thinner|combust[ií]vel|diesel|gasolina|[oó]leo|graxa|poeira|fumos?|n[eé]voa|vapor|g[aá]s\b/i;
  const NA = s => /^n\.?\/?a\.?$/i.test((s || '').trim()) || !(s || '').trim();
  const mesmaLinha = (cels, ref, x0) => cels.find(c => Math.abs(c.top - ref.top) < 3 && Math.abs(c.x0 - x0) < 4 && c !== ref);

  async function lerPGR(doc, onProgress) {
    const cadastro = { empresa: '', fantasia: '', cnpj: '', cidade: '', uf: '', cnae: '', grau: '', n_trab: '' };
    const avisos = [], criticos = [];
    const blocos = []; let bloco = null; let colCod = null;
    const mapaGHE = {}; let colFun = null;
    let textoInicio = '';
    const n = doc.numPages;
    for (let p = 1; p <= n; p++) {
      if (onProgress) onProgress(p, n);
      const geo = await G.extrair(await doc.getPage(p));
      const cels = G.celulas(geo);
      const linhas = G.linhasTexto(geo);
      const texto = linhas.map(l => l.texto).join('\n');
      if (p <= 12) textoInicio += texto + '\n';

      // ---- bloco por cargo
      const titulo = cels.find(c => /PLANILHA DE AN[AÁ]LISE DE CONDI/i.test(c.texto));
      const hSetor = cels.find(c => /^SETOR$/i.test(c.texto.trim()));
      if (titulo && hSetor) {
        const hCargo = mesmaLinha(cels, hSetor, cels.find(c => /^CARGO$/i.test(c.texto.trim()) && Math.abs(c.top - hSetor.top) < 3)?.x0 ?? -99);
        const hQt = cels.find(c => /QNTDE|QUANTIDADE/i.test(c.texto) && Math.abs(c.top - hSetor.top) < 3);
        const hGhe = cels.find(c => /^GHE$/i.test(c.texto.trim()) && Math.abs(c.top - hSetor.top) < 3);
        const abaixo = x0 => cels.find(c => Math.abs(c.x0 - x0) < 4 && c.top > hSetor.bottom - 2 && c.top < hSetor.bottom + 30);
        const vSetor = abaixo(hSetor.x0), vCargo = hCargo ? abaixo(hCargo.x0) : null, vQt = hQt ? abaixo(hQt.x0) : null, vGhe = hGhe ? abaixo(hGhe.x0) : null;
        bloco = { pagina: p, setor: limpa(vSetor ? vSetor.texto : ''), cargo: limpa(vCargo ? vCargo.texto : ''), qtd: vQt ? parseInt((/(\d+)/.exec(vQt.texto) || [0, 0])[1], 10) : null, ghe: vGhe ? parseInt((/(\d+)/.exec(vGhe.texto) || [0, NaN])[1], 10) : null, riscos: [] };
        if (!bloco.cargo) bloco.cargo = 'CARGO ' + (blocos.length + 1);
        blocos.push(bloco);
      }
      // tabela de riscos (no bloco ou continuação na página seguinte)
      const hCod = cels.find(c => /C[OÓ]DIGO\s*E-?SOCIAL/i.test(c.texto));
      if (hCod) {
        const hAg = cels.find(c => /AGENTES|FONTES GERADORAS/i.test(c.texto) && Math.abs(c.top - hCod.top) < 4);
        const hRis = cels.find(c => /^RISCOS?$/i.test(c.texto.trim()) && Math.abs(c.top - hCod.top) < 4);
        colCod = { x0: hCod.x0, xAg: hAg ? hAg.x0 : hCod.x1, xRis: hRis ? hRis.x0 : null, bottom: hCod.bottom };
      }
      if (bloco && colCod) {
        const topo = hCod ? hCod.bottom - 2 : 0;
        const catCels = colCod.xRis !== null ? cels.filter(c => Math.abs(c.x0 - colCod.xRis) < 4 && c.top > topo && GRUPO_NOME[norm(c.texto)]) : [];
        let ultimo = null;
        const linhasRisco = [];
        for (const c of cels.filter(c => Math.abs(c.x0 - colCod.x0) < 4 && c.top > topo && c.h >= 6).sort((a, b) => a.top - b.top)) {
          const j = linhasRisco.findIndex(x => Math.abs(x.top - c.top) < 3);
          if (j < 0) linhasRisco.push(c); else if (!linhasRisco[j].texto && c.texto) linhasRisco[j] = c;
        }
        for (const c of linhasRisco) {
          const cod = limpa(c.texto);
          const agCands = cels.filter(d => Math.abs(d.top - c.top) < 3 && Math.abs(d.x0 - colCod.xAg) < 4);
          const ag = agCands.find(d => d.texto && d.texto.trim()) || agCands[0];
          const agente = limpa(ag ? ag.texto : '');
          if (NA(agente) || /^(NA|N\/A)$/i.test(cod) && NA(agente)) { ultimo = null; continue; }
          if (/^N\.?A\.?$/i.test(agente)) { ultimo = null; continue; }
          // fragmento de célula alta (sem código, encostado na linha anterior): emenda no agente anterior
          // linha real tem dados nas colunas seguintes (tipo de exposição, meio de propagação...); fragmento de célula não tem
          const temDados = ag && cels.some(d => Math.abs(d.top - c.top) < 3 && d.x0 >= ag.x1 - 2 && d.texto && d.texto.trim());
          if (!cod && !temDados && ultimo && Math.abs(c.top - ultimo.bottom) < 3) { ultimo.risco.fator = limpa(ultimo.risco.fator + ' ' + agente); ultimo.bottom = c.bottom; continue; }
          if (!cod && /^[a-zà-ú]/.test(agente)) { ultimo = null; continue; }
          let grupo = GRUPO_COD[cod.slice(0, 2)];
          let obs = '';
          if (!grupo || !/^\d{2}\.\d{2}\.\d{3}$/.test(cod)) {
            // código ausente ou fora da tabela: classifica pela célula de categoria que mais se sobrepõe
            let melhor = null, mo = 0;
            for (const k of catCels) { const o = Math.min(k.bottom, c.bottom) - Math.max(k.top, c.top); if (o > mo) { mo = o; melhor = k; } }
            grupo = melhor ? GRUPO_NOME[norm(melhor.texto)] : null;
            if (/umidade/i.test(agente)) grupo = 'fisicos';
            if (!grupo && RE_QUIM_NOME.test(agente)) grupo = 'quimicos';
            obs = 'código eSocial ' + (cod || 'ausente') + (grupo ? ' fora da tabela; classificado como ' + grupo : ' e categoria não identificada');
            if (!grupo) { criticos.push({ tipo: 'codigo', cargo: bloco.cargo, agente, codigo: cod, msg: 'Agente sem código eSocial válido e sem categoria: não entrou' }); continue; }
            criticos.push({ tipo: 'codigo', cargo: bloco.cargo, agente, codigo: cod, msg: obs });
          }
          if (grupo === 'periculosidade') { bloco.periculosidade = true; ultimo = null; continue; }
          const risco = { grupo, fator: agente, codigo: cod, obs };
          bloco.riscos.push(risco); ultimo = { risco, bottom: c.bottom };
        }
      }
      // ---- anexo "Funções | GHE"
      const hFun = cels.find(c => /^Fun[cç][oõ]es$/i.test(c.texto.trim()));
      if (hFun) colFun = { xF: hFun.x0, wF: hFun.w, xG: hFun.x1, bottom: hFun.bottom };
      if (colFun && (hFun || !titulo)) {
        const topo = hFun ? hFun.bottom - 2 : 0;
        for (const c of cels) {
          if (Math.abs(c.x0 - colFun.xG) > 6 || c.w > 60 || c.top <= topo || !/^\s*\d{1,3}\s*$/.test(c.texto)) continue;
          const f = cels.find(d => Math.abs(d.x0 - colFun.xF) < 6 && Math.abs(d.w - colFun.wF) < 10 && d.top <= c.top + 3 && d.bottom >= c.bottom - 3 && d !== c && d.texto);
          if (f) mapaGHE[norm(f.texto)] = parseInt(c.texto, 10);
        }
      }
    }
    // ---- cadastro
    let m;
    if ((m = /RAZ[AÃ]O SOCIAL\s*:\s*(.+)/i.exec(textoInicio))) cadastro.empresa = limpa(m[1]).replace(/\s+CNPJ.*$/i, '');
    if ((m = /CNPJ\s*:?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i.exec(textoInicio))) cadastro.cnpj = m[1];
    if ((m = /CIDADE\s*:\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú ]+?)(?:\s{2,}|\s+ESTADO|\n)/i.exec(textoInicio))) cadastro.cidade = limpa(m[1]);
    if ((m = /ESTADO\s*:\s*([A-ZÀ-Ú ]+)/i.exec(textoInicio))) cadastro.uf = limpa(m[1]).slice(0, 20);
    if ((m = /(\d{2}\.\d{2}-\d-\d{2})/.exec(textoInicio))) cadastro.cnae = m[1];
    if ((m = /GRAU DE\s*RISCO[\s\S]{0,120}?\n\s*([1-4])\b/i.exec(textoInicio))) cadastro.grau = parseInt(m[1], 10);
    if ((m = /TOTAL DE EMPREGADOS[^\n]*\n\s*(\d{1,6})/i.exec(textoInicio) || /N[ºo°]\s*DE EMPREGADOS[^\n]*\n\s*(\d{1,6})/i.exec(textoInicio))) cadastro.n_trab = parseInt(m[1], 10);

    // ---- agrupa os cargos em GES (GHE da coluna, senão do anexo, senão um GES por cargo)
    const ges = {}; let semGhe = 0; const temMapa = Object.keys(mapaGHE).length > 0;
    for (const b of blocos) {
      let g = b.ghe;
      if (g === null || isNaN(g)) {
        const chaves = Object.keys(mapaGHE);
        let best = null, bs = 0;
        for (const parte of b.cargo.split(/\s*\/\s*/)) {
          const k = normCargo(parte);
          for (const x of chaves) {
            const kx = normCargo(x);
            const sc = k.replace(/\s/g, '') === kx.replace(/\s/g, '') ? 1 : similar(k, kx);
            if (sc > bs) { bs = sc; best = x; }
          }
        }
        if (best && bs >= 0.8) {
          g = mapaGHE[best];
          if (bs < 0.9) criticos.push({ tipo: 'ghe', cargo: b.cargo, msg: `Função casada por aproximação com "${best}" (GHE ${g}, ${Math.round(bs * 100)}%). Confira.` });
        }
      }
      if (g === undefined || g === null || isNaN(g)) { semGhe++; g = 900 + semGhe; if (temMapa) criticos.push({ tipo: 'ghe', cargo: b.cargo, msg: 'Função não encontrada no anexo de GHE; ficou num GES próprio (' + g + ')' }); }
      if (!ges[g]) ges[g] = { codigo: g, nome: '', expostos: 0, cargos: [], cargosExp: {}, riscos: [], setores: [], periculosidade: false };
      const G1 = ges[g];
      if (!G1.cargos.includes(b.cargo)) { G1.cargos.push(b.cargo); G1.cargosExp[b.cargo] = b.qtd; }
      G1.expostos += b.qtd || 0;
      if (b.setor && !G1.setores.includes(b.setor)) G1.setores.push(b.setor);
      if (b.periculosidade) G1.periculosidade = true;
      for (const r of b.riscos) G1.riscos.push(r);
    }
    const lista = Object.values(ges).sort((a, b) => a.codigo - b.codigo);
    for (const g of lista) {
      const vistos = new Set();
      g.riscos = g.riscos.filter(r => { const k = r.grupo + '|' + norm(r.fator).slice(0, 30); if (vistos.has(k)) return false; vistos.add(k); return true; });
      g.nome = g.setores[0] ? g.setores[0] + (g.setores.length > 1 ? ' (+' + (g.setores.length - 1) + ')' : '') : g.cargos[0] || 'GES ' + g.codigo;
    }
    if (!blocos.length) avisos.push('Nenhum bloco "Planilha de análise de condições do meio ambiente" encontrado.');
    else avisos.push(`PGR de terceiros (planilha por cargo): ${blocos.length} cargos, ${lista.length} GES` + (temMapa ? ` (agrupados pelo anexo Funções x GHE${semGhe ? ', ' + semGhe + ' sem GHE' : ''})` : ' (sem numeração de GHE no PGR: cada cargo virou um GES)') + '. Confira agentes e expostos.');
    const somaQtd = blocos.reduce((s, b) => s + (b.qtd || 0), 0);
    if (cadastro.n_trab && somaQtd !== cadastro.n_trab) criticos.push({ tipo: 'efetivo', msg: `Soma dos funcionários por cargo (${somaQtd}) difere do total do cadastro (${cadastro.n_trab})` });
    const nPer = lista.filter(g => g.periculosidade).length;
    if (nPer) avisos.push(`${nPer} GES com apontamento de periculosidade (código 06.01.001).`);
    // visão por cargo (um bloco = uma unidade de contagem), com o GHE do anexo quando houver
    const gheDoCargo = {}; for (const g of lista) for (const cg of g.cargos) gheDoCargo[cg] = g.codigo;
    const porCargo = blocos.map((b, i) => {
      const vistos = new Set();
      const riscos = b.riscos.filter(r => { const k = r.grupo + '|' + norm(r.fator).slice(0, 30); if (vistos.has(k)) return false; vistos.add(k); return true; });
      return { codigo: gheDoCargo[b.cargo] ?? '', nome: b.cargo, expostos: b.qtd || 0, cargos: [b.cargo], cargosExp: { [b.cargo]: b.qtd }, riscos, setores: [b.setor], seq: i + 1 };
    });
    return { cadastro, ges: lista, porCargo, avisos, layout: 'planilha', criticos, blocos: blocos.length, mapaGHE: Object.keys(mapaGHE).length, _mapa: mapaGHE, _blocos: blocos };
  }
  return { lerPGR };
});
