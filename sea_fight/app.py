from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit
import random
import string
import time
from game import create_board_with_ships

app = Flask(__name__)
app.config['SECRET_KEY'] = 'change-this-secret'
# Ensure template changes are picked up without full restart
app.config['TEMPLATES_AUTO_RELOAD'] = True
# Use threading async mode for compatibility with latest Python versions
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# In-memory game state. For a simple LAN game, keeping it in memory is fine.
rooms = {}
# sid -> room_code mapping for convenience
sid_to_room = {}

BOARD_SIZE = 10


def generate_room_code(length: int = 5) -> str:
    """Generate a simple numeric room code."""
    while True:
        code = ''.join(random.choices('0123456789', k=length))
        if code not in rooms:
            return code


def get_seat_by_sid(room, sid):
    for seat, s in room['seats'].items():
        if s == sid:
            return seat
    return None


def get_opponent_sid(room, sid):
    my_seat = get_seat_by_sid(room, sid)
    if my_seat is None:
        return None
    other_seat = 1 if my_seat == 2 else 2
    return room['seats'].get(other_seat)


def is_bot_sid(sid):
    return sid == 'BOT'


def any_adjacent_ship(board, x, y, size):
    for ny in range(y - 1, y + 2):
        for nx in range(x - 1, x + 2):
            if 0 <= nx < size and 0 <= ny < size:
                if board[ny][nx] in (1, 3):
                    return True
    return False


def compute_shot(room, shooter_seat, x, y):
    """
    Process a shot from shooter_seat at (x,y) on opponent's board.
    Returns: result(str in {'hit','miss','near'}), sunk(bool), next_turn_seat(int), game_over(bool)
    """
    # Find shooter and opponent sids
    sid_shooter = room['seats'][shooter_seat]
    opp_seat = 1 if shooter_seat == 2 else 2
    sid_opp = room['seats'].get(opp_seat)

    opp_state = room['players'][sid_opp]
    board = opp_state['board']
    ships = opp_state['ships']

    cell = board[y][x]
    result = 'miss'
    sunk = False

    if cell in (2, 3):
        # already shot here; treat as miss and keep same turn to avoid desync
        return 'miss', False, shooter_seat, False

    if cell == 1:
        board[y][x] = 3
        result = 'hit'
        # update ship segments
        for ship_cells in ships:
            if (x, y) in ship_cells:
                ship_cells.remove((x, y))
                if len(ship_cells) == 0:
                    sunk = True
                break
        # check all sunk
        all_sunk = all(len(s) == 0 for s in ships)
        if all_sunk:
            return result, True, shooter_seat, True
        next_turn_seat = shooter_seat
        return result, sunk, next_turn_seat, False
    else:
        # miss
        board[y][x] = 2
        # detect near
        is_near = any_adjacent_ship(board, x, y, BOARD_SIZE)
        result = 'near' if is_near else 'miss'
        next_turn_seat = opp_seat
        return result, sunk, next_turn_seat, False


@app.route('/')
def index():
    return render_template('index.html')


@socketio.on('connect')
def on_connect():
    emit('connected', {'message': 'connected'})


@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    code = sid_to_room.pop(sid, None)
    if not code:
        return
    room = rooms.get(code)
    if not room:
        return

    # Notify opponent and clean up
    opponent_sid = get_opponent_sid(room, sid)
    # Remove from seats and players
    seat = get_seat_by_sid(room, sid)
    if seat in room['seats']:
        room['seats'].pop(seat, None)
    room['players'].pop(sid, None)

    leave_room(code)

    if opponent_sid and not is_bot_sid(opponent_sid):
        emit('opponent_left', {'room_code': code}, room=opponent_sid)

    # If room is empty, delete it
    if not room['seats']:
        rooms.pop(code, None)


@socketio.on('create_room')
def on_create_room():
    sid = request.sid
    # If already in a room, ignore
    if sid in sid_to_room:
        emit('error_message', {'error': 'Вы уже в комнате.'})
        return

    code = generate_room_code()
    rooms[code] = {
        'seats': {},         # {1: sid1, 2: sid2}
        'players': {},       # sid -> {'board': [[..]], 'ships': [set(...), ...]}
        'turn': None,        # 1 or 2
        'created_at': time.time(),
    }

    rooms[code]['seats'][1] = sid
    rooms[code]['players'][sid] = {}
    sid_to_room[sid] = code

    join_room(code)
    emit('room_joined', {
        'room_code': code,
        'your_seat': 1,
        'message': 'Комната создана. Ожидание второго игрока...'
    })


@socketio.on('create_bot_room')
def on_create_bot_room():
    """Create a room and auto-join a bot as the second player."""
    sid = request.sid
    if sid in sid_to_room:
        emit('error_message', {'error': 'Вы уже в комнате.'})
        return
    code = generate_room_code()
    rooms[code] = {
        'seats': {},
        'players': {},
        'turn': None,
        'created_at': time.time(),
        'is_bot': True,
        'bot_seat': 2,
    }
    rooms[code]['seats'][1] = sid
    rooms[code]['seats'][2] = 'BOT'
    rooms[code]['players'][sid] = {}
    rooms[code]['players']['BOT'] = {}
    sid_to_room[sid] = code
    join_room(code)
    emit('room_joined', {
        'room_code': code,
        'your_seat': 1,
        'message': 'Комната с ботом создана. Игра начнётся сейчас.'
    })
    start_game(code)


