export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

export interface DebouncedFn<Args extends unknown[]> {
  (...args: Args): void;
  // Persiste imediatamente a última chamada pendente (se houver), em vez
  // de esperar o timer normal — usado antes de trocar de mapa/desmontar
  // o componente/fechar a aba, pra não perder a pintura mais recente.
  flush: () => void;
}

// Debounce comum, mas com um teto: uma sequência de chamadas sem folga
// nenhuma entre elas (ex: pintura de tile em rajada, mais rápido que
// `delayMs`) nunca dispararia o debounce puro, deixando a mudança só na
// memória até o usuário parar de clicar. Aqui, mesmo sob chamadas
// contínuas, força um save a cada `maxWaitMs` no máximo.
//
// `fn` roda de forma serializada: nunca duas chamadas em voo ao mesmo
// tempo. Sem isso, o teto de espera cria disparos enquanto a chamada
// anterior ainda está em rede — como cada chamada manda o estado
// acumulado inteiro (não um diff), duas requisições concorrentes podem
// chegar ao servidor fora de ordem e a mais nova "vence" primeiro, sendo
// depois sobrescrita pela mais antiga que só chegou depois. Se uma
// chamada nova aparece enquanto a anterior ainda está em voo, ela espera
// a atual terminar e dispara de novo já com os dados mais recentes.
export function debounceWithMaxWait<Args extends unknown[]>(
  fn: (...args: Args) => void | Promise<void>,
  delayMs: number,
  maxWaitMs: number
): DebouncedFn<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: Args | undefined;
  let inFlight = false;

  function clearTimers() {
    if (timer) clearTimeout(timer);
    if (maxTimer) clearTimeout(maxTimer);
    timer = undefined;
    maxTimer = undefined;
  }

  async function run() {
    if (!pendingArgs || inFlight) return;
    const args = pendingArgs;
    pendingArgs = undefined;
    clearTimers();
    inFlight = true;
    try {
      await fn(...args);
    } finally {
      inFlight = false;
      // Chegou mudança nova enquanto essa gravação estava em voo — dispara
      // ela agora com o estado mais atual, em vez de esperar o próximo timer.
      if (pendingArgs) run();
    }
  }

  const call = ((...args: Args) => {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, delayMs);
    if (!maxTimer) maxTimer = setTimeout(run, maxWaitMs);
  }) as DebouncedFn<Args>;

  call.flush = () => {
    void run();
  };

  return call;
}
