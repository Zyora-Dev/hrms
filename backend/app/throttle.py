"""Slowing down password guessing.

Two counters, because they catch different attacks:

  * per account — someone working through a word list against one person
  * per address — someone spraying one common password across every account

Both are in memory, which is right for a single API process; with two
processes an attacker would simply get two allowances, and this would need
moving to Redis or the database.

The two are checked at different moments, on purpose:

  * the address check runs *before* the password is verified, so a spray from
    one machine cannot make the server burn CPU on bcrypt all day;
  * the account check runs *after*, so somebody who knows their own password
    always gets in. Refusing a correct password would let an attacker lock a
    real user out of their own account by guessing badly on purpose.
"""

import time
from collections import defaultdict, deque
from dataclasses import dataclass

# Failures allowed before the door closes, and how long it stays closed.
ACCOUNT_LIMIT = 5
ACCOUNT_WINDOW = 15 * 60
ACCOUNT_LOCKOUT = 15 * 60

ADDRESS_LIMIT = 20
ADDRESS_WINDOW = 15 * 60
ADDRESS_LOCKOUT = 10 * 60


@dataclass
class Decision:
    allowed: bool
    retry_after: int = 0
    reason: str | None = None


_failures: dict[str, deque[float]] = defaultdict(deque)
_locked_until: dict[str, float] = {}


def _trim(key: str, window: int, now: float) -> deque[float]:
    hits = _failures[key]
    while hits and now - hits[0] > window:
        hits.popleft()
    return hits


def _check(key: str, limit: int, window: int, now: float) -> int:
    """Seconds still to wait on this key, or 0 if it is clear."""
    until = _locked_until.get(key)
    if until and until > now:
        return int(until - now) + 1
    if until:
        # The lockout expired; start the count again rather than leaving the
        # user one mistake away from another lockout.
        _locked_until.pop(key, None)
        _failures.pop(key, None)

    return 0 if len(_trim(key, window, now)) < limit else 1


def check_address(address: str | None) -> Decision:
    """Before the password is read: is this machine allowed to keep trying?"""
    if not address:
        return Decision(True)

    wait = _check(f"ip:{address}", ADDRESS_LIMIT, ADDRESS_WINDOW, time.monotonic())
    if wait:
        return Decision(False, wait, "Too many failed attempts from this address.")
    return Decision(True)


def check_account(identifier: str) -> Decision:
    """After a wrong password: has this account run out of attempts?"""
    wait = _check(
        f"id:{identifier.lower()}", ACCOUNT_LIMIT, ACCOUNT_WINDOW, time.monotonic()
    )
    if wait:
        return Decision(
            False,
            wait,
            "Too many failed attempts for this account. Try again shortly.",
        )
    return Decision(True)


def record_failure(identifier: str, address: str | None) -> None:
    now = time.monotonic()

    for key, limit, window, lockout in (
        (f"id:{identifier.lower()}", ACCOUNT_LIMIT, ACCOUNT_WINDOW, ACCOUNT_LOCKOUT),
        (f"ip:{address}", ADDRESS_LIMIT, ADDRESS_WINDOW, ADDRESS_LOCKOUT),
    ):
        if key.endswith(":None"):
            continue
        hits = _trim(key, window, now)
        hits.append(now)
        if len(hits) >= limit:
            _locked_until[key] = now + lockout


def record_success(identifier: str, address: str | None) -> None:
    """A correct password clears the slate for that account."""
    for key in (f"id:{identifier.lower()}", f"ip:{address}" if address else None):
        if key:
            _failures.pop(key, None)
            _locked_until.pop(key, None)


def reset() -> None:
    """For tests."""
    global _since_sweep
    _failures.clear()
    _locked_until.clear()
    _api_hits.clear()
    _warned.clear()
    _since_sweep = 0


# ---------------------------------------------------------------------------
# General API limiting
# ---------------------------------------------------------------------------

# Generous enough that no screen in the app comes close, tight enough that a
# runaway client is stopped rather than left hammering the database. The
# expenses page once managed 82,000 calls before anyone noticed.
API_LIMIT = 240
API_WINDOW = 60

_api_hits: dict[str, deque[float]] = defaultdict(deque)
# Keys seen misbehaving, so the log says so once rather than every request.
_warned: set[str] = set()

# A key is only trimmed when its own caller asks again, so a caller that
# never returns leaves its entry behind forever. Tokens rotate on every
# sign-in, so without this the table grows for as long as the process runs.
SWEEP_EVERY = 500
_since_sweep = 0


def _sweep(now: float) -> None:
    """Drop keys nobody has used within the longest window we care about."""
    horizon = max(API_WINDOW, ACCOUNT_WINDOW, ADDRESS_WINDOW)

    for store in (_api_hits, _failures):
        for key in [
            k for k, hits in store.items()
            if not hits or now - hits[-1] > horizon
        ]:
            store.pop(key, None)
            _warned.discard(key)

    for key in [k for k, until in _locked_until.items() if until <= now]:
        _locked_until.pop(key, None)


def api_allowance(key: str) -> Decision:
    """Returns the verdict for one more request from this caller."""
    global _since_sweep

    now = time.monotonic()

    _since_sweep += 1
    if _since_sweep >= SWEEP_EVERY:
        _since_sweep = 0
        _sweep(now)

    hits = _api_hits[key]

    while hits and now - hits[0] > API_WINDOW:
        hits.popleft()

    if len(hits) >= API_LIMIT:
        oldest = hits[0]
        return Decision(
            False,
            int(API_WINDOW - (now - oldest)) + 1,
            "Too many requests. Slow down and try again shortly.",
        )

    hits.append(now)
    return Decision(True)


def first_warning(key: str) -> bool:
    """True the first time a key trips the limit, so logs stay readable."""
    if key in _warned:
        return False
    _warned.add(key)
    return True


def forget(key: str) -> None:
    _api_hits.pop(key, None)
    _warned.discard(key)
