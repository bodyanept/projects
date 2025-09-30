let socket;

let roomCode = null;
let mySeat = null;
let isMyTurn = false;
let boardSize = 10;
let myBoard = []; // 0-empty, 1-ship, 2-miss, 3-hit
let enemyMarks = []; // 0-unknown, 2-miss, 3-hit
let gameOver = false;

const lobbyEl = document.getElementById('lobby');
const lobbyMsgEl = document.getElementById('lobbyMsg');
const gameEl = document.getElementById('game');
const roomCodeText = document.getElementById('roomCodeText');
const seatText = document.getElementById('seatText');
const turnText = document.getElementById('turnText');
const statusMsg = document.getElementById('statusMsg');
const connectionMsg = document.getElementById('connectionMsg');

const myBoardEl = document.getElementById('myBoard');
const enemyBoardEl = document.getElementById('enemyBoard');

const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const createBotRoomBtn = document.getElementById('createBotRoomBtn');
const joinCodeInput = document.getElementById('joinCodeInput');

function setButtonsEnabled(enabled) {
  createRoomBtn.disabled = !enabled;
  joinRoomBtn.disabled = !enabled;
  if (createBotRoomBtn) createBotRoomBtn.disabled = !enabled;
}

try {
  if (typeof io === 'undefined') throw new Error('Socket.IO client not loaded');
  socket = io();
} catch (e) {
  setButtonsEnabled(false);
  if (connectionMsg) connectionMsg.textContent = 'Не удалось загрузить клиент Socket.IO. Проверьте интернет или CDN.';
  console.error(e);
}

if (socket) {
  setButtonsEnabled(true);

  createRoomBtn.addEventListener('click', () => socket.emit('create_room'));
  joinRoomBtn.addEventListener('click', () => {
    const code = (joinCodeInput.value || '').trim();
    if (!code) { lobbyMsgEl.textContent = 'Введите код комнаты.'; return; }
    socket.emit('join_room', { room_code: code });
  });
  if (createBotRoomBtn) {
    createBotRoomBtn.addEventListener('click', () => socket.emit('create_bot_room'));
  }

  socket.on('connect', () => {
    if (connectionMsg) connectionMsg.textContent = 'Соединение установлено';
  });
  socket.on('connect_error', (err) => {
    if (connectionMsg) connectionMsg.textContent = 'Ошибка соединения: ' + (err?.message || 'неизвестно');
  });
  socket.on('disconnect', () => {
    if (connectionMsg) connectionMsg.textContent = 'Соединение потеряно';
  });

  socket.on('error_message', (data) => {
    const msg = data?.error || 'Ошибка.';
    if (gameEl.classList.contains('hidden')) lobbyMsgEl.textContent = msg; else statusMsg.textContent = msg;
  });

  socket.on('room_joined', (data) => {
    roomCode = data.room_code; mySeat = data.your_seat;
    lobbyMsgEl.textContent = data.message || '';
    roomCodeText.textContent = roomCode; seatText.textContent = String(mySeat);
    lobbyEl.classList.add('hidden'); gameEl.classList.remove('hidden');
    turnText.textContent = 'Ожидание второго игрока...';
  });

  socket.on('game_started', (data) => {
    roomCode = data.room_code; mySeat = data.your_seat;
    boardSize = data.board_size; isMyTurn = !!data.is_your_turn;
    myBoard = data.your_board; gameOver = false; statusMsg.textContent = '';
    enemyMarks = Array.from({ length: boardSize }, () => Array(boardSize).fill(0));
    renderBoards(); updateTurnText();
  });

  socket.on('shot_result', (data) => {
    if (gameOver) return;
    const { x, y, result, shooter_seat, next_turn_seat } = data;
    if (shooter_seat === mySeat) {
      // Our shot -> mark enemy board
      enemyMarks[y][x] = (result === 'hit') ? 3 : (result === 'near' ? 4 : 2);
    } else {
      // Opponent shot -> update our board
      myBoard[y][x] = (result === 'hit') ? 3 : 2; // 'near' is still miss on our board
    }
    isMyTurn = (next_turn_seat === mySeat);
    // Status message
    const actor = (shooter_seat === mySeat) ? 'Вы' : 'Соперник';
    const text = (data.sunk ? 'убил' : (result === 'hit' ? 'попал' : (result === 'near' ? 'рядом' : 'мимо')));
    statusMsg.textContent = `${actor}: ${text}`;
    renderBoards(); updateTurnText();
  });

  socket.on('game_over', (data) => {
    gameOver = true; isMyTurn = false;
    const youWin = data.winner_seat === mySeat;
    statusMsg.textContent = youWin ? 'Победа!' : 'Поражение!';
    updateTurnText();
  });

  socket.on('opponent_left', () => {
    statusMsg.textContent = 'Оппонент покинул игру.';
    isMyTurn = false; gameOver = true; updateTurnText();
  });
}

function updateTurnText() {
  if (gameOver) { turnText.textContent = 'Игра завершена'; return; }
  turnText.textContent = isMyTurn ? 'Ваш ход' : 'Ход соперника';
}

function renderBoards() {
  renderMyBoard(); renderEnemyBoard();
}

function renderMyBoard() {
  myBoardEl.innerHTML = '';
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const v = myBoard[y][x];
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (v === 1) cell.classList.add('ship');
      if (v === 2) cell.classList.add('miss');
      if (v === 3) cell.classList.add('hit');
      myBoardEl.appendChild(cell);
    }
  }
}

function renderEnemyBoard() {
  enemyBoardEl.innerHTML = '';
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const mark = enemyMarks[y][x];
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (mark === 2) cell.classList.add('miss');
      if (mark === 3) cell.classList.add('hit');
      if (mark === 4) cell.classList.add('near');
      const alreadyShot = (mark === 2 || mark === 3 || mark === 4);
      if (!gameOver && isMyTurn && !alreadyShot) {
        cell.classList.add('targetable');
        cell.addEventListener('click', () => fire(x, y));
      }
      enemyBoardEl.appendChild(cell);
    }
  }
}

function fire(x, y) {
  if (!isMyTurn || gameOver || !socket) return;
  socket.emit('fire', { x, y });
}
