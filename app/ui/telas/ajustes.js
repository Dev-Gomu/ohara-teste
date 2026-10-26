// Tela Ajustes: lixeira (restaurar e esvaziar com confirmação), tema e estado do armazenamento.
import { escaparHtml, formatarBytes } from '../../nucleo/texto.js';
import { itensDaLixeira, contarLixeira, restaurarMateria } from '../../nucleo/materias.js';
import { restaurarArquivo } from '../../nucleo/arquivos.js';
import { restaurarCartao } from '../../nucleo/cartoes.js';
import { restaurarProva } from '../../nucleo/planejador.js';
import { CONFIG_PADRAO, ROTULOS_CONFIG, lerConfigFoco, validarConfig } from '../../nucleo/foco.js';
import { restaurarAula } from '../../nucleo/aulas.js';
import { PALETAS, escolherPaleta, VISUAIS, escolherVisual } from '../../nucleo/rotas.js';

export function desenharAjustes(raiz, ctx) {
  let confirmando = false, armaz = null, pendente = null, erroBackup = '', erroMetas = '', troca = null, erroTroca = '', ocupado = false;

  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  const abertas = new Set();

  function desenhar() {
    const estado = ctx.sessao.estado();
    const { materias, aulas, arquivos, cartoes, provas } = itensDaLixeira(estado);
    const total = contarLixeira(estado);
    const vazia = !total.disciplinas && !total.aulas && !total.arquivos && !total.cartoes && !total.provas;
    raiz.innerHTML = '<h1>Ajustes</h1><p class="sub">Tema, lixeira e armazenamento.</p>' +
      `<div class="card bloco"><h2>Aplicativo</h2><p class="sub" style="margin-bottom:10px">Se uma novidade não aparecer, baixe a versão mais recente (precisa de internet). Seus dados não são apagados.</p><div class="acoes"><button class="btn peq" type="button" data-a="atualizar-app">Atualizar o app</button></div></div>` +
      `<div class="card bloco"><h2>Tema</h2><div class="acoes">` +
      ['claro', 'escuro'].map((t) => `<button class="btn peq ${document.documentElement.dataset.tema === t ? '' : 'sec'}" type="button" data-a="tema" data-tema="${t}">${t === 'claro' ? 'Claro' : 'Escuro'}</button>`).join('') +
      `</div></div>` +
      `<div class="card bloco so-focus"><h2>Paleta</h2><p class="sub" style="margin-bottom:10px">Cores do menu e dos destaques (vale para o tema claro e o escuro).</p><div class="acoes">` +
      PALETAS.map((p) => `<button class="btn peq ${(document.documentElement.dataset.paleta ?? 'verde') === p.chave ? '' : 'sec'}" type="button" data-a="paleta" data-paleta="${p.chave}"><span class="amostra" style="background:linear-gradient(90deg,${p.amostra[0]} 50%,${p.amostra[1]} 50%)"></span>${escaparHtml(p.nome)}</button>`).join('') + `</div></div>` +
      `<div class="card bloco"><h2>Metas e foco</h2>${blocoMetas()}</div>` +
      `<div class="card bloco"><h2>Lixeira</h2>` +
      (vazia ? '<p class="sub">A lixeira está vazia.</p>'
        : materias.map((m) => `<div class="lin"><div class="t">${escaparHtml(m.nome)}<small>Matéria · com as aulas dela</small></div><button class="btn peq sec" type="button" data-a="rest-m" data-id="${m.id}">Restaurar</button></div>`).join('') +
          aulas.map((a) => `<div class="lin"><div class="t">${escaparHtml(a.titulo)}<small>${a.tipo === 'livro' ? 'Livro' : 'Aula'}</small></div><button class="btn peq sec" type="button" data-a="rest-a" data-id="${a.id}">Restaurar</button></div>`).join('') +
          arquivos.map((f) => `<div class="lin"><div class="t">${escaparHtml(f.nome)}<small>Arquivo anexado</small></div><button class="btn peq sec" type="button" data-a="rest-f" data-id="${f.id}">Restaurar</button></div>`).join('') +
          cartoes.map((c) => `<div class="lin"><div class="t">${escaparHtml(c.frente.slice(0, 60))}<small>Cartão</small></div><button class="btn peq sec" type="button" data-a="rest-c" data-id="${c.id}">Restaurar</button></div>`).join('') +
          provas.map((p) => `<div class="lin"><div class="t">${escaparHtml(p.titulo)}<small>Prova de ${escaparHtml(p.data)}</small></div><button class="btn peq sec" type="button" data-a="rest-p" data-id="${p.id}">Restaurar</button></div>`).join('') +
          (confirmando
            ? `<div class="confirma"><p>Apagar de vez ${plural(total.disciplinas, 'matéria', 'matérias')} e ${plural(total.aulas, 'aula ou livro', 'aulas e livros')}, ${plural(total.arquivos, 'arquivo', 'arquivos')}, ${plural(total.cartoes, 'cartão', 'cartões')} e ${plural(total.provas, 'prova', 'provas')}? Não dá para desfazer.</p>` +
              `<div class="acoes"><button class="btn peq ur" type="button" data-a="esvaziar-sim">Apagar de vez</button><button class="btn peq sec" type="button" data-a="esvaziar-nao">Cancelar</button></div></div>`
            : `<p><button class="btn peq sec" type="button" data-a="esvaziar">Esvaziar lixeira</button></p>`)) +
      `</div>` +
      `<div class="card bloco"><h2>Backup</h2>${blocoBackup()}</div>` +
      `<div class="card bloco"><h2>Trocar dados entre aparelhos</h2>${blocoTroca()}</div>` +
      `<div class="card bloco"><h2>Armazenamento</h2>${armazenamento()}</div>` +
      `<div class="card bloco"><h2>Dica do teclado</h2><p class="sub">Se a tecla Alt virar Cmd no teclado bluetooth, aperte Fn+P por 3 segundos para voltar ao modo Android.</p></div>`;
    refinar();
  }

  // Seções em ordem de uso: Aparência e Metas abertas; o resto recolhido. Números ganham − e +.
  const RECOLHIVEIS = ['Lixeira', 'Backup', 'Trocar dados entre aparelhos', 'Armazenamento', 'Dica do teclado'];
  function refinar() {
    raiz.querySelectorAll(':scope > .card.bloco').forEach((card) => {
      const h = card.querySelector(':scope > h2'), nome = h?.textContent;
      if (!RECOLHIVEIS.includes(nome)) return;
      const det = document.createElement('details'); det.className = card.className; det.open = abertas.has(nome);
      const sm = document.createElement('summary'); sm.textContent = nome; h.remove();
      det.appendChild(sm); while (card.firstChild) det.appendChild(card.firstChild);
      det.addEventListener('toggle', () => { det.open ? abertas.add(nome) : abertas.delete(nome); });
      card.replaceWith(det);
    });
    raiz.querySelectorAll('#metas input[type=number]').forEach((inp) => {
      const w = document.createElement('div'); w.className = 'passo';
      const mk = (t, d, r) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.setAttribute('aria-label', r); b.onclick = () => { inp.value = Math.max(Number(inp.min || 0), (Number(inp.value) || 0) + d); }; return b; };
      inp.before(w); w.append(mk('−', -5, 'Diminuir'), inp, mk('+', 5, 'Aumentar'));
    });
  }

  function blocoMetas() {
    const c = lerConfigFoco(ctx.sessao.lerConfig);
    return `<form id="metas" class="form">${Object.keys(CONFIG_PADRAO).map((k) => `<label class="c">${escaparHtml(ROTULOS_CONFIG[k])}<input class="in" name="${k}" type="number" inputmode="numeric" value="${c[k]}"></label>`).join('')}` +
      (erroMetas ? `<p class="erro">${escaparHtml(erroMetas)}</p>` : '') + `<div class="acoes"><button class="btn peq" type="submit">Salvar</button></div></form>`;
  }

  function blocoBackup() {
    const ultimo = ctx.sessao.lerConfig('ultimo_backup');
    return `<p class="sub">${ultimo ? `Último backup: ${new Date(ultimo).toLocaleDateString('pt-BR')}.` : 'Você ainda não fez backup.'} O backup é a única proteção se o aparelho for perdido ou os dados do navegador forem apagados.</p>` +
      `<div class="acoes"><button class="btn peq" type="button" data-a="backup" data-completo="0">Backup só dos dados</button>` +
      `<button class="btn peq sec" type="button" data-a="backup" data-completo="1">Backup completo (com arquivos)</button></div>` +
      `<h2 class="sep">Restaurar</h2><label class="btn peq sec arquivo">Escolher arquivo de backup<input type="file" accept=".zip,application/zip" id="arq-backup" hidden></label>` +
      (erroBackup ? `<p class="erro">${escaparHtml(erroBackup)}</p>` : '') +
      (pendente ? `<div class="confirma"><p>Substituir TODOS os dados atuais pelo backup de ${pendente.resumo.criado_em ? new Date(pendente.resumo.criado_em).toLocaleDateString('pt-BR') : 'data desconhecida'} ` +
        `(${plural(pendente.resumo.materias, 'matéria', 'matérias')}, ${plural(pendente.resumo.aulas, 'aula ou livro', 'aulas e livros')}${pendente.resumo.arquivos ? `, ${plural(pendente.resumo.arquivos, 'arquivo', 'arquivos')}` : ''})? ` +
        `Uma cópia dos dados de agora fica guardada no aparelho.</p><div class="acoes"><button class="btn peq ur" type="button" data-a="restaurar-sim">Substituir meus dados</button><button class="btn peq sec" type="button" data-a="restaurar-nao">Cancelar</button></div></div>` : '');
  }

  function blocoTroca() {
    const pode = typeof navigator.canShare === 'function';
    let painel = '';
    if (troca) {
      const a = troca.analise, de = a.origem ? `de ${escaparHtml(a.origem)}, ` : '', quando = a.geradoEm ? new Date(a.geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'data desconhecida';
      const resumo = `${de}${escaparHtml(quando)} (${plural(a.resumo.materias, 'matéria', 'matérias')}, ${plural(a.resumo.aulas, 'aula ou livro', 'aulas e livros')}${a.resumo.arquivos ? `, ${plural(a.resumo.arquivos, 'arquivo', 'arquivos')}` : ''})`;
      const falta = a.faltam ? `<p class="sub">Atenção: ${plural(a.faltam, 'arquivo (PDF ou imagem) não veio', 'arquivos (PDFs ou imagens) não vieram')} neste pacote nem existe${a.faltam === 1 ? '' : 'm'} aqui. Gere o pacote "com arquivos" no outro aparelho para trazê-lo${a.faltam === 1 ? '' : 's'}.</p>` : '';
      painel = a.acao === 'substituir'
        ? `<div class="confirma"><p>Pacote ${resumo}. ${escaparHtml(a.motivo)} Receber vai deixar este aparelho igual ao pacote. Uma cópia dos dados de agora fica guardada.</p>${falta}<div class="acoes"><button class="btn peq" type="button" data-a="troca-receber">Receber</button><button class="btn peq sec" type="button" data-a="troca-cancelar">Cancelar</button></div></div>`
        : `<div class="confirma"><p><b>Os dois aparelhos mudaram.</b> Pacote ${resumo}. ${escaparHtml(a.motivo)} Nada se perde: o que você não escolher fica guardado num arquivo.</p>${falta}` +
          `<div class="acoes"><button class="btn peq" type="button" data-a="troca-pacote">Ficar com o do pacote (guardo o meu num arquivo)</button><button class="btn peq sec" type="button" data-a="troca-meu">Ficar com o meu (o pacote não é usado)</button><button class="btn peq sec" type="button" data-a="troca-cancelar">Decidir depois</button></div></div>`;
    }
    return `<p class="sub">Cada aparelho tem a sua cópia. Para passar o que você fez de um para o outro: <b>envie</b> aqui, leve o arquivo e <b>receba</b> no outro. Faça isso sempre antes de trocar de aparelho. Não há troca automática pela Wi-Fi porque o Ohara não usa servidor; o arquivo pode ir por Compartilhar (Nearby Share, Drive, e-mail para você mesmo) ou por cabo.</p>` +
      `<div class="acoes"><button class="btn peq" type="button" data-a="troca-enviar" data-completo="0" ${ocupado ? 'disabled' : ''}>Enviar só os dados</button><button class="btn peq sec" type="button" data-a="troca-enviar" data-completo="1" ${ocupado ? 'disabled' : ''}>Enviar com arquivos</button>` +
      (pode ? `<button class="btn peq sec" type="button" data-a="troca-compartilhar" ${ocupado ? 'disabled' : ''}>Compartilhar…</button>` : '') + `</div>` +
      `<h2 class="sep">Receber</h2><label class="btn peq sec arquivo">Escolher o arquivo do outro aparelho<input type="file" accept=".zip,application/zip" id="arq-troca" hidden></label>` +
      (erroTroca ? `<p class="erro">${escaparHtml(erroTroca)}</p>` : '') + painel;
  }

  function baixar({ bytes, nome }) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function armazenamento() {
    if (!armaz) return '<p class="sub">Verificando…</p>';
    return `<div class="lin"><div class="t">Espaço usado<small>${armaz.uso} de ${armaz.cota}</small></div></div>` +
      `<div class="lin"><div class="t">Proteção contra limpeza automática<small>${armaz.persistente ? 'Ativa: o navegador não apaga os dados sozinho.' : 'Não garantida: faça backup com frequência.'}</small></div>` +
      (armaz.persistente || !armaz.pode ? '' : '<button class="btn peq sec" type="button" data-a="persistir">Pedir proteção</button>') + '</div>';
  }

  async function medir() {
    const s = navigator.storage;
    try {
      const e = s?.estimate ? await s.estimate() : {};
      armaz = { uso: formatarBytes(e.usage), cota: formatarBytes(e.quota), persistente: s?.persisted ? await s.persisted() : false, pode: !!s?.persist };
    } catch { armaz = { uso: '—', cota: '—', persistente: false, pode: false }; }
    if (raiz.isConnected && raiz.querySelector('h1')?.textContent === 'Ajustes') desenhar();
  }

  const restaurar = (nome, fazer) => {
    try { ctx.sessao.aplicar(fazer); ctx.aviso(`"${nome}" voltou.`); } catch (e) { ctx.aviso(e.message); }
    desenhar();
  };

  raiz.onclick = async (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const id = Number(b.dataset.id); const estado = ctx.sessao.estado();
    switch (b.dataset.a) {
      case 'atualizar-app': ctx.atualizarApp(); break;
      case 'tema': ctx.definirTema(b.dataset.tema); desenhar(); break;
      case 'visual': ctx.definirVisual(escolherVisual(b.dataset.visual)); break;
      case 'paleta': ctx.definirPaleta(escolherPaleta(b.dataset.paleta)); break;
      case 'rest-m': restaurar(estado.disciplinas.find((d) => d.id === id)?.nome, (e) => restaurarMateria(e, id)); break;
      case 'rest-a': restaurar(estado.aulas.find((a) => a.id === id)?.titulo, (e) => restaurarAula(e, id)); break;
      case 'rest-f': restaurar(estado.arquivos.find((f) => f.id === id)?.nome, (e) => restaurarArquivo(e, id)); break;
      case 'rest-c': restaurar(estado.cartoes.find((c) => c.id === id)?.frente.slice(0, 30), (e) => restaurarCartao(e, id)); break;
      case 'rest-p': restaurar(estado.provas.find((p) => p.id === id)?.titulo, (e) => restaurarProva(e, id)); break;
      case 'esvaziar': confirmando = true; desenhar(); break;
      case 'esvaziar-nao': confirmando = false; desenhar(); break;
      case 'esvaziar-sim': {
        const n = contarLixeira(estado);
        await ctx.sessao.esvaziarLixeira();
        confirmando = false; desenhar();
        ctx.aviso(`Apagado de vez: ${plural(n.disciplinas, 'matéria', 'matérias')}, ${plural(n.aulas, 'aula ou livro', 'aulas e livros')} e ${plural(n.arquivos, 'arquivo', 'arquivos')}.`);
        break;
      }
      case 'backup': {
        try { baixar(await ctx.sessao.fazerBackup(b.dataset.completo === '1')); ctx.aviso('Backup gerado. Guarde o arquivo em lugar seguro.'); } catch (e) { erroBackup = e.message; }
        desenhar(); break;
      }
      case 'restaurar-nao': pendente = null; desenhar(); break;
      case 'restaurar-sim': {
        try { await ctx.sessao.restaurar(pendente.zip); pendente = null; erroBackup = ''; ctx.aviso('Dados restaurados.'); } catch (e) { erroBackup = e.message; }
        desenhar(); break;
      }
      case 'troca-enviar': {
        ocupado = true; erroTroca = ''; desenhar();
        try { baixar(await ctx.sessao.gerarPacoteTroca(b.dataset.completo === '1')); ctx.aviso('Pacote gerado. Leve o arquivo para o outro aparelho e receba lá.'); } catch (e) { erroTroca = e.message; }
        ocupado = false; desenhar(); break;
      }
      case 'troca-compartilhar': {
        ocupado = true; erroTroca = ''; desenhar();
        try {
          const r = await ctx.sessao.gerarPacoteTroca(false), arquivo = new File([r.bytes], r.nome, { type: 'application/zip' });
          if (!navigator.canShare({ files: [arquivo] })) baixar(r); else await navigator.share({ files: [arquivo], title: 'Dados do Ohara' });
        } catch (e) { if (e.name !== 'AbortError') erroTroca = e.message; }
        ocupado = false; desenhar(); break;
      }
      case 'troca-cancelar': troca = null; desenhar(); break;
      case 'troca-receber': case 'troca-pacote': case 'troca-meu': {
        const escolha = b.dataset.a === 'troca-meu' ? 'meu' : 'pacote';
        try {
          const r = await ctx.sessao.aplicarPacoteTroca(troca.zip, troca.analise, escolha);
          if (r.copiaLocal) baixar(r.copiaLocal);
          ctx.aviso(r.trocou ? (r.copiaLocal ? 'Dados do pacote recebidos. A sua versão de antes foi baixada num arquivo.' : 'Dados recebidos.') : 'Certo: ficou o que você tem aqui.');
          troca = null; erroTroca = '';
        } catch (e) { erroTroca = e.message; }
        desenhar(); break;
      }
      case 'persistir': { try { await navigator.storage.persist(); } catch { /* negado */ } medir(); break; }
    }
  };
  raiz.onsubmit = (ev) => {
    ev.preventDefault();
    if (ev.target.id !== 'metas') return;
    try {
      const f = new FormData(ev.target), v = Object.keys(CONFIG_PADRAO).map((k) => [k, validarConfig(k, f.get(k))]);
      v.forEach(([k, n]) => ctx.sessao.gravarConfig(k, n)); erroMetas = ''; ctx.aviso('Metas salvas.');
    } catch (e) { erroMetas = e.message; }
    desenhar();
  };
  raiz.onchange = async (ev) => {
    if (ev.target.id === 'arq-troca' && ev.target.files[0]) {
      troca = null; erroTroca = '';
      try {
        const zip = new Uint8Array(await ev.target.files[0].arrayBuffer()), analise = await ctx.sessao.analisarPacoteTroca(zip);
        if (analise.acao === 'igual' || analise.acao === 'nada_novo') { await ctx.sessao.aplicarPacoteTroca(zip, analise, 'meu'); ctx.aviso(analise.motivo); } else troca = { zip, analise };
      } catch (e) { erroTroca = e.message; }
      ev.target.value = ''; desenhar(); return;
    }
    if (ev.target.id !== 'arq-backup' || !ev.target.files[0]) return;
    pendente = null; erroBackup = '';
    try {
      const zip = new Uint8Array(await ev.target.files[0].arrayBuffer());
      pendente = { zip, resumo: ctx.sessao.resumoDoBackup(zip) };
    } catch (e) { erroBackup = e.message; }
    desenhar();
  };
  desenhar();
  medir();
}
