/* app.js - tela do Precifica-Fieg (5 passos). Vanilla JS. */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const fmt = n => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtR = n => 'R$ ' + fmt(n);
  const hoje = () => new Date().toISOString().slice(0, 10);

  const TIPOS = ['Ruído (dosimetria)', 'Calor (IBUTG)', 'Vibração corpo inteiro', 'Vibração mãos e braços', 'Químico (laboratório)', 'Avaliação qualitativa', 'Ausência de risco', 'Periculosidade (por cargo)'];
  // termos que mudam conforme o módulo: no esboço não se fala de cobrança, só do que está contratado pelo plano
  const TERMOS = {
    ltcat: { cobrar: 'Adicional (cobrar)', plano: 'Coberto pelo plano', nao: 'Não entra', stp3: 'plano e o que cobrar', btnTudo: 'Cobrar tudo (sem plano)', ajuda: 'Aplicar o plano marca como "coberto" o que o pacote já inclui. Depois você pode mudar linha a linha no passo 2 (coluna Escopo).', kpiCobrar: 'adicional (cobrar)', kpiPlano: 'coberto pelo plano', notaFora: 'adicional, fora do plano', filtro: { tudo: 'Plano + adicionais (tudo que vai a campo)', plano: 'Só o coberto pelo plano', adicional: 'Só os adicionais (fora do plano)' }, escopoTxt: { tudo: 'plano + adicionais', plano: 'só o coberto pelo plano', adicional: 'só os adicionais (fora do plano)' } },
    esboco: { cobrar: 'Não contratado (fora do plano)', plano: 'Contratado no plano', nao: 'Não entra', stp3: 'plano e o que está contratado', btnTudo: 'Sem plano (nada contratado previamente)', ajuda: 'O plano define o que já está contratado. O que ficar fora do plano aparece no esboço como não contratado previamente. Depois você pode mudar linha a linha no passo 2 (coluna Escopo).', kpiCobrar: 'não contratado (fora do plano)', kpiPlano: 'contratado no plano', notaFora: 'não contratado no plano', filtro: { tudo: 'Tudo o que o PGR pede (contratado e não contratado)', plano: 'Só o contratado no plano', adicional: 'Só o não contratado (fora do plano)' }, escopoTxt: { tudo: 'tudo o que o PGR pede', plano: 'só o contratado no plano', adicional: 'só o não contratado (fora do plano)' } }
  };
  const T_ = () => TERMOS[S.modulo === 'esboco' ? 'esboco' : 'ltcat'];
  const escopos = () => [['cobrar', T_().cobrar], ['plano', T_().plano], ['nao', T_().nao]];

  const S = {
    regras: null, exames: null, distancias: null, config: {},
    pgr: null, proposta: null,
    cadastro: { empresa: '', cnpj: '', cidade: '', uf: '', grau: '', n_trab: '' },
    plano: 'Sem plano / avulso', incluirLP: false, lpSelecao: null, mineracao: false, descontoPct: null, esbocoFiltro: 'tudo', unidade: 'ges',
    linhas: [],
    logistica: { distancia: 0, pernoite: false, modo: 'auto', diasAjustado: null, responsavel: '', tipoLaudo: 'LTCAT/LI', data: hoje(), vigencia: 'v2026' },
    resultado: null, resultadoTotal: null, passo: 1, arquivos: { pgr: null, proposta: null }, extras: { sinonimos: {}, exames: [] },
    historico: [], pareceres: {}, motivos: {}, gruposExcluidos: [], filtroLev: { texto: '', tipo: '' }, modulo: 'ltcat', regrasLocais: false, ppr: null
  };

  // ------------------------------------------------------------------ carga
  async function carregarDados() {
    const IN = window.PRECIFICA_INLINE; // versão offline: dados embutidos no próprio HTML
    if (IN) { S.regras = JSON.parse(JSON.stringify(IN.regras)); S.exames = JSON.parse(JSON.stringify(IN.exames)); S.distancias = IN.distancias; S.config = IN.config || {}; }
    else {
      const [r, e, d] = await Promise.all(['dados/regras.json', 'dados/exames.json', 'dados/distancias-go.json'].map(u => fetch(u).then(x => x.json())));
      S.regras = r; S.exames = e; S.distancias = d;
      try { S.config = await fetch('dados/config.json').then(x => x.ok ? x.json() : {}); } catch (_) { S.config = {}; }
    }
    // base complementar (sinônimos e exames incluídos pelo usuário)
    try { const ex = IN && IN.extras ? IN.extras : await fetch('dados/extras.json').then(x => x.ok ? x.json() : null).catch(() => null); if (ex) S.extras = { sinonimos: ex.sinonimos || {}, exames: ex.exames || [] }; } catch (_) { /* ignora */ }
    try { const loc = localStorage.getItem('precifica.extras'); if (loc) { const j = JSON.parse(loc); S.extras = { sinonimos: Object.assign({}, S.extras.sinonimos, j.sinonimos || {}), exames: (S.extras.exames || []).concat((j.exames || []).filter(e => !(S.extras.exames || []).some(x => x.nome === e.nome))) }; } } catch (_) { /* ignora */ }
    aplicarExtrasExames();
    try {
      const salvo = localStorage.getItem('precifica.regras');
      if (salvo) { const j = JSON.parse(salvo); if (j && j.valores) { S.regras = j; S.regrasLocais = true; $('#aviso-regras-locais').hidden = false; } }
    } catch (_) { /* ignora */ }
    try { const ex = localStorage.getItem('precifica.exames'); if (ex) { const j = JSON.parse(ex); if (j && j.itens) { S.exames = j; S.examesLocais = true; $('#aviso-regras-locais').hidden = false; aplicarExtrasExames(); } } } catch (_) { /* ignora */ }
    S.logistica.vigencia = vigenciaAtual();
  }
  function aplicarExtrasExames() {
    for (const e of S.extras.exames || []) {
      if (!S.exames.itens.some(x => x.nome === e.nome)) S.exames.itens.push({ item: 'extra', nome: e.nome, v2025: e.valor, v2026: e.valor, extra: true });
    }
  }
  function salvarExtras() { try { localStorage.setItem('precifica.extras', JSON.stringify(S.extras)); } catch (_) { /* ignora */ } }
  async function detectarLayout(doc) {
    // olha só o texto (rápido) para escolher o leitor
    let sp = 0, mat = 0, pla = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      const t = tc.items.map(i => i.str).join(' ');
      if (/PLANILHA DE AN[AÁ]LISE DE CONDI/i.test(t)) pla++;
      if (/N[ºo°]\s*de Expostos/i.test(t) && /Matriz de Avalia/i.test(t)) mat++;
      if (/Total de trabalhadores/i.test(t) && /(GES|GHE)\s*\d{3,}/.test(t)) sp++;
      if (sp + mat + pla >= 3) break;
    }
    if (sp >= mat && sp >= pla && sp) return 'splus';
    if (pla >= mat && pla) return 'planilha';
    if (mat) return 'matriz';
    return 'splus';
  }
  function vigenciaAtual() {
    const d = hoje();
    const v = (S.exames.vigencias || []).find(x => d >= x.inicio && d <= x.fim);
    return v ? v.campo : 'v2026';
  }

  // ------------------------------------------------------------------ pdf.js
  async function abrirPdf(file) {
    const buf = await file.arrayBuffer();
    return pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  }

  // ------------------------------------------------------------------ passo 1: entrada
  function ligarEntrada() {
    const zonas = [['#zona-pgr', '#file-pgr', 'pgr'], ['#zona-prop', '#file-prop', 'proposta']];
    for (const [z, f, k] of zonas) {
      const zona = $(z), inp = $(f);
      zona.addEventListener('click', () => inp.click());
      zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('over'); });
      zona.addEventListener('dragleave', () => zona.classList.remove('over'));
      zona.addEventListener('drop', e => { e.preventDefault(); zona.classList.remove('over'); if (e.dataTransfer.files[0]) setArquivo(k, e.dataTransfer.files[0]); });
      inp.addEventListener('change', () => { if (inp.files[0]) setArquivo(k, inp.files[0]); });
    }
    $('#btn-ler').addEventListener('click', lerDocumentos);
    $$('[data-demo]').forEach(b => b.addEventListener('click', () => incluirLaudoTeste(b.dataset.demo)));
    $('#btn-manual').addEventListener('click', () => { S.linhas = []; S.pgr = null; ir(2); });
    $('#btn-abrir-json').addEventListener('click', () => $('#file-json').click());
    $('#file-json').addEventListener('change', async () => { const f = $('#file-json').files[0]; if (f) { carregarJSON(JSON.parse(await f.text())); } });
  }
  // Laudos teste para demonstração. Anicuns: o mesmo PGR do relatório comparativo com a planilha manual da Central.
  const DEMOS = {
    anicuns: { cliente: 'Anicuns S.A. Álcool e Derivados', arquivo: 'PGR Anicuns (laudo teste).pdf', url: 'dados/demo/pgr-anicuns.pdf', distancia: 85, tipoLaudo: 'LTCAT, LI', manual: 85604.53, dataManual: '24/09/2026' },
    shopequip: { cliente: 'Shopequip Administradora de Bens, Serviços e Locações Ltda', arquivo: 'PGR Shopequip (laudo teste).pdf', url: 'dados/demo/pgr-shopequip.pdf', distancia: 0, tipoLaudo: 'LTCAT, LI', manual: null }
  };
  async function incluirLaudoTeste(id) {
    const D = DEMOS[id] || DEMOS.anicuns;
    const st = $('#status-leitura'); st.hidden = false; st.textContent = 'Carregando o laudo teste...';
    try {
      let bytes;
      const emb = document.getElementById('demo-' + id);
      if (emb && emb.textContent.trim()) {
        const b = atob(emb.textContent.trim()); bytes = new Uint8Array(b.length);
        for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
      } else {
        const r = await fetch(D.url); if (!r.ok) throw new Error('arquivo do laudo teste não encontrado');
        bytes = new Uint8Array(await r.arrayBuffer());
      }
      setArquivo('pgr', new File([bytes], D.arquivo, { type: 'application/pdf' }), true);
      S.arquivos.proposta = null; $('#zona-prop .nome').textContent = '';
      S.demo = D;
      Object.assign(S.logistica, { distancia: D.distancia, tipoLaudo: D.tipoLaudo, diasAjustado: null });
      await lerDocumentos();
    } catch (e) { console.error(e); st.textContent = 'Erro ao carregar o laudo teste: ' + e.message; }
  }
  function setArquivo(k, file, demo) {
    if (!demo) S.demo = null;
    S.arquivos[k] = file;
    $(k === 'pgr' ? '#zona-pgr .nome' : '#zona-prop .nome').textContent = file.name;
    $('#btn-ler').disabled = !S.arquivos.pgr && !S.arquivos.proposta;
  }
  async function lerDocumentos() {
    const st = $('#status-leitura'); st.hidden = false; st.textContent = 'Lendo...';
    $('#btn-ler').disabled = true;
    try {
      const nomes = S.exames.itens.map(e => e.nome);
      if (S.arquivos.proposta) {
        const doc = await abrirPdf(S.arquivos.proposta);
        S.proposta = await LeitorProposta.lerProposta(doc);
        delete S.proposta.texto;
        if (S.proposta.plano) {
          const p = Object.keys(S.regras.planos).find(k => k.toLowerCase() === S.proposta.plano.toLowerCase());
          if (p) S.plano = p; else if (/plus/i.test(S.proposta.plano)) S.plano = 'SST Plus'; else if (/premium/i.test(S.proposta.plano)) S.plano = 'SST Premium'; else if (/base/i.test(S.proposta.plano)) S.plano = 'SST Base';
        }
      }
      if (S.arquivos.pgr) {
        const doc = await abrirPdf(S.arquivos.pgr);
        st.textContent = 'Identificando o layout do PGR...';
        const layout = await detectarLayout(doc);
        const leitores = { splus: ['padrão S+', LeitorPGR], matriz: ['terceiros (matriz de risco)', LeitorPGRMatriz], planilha: ['terceiros (planilha por cargo)', LeitorPGRPlanilha] };
        const ordem = [layout].concat(Object.keys(leitores).filter(k => k !== layout));
        S.pgr = null;
        for (const k of ordem) {
          const [rot, L] = leitores[k];
          const r = await L.lerPGR(doc, (p, n) => { st.textContent = `Lendo PGR ${rot}: página ${p} de ${n}`; });
          if (r.ges.length) { S.pgr = r; break; }
        }
        if (!S.pgr) throw new Error('Nenhum GES/GHE encontrado em nenhum dos três layouts conhecidos. Use o preenchimento manual.');
        Object.assign(S.cadastro, S.pgr.cadastro);
        S.mineracao = /^0[5-9]/.test(String(S.cadastro.cnae || '').replace(/\D/g, '').slice(0, 2)) ? true : S.mineracao;
        S.unidade = S.pgr.porCargo ? 'cargo' : 'ges';
        S.linhas = montarPorUnidade();
        S.lpSelecao = null;
        if (S.incluirLP) S.linhas = S.linhas.concat(Classificar.linhasPericulosidade(S.pgr, null));
        ordenar();
      } else if (S.proposta && S.proposta.avaliacoes.length) {
        // apenas proposta: linhas a partir do que foi contratado
        S.cadastro.empresa = S.proposta.empresa || ''; S.cadastro.cnpj = S.proposta.cnpj || '';
        S.linhas = S.proposta.avaliacoes.map(a => ({ ges: '', nome: 'Proposta', expostos: '', tipo: a.tipo, agente: a.tipo === 'Químico (laboratório)' ? melhorExame(a.descricao, nomes) : a.descricao, qtdAjustada: a.qtd, escopo: 'cobrar', obs: 'Proposta ' + (S.proposta.numero || '') + ': ' + a.descricao, verificar: a.tipo === 'Químico (laboratório)' }));
      } else if (S.proposta) {
        S.cadastro.empresa = S.proposta.empresa || ''; S.cadastro.cnpj = S.proposta.cnpj || '';
      }
      Motor.aplicarPlano(S.linhas, S.regras, S.plano);
      st.textContent = 'Leitura concluída.';
      renderResumoLeitura();
      ir(2);
    } catch (e) {
      console.error(e); st.textContent = 'Erro ao ler: ' + e.message;
    } finally { $('#btn-ler').disabled = false; }
  }
  function montarPorUnidade() {
    const nomes = S.exames.itens.map(e => e.nome);
    const vis = S.unidade === 'cargo' && S.pgr.porCargo ? { ges: S.pgr.porCargo } : S.pgr;
    const ls = Classificar.montarLinhas(vis, nomes, S.extras);
    if (S.unidade === 'cargo') ls.forEach(l => { l.unidadeCargo = true; });
    return ls;
  }
  function chaveUnidade(l) { return l.unidadeCargo ? l.ges + '|' + l.nome : String(l.ges); }
  function melhorExame(desc, nomes) { const r = Classificar.casarExame(desc, nomes); return r.exame || desc; }
  function renderResumoLeitura() {
    const el = $('#resumo-leitura'); el.hidden = false;
    const c = S.cadastro; const ges = S.pgr ? S.pgr.ges : [];
    const nVer = S.linhas.filter(l => l.verificar).length;
    let html = `<b>${c.empresa || '(empresa não identificada)'}</b> ${c.cnpj ? 'CNPJ ' + c.cnpj : ''}<br>`;
    if (S.pgr) html += `PGR${S.pgr.layout === 'matriz' ? ' de terceiros (matriz de risco)' : S.pgr.layout === 'planilha' ? ' de terceiros (planilha por cargo)' : ' padrão S+'}: ${ges.length} GES, ${ges.reduce((s, g) => s + (g.expostos || 0), 0)} expostos somados (cadastro: ${c.n_trab || '?'} trabalhadores), cidade ${c.cidade || '?'}. Linhas de levantamento: ${S.linhas.length}${nVer ? `, <span class="tag ver">${nVer} para VERIFICAR</span>` : ''}.<br>`;
    if (S.proposta) html += S.proposta.legivel ? `Proposta ${S.proposta.numero || ''}: plano <b>${S.proposta.plano || '?'}</b>, ${S.proposta.colaboradores || '?'} colaboradores, serviços ${S.proposta.servicos.join(', ') || '?'}${S.proposta.avaliacoes.length ? ', ' + S.proposta.avaliacoes.length + ' avaliações enumeradas' : ''}.` : `<span class="tag ver">${S.proposta.aviso}</span>`;
    if (S.pgr && S.pgr.avisos.length) html += `<br><span class="tag ver">${S.pgr.avisos.join(' | ')}</span>`;
    const nCrit = pontosCriticos().length; if (nCrit) html += `<br><span class="tag ver">${nCrit} pontos críticos</span> (botão "Pontos críticos" no passo 2)`;
    if (S.demo) html += `<div class="alerta-demo"><b>Laudo teste (demonstração):</b> ${esc(S.demo.cliente)}. ${S.demo.distancia ? 'Distância de ' + S.demo.distancia + ' km já preenchida. ' : 'Distância sugerida pela cidade no passo 4. '}${S.demo.manual ? 'Referência: planilha manual da Central de ' + S.demo.dataManual + ', R$ ' + fmt(S.demo.manual) + '. As diferenças estão explicadas no relatório comparativo.' : ''}</div>`;
    el.innerHTML = html;
  }

  // ------------------------------------------------------------------ passo 2: levantamento
  function ordenar() {
    S.linhas.sort((a, b) => (Number(a.ges) || 0) - (Number(b.ges) || 0) || Classificar.ORDEM.indexOf(a.tipo) - Classificar.ORDEM.indexOf(b.tipo) || String(a.agente).localeCompare(String(b.agente)));
  }
  function renderLevantamento() {
    const c = S.cadastro;
    $('#cad-empresa').value = c.empresa || ''; $('#cad-cnpj').value = c.cnpj || ''; $('#cad-cidade').value = c.cidade || '';
    $('#cad-grau').value = c.grau || ''; $('#cad-ntrab').value = c.n_trab || '';
    const su = $('#sel-unidade'); su.disabled = !(S.pgr && S.pgr.porCargo); su.value = S.unidade;
    $('#unidade-info').textContent = S.pgr && S.pgr.porCargo ? (S.unidade === 'cargo' ? 'Uma linha por cargo do PGR (como na precificação manual da Central). Ruído calculado por GES: soma os expostos dos cargos do mesmo GHE, aplica a regra do ruído e distribui entre os cargos.' : 'Cargos agrupados pelo GHE do anexo do PGR.') : 'Este PGR já vem por GES.';
    Motor.sugeridas(S.linhas, S.regras, { mineracao: S.mineracao }, S.gruposExcluidos); renderRegraRuido(); renderFiltrosLev();
    const F = S.filtroLev || { texto: '', tipo: '' }; const fq = Classificar.norm(F.texto || '');
    const passaFiltro = l => {
      if (F.tipo === 'VERIFICAR' && !l.verificar) return false;
      if (F.tipo && F.tipo.startsWith('grupo:') && Motor.grupoLinha(l) !== F.tipo.slice(6)) return false;
      if (F.tipo && F.tipo !== 'VERIFICAR' && !F.tipo.startsWith('grupo:') && l.tipo !== F.tipo) return false;
      if (fq && !Classificar.norm([l.ges, l.nome, l.tipo, l.agente, l.fatorOriginal, l.obs].join(' ')).includes(fq)) return false;
      return true;
    };
    let nVis = 0;
    const tb = $('#tab-lev tbody'); tb.innerHTML = '';
    const nomesEx = S.exames.itens.map(e => e.nome);
    S.linhas.forEach((l, i) => {
      const tr = document.createElement('tr');
      if (l.verificar) tr.classList.add('verificar');
      if (l.escopo === 'plano') tr.classList.add('plano');
      if (l.escopo === 'nao') tr.classList.add('nao');
      const gEx = S.gruposExcluidos.includes(Motor.grupoLinha(l));
      if (gEx) { tr.classList.add('nao'); tr.title = 'Grupo de risco desmarcado: fora da precificação'; }
      if (!passaFiltro(l)) tr.hidden = true; else nVis++;
      const sug = l.qtdSugerida ?? Motor.qtdSugerida(l, S.regras, { mineracao: S.mineracao });
      tr.innerHTML = `
        <td class="num">${i + 1}</td>
        <td><input data-k="ges" value="${l.ges ?? ''}" class="w60"></td>
        <td><input data-k="nome" value="${esc(l.nome)}" class="w140"></td>
        <td><input data-k="expostos" type="number" min="0" value="${l.expostos ?? ''}" class="w60"></td>
        <td><select data-k="tipo">${TIPOS.map(t => `<option ${t === l.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td>${celAgente(l)}</td>
        <td class="num"${l.notaRuido ? ` title="${esc(l.notaRuido)}"` : ''}>${sug}${l.notaRuido ? '<sup>GES</sup>' : ''}</td>
        <td><input data-k="qtdAjustada" type="number" min="0" value="${l.qtdAjustada ?? ''}" class="w60" placeholder="${sug}"></td>
        <td class="col-preco"><input data-k="valorManual" type="number" min="0" step="0.01" value="${l.valorManual ?? ''}" class="w80" placeholder="${precoRef(l)}" title="Valor unitário manual (só neste orçamento). Vazio = valor da tabela/regra"></td>
        <td><select data-k="escopo">${escopos().map(([v, r]) => `<option value="${v}" ${v === l.escopo ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
        <td><input data-k="obs" value="${esc(l.obs || '')}" class="w260"></td>
        <td><button class="mini" data-del="${i}" title="Remover">x</button></td>`;
      tr.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => {
        const k = inp.dataset.k; let v = inp.value; const antes = l[k];
        if (k === 'expostos' || k === 'qtdAjustada' || k === 'valorManual') v = v === '' ? (k === 'expostos' ? '' : null) : Number(v);
        if (k === 'ges') v = v === '' ? '' : (isNaN(Number(v)) ? v : Number(v));
        l[k] = v;
        if (k === 'escopo') l.escopoManual = true;
        if (String(antes ?? '') !== String(v ?? '') && k !== 'obs') Ocorrencias.registrar(S, { origem: 'Levantamento', acao: `GES ${l.ges ?? ''} ${l.tipo}${l.agente ? ': ' + l.agente : ''}. Campo "${ROT_CAMPO[k] || k}" de "${antes ?? ''}" para "${v ?? ''}"` });
        if (k === 'agente' || k === 'tipo' || k === 'valorManual') { l.verificar = l.tipo === 'Químico (laboratório)' && !nomesEx.includes(l.agente) && (l.valorManual === null || l.valorManual === undefined); if (!l.verificar) { l.obs = (l.obs || '').replace(/\s*\|\s*(VERIFICAR|OUTROS:).*$/, ''); l.outros = false; } }
        renderLevantamento();
      }));
      const bg = tr.querySelector('[data-guia]'); if (bg) bg.addEventListener('click', () => abrirGuia(bg.dataset.guia));
      const br = tr.querySelector('[data-resolver]'); if (br) br.addEventListener('click', () => { renderCriticos(); $('#painel-crit').classList.add('aberto'); });
      tr.querySelector('[data-del]').addEventListener('click', () => { Ocorrencias.registrar(S, { origem: 'Levantamento', acao: `Linha removida: GES ${l.ges ?? ''} ${l.tipo}${l.agente ? ': ' + l.agente : ''}` }); S.linhas.splice(i, 1); renderLevantamento(); });
      tb.appendChild(tr);
    });
    const nVer = S.linhas.filter(l => l.verificar).length;
    const nCrit = pontosCriticos().length;
    $('#lev-info').innerHTML = `${S.linhas.length} linhas${nVis !== S.linhas.length ? ` (mostrando ${nVis} pelo filtro)` : ''}.${S.gruposExcluidos.length ? ` <span class="tag ver">Fora da precificação: ${S.gruposExcluidos.map(g => ROT_GRUPO[g]).join(', ')}</span>` : ''} ${nVer ? `<span class="tag ver">${nVer} marcadas VERIFICAR</span>` : '<span class="tag ok">Nada pendente</span>'} ${nCrit ? `<span class="tag ver">${nCrit} pontos críticos</span>` : ''} Linhas cinzas: ${T_().kpiPlano}. Riscadas: não entram.`;
    $('#btn-crit').textContent = 'Pontos críticos' + (nCrit ? ' (' + nCrit + ')' : '');
    const nOut = S.linhas.filter(l => l.outros && !l.agente && (l.valorManual === null || l.valorManual === undefined) && l.escopo !== 'nao').length;
    if (nOut) $('#lev-info').innerHTML += `<div class="alerta-forte">${nOut} linha(s) "OUTROS" ou químico sem identificação, sem exame nem valor. ${S.modulo === 'esboco' ? 'Elas precisam de definição antes do esboço final.' : 'Elas não entram no preço até você definir.'} <button class="mini2" id="btn-lev-crit">Resolver agora</button></div>`;
    const bl = $('#btn-lev-crit'); if (bl) bl.addEventListener('click', () => { renderCriticos(); $('#painel-crit').classList.add('aberto'); });
  }
  // célula do agente: mostra sempre o nome como está no PGR e deixa claro quando a linha está pendente
  const ROT_GRUPO = { quimicos: 'Químicos', fisicos: 'Físicos', biologicos: 'Biológicos' };
  function renderFiltrosLev() {
    const F = S.filtroLev || (S.filtroLev = { texto: '', tipo: '' });
    if (document.activeElement !== $('#lev-filtro')) $('#lev-filtro').value = F.texto || '';
    const sel = $('#lev-filtro-tipo');
    sel.innerHTML = '<option value="">Todos os tipos</option><option value="VERIFICAR">Só pendentes / VERIFICAR</option>' + Object.entries(ROT_GRUPO).map(([k, r]) => `<option value="grupo:${k}">Grupo: ${r}</option>`).join('') + TIPOS.map(t => `<option>${t}</option>`).join('');
    sel.value = F.tipo || '';
    const cont = { quimicos: 0, fisicos: 0, biologicos: 0 };
    S.linhas.forEach(l => { const g = Motor.grupoLinha(l); if (g) cont[g]++; });
    $('#lev-grupos').innerHTML = '<b>Precificar:</b> ' + Object.entries(ROT_GRUPO).map(([k, r]) => `<label style="display:inline-flex;gap:4px;align-items:center;margin:0 10px 0 4px;font-size:13px;color:var(--texto)"><input type="checkbox" data-grupo="${k}" ${S.gruposExcluidos.includes(k) ? '' : 'checked'}> ${r} (${cont[k]})</label>`).join('') + '<small>desmarque para tirar o grupo inteiro do orçamento</small>';
    $('#lev-grupos').querySelectorAll('[data-grupo]').forEach(cb => cb.addEventListener('change', () => {
      const g = cb.dataset.grupo;
      S.gruposExcluidos = cb.checked ? S.gruposExcluidos.filter(x => x !== g) : S.gruposExcluidos.concat(g);
      Ocorrencias.registrar(S, { origem: 'Levantamento', acao: `Grupo ${ROT_GRUPO[g]} ${cb.checked ? 'voltou para' : 'retirado da'} precificação` });
      renderLevantamento();
    }));
  }
  const ROT_CAMPO = { ges: 'GES', nome: 'Nome', expostos: 'Expostos', tipo: 'Tipo', agente: 'Agente/Exame', qtdAjustada: 'Qtd ajustada', valorManual: 'R$ unit. manual', escopo: 'Escopo' };
  function textoRegraRuido() {
    const p = S.regras.valores.dosimetria_pct.valor, lim = Number(S.regras.valores.dosimetria_limiar.valor) || 0;
    return `teto(${+(p * 100).toFixed(2)}% dos colaboradores do GES), mínimo 1${lim > 0 ? `, aplicado acima de ${lim} colaboradores (até ${lim}: 1)` : ''}`;
  }
  function renderRegraRuido() {
    const p = S.regras.valores.dosimetria_pct.valor, lim = Number(S.regras.valores.dosimetria_limiar.valor) || 0;
    const ex = n => Motor.qtdSugerida({ tipo: 'Ruído (dosimetria)', expostos: n }, S.regras);
    const txt = `Ex.: 7 colaboradores x ${+(p * 100).toFixed(2)}% = ${(7 * p).toFixed(2).replace('.', ',')} = ${ex(7)} medição(ões); 12 = ${ex(12)}; 30 = ${ex(30)}.`;
    for (const [a, b, c] of [['#rr-pct', '#rr-lim', '#rr-ex'], ['#rr-pct2', '#rr-lim2', '#rr-ex2']]) { if (document.activeElement !== $(a)) $(a).value = +(p * 100).toFixed(2); if (document.activeElement !== $(b)) $(b).value = lim; $(c).innerHTML = `<small>${txt}</small>`; }
    $('#lev-regras').textContent = `Demais físicos: 1 por GES; químico: 1 amostrador por GES${S.modulo === 'esboco' ? '' : ' com o preço da tabela; qualitativa R$ ' + fmt(S.regras.valores.qualitativa_varias.valor)}. "Qtd ajust." sobrepõe a sugerida.`;
  }
  function ligarRegraRuido() {
    const aplicar = (pctEl, limEl) => {
      const antes = textoRegraRuido();
      const pv = Number($(pctEl).value), lv = Number($(limEl).value);
      if (!(pv > 0 && pv <= 100) || !(lv >= 0)) { renderRegraRuido(); return; }
      S.regras.valores.dosimetria_pct.valor = pv / 100; S.regras.valores.dosimetria_limiar.valor = lv; salvarRegrasLocal(); S.regrasLocais = true;
      Ocorrencias.registrar(S, { origem: 'Parâmetros', acao: 'Regra do ruído alterada', detalhe: 'de ' + antes + ' para ' + textoRegraRuido() });
      renderRegraRuido(); if (S.passo === 2) renderLevantamento(); if (S.passo === 6) renderEsboco();
    };
    for (const [a, b] of [['#rr-pct', '#rr-lim'], ['#rr-pct2', '#rr-lim2']]) { $(a).addEventListener('change', () => aplicar(a, b)); $(b).addEventListener('change', () => aplicar(a, b)); }
  }
  function celAgente(l) {
    const orig = String(l.fatorOriginal || '').replace(/\s+/g, ' ').trim();
    const curto = orig.length > 70 ? orig.slice(0, 68) + '...' : orig;
    const temManual = l.valorManual !== null && l.valorManual !== undefined && l.valorManual !== '';
    const pendente = l.tipo === 'Químico (laboratório)' && !l.agente && !temManual && l.escopo !== 'nao';
    let h = `<input data-k="agente" list="lista-exames" value="${esc(l.agente)}" class="w260" placeholder="${pendente ? 'escolha o exame da tabela' : ''}">`;
    if (pendente) h += `<div class="pend">PENDENTE: <b>${esc(curto || 'agente não especificado')}</b> ${l.outros && /^outros/i.test(orig) ? '(PGR não diz qual é o agente)' : '(não existe na tabela do laboratório)'} <button class="mini2" data-resolver>Resolver</button> <button class="mini2" data-guia="${esc(orig)}">Ver no guia de métodos</button></div>`;
    else if (curto && Classificar.norm(curto) !== Classificar.norm(l.agente || '') && (l.grupo === 'quimicos' || l.tipo === 'Químico (laboratório)')) h += `<div class="nopgr" title="${esc(orig)}">No PGR: ${esc(curto)}</div>`;
    return h;
  }
  function precoRef(l) {
    if (l.tipo === 'Químico (laboratório)') { const p = Motor.precoExame(S.exames, l.agente, S.logistica.vigencia); return p === null ? (l.agente ? 'sem preço' : 'pendente') : fmt(p); }
    if (l.tipo === 'Avaliação qualitativa') return fmt(S.regras.valores.qualitativa_varias.valor);
    if (l.tipo === 'Periculosidade (por cargo)') return fmt(S.regras.valores.lp_por_cargo.valor);
    const tp = S.regras.tipos[l.tipo]; return tp && tp.fixo ? fmt(tp.fixo) : 'horas';
  }
  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function pontosCriticos() {
    const grupos = {}; const out = [];
    const nomesEx = S.exames.itens.map(e => e.nome);
    const add = (tipo, l, i, acao, chave) => {
      const k = tipo + '|' + Classificar.norm(chave);
      if (!grupos[k]) { grupos[k] = { tipo, agente: chave, acao, linhas: [], ges: new Set(), exameAtual: l.agente }; out.push(grupos[k]); }
      grupos[k].linhas.push(i); grupos[k].ges.add(l.ges);
    };
    S.linhas.forEach((l, i) => {
      const orig = l.fatorOriginal || l.agente;
      const temManual = l.valorManual !== null && l.valorManual !== undefined && l.valorManual !== '';
      if (l.escopo === 'nao') return;
      if (l.outros && !l.agente && !temManual) add(l.semIdent ? 'Químico sem identificação ou sem exame na base: validar' : 'OUTROS: agente não especificado no PGR', l, i, 'quimico', orig);
      else if (temManual) { /* resolvido com valor manual */ }
      else if (l.tipo === 'Químico (laboratório)' && !nomesEx.includes(l.agente)) add('Químico sem exame na base', l, i, 'quimico', orig);
      else if (l.tipo === 'Químico (laboratório)' && /VERIFICAR/.test(l.obs || '')) add('Químico casado por aproximação', l, i, 'quimico', orig);
      else if (l.tipo === 'Avaliação qualitativa' && l.grupo === 'quimicos') add('Químico sem exame (ficou qualitativa)', l, i, 'quimico', orig);
      else if (l.ionizante && l.verificar) add('Radiação ionizante: avaliação específica e possível periculosidade', l, i, 'fisico', orig);
      else if (l.tipo === 'Avaliação qualitativa' && l.fisico && l.verificar) add('Físico não reconhecido', l, i, 'fisico', orig);
      else if (l.tipo === 'Vibração corpo inteiro' && /VERIFICAR/.test(l.obs || '')) add('Vibração sem tipo (VCI ou VMB?)', l, i, 'fisico', orig);
      if ((l.expostos === 0 || l.expostos === '') && l.tipo !== 'Ausência de risco') add('GES sem expostos', l, i, 'info', 'GES ' + l.ges);
    });
    if (S.pgr && S.pgr.criticos) {
      const porTipo = {};
      for (const c of S.pgr.criticos) {
        const t = c.tipo === 'ghe' ? 'Funções sem GHE ou casadas por aproximação (só informação)' : c.tipo === 'codigo' ? 'Código eSocial ausente ou inválido (só informação)' : c.tipo === 'efetivo' ? 'Efetivo' : c.tipo;
        if (!porTipo[t]) { porTipo[t] = { tipo: t, agente: '', itens: [], acao: 'info', linhas: [], ges: new Set() }; out.push(porTipo[t]); }
        porTipo[t].itens.push([c.cargo, c.agente].filter(Boolean).join(' | ') + (c.msg ? ': ' + c.msg : ''));
      }
      for (const g of Object.values(porTipo)) { g.agente = g.itens.length + ' ocorrência(s)'; g.msg = g.itens.join('\n'); }
    }
    return out;
  }
  function renderCriticos() {
    const lista = pontosCriticos();
    const nomesEx = S.exames.itens.map(e => e.nome);
    const opts = '<option value="">escolha o exame...</option>' + nomesEx.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    const nAcao = lista.filter(c => c.acao !== 'info').length;
    let h = `<p>${lista.length} pontos (${nAcao} com ação). Cada linha agrupa todos os GES com o mesmo agente. O que você resolver fica salvo na base complementar deste navegador (sinônimos e exames novos) e vale para os próximos PGRs. Em Parâmetros dá para baixar e abrir a base complementar.</p>`;
    h += '<table class="param"><tr><th>Item</th><th>Tipo</th><th>GES</th><th>Agente / função (como está no PGR)</th><th>Ação</th></tr>';
    lista.forEach((c, k) => {
      let acao = '';
      if (c.acao === 'quimico') acao = `<small>hoje: ${esc(c.exameAtual || '(qualitativa)')}</small><br><select data-ci="${k}" class="ci-exame">${opts}</select><br><button class="mini2" data-ci-sin="${k}">Usar e salvar como sinônimo</button> <button class="mini2" data-ci-qual="${k}">Manter qualitativa</button> <button class="mini2" data-ci-nao="${k}">Não entra</button><br><small>novo exame na base: <input data-ci-nome="${k}" placeholder="nome do exame" style="width:170px"> R$ <input data-ci-valor="${k}" type="number" step="0.01" style="width:75px"> <button class="mini2" data-ci-novo="${k}">Incluir na base</button></small><br><small>ou valor manual só neste orçamento: R$ <input data-ci-man="${k}" type="number" step="0.01" style="width:75px"> motivo: <input data-ci-motivo="${k}" placeholder="obrigatório (ex.: cotação do laboratório)" style="width:200px"> <button class="mini2" data-ci-manbtn="${k}">Usar valor manual</button></small>`;
      else if (c.acao === 'fisico') acao = `<select data-ci-tipo="${k}"><option value="">manter como está</option>${TIPOS.filter(t => t !== 'Periculosidade (por cargo)').map(t => `<option>${t}</option>`).join('')}</select> <button class="mini2" data-ci-fis="${k}">Aplicar</button>`;
      else acao = c.itens ? `<details><summary><small>ver lista</small></summary><small style="white-space:pre-wrap">${esc(c.msg)}</small></details>` : `<small>${esc(c.msg || 'só informação')}</small>`;
      if (c.acao !== 'info') acao += `<details style="margin-top:4px"><summary><small>Parecer se ficar pendente (vai no relatório)</small></summary><textarea data-ci-par="${k}" style="min-height:60px;font-size:11px">${esc(S.pareceres[Ocorrencias.chavePonto(c)] || Ocorrencias.parecerPadrao(c))}</textarea></details>`;
      const gesTxt = c.ges.size > 3 ? c.ges.size + ' GES' : Array.from(c.ges).join(', ');
      h += `<tr><td>${k + 1}</td><td>${esc(c.tipo)}</td><td>${esc(gesTxt)}</td><td>${esc(c.agente)}</td><td>${acao}</td></tr>`;
    });
    h += '</table>';
    const el = $('#crit-lista'); el.innerHTML = h;
    el.querySelectorAll('[data-ci-par]').forEach(t => t.addEventListener('change', () => { S.pareceres[Ocorrencias.chavePonto(lista[Number(t.dataset.ciPar)])] = t.value; }));
    const linhasDe = k => lista[k].linhas.map(i => S.linhas[i]);
    const reg = (k, acao, detalhe) => { const c = lista[k]; const ges = Array.from(c.ges || []); Ocorrencias.registrar(S, { origem: 'Ponto crítico', ocorrencia: c.tipo, agente: c.agente, ges: ges.length > 6 ? ges.length + ' GES' : ges.join(', '), acao, detalhe: (detalhe ? detalhe.replace(/\.?\s*$/, '. ') : '') + c.linhas.length + ' linha(s)' }); delete S.pareceres[Ocorrencias.chavePonto(c)]; };
    el.querySelectorAll('[data-ci-sin]').forEach(b => b.addEventListener('click', () => {
      const k = Number(b.dataset.ciSin); const ex = el.querySelector(`select[data-ci="${k}"]`).value; if (!ex) return;
      const chaveSin = Classificar.norm(lista[k].agente);
      if (chaveSin !== 'outros') { S.extras.sinonimos[chaveSin] = ex; salvarExtras(); }
      reg(k, 'Associado ao exame da tabela: ' + ex, chaveSin !== 'outros' ? 'salvo como sinônimo na base complementar' : 'só neste orçamento');
      for (const l of linhasDe(k)) { l.tipo = 'Químico (laboratório)'; l.agente = ex; l.verificar = false; l.outros = false; l.obs = (l.fatorOriginal || '') + ' | exame definido pelo usuário' + (chaveSin === 'outros' ? ' (só neste orçamento)' : ''); }
      renderCriticos(); renderLevantamento();
    }));
    el.querySelectorAll('[data-ci-manbtn]').forEach(b => b.addEventListener('click', () => {
      const k = Number(b.dataset.ciManbtn); const v = el.querySelector(`[data-ci-man="${k}"]`).value; const mot = el.querySelector(`[data-ci-motivo="${k}"]`).value.trim();
      if (v === '') return;
      if (!mot) { el.querySelector(`[data-ci-motivo="${k}"]`).style.borderColor = '#C00000'; el.querySelector(`[data-ci-motivo="${k}"]`).placeholder = 'informe o motivo para registrar'; return; }
      reg(k, 'Valor manual R$ ' + fmt(v), 'motivo: ' + mot);
      for (const l of linhasDe(k)) { l.valorManual = Number(v); l.motivoManual = mot + ' (' + (S.logistica.responsavel || 'responsável não informado') + ', ' + new Date().toLocaleDateString('pt-BR') + ')'; l.tipo = 'Químico (laboratório)'; l.verificar = false; l.outros = false; l.obs = (l.fatorOriginal || '') + ' | valor manual R$ ' + fmt(v) + ' | motivo: ' + l.motivoManual; }
      renderCriticos(); renderLevantamento();
    }));
    el.querySelectorAll('[data-ci-qual]').forEach(b => b.addEventListener('click', () => { reg(Number(b.dataset.ciQual), 'Mantido como avaliação qualitativa'); for (const l of linhasDe(Number(b.dataset.ciQual))) { l.tipo = 'Avaliação qualitativa'; l.agente = l.fatorOriginal || l.agente; l.verificar = false; l.grupo = 'qual'; l.obs = (l.fatorOriginal || '') + ' | qualitativa (decisão do usuário)'; } renderCriticos(); renderLevantamento(); }));
    el.querySelectorAll('[data-ci-nao]').forEach(b => b.addEventListener('click', () => { const k = Number(b.dataset.ciNao); const mot = (el.querySelector(`[data-ci-par="${k}"]`) || {}).value || ''; reg(k, 'Não entra no orçamento', mot ? 'parecer: ' + mot : ''); for (const l of linhasDe(k)) { l.motivoEscopo = 'Decisão no ponto crítico: ' + (mot || 'não entra'); l.escopo = 'nao'; l.escopoManual = true; l.verificar = false; l.grupo = 'nao'; } renderCriticos(); renderLevantamento(); }));
    el.querySelectorAll('[data-ci-novo]').forEach(b => b.addEventListener('click', () => {
      const k = Number(b.dataset.ciNovo); const nome = el.querySelector(`[data-ci-nome="${k}"]`).value.trim(); const valor = Number(el.querySelector(`[data-ci-valor="${k}"]`).value);
      if (!nome || !(valor >= 0)) return;
      if (!S.extras.exames.some(e => e.nome === nome)) S.extras.exames.push({ nome, valor }); aplicarExtrasExames();
      reg(k, 'Exame novo incluído na base: ' + nome + ' (R$ ' + fmt(valor) + ')');
      if (Classificar.norm(lista[k].agente) !== 'outros') S.extras.sinonimos[Classificar.norm(lista[k].agente)] = nome; salvarExtras();
      for (const l of linhasDe(k)) { l.tipo = 'Químico (laboratório)'; l.agente = nome; l.verificar = false; l.outros = false; l.obs = (l.fatorOriginal || '') + ' | exame incluído na base pelo usuário'; }
      $('#lista-exames').innerHTML = S.exames.itens.map(e => `<option value="${esc(e.nome)}">`).join('');
      renderCriticos(); renderLevantamento();
    }));
    el.querySelectorAll('[data-ci-fis]').forEach(b => b.addEventListener('click', () => { const k = Number(b.dataset.ciFis); const t = el.querySelector(`[data-ci-tipo="${k}"]`).value; if (!t) return; reg(k, 'Tipo de avaliação definido: ' + t); for (const l of linhasDe(k)) { l.tipo = t; if (t !== 'Avaliação qualitativa' && t !== 'Químico (laboratório)') l.agente = ''; l.verificar = false; l.obs = (l.fatorOriginal || '') + ' | tipo definido pelo usuário'; } renderCriticos(); renderLevantamento(); }));
  }
  function abrirPainelLP() {
    if (!S.pgr) { $('#lev-info').innerHTML = '<span class="tag ver">O LP por função usa os cargos do PGR. Sem PGR, adicione linhas "Periculosidade (por cargo)" à mão com o nome da função.</span>'; return; }
    const cargos = Classificar.cargosParaLP(S.pgr);
    const sel = S.lpSelecao || (S.incluirLP ? cargos.filter(c => c.operacional).map(c => c.chave) : []);
    let h = '<table class="param"><tr><th></th><th>GES</th><th>Função</th><th>Expostos</th></tr>';
    let gAtual = null;
    for (const c of cargos) {
      if (c.ges !== gAtual) { gAtual = c.ges; h += `<tr class="sub"><td colspan="4"><b>GES ${c.ges}</b> ${esc(c.nome)}${c.operacional ? '' : ' <small>(sem risco físico, químico ou biológico)</small>'}</td></tr>`; }
      h += `<tr><td><input type="checkbox" value="${esc(c.chave)}" data-oper="${c.operacional ? 1 : 0}" ${sel.includes(c.chave) ? 'checked' : ''}></td><td>${c.ges}</td><td>${esc(c.cargo)}</td><td class="num">${c.expostos != null ? c.expostos : '<small>GES: ' + (c.expostosGes ?? '?') + '</small>'}</td></tr>`;
    }
    h += '</table>';
    $('#lp-lista').innerHTML = h || '<p>O PGR não trouxe cargos.</p>';
    $('#lp-info').textContent = `${cargos.length} funções no PGR. O laudo de periculosidade é cobrado por função escolhida (R$ ${fmt(S.regras.valores.lp_por_cargo.valor)} cada; R$ ${fmt(S.regras.valores.lp_muitos_valor.valor)} acima de ${S.regras.valores.lp_muitos_limiar.valor} funções).`;
    $('#painel-lp').classList.add('aberto');
  }
  function ligarLevantamento() {
    for (const [id, k] of [['#cad-empresa', 'empresa'], ['#cad-cnpj', 'cnpj'], ['#cad-cidade', 'cidade'], ['#cad-grau', 'grau'], ['#cad-ntrab', 'n_trab']]) {
      $(id).addEventListener('change', () => { S.cadastro[k] = $(id).value; if (k === 'cidade') sugerirDistancia(); });
    }
    $('#btn-add-linha').addEventListener('click', () => {
      const ult = S.linhas[S.linhas.length - 1];
      S.linhas.push({ ges: ult ? ult.ges : 1001, nome: ult ? ult.nome : '', expostos: ult ? ult.expostos : '', tipo: 'Químico (laboratório)', agente: '', qtdAjustada: null, escopo: 'cobrar', obs: '', verificar: false, manual: true }); Ocorrencias.registrar(S, { origem: 'Levantamento', acao: 'Linha incluída manualmente no GES ' + (ult ? ult.ges : '') });
      renderLevantamento();
    });
    $('#btn-ordenar').addEventListener('click', () => { ordenar(); renderLevantamento(); });
    $('#btn-lp').addEventListener('click', abrirPainelLP);
    $('#btn-crit').addEventListener('click', () => { renderCriticos(); $('#painel-crit').classList.add('aberto'); });
    $('#sel-unidade').addEventListener('change', () => {
      if (!S.pgr || !S.pgr.porCargo) return;
      S.unidade = $('#sel-unidade').value;
      const lp = S.linhas.filter(l => l.tipo === 'Periculosidade (por cargo)');
      S.linhas = montarPorUnidade().concat(lp); ordenar(); Motor.aplicarPlano(S.linhas, S.regras, S.plano); renderLevantamento();
    });
    $('#btn-crit-fechar').addEventListener('click', () => $('#painel-crit').classList.remove('aberto'));
    $('#btn-lp-fechar').addEventListener('click', () => $('#painel-lp').classList.remove('aberto'));
    $('#btn-lp-todas').addEventListener('click', () => $$('#lp-lista input[type=checkbox]').forEach(c => c.checked = true));
    $('#btn-lp-oper').addEventListener('click', () => $$('#lp-lista input[type=checkbox]').forEach(c => c.checked = c.dataset.oper === '1'));
    $('#btn-lp-nenhuma').addEventListener('click', () => $$('#lp-lista input[type=checkbox]').forEach(c => c.checked = false));
    $('#btn-lp-aplicar').addEventListener('click', () => {
      S.lpSelecao = $$('#lp-lista input[type=checkbox]:checked').map(c => c.value);
      S.linhas = S.linhas.filter(l => l.tipo !== 'Periculosidade (por cargo)').concat(Classificar.linhasPericulosidade(S.pgr, S.lpSelecao));
      S.incluirLP = S.lpSelecao.length > 0; ordenar(); Motor.aplicarPlano(S.linhas, S.regras, S.plano, true);
      $('#painel-lp').classList.remove('aberto'); renderLevantamento();
    });
    $('#btn-limpar-ver').addEventListener('click', () => { S.linhas.forEach(l => { l.verificar = false; l.obs = (l.obs || '').replace(/\s*\|\s*VERIFICAR.*$/, ''); }); renderLevantamento(); });
    const dl = $('#lista-exames'); dl.innerHTML = S.exames.itens.map(e => `<option value="${esc(e.nome)}">`).join('');
  }

  // ------------------------------------------------------------------ passo 3: escopo
  function renderEscopo() {
    $('#chk-mineracao').checked = !!S.mineracao;
    $('#mineracao-info').innerHTML = S.mineracao ? `Ativo: poeira mineral e sílica com <b>${S.regras.valores.nr22_medicoes_poeira.valor} medições por GES</b> (NR-22 Anexo V, item 4.2). ${/^0[5-9]/.test(String(S.cadastro.cnae || '').replace(/\D/g, '').slice(0, 2)) ? 'Sugerido pelo CNAE ' + S.cadastro.cnae + '.' : ''}` : 'Desligado: poeira e sílica seguem a regra geral (1 amostrador por GES).';
    const sel = $('#sel-plano'); sel.innerHTML = Object.keys(S.regras.planos).map(p => `<option ${p === S.plano ? 'selected' : ''}>${p}</option>`).join('');
    const pl = S.regras.planos[S.plano] || {};
    $('#plano-desc').innerHTML = `${pl.descricao || ''}${pl.pendente ? ' <span class="tag ver">lista de cobertura pendente de confirmação</span>' : ''}`;
    const n = { cobrar: 0, plano: 0, nao: 0 };
    S.linhas.forEach(l => n[l.escopo] = (n[l.escopo] || 0) + 1);
    $('#escopo-resumo').innerHTML = `<div class="kpi"><span>${n.cobrar}</span>${T_().kpiCobrar}</div><div class="kpi"><span>${n.plano}</span>${T_().kpiPlano}</div><div class="kpi"><span>${n.nao}</span>não entra</div>`;
    if (S.proposta && S.proposta.legivel) $('#escopo-proposta').innerHTML = `Proposta ${S.proposta.numero}: plano <b>${S.proposta.plano}</b>, serviços ${S.proposta.servicos.join(', ')}.${S.proposta.avaliacoes.length ? '<br>Avaliações enumeradas: ' + S.proposta.avaliacoes.map(a => a.qtd + 'x ' + a.descricao).join('; ') : ''}`;
    else $('#escopo-proposta').textContent = 'Sem proposta lida. O plano escolhido acima define o que já está ' + (S.modulo === 'esboco' ? 'contratado.' : 'coberto.');
  }
  function ligarEscopo() {
    $('#chk-mineracao').addEventListener('change', () => { S.mineracao = $('#chk-mineracao').checked; renderEscopo(); });
    $('#sel-plano').addEventListener('change', () => { S.plano = $('#sel-plano').value; renderEscopo(); });
    $('#btn-aplicar-plano').addEventListener('click', () => { S.linhas.forEach(l => delete l.escopoManual); Motor.aplicarPlano(S.linhas, S.regras, S.plano); renderEscopo(); });
    $('#btn-tudo-cobrar').addEventListener('click', () => { S.linhas.forEach(l => { l.escopo = 'cobrar'; delete l.escopoManual; }); renderEscopo(); });
  }

  // ------------------------------------------------------------------ passo 4: logística
  function sugerirDistancia() {
    const cid = (S.cadastro.cidade || '').trim();
    const d = S.distancias.cidades;
    const k = Object.keys(d).find(x => x.toLowerCase() === cid.toLowerCase());
    if (k !== undefined && (S.logistica.distancia === 0 || S.logistica.distancia === '')) { S.logistica.distancia = d[k]; }
  }
  function renderLogistica() {
    sugerirDistancia();
    const L = S.logistica;
    $('#log-cidade').value = S.cadastro.cidade || ''; $('#log-dist').value = L.distancia ?? 0; $('#log-modo').value = L.modo || (L.pernoite ? 'pernoite' : 'auto');
    $('#log-dias').value = L.diasAjustado ?? ''; $('#log-resp').value = L.responsavel || ''; $('#log-tipo').value = L.tipoLaudo || ''; $('#log-data').value = L.data || hoje();
    const vs = $('#log-vig'); vs.innerHTML = (S.exames.vigencias || []).map(v => `<option value="${v.campo}" ${v.campo === L.vigencia ? 'selected' : ''}>${v.rotulo}</option>`).join('');
    const dlc = $('#lista-cidades'); dlc.innerHTML = Object.keys(S.distancias.cidades).sort().map(c => `<option value="${esc(c)}">`).join('');
  }
  function ligarLogistica() {
    $('#log-cidade').addEventListener('change', () => { S.cadastro.cidade = $('#log-cidade').value; S.logistica.distancia = 0; sugerirDistancia(); $('#log-dist').value = S.logistica.distancia; });
    $('#log-dist').addEventListener('change', () => S.logistica.distancia = Number($('#log-dist').value) || 0);
    $('#log-modo').addEventListener('change', () => { Ocorrencias.registrar(S, { origem: 'Logística', acao: 'Modo de logística: ' + $('#log-modo').selectedOptions[0].text }); S.logistica.modo = $('#log-modo').value; S.logistica.pernoite = S.logistica.modo === 'pernoite'; });
    $('#log-dias').addEventListener('change', () => { Ocorrencias.registrar(S, { origem: 'Logística', acao: 'Dias em campo: ' + ($('#log-dias').value === '' ? 'automático' : $('#log-dias').value) }); }); $('#log-dias').addEventListener('change', () => S.logistica.diasAjustado = $('#log-dias').value === '' ? null : Number($('#log-dias').value));
    $('#log-resp').addEventListener('change', () => S.logistica.responsavel = $('#log-resp').value);
    $('#log-tipo').addEventListener('change', () => S.logistica.tipoLaudo = $('#log-tipo').value);
    $('#log-data').addEventListener('change', () => S.logistica.data = $('#log-data').value);
    $('#log-vig').addEventListener('change', () => S.logistica.vigencia = $('#log-vig').value);
  }

  // ------------------------------------------------------------------ passo 5: resultado
  function calcular() {
    const ent = { linhas: S.linhas, logistica: S.logistica, regras: S.regras, exames: S.exames, vigencia: S.logistica.vigencia, mineracao: S.mineracao, descontoPct: S.descontoPct, gruposExcluidos: S.gruposExcluidos };
    S.resultado = Motor.calcular(ent, 'adicional');
    S.resultadoTotal = Motor.calcular(ent, 'total');
  }
  function renderResultado() {
    calcular();
    const R = S.resultado, RT = S.resultadoTotal, c = R.custos;
    $('#kpis').innerHTML = `
      <div class="kpi big"><span>${fmtR(c.proposta)}</span>valor da proposta (adicional a cobrar)${R.ausencia ? '<br><small>laudo de ausência de risco: valor fechado</small>' : ''}</div>
      <div class="kpi"><span>${fmtR(RT.custos.proposta)}</span>se cobrasse tudo (inclusive o coberto pelo plano)</div>
      <div class="kpi"><span>${R.totalAv}</span>avaliações</div>
      <div class="kpi"><span>${R.dias}</span>dias em campo</div>
      <div class="kpi"><span>${R.horasCampo}</span>horas TST em campo</div>
      <div class="kpi"><span>${R.logistica.modo === 'pernoite' ? 'Pernoite' : 'Diária'}</span>logística ${R.logistica.escolhido === 'auto' ? '(automática: a mais barata)' : '(definida)'}<br><small>ida e volta diária ${fmtR(R.logistica.opDiario)} | pernoite ${fmtR(R.logistica.opPernoite)} (${R.logistica.viagens} viagens)</small></div>`;
    // planilha de custos SESI
    const l = (a, b, cc, d) => `<tr><td>${a}</td><td class="num">${typeof b === 'number' ? b.toLocaleString('pt-BR') : b}</td><td class="num">${cc}</td><td class="num">${d}</td></tr>`;
    const sub = (t, v) => `<tr class="sub"><td colspan="3">${t}</td><td class="num">${fmt(v)}</td></tr>`;
    let h = `<table class="custos"><thead><tr><th colspan="4">1 - DESPESAS COM COLABORADORES</th></tr><tr><th>Levantamento de dados</th><th>Nº de dias</th><th>Custo/dia</th><th>Total</th></tr></thead><tbody>`;
    h += l('Diária completa', c.c1.diariaQ, fmt(c.c1.diariaV), fmt(c.c1.diariaQ * c.c1.diariaV)) + l('Meia diária', c.c1.meiaQ, fmt(c.c1.meiaV), fmt(c.c1.meiaQ * c.c1.meiaV)) + sub('Custos (1)', c.c1.total);
    h += `<tr><th>Levantamento de dados</th><th>Nº de horas</th><th>Custo/hora</th><th>Total</th></tr>`;
    h += l('Levantamento de dados Engenheiro', c.c2.hLevEng, fmt(c.c2.hEng), fmt(c.c2.hLevEng * c.c2.hEng)) + l('Levantamento de dados Téc. Segurança', c.c2.hCampo, fmt(c.c2.hTst), fmt(c.c2.hCampo * c.c2.hTst)) + l('Lançamento de dados Téc. Segurança', c.c2.hLanc, fmt(c.c2.hTst), fmt(c.c2.hLanc * c.c2.hTst)) + l('Revisão de relatório Engenheiro', c.c2.hRev, fmt(c.c2.hEng), fmt(c.c2.hRev * c.c2.hEng)) + l('Entrega de relatório Engenheiro', c.c2.hEnt, fmt(c.c2.hEng), fmt(c.c2.hEnt * c.c2.hEng)) + sub('Custos (2)', c.c2.total);
    h += sub('Custos (3) horas extras 50%', 0) + sub('Custos (4) horas extras 100%', 0);
    h += `<tr><th colspan="4">2 - DESPESAS COM TRANSPORTE E ALIMENTAÇÃO</th></tr><tr><th>Meio</th><th>Quant.</th><th>Valor</th><th>Total</th></tr>`;
    h += l('Km rodado', c.c5.kmQ, fmt(c.c5.kmV), fmt(c.c5.kmQ * c.c5.kmV)) + l('Refeição / ajuda de custo', c.c5.refQ, fmt(c.c5.refV), fmt(c.c5.refQ * c.c5.refV)) + sub('Custos (5)', c.c5.total);
    h += `<tr><th colspan="4">3 - MATERIAL DE EXPEDIENTE E OUTROS</th></tr><tr><th>Especificação</th><th>Quant.</th><th>Valor unit.</th><th>Total</th></tr>`;
    h += l('ART - CREA', 1, fmt(c.c6.art), fmt(c.c6.art)) + l('Postagem para amostra' + (c.c6.postQ !== c.c6.postAuto ? ' <small>(ajustada; automático ' + c.c6.postAuto + ')</small>' : ''), c.c6.postQ, fmt(c.c6.postV), fmt(c.c6.postQ * c.c6.postV)) + l('Material administrativo (folhas)', c.c6.folhas, fmt(c.c6.folhaV), fmt(c.c6.folhas * c.c6.folhaV)) + sub('Custos (6)', c.c6.total);
    h += `<tr><th colspan="4">4 - OUTROS TIPOS DE SERVIÇOS</th></tr><tr><th>Descrição</th><th>Quantidade</th><th>Valor unit.</th><th>Valor total</th></tr>`;
    for (const s of R.secao4) if (s.qtd > 0 || s.total > 0) h += l(`<a href="#" class="ir-lev" data-tipo="${esc(s.tipo)}" data-agente="${s.tipo === 'Químico (laboratório)' ? esc(String(s.descricao).replace(/ \(valor manual\)$/, '')) : ''}" title="Ver essas linhas no levantamento">${esc(s.descricao)}</a>` + (s.detalhe ? `<br><small>${esc(s.detalhe)}</small>` : ''), s.qtd, fmt(s.valorUnit), fmt(s.total));
    h += sub('Custos (7)', c.c7.total);
    h += `<tr class="tot"><td colspan="3">5 - Custos totais (1+2+3+4+5+6+7)</td><td class="num">${fmt(c.total)}</td></tr>`;
    h += `<tr><td colspan="3">6 - BDI (${(c.bdiPct * 100).toFixed(0)}%)</td><td class="num">${fmt(c.bdi)}</td></tr>`;
    h += `<tr><td colspan="3">7 - Desconto exclusivo (${(c.descPct * 100).toFixed(1).replace('.0', '')}%)</td><td class="num">${fmt(c.desc)}</td></tr>`;
    h += `<tr><td colspan="3">8 - Margem final</td><td class="num">${c.total ? ((c.proposta / c.total - 1) * 100).toFixed(1) : '0,0'}%</td></tr>`;
    h += `<tr class="tot"><td colspan="3">9 - Valor total da proposta</td><td class="num">${fmt(c.proposta)}</td></tr></tbody></table>`;
    $('#planilha-custos').innerHTML = h;
    $('#planilha-custos').querySelectorAll('a.ir-lev').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); S.filtroLev = { texto: a.dataset.agente || '', tipo: a.dataset.tipo || '' }; ir(2); }));

    $('#desc-pct').value = S.descontoPct === null ? '' : +(S.descontoPct * 100).toFixed(2);
    const aj = S.logistica.postagensAjustado != null && S.logistica.postagensAjustado !== '';
    $('#post-aj').value = aj ? S.logistica.postagensAjustado : ''; $('#post-aj').placeholder = String(c.c6.postAuto); $('#post-motivo').value = S.logistica.motivoPostagens || ''; $('#post-motivo').style.borderColor = '';
    $('#post-info').textContent = aj ? `Ajustado: ${c.c6.postQ} (cálculo automático: ${c.c6.postAuto})` : `Automático: ${c.c6.postAuto} (uma por viagem, mínimo ${S.regras.valores.postagens_com_quimico.valor} com químico)`;
    const nPend = pontosCriticos().filter(p => p.acao !== 'info').length, nAlt = Ocorrencias.alteracoes(S, R, precoTabelaLinha).length;
    $('#ocorr-info').textContent = `${(S.historico || []).filter(x => x.origem === 'Ponto crítico').length} ocorrência(s) tratada(s), ${nPend} pendente(s), ${nAlt} alteração(ões) manual(is).`;
    $('#desc-info').textContent = S.descontoPct === null ? `Padrão dos parâmetros: ${(c.bdiPct >= 0 ? (Number(S.regras.valores.desconto.valor) * 100).toFixed(0) : 0)}%` : `Desconto deste orçamento: ${(S.descontoPct * 100).toFixed(1).replace('.0', '')}% = ${fmtR(c.desc)}`;
    // proposta ao cliente
    const cad = S.cadastro;
    const itens = R.propostaItens.map(i => `${i.descricao} - ${String(i.qtd).padStart(2, '0')}`).join('\n');
    const cobertos = S.linhas.filter(x => x.escopo === 'plano');
    const txt = `Nome da empresa: ${cad.empresa}${cad.cnpj ? ' - CNPJ ' + cad.cnpj : ''}
Identificação do serviço a ser prestado:
ELABORAÇÃO - O objeto desta proposta é a realização das avaliações ambientais abaixo, com base nos Anexos da NR 15 da Portaria 3.214/78 do Ministério do Trabalho e no Decreto nº 3.048/99, e a consequente elaboração/atualização do ${S.logistica.tipoLaudo}${planoCobre() ? ' (plano ' + S.plano + ': ' + planoCobre() + ')' : ''}. O serviço será realizado na sede da CONTRATADA.

Descrição das atividades a serem executadas:
${itens || '(nenhuma avaliação adicional)'}
${cobertos.length ? '\nJá cobertas pelo plano ' + S.plano + ' (não cobradas nesta proposta): ' + resumoCobertos(cobertos) : ''}
Cronograma de realização:
O laudo será elaborado a partir da entrega do resultado do laboratório, sendo que a previsão de entrega do documento é de 60 dias após a chegada do resultado.

Preço/Forma de pagamento:
O valor de investimento desta presente proposta equivale-se a quantia de ${fmtR(c.proposta)}. O pagamento será efetuado ao SESI mediante apresentação de contas e boleto bancário, com vencimento para 20 dias após assinatura da proposta.

Responsável: ${S.logistica.responsavel || ''}    Data: ${(S.logistica.data || '').split('-').reverse().join('/')}`;
    $('#texto-proposta').value = txt; $('#texto-proposta-print').textContent = txt;
    const ver = R.linhas.filter(x => x.verificar && x.ativa);
    $('#res-ver').innerHTML = ver.length ? `<b>Confira antes de enviar (${ver.length}):</b><ol>${ver.map(x => `<li>GES ${x.ges} ${x.tipo}: ${esc(x.agente)} <small>${esc(x.obs)}</small></li>`).join('')}</ol>` : '';
    const semPreco = R.linhas.filter(x => x.semPreco && x.ativa);
    if (semPreco.length) {
      const nomes = Array.from(new Set(semPreco.map(x => x.agente || x.fatorOriginal || 'OUTROS')));
      $('#res-ver').innerHTML += `<div class="alerta-forte">Atenção: ${semPreco.length} item(ns) SEM VALOR e fora do preço: ${nomes.map(esc).join('; ')}. Defina o exame, cadastre um novo ou informe valor manual. <button class="mini2" id="btn-res-crit">Abrir pontos críticos</button></div>`;
      const b = $('#btn-res-crit'); if (b) b.addEventListener('click', () => { ir(2); renderCriticos(); $('#painel-crit').classList.add('aberto'); });
    }
    const manuais = R.linhas.filter(x => x.ativa && x.valorManual !== null && x.valorManual !== undefined && x.valorManual !== '');
    if (manuais.length) $('#res-ver').innerHTML += `<div class="tag ver">${manuais.length} item(ns) com valor manual: ${Array.from(new Set(manuais.map(x => (x.agente || x.fatorOriginal) + ' R$ ' + fmt(x.valorManual) + (x.motivoManual ? ' [motivo: ' + x.motivoManual + ']' : ' [SEM MOTIVO REGISTRADO]')))).map(esc).join('; ')}</div>`;
    if (S.gruposExcluidos.length) $('#res-ver').innerHTML += `<div class="alerta-demo">Fora da precificação por decisão: <b>${S.gruposExcluidos.map(g => ROT_GRUPO[g]).join(', ')}</b>. No esboço esses agentes aparecem como não avaliados neste orçamento.</div>`;
    if (S.demo && S.demo.manual && S.resultado) { const pv = S.resultado.custos.proposta, dif = pv - S.demo.manual; $('#res-ver').innerHTML += `<div class="alerta-demo"><b>Laudo teste:</b> ferramenta R$ ${fmt(pv)} x planilha manual R$ ${fmt(S.demo.manual)} (${S.demo.dataManual}), diferença R$ ${fmt(dif)} (${(dif / S.demo.manual * 100).toFixed(1).replace('.', ',')}%). Itens pendentes ainda estão a R$ 0,00 até a validação nos pontos críticos.</div>`; }
  }
  function planoCobre() { const p = S.regras.planos[S.plano]; return p && p.laudos && p.laudos.length ? p.laudos.join(' e ') + ' com os físicos já incluídos' : ''; }
  function resumoCobertos(ls) {
    const m = {};
    for (const l of ls) { const k = l.tipo === 'Avaliação qualitativa' ? l.agente : l.tipo; m[k] = (m[k] || 0) + (l.qtd || 0); }
    return Object.entries(m).map(([k, v]) => `${k} (${v})`).join('; ');
  }

  // ------------------------------------------------------------------ saídas
  function nomeBase() { return 'Precificação - ' + (S.cadastro.empresa || 'empresa').replace(/[\\/:*?"<>|]/g, '').slice(0, 60).trim(); }
  function estadoJSON() {
    return { app: 'Precifica-Fieg', versao: 1, salvoEm: new Date().toISOString(), regrasVersao: S.regras.versao, tabelaExames: S.exames.fonte, vigenciaUsada: S.logistica.vigencia, regrasUsadas: S.regras, cadastro: S.cadastro, plano: S.plano, incluirLP: S.incluirLP, lpSelecao: S.lpSelecao, mineracao: S.mineracao, descontoPct: S.descontoPct, esbocoFiltro: S.esbocoFiltro, unidade: S.unidade, extras: S.extras, logistica: S.logistica, ergo: S.ergo, gruposExcluidos: S.gruposExcluidos, historico: S.historico, pareceres: S.pareceres, motivos: S.motivos, ppr: S.ppr, linhas: S.linhas.map(l => ({ ges: l.ges, nome: l.nome, expostos: l.expostos, tipo: l.tipo, agente: l.agente, qtdAjustada: l.qtdAjustada, valorManual: l.valorManual ?? null, motivoManual: l.motivoManual || null, ionizante: !!l.ionizante, outros: !!l.outros, unidadeCargo: !!l.unidadeCargo, manual: !!l.manual, motivoEscopo: l.motivoEscopo || null, fatorOriginal: l.fatorOriginal, grupo: l.grupo, escopo: l.escopo, escopoManual: !!l.escopoManual, obs: l.obs, verificar: !!l.verificar, fisico: !!l.fisico })), proposta: S.proposta, resultado: S.resultado ? S.resultado.custos : null, pgrResumo: S.pgr ? { cadastro: S.pgr.cadastro, ges: S.pgr.ges, porCargo: S.pgr.porCargo || null, layout: S.pgr.layout, criticos: S.pgr.criticos || [] } : null };
  }
  function carregarJSON(j) {
    if (!j || j.app !== 'Precifica-Fieg') { alert('Arquivo não é um orçamento do Precifica-Fieg.'); return; }
    Object.assign(S.cadastro, j.cadastro || {}); S.plano = j.plano || S.plano; S.incluirLP = !!j.incluirLP; S.lpSelecao = j.lpSelecao || null; S.mineracao = !!j.mineracao; S.descontoPct = j.descontoPct ?? null; S.esbocoFiltro = j.esbocoFiltro || 'tudo'; S.unidade = j.unidade || 'ges'; if (j.extras) { S.extras = { sinonimos: Object.assign({}, S.extras.sinonimos, j.extras.sinonimos || {}), exames: S.extras.exames.concat((j.extras.exames || []).filter(e => !S.extras.exames.some(x => x.nome === e.nome))) }; aplicarExtrasExames(); }
    Object.assign(S.logistica, j.logistica || {}); S.linhas = j.linhas || []; S.proposta = j.proposta || null;
    S.historico = j.historico || []; if (j.ergo) S.ergo = j.ergo; S.gruposExcluidos = j.gruposExcluidos || []; S.pareceres = j.pareceres || {}; S.motivos = j.motivos || {}; if (j.ppr) S.ppr = j.ppr;
    S.pgr = j.pgrResumo ? { cadastro: j.pgrResumo.cadastro, ges: j.pgrResumo.ges, porCargo: j.pgrResumo.porCargo || null, avisos: [], layout: j.pgrResumo.layout, criticos: j.pgrResumo.criticos || [] } : null;
    ir(2);
  }
  function baixar(blob, nome) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  async function gerarExcelBlob() {
    let buf;
    if (window.PRECIFICA_INLINE && window.PRECIFICA_INLINE.modeloB64) {
      const bin = atob(window.PRECIFICA_INLINE.modeloB64); buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); buf = buf.buffer;
    } else { const resp = await fetch('dados/modelo.xlsx'); buf = await resp.arrayBuffer(); }
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Levantamento');
    const c = S.cadastro, L = S.logistica;
    ws.getCell('B3').value = c.empresa || ''; ws.getCell('B4').value = c.cnpj || ''; ws.getCell('B5').value = c.cidade || '';
    ws.getCell('B6').value = Number(L.distancia) || 0; ws.getCell('B7').value = L.pernoite ? 'Sim' : 'Não';
    ws.getCell('B9').value = L.diasAjustado ?? null;
    ws.getCell('F3').value = c.grau === '' ? null : c.grau; ws.getCell('F4').value = c.n_trab === '' ? null : c.n_trab;
    ws.getCell('F5').value = L.responsavel || ''; ws.getCell('F6').value = L.data ? new Date(L.data + 'T00:00:00') : null; ws.getCell('F7').value = L.tipoLaudo || 'LTCAT/LI';
    calcular();
    const Rx = S.resultado;
    let ativas = S.linhas.filter(l => l.escopo !== 'nao' && !S.gruposExcluidos.includes(Motor.grupoLinha(l)));
    // o modelo tem 100 linhas: acima disso, agrupa por tipo + exame (quantidade final calculada vai em "Qtd ajustada")
    if (ativas.length > 100) {
      const grp = {};
      for (const l of Rx.linhas.filter(x => x.escopo !== 'nao')) {
        const k = l.tipo + '|' + (l.agente || l.fatorOriginal || '') + '|' + (l.valorManual ?? '') + '|' + l.escopo;
        if (!grp[k]) grp[k] = { ges: null, nome: 'Vários (' + (S.unidade === 'cargo' ? 'cargos' : 'GES') + ')', expostos: '', tipo: l.tipo, agente: l.agente, valorManual: l.valorManual, escopo: l.escopo, qtdAjustada: 0, obs: '', n: 0 };
        grp[k].qtdAjustada += l.escopo === 'plano' ? 0 : l.qtd; grp[k].n++;
      }
      ativas = Object.values(grp).map(g => Object.assign(g, { obs: 'Agrupado: ' + g.n + ' linha(s) do levantamento' + (g.agente ? '' : ' | ' + g.tipo) }));
    }
    ativas.slice(0, 100).forEach((l, i) => {
      const row = ws.getRow(12 + i);
      row.getCell(2).value = l.ges === '' ? null : l.ges; row.getCell(3).value = l.nome || ''; row.getCell(4).value = l.expostos === '' ? null : l.expostos;
      row.getCell(5).value = l.tipo; row.getCell(6).value = l.agente || null;
      // valor manual ou exame fora da tabela original do modelo: grava o valor unitário direto (a fórmula não o encontraria)
      const itemEx = S.exames.itens.find(e => e.nome === l.agente);
      if (l.valorManual !== null && l.valorManual !== undefined && l.valorManual !== '') row.getCell(10).value = Number(l.valorManual);
      else if (l.tipo === 'Químico (laboratório)' && itemEx && (itemEx.extra || itemEx.manual)) row.getCell(10).value = Number(itemEx[S.logistica.vigencia || 'v2026']);
      row.getCell(8).value = l.escopo === 'plano' ? 0 : (l.qtdAjustada ?? (l.notaRuido ? l.qtd : null));
      row.getCell(14).value = (l.escopo === 'plano' ? 'Coberto pelo plano ' + S.plano + '. ' : '') + (l.valorManual != null && l.valorManual !== '' ? 'VALOR MANUAL R$ ' + fmt(l.valorManual) + '. ' : '') + (l.obs || '') + (l.notaRuido ? ' | ' + l.notaRuido : '');
      row.commit();
    });
    // parâmetros editados na tela vão junto
    const wp = wb.getWorksheet('Parâmetros');
    const ordem = ['diaria_completa', 'meia_diaria', 'refeicao', 'km', 'km_livre_ida_volta', 'dist_diaria_ida', 'hora_engenheiro', 'hora_tst', 'art', 'postagem', 'folha', 'folhas_por_avaliacao', 'lancamento_h_por_av', 'lancamento_h_min', 'revisao_h_eng', 'entrega_h_eng', 'dosimetria_pct', 'dosimetria_limiar', 'qualitativa_varias', 'qualitativa_unica', 'ausencia_valor', 'bdi', 'desconto'];
    ordem.forEach((k, i) => { if (S.regras.valores[k]) wp.getCell('B' + (4 + i)).value = Number(S.regras.valores[k].valor); });
    const tipos = ['Ruído (dosimetria)', 'Calor (IBUTG)', 'Vibração corpo inteiro', 'Vibração mãos e braços', 'Químico (laboratório)', 'Avaliação qualitativa', 'Ausência de risco', 'Periculosidade (por cargo)'];
    tipos.forEach((t, i) => { const tp = S.regras.tipos[t]; if (tp) { wp.getCell('B' + (31 + i)).value = Number(tp.horas); wp.getCell('C' + (31 + i)).value = Number(tp.por_dia); wp.getCell('D' + (31 + i)).value = t === 'Periculosidade (por cargo)' ? Number(S.regras.valores.lp_por_cargo.valor) : Number(tp.fixo); } });
    // quantidades de logística, horas e material calculadas pelo motor (regras atuais) sobrepõem as fórmulas do modelo
    const wpr = wb.getWorksheet('Precificação'); const cx = Rx.custos;
    const put = (ref, val) => { wpr.getCell(ref).value = val; };
    put('H8', cx.c1.diariaQ); put('H9', cx.c1.meiaQ); put('H13', cx.c2.hLevEng); put('H14', cx.c2.hCampo); put('H15', cx.c2.hLanc); put('H16', cx.c2.hRev); put('H17', cx.c2.hEnt);
    { const q = (Rx.secao4 || []).find(x => x.tipo === 'Avaliação qualitativa'); if (q && q.detalhe) { put('R19', 'Avaliação qualitativa: ' + q.detalhe); wpr.getCell('R19').alignment = { wrapText: true, vertical: 'middle' }; } }
    put('H35', cx.c5.kmQ); put('H36', cx.c5.refQ); put('AC9', cx.c6.postQ); put('AC10', cx.c6.folhas);
    ws.getCell('B7').value = Rx.logistica.modo === 'pernoite' ? 'Sim' : 'Não'; ws.getCell('B9').value = Rx.dias;
    wb.calcProperties.fullCalcOnLoad = true;
    const out = await wb.xlsx.writeBuffer();
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function ligarResultado() {
    $('#btn-desc').addEventListener('click', () => { const v = $('#desc-pct').value; S.descontoPct = v === '' ? null : Number(v) / 100; Ocorrencias.registrar(S, { origem: 'Resultado', acao: 'Desconto aplicado: ' + (v === '' ? 'nenhum' : v + '%') }); renderResultado(); });
    $('#btn-post').addEventListener('click', () => {
      const v = $('#post-aj').value, mot = $('#post-motivo').value.trim();
      if (v === '') { S.logistica.postagensAjustado = null; renderResultado(); return; }
      if (!mot) { $('#post-motivo').style.borderColor = '#C00000'; $('#post-info').textContent = 'Informe o motivo para registrar.'; return; }
      const antes = S.resultado ? S.resultado.custos.c6.postQ : '';
      S.logistica.postagensAjustado = Math.max(0, Math.round(Number(v))); S.logistica.motivoPostagens = mot;
      Ocorrencias.registrar(S, { origem: 'Resultado', acao: `Postagens para amostra de ${antes} para ${S.logistica.postagensAjustado}`, detalhe: 'motivo: ' + mot });
      renderResultado();
    });
    $('#btn-post-auto').addEventListener('click', () => { if (S.logistica.postagensAjustado != null) Ocorrencias.registrar(S, { origem: 'Resultado', acao: 'Postagens voltaram ao cálculo automático' }); S.logistica.postagensAjustado = null; S.logistica.motivoPostagens = ''; renderResultado(); });
    $('#btn-ocorr').addEventListener('click', abrirOcorrencias);
    $('#btn-ocorr-fechar').addEventListener('click', () => $('#painel-ocorr').classList.remove('aberto'));
    $('#btn-ocorr-baixar').addEventListener('click', () => baixar(new Blob([relatorioOcorrenciasHTML()], { type: 'text/html' }), nomeRelOcorr()));
    $('#btn-ocorr-ver').addEventListener('click', () => { const w = window.open('', '_blank'); if (w) { w.document.write(relatorioOcorrenciasHTML()); w.document.close(); setTimeout(() => w.print(), 400); } });
    $('#btn-desc-limpar').addEventListener('click', () => { S.descontoPct = null; renderResultado(); });
    $('#btn-excel').addEventListener('click', async () => { try { baixar(await gerarExcelBlob(), nomeBase() + '.xlsx'); } catch (e) { alert('Erro ao gerar Excel: ' + e.message); } });
    $('#btn-json').addEventListener('click', () => baixar(new Blob([JSON.stringify(estadoJSON(), null, 1)], { type: 'application/json' }), nomeBase() + '.json'));
    $('#btn-print').addEventListener('click', imprimirResultado);
    $('#texto-proposta').addEventListener('input', () => { $('#texto-proposta-print').textContent = $('#texto-proposta').value; });
    $('#btn-copiar').addEventListener('click', () => { navigator.clipboard.writeText($('#texto-proposta').value); $('#btn-copiar').textContent = 'Copiado'; setTimeout(() => $('#btn-copiar').textContent = 'Copiar texto', 1500); });
    $('#btn-drive').addEventListener('click', salvarDrive);
    $('#btn-pasta').addEventListener('click', salvarPasta);
    $('#btn-pasta-trocar').addEventListener('click', async () => { try { const h = await PastaLocal.escolherPasta(); $('#status-pasta').textContent = 'Pasta escolhida: ' + h.name; } catch (e) { if (e.name !== 'AbortError') $('#status-pasta').textContent = e.message; } });
    if (!PastaLocal.suportado()) { $('#btn-pasta').classList.add('off'); $('#btn-pasta').title = 'Precisa de Chrome ou Edge'; }
    PastaLocal.nomeRaiz().then(n => { if (n) $('#status-pasta').textContent = 'Pasta lembrada: ' + n; });
    if (!S.config.googleClientId) { $('#btn-drive').title = 'Configure googleClientId em dados/config.json para salvar no Drive'; $('#btn-drive').classList.add('off'); }
  }
  // documento de impressão do resultado: cabeçalho, resumo, planilha de custos (quebra só entre linhas) e texto da proposta
  function resultadoHTML() {
    if (!S.resultado) renderResultado();
    const c = S.cadastro, L = S.logistica, R = S.resultado, cu = R.custos;
    const pend = R.linhas.filter(l => l.ativa && l.semPreco);
    const dt = L.data ? L.data.split('-').reverse().join('/') : '';
    let h = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Precificação - ${esc(c.empresa || '')}</title><style>
@page{size:A4;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#1c2430;margin:0}
h1{font-size:16px;color:#002E7F;margin:0 0 2px}h2{font-size:13px;color:#002E7F;margin:14px 0 6px;page-break-after:avoid;break-after:avoid}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #b9c2cf;padding:3px 6px;text-align:left;vertical-align:top}
thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}.num{text-align:right}
table.custos th{background:#eef2f7;font-size:10.5px}table.custos td{font-size:10.5px}table.custos tr.sub td{background:#fff8cc;font-weight:bold}table.custos tr.tot td{background:#dbe9f6;font-weight:bold}
.cab td{border:1px solid #d6dbe3}.cab b{color:#002E7F}.res{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.res div{border:1px solid #d6dbe3;border-radius:5px;padding:5px 9px;background:#f3f5f8}.res b{display:block;font-size:14px;color:#002E7F}
.prop{white-space:pre-wrap;border:1px solid #d6dbe3;padding:8px 10px;font-size:11px;line-height:1.45}.alerta{border:1px solid #e89a9a;background:#ffe0e0;padding:5px 8px;margin:6px 0}
.ass{margin-top:36px;text-align:center;page-break-inside:avoid}small{color:#667}</style></head><body>`;
    h += `<h1>SESI - DR/GOIÁS - Planilha de Custos: ${esc(L.tipoLaudo || 'LTCAT/LI')}</h1><small>Precifica-Fieg | regras ${esc(S.regras.versao || '')} | tabela de exames ${esc(L.vigencia || '')}</small>`;
    h += `<table class="cab" style="margin-top:8px"><tr><td colspan="2"><b>Empresa:</b> ${esc(c.empresa || '')}${c.cnpj ? ' | CNPJ ' + esc(c.cnpj) : ''}</td><td><b>Local:</b> ${esc(c.cidade || '')}</td></tr>
<tr><td><b>Grau de risco:</b> ${esc(c.grau || '')}</td><td><b>Nº de empregados:</b> ${esc(c.n_trab || '')}</td><td><b>Plano:</b> ${esc(S.plano || '')}</td></tr>
<tr><td><b>Responsável:</b> ${esc(L.responsavel || '')}</td><td><b>Data:</b> ${esc(dt)}</td><td><b>Distância (ida):</b> ${esc(L.distancia || 0)} km</td></tr></table>`;
    h += `<div class="res"><div><b>R$ ${fmt(cu.proposta)}</b>valor da proposta</div><div><b>${R.totalAv}</b>avaliações</div><div><b>${R.dias}</b>dias em campo</div><div><b>${R.horasCampo}</b>horas TST em campo</div><div><b>${R.logistica.modo === 'pernoite' ? 'Pernoite' : 'Ida e volta diária'}</b>${R.logistica.viagens} viagem(ns)</div><div><b>${cu.c6.postQ}</b>postagens${cu.c6.postQ !== cu.c6.postAuto ? ' (ajustado)' : ''}</div></div>`;
    if (pend.length) h += `<div class="alerta"><b>Atenção:</b> ${pend.length} item(ns) sem valor e fora do preço: ${Array.from(new Set(pend.map(l => l.fatorOriginal || l.agente || l.tipo))).map(esc).join('; ')}.</div>`;
    h += `<h2>Planilha de custos (layout SESI)</h2>${$('#planilha-custos').innerHTML.replace(/<thead>/g, '<tbody>').replace(/<\/thead>/g, '</tbody>').replace(/<a [^>]*>|<\/a>/g, '')}`;
    h += `<h2>Proposta ao cliente (texto para o FO-021)</h2><div class="prop">${esc($('#texto-proposta').value)}</div>`;
    h += `<div class="ass">_______________________________________<br><b>${esc(L.responsavel || 'Responsável pela precificação')}</b><br>Central de SST SESI Goiás</div>`;
    return h + `<p><small>Gerado em ${new Date().toLocaleString('pt-BR')} pelo Precifica-Fieg.</small></p></body></html>`;
  }
  function imprimirResultado() {
    const html = resultadoHTML();
    const w = window.open('', '_blank');
    if (!w) { baixar(new Blob([html], { type: 'text/html' }), 'Precificação - ' + (S.cadastro.empresa || 'empresa').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.html'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  }
  function esbocoHTML() {
    if (!$('#esboco').innerHTML) renderEsboco();
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Esboço - ${esc(S.cadastro.empresa || '')}</title><style>body{font-family:Arial;font-size:12px;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:3px 6px}th{background:#eee}.num{text-align:right}.esb-ges{margin:10px 0;page-break-inside:avoid}.esb-nc{color:#900}.esb-fora{color:#777}h3,h4{color:#002E7F}</style></head><body>${$('#esboco').innerHTML}</body></html>`;
  }
  // ------------------------------------------------------------------ relatório técnico de ocorrências
  function precoTabelaLinha(l) { if (l.tipo === 'Químico (laboratório)') return Motor.precoExame(S.exames, l.agente, S.logistica.vigencia); if (l.tipo === 'Avaliação qualitativa') return S.regras.valores.qualitativa_varias.valor; const tp = S.regras.tipos[l.tipo]; return tp && tp.fixo ? tp.fixo : null; }
  function nomeRelOcorr() { return 'Relatório de Ocorrências - ' + (S.cadastro.empresa || 'empresa').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.html'; }
  function relatorioOcorrenciasHTML() { if (!S.resultado) calcular(); return Ocorrencias.html({ S, R: S.resultado, pontos: pontosCriticos(), precoTabela: precoTabelaLinha }); }
  function abrirOcorrencias() {
    calcular();
    const pend = pontosCriticos().filter(p => p.acao !== 'info');
    const alts = Ocorrencias.alteracoes(S, S.resultado, precoTabelaLinha);
    const trat = (S.historico || []).filter(h => h.origem === 'Ponto crítico');
    let h = `<p><b>${trat.length}</b> ocorrência(s) tratada(s), <b>${pend.length}</b> pendente(s), <b>${alts.length}</b> alteração(ões) manual(is).</p>`;
    h += '<h4>Ocorrências pendentes: parecer (por que não adotamos)</h4>';
    if (!pend.length) h += '<p><small>Nenhuma pendente.</small></p>';
    h += '<table class="param pend-ocorr">' + pend.map((p, i) => `<tr><td style="width:28px">${i + 1}</td><td style="width:210px"><b>${esc(p.tipo)}</b><br>${esc(p.agente)}<br><small>${p.ges.size > 4 ? p.ges.size + ' GES' : esc(Array.from(p.ges).join(', '))}</small></td><td><textarea data-par="${i}">${esc(S.pareceres[Ocorrencias.chavePonto(p)] || Ocorrencias.parecerPadrao(p))}</textarea></td></tr>`).join('') + '</table>';
    h += '<h4>Alterações manuais: motivo</h4>';
    if (!alts.length) h += '<p><small>Nenhuma alteração em relação às regras.</small></p>';
    h += '<table class="param">' + alts.map((a, i) => `<tr><td style="width:28px">${i + 1}</td><td style="width:260px">${esc(a.onde)}<br><b>${esc(a.oque)}</b><br><small>${esc(a.de)} para ${esc(a.para)}</small></td><td>${a.chave.startsWith('valor|') || a.chave === 'postagens' ? `<small>${esc(a.motivo || 'motivo não registrado')}</small>` : `<input data-mot="${esc(a.chave)}" value="${esc(a.motivo)}" placeholder="motivo da alteração" style="width:100%">`}</td></tr>`).join('') + '</table>';
    h += '<h4>Ocorrências tratadas</h4><ol>' + trat.map(t => `<li><b>${esc(t.ocorrencia)}</b>: ${esc(t.agente || '')} <small>(${esc(t.ges || '')})</small><br>${esc(t.acao)} <small>${esc(t.detalhe || '')} | ${esc(t.responsavel)}, ${esc(t.quando)}</small></li>`).join('') + '</ol>';
    const el = $('#ocorr-lista'); el.innerHTML = h;
    el.querySelectorAll('[data-par]').forEach(t => t.addEventListener('change', () => { S.pareceres[Ocorrencias.chavePonto(pend[Number(t.dataset.par)])] = t.value; }));
    el.querySelectorAll('[data-mot]').forEach(t => t.addEventListener('change', () => { S.motivos[t.dataset.mot] = t.value.trim(); }));
    $('#painel-ocorr').classList.add('aberto');
  }
  async function arquivosDoOrcamento() {
    const excel = await gerarExcelBlob();
    const base = nomeBase();
    return [
      [base + '.xlsx', excel],
      [base + '.json', new Blob([JSON.stringify(estadoJSON(), null, 1)], { type: 'application/json' })],
      ['Esboço - ' + (S.cadastro.empresa || 'empresa').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.html', new Blob([esbocoHTML()], { type: 'text/html' })],
      [nomeRelOcorr(), new Blob([relatorioOcorrenciasHTML()], { type: 'text/html' })],
      ['Proposta - ' + (S.cadastro.empresa || 'empresa').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.txt', new Blob([$('#texto-proposta').value], { type: 'text/plain' })]
    ];
  }
  async function salvarPasta() {
    const st = $('#status-pasta');
    if (!PastaLocal.suportado()) { st.textContent = 'Salvar em pasta só funciona no Chrome ou Edge.'; return; }
    try {
      st.textContent = 'Preparando arquivos...';
      const arqs = await arquivosDoOrcamento();
      const cliente = (S.cadastro.cnpj ? S.cadastro.cnpj.replace(/\D/g, '').slice(0, 8) + ' - ' : '') + (S.cadastro.empresa || 'cliente');
      const r = await PastaLocal.salvarCliente(cliente, arqs, m => st.textContent = m);
      st.innerHTML = `Salvo em <b>${esc(r.raiz)} / ${esc(r.pasta)}</b>: ${r.arquivos.map(esc).join(', ')}`;
    } catch (e) { st.textContent = e.name === 'AbortError' ? 'Cancelado.' : 'Erro ao salvar na pasta: ' + e.message; }
  }
  async function salvarDrive() {
    if (!S.config.googleClientId) { alert('Para salvar no Google Drive, informe o "googleClientId" em dados/config.json (veja o LEIA-ME). Por enquanto, use "Baixar Excel" e "Baixar JSON".'); return; }
    const st = $('#status-drive'); st.textContent = 'Conectando ao Drive...';
    try {
      const arqs = await arquivosDoOrcamento();
      const cliente = (S.cadastro.cnpj ? S.cadastro.cnpj.replace(/\D/g, '').slice(0, 8) + ' - ' : '') + (S.cadastro.empresa || 'cliente');
      const r = await Drive.salvar(S.config, S.config.drivePasta || 'Precifica-Fieg', arqs, m => st.textContent = m, cliente);
      st.innerHTML = 'Salvo no Drive: ' + r.map(x => `<a href="${x.link}" target="_blank">${esc(x.nome)}</a>`).join(', ');
    } catch (e) { st.textContent = 'Erro ao salvar no Drive: ' + e.message; }
  }

  // ------------------------------------------------------------------ parâmetros (painel)
  function renderParametros() {
    const el = $('#param-lista'); let h = '<table class="param"><tr><th>Parâmetro</th><th>Valor</th><th></th></tr>';
    for (const [k, p] of Object.entries(S.regras.valores)) {
      const pct = p.formato === 'pct';
      h += `<tr><td>${p.rotulo}${p.obs ? `<br><small>${p.obs}</small>` : ''}</td><td><input data-param="${k}" type="number" step="any" value="${pct ? +(p.valor * 100).toFixed(4) : p.valor}">${pct ? ' %' : ''}</td><td>${p.pendente ? '<span class="tag ver">pendente</span>' : ''}</td></tr>`;
    }
    h += '</table><h4>Tipos de avaliação</h4><table class="param"><tr><th>Tipo</th><th>Horas TST / avaliação</th><th>Avaliações por dia</th><th>Valor fixo (R$)</th></tr>';
    for (const [t, tp] of Object.entries(S.regras.tipos)) {
      h += `<tr><td>${t}${tp.pendente ? ' <span class="tag ver">pendente: ' + tp.pendente + '</span>' : ''}<br><small>${tp.regra}</small></td><td><input data-tipo="${t}" data-c="horas" type="number" step="any" value="${tp.horas}"></td><td><input data-tipo="${t}" data-c="por_dia" type="number" step="any" value="${tp.por_dia}"></td><td><input data-tipo="${t}" data-c="fixo" type="number" step="any" value="${tp.fixo}"></td></tr>`;
    }
    h += '</table><h4>Base complementar (incluída por você)</h4>';
    h += `<p><small>${Object.keys(S.extras.sinonimos).length} sinônimos e ${S.extras.exames.length} exames novos.</small></p>`;
    if (Object.keys(S.extras.sinonimos).length) h += '<table class="param"><tr><th>Nome no PGR</th><th>Exame da base</th><th></th></tr>' + Object.entries(S.extras.sinonimos).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td><td><button class="mini" data-del-sin="${esc(k)}">x</button></td></tr>`).join('') + '</table>';
    if (S.extras.exames.length) h += '<table class="param"><tr><th>Exame novo</th><th>Valor (R$)</th><th></th></tr>' + S.extras.exames.map((e, i) => `<tr><td>${esc(e.nome)}</td><td>${fmt(e.valor)}</td><td><button class="mini" data-del-ex="${i}">x</button></td></tr>`).join('') + '</table>';
    h += '<h4>Pendências de definição</h4><ol>' + (S.regras.pendentes_resumo || []).map(x => `<li>${x}</li>`).join('') + '</ol>';
    el.innerHTML = h;
    el.querySelectorAll('[data-param]').forEach(i => i.addEventListener('change', () => { const p = S.regras.valores[i.dataset.param]; p.valor = p.formato === 'pct' ? Number(i.value) / 100 : Number(i.value); salvarRegrasLocal(); }));
    el.querySelectorAll('[data-tipo]').forEach(i => i.addEventListener('change', () => { S.regras.tipos[i.dataset.tipo][i.dataset.c] = Number(i.value); salvarRegrasLocal(); }));
    el.querySelectorAll('[data-del-sin]').forEach(b => b.addEventListener('click', () => { delete S.extras.sinonimos[b.dataset.delSin]; salvarExtras(); renderParametros(); }));
    el.querySelectorAll('[data-del-ex]').forEach(b => b.addEventListener('click', () => { const e = S.extras.exames.splice(Number(b.dataset.delEx), 1)[0]; S.exames.itens = S.exames.itens.filter(x => !(x.extra && x.nome === e.nome)); salvarExtras(); renderParametros(); }));
  }
  function salvarRegrasLocal() { try { localStorage.setItem('precifica.regras', JSON.stringify(S.regras)); $('#aviso-regras-locais').hidden = false; } catch (_) { /* ignora */ } }
  function ligarParametros() {
    $('#btn-param').addEventListener('click', () => { renderParametros(); $('#painel-param').classList.add('aberto'); });
    $('#btn-fechar-param').addEventListener('click', () => { $('#painel-param').classList.remove('aberto'); if (S.passo === 5) renderResultado(); });
    $('#btn-param-xlsx').addEventListener('click', async () => { try { baixar(await ParametrosXLSX.exportar(S.regras, S.exames, PPR, Ergonomia), 'Parâmetros Precifica - regras ' + (S.regras.versao || '') + '.xlsx'); } catch (e) { alert('Erro ao gerar a planilha: ' + e.message); } });
    $('#btn-param-xlsx-imp').addEventListener('click', () => $('#file-param-xlsx').click());
    $('#file-param-xlsx').addEventListener('change', async () => {
      const f = $('#file-param-xlsx').files[0]; if (!f) return;
      try {
        const r = await ParametrosXLSX.importar(await f.arrayBuffer(), S.regras, S.exames, PPR, Ergonomia);
        S.regras = r.regras; salvarRegrasLocal(); S.regrasLocais = true;
        S.exames = r.exames; try { localStorage.setItem('precifica.exames', JSON.stringify(Object.assign({}, S.exames, { itens: S.exames.itens.filter(x => !x.extra) }))); } catch (_) { /* ignora */ }
        Ocorrencias.registrar(S, { origem: 'Parâmetros', acao: `Planilha de parâmetros importada (${f.name}): ${r.n} alteração(ões)`, detalhe: r.log.slice(0, 30).join('; ') });
        $('#param-imp-log').innerHTML = `<div class="${r.n ? 'alerta-demo' : 'aviso'}"><b>${r.n} alteração(ões) importada(s)</b> de ${esc(f.name)}.${r.log.length ? '<ul style="margin:4px 0 0 18px">' + r.log.slice(0, 40).map(x => `<li>${esc(x)}</li>`).join('') + (r.log.length > 40 ? '<li>...</li>' : '') + '</ul>' : ''}</div>`;
        $('#lista-exames').innerHTML = S.exames.itens.map(e => `<option value="${esc(e.nome)}">`).join('');
        renderParametros();
      } catch (e) { $('#param-imp-log').innerHTML = `<div class="alerta-forte">Não foi possível importar: ${esc(e.message)}</div>`; }
      $('#file-param-xlsx').value = '';
    });
    $('#btn-param-baixar').addEventListener('click', () => baixar(new Blob([JSON.stringify(S.regras, null, 1)], { type: 'application/json' }), 'regras.json'));
    $('#btn-param-reset').addEventListener('click', async () => { localStorage.removeItem('precifica.regras'); localStorage.removeItem('precifica.exames'); if (window.PRECIFICA_INLINE) S.exames = JSON.parse(JSON.stringify(window.PRECIFICA_INLINE.exames)); else S.exames = await fetch('dados/exames.json').then(x => x.json()); aplicarExtrasExames(); S.regras = window.PRECIFICA_INLINE ? JSON.parse(JSON.stringify(window.PRECIFICA_INLINE.regras)) : await fetch('dados/regras.json').then(x => x.json()); S.regrasLocais = false; S.examesLocais = false; $('#aviso-regras-locais').hidden = true; renderParametros(); });
    $('#file-param').addEventListener('change', async () => { const f = $('#file-param').files[0]; if (f) { S.regras = JSON.parse(await f.text()); salvarRegrasLocal(); renderParametros(); } });
    $('#btn-param-abrir').addEventListener('click', () => $('#file-param').click());
    $('#btn-extras-baixar').addEventListener('click', () => baixar(new Blob([JSON.stringify(S.extras, null, 1)], { type: 'application/json' }), 'extras.json'));
    $('#btn-extras-abrir').addEventListener('click', () => $('#file-extras').click());
    $('#file-extras').addEventListener('change', async () => { const f = $('#file-extras').files[0]; if (f) { const j = JSON.parse(await f.text()); S.extras = { sinonimos: Object.assign({}, S.extras.sinonimos, j.sinonimos || {}), exames: S.extras.exames.concat((j.exames || []).filter(e => !S.extras.exames.some(x => x.nome === e.nome))) }; aplicarExtrasExames(); salvarExtras(); renderParametros(); } });
  }

  // ------------------------------------------------------------------ passo 6: esboço interno de medições
  function renderEsboco() {
    calcular(); renderRegraRuido();
    Object.entries(T_().filtro).forEach(([k, t]) => { const o = $(`#esb-filtro option[value="${k}"]`); if (o) o.textContent = t; });
    const R = S.resultadoTotal; const f = S.esbocoFiltro;
    $('#esb-filtro').value = f;
    const incl = l => l.tipo !== 'Ausência de risco' && l.tipo !== 'Periculosidade (por cargo)' && l.escopo !== 'nao' && l.qtd > 0 && (f === 'tudo' || (f === 'plano' && l.escopo === 'plano') || (f === 'adicional' && l.escopo === 'cobrar'));
    const linhas = R.linhas.filter(incl);
    const naoContratadas = R.linhas.filter(l => l.tipo !== 'Ausência de risco' && l.tipo !== 'Periculosidade (por cargo)' && l.escopo === 'nao');
    const c = S.cadastro, pl = S.regras.planos[S.plano] || {};
    const pad = n => String(n).padStart(2, '0');
    const rotulo = l => l.tipo === 'Químico (laboratório)' ? l.agente : l.tipo === 'Avaliação qualitativa' ? l.agente + ' (qualitativa)' : l.tipo === 'Ruído (dosimetria)' ? 'Ruído (dosimetria)' : l.tipo === 'Calor (IBUTG)' ? 'Calor (IBUTG)' : l.tipo === 'Vibração corpo inteiro' ? 'Vibração VCI' : l.tipo === 'Vibração mãos e braços' ? 'Vibração VMB' : l.tipo;
    // resumo por risco
    const porRisco = {};
    for (const l of linhas) { const k = l.tipo === 'Químico (laboratório)' ? 'Químico: ' + l.agente : l.tipo === 'Avaliação qualitativa' ? 'Qualitativa: ' + l.agente : rotulo(l); porRisco[k] = porRisco[k] || { ges: new Set(), qtd: 0, porGes: {} }; porRisco[k].ges.add(l.ges); porRisco[k].qtd += l.qtd; porRisco[k].porGes[l.ges] = (porRisco[k].porGes[l.ges] || 0) + l.qtd; }
    let h = `<div class="esb"><h3 class="esb-t">${esc(c.empresa || '')}</h3><p><b>CNPJ:</b> ${esc(c.cnpj || '')} &nbsp; <b>Cidade:</b> ${esc(c.cidade || '')} &nbsp; <b>Plano:</b> ${esc(S.plano)}${pl.laudos && pl.laudos.length ? ' (' + pl.laudos.join('/') + ')' : ''} &nbsp; <b>Proposta:</b> ${esc(S.proposta && S.proposta.numero ? S.proposta.numero : 'não informada')}</p>`;
    h += `<p><b>Escopo deste esboço:</b> ${T_().escopoTxt[f]}. Ruído por GES = ${textoRegraRuido()}; demais físicos 1 por GES; químicos 1 amostrador por GES${S.mineracao ? '; poeira mineral ' + S.regras.valores.nr22_medicoes_poeira.valor + ' por GES (NR-22)' : ''}.</p>`;
    // resumo: uma linha por GES dentro de cada risco, GES em ordem crescente, com subtotal por risco
    const nGes = g => { const n = Number(g); return isNaN(n) ? Infinity : n; };
    h += '<table class="custos"><thead><tr><th>Item</th><th>Risco / agente</th><th>GES</th><th>QTD</th><th>Realizada</th><th>Observação</th></tr></thead><tbody>';
    let it = 0;
    for (const [k, v] of Object.entries(porRisco)) {
      const gs = Object.keys(v.porGes).sort((a, b) => nGes(a) - nGes(b) || String(a).localeCompare(String(b)));
      for (const g of gs) h += `<tr><td>${++it}</td><td>${esc(k)}</td><td>${esc(g)}</td><td class="num">${pad(v.porGes[g])}</td><td></td><td></td></tr>`;
      h += `<tr class="sub"><td></td><td>Subtotal ${esc(k)}</td><td>${v.ges.size} GES</td><td class="num">${pad(v.qtd)}</td><td></td><td></td></tr>`;
    }
    h += `<tr class="tot"><td></td><td>Total de medições</td><td>${new Set(linhas.map(l => l.ges)).size} GES</td><td class="num">${pad(linhas.reduce((s, l) => s + l.qtd, 0))}</td><td></td><td></td></tr></tbody></table>`;
    h += '<h4 class="esb-t">Relação analítica de medições por GES</h4>';
    const gesOrd = Array.from(new Set(R.linhas.map(chaveUnidade))).sort((x, y) => (Number(String(x).split('|')[0]) || 0) - (Number(String(y).split('|')[0]) || 0));
    for (const gk of gesOrd) {
      const ls = R.linhas.filter(l => chaveUnidade(l) === gk); const l0 = ls[0]; const g = l0.ges;
      const gPgr = S.pgr && S.pgr.ges.find(x => String(x.codigo) === String(g));
      const funcoes = l0.unidadeCargo ? l0.nome : (gPgr ? gPgr.cargos.join('; ') : '');
      h += `<div class="esb-ges"><b>${l0.unidadeCargo ? 'GHE ' + esc(g || 's/n') + ' - Cargo: ' : 'GES ' + esc(g) + ' - '}${esc(l0.nome || '')}</b><br><b>Funções:</b> ${esc(funcoes) || '<i>não informadas</i>'}<br><b>Colaboradores:</b> ${l0.expostos ?? '?'}<br><b>Riscos / Medições:</b>`;
      const med = ls.filter(incl); const nc = ls.filter(l => l.escopo === 'nao' && l.tipo !== 'Ausência de risco' && l.tipo !== 'Periculosidade (por cargo)');
      const outros = ls.filter(l => !incl(l) && l.escopo !== 'nao' && l.tipo !== 'Ausência de risco' && l.tipo !== 'Periculosidade (por cargo)' && l.qtd > 0);
      if (!med.length && !nc.length && !outros.length && !ls.some(x => x.notaRuido && x.qtd === 0)) h += ' Ausência de riscos físicos, químicos e biológicos';
      h += '<ul>';
      for (const l of med) h += `<li>${pad(l.qtd)} - ${esc(rotulo(l))}${S.plano !== 'Sem plano / avulso' && l.escopo === 'cobrar' ? ' <small>(' + T_().notaFora + ')</small>' : ''}</li>`;
      for (const l of outros) h += `<li class="esb-fora">${pad(l.qtd)} - ${esc(rotulo(l))} <small>(fora do escopo deste esboço: ${l.escopo === 'plano' ? T_().kpiPlano : T_().kpiCobrar})</small></li>`;
      for (const l of ls.filter(x => x.tipo === 'Ruído (dosimetria)' && x.qtd === 0 && x.notaRuido && x.escopo !== 'nao')) h += `<li class="esb-fora">00 - Ruído (dosimetria): representado pela amostragem do GHE ${esc(g)} <small>(${esc(l.notaRuido)})</small></li>`;
      for (const l of nc) h += `<li class="esb-nc">01 - ${esc(rotulo(l))} - ${l.grupoExcluido ? 'NÃO AVALIADO NESTE ORÇAMENTO (grupo desmarcado)' : 'NÃO CONTRATADA'}</li>`;
      h += '</ul></div>';
    }
    h += `<p><b>Contratado (escopo deste esboço):</b> ${pad(linhas.reduce((s, l) => s + l.qtd, 0))} medições em ${new Set(linhas.map(l => l.ges)).size} GES.${naoContratadas.length ? ' <b>Não contratados:</b> ' + naoContratadas.length + ' agentes.' : ''} Gerado em ${new Date().toLocaleDateString('pt-BR')}.</p></div>`;
    $('#esboco').innerHTML = h;
  }
  function textoEsboco() { return $('#esboco').innerText; }
  function ligarEsboco() {
    $('#esb-filtro').addEventListener('change', () => { S.esbocoFiltro = $('#esb-filtro').value; renderEsboco(); });
    $('#btn-esb-copiar').addEventListener('click', () => { navigator.clipboard.writeText(textoEsboco()).then(() => { $('#btn-esb-copiar').textContent = 'Copiado'; setTimeout(() => $('#btn-esb-copiar').textContent = 'Copiar texto', 1500); }).catch(() => {}); });
    $('#btn-esb-print').addEventListener('click', () => window.print());
    $('#btn-esb-baixar').addEventListener('click', () => {
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Esboço - ${esc(S.cadastro.empresa || '')}</title><style>body{font-family:Arial;font-size:12px;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:3px 6px}th{background:#eee}.num{text-align:right}.esb-ges{margin:10px 0;page-break-inside:avoid}.esb-nc{color:#900}.esb-fora{color:#777}h3,h4{color:#002E7F}</style></head><body>${$('#esboco').innerHTML}</body></html>`;
      baixar(new Blob([html], { type: 'text/html' }), 'Esboço - ' + (S.cadastro.empresa || 'empresa').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.html');
    });
  }

  // ------------------------------------------------------------------ navegação
  // ------------------------------------------------------------------ menu de módulos
  const MODULOS = {
    esboco: { sub: 'Esboço de medição a partir do PGR (sem preço)', passos: [1, 2, 3, 6], rot: { 6: ['4. Esboço', 'medições por GES'] } },
    ltcat: { sub: 'Precificação de LTCAT, LI e LP a partir do PGR e da proposta', passos: [1, 2, 3, 4, 5, 6], rot: { 6: ['6. Esboço', 'medições por GES (interno)'] } },
    ppr: { sub: 'Precificação do PPR (Programa de Proteção Respiratória)' },
    metodos: { sub: 'Pesquisa no guia de métodos do laboratório' },
    aep: { sub: 'Precificação da AEP (Análise Ergonômica Preliminar)' },
    aet: { sub: 'Precificação da AET (Análise Ergonômica do Trabalho)' },
    frp: { sub: 'Precificação do FRP (Fatores de Risco Psicossociais)' }
  };
  let pprUI = null, metUI = null, ergoUI = null;
  function irModulo(m) {
    S.modulo = m; const M = MODULOS[m];
    $$('#menu [data-modulo]').forEach(b => b.classList.toggle('ativo', b.dataset.modulo === m));
    $('#sub-modulo').textContent = M.sub;
    const ERGO = ['aep', 'aet', 'frp'];
    $('#mod-ppr').hidden = m !== 'ppr'; $('#mod-metodos').hidden = m !== 'metodos'; $('#mod-ergo').hidden = !ERGO.includes(m);
    if (m === 'ppr' || m === 'metodos' || ERGO.includes(m)) { $('.stepper').hidden = true; $$('.passo').forEach(p => p.hidden = true); if (m === 'ppr') pprUI.render(); else if (m === 'metodos') metUI.render(); else ergoUI.abrir(m); window.scrollTo(0, 0); return; }
    $('.stepper').hidden = false;
    $$('.stepper li').forEach(li => { const n = Number(li.dataset.passo); li.hidden = !M.passos.includes(n); if (M.rot[n]) li.innerHTML = `<b>${M.rot[n][0]}</b>${M.rot[n][1]}`; });
    const esb = m === 'esboco';
    document.body.classList.toggle('mod-esboco', esb);
    $('#h2-esboco').textContent = esb ? '4. Esboço de medição' : '6. Esboço interno de medições';
    $('#stp3-sub').textContent = T_().stp3; $('#btn-tudo-cobrar').textContent = T_().btnTudo; $('#escopo-ajuda').textContent = T_().ajuda;
    $$('section.passo[data-passo="3"] [data-ir="4"]').forEach(b => b.textContent = esb ? 'Avançar: esboço' : 'Avançar: logística');
    $$('section.passo[data-passo="6"] [data-ir="5"]').forEach(b => b.textContent = esb ? 'Voltar ao escopo' : 'Voltar ao resultado');
    ir(M.passos.includes(S.passo) ? S.passo : 1);
  }
  let moduloAnterior = 'ltcat';
  function abrirGuia(termo) {
    moduloAnterior = S.modulo;
    const q = String(termo || '').replace(/^outros\b/i, '').replace(/\(.*$/, '').replace(/[;:,]+$/, '').trim();
    irModulo('metodos'); metUI.buscar(q);
  }
  function amostraDoLevantamento(bdi) {
    const ls = S.linhas.filter(l => l.tipo === 'Químico (laboratório)' && l.escopo !== 'nao' && (l.agente || (l.valorManual !== null && l.valorManual !== undefined && l.valorManual !== ''))).map(l => Object.assign({}, l, { escopo: 'cobrar' }));
    if (!ls.length) return null;
    const regras = JSON.parse(JSON.stringify(S.regras)); regras.valores.bdi.valor = bdi; if (regras.valores.desconto) regras.valores.desconto.valor = 0;
    const R = Motor.calcular({ linhas: ls, logistica: Object.assign({}, S.logistica, { postagensAjustado: null }), regras, exames: S.exames, vigencia: S.logistica.vigencia, mineracao: S.mineracao, descontoPct: 0 }, 'adicional');
    const nAg = new Set(ls.map(l => l.agente)).size;
    return { valor: R.custos.proposta, info: `Calculado pelo levantamento: ${R.totalAv} amostra(s) de ${nAg} agente(s) químico(s), ${R.dias} dia(s) de campo, custo R$ ${fmt(R.custos.total)} + BDI ${(bdi * 100).toFixed(0)}% = R$ ${fmt(R.custos.proposta)}.` };
  }
  function ir(n) {
    if (S.modulo === 'esboco') { if (n === 4) n = 6; else if (n === 5) n = 3; }
    S.passo = n;
    $$('.passo').forEach(p => p.hidden = Number(p.dataset.passo) !== n);
    $$('.stepper li').forEach(li => { li.classList.toggle('ativo', Number(li.dataset.passo) === n); li.classList.toggle('feito', Number(li.dataset.passo) < n); });
    if (n === 2) renderLevantamento();
    if (n === 3) renderEscopo();
    if (n === 4) renderLogistica();
    if (n === 5) renderResultado();
    if (n === 6) renderEsboco();
    window.scrollTo(0, 0);
  }
  function ligarNavegacao() {
    $$('[data-ir]').forEach(b => b.addEventListener('click', () => ir(Number(b.dataset.ir))));
    $$('.stepper li').forEach(li => li.addEventListener('click', () => ir(Number(li.dataset.passo))));
  }

  // ------------------------------------------------------------------ init
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await carregarDados();
    } catch (e) { $('#erro-carga').hidden = false; $('#erro-carga').textContent = 'Não foi possível carregar os dados (dados/*.json). Abra o site por http (GitHub Pages ou servidor local), não pelo arquivo. ' + e.message; return; }
    metUI = Metodos.iniciar({ $, esc, fmt, precoExame: nome => Motor.precoExame(S.exames, nome, S.logistica.vigencia) });
    ergoUI = Ergonomia.iniciar({ S, $, $$, fmt, esc, baixar, registrar: a => Ocorrencias.registrar(S, { origem: 'Módulos', acao: a }) });
    $('#ppr-imp-btn').addEventListener('click', () => { $('#ppr-imp-info').textContent = ergoUI.importar('ppr', $('#ppr-imp-origem').value); pprUI.render(); });
    pprUI = PPR.iniciar({ S, $, fmt, esc, baixar, salvarRegrasLocal, amostraDoLevantamento });
    $$('#menu [data-modulo]').forEach(b => b.addEventListener('click', () => irModulo(b.dataset.modulo)));
    ligarRegraRuido(); ligarEntrada(); ligarLevantamento();
    let tFil = null;
    $('#lev-filtro').addEventListener('input', () => { clearTimeout(tFil); tFil = setTimeout(() => { S.filtroLev.texto = $('#lev-filtro').value; renderLevantamento(); }, 250); });
    $('#lev-filtro-tipo').addEventListener('change', () => { S.filtroLev.tipo = $('#lev-filtro-tipo').value; renderLevantamento(); });
    $('#lev-filtro-limpar').addEventListener('click', () => { S.filtroLev = { texto: '', tipo: '' }; renderLevantamento(); }); ligarEscopo(); ligarLogistica(); ligarResultado(); ligarEsboco(); ligarParametros(); ligarNavegacao();
    $('#versao-regras').textContent = 'regras ' + (S.regras.versao || '') + ' | tabela ' + (S.exames.vigencias || []).map(v => v.rotulo).join(', ');
    irModulo('ltcat');
  });
  window.PrecificaApp = { S, ir, irModulo, calcular };
})();
