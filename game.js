const SIZE = 6;
const WIN_ROUNDS = 2;

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
    p1: "assets/blue-removebg-preview.png",
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
  selectedTile: null,
  players: {
    1: { row: 0, col: 0 },
    2: { row: SIZE - 1, col: SIZE - 1 },
  },
  prevPositions: { 1: null, 2: null },
  lastMove: null,
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function randInt(max) {
  return Math.floor(Math.random() * max);
}
function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}
function getOpponent(player) {
  return player === 1 ? 2 : 1;
}
function coordLabel(pos) {
  return `(${pos.row + 1},${pos.col + 1})`;
}
function isOccupied(row, col, tempPlayers = state.players, ignorePlayer = null) {
  for (const key of [1, 2]) {
    if (ignorePlayer && key === ignorePlayer) continue;
    const p = tempPlayers[key];
    if (p.row === row && p.col === col) return true;
  }
  return false;
}

function mixedGroundFor(row, col) {
  const v = (row * 7 + col * 11) % 4;
  if (v === 0) return "floor1";
  if (v === 1) return "grass1";
  if (v === 2) return "floor2";
  return "grass2";
}

function createBaseBoard() {
  const board = Array.from({ length: SIZE }, (_, row) =>
    Array.from({ length: SIZE }, (_, col) => ({
      row,
      col,
      blocked: false,
      ground: mixedGroundFor(row, col),
      blockType: null,
    }))
  );

  const blockPattern = [
    [1, 3, "bush"],
    [2, 1, "crate"],
    [3, 0, "crate"],
    [3, 2, "bush"],
    [3, 4, "crate"],
    [4, 3, "bush"],
    [5, 2, "crate"],
  ];

  for (const [r, c, type] of blockPattern) {
    if (r < SIZE && c < SIZE) {
      board[r][c].blocked = true;
      board[r][c].blockType = type;
    }
  }
  return board;
}

function openTiles(board = state.board) {
  const tiles = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!board[row][col].blocked) tiles.push({ row, col });
    }
  }
  return tiles;
}

function getAdjacentMovesForPlayer(player, tempPlayers = state.players) {
  const me = tempPlayers[player];
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  const moves = [];
  for (const [dr, dc] of dirs) {
    const nr = me.row + dr;
    const nc = me.col + dc;
    if (!inBounds(nr, nc)) continue;
    if (state.board[nr][nc].blocked) continue;
    if (isOccupied(nr, nc, tempPlayers, player)) continue;
    moves.push({ row: nr, col: nc });
  }
  return moves;
}

function hasEscape(player, tempPlayers = state.players) {
  return getAdjacentMovesForPlayer(player, tempPlayers).length > 0;
}

function randomizeSpawns() {
  const opens = openTiles();
  let bestPair = [opens[0], opens[1]];
  let bestDistance = -1;

  for (let i = 0; i < opens.length; i++) {
    for (let j = i + 1; j < opens.length; j++) {
      const a = opens[i];
      const b = opens[j];
      const d = Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
      if (d > bestDistance) {
        bestDistance = d;
        bestPair = [a, b];
      }
    }
  }

  if (Math.random() < 0.5) bestPair.reverse();
  state.players[1] = { ...bestPair[0] };
  state.players[2] = { ...bestPair[1] };
  state.prevPositions = { 1: null, 2: null };
  state.lastMove = null;
}

function startRound(resetScores = false) {
  state.board = createBaseBoard();
  randomizeSpawns();
  state.phase = "roll";
  state.currentPlayer = state.round % 2 === 1 ? 1 : 2;
  state.dice = null;
  state.movesRemaining = 0;
  state.validMoves = [];
  state.selectedTile = null;
  state.winner = null;
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

      const selected = state.selectedTile && state.selectedTile.row === row && state.selectedTile.col === col;
      if (selected) {
        const fx = document.createElement("div");
        fx.className = "layer fx selected";
        cell.appendChild(fx);
      }

      if (cellData.blocked) {
        const block = document.createElement("div");
        block.className = "layer block";
        block.style.backgroundImage = `url('${TILESET.block[cellData.blockType]}')`;
        cell.appendChild(block);
      }

      for (const player of [1, 2]) {
        if (state.players[player].row === row && state.players[player].col === col) {
          const actor = document.createElement("div");
          actor.className = `layer actor p${player}`;
          actor.style.backgroundImage = `url('${player === 1 ? TILESET.actor.p1 : TILESET.actor.p2}')`;

          if (state.lastMove?.player === player && state.prevPositions[player]) {
            const prev = state.prevPositions[player];
            const deltaRow = prev.row - row;
            const deltaCol = prev.col - col;
            actor.style.setProperty("--from-x", `${deltaCol * 100}%`);
            actor.style.setProperty("--from-y", `${deltaRow * 100}%`);
            actor.classList.add("slide-in");
          }
          cell.appendChild(actor);
        }
      }

      cell.addEventListener("click", () => onTileClick(row, col));
      boardEl.appendChild(cell);
    }
  }
}

function renderUI() {
  turnText.textContent =
    state.phase === "roundOver"
      ? `${state.winner === 1 ? "Player 1" : "Bot"} wins Round ${state.round}`
      : `${state.currentPlayer === 1 ? "Player 1" : "Bot"} turn`;

  if (state.phase === "roll") {
    phaseText.textContent = state.currentPlayer === 1 ? "Click Roll Dice to begin." : "Bot is thinking...";
  } else if (state.phase === "move") {
    phaseText.textContent = state.currentPlayer === 1 ? "Click a highlighted tile to move." : "Bot is moving...";
  } else {
    phaseText.textContent = "Round complete.";
  }

  roundText.textContent = `Round ${state.round} of 3`;
  diceText.textContent = state.dice == null ? "Dice: -" : `Dice: ${state.dice} | Moves left: ${state.movesRemaining}`;
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

function renderAll() {
  renderTileEngine();
  renderUI();
}

function chooseBotMove() {
  const bot = 2;
  const human = 1;
  const moves = getAdjacentMovesForPlayer(bot);
  if (!moves.length) return null;

  let best = null;
  for (const move of moves) {
    const tempPlayers = {
      1: { ...state.players[1] },
      2: { ...state.players[2] },
    };
    tempPlayers[bot].row = move.row;
    tempPlayers[bot].col = move.col;

    const humanEscapes = getAdjacentMovesForPlayer(human, tempPlayers).length;
    const adjacentNow = Math.abs(move.row - tempPlayers[human].row) + Math.abs(move.col - tempPlayers[human].col) === 1;
    const winsNow = !hasEscape(human, tempPlayers);
    const distance = Math.abs(move.row - tempPlayers[human].row) + Math.abs(move.col - tempPlayers[human].col);

    let score =
      (winsNow ? 5000 : 0) +
      (adjacentNow ? 700 : 0) +
      (8 - Math.min(distance, 8)) * 70 +
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

async function animateStep(player, row, col) {
  state.prevPositions[player] = { ...state.players[player] };
  state.players[player].row = row;
  state.players[player].col = col;
  state.selectedTile = { row, col };
  state.lastMove = { player, row, col };
  renderAll();
  await delay(220);
}

async function finishRound(winner) {
  state.winner = winner;
  state.phase = "roundOver";
  state.validMoves = [];
  state.movesRemaining = 0;
  state.dice = null;
  state.scores[winner] += 1;
  renderAll();

  const matchOver = state.scores[winner] >= WIN_ROUNDS;
  resultPopupText.textContent = winner === 1 ? "YOU WIN" : "YOU LOST";
  resultPopupSubtext.textContent = matchOver ? "Series decided." : "Tap Next Round to continue.";
  resultNextBtn.textContent = matchOver ? "New Match" : "Next Round";
  resultPopup.classList.remove("hidden");
  newRoundBtn.disabled = false;
}

async function maybeFinishAfterMove(player) {
  const opponent = getOpponent(player);
  const mePos = state.players[player];
  const oppPos = state.players[opponent];

  if (!hasEscape(opponent)) {
    await finishRound(player);
    return true;
  }

  const adjacent = Math.abs(mePos.row - oppPos.row) + Math.abs(mePos.col - oppPos.col) === 1;
  if (state.movesRemaining <= 0 && adjacent) {
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
  state.selectedTile = null;
  renderAll();

  if (!hasEscape(state.currentPlayer)) {
    finishRound(getOpponent(state.currentPlayer));
    return;
  }

  if (state.currentPlayer === 2) runBotTurn();
}

async function onTileClick(row, col) {
  if (!(state.phase === "move" && state.currentPlayer === 1)) return;
  const valid = state.validMoves.some(m => m.row === row && m.col === col);
  if (!valid) return;

  await animateStep(1, row, col);
  state.movesRemaining = Math.max(0, state.movesRemaining - 1);

  const ended = await maybeFinishAfterMove(1);
  if (ended) return;

  state.validMoves = state.movesRemaining > 0 ? getAdjacentMovesForPlayer(1) : [];
  renderAll();
}

function rollDiceForPlayer(player) {
  state.dice = randInt(6) + 1;
  state.movesRemaining = state.dice;
  state.phase = "move";
  state.validMoves = getAdjacentMovesForPlayer(player);
  renderAll();
}

async function runBotTurn() {
  await delay(350);
  if (state.phase !== "roll" || state.currentPlayer !== 2) return;

  rollDiceForPlayer(2);

  let steps = state.movesRemaining;
  while (steps > 0 && state.phase === "move" && state.currentPlayer === 2) {
    const move = chooseBotMove();
    if (!move) break;

    await delay(180);
    await animateStep(2, move.row, move.col);
    state.movesRemaining -= 1;
    steps -= 1;

    const ended = await maybeFinishAfterMove(2);
    if (ended) return;
  }
  nextTurn();
}

rollBtn.addEventListener("click", () => {
  if (!(state.phase === "roll" && state.currentPlayer === 1)) return;
  rollDiceForPlayer(1);
});

endTurnBtn.addEventListener("click", () => {
  if (!(state.phase === "move" && state.currentPlayer === 1 && state.movesRemaining === 0)) return;
  nextTurn();
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
  onTileClick(state.players[1].row + dr, state.players[1].col + dc);
});

startRound(true);
