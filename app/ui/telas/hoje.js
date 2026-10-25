// Tela Hoje (provisória: só o aviso de backup; o resto vem na Etapa 4).
import { escaparHtml } from '../../nucleo/texto.js';
import { situacaoBackup } from '../../nucleo/backup.js';
import { ativas } from '../../nucleo/materias.js';

/** `ctx.agora()` devolve a data de hoje (ISO); nos testes dá para simular outras datas. */
export function desenharHoje(raiz, ctx) {
  const estado = ctx.sessao.estado();
  const s = situacaoBackup(ctx.sessao.lerConfig('ultimo_backup'), ctx.agora(), ativas(estado.disciplinas).length > 0);
  raiz.innerHTML = '<h1>Hoje</h1><p class="sub">Em construção.</p>' +
    (s.estado === 'nada' ? '' : `<div class="aviso ${s.estado === 'ok' ? '' : 'ur'}" id="aviso-backup"><span>${escaparHtml(s.texto)}${s.estado === 'ok' ? '' : ' Faça um backup para não perder o que escreveu.'}</span><a href="#ajustes">Fazer backup</a></div>`);
}
