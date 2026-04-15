import { db, ref, update, get, onValue, remove } from "./firebase.js";

/*
  Mobile-polished solo build
  - 6x6 board
  - random unblocked spawns
  - one-tile-per-move preserved
  - player vs bot only in solo mode
  - smarter bot
  - safer relative asset paths
*/

const SIZE = 6;
const TILE_SIZE = 72;
const WIN_ROUNDS = 2;
const blockedTiles = [];

const roomId = localStorage.getItem("roomId");
const playerRole = localStorage.getItem("playerRole");
const playerName = localStorage.getItem("playerName") || "";
const isMultiplayer = !!roomId && !!playerRole;

let roomState = null;
let tossShownLocally = false;

const TILESET = {
  ground: {
    floor1: "./assets/tile-floor1.png",
    floor2: "./assets/tile-floor2.png",
    grass1: "./assets/tile-grass1.png",
    grass2: "./assets/tile-grass2.png",
  },
  block: {
    stone: "./assets/d-tile1.png",
    sand: "./assets/d-tile2.png",
    bonfire: "./assets/d-tile3.png",
  },
  actor: {
    p1: "./assets/blue-removebg-preview.png",
    p2: "./assets/red-removebg-preview.png",
  },
};

const MAP_01 = {
  name: "Compact Arena",
  ground: [
    ["grass1", "grass2", "grass1", "grass2", "grass1", "grass2"],
    ["grass2", "grass1", "grass2", "grass1", "grass2", "grass1"],
    ["grass1", "floor2", "grass1", "grass2", "floor1", "grass1"],
    ["floor1", "floor2", "floor1", "floor2", "floor1", "floor2"],
    ["floor2", "floor1", "floor2", "floor1", "floor2", "floor1"],
    ["floor1", "floor2", "floor1", "floor2", "floor1", "floor2"],
  ],
  blocks: [
    [null,      null,      null,      null,      null,      null],
    [null,      null,      null,      "sand",    null,      null],
    [null,      "stone",   null,      null,      null,      null],
    ["stone",   null,      "sand",    null,      "stone",   null],
    [null,      null,      null,      "sand",    null,      null],
    [null,      null,      "stone",   null,      null,      null],
  ],
};

const tileMap = {
  ground: [],
  block: [],
  prop: [],
};

const state = {
  players: {
    1: { row: 0, col: 0, score: 0, connected: true },
    2: { row: SIZE - 1, col: SIZE - 1, score: 0, connected: !isMultiplayer },
  },
  currentPlayer: 1,
  phase: isMultiplayer ? "waiting" : "roll",
  dice: null,
  movesRemaining: 0,
  round: 1,
  winner: null,
  validMoves: [],
  selectedTile: null,
  log: [],
  lastMove: null,
  attackFlashTile: null,
  botThinking: false,
  botLastPos: null,
};

