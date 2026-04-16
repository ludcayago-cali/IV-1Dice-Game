const SIZE = 8;
const WIN_ROUNDS = 2;
const BLOCK_COUNT = 15;

const boardEl = document.getElementById("board");
const rollBtn = document.getElementById("rollBtn");
const endTurnBtn = document.getElementById("endTurnBtn");
const newRoundBtn = document.getElementById("newRoundBtn");
const resetMatchBtn = document.getElementById("resetMatchBtn");
const turnText = document.getElementById("turnText");
const phaseText = document.getElementById("phaseText");
const diceText = document.getElementById("diceText");
const roundText = document.getElementById("roundText");
const p1ScoreEl = document.getElementById("p1Score");
const p2ScoreEl = document.getElementById("p2Score");
const p1PosEl = document.getElementById("p1Pos");
const p2PosEl = document.getElementById("p2Pos");
const p1DiceEl = document.getElementById("p1Dice");
const p2DiceEl = document.getElementById("p2Dice");
const resultValueEl = document.getElementById("resultValue");
const resultPopup = document.getElementById("resultPopup");
const resultPopupText = document.getElementById("resultPopupText");
const resultPopupSubtext = document.getElementById("resultPopupSubtext");
const resultNextBtn = document.getElementById("resultNextBtn");

const TILESET = {
  actor: {
    p1Left: "assets/orc-idle2.gif",
    p1Right: "assets/orc-idle1.gif",
    p2: "assets/red-removebg-preview.png",
  },
  ground: {
    floor1: "assets/tile-floor1.png",
    floor2: "assets/tile-floor2.png",
    grass1: "assets/tile-grass1.png",
    grass2: "assets/tile-grass2.png",
  },
  block: {
    crate: "assets/d-tile1.png",
    bush: "assets/d-tile2.png",
  }
};

const state = {
  board: [],
  currentPlayer: 1,
  phase: "roll",
  dice: null,
  movesRemaining: 0,
  round: 1,
  scores: { 1: 0, 2: 0 },
  winner: null,
  validMoves: [],
  planningPath: [],
  selectedTile: null,
  players: {
    1: { row: 0, col: 0 },
    2: { row: SIZE - 1, col: SIZE - 1 },
  },
  prevPositions: { 1: null, 2: null },
  lastMove: null,
  facing: {
    1: "right",
    2: "left",
  },
};

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function randInt(max) { return Math.floor(Math.random() * max); }
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function inBounds(row, col) { return row >= 0 && row < SIZE && col >= 0 && col < SIZE; }
function getOpponent(player) { return player === 1 ? 2 : 1; }
function coordLabel(pos) { return `(${pos.row + 1},${pos.col + 1})`; }
function manhattan(a, b) { return Math.abs(a.row - b.row) + Math.abs(a.col - b.col); }
function keyOf(row, col) { return `${row},${col}`; }

function isOccupied(row, col, tempPlayers = state.players, ignorePlayer = null) {
  for (const key of [1, 2]) {
    if (ignorePlayer && key === ignorePlayer) continue;
    const p = tempPlayers[key];
    if (p.row === row && p.col === col) return true;
  }
  return false;
}

function updateFacing(player) {
  const opponent = getOpponent(player);
  const me = state.players[player];
  const opp = state.players[opponent];
  if (me.col < opp.col) state.facing[player] = "right";
  else if (me.col > opp.col) state.facing[player] = "left";
}

function getPlayer1Sprite() {
  return state.facing[1] === "left" ? TILESET.actor.p1Left : TILESET.actor.p1Right;
}

function mixedGroundFor(row, col) {
  const v = (row * 7 + col * 11) % 4;
  if (v === 0) return "floor1";
  if (v === 1) return "grass1";
  if (v === 2) return "floor2";
  return "grass2";
}

function createEmptyBoard() {
  return Array.from({ length: SIZE }, (_, row) =>
    Array.from({ length: SIZE }, (_, col) => ({
      row,
      col,
      blocked: false,
      ground: mixedGroundFor(row, col),
      blockType: null,
    }))
  );
}

