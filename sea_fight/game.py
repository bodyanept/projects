import random
from typing import List, Set, Tuple

Coord = Tuple[int, int]


def create_board_with_ships(size: int = 10):
    """
    Create a size x size board with ships placed according to classic Battleship rules.
    Ships: 4-long x1, 3-long x2, 2-long x3, 1-long x4
    Board values:
      0 - empty
      1 - ship
      2 - miss (runtime)
      3 - hit (runtime)
    Returns: (board, ships_remaining)
      board: List[List[int]]
      ships_remaining: List[Set[Coord]] - each set are the remaining cells of a ship
    """
    board = [[0 for _ in range(size)] for _ in range(size)]

    # Define ship lengths
    ships = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]

    ships_cells: List[Set[Coord]] = []

    for length in ships:
        placed = False
        for _ in range(1000):  # try many times to place each ship
            orientation = random.choice(['H', 'V'])
            if orientation == 'H':
                x = random.randint(0, size - length)
                y = random.randint(0, size - 1)
                coords = [(x + i, y) for i in range(length)]
            else:
                x = random.randint(0, size - 1)
                y = random.randint(0, size - length)
                coords = [(x, y + i) for i in range(length)]

            if can_place(board, coords, size):
                # place ship
                for (cx, cy) in coords:
                    board[cy][cx] = 1
                ships_cells.append(set(coords))
                placed = True
                break
        if not placed:
            # If we fail to place a ship after many tries, restart placement from scratch
            return create_board_with_ships(size)

    return board, ships_cells


def can_place(board: List[List[int]], coords: List[Coord], size: int) -> bool:
    """
    Check that all coords are free and not adjacent (including diagonally) to other ships.
    """
    # All cells must be within bounds and empty
    for (x, y) in coords:
        if not (0 <= x < size and 0 <= y < size):
            return False
        if board[y][x] != 0:
            return False

    # Check adjacency
    for (x, y) in coords:
        for ny in range(y - 1, y + 2):
            for nx in range(x - 1, x + 2):
                if 0 <= nx < size and 0 <= ny < size:
                    if board[ny][nx] == 1 and (nx, ny) not in coords:
                        return False
    return True