@socketio.on('join_room')
def on_join_room(data):
    sid = request.sid
    code = str(data.get('room_code', '')).strip()
    if not code:
        emit('error_message', {'error': 'Введите код комнаты.'})
        return

    room = rooms.get(code)
    if not room:
        emit('error_message', {'error': 'Комнаты с таким кодом не существует.'})
        return

    if sid in sid_to_room:
        emit('error_message', {'error': 'Вы уже в комнате.'})
        return

    if len(room['seats']) >= 2:
        emit('error_message', {'error': 'Комната уже заполнена.'})
        return

    # Assign seat
    seat = 1 if 1 not in room['seats'] else 2
    room['seats'][seat] = sid
    room['players'][sid] = {}
    sid_to_room[sid] = code
    join_room(code)

    emit('room_joined', {
        'room_code': code,
        'your_seat': seat,
        'message': 'Вы присоединились к комнате.'
    })

    # If both players present, start the game
    if len(room['seats']) == 2:
        start_game(code)


def start_game(code: str):
    room = rooms.get(code)
    if not room or len(room['seats']) != 2:
        return

    # Prepare boards and ships for both players
    for seat, sid in room['seats'].items():
        board, ships = create_board_with_ships(BOARD_SIZE)
        room['players'][sid]['board'] = board
        room['players'][sid]['ships'] = ships  # list of sets of (x, y)

    # Randomly choose who starts
    starting_seat = random.choice([1, 2])
    room['turn'] = starting_seat

    # Send initial state to each player separately (include own board for display)
    for seat, sid in room['seats'].items():
        if not is_bot_sid(sid):
            emit('game_started', {
                'room_code': code,
                'your_seat': seat,
                'board_size': BOARD_SIZE,
                'your_board': room['players'][sid]['board'],  # 0 empty, 1 ship
                'is_your_turn': (seat == starting_seat)
            }, room=sid)

    room['turn'] = starting_seat
    # If bot starts, make its move in background
    if room.get('is_bot') and room.get('bot_seat') == starting_seat:
        socketio.start_background_task(bot_play_loop, code)


def bot_play_loop(code: str):
    room = rooms.get(code)
    if not room:
        return
    while True:
        # safety
        if not room.get('is_bot'):
            return
        bot_seat = room.get('bot_seat', 2)
        if room.get('turn') != bot_seat:
            return
        # choose a random unknown cell on human board
        human_seat = 1 if bot_seat == 2 else 2
        human_sid = room['seats'].get(human_seat)
        human_state = room['players'][human_sid]
        board = human_state['board']
        candidates = [(x, y) for y in range(BOARD_SIZE) for x in range(BOARD_SIZE) if board[y][x] not in (2, 3)]
        if not candidates:
            return
        x, y = random.choice(candidates)
        # simulate think time
        socketio.sleep(0.6)
        result, sunk, next_turn_seat, game_over = compute_shot(room, bot_seat, x, y)
        # broadcast (use socketio.emit in background thread, no request context)
        socketio.emit('shot_result', {
            'room_code': code,
            'x': x,
            'y': y,
            'result': result,
            'sunk': sunk,
            'shooter_seat': bot_seat,
            'next_turn_seat': next_turn_seat
        }, room=code)
        room['turn'] = next_turn_seat
        if game_over:
            socketio.emit('game_over', {'room_code': code, 'winner_seat': bot_seat}, room=code)
            return
        # If bot keeps turn (hit), continue loop; else exit
        if next_turn_seat != bot_seat:
            return

@socketio.on('fire')
def on_fire(data):
    sid = request.sid
    code = sid_to_room.get(sid)
    if not code:
        emit('error_message', {'error': 'Вы не в комнате.'})
        return
    room = rooms.get(code)
    if not room:
        emit('error_message', {'error': 'Комната не найдена.'})
        return

    try:
        x = int(data.get('x'))
        y = int(data.get('y'))
    except Exception:
        emit('error_message', {'error': 'Неверные координаты.'})
        return

    if not (0 <= x < BOARD_SIZE and 0 <= y < BOARD_SIZE):
        emit('error_message', {'error': 'Координаты вне поля.'})
        return

    my_seat = get_seat_by_sid(room, sid)
    if my_seat != room.get('turn'):
        emit('error_message', {'error': 'Сейчас не ваш ход.'})
        return

    opponent_sid = get_opponent_sid(room, sid)
    if not opponent_sid:
        emit('error_message', {'error': 'Оппонент не найден.'})
        return
    # Process shot via shared logic
    result, sunk, next_turn_seat, game_over = compute_shot(room, my_seat, x, y)
    # Broadcast
    emit('shot_result', {
        'room_code': code,
        'x': x,
        'y': y,
        'result': result,
        'sunk': sunk,
        'shooter_seat': my_seat,
        'next_turn_seat': next_turn_seat
    }, room=code)
    room['turn'] = next_turn_seat
    if game_over:
        emit('game_over', {'room_code': code, 'winner_seat': my_seat}, room=code)
        return
    # If next is bot, trigger bot move
    if room.get('is_bot') and room.get('bot_seat') == next_turn_seat:
        socketio.start_background_task(bot_play_loop, code)


if __name__ == '__main__':
    # Bind to all interfaces so others on your Wi-Fi can connect
    socketio.run(app, host='0.0.0.0', port=5000)