function allTiles() {
  const out = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) out.push({ row, col });
  }
  return out;
}

function getAdjacentMovesForPlayer(player, tempPlayers = state.players, board = state.board) {
  const me = tempPlayers[player];
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  const moves = [];
  for (const [dr, dc] of dirs) {
    const nr = me.row + dr;
    const nc = me.col + dc;
    if (!inBounds(nr, nc)) continue;
    if (board[nr][nc].blocked) continue;
    if (isOccupied(nr, nc, tempPlayers, player)) continue;
    moves.push({ row: nr, col: nc });
  }
  return moves;
}

function hasEscape(player, tempPlayers = state.players, board = state.board) {
  return getAdjacentMovesForPlayer(player, tempPlayers, board).length > 0;
}

function hasPathBetween(start, end, board, tempPlayers = null) {
  const q = [{ row: start.row, col: start.col }];
  const seen = new Set([keyOf(start.row, start.col)]);
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  while (q.length) {
    const cur = q.shift();
    if (cur.row === end.row && cur.col === end.col) return true;
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      const key = keyOf(nr, nc);
      if (!inBounds(nr, nc)) continue;
      if (seen.has(key)) continue;
      if (board[nr][nc].blocked) continue;
      if (tempPlayers && isOccupied(nr, nc, tempPlayers) && !(nr === end.row && nc === end.col)) continue;
      seen.add(key);
      q.push({ row: nr, col: nc });
    }
  }
  return false;
}

function buildRandomBoardAndSpawns() {
  const tiles = allTiles();
  for (let attempt = 0; attempt < 1200; attempt++) {
    const board = createEmptyBoard();
    const shuffled = shuffle(tiles);
    let p1 = null;
    let p2 = null;
    for (let i = 0; i < shuffled.length; i++) {
      for (let j = i + 1; j < shuffled.length; j++) {
        const a = shuffled[i];
        const b = shuffled[j];
        if (manhattan(a, b) >= 6) {
          p1 = { ...a };
          p2 = { ...b };
          break;
        }
      }
      if (p1 && p2) break;
    }
    if (!p1 || !p2) {
      p1 = { ...shuffled[0] };
      p2 = { ...shuffled[1] };
    }

    const blockedCandidates = shuffle(
      tiles.filter(t => !(t.row === p1.row && t.col === p1.col) && !(t.row === p2.row && t.col === p2.col))
    ).slice(0, BLOCK_COUNT);

    for (const tile of blockedCandidates) {
      board[tile.row][tile.col].blocked = true;
      board[tile.row][tile.col].blockType = Math.random() < 0.5 ? "crate" : "bush";
    }

    const tempPlayers = { 1: p1, 2: p2 };
    if (!hasEscape(1, tempPlayers, board)) continue;
    if (!hasEscape(2, tempPlayers, board)) continue;
    if (!hasPathBetween(p1, p2, board, tempPlayers)) continue;
    return { board, p1, p2 };
  }

  const board = createEmptyBoard();
  return { board, p1: { row: 7, col: 7 }, p2: { row: 0, col: 0 } };
}

function getCrateStackType(row, col) {
  const isCrate = (r, c) =>
    inBounds(r, c) &&
    state.board[r][c].blocked &&
    state.board[r][c].blockType === "crate";

  const up = isCrate(row - 1, col);
  const down = isCrate(row + 1, col);

  if (up && down) return "crate-middle";
  if (down && !up) return "crate-top";
  if (up && !down) return "crate-bottom";
  return "crate-single";
}

function startRound(resetScores = false) {
  const generated = buildRandomBoardAndSpawns();
  state.board = generated.board;
  state.players[1] = { ...generated.p1 };
  state.players[2] = { ...generated.p2 };
  state.prevPositions = { 1: null, 2: null };
  state.lastMove = null;
  state.phase = "roll";
  state.currentPlayer = state.round % 2 === 1 ? 1 : 2;
  state.dice = null;
  state.movesRemaining = 0;
  state.validMoves = [];
  state.planningPath = [];
  state.selectedTile = null;
  state.winner = null;
  updateFacing(1);
  updateFacing(2);

  if (resetScores) {
    state.scores[1] = 0;
    state.scores[2] = 0;
    state.round = 1;
    state.currentPlayer = 1;
  }

  renderAll();
  if (state.currentPlayer === 2) runBotTurn();
}

