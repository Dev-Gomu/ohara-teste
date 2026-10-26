// Tela Matéria › Aulas e livros: listar, criar (título, tipo, início e fim), abrir e excluir (lixeira, com "Desfazer").
import { escaparHtml } from '../../nucleo/texto.js';
import { ativas, corCss } from '../../nucleo/materias.js';
import { abrirMenu } from '../menu.js';
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
      grupos(m, aulas);
    const campo = raiz.querySelector('input[name="titulo"]');
    if (campo) campo.focus();
  }

  const formulario = () => `<form class="card form" id="nova"><label class="c">Título<input class="in" name="titulo" maxlength="80" autocomplete="off" required></label>` +
    `<label class="c">Tipo<select class="in" name="tipo"><option value="aula">Aula</option><option value="livro">Livro</option></select></label>` +
    `<div class="duas"><label class="c">Início<input class="in" type="datetime-local" name="inicio"></label><label class="c">Fim<input class="in" type="datetime-local" name="fim"></label></div>` +
    (erro ? `<p class="erro">${escaparHtml(erro)}</p>` : '') +
    `<div class="acoes"><button class="btn" type="submit">Criar</button><button class="btn sec" type="button" data-a="cancelar">Cancelar</button></div></form>`;

  const agoraLocal = () => { const d = new Date(ctx.agora()), p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  // Cada linha inteira abre a aula; o ⋯ guarda o que é perigoso (Excluir).
  const linha = (m, a, destaque) => {
    const h = descreverHorario(a), igual = a.titulo.trim().toLowerCase() === m.nome.trim().toLowerCase();
    return `<div class="lin${destaque ? ' prox' : ''}"><a class="lin-link" href="#aula/${a.id}"><span class="t"><b>${escaparHtml(h || a.titulo)}</b>` +
      `<small>${a.tipo === 'livro' ? 'Livro' : 'Aula'}${h && !igual ? ' · ' + escaparHtml(a.titulo) : ''}${destaque ? ' · próxima' : ''}</small></span><span class="seta" aria-hidden="true">›</span></a>` +
      `<button class="btn peq sec mais" type="button" data-a="menu" data-id="${a.id}" aria-label="Mais opções de ${escaparHtml(a.titulo)}" aria-haspopup="menu">⋯</button></div>`;
  };
  function grupos(m, aulas) {
    if (!aulas.length) return '';
    const ag = agoraLocal(), tem = (a) => !!a.inicio, fimOu = (a) => a.fim || a.inicio;
    const prox = aulas.filter((a) => tem(a) && fimOu(a) >= ag).sort((x, y) => x.inicio.localeCompare(y.inicio));
    const dadas = aulas.filter((a) => tem(a) && fimOu(a) < ag).sort((x, y) => y.inicio.localeCompare(x.inicio));
    const livros = aulas.filter((a) => !tem(a));
    const bloco = (titulo, itens, extra = '') => (itens.length ? `<h2 class="grupo">${titulo} <span>${itens.length}</span></h2><div class="card">${itens.map((a, i) => linha(m, a, extra === 'prox' && i === 0)).join('')}</div>` : '');
    return bloco('Próximas', prox, 'prox') + bloco('Livros e itens sem data', livros) +
      (dadas.length ? `<details class="dadas"${prox.length ? '' : ' open'}><summary class="btn sec">Já dadas · ${dadas.length}</summary><div class="card">${dadas.map((a) => linha(m, a, false)).join('')}</div></details>` : '');
  }

  raiz.onclick = (ev) => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    if (b.dataset.a === 'nova') { criando = true; erro = ''; desenhar(); }
    else if (b.dataset.a === 'cancelar') { criando = false; erro = ''; desenhar(); }
    else if (b.dataset.a === 'menu') { const id = Number(b.dataset.id); abrirMenu(b, [{ rotulo: 'Abrir', fazer: () => { location.hash = `#aula/${id}`; } }, { sep: true }, { rotulo: 'Excluir (vai para a lixeira)', perigo: true, fazer: () => excluir(id) }]); }
  };
  function excluir(id) {
    {
      const titulo = ctx.sessao.estado().aulas.find((a) => a.id === id)?.titulo;
      ctx.sessao.aplicar((e) => excluirAula(e, id, new Date().toISOString()));
      desenhar();
      ctx.aviso(`"${titulo}" foi para a lixeira.`, { texto: 'Desfazer', fazer: () => { ctx.sessao.aplicar((e) => restaurarAula(e, id)); desenhar(); } });
    }
  }
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
