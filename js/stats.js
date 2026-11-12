import { avg } from "./utils.js";

// "Técnico" é uma categoria especial do campo Posição — usada pra cadastrar
// comissão técnica (que pode ter direito a voto na Avaliação) sem que eles
// apareçam nas listagens de jogadores (escalação, ranking, escalação ideal).
export const POSICAO_TECNICO = "Técnico";
export function ehJogador(atleta){
  return !!atleta && atleta.posicao !== POSICAO_TECNICO;
}

// Jogos "realizados" são os que entram nas estatísticas (jogos agendados/futuros não contam).
export function jogosRealizados(jogos){
  return jogos.filter(j => j.status === "realizado");
}

// ----------------------------------------------------------------------------
// Gols e assistências
// ----------------------------------------------------------------------------

// Valor especial usado no lugar de um atletaId em golsAssistencias quando o
// gol foi contra (o adversário marcou contra o próprio time) — conta pro
// placar/total de gols do time, mas não é creditado a nenhum atleta.
export const GOL_CONTRA_ID = "GOL_CONTRA";

// Opções de "como foi o gol" e "qual tempo", usadas no formulário de eventos.
export const TIPOS_GOL = ["Finalização", "Cabeceio", "Falta", "Pênalti"];
export const TEMPOS_JOGO = ["1º tempo", "2º tempo"];

export function golsEAssistenciasPorAtleta(jogos){
  const map = {}; // atletaId -> { gols, assistencias }
  const bump = (id, key) => {
    if (!id) return;
    if (!map[id]) map[id] = { gols: 0, assistencias: 0 };
    map[id][key]++;
  };
  jogosRealizados(jogos).forEach(j => {
    (j.golsAssistencias || []).forEach(evt => {
      if (evt.atletaGolId && evt.atletaGolId !== GOL_CONTRA_ID) bump(evt.atletaGolId, "gols");
      if (evt.atletaAssistId) bump(evt.atletaAssistId, "assistencias");
    });
  });
  return map;
}

export function totalGols(jogos){
  return jogosRealizados(jogos).reduce((sum, j) => sum + (j.golsAssistencias?.length || 0), 0);
}

export function totalAssistencias(jogos){
  return jogosRealizados(jogos).reduce((sum, j) =>
    sum + (j.golsAssistencias || []).filter(e => !!e.atletaAssistId).length, 0);
}

export function rankingGolsAssistencias(atletas, jogos){
  const map = golsEAssistenciasPorAtleta(jogos);
  return atletas
    .map(a => ({
      atleta: a,
      gols: map[a.id]?.gols || 0,
      assistencias: map[a.id]?.assistencias || 0,
    }))
    .filter(r => r.gols > 0 || r.assistencias > 0)
    .sort((a, b) => (b.gols + b.assistencias) - (a.gols + a.assistencias) || b.gols - a.gols);
}

// Atletas que estiveram escalados numa partida (inicial ou final), sem duplicar.
export function jogadoresDaPartida(jogo, atletas){
  const ids = new Set([
    ...normalizeEscalacao(jogo.escalacaoInicial).map(e => e.atletaId),
    ...normalizeEscalacao(jogo.escalacaoFinal).map(e => e.atletaId),
  ]);
  return atletas.filter(a => ids.has(a.id) && ehJogador(a));
}

// Quantidade de partidas realizadas em que o atleta esteve escalado
// (na inicial ou na final), independente de ter marcado gol/assistência.
export function contagemJogosPorAtleta(jogos){
  const map = {};
  jogosRealizados(jogos).forEach(j => {
    const ids = new Set([
      ...normalizeEscalacao(j.escalacaoInicial).map(e => e.atletaId),
      ...normalizeEscalacao(j.escalacaoFinal).map(e => e.atletaId),
    ]);
    ids.forEach(id => { map[id] = (map[id] || 0) + 1; });
  });
  return map;
}

// Estatísticas combinadas de cada atleta (jogos, gols, assistências, nota
// média), calculadas a partir de um conjunto de jogos já filtrado (por
// período ou por partida específica) — usado na tela de Ranking.
export function statsPorAtleta(atletas, jogos, votanteIds = null){
  const gaMap = golsEAssistenciasPorAtleta(jogos);
  const jogosMap = contagemJogosPorAtleta(jogos);
  return atletas.map(a => {
    const { media, qtd } = mediaNotaAtleta(a.id, jogos, votanteIds);
    return {
      atleta: a,
      jogosCount: jogosMap[a.id] || 0,
      gols: gaMap[a.id]?.gols || 0,
      assistencias: gaMap[a.id]?.assistencias || 0,
      media,
      qtdAvaliacoes: qtd,
    };
  });
}

// ----------------------------------------------------------------------------
// Escalação — posição jogada em cada partida
// ----------------------------------------------------------------------------