function renderTileEngine() {
  boardEl.innerHTML = "";
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const cellData = state.board[row][col];
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";

      const ground = document.createElement("div");
      ground.className = "layer ground";
      ground.style.backgroundImage = `url('${TILESET.ground[cellData.ground]}')`;
      cell.appendChild(ground);

      const valid = state.validMoves.some(m => m.row === row && m.col === col);
      if (valid) {
        const fx = document.createElement("div");
        fx.className = "layer fx valid";
        cell.appendChild(fx);
      }

      const inPath = state.planningPath.some(m => m.row === row && m.col === col);
      if (inPath) {
        const fx = document.createElement("div");
        fx.className = "layer fx path";
        cell.appendChild(fx);
      }

      const selected = state.selectedTile && state.selectedTile.row === row && state.selectedTile.col === col;
      if (selected) {
        const fx = document.createElement("div");
        fx.className = "layer fx selected";
        cell.appendChild(fx);
      }

      if (cellData.blocked) {
        const block = document.createElement("div");
        let extra = "";
        if (cellData.blockType === "crate") extra = getCrateStackType(row, col);
        block.className = `layer block ${cellData.blockType} ${extra}`.trim();
        block.style.backgroundImage = `url('${TILESET.block[cellData.blockType]}')`;
        cell.appendChild(block);
      }

      if (state.players[1].row === row && state.players[1].col === col) {
        const actor = document.createElement("div");
        actor.className = "layer actor p1";
        const p1Sprite = getPlayer1Sprite();
        actor.style.backgroundImage = `url('${p1Sprite}')`;
        if (state.lastMove?.player === 1 && state.prevPositions[1]) {
          const prev = state.prevPositions[1];
          actor.style.setProperty("--from-x", `${(prev.col - col) * 100}%`);
          actor.style.setProperty("--from-y", `${(prev.row - row) * 100}%`);
          actor.classList.add("slide-in");
        }
        cell.appendChild(actor);
      }

      if (state.players[2].row === row && state.players[2].col === col) {
        const actor = document.createElement("div");
        actor.className = "layer actor p2";
        actor.style.backgroundImage = `url('${TILESET.actor.p2}')`;
        if (state.lastMove?.player === 2 && state.prevPositions[2]) {
          const prev = state.prevPositions[2];
          actor.style.setProperty("--from-x", `${(prev.col - col) * 100}%`);
          actor.style.setProperty("--from-y", `${(prev.row - row) * 100}%`);
          actor.classList.add("slide-in");
        }
        cell.appendChild(actor);
      }

      cell.addEventListener("click", () => onTileClick(row, col));
      boardEl.appendChild(cell);
    }
  }
}

function renderUI() {
  const planning = state.phase === "move" && state.currentPlayer === 1 && state.planningPath.length > 0;
  turnText.textContent =
    state.phase === "roundOver"
      ? `${state.winner === 1 ? "Player 1" : "Bot"} wins Round ${state.round}`
      : `${state.currentPlayer === 1 ? "Player 1" : "Bot"} turn`;

  if (state.phase === "roll") {
    phaseText.textContent = state.currentPlayer === 1 ? "Click Roll Dice to begin." : "Bot is thinking...";
  } else if (state.phase === "move") {
    if (state.currentPlayer === 1) {
      phaseText.textContent = planning
        ? `Plan route: ${state.planningPath.length}/${state.dice} step(s)`
        : "Tap adjacent tiles to plan your route.";
    } else {
      phaseText.textContent = "Bot is moving...";
    }
  } else {
    phaseText.textContent = "Round complete.";
  }

  roundText.textContent = `Round ${state.round} of 3`;
  diceText.textContent = state.dice == null ? "Dice: -" : `Dice: ${state.dice} | Planned: ${state.planningPath.length}/${state.movesRemaining + state.planningPath.length}`;
  p1ScoreEl.textContent = String(state.scores[1]);
  p2ScoreEl.textContent = String(state.scores[2]);
  p1PosEl.textContent = coordLabel(state.players[1]);
  p2PosEl.textContent = coordLabel(state.players[2]);
  p1DiceEl.textContent = state.currentPlayer === 1 && state.dice != null ? `Die ${state.dice}` : "Die -";
  p2DiceEl.textContent = state.currentPlayer === 2 && state.dice != null ? `Die ${state.dice}` : "Die -";
  resultValueEl.textContent = state.dice == null ? "-" : String(state.dice);

  rollBtn.disabled = !(state.phase === "roll" && state.currentPlayer === 1);
  endTurnBtn.disabled = !(state.phase === "move" && state.currentPlayer === 1 && state.movesRemaining === 0);
  newRoundBtn.disabled = !(state.phase === "roundOver");
}

