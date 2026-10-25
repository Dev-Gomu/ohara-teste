// Tela Ajustes: lixeira (restaurar e esvaziar com confirmação), tema e estado do armazenamento.
import { escaparHtml, formatarBytes } from '../../nucleo/texto.js';
import { itensDaLixeira, contarLixeira, restaurarMateria } from '../../nucleo/materias.js';
import { restaurarArquivo } from '../../nucleo/arquivos.js';
import { restaurarAula } from '../../nucleo/aulas.js';

export function desenharAjustes(raiz, ctx) {
  let confirmando = false, armaz = null, pendente = null, erroBackup = '';

  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  function desenhar() {
    const estado = ctx.sessao.estado();
    const { materias, aulas, arquivos } = itensDaLixeira(estado);
    const total = contarLixeira(estado);
    const vazia = !total.disciplinas && !total.aulas && !total.arquivos;
    raiz.innerHTML = '<h1>Ajustes</h1><p class="sub">Tema, lixeira e armazenamento.</p>' +
      `<div class="card bloco"><h2>Tema</h2><div class="acoes">` +
      ['claro', 'escuro'].map((t) => `<button class="btn peq ${document.documentElement.dataset.tema === t ? '' : 'sec'}" type="button" data-a="tema" data-tema="${t}">${t === 'claro' ? 'Claro' : 'Escuro'}</button>`).join('') +
      `</div></div>` +
      `<div class="card bloco"><h2>Lixeira</h2>` +
      (vazia ? '<p class="sub">A lixeira está vazia.</p>'
        : materias.map((m) => `<div class="lin"><div class="t">${escaparHtml(m.nome)}<small>Matéria · com as aulas dela</small></div><button class="btn peq sec" type="button" data-a="rest-m" data-id="${m.id}">Restaurar</button></div>`).join('') +
          aulas.map((a) => `<div class="lin"><div class="t">${escaparHtml(a.titulo)}<small>${a.tipo === 'livro' ? 'Livro' : 'Aula'}</small></div><button class="btn peq sec" type="button" data-a="rest-a" data-id="${a.id}">Restaurar</button></div>`).join('') +
          arquivos.map((f) => `<div class="lin"><div class="t">${escaparHtml(f.nome)}<small>Arquivo anexado</small></div><button class="btn peq sec" type="button" data-a="rest-f" data-id="${f.id}">Restaurar</button></div>`).join('') +
          (confirmando
            ? `<div class="confirma"><p>Apagar de vez ${plural(total.disciplinas, 'matéria', 'matérias')} e ${plural(total.aulas, 'aula ou livro', 'aulas e livros')} e ${plural(total.arquivos, 'arquivo', 'arquivos')}? Não dá para desfazer.</p>` +
              `<div class="acoes"><button class="btn peq ur" type="button" data-a="esvaziar-sim">Apagar de vez</button><button class="btn peq sec" type="button" data-a="esvaziar-nao">Cancelar</button></div></div>`
            : `<p><button class="btn peq sec" type="button" data-a="esvaziar">Esvaziar lixeira</button></p>`)) +
      `</div>` +
      `<div class="card bloco"><h2>Backup</h2>${blocoBackup()}</div>` +
      `<div class="card bloco"><h2>Armazenamento</h2>${armazenamento()}</div>` +
      `<div class="card bloco"><h2>Dica do teclado</h2><p class="sub">Se a tecla Alt virar Cmd no teclado bluetooth, aperte Fn+P por 3 segundos para voltar ao modo Android.</p></div>`;
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
      case 'tema': ctx.definirTema(b.dataset.tema); desenhar(); break;
      case 'rest-m': restaurar(estado.disciplinas.find((d) => d.id === id)?.nome, (e) => restaurarMateria(e, id)); break;
      case 'rest-a': restaurar(estado.aulas.find((a) => a.id === id)?.titulo, (e) => restaurarAula(e, id)); break;
      case 'rest-f': restaurar(estado.arquivos.find((f) => f.id === id)?.nome, (e) => restaurarArquivo(e, id)); break;
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
      case 'persistir': { try { await navigator.storage.persist(); } catch { /* negado */ } medir(); break; }
    }
  };
  raiz.onchange = async (ev) => {
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
