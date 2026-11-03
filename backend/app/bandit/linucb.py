"""Custom LinUCB contextual bandit (no Vowpal Wabbit — see docs/06_DECISIONS.md).

Standard disjoint LinUCB: each arm keeps its own A (d x d) and b (d,) accumulators.
  p_arm(x) = theta^T x + alpha * sqrt(x^T A^-1 x),  theta = A^-1 b
Choosing the highest p_arm picks the arm with the best upper confidence bound.
"""
import numpy as np

from app.bandit.features import DIM

DEFAULT_ALPHA = 1.0


class LinUCBArm:
    def __init__(self, dim: int = DIM, a_matrix: list[list[float]] | None = None, b_vector: list[float] | None = None):
        self.dim = dim
        self.A = np.array(a_matrix, dtype=float) if a_matrix is not None else np.identity(dim)
        self.b = np.array(b_vector, dtype=float) if b_vector is not None else np.zeros(dim)

    def score(self, context: list[float], alpha: float = DEFAULT_ALPHA) -> float:
        x = np.array(context, dtype=float)
        A_inv = np.linalg.inv(self.A)
        theta = A_inv @ self.b
        mean = float(theta @ x)
        confidence = alpha * float(np.sqrt(max(x @ A_inv @ x, 0.0)))
        return mean + confidence

    def update(self, context: list[float], reward: float) -> None:
        x = np.array(context, dtype=float).reshape(-1, 1)
        self.A += x @ x.T
        self.b += (reward * x).flatten()

    def to_json(self) -> dict:
        return {"a_matrix": self.A.tolist(), "b_vector": self.b.tolist()}


def select_arm(context: list[float], arms: dict[str, LinUCBArm], alpha: float = DEFAULT_ALPHA) -> tuple[str, dict[str, float]]:
    """Returns (chosen_arm_name, {arm_name: ucb_score}) for every arm."""
    scores = {name: arm.score(context, alpha=alpha) for name, arm in arms.items()}
    chosen = max(scores, key=lambda name: scores[name])
    return chosen, scores


def compute_reward(rating: int, resolved: bool) -> float:
    """reward = 0.6 * (rating-1)/4 + 0.4 * resolved, per the master prompt's spec."""
    return 0.6 * ((rating - 1) / 4) + 0.4 * (1.0 if resolved else 0.0)