function renderAll() { renderTileEngine(); renderUI(); }

function getPlanningOrigin() {
  if (state.planningPath.length) return state.planningPath[state.planningPath.length - 1];
  return state.players[1];
}

function refreshPlanningMoves() {
  if (!(state.phase === "move" && state.currentPlayer === 1)) {
    state.validMoves = [];
    return;
  }

  if (state.movesRemaining <= 0) {
    state.validMoves = [];
    return;
  }

  const origin = getPlanningOrigin();
  const tempPlayers = { 1: { row: origin.row, col: origin.col }, 2: { ...state.players[2] } };
  state.validMoves = getAdjacentMovesForPlayer(1, tempPlayers);
}

async function animateStep(player, row, col) {
  state.prevPositions[player] = { ...state.players[player] };
  state.players[player].row = row;
  state.players[player].col = col;
  updateFacing(1);
  updateFacing(2);
  state.selectedTile = { row, col };
  state.lastMove = { player, row, col };
  requestAnimationFrame(renderAll);
  await delay(220);
}

async function executePlannedPath(player) {
  const route = [...state.planningPath];
  state.validMoves = [];
  renderAll();

  for (const step of route) {
    await delay(110);
    await animateStep(player, step.row, step.col);
  }

  state.planningPath = [];
  state.selectedTile = null;
  state.movesRemaining = 0;
  updateFacing(1);

  const ended = await maybeFinishAfterMove(player);
  if (ended) return;

  nextTurn();
}

async function finishRound(winner) {
  state.winner = winner;
  state.phase = "roundOver";
  state.validMoves = [];
  state.planningPath = [];
  state.movesRemaining = 0;
  state.dice = null;
  state.scores[winner] += 1;
  updateFacing(1);
  updateFacing(2);
  renderAll();

  const matchOver = state.scores[winner] >= WIN_ROUNDS;
  resultPopupText.textContent = winner === 1 ? "YOU WIN" : "YOU LOST";
  resultPopupSubtext.textContent = matchOver ? "Series decided." : "Tap Next Round to continue.";
  resultNextBtn.textContent = matchOver ? "New Match" : "Next Round";
  resultPopup.classList.remove("hidden");
}

async function maybeFinishAfterMove(player) {
  const opponent = getOpponent(player);
  const mePos = state.players[player];
  const oppPos = state.players[opponent];

  if (!hasEscape(opponent)) {
    await finishRound(player);
    return true;
  }

  if (manhattan(mePos, oppPos) === 1) {
    await finishRound(player);
    return true;
  }
  return false;
}

function nextTurn() {
  state.currentPlayer = getOpponent(state.currentPlayer);
  state.phase = "roll";
  state.dice = null;
  state.movesRemaining = 0;
  state.validMoves = [];
  state.planningPath = [];
  state.selectedTile = null;
  updateFacing(1);
  updateFacing(2);
  renderAll();

  if (!hasEscape(state.currentPlayer)) {
    finishRound(getOpponent(state.currentPlayer));
    return;
  }

  if (state.currentPlayer === 2) runBotTurn();
}

