/* classificar.js - cruza cada fator de risco do PGR com o tipo de avaliação e, para químicos,
   com o exame da tabela do laboratório. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Classificar = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const T = {
    RUIDO: 'Ruído (dosimetria)', CALOR: 'Calor (IBUTG)', VCI: 'Vibração corpo inteiro', VMB: 'Vibração mãos e braços',
    QUIM: 'Químico (laboratório)', QUAL: 'Avaliação qualitativa', AUS: 'Ausência de risco', LP: 'Periculosidade (por cargo)'
  };
  const ORDEM = [T.RUIDO, T.CALOR, T.VCI, T.VMB, T.QUIM, T.QUAL, T.AUS, T.LP];
  const IGNORADOS = /^(ergon|acident|mecan|psicos)/;

  // trecho (sem acento, minúsculo) -> exame. Do específico ao genérico.
  const SINONIMOS = [
    ['silica', 'Poeira Respirável + Sílica Livre Cristalina'], ['quartzo', 'Poeira Respirável + Sílica Livre Cristalina'],
    ['poeira de madeira', 'Madeira - Poeiras, Todas as outras espécies'], ['madeira', 'Madeira - Poeiras, Todas as outras espécies'],
    ['cimento', 'Cimento portland'],
    ['fumos metalicos', 'Varredura de Metais (20 agentes)'], ['fumos de solda', 'Varredura de Metais (20 agentes)'], ['solda', 'Varredura de Metais (20 agentes)'],
    ['vapores organicos', 'Varredura de Vapores Orgânicos (35 agentes)'], ['solvente', 'Varredura de Vapores Orgânicos (35 agentes)'], ['solventes', 'Varredura de Vapores Orgânicos (35 agentes)'],
    ['tinta', 'Varredura de Vapores Orgânicos (35 agentes)'], ['tintas', 'Varredura de Vapores Orgânicos (35 agentes)'], ['thinner', 'Varredura de Vapores Orgânicos (35 agentes)'],
    ['hidrocarboneto', 'Diesel combustível, como hidrocarbonetos totais (FV)'], ['hidrocarbonetos', 'Diesel combustível, como hidrocarbonetos totais (FV)'],
    ['oleo diesel', 'Diesel combustível, como hidrocarbonetos totais (FV)'], ['diesel', 'Diesel combustível, como hidrocarbonetos totais (FV)'], ['gasolina', 'Gasolina'],
    ['glp', 'GLP (gás liquefeito do petróleo)'], ['gas liquefeito', 'GLP (gás liquefeito do petróleo)'],
    ['monoxido de carbono', 'Monóxido de carbono'], ['dioxido de carbono', 'Dióxido de carbono'],
    ['oleo mineral', 'Óleo mineral, excluídos os fluidos de trabalho com metais'], ['nevoa de oleo', 'Óleo mineral, excluídos os fluidos de trabalho com metais'],
    ['nevoas de oleo', 'Óleo mineral, excluídos os fluidos de trabalho com metais'], ['fluido de corte', 'Metalworking fluids'],
    ['graxa', 'Óleo mineral, excluídos os fluidos de trabalho com metais'], ['graxas', 'Óleo mineral, excluídos os fluidos de trabalho com metais'],
    ['oleo queimado', 'Óleo mineral, excluídos os fluidos de trabalho com metais'], ['oleo lubrificante', 'Óleo mineral, excluídos os fluidos de trabalho com metais'],
    ['oleos e graxas', 'Óleo mineral, excluídos os fluidos de trabalho com metais'],
    ['soda caustica', 'Hidróxido de sódio'], ['hidroxido de sodio', 'Hidróxido de sódio'],
    ['acido sulfurico', 'Ácido sulfúrico'], ['acido cloridrico', 'Cloreto de hidrogênio'], ['cloro', 'Cloro'], ['amonia', 'Amônia'],
    ['formol', 'Formaldeído'], ['formaldeido', 'Formaldeído'], ['poeira total', 'Poeira Total'], ['poeira respiravel', 'Poeira Respirável'],
    ['farinha', 'Farinha (poeiras)'], ['graos', 'Grãos, poeira (aveia, trigo, cevada)'], ['algodao', 'Algodão, bruto, sem tratamento, poeira'],
    ['negro de fumo', 'Negro de fumo'], ['xileno', 'Xileno, todos os isômeros'], ['xilenos', 'Xileno, todos os isômeros'], ['tolueno', 'Tolueno'], ['benzeno', 'Benzeno'],
    ['etanol', 'Etanol'], ['alcool etilico', 'Etanol'], ['acetona', 'Acetona'], ['metanol', 'Metanol'], ['ozonio', 'Ozônio'],
    ['chumbo', 'Chumbo e compostos inorgânicos, como Pb'], ['manganes', 'Manganês e seus compostos'], ['fumos de manganes', 'Manganês e seus compostos'],
    ['cromo hexavalente', 'Compostos de cromo hexavalente, como Cr(VI), compostos solúveis em água'],
    ['niquel', 'Níquel e compostos inorgânicos incluindo subsulfeto de níquel, como Ni elementar'],
    ['oxido de ferro', 'Ferro, óxido (Fe2O3)'], ['dioxido de titanio', 'Dióxido de titânio (Partículas finas)'], ['oxido de calcio', 'Óxido de cálcio'], ['aguarras', 'Aguarrás mineral (Solvente de Stoddard)'],
    ['querosene', 'Querosene, como vapor de hidrocarbonetos totais'], ['glutaraldeido', 'Glutaraldeído, ativado e não ativado'],
    ['glifosato', 'Glifosato'], ['2,4-d', '2,4-D'], ['2,4 d', '2,4-D'], ['diuron', 'Diuron'],
    ['peroxido de hidrogenio', 'Peróxido de hidrogênio'], ['acido peracetico', 'Ácido peracético'], ['hipoclorito', 'Cloro'],
    // genéricos por último
    ['poeiras minerais', 'Particulado Inalável (PNOS)'], ['poeira mineral', 'Particulado Inalável (PNOS)'],
    ['particulado', 'Particulado Inalável (PNOS)'], ['particulados', 'Particulado Inalável (PNOS)'], ['pnos', 'Particulado Inalável (PNOS)'], ['poeira', 'Particulado Inalável (PNOS)'], ['poeiras', 'Particulado Inalável (PNOS)']
  ];

  function norm(s) {
    return (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function temPalavra(txt, chave) { return new RegExp('(^|[^a-z0-9])' + esc(chave) + '([^a-z0-9]|$)').test(txt); }

  // similaridade simples (bigramas) para o "aproximado"
  function bigramas(s) { const b = new Set(); for (let i = 0; i + 1 < s.length; i++) b.add(s.slice(i, i + 2)); return b; }
  function similar(a, b) {
    const A = bigramas(a), B = bigramas(b); let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return (2 * inter) / (A.size + B.size || 1);
  }

  function casarExame(fator, exames, extras) {
    const f = norm(fator);
    const fCurto = f.split(/[\(\[]/)[0].trim();
    const exNorm = exames.map(e => [norm(e), e]);
    // base complementar do usuário (sinônimos salvos na tela de pontos críticos)
    if (extras && extras.sinonimos) {
      if (extras.sinonimos[f]) return { exame: extras.sinonimos[f], como: 'exato' };
      for (const k of Object.keys(extras.sinonimos)) if (k.length > 3 && temPalavra(f, k)) return { exame: extras.sinonimos[k], como: 'exato' };
    }
    for (const [n, e] of exNorm) if (n === f || n === fCurto) return { exame: e, como: 'exato' };
    for (const [chave, e] of SINONIMOS) if (temPalavra(f, chave)) return { exame: e, como: 'sinônimo' };
    for (const [n, e] of exNorm) if (n.length > 5 && temPalavra(f, n)) return { exame: e, como: 'contido' };
    const GENERICO = /^(outros?|produtos?|agentes?|diversos|quimicos?|poeiras?|gases|vapores|fumos|nevoas|particulados?)$/;
    if (fCurto.length >= 5 && !GENERICO.test(fCurto)) for (const [n, e] of exNorm) if (temPalavra(n, fCurto)) return { exame: e, como: 'contido' };
    let best = null, bs = 0;
    for (const [n, e] of exNorm) { const s = similar(fCurto, n); if (s > bs) { bs = s; best = e; } }
    if (bs >= 0.72) return { exame: best, como: 'aproximado' };
    return { exame: null, como: 'sem exame' };
  }

  /* devolve lista de {tipo, agente, obs, verificar} para um fator de risco */
  function classificar(grupo, fator, exames, extras) {
    const f = norm(fator);
    if (IGNORADOS.test(grupo)) return [];
    if (grupo === 'fisicos') {
      if (f.includes('ruido')) return [{ tipo: T.RUIDO, agente: '', obs: fator, verificar: false }];
      if (f.includes('calor') || f.includes('ibutg') || f.includes('temperatura elevada') || f.includes('temperaturas elevadas')) return [{ tipo: T.CALOR, agente: '', obs: fator, verificar: false }];
      if (f.includes('vibra')) {
        if (f.includes('corpo inteiro') || f.includes('vci') || f.includes('veicul')) return [{ tipo: T.VCI, agente: '', obs: fator, verificar: false }];
        if (f.includes('mao') || f.includes('braco') || f.includes('localizada') || f.includes('vmb') || f.includes('segmentar')) return [{ tipo: T.VMB, agente: '', obs: fator, verificar: false }];
        return [{ tipo: T.VCI, agente: '', obs: fator + ' | VERIFICAR: corpo inteiro ou mãos e braços?', verificar: true }];
      }
      const nomeCurto = fator.replace(/\s*\(.*$/, '').trim();
      if (/ionizante/.test(f) && !/n[aã]o[- ]?ionizante/.test(f)) return [{ tipo: T.QUAL, agente: nomeCurto, obs: fator + ' | VERIFICAR: radiação IONIZANTE exige avaliação específica (CNEN) e pode caracterizar periculosidade. Não tratar como qualitativa simples', verificar: true, fisico: true, ionizante: true }];
      const conhecido = /radia|frio|umidade|press[aã]o|solar|ultravioleta|infravermelh/.test(f);
      return [{ tipo: T.QUAL, agente: nomeCurto, obs: 'Físico avaliado qualitativamente: ' + fator + (conhecido ? '' : ' | VERIFICAR: físico não reconhecido'), verificar: !conhecido, fisico: true }];
    }
    if (grupo === 'quimicos') {
      // "OUTROS" (código eSocial 02.01.999): agente não especificado no PGR. Só entra com exame ou valor definido pelo usuário
      if (/^outros\b/.test(f)) {
        const salvo = extras && extras.sinonimos && extras.sinonimos[f];
        if (salvo) return [{ tipo: T.QUIM, agente: salvo, obs: fator + ' | exame definido pelo usuário', verificar: false }];
        return [{ tipo: T.QUIM, agente: '', obs: fator + ' | OUTROS: escolha um exame, cadastre um novo ou informe valor manual', verificar: true, outros: true }];
      }
      const r = casarExame(fator, exames, extras);
      if (r.exame) {
        const ver = r.como === 'contido' || r.como === 'aproximado';
        return [{ tipo: T.QUIM, agente: r.exame, obs: ver ? `${fator} | exame casado por ${r.como} | VERIFICAR` : fator, verificar: ver }];
      }
      // Químico sem identificação ou sem exame na base (ex.: "produtos químicos", "adubos químicos"): fica pendente como OUTROS
      // até o usuário validar (exame da base, cadastro novo, valor manual, qualitativa ou não entra). Decisão da gestão, 25/09/2026.
      return [{ tipo: T.QUIM, agente: '', obs: `${fator} | VALIDAR: químico sem identificação ou sem exame na base. Escolha exame, cadastre, informe valor manual ou marque qualitativa`, verificar: true, outros: true, semIdent: true }];
    }
    if (grupo === 'biologicos') return [{ tipo: T.QUAL, agente: 'Biológico: ' + fator, obs: 'Biológico avaliado qualitativamente', verificar: false }];
    return [];
  }

  /* Monta as linhas do levantamento a partir do PGR lido. */
  function montarLinhas(pgr, exames, extras) {
    const linhas = [];
    for (const g of pgr.ges) {
      const vistos = new Set(); const itens = [];
      for (const r of g.riscos) {
        for (const c of classificar(r.grupo, r.fator, exames, extras)) {
          c.fatorOriginal = r.fator; c.grupo = r.grupo;
          const k = c.tipo + '|' + norm(c.agente || c.fatorOriginal).slice(0, 40);
          if (vistos.has(k)) continue;
          vistos.add(k);
          itens.push({ ges: g.codigo, nome: g.nome, expostos: g.expostos, tipo: c.tipo, agente: c.agente, obs: c.obs, verificar: c.verificar, fisico: !!c.fisico, outros: !!c.outros, semIdent: !!c.semIdent, ionizante: !!c.ionizante, fatorOriginal: c.fatorOriginal, grupo: c.grupo, qtdAjustada: null, valorManual: null, escopo: 'cobrar' });
        }
      }
      if (!itens.length) itens.push({ ges: g.codigo, nome: g.nome, expostos: g.expostos, tipo: T.AUS, agente: '', obs: 'Nenhum agente físico, químico ou biológico no inventário', verificar: false, qtdAjustada: null, escopo: 'cobrar' });
      itens.sort((a, b) => (ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo)) || a.agente.localeCompare(b.agente));
      linhas.push(...itens);
    }
    return linhas;
  }

  /* Cargos disponíveis para o Laudo de Periculosidade: um por (GES, cargo), com expostos quando o PGR informa. */
  function cargosParaLP(pgr) {
    const out = [];
    for (const g of pgr.ges) {
      const temRisco = g.riscos.some(r => !IGNORADOS.test(r.grupo));
      for (const cargo of g.cargos) {
        const exp = g.cargosExp && g.cargosExp[cargo] != null ? g.cargosExp[cargo] : null;
        out.push({ chave: g.codigo + '|' + norm(cargo), ges: g.codigo, nome: g.nome, cargo, expostos: exp, expostosGes: g.expostos, operacional: temRisco });
      }
    }
    return out;
  }
  /* Linhas de periculosidade a partir das chaves escolhidas (ou, sem seleção, dos GES com risco). */
  function linhasPericulosidade(pgr, selecao) {
    const out = []; const vistos = new Set();
    for (const c of cargosParaLP(pgr)) {
      const escolhido = selecao ? selecao.includes(c.chave) : c.operacional;
      if (!escolhido) continue;
      const k = norm(c.cargo); if (vistos.has(k)) continue; vistos.add(k);
      out.push({ ges: c.ges, nome: c.nome, expostos: c.expostos != null ? c.expostos : c.expostosGes, tipo: T.LP, agente: c.cargo, obs: 'Laudo de Periculosidade (NR-16): função escolhida pelo cliente', verificar: false, qtdAjustada: null, escopo: 'cobrar' });
    }
    return out;
  }

  return { T, ORDEM, SINONIMOS, norm, casarExame, classificar, montarLinhas, linhasPericulosidade, cargosParaLP };
});