const boardEl = document.getElementById("board");
const rollBtn = document.getElementById("rollBtn");
const endTurnBtn = document.getElementById("endTurnBtn");
const newRoundBtn = document.getElementById("newRoundBtn");
const resetMatchBtn = document.getElementById("resetMatchBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const turnText = document.getElementById("turnText");
const phaseText = document.getElementById("phaseText");
const diceText = document.getElementById("diceText");
const roundText = document.getElementById("roundText");
const roomStatusText = document.getElementById("roomStatusText");
const p1Score = document.getElementById("p1Score");
const p2Score = document.getElementById("p2Score");
const p1Pos = document.getElementById("p1Pos");
const p2Pos = document.getElementById("p2Pos");
const p1NameEl = document.getElementById("p1Name");
const p2NameEl = document.getElementById("p2Name");
const p1DiceEl = document.getElementById("p1Dice");
const p2DiceEl = document.getElementById("p2Dice");
const logEl = document.getElementById("log");

const coinTossPopup = document.getElementById("coinTossPopup");
const coinTossText = document.getElementById("coinTossText");

const resultPopup = document.getElementById("resultPopup");
const resultPopupText = document.getElementById("resultPopupText");
const resultPopupSubtext = document.getElementById("resultPopupSubtext");
const resultNextBtn = document.getElementById("resultNextBtn");

const menuToggle = document.getElementById("menuToggle");
const menuToggleInline = document.getElementById("menuToggleInline");
const closeDrawer = document.getElementById("closeDrawer");
const sideDrawer = document.getElementById("sideDrawer");
const drawerOverlay = document.getElementById("drawerOverlay");

function addLog(message) {
  state.log.unshift(message);
  state.log = state.log.slice(0, 20);
  renderLog();
}

function renderLog() {
  if (!logEl) return;
  logEl.innerHTML = state.log.map((entry) => `<div class="log-entry">${entry}</div>`).join("");
}

function showCoinTossPopup(text) {
  if (!coinTossPopup || !coinTossText) return;
  coinTossText.textContent = text;
  coinTossPopup.classList.add("show");
  setTimeout(() => {
    coinTossPopup.classList.remove("show");
  }, 2000);
}

function showResultPopup(message, isMatchOver = false) {
  if (!resultPopup || !resultPopupText) return;
  resultPopupText.textContent = message;
  if (resultPopupSubtext) {
    resultPopupSubtext.textContent = isMatchOver ? "Series decided." : "Waiting for the next round.";
  }
  if (resultNextBtn) {
    resultNextBtn.textContent = isMatchOver ? "New Match" : "Next Game";
  }
  resultPopup.classList.add("show");
}

function hideResultPopup() {
  resultPopup?.classList.remove("show");
}

function animateRollButton(callback) {
  if (!rollBtn) return callback();
  rollBtn.classList.remove("rolling");
  void rollBtn.offsetWidth;
  rollBtn.classList.add("rolling");
  setTimeout(() => {
    rollBtn.classList.remove("rolling");
    callback();
  }, 500);
}

function openDrawer() {
  sideDrawer?.classList.add("open");
  drawerOverlay?.classList.add("show");
}

function closeDrawerMenu() {
  sideDrawer?.classList.remove("open");
  drawerOverlay?.classList.remove("show");
}

function createEmptyLayer(fill = null) {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => fill));
}

function getOpponent(player) {
  return player === 1 ? 2 : 1;
}

function localRoleToNumber() {
  return playerRole === "p1" ? 1 : 2;
}

function isMyTurn() {
  if (!isMultiplayer) return state.currentPlayer === 1;
  return roomState?.turn === playerRole;
}

function bothPlayersReady() {
  if (!isMultiplayer) return true;
  return !!(roomState?.players?.p1?.connected && roomState?.players?.p2?.connected);
}

function getPlayerLabel(player) {
  if (player === 1) return p1NameEl?.textContent || "Player 1";
  return p2NameEl?.textContent || "Bot";
}

function coordLabel(pos) {
  return `(${pos.row + 1},${pos.col + 1})`;
}

function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function isWallTile(row, col) {
  return blockedTiles.some((b) => b.row === row && b.col === col);
}

function getAdjacentMovesForPlayer(player, tempPlayers = state.players) {
  const me = tempPlayers[player];
  const opponent = tempPlayers[getOpponent(player)];
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];
  const moves = [];
  for (const dir of dirs) {
    const nr = me.row + dir.dr;
    const nc = me.col + dir.dc;
    if (!inBounds(nr, nc)) continue;
    if (opponent.connected && nr === opponent.row && nc === opponent.col) continue;
    if (isWallTile(nr, nc)) continue;
    moves.push({ row: nr, col: nc });
  }
  return moves;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function animateStep(player, row, col) {
  state.lastMove = { player, row, col };
  state.selectedTile = { row, col };
  state.players[player].row = row;
  state.players[player].col = col;
  renderTileEngine();
  renderUI();
  await delay(130);
}

function getValidMovesForPlayer(player) {
  return getAdjacentMovesForPlayer(player);
}

function hasEscapeForPatch(player, tempPlayers) {
  return getAdjacentMovesForPlayer(player, tempPlayers).length > 0;
}