async function onTileClick(row, col) {
  if (state.locked) return;
  if (!(state.phase === "move" && state.currentPlayer === 1)) return;
  const valid = state.validMoves.some(m => m.row === row && m.col === col);
  if (!valid) return;

  state.planningPath.push({ row, col });
  state.selectedTile = { row, col };
  state.movesRemaining = Math.max(0, state.movesRemaining - 1);

  if (state.movesRemaining <= 0) {
    renderAll();
    await executePlannedPath(1);
    return;
  }

  refreshPlanningMoves();
  renderAll();
}

function rollDiceForPlayer(player) {
  state.dice = randInt(6) + 1;
  state.movesRemaining = state.dice;
  state.phase = "move";
  state.planningPath = [];
  if (player === 1) {
    refreshPlanningMoves();
  } else {
    state.validMoves = getAdjacentMovesForPlayer(player);
  }
  renderAll();
}

function chooseBotMove() {
  const bot = 2;
  const human = 1;
  const moves = getAdjacentMovesForPlayer(bot);
  if (!moves.length) return null;

  let best = null;
  for (const move of moves) {
    const tempPlayers = { 1: { ...state.players[1] }, 2: { ...state.players[2] } };
    tempPlayers[bot].row = move.row;
    tempPlayers[bot].col = move.col;

    const humanEscapes = getAdjacentMovesForPlayer(human, tempPlayers).length;
    const adjacentNow = manhattan(move, tempPlayers[human]) === 1;
    const winsNow = !hasEscape(human, tempPlayers);
    const distance = manhattan(move, tempPlayers[human]);

    let score =
      (winsNow ? 5000 : 0) +
      (adjacentNow ? 700 : 0) +
      (12 - Math.min(distance, 12)) * 55 +
      (4 - Math.min(humanEscapes, 4)) * 110;

    if (state.prevPositions[2] &&
        state.prevPositions[2].row === move.row &&
        state.prevPositions[2].col === move.col) {
      score -= 180;
    }

    score += randInt(8);
    if (!best || score > best.score) best = { ...move, score };
  }
  return best;
}

async function runBotTurn() {
  await delay(350);
  if (state.phase !== "roll" || state.currentPlayer !== 2) return;

  rollDiceForPlayer(2);

  while (state.movesRemaining > 0 && state.phase === "move" && state.currentPlayer === 2) {
    const move = chooseBotMove();
    if (!move) break;

    await delay(180);
    await animateStep(2, move.row, move.col);
    state.movesRemaining -= 1;
  }

  updateFacing(1);
  updateFacing(2);

  const ended = await maybeFinishAfterMove(2);
  if (ended) return;

  nextTurn();
}

rollBtn.addEventListener("click", () => {
  if (!(state.phase === "roll" && state.currentPlayer === 1)) return;
  rollDiceForPlayer(1);
});

endTurnBtn.addEventListener("click", async () => {
  if (!(state.phase === "move" && state.currentPlayer === 1 && state.movesRemaining === 0)) return;
  if (state.planningPath.length) {
    await executePlannedPath(1);
  } else {
    nextTurn();
  }
});

function continueFromRoundEnd() {
  resultPopup.classList.add("hidden");
  const matchOver = state.scores[1] >= WIN_ROUNDS || state.scores[2] >= WIN_ROUNDS;
  if (matchOver) {
    state.round = 1;
    startRound(true);
  } else {
    state.round += 1;
    startRound(false);
  }
}

newRoundBtn.addEventListener("click", () => {
  if (state.phase !== "roundOver") return;
  continueFromRoundEnd();
});

resetMatchBtn.addEventListener("click", () => {
  resultPopup.classList.add("hidden");
  state.round = 1;
  startRound(true);
});

resultNextBtn.addEventListener("click", continueFromRoundEnd);

document.addEventListener("keydown", (e) => {
  if (!(state.phase === "move" && state.currentPlayer === 1)) return;
  const keyMap = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
    W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1],
  };
  if (!(e.key in keyMap)) return;
  e.preventDefault();
  const [dr, dc] = keyMap[e.key];
  const origin = getPlanningOrigin();
  onTileClick(origin.row + dr, origin.col + dc);
});

startRound(true);
