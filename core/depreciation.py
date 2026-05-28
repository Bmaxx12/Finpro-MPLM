"""
Depreciation calculation module.
5 metode sesuai modul FM dosen:
  Straight Line, Declining Balance, Double Declining,
  Unit of Production, Sum of the Year.

CATATAN FORMULA (sesuai modul):
  Straight Line    : Di = K/N
  Declining Balance: Di = K·R·(1-R)^(i-1),  R = 1/N,  i mulai dari 1
  Double Declining : Di = K·2R·(1-2R)^(i-1), R = 1/N, i mulai dari 1
  Unit of Production: Di = (Prod_i / Reserve) × K
  Sum of Year      : Di = K·2·(N-i+1) / (N·(N+1)),   i mulai dari 1
"""


def straight_line(capital: float, n: int) -> list[float]:
    """Di = K / N — depresiasi tetap tiap tahun."""
    if n <= 0:
        return []
    d = capital / n
    return [d] * n

def declining_balance(capital: float, n: int) -> list[float]:
    """
    Declining Balance Method
    Menggunakan remaining book value tiap tahun.
    """

    if n <= 0:
        return []

    rate = 1.0 / n

    book_value = capital
    depr = []

    for i in range(n):

        d = book_value * rate

        # tahun terakhir → habiskan semua
        if i == n - 1:
            d = book_value

        depr.append(d)

        book_value -= d

    return depr

def double_declining_balance(capital: float, n: int) -> list[float]:
    """
    Double Declining Balance Method
    """

    if n <= 0:
        return []

    rate = 2.0 / n

    book_value = capital
    depr = []

    for i in range(n):

        d = book_value * rate

        # jangan sampai negatif
        if d > book_value:
            d = book_value

        # tahun terakhir → habiskan
        if i == n - 1:
            d = book_value

        depr.append(d)

        book_value -= d

    return depr

def unit_of_production(capital: float, reserve: float, production: list[float]) -> list[float]:
    """Di = (Prod_i / Reserve) × K"""
    if reserve <= 0:
        return [0.0] * len(production)

    depr = []
    cum_depr = 0.0
    for p in production:
        d = (p / reserve) * capital
        # pastikan total depresiasi tidak melebihi modal
        if cum_depr + d > capital:
            d = capital - cum_depr
        if d < 0:
            d = 0.0
        depr.append(d)
        cum_depr += d
    return depr


def sum_of_year(capital: float, n: int) -> list[float]:
    """Di = K · 2·(N - i + 1) / (N·(N+1)),  i = 1..N
    
    Contoh N=4: sum of years = 1+2+3+4 = 10
      i=1: D1 = K·2·(4) / (4·5) = K·8/20 = 0.4K
      i=2: D2 = K·2·(3) / (4·5) = K·6/20 = 0.3K
      i=3: D3 = K·2·(2) / (4·5) = K·4/20 = 0.2K
      i=4: D4 = K·2·(1) / (4·5) = K·2/20 = 0.1K
    Sesuai tabel modul FM halaman 22-23.
    """
    if n <= 0:
        return []
    denom = n * (n + 1)
    # i mulai dari 1 sampai N
    return [capital * 2 * (n - i + 1) / denom for i in range(1, n + 1)]


def compute_depreciation(
    method: str,
    capital: float,
    n: int,
    reserve: float = None,
    production: list[float] = None,
) -> list[float]:
    """Dispatcher — kembalikan list nilai depresiasi sepanjang n tahun."""
    method = method.lower()
    if method == "straight_line":
        return straight_line(capital, n)
    elif method == "declining_balance":
        return declining_balance(capital, n)
    elif method == "double_declining":
        return double_declining_balance(capital, n)
    elif method == "unit_of_production":
        if reserve is None or production is None:
            raise ValueError("unit_of_production butuh reserve dan production")
        return unit_of_production(capital, reserve, production)
    elif method == "sum_of_year":
        return sum_of_year(capital, n)
    else:
        raise ValueError(f"Metode depresiasi tidak dikenal: {method}")