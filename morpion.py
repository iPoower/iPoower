"""Jeu de morpion (tic-tac-toe) en ligne de commande.

Lancez:
    python3 morpion.py
"""

from __future__ import annotations

from dataclasses import dataclass

WIN_COMBINATIONS = (
    (0, 1, 2),
    (3, 4, 5),
    (6, 7, 8),
    (0, 3, 6),
    (1, 4, 7),
    (2, 5, 8),
    (0, 4, 8),
    (2, 4, 6),
)


@dataclass
class Morpion:
    board: list[str]
    current_player: str = "X"

    def __init__(self) -> None:
        self.board = [" "] * 9
        self.current_player = "X"

    def display_board(self) -> None:
        """Affiche la grille avec des positions guides pour les cases vides."""
        print()
        for row in range(3):
            cells = []
            for col in range(3):
                idx = row * 3 + col
                value = self.board[idx]
                cells.append(value if value != " " else str(idx + 1))
            print(f" {cells[0]} | {cells[1]} | {cells[2]} ")
            if row < 2:
                print("---+---+---")
        print()

    def make_move(self, position: int) -> bool:
        """Joue un coup si possible.

        Args:
            position: Position 1..9 choisie par le joueur.

        Returns:
            True si le coup est validé, sinon False.
        """
        if position < 1 or position > 9:
            return False

        idx = position - 1
        if self.board[idx] != " ":
            return False

        self.board[idx] = self.current_player
        return True

    def has_winner(self) -> bool:
        """Indique si le joueur courant vient de gagner."""
        for a, b, c in WIN_COMBINATIONS:
            if (
                self.board[a] == self.current_player
                and self.board[b] == self.current_player
                and self.board[c] == self.current_player
            ):
                return True
        return False

    def is_draw(self) -> bool:
        """Indique si la partie est nulle."""
        return all(cell != " " for cell in self.board)

    def switch_player(self) -> None:
        self.current_player = "O" if self.current_player == "X" else "X"


def ask_position(player: str) -> int:
    """Demande une position valide à l'utilisateur."""
    while True:
        choice = input(f"Joueur {player}, choisis une case (1-9) : ").strip()
        if not choice.isdigit():
            print("❌ Entrée invalide: entre un chiffre entre 1 et 9.")
            continue

        return int(choice)


def main() -> None:
    print("🎮 Bienvenue dans le jeu du Morpion !")
    print("Deux joueurs jouent à tour de rôle: X puis O.")

    game = Morpion()

    while True:
        game.display_board()
        pos = ask_position(game.current_player)

        if not game.make_move(pos):
            print("❌ Coup impossible: case occupée ou hors de la grille.")
            continue

        if game.has_winner():
            game.display_board()
            print(f"🏆 Bravo ! Le joueur {game.current_player} gagne !")
            break

        if game.is_draw():
            game.display_board()
            print("🤝 Match nul !")
            break

        game.switch_player()


if __name__ == "__main__":
    main()
