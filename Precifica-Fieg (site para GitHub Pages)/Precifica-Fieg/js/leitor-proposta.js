/* leitor-proposta.js - lê a Proposta de Atendimento ao Cliente SESI (FO-021) com pdf.js.
   Resultado: { numero, plano, empresa, cnpj, colaboradores, valor, servicos, avaliacoes:[{qtd, descricao, tipo}], legivel, texto } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pdf-geom.js'));
  else root.LeitorProposta = factory(root.PdfGeom);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  const BLACK = ['escaneie', 'hash', 'pág', 'http', 'autenticidade', 'condições gerais', 'condicoes gerais', 'cnpj', 'id:', 'sha256', 'documento', 'proposta', 'revisão', 'revisao', 'data:'];
  const REL = ['ruíd', 'ruido', 'vibra', 'calor', 'ibutg', 'sílica', 'silica', 'poeira', 'respir', 'pnos', 'radiaç', 'radiac', 'químic', 'quimic', 'vapor', 'gás', 'biológic', 'biologic', 'dosimetria', 'laudo', 'periculosidade', 'insalubridade', 'ultravioleta', 'névoa', 'particulad', 'iluminância', 'iluminancia', 'metais', 'varredura', 'ozônio', 'ozonio', 'fumos'];

  function tipoAvaliacao(desc) {
    const f = (desc || '').toLowerCase();
    if (f.includes('dosimetria') || f.includes('ruíd') || f.includes('ruido')) return 'Ruído (dosimetria)';
    if (f.includes('localizada') || f.includes('mão-braço') || f.includes('mao-braço') || f.includes('mão braço') || f.includes('vmb') || f.includes('mãos e braços')) return 'Vibração mãos e braços';
    if (f.includes('vibra') || f.includes('corpo inteiro') || f.includes('vci')) return 'Vibração corpo inteiro';
    if (f.includes('calor') || f.includes('ibutg') || f.includes('térmic')) return 'Calor (IBUTG)';
    if (f.includes('periculosidade') || f.includes('inflamável') || f.includes('inflamavel')) return 'Periculosidade (por cargo)';
    if (f.includes('biológic') || f.includes('biologic') || f.includes('radiaç') || f.includes('ultravioleta') || f.includes('luz negra') || f.includes('frio') || f.includes('umidade') || f.includes('qualitativ')) return 'Avaliação qualitativa';
    return 'Químico (laboratório)';
  }

  async function lerProposta(doc) {
    const partes = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const geo = await G.extrair(await doc.getPage(p));
      partes.push(G.linhasTexto(geo).map(l => l.texto).join('\n'));
    }
    const t = partes.join('\n');
    const d = { numero: '', plano: '', empresa: '', cnpj: '', colaboradores: '', valor: '', servicos: [], avaliacoes: [], legivel: true, texto: t };
    if (t.replace(/\s+/g, '').length < 400) {
      d.legivel = false;
      d.aviso = 'Proposta sem texto (PDF digitalizado ou print do webviewer). Envie a versão exportada do sistema ou preencha à mão.';
      return d;
    }
    let m;
    if ((m = /N[úu]mero da proposta[:\s]*([\d/]+)/i.exec(t))) d.numero = m[1];
    if ((m = /Nome da empresa[:\s]*(.+)/i.exec(t))) d.empresa = m[1].trim();
    if ((m = /Plano[:\s]*([A-Za-zÀ-ú ]+?)\s*[-–]/.exec(t))) d.plano = m[1].trim();
    if ((m = /(?:para|at[ée])\s*(\d{1,4})\s*colaboradores/i.exec(t) || /colaboradores[:\s]*(\d{1,4})/i.exec(t))) d.colaboradores = parseInt(m[1], 10);
    if ((m = /CNPJ[:\s]*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/.exec(t))) d.cnpj = m[1];
    if ((m = /investimento[^R]*R\$\s*([\d.]+,\d{2})/i.exec(t) || /Valor mensal total de R\$\s*([\d.]+,\d{2})/i.exec(t))) d.valor = m[1] + (/Valor mensal/i.test(m[0]) ? ' por mês' : '');
    const up = t.toUpperCase();
    for (const s of ['LTCAT', 'PCMSO', 'PGR', 'PPP']) if (up.includes(s)) d.servicos.push(s);
    if (/LAUDO DE INSALUBRIDADE|INSALUBRIDADE/.test(up)) d.servicos.push('LI');
    if (/PERICULOSIDADE/.test(up)) d.servicos.push('LP');

    const add = (qtd, desc) => {
      desc = desc.replace(/\s+/g, ' ').replace(/^[\s.\-–]+|[\s.\-–]+$/g, '');
      const dl = desc.toLowerCase();
      if (desc.length < 3 || BLACK.some(b => dl.includes(b))) return;
      if (!d.avaliacoes.some(a => a.descricao === desc && a.qtd === qtd)) d.avaliacoes.push({ qtd, descricao: desc.slice(0, 80), tipo: tipoAvaliacao(desc) });
    };
    // bloco "Avaliações a serem realizadas" / "Descrição das atividades": todas as linhas enumeradas
    const sec = /(?:quantidade\s*\/\s*descri[cç][aã]o do agente|avalia[cç][oõ]es a serem realizadas|descri[cç][aã]o das atividades a serem executadas)([\s\S]*?)(?:cronograma|pre[cç]o|forma de pagamento|\blocais\b|local de|datas e hor[aá]rios|prepara[cç]|condi[cç][oõ]es gerais|$)/i.exec(t);
    if (sec) {
      const bloco = sec[1];
      for (const mm of bloco.matchAll(/^\s*(\d{1,3})\s*[-–]\s*([A-Za-zÀ-ú(].+)$/gm)) add(parseInt(mm[1], 10), mm[2]);
      for (const mm of bloco.matchAll(/^\s*([A-Za-zÀ-ú(].+?)\s*[-–]\s*(\d{1,3})\s*$/gm)) add(parseInt(mm[2], 10), mm[1]);
      for (const mm of bloco.matchAll(/^\s*([A-Za-zÀ-ú(].+?)\s*\((\d{1,3})\s*agentes?\)\s*[-–]\s*(\d{1,3})\s*$/gm)) add(parseInt(mm[3], 10), mm[1] + ' (' + mm[2] + ' agentes)');
    }
    // enumeradas em qualquer lugar, com palavra-chave
    for (const mm of t.matchAll(/^\s*(\d{1,3})\s*[.\-–\s]{3,}\s*([A-Za-zÀ-ú(].+)$/gm)) {
      const dl = mm[2].toLowerCase(); if (REL.some(r => dl.includes(r))) add(parseInt(mm[1], 10), mm[2]);
    }
    for (const mm of t.matchAll(/^\s*([A-Za-zÀ-ú(][^\n]*?)\s*[-–]\s*(\d{1,3})\s*$/gm)) {
      const dl = mm[1].toLowerCase(); if (REL.some(r => dl.includes(r))) add(parseInt(mm[2], 10), mm[1]);
    }
    if (!d.plano && d.avaliacoes.length) d.plano = 'Laudo avulso';
    return d;
  }

  return { lerProposta, tipoAvaliacao };
});