// Aceita tanto o formato novo (array de {atletaId, posicao}) quanto o antigo
// (array de ids em string, de jogos criados antes desse recurso existir).
export function normalizeEscalacao(arr){
  return (arr || [])
    .map(e => typeof e === "string" ? { atletaId: e, posicao: null } : { atletaId: e?.atletaId, posicao: e?.posicao || null })
    .filter(e => !!e.atletaId);
}

// Posição em que o atleta atuou numa partida específica: prioriza a escalação
// final (reflete o que de fato aconteceu em campo, incluindo substituições),
// caindo para a inicial se só ela tiver a posição informada.
export function posicaoJogadaNoJogo(jogo, atletaId){
  const buscar = (field) => normalizeEscalacao(jogo?.[field]).find(e => e.atletaId === atletaId)?.posicao || null;
  return buscar("escalacaoFinal") || buscar("escalacaoInicial");
}

// ----------------------------------------------------------------------------
// Avaliações — suportam múltiplos votantes por partida (diretores/capitão).
// Formato em jogo.avaliacoesJogadores: { [atletaId]: { [votanteId]: { nota, obs } } }.
// Partidas antigas (de antes desse recurso) guardam { [atletaId]: { nota, obs } }
// direto, sem identificar quem votou — esse formato "achatado" continua sendo
// lido normalmente, só sem separar por votante.
// ----------------------------------------------------------------------------

// Todas as notas atribuídas a um atleta numa partida. Por padrão conta os
// votos de todo mundo; passando `votanteIds` (array de ids), conta só os
// votos de quem está nessa lista — usado no filtro "quem votou" do Ranking.
export function notasDoAtletaNoJogo(jogo, atletaId, votanteIds = null){
  const entry = jogo?.avaliacoesJogadores?.[atletaId];
  if (!entry) return [];
  if (typeof entry.nota === "number"){
    // Formato antigo (nota única, sem votante identificado) — se um filtro
    // de votante específico foi pedido, não dá pra saber quem votou, então
    // essa nota fica de fora (evita contar um voto "sem dono" como se fosse
    // de alguém que a pessoa selecionou).
    return votanteIds && votanteIds.length > 0 ? [] : [entry.nota];
  }
  const chaves = votanteIds && votanteIds.length > 0 ? votanteIds : Object.keys(entry);
  return chaves.map(id => entry[id]?.nota).filter(n => typeof n === "number");
}

// Nota que um votante específico deu a um atleta numa partida (ou null, se ele
// ainda não votou ou se a partida só tem o formato antigo sem votante identificado).
export function notaDoVotanteNoJogo(jogo, atletaId, votanteId){
  const entry = jogo?.avaliacoesJogadores?.[atletaId];
  if (!entry || typeof entry.nota === "number") return null;
  return typeof entry[votanteId]?.nota === "number" ? entry[votanteId].nota : null;
}

// Nota média de todos os jogadores avaliados numa partida específica — usada
// para o ranking "melhores partidas" do Dashboard.
export function mediaNotaJogadoresNoJogo(jogo){
  const todas = [];
  Object.keys(jogo?.avaliacoesJogadores || {}).forEach(atletaId => {
    todas.push(...notasDoAtletaNoJogo(jogo, atletaId));
  });
  return { media: avg(todas), qtd: todas.length };
}

export function mediaNotaAtleta(atletaId, jogos, votanteIds = null){
  const notas = [];
  jogosRealizados(jogos).forEach(j => notas.push(...notasDoAtletaNoJogo(j, atletaId, votanteIds)));
  return { media: avg(notas), qtd: notas.length };
}

// Notas médias de cada atleta separadas pela posição que ele efetivamente
// jogou em cada partida (não a posição de cadastro). Um atleta que já jogou
// de Zagueiro em alguns jogos e de Lateral em outros terá uma média para
// cada posição. Se a partida não tiver posição informada (jogos antigos),
// usa a posição de cadastro do atleta como fallback só para não perder o dado.
export function notasPorPosicao(atletas, jogos){
  const map = {}; // atletaId -> { posicao -> notas[] }
  jogosRealizados(jogos).forEach(j => {
    Object.keys(j.avaliacoesJogadores || {}).forEach(atletaId => {
      const notas = notasDoAtletaNoJogo(j, atletaId);
      if (notas.length === 0) return;
      const atleta = atletas.find(a => a.id === atletaId);
      const posicao = posicaoJogadaNoJogo(j, atletaId) || atleta?.posicao || null;
      if (!posicao) return;
      if (!map[atletaId]) map[atletaId] = {};
      if (!map[atletaId][posicao]) map[atletaId][posicao] = [];
      map[atletaId][posicao].push(...notas);
    });
  });
  const result = {};
  Object.entries(map).forEach(([atletaId, porPosicao]) => {
    result[atletaId] = {};
    Object.entries(porPosicao).forEach(([posicao, notas]) => {
      result[atletaId][posicao] = { media: avg(notas), qtd: notas.length };
    });
  });
  return result;
}

export function mediaGeralJogadores(jogos){
  const todasNotas = [];
  jogosRealizados(jogos).forEach(j => {
    Object.keys(j.avaliacoesJogadores || {}).forEach(atletaId => {
      todasNotas.push(...notasDoAtletaNoJogo(j, atletaId));
    });
  });
  return avg(todasNotas);
}

export function mediaCampo(campoId, jogos){
  const notas = jogosRealizados(jogos)
    .filter(j => j.campoId === campoId)
    .map(j => j.avaliacaoCampo?.nota)
    .filter(n => typeof n === "number");
  return { media: avg(notas), qtd: notas.length };
}

export function mediaAdversario(adversarioId, jogos){
  const notas = jogosRealizados(jogos)
    .filter(j => j.adversarioId === adversarioId)
    .map(j => j.avaliacaoAdversario?.nota)
    .filter(n => typeof n === "number");
  return { media: avg(notas), qtd: notas.length };
}

export function mediaGeralCampos(jogos){
  return avg(jogosRealizados(jogos).map(j => j.avaliacaoCampo?.nota).filter(n => typeof n === "number"));
}

export function mediaGeralAdversarios(jogos){
  return avg(jogosRealizados(jogos).map(j => j.avaliacaoAdversario?.nota).filter(n => typeof n === "number"));
}

// ----------------------------------------------------------------------------
// Contagens / resultado
// ----------------------------------------------------------------------------
export function contagemJogosPorCampo(jogos){
  const map = {};
  jogosRealizados(jogos).forEach(j => { if (j.campoId) map[j.campoId] = (map[j.campoId] || 0) + 1; });
  return map;
}

export function contagemJogosPorAdversario(jogos){
  const map = {};
  jogosRealizados(jogos).forEach(j => { if (j.adversarioId) map[j.adversarioId] = (map[j.adversarioId] || 0) + 1; });
  return map;
}

// Saldo de gols do time (gols feitos - gols tomados), com base no placar de
// cada partida realizada — não na contagem de eventos de gol registrados,
// para refletir o placar oficial mesmo que algum gol não tenha sido detalhado.
export function saldoGols(jogos){
  const realizados = jogosRealizados(jogos);
  const feitos = realizados.reduce((s, j) => s + (j.placarNos ?? 0), 0);
  const sofridos = realizados.reduce((s, j) => s + (j.placarAdversario ?? 0), 0);
  return { feitos, sofridos, saldo: feitos - sofridos };
}

export function resultadoJogo(jogo){
  if (jogo.placarNos === null || jogo.placarNos === undefined || jogo.placarAdversario === null || jogo.placarAdversario === undefined){
    return null;
  }
  if (jogo.placarNos > jogo.placarAdversario) return "vitoria";
  if (jogo.placarNos < jogo.placarAdversario) return "derrota";
  return "empate";
}

// Desempate de jogo empatado no tempo normal (pênaltis ou critério de
// festival/WO). Nas estatísticas o jogo segue como empate; isso é só um selo.
// Retorna null se não houver desempate válido.
export function desempateJogo(jogo){
  if (!jogo || resultadoJogo(jogo) !== "empate") return null;
  const num = (v) => typeof v === "number" && !isNaN(v);
  if (jogo.decisao === "penaltis" && num(jogo.penaltisNos) && num(jogo.penaltisAdversario) && jogo.penaltisNos !== jogo.penaltisAdversario){
    const nos = jogo.penaltisNos > jogo.penaltisAdversario;
    return {
      tipo: "penaltis", vencedor: nos ? "nos" : "adversario",
      texto: `${nos ? "venceu" : "perdeu"} nos pênaltis (${jogo.penaltisNos}x${jogo.penaltisAdversario})`,
    };
  }
  if (jogo.decisao === "criterio" && (jogo.criterioVencedor === "nos" || jogo.criterioVencedor === "adversario")){
    const nos = jogo.criterioVencedor === "nos";
    const motivo = (jogo.criterioMotivo || "").trim();
    return {
      tipo: "criterio", vencedor: jogo.criterioVencedor,
      texto: `${nos ? "vitória" : "derrota"} por critério${motivo ? ` (${motivo})` : ""}`,
    };
  }
  return null;
}

export function resumoGeral(jogos){
  const realizados = jogosRealizados(jogos);
  let vitorias = 0, empates = 0, derrotas = 0;
  realizados.forEach(j => {
    const r = resultadoJogo(j);
    if (r === "vitoria") vitorias++;
    else if (r === "empate") empates++;
    else if (r === "derrota") derrotas++;
  });
  return {
    qtdJogos: realizados.length,
    qtdGols: totalGols(jogos),
    qtdAssistencias: totalAssistencias(jogos),
    mediaJogadores: mediaGeralJogadores(jogos),
    mediaCampo: mediaGeralCampos(jogos),
    mediaAdversario: mediaGeralAdversarios(jogos),
    vitorias, empates, derrotas,
  };
}