function chooseBotMove() {
  const bot = 2;
  const human = 1;
  const moves = getValidMovesForPlayer(bot);
  if (!moves.length) return null;

  const playerPos = state.players[human];
  let best = null;

  for (const move of moves) {
    const tempPlayers = {
      1: { ...state.players[1] },
      2: { ...state.players[2] },
    };
    tempPlayers[bot].row = move.row;
    tempPlayers[bot].col = move.col;

    const winsNow = !hasEscapeForPatch(human, tempPlayers);
    const adjacentNow = Math.abs(move.row - playerPos.row) + Math.abs(move.col - playerPos.col) === 1;
    const humanEscapes = getAdjacentMovesForPlayer(human, tempPlayers).length;
    const distance = Math.abs(move.row - playerPos.row) + Math.abs(move.col - playerPos.col);

    let score =
      (winsNow ? 5000 : 0) +
      (adjacentNow ? 600 : 0) +
      (8 - Math.min(distance, 8)) * 70 +
      (4 - Math.min(humanEscapes, 4)) * 90;

    if (state.botLastPos && state.botLastPos.row === move.row && state.botLastPos.col === move.col) {
      score -= 250;
    }

    const centerBias =
      (SIZE - Math.abs(move.row - Math.floor(SIZE / 2))) +
      (SIZE - Math.abs(move.col - Math.floor(SIZE / 2)));
    score += centerBias * 6;

    score += Math.floor(Math.random() * 6);

    if (!best || score > best.score) {
      best = { ...move, score };
    }
  }

  return best;
}

async function finishRound(winner) {
  state.winner = winner;
  state.phase = "roundOver";
  state.players[winner].score += 1;
  state.movesRemaining = 0;
  state.dice = null;
  state.validMoves = [];
  state.botThinking = false;
  addLog(`${getPlayerLabel(winner)} wins Round ${state.round}.`);
  renderTileEngine();
  renderUI();

  const isMatchOver = state.players[winner].score >= WIN_ROUNDS;
  showResultPopup(winner === 1 ? "YOU WIN" : "YOU LOST", isMatchOver);
}

async function maybeFinishAfterMove(player) {
  const opponent = getOpponent(player);
  const mePos = state.players[player];
  const oppPos = state.players[opponent];

  const tempPlayers = {
    1: { ...state.players[1] },
    2: { ...state.players[2] },
  };

  if (state.players[opponent].connected && !hasEscapeForPatch(opponent, tempPlayers)) {
    await finishRound(player);
    return true;
  }

  if (
    state.players[opponent].connected &&
    state.movesRemaining <= 0 &&
    Math.abs(mePos.row - oppPos.row) + Math.abs(mePos.col - oppPos.col) === 1
  ) {
    await finishRound(player);
    return true;
  }

  return false;
}

async function endSoloTurn() {
  state.validMoves = [];
  state.selectedTile = null;
  state.movesRemaining = 0;
  state.dice = null;

  if (state.currentPlayer === 1) {
    state.currentPlayer = 2;
    state.phase = "roll";
    state.botThinking = true;
    renderTileEngine();
    renderUI();
    await delay(450);
    await runBotTurn();
  } else {
    state.currentPlayer = 1;
    state.phase = "roll";
    state.botThinking = false;
    renderTileEngine();
    renderUI();
  }
}

function getMapBlockedTiles(map) {
  const tiles = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (map.blocks[row][col]) tiles.push({ row, col });
    }
  }
  return tiles;
}

function getOpenTiles() {
  const open = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!isWallTile(row, col)) open.push({ row, col });
    }
  }
  return open;
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomizeSpawnPositions() {
  const openTiles = shuffleArray(getOpenTiles());
  if (openTiles.length < 2) return;

  let bestP1 = openTiles[0];
  let bestP2 = openTiles[1];
  let bestDistance = -1;

  for (let i = 0; i < openTiles.length; i++) {
    for (let j = i + 1; j < openTiles.length; j++) {
      const a = openTiles[i];
      const b = openTiles[j];
      const d = Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
      if (d > bestDistance) {
        bestDistance = d;
        bestP1 = a;
        bestP2 = b;
      }
    }
  }

  state.players[1].row = bestP1.row;
  state.players[1].col = bestP1.col;
  state.players[2].row = bestP2.row;
  state.players[2].col = bestP2.col;
}

function loadMap(map) {
  tileMap.ground = map.ground.map((row) => [...row]);
  tileMap.block = map.blocks.map((row) => [...row]);
  tileMap.prop = createEmptyLayer();

  blockedTiles.length = 0;
  for (const t of getMapBlockedTiles(map)) blockedTiles.push(t);

  randomizeSpawnPositions();
}

function buildVisualMap() {
  tileMap.ground = MAP_01.ground.map((row) => [...row]);
  tileMap.block = createEmptyLayer();
  tileMap.prop = createEmptyLayer();
  for (const tile of blockedTiles) {
    tileMap.block[tile.row][tile.col] = MAP_01.blocks[tile.row][tile.col] || "stone";
  }
}

function getReachableTiles(player) {
  return getAdjacentMovesForPlayer(player);
}

function renderTileEngine() {
  if (!boardEl) return;

  boardEl.innerHTML = "";
  boardEl.style.width = `100%`;
  boardEl.style.height = `auto`;
  boardEl.style.display = "grid";
  boardEl.style.gridTemplateColumns = `repeat(${SIZE}, 1fr)`;
  boardEl.style.gridTemplateRows = `repeat(${SIZE}, 1fr)`;
  boardEl.style.gap = "1px";
  boardEl.style.aspectRatio = "1 / 1";

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);

      const groundKey = tileMap.ground[row]?.[col];
      if (groundKey) {
        const ground = document.createElement("div");
        ground.className = "layer ground";
        ground.style.backgroundImage = `url("${TILESET.ground[groundKey]}")`;
        cell.appendChild(ground);
      }

      const blockKey = tileMap.block[row]?.[col];
      if (blockKey) {
        const block = document.createElement("div");
        block.className = "layer block";
        block.style.backgroundImage = `url("${TILESET.block[blockKey]}")`;
        cell.appendChild(block);
      }

      if (state.attackFlashTile && state.attackFlashTile.row === row && state.attackFlashTile.col === col) {
        const fxAttack = document.createElement("div");
        fxAttack.className = "layer fx attack";
        cell.appendChild(fxAttack);
      }

      const valid = state.validMoves.some((m) => m.row === row && m.col === col);
      if (valid) {
        const fx = document.createElement("div");
        fx.className = "layer fx valid";
        cell.appendChild(fx);
      }

      const selected = state.selectedTile && state.selectedTile.row === row && state.selectedTile.col === col;
      if (selected) {
        const fxSelected = document.createElement("div");
        fxSelected.className = "layer fx selected";
        cell.appendChild(fxSelected);
      }

      if (state.players[1].connected && state.players[1].row === row && state.players[1].col === col) {
        const actor = document.createElement("div");
        const moved = state.lastMove?.player === 1 && state.lastMove?.row === row && state.lastMove?.col === col;
        actor.className = `layer actor p1 ${moved ? "move" : ""}`.trim();
        actor.style.backgroundImage = `url("${TILESET.actor.p1}")`;
        cell.appendChild(actor);
      }

      if (state.players[2].connected && state.players[2].row === row && state.players[2].col === col) {
        const actor = document.createElement("div");
        const moved = state.lastMove?.player === 2 && state.lastMove?.row === row && state.lastMove?.col === col;
        actor.className = `layer actor p2 ${moved ? "move" : ""}`.trim();
        actor.style.backgroundImage = `url("${TILESET.actor.p2}")`;
        cell.appendChild(actor);
      }

      cell.addEventListener("click", () => onTileClick(row, col));
      boardEl.appendChild(cell);
    }
  }
}

function renderUI() {
  if (!turnText) return;

  const waitingMsg = isMultiplayer && !bothPlayersReady();

  turnText.textContent =
    state.phase === "matchOver"
      ? `${getPlayerLabel(state.winner)} wins the match`
      : waitingMsg
      ? "Waiting for Player 2..."
      : state.phase === "roundOver"
      ? `${getPlayerLabel(state.winner)} wins Round ${state.round}`
      : `${getPlayerLabel(state.currentPlayer)} turn`;

  let phaseMsg = "";
  if (waitingMsg) {
    phaseMsg = "Waiting for Player 2 to join.";
  } else if (state.phase === "waiting") {
    phaseMsg = "Waiting room active.";
  } else if (state.phase === "toss") {
    phaseMsg = "Coin toss in progress...";
  } else if (state.phase === "roll") {
    phaseMsg = state.botThinking ? "Bot is thinking..." : isMyTurn() ? "Click Roll Dice to begin." : "Waiting for the other player.";
  } else if (state.phase === "move") {
    phaseMsg = state.botThinking ? "Bot is moving..." : isMyTurn() ? "Click a highlighted tile to move." : "Opponent is moving.";
  } else if (state.phase === "roundOver") {
    phaseMsg = "Round complete. Start the next round.";
  } else {
    phaseMsg = "Match complete.";
  }

  if (phaseText) phaseText.textContent = phaseMsg;
  if (diceText) {
    diceText.textContent = state.dice == null ? "Dice: -" : `Dice: ${state.dice} | Moves left: ${state.movesRemaining}`;
  }
  if (roundText) roundText.textContent = `Round ${state.round} of 3`;

  if (roomStatusText) roomStatusText.textContent = roomId ? `Room: ${roomId}` : "Room: -";
  if (p1Pos) p1Pos.textContent = coordLabel(state.players[1]);
  if (p2Pos) p2Pos.textContent = state.players[2].connected ? coordLabel(state.players[2]) : "(-,-)";
  if (p1Score) p1Score.textContent = String(state.players[1].score || 0);
  if (p2Score) p2Score.textContent = String(state.players[2].score || 0);

  const currentDiceValue = state.dice == null ? "-" : String(state.dice);
  if (p1DiceEl) p1DiceEl.textContent = state.currentPlayer === 1 ? currentDiceValue : "-";
  if (p2DiceEl) p2DiceEl.textContent = state.currentPlayer === 2 ? currentDiceValue : "-";

  const canRoll = !waitingMsg && state.phase === "roll" && isMyTurn() && !state.botThinking;
  const canEnd = !waitingMsg && state.phase === "move" && isMyTurn() && !state.botThinking;
  if (rollBtn) rollBtn.disabled = !canRoll;
  if (endTurnBtn) endTurnBtn.disabled = !canEnd;
  if (newRoundBtn) newRoundBtn.disabled = state.phase !== "roundOver" || (isMultiplayer && !isMyTurn());
}

function syncRoomIntoLocal(room) {
  roomState = room;

  state.phase = room.phase || "waiting";
  state.round = room.round || 1;
  state.dice = room.dice ?? null;
  state.movesRemaining = room.movesRemaining ?? 0;
  state.currentPlayer = room.turn === "p2" ? 2 : 1;
  state.winner = room.winner === "p2" ? 2 : room.winner === "p1" ? 1 : null;

  state.players[1].row = room.players?.p1?.row ?? 0;
  state.players[1].col = room.players?.p1?.col ?? 0;
  state.players[1].connected = !!room.players?.p1?.connected;
  state.players[1].score = room.scores?.p1 ?? 0;

  state.players[2].row = room.players?.p2?.row ?? SIZE - 1;
  state.players[2].col = room.players?.p2?.col ?? SIZE - 1;
  state.players[2].connected = !!room.players?.p2?.connected;
  state.players[2].score = room.scores?.p2 ?? 0;

  blockedTiles.length = 0;
  (room.blockedTiles || []).forEach((t) => blockedTiles.push({ row: t.row, col: t.col }));

  if (p1NameEl) p1NameEl.textContent = room.players?.p1?.name || playerName || "Player 1";
  if (p2NameEl) p2NameEl.textContent = room.players?.p2?.name || "Player 2";
  if (roomStatusText) roomStatusText.textContent = roomId ? `Room: ${roomId}` : "Room: -";

  if (room.phase === "move" && isMyTurn()) {
    state.validMoves = getReachableTiles(localRoleToNumber());
  } else {
    state.validMoves = [];
  }

  buildVisualMap();
  renderTileEngine();
  renderUI();

  if (room.phase === "roundOver" && room.winner) {
    const iWon = room.winner === playerRole;
    const myScore = playerRole === "p1" ? (room.scores?.p1 ?? 0) : (room.scores?.p2 ?? 0);
    const oppScore = playerRole === "p1" ? (room.scores?.p2 ?? 0) : (room.scores?.p1 ?? 0);
    const isMatchOver = myScore >= WIN_ROUNDS || oppScore >= WIN_ROUNDS;
    showResultPopup(iWon ? "YOU WIN" : "YOU LOST", isMatchOver);
  } else {
    hideResultPopup();
  }

  if (room.phase === "toss" && room.players?.p1?.connected && room.players?.p2?.connected) {
    maybeRunToss(room);
  }

  if (room.toss?.shown && room.toss?.result && !tossShownLocally) {
    tossShownLocally = true;
    const starterName = room.toss.result === "p1" ? room.players?.p1?.name || "Player 1" : room.players?.p2?.name || "Player 2";
    showCoinTossPopup(`${starterName} goes first!`);
  }
}

async function maybeRunToss(room) {
  if (playerRole !== "p1") return;
  if (room.toss?.result) return;

  const starter = Math.random() < 0.5 ? "p1" : "p2";
  const tiles = getMapBlockedTiles(MAP_01);

  await update(ref(db, `rooms/${roomId}`), {
    status: "playing",
    phase: "roll",
    turn: starter,
    dice: null,
    movesRemaining: 0,
    blockedTiles: tiles,
    "players/p1/row": 0,
    "players/p1/col": 0,
    "players/p2/row": SIZE - 1,
    "players/p2/col": SIZE - 1,
    "toss/result": starter,
    "toss/shown": true,
    "scores/p1": room.scores?.p1 ?? 0,
    "scores/p2": room.scores?.p2 ?? 0,
  });
}

async function writeRoomPatch(patch) {
  if (!isMultiplayer || !roomId) return;
  await update(ref(db, `rooms/${roomId}`), patch);
}

async function onTileClick(row, col) {
  if (state.phase !== "move") return;
  if (!isMyTurn()) return;
  if (isWallTile(row, col)) return;

  const me = isMultiplayer ? localRoleToNumber() : state.currentPlayer;
  const opponent = getOpponent(me);
  const isValid = getReachableTiles(me).some((m) => m.row === row && m.col === col);
  if (!isValid) return;

  if (isMultiplayer) {
    const newMovesRemaining = state.movesRemaining - 1;
    const other = { row: state.players[opponent].row, col: state.players[opponent].col };

    let patch = {
      dice: state.dice,
      movesRemaining: newMovesRemaining,
      [`players/${playerRole}/row`]: row,
      [`players/${playerRole}/col`]: col,
    };

    const tempPlayers = {
      1: { ...state.players[1] },
      2: { ...state.players[2] },
    };
    tempPlayers[me].row = row;
    tempPlayers[me].col = col;

    state.lastMove = { player: me, row, col };
    state.selectedTile = { row, col };

    if (state.players[opponent].connected && !hasEscapeForPatch(opponent, tempPlayers)) {
      const scoreKey = me === 1 ? "scores/p1" : "scores/p2";
      patch = {
        ...patch,
        phase: "roundOver",
        winner: me === 1 ? "p1" : "p2",
        [scoreKey]: (roomState?.scores?.[me === 1 ? "p1" : "p2"] ?? 0) + 1,
      };
    } else if (newMovesRemaining <= 0) {
      if (state.players[opponent].connected && Math.abs(row - other.row) + Math.abs(col - other.col) === 1) {
        const scoreKey = me === 1 ? "scores/p1" : "scores/p2";
        patch = {
          ...patch,
          phase: "roundOver",
          winner: me === 1 ? "p1" : "p2",
          [scoreKey]: (roomState?.scores?.[me === 1 ? "p1" : "p2"] ?? 0) + 1,
        };
      } else {
        patch = {
          ...patch,
          turn: playerRole === "p1" ? "p2" : "p1",
          phase: "roll",
          dice: null,
          movesRemaining: 0,
        };
      }
    }

    await writeRoomPatch(patch);
    return;
  }

  await animateStep(me, row, col);
  state.movesRemaining = Math.max(0, state.movesRemaining - 1);

  const ended = await maybeFinishAfterMove(me);
  if (ended) return;

  state.validMoves = state.movesRemaining > 0 ? getReachableTiles(me) : [];
  renderTileEngine();
  renderUI();
}

