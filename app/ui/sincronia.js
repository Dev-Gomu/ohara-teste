// Serviço de sincronia da interface: login com o Google (só o escopo drive.appdata: a pasta do próprio app no Drive), quando sincronizar
// (ao abrir, ao voltar para o app, depois de mexer, ao voltar a internet) e o estado para a tela Ajustes mostrar. Sem aviso na tela
// a não ser quando os dois aparelhos mudaram (conflito) ou chegaram dados novos.
// O token do Google vale 1 hora e fica só na memória. Para renovar sem a pessoa fazer nada o Google exige um toque na página
// (senão o navegador bloqueia a janelinha); por isso, se o token vencer, a renovação espera o próximo toque e acontece sozinha.
import { criarSincronia } from '../armazenamento/sincronia.js';
import { criarNuvemDrive, ErroAutorizacao } from '../armazenamento/drive.js';
import * as pref from './preferencias.js';

export const CLIENT_ID = '299231084106-j5f03mrrti07jmoh09g2rlkpmst8fdr1.apps.googleusercontent.com';   // público por natureza (não é segredo)
const ESCOPO = 'https://www.googleapis.com/auth/drive.appdata';
const CHAVE = 'ohara.sincronia';
const ESPERA_MUDANCA_MS = 20000, INTERVALO_MIN_MS = 60000;

