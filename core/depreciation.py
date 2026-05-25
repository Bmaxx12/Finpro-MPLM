"""
Depreciation calculation module.
5 methods: Straight Line, Declining Balance, Double Declining,
Unit of Production, Sum of the Year.
"""


def straight_line(capital: float, n: int) -> list[float]:
    """Di = K / N — fixed depreciation each year."""
    if n <= 0:
        return []
    d = capital / n
    return [d] * n


def declining_balance(capital: float, n: int) -> list[float]:
    """Di = K · R · (1-R)^(i-1) where R = 1/N."""
    if n <= 0:
        return []
    R = 1.0 / n
    return [capital * R * ((1 - R) ** (i)) for i in range(n)]


def double_declining_balance(capital: float, n: int) -> list[float]:
    """Di = K · 2R · (1-2R)^(i-1) where R = 1/N."""
    if n <= 0:
        return []
    R = 1.0 / n
    return [capital * 2 * R * ((1 - 2 * R) ** i) for i in range(n)]


def unit_of_production(capital: float, reserve: float, production: list[float]) -> list[float]:
    """Di = (Prod_i / Reserve) × K."""
    if reserve <= 0:
        return [0.0] * len(production)
    
    depr = []
    cum_depr = 0.0
    for p in production:
        d = (p / reserve) * capital
        # buat mastiin nilai depresiasi ga lebih dari modal
        if cum_depr + d > capital:
            d = capital - cum_depr
        if d < 0:
            d = 0.0
        depr.append(d)
        cum_depr += d
    return depr


def sum_of_year(capital: float, n: int) -> list[float]:
    """Di = K · 2·(N - i + 1) / (N · (N+1))."""
    if n <= 0:
        return []
    denom = n * (n + 1)
    return [capital * 2 * (n - i) / denom for i in range(n)]


def compute_depreciation(
    method: str,
    capital: float,
    n: int,
    reserve: float = None,
    production: list[float] = None,
) -> list[float]:
    """Dispatcher — returns list of depreciation values (length = n)."""
    method = method.lower()
    if method == "straight_line":
        return straight_line(capital, n)
    elif method == "declining_balance":
        return declining_balance(capital, n)
    elif method == "double_declining":
        return double_declining_balance(capital, n)
    elif method == "unit_of_production":
        if reserve is None or production is None:
            raise ValueError("unit_of_production requires reserve and production")
        return unit_of_production(capital, reserve, production)
    elif method == "sum_of_year":
        return sum_of_year(capital, n)
    else:
        raise ValueError(f"Unknown depreciation method: {method}")