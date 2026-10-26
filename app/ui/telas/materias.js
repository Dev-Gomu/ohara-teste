// Tela Matérias: listar, criar (com cor), renomear e excluir (vai para a lixeira, com "Desfazer").
import { abrirMenu } from '../menu.js';
import { escaparHtml } from '../../nucleo/texto.js';
import { ABA, codigoDaMateria } from '../aba.js';
import { proximaAula, rotuloDaAula } from '../../nucleo/aulas.js';
import { somarDias, diaDaSemana } from '../../nucleo/datas.js';
import { ativas, criarMateria, alterarMateria, excluirMateria, restaurarMateria, PALETA, corCss, proximaCor } from '../../nucleo/materias.js';

export function desenharMaterias(raiz, ctx) {
  let criando = false, renomeando = null, corEscolhida = null, erro = '';
  const lista = () => ativas(ctx.sessao.estado().disciplinas);
  const contarAulas = (id) => ctx.sessao.estado().aulas.filter((a) => a.disciplina_id === id && !a.excluido_em).length;

  const bolas = (sel) => PALETA.map((c) => `<button type="button" class="cor ${c === sel ? 'on' : ''}" data-cor="${c}" aria-label="Cor ${c}" style="background:${corCss(c)}"></button>`).join('');

  function desenhar() {
    const l = lista();
    raiz.innerHTML = `<h1>Matérias</h1><p class="sub">${l.length ? `${l.length} ${l.length === 1 ? 'matéria' : 'matérias'}` : 'Nenhuma matéria ainda.'}</p>` +
      (criando ? `<form class="card form" id="nova"><label class="c">Nome da matéria<input class="in" name="nome" maxlength="80" autocomplete="off" required></label>` +
        `<div class="cores" role="group" aria-label="Cor">${bolas(corEscolhida)}</div>${erro ? `<p class="erro">${escaparHtml(erro)}</p>` : ''}` +
        `<div class="acoes"><button class="btn" type="submit">Criar</button><button class="btn sec" type="button" data-a="cancelar">Cancelar</button></div></form>`
        : `<p><button class="btn" type="button" data-a="nova">Nova matéria</button></p>`) +
      (l.length ? `<div class="tiles">${l.map((d) => linha(d)).join('')}</div>` : '');
    const campo = raiz.querySelector('input[name="nome"]');
    if (campo) campo.focus();
  }

  function linha(d) {
    if (renomeando === d.id) {
      return `<form class="til edit" style="--c:${corCss(d.cor)}" data-renomear="${d.id}"><span class="ini">${escaparHtml(d.nome.slice(0, 1).toUpperCase())}</span><input class="in" name="nome" maxlength="80" value="${escaparHtml(d.nome)}" autocomplete="off" required>` +
        (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '') + `<div class="acoes"><button class="btn peq" type="submit">Salvar</button><button class="btn peq sec" type="button" data-a="cancelar">Cancelar</button></div></form>`;
    }
    const n = contarAulas(d.id), ag = new Date(ctx.agora()), p2 = (x) => String(x).padStart(2, '0');
    const agoraLocal = `${ag.getFullYear()}-${p2(ag.getMonth() + 1)}-${p2(ag.getDate())}T${p2(ag.getHours())}:${p2(ag.getMinutes())}`;
    const prox = proximaAula(ctx.sessao.estado(), d.id, agoraLocal);
    const quando = prox ? `próxima: ${rotuloDaAula(prox, agoraLocal.slice(0, 10), somarDias, diaDaSemana)}` : 'sem aula marcada';
    const inicial = escaparHtml(d.nome.slice(0, 1).toUpperCase());
    return `<div class="til" style="--c:${corCss(d.cor)}"><a class="pasta" href="#materias/${d.id}" aria-label="Abrir ${escaparHtml(d.nome)}">${ABA}<span class="corpo"><span class="ini">${inicial}</span>` +
      `<span class="cod">${escaparHtml(codigoDaMateria(d.nome))}</span><span class="seta" aria-hidden="true">↗</span></span></a>` +
      `<div class="info"><a href="#materias/${d.id}" class="nome">${escaparHtml(d.nome)}</a><small>${n} ${n === 1 ? 'aula ou livro' : 'aulas e livros'} · ${quando}</small>` +
      `<div class="acoes"><button class="btn peq sec mais" type="button" data-a="menu" data-id="${d.id}" aria-label="Mais opções de ${escaparHtml(d.nome)}" aria-haspopup="menu">⋯</button></div></div></div>`;
  }

  function tentar(acao) {
    try { acao(); erro = ''; return true; } catch (e) { erro = e.message; desenhar(); return false; }
  }

  raiz.onclick = (ev) => {
    const b = ev.target.closest('[data-a], [data-cor]'); if (!b) return;
    if (b.dataset.cor) { corEscolhida = b.dataset.cor; raiz.querySelectorAll('.cor').forEach((x) => x.classList.toggle('on', x === b)); return; }
    const id = Number(b.dataset.id);
    switch (b.dataset.a) {
      case 'nova': criando = true; renomeando = null; erro = ''; corEscolhida = proximaCor(ctx.sessao.estado()); desenhar(); break;
      case 'cancelar': criando = false; renomeando = null; erro = ''; desenhar(); break;
      case 'menu': abrirMenu(b, [{ rotulo: 'Renomear', fazer: () => { renomeando = id; criando = false; erro = ''; desenhar(); } }, { sep: true }, { rotulo: 'Excluir (vai para a lixeira)', perigo: true, fazer: () => excluirDaLista(id) }]); break;
      case 'renomear': renomeando = id; criando = false; erro = ''; desenhar(); break;
    }
  };
  function excluirDaLista(id) {
    const nome = lista().find((d) => d.id === id)?.nome;
    if (tentar(() => ctx.sessao.aplicar((e) => excluirMateria(e, id, new Date().toISOString())))) {
      desenhar();
      ctx.aviso(`"${nome}" foi para a lixeira.`, { texto: 'Desfazer', fazer: () => { ctx.sessao.aplicar((e) => restaurarMateria(e, id)); desenhar(); } });
    }
  }
  raiz.onsubmit = (ev) => {
    ev.preventDefault();
    const nome = new FormData(ev.target).get('nome');
    if (ev.target.id === 'nova') {
      if (tentar(() => ctx.sessao.aplicar((e) => criarMateria(e, { nome, cor: corEscolhida }, new Date().toISOString()).estado))) { criando = false; desenhar(); }
    } else if (ev.target.dataset.renomear) {
      const id = Number(ev.target.dataset.renomear);
      if (tentar(() => ctx.sessao.aplicar((e) => alterarMateria(e, id, { nome })))) { renomeando = null; desenhar(); }
    }
  };
  desenhar();
}