async function rollDiceAction() {
  if (!isMyTurn()) return;
  const roll = Math.floor(Math.random() * 6) + 1;

  if (isMultiplayer) {
    await writeRoomPatch({
      dice: roll,
      movesRemaining: roll,
      phase: "move",
    });
    return;
  }

  state.dice = roll;
  state.movesRemaining = roll;
  state.phase = "move";
  state.validMoves = getReachableTiles(state.currentPlayer);
  addLog(`${getPlayerLabel(state.currentPlayer)} rolled ${roll}.`);
  renderTileEngine();
  renderUI();
}

async function endTurnEarly() {
  if (!isMyTurn()) return;

  if (isMultiplayer) {
    if (state.movesRemaining > 0) return;
    await writeRoomPatch({
      turn: playerRole === "p1" ? "p2" : "p1",
      phase: "roll",
      dice: null,
      movesRemaining: 0,
    });
    return;
  }

  await endSoloTurn();
}

async function startNextRound() {
  hideResultPopup();

  if (isMultiplayer) {
    if (!roomState || !isMyTurn()) return;
    const starter = roomState.round % 2 === 1 ? "p2" : "p1";
    const tiles = getMapBlockedTiles(MAP_01);

    await writeRoomPatch({
      round: (roomState.round || 1) + 1,
      phase: "roll",
      turn: starter,
      dice: null,
      movesRemaining: 0,
      winner: null,
      blockedTiles: tiles,
      "players/p1/row": 0,
      "players/p1/col": 0,
      "players/p2/row": SIZE - 1,
      "players/p2/col": SIZE - 1,
    });
    return;
  }

  state.round += 1;
  state.phase = "roll";
  state.currentPlayer = state.round % 2 === 1 ? 1 : 2;
  state.dice = null;
  state.movesRemaining = 0;
  state.winner = null;
  state.validMoves = [];
  state.selectedTile = null;
  state.botThinking = false;
  state.lastMove = null;

  loadMap(MAP_01);
  renderTileEngine();
  renderUI();

  if (state.currentPlayer === 2) {
    state.botThinking = true;
    renderUI();
    await delay(500);
    await runBotTurn();
  }
}

async function resetSeries() {
  hideResultPopup();
  tossShownLocally = false;

  if (isMultiplayer) {
    if (!roomState || !isMyTurn()) return;
    await writeRoomPatch({
      round: 1,
      phase: "toss",
      turn: null,
      dice: null,
      movesRemaining: 0,
      winner: null,
      blockedTiles: [],
      "scores/p1": 0,
      "scores/p2": 0,
      "players/p1/row": 0,
      "players/p1/col": 0,
      "players/p2/row": SIZE - 1,
      "players/p2/col": SIZE - 1,
      "toss/result": null,
      "toss/shown": false,
    });
    return;
  }

  state.players[1].score = 0;
  state.players[2].score = 0;
  state.currentPlayer = 1;
  state.phase = "roll";
  state.dice = null;
  state.movesRemaining = 0;
  state.round = 1;
  state.winner = null;
  state.validMoves = [];
  state.selectedTile = null;
  state.lastMove = null;
  state.botThinking = false;
  state.botLastPos = null;

  loadMap(MAP_01);
  renderTileEngine();
  renderUI();
}

async function leaveRoom() {
  if (!isMultiplayer || !roomId) return;

  hideResultPopup();
  localStorage.removeItem("roomId");
  localStorage.removeItem("playerRole");
  localStorage.removeItem("playerName");

  if (playerRole === "p1") {
    await remove(ref(db, `rooms/${roomId}`));
  } else {
    await update(ref(db, `rooms/${roomId}`), {
      status: "waiting",
      phase: "waiting",
      turn: null,
      "players/p2": {
        name: "",
        row: SIZE - 1,
        col: SIZE - 1,
        connected: false,
      },
      "toss/result": null,
      "toss/shown": false,
    });
  }

  window.location.href = "/multiplayer.html";
}

