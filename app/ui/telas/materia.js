// Tela Matéria › Aulas e livros: listar, criar (título, tipo, início e fim), abrir e excluir (lixeira, com "Desfazer").
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss } from '../../nucleo/materias.js';
import { criarAula, excluirAula, restaurarAula, aulasDaMateria, descreverHorario } from '../../nucleo/aulas.js';

export function desenharMateria(raiz, ctx, materiaId) {
  const materia = () => ativas(ctx.sessao.estado().disciplinas).find((d) => d.id === materiaId);
  let criando = false, erro = '';

  function desenhar() {
    const m = materia();
    if (!m) { raiz.innerHTML = '<h1>Matéria não encontrada</h1><p class="sub"><a class="voltar" href="#materias">← Voltar às matérias</a></p>'; return; }
    document.title = `${m.nome} · Ohara`;
    const aulas = aulasDaMateria(ctx.sessao.estado(), materiaId);
    raiz.innerHTML = `<a class="voltar" href="#materias">← Matérias</a>` +
      `<h1><span class="pt grande" style="background:${corCss(m.cor)}"></span> ${escaparHtml(m.nome)}</h1>` +
      `<p class="sub">${aulas.length ? `${aulas.length} ${aulas.length === 1 ? 'item' : 'itens'}` : 'Nenhuma aula ou livro ainda.'}</p>` +
      (criando ? formulario() : `<p><button class="btn" type="button" data-a="nova">Nova aula ou livro</button></p>`) +
      (aulas.length ? `<div class="card">${aulas.map(linha).join('')}</div>` : '');
    const campo = raiz.querySelector('input[name="titulo"]');
    if (campo) campo.focus();
  }

  const formulario = () => `<form class="card form" id="nova"><label class="c">Título<input class="in" name="titulo" maxlength="80" autocomplete="off" required></label>` +
    `<label class="c">Tipo<select class="in" name="tipo"><option value="aula">Aula</option><option value="livro">Livro</option></select></label>` +
    `<div class="duas"><label class="c">Início<input class="in" type="datetime-local" name="inicio"></label><label class="c">Fim<input class="in" type="datetime-local" name="fim"></label></div>` +
    (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '') +
    `<div class="acoes"><button class="btn" type="submit">Criar</button><button class="btn sec" type="button" data-a="cancelar">Cancelar</button></div></form>`;

  const linha = (a) => `<div class="lin"><div class="t"><a href="#aula/${a.id}" class="nome">${escaparHtml(a.titulo)}</a>` +
    `<small>${a.tipo === 'livro' ? 'Livro' : 'Aula'}${descreverHorario(a) ? ' · ' + escaparHtml(descreverHorario(a)) : ''}</small></div>` +
    `<button class="btn peq sec" type="button" data-a="excluir" data-id="${a.id}">Excluir</button></div>`;

  raiz.onclick = (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    if (b.dataset.a === 'nova') { criando = true; erro = ''; desenhar(); }
    else if (b.dataset.a === 'cancelar') { criando = false; erro = ''; desenhar(); }
    else if (b.dataset.a === 'excluir') {
      const id = Number(b.dataset.id);
      const titulo = ctx.sessao.estado().aulas.find((a) => a.id === id)?.titulo;
      ctx.sessao.aplicar((e) => excluirAula(e, id, new Date().toISOString()));
      desenhar();
      ctx.aviso(`"${titulo}" foi para a lixeira.`, { texto: 'Desfazer', fazer: () => { ctx.sessao.aplicar((e) => restaurarAula(e, id)); desenhar(); } });
    }
  };
  raiz.onsubmit = (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try {
      ctx.sessao.aplicar((e) => criarAula(e, materiaId, { titulo: f.get('titulo'), tipo: f.get('tipo'), inicio: f.get('inicio'), fim: f.get('fim') }, new Date().toISOString()).estado);
      criando = false; erro = '';
    } catch (e) { erro = e.message; }
    desenhar();
  };
  desenhar();
}