export function criarServicoSincronia({ sessao, foco, aoReceber = () => {}, aviso = () => {}, irParaAjustes = () => {} }) {
  const guardado = () => pref.lerJson(CHAVE, {}) ?? {};
  const salvar = (mudancas) => pref.gravarJson(CHAVE, { ...guardado(), ...mudancas });
  const ouvintes = new Set();
  let status = 'desligada', mensagem = '', conflito = null, token = null, expiraEm = 0, cliente = null, pedido = null, gisPronto = null;
  let timerMudanca = null, ultimaTentativa = 0;

  const avisar = () => ouvintes.forEach((f) => { try { f(); } catch { /* tela fechada */ } });
  const mudarStatus = (s, m = '') => { status = s; mensagem = m; avisar(); };

  // ---------- Google ----------
  function carregarGis() {
    if (gisPronto) return gisPronto;
    gisPronto = new Promise((ok, erro) => {
      if (globalThis.google?.accounts?.oauth2) return ok();
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => ok(); s.onerror = () => { gisPronto = null; erro(new Error('Sem internet para falar com o Google.')); };
      document.head.appendChild(s);
    });
    return gisPronto;
  }
  async function prepararCliente() {
    await carregarGis();
    if (cliente) return;
    cliente = globalThis.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: ESCOPO,
      callback: (r) => {
        if (r.error) { const p = pedido; pedido = null; p?.erro(new ErroAutorizacao(r.error === 'access_denied' ? 'A permissão foi negada.' : 'Não consegui entrar com o Google.')); return; }
        token = r.access_token; expiraEm = Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60000;
        const p = pedido; pedido = null; p?.ok();
      },
      error_callback: () => { const p = pedido; pedido = null; p?.erro(new ErroAutorizacao('A janela do Google foi fechada ou bloqueada.')); },
    });
  }
  /** Tem que ser chamada direto de um toque/clique (o navegador bloqueia a janelinha se não for). */
  function pedirComToque(prompt) {
    if (!cliente) return Promise.reject(new ErroAutorizacao('O Google ainda está carregando. Tente de novo em instantes.'));
    return new Promise((ok, erro) => { pedido = { ok, erro }; cliente.requestAccessToken({ prompt }); });
  }
  const obterToken = async () => { if (token && Date.now() < expiraEm) return token; throw new ErroAutorizacao(); };

  // ---------- motor ----------
  const nuvem = criarNuvemDrive({ obterToken });
  const motor = criarSincronia({
    nuvem, podeReceber: () => !foco?.ativa?.(),
    troca: {
      gerarPacote: () => sessao.gerarPacoteTroca(false),
      analisarPacote: (zip) => sessao.analisarPacoteTroca(zip),
      aplicarPacote: (zip, analise, escolha) => sessao.aplicarPacoteTroca(zip, analise, escolha),
    },
  });

  let esperandoToque = false;
  function esperarToque() {
    if (esperandoToque) return; esperandoToque = true;
    const tratar = () => {
      esperandoToque = false; removeEventListener('pointerdown', tratar, true); removeEventListener('keydown', tratar, true);
      pedirComToque('').then(() => sincronizar('toque'), () => mudarStatus('toque', 'Toque em "Sincronizar agora" em Ajustes para entrar de novo.'));
    };
    addEventListener('pointerdown', tratar, true); addEventListener('keydown', tratar, true);
  }

  async function sincronizar(motivo = 'manual') {
    if (!guardado().ligada || motor.ocupada) return;
    ultimaTentativa = Date.now();
    mudarStatus('sincronizando');
    try {
      const r = await motor.sincronizar();
      conflito = null;
      if (r.resultado === 'conflito') {
        conflito = { analise: r.analise, zip: r.zip };
        mudarStatus('conflito', 'Os dois aparelhos mudaram desde a última sincronização.');
        aviso('Os dois aparelhos mudaram. Escolha qual versão manter.', { texto: 'Ver', fazer: irParaAjustes });
        return;
      }
      if (r.resultado === 'adiado') { mudarStatus('ok'); return; }
      salvar({ ultima: new Date().toISOString() });
      mudarStatus('ok');
      if (r.resultado === 'recebido') { aoReceber(); aviso('Dados atualizados com o outro aparelho.'); }
    } catch (e) {
      if (e instanceof ErroAutorizacao) { mudarStatus('toque', 'Falta entrar de novo com o Google (acontece sozinho no próximo toque).'); esperarToque(); }
      else if (e instanceof TypeError || globalThis.navigator?.onLine === false) mudarStatus('offline', 'Sem internet agora. Sincroniza quando voltar.');
      else mudarStatus('erro', e.message);
    }
  }

  // ---------- gatilhos ----------
  function agendarAposMudanca() {
    if (!guardado().ligada) return;
    clearTimeout(timerMudanca); timerMudanca = setTimeout(() => sincronizar('mudou'), ESPERA_MUDANCA_MS);
  }
  let iniciado = false;
  function iniciar() {
    if (iniciado) return; iniciado = true;
    sessao.aoGravar(agendarAposMudanca);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - ultimaTentativa > INTERVALO_MIN_MS) sincronizar('voltou'); });
    addEventListener('online', () => sincronizar('internet'));
    if (guardado().ligada) { mudarStatus('sincronizando'); prepararCliente().then(() => sincronizar('abrir')).catch((e) => mudarStatus('offline', e.message)); }
  }

  return {
    iniciar,
    /** O que a tela Ajustes precisa mostrar. */
    estado: () => ({ ligada: !!guardado().ligada, status: guardado().ligada ? status : 'desligada', mensagem, ultima: guardado().ultima ?? null, conflito: conflito ? { origem: conflito.analise.origem, geradoEm: conflito.analise.geradoEm, resumo: conflito.analise.resumo, faltam: conflito.analise.faltam, motivo: conflito.analise.motivo } : null }),
    ouvir(f) { ouvintes.add(f); return () => ouvintes.delete(f); },
    /** Carrega o script do Google antes de o usuário apertar "Ligar" (o toque precisa chamar o Google na hora). */
    preparar: () => prepararCliente().catch((e) => mudarStatus(guardado().ligada ? 'offline' : 'desligada', e.message)),
    /** Chamar direto do clique em "Ligar" (sem await antes). */
    ligar() {
      return pedirComToque('consent').then(() => { salvar({ ligada: true }); return sincronizar('ligar'); }, (e) => { mudarStatus('desligada', e.message); });
    },
    /** Chamar direto do clique em "Sincronizar agora". Se o token venceu, pede de novo (sem tela se o Google já conhece o app). */
    agora() {
      if (token && Date.now() < expiraEm) return sincronizar('manual');
      return pedirComToque('').then(() => sincronizar('manual'), (e) => mudarStatus('toque', e.message));
    },
    desligar() { salvar({ ligada: false }); clearTimeout(timerMudanca); conflito = null; if (token) { try { globalThis.google.accounts.oauth2.revoke(token); } catch { /* tanto faz */ } token = null; } mudarStatus('desligada'); },
    /** 'pacote' = ficar com o da nuvem (a versão daqui volta como arquivo); 'meu' = ficar com o daqui. Devolve { trocou, copiaLocal }. */
    async resolverConflito(escolha) {
      if (!conflito) return { trocou: false, copiaLocal: null };
      const c = conflito, r = await sessao.aplicarPacoteTroca(c.zip, c.analise, escolha);
      conflito = null; mudarStatus('ok');
      if (r.trocou) aoReceber();
      sincronizar('resolvido');
      return r;
    },
  };
}