async function runBotTurn() {
  if (isMultiplayer) return;
  if (state.phase === "roundOver" || state.phase === "matchOver") return;

  state.botThinking = true;
  state.phase = "roll";
  renderUI();

  await delay(350);
  const roll = Math.floor(Math.random() * 6) + 1;
  state.dice = roll;
  state.movesRemaining = roll;
  state.phase = "move";
  addLog(`Bot rolled ${roll}.`);
  renderUI();

  let steps = roll;
  while (steps > 0 && state.phase === "move") {
    const move = chooseBotMove();
    if (!move) break;

    await delay(180);
    state.botLastPos = { row: state.players[2].row, col: state.players[2].col };
    await animateStep(2, move.row, move.col);
    state.movesRemaining -= 1;
    steps -= 1;

    const ended = await maybeFinishAfterMove(2);
    if (ended) {
      state.botThinking = false;
      return;
    }
  }

  state.botThinking = false;
  await endSoloTurn();
}

async function initMultiplayer() {
  const snap = await get(ref(db, `rooms/${roomId}`));
  if (!snap.exists()) {
    localStorage.removeItem("roomId");
    localStorage.removeItem("playerRole");
    localStorage.removeItem("playerName");
    return;
  }

  onValue(ref(db, `rooms/${roomId}`), (snapshot) => {
    const room = snapshot.val();
    if (!room) return;
    syncRoomIntoLocal(room);
  });
}

function initSoloFallback() {
  loadMap(MAP_01);
  if (p1NameEl) p1NameEl.textContent = playerName || "Player 1";
  if (p2NameEl) p2NameEl.textContent = "Bot";
  state.players[2].connected = true;
  renderTileEngine();
  renderUI();
}

rollBtn?.addEventListener("click", () => {
  if (!rollBtn.disabled) animateRollButton(rollDiceAction);
});

endTurnBtn?.addEventListener("click", endTurnEarly);
newRoundBtn?.addEventListener("click", startNextRound);
resetMatchBtn?.addEventListener("click", resetSeries);
leaveRoomBtn?.addEventListener("click", leaveRoom);

resultNextBtn?.addEventListener("click", async () => {
  if (isMultiplayer) {
    if (!roomState || !isMyTurn()) return;
    const p1SeriesScore = roomState.scores?.p1 ?? 0;
    const p2SeriesScore = roomState.scores?.p2 ?? 0;
    const isMatchOver = p1SeriesScore >= WIN_ROUNDS || p2SeriesScore >= WIN_ROUNDS;
    if (isMatchOver) {
      await resetSeries();
    } else {
      await startNextRound();
    }
    return;
  }

  const isMatchOver = state.players[1].score >= WIN_ROUNDS || state.players[2].score >= WIN_ROUNDS;
  if (isMatchOver) {
    await resetSeries();
  } else {
    await startNextRound();
  }
});

document.addEventListener("keydown", (e) => {
  if (!isMyTurn()) return;
  if (state.phase !== "move") return;

  const keyMap = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
    w: [-1, 0],
    s: [1, 0],
    a: [0, -1],
    d: [0, 1],
    W: [-1, 0],
    S: [1, 0],
    A: [0, -1],
    D: [0, 1],
  };

  if (!(e.key in keyMap)) return;
  e.preventDefault();

  const [dr, dc] = keyMap[e.key];
  const me = isMultiplayer ? localRoleToNumber() : state.currentPlayer;
  const nextRow = state.players[me].row + dr;
  const nextCol = state.players[me].col + dc;
  onTileClick(nextRow, nextCol);
});

menuToggle?.addEventListener("click", openDrawer);
menuToggleInline?.addEventListener("click", openDrawer);
closeDrawer?.addEventListener("click", closeDrawerMenu);
drawerOverlay?.addEventListener("click", closeDrawerMenu);

if (isMultiplayer) {
  initMultiplayer();
} else {
  initSoloFallback();
}
