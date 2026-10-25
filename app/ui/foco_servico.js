// Serviço da Sala de Foco: guarda a sessão ativa, confere o relógio a cada segundo e grava os blocos concluídos.
// Vive enquanto o app está aberto, em qualquer tela; sem o app aberto não há aviso (o tempo, porém, continua certo:
// ao reabrir, `avancar` resolve tudo o que já acabou).
import { lerConfigFoco, iniciarBloco, avancar, abandonar, pularPausa } from '../nucleo/foco.js';
import { diaLocalDeMs } from '../nucleo/datas.js';

const deslocamento = () => -new Date().getTimezoneOffset();
export const diaDe = (ms) => diaLocalDeMs(ms, deslocamento());

function apitar(vezes = 2) {
  try {
    const c = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    for (let i = 0; i < vezes; i++) {
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * 0.35;
      o.frequency.value = 880; o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t); o.stop(t + 0.32);
    }
    setTimeout(() => c.close(), 1500);
  } catch { /* sem som: só a vibração e o aviso na tela */ }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* sem vibração */ }
}

export function criarServicoFoco(sessao, { aviso = () => {}, agora = () => Date.now() } = {}) {
  const ouvintes = new Set();
  let ativa = sessao.lerFocoAtivo(), ciclo = Number(sessao.lerConfig('foco_ciclo')) || 0;
  const config = () => lerConfigFoco(sessao.lerConfig);
  const avisar = () => ouvintes.forEach((f) => f());
  const guardar = () => { sessao.gravarFocoAtivo(ativa); sessao.gravarConfig('foco_ciclo', ciclo); };

  function conferir() {
    if (!ativa) return;
    const antes = ativa, r = avancar(ativa, agora(), config(), diaDe);
    if (r.sessao === antes && !r.registros.length) return;
    if (r.registros.length) sessao.registrarBlocos(r.registros);
    ativa = r.sessao; if (ativa) ciclo = ativa.ciclo; else if (antes.fase === 'pausa') ciclo = antes.ciclo; else ciclo = antes.ciclo + 1;
    guardar();
    if (r.registros.length) { apitar(2); aviso(ativa ? 'Bloco concluído! Hora da pausa.' : 'Bloco concluído e pausa terminada.'); }
    else { apitar(1); aviso('Pausa terminada. Pronto para o próximo bloco?'); }
    avisar();
  }

  const timer = setInterval(() => { conferir(); avisar(); }, 1000);
  conferir();

  return {
    ativa: () => ativa,
    config,
    ouvir(f) { ouvintes.add(f); return () => ouvintes.delete(f); },
    iniciar({ tarefa, disciplinaId, tipo = 'foco', minutos }) {
      if (ativa) throw new Error('Já existe um bloco em andamento.');
      const c = config();
      ativa = iniciarBloco(c, { tarefa, disciplinaId, tipo }, agora(), ciclo, minutos ?? c.foco_min);
      guardar(); avisar();
    },
    /** Abandona o bloco; devolve os minutos registrados (0 se foi menos de 1 minuto). */
    abandonar() {
      const r = abandonar(ativa, agora(), diaDe);
      if (r.registro) sessao.registrarBlocos([r.registro]);
      const feitos = r.registro?.minutos_feitos ?? 0;
      ativa = null; guardar(); avisar();
      return feitos;
    },
    pularPausa() { ativa = pularPausa(ativa); guardar(); avisar(); },
    parar() { clearInterval(timer); },
  };
}
