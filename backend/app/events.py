"""A small in-process event bus, read over server-sent events.

Whoever changes something publishes a line; whoever is watching the matching
topic sees it within a second and reloads that part of the screen. There is
no queue server behind this — it is a ring buffer in memory, which is right
for a single API process and would need replacing with Redis the day there
are two.

Topics:
  * ``admin``          — anything an admin should see
  * ``employee:<id>``  — that one employee's own records
"""

import asyncio
import itertools
import json
from collections import deque
from datetime import datetime, timezone
from typing import AsyncIterator

# Enough history that a client reconnecting after a blip catches up, and
# small enough to never matter for memory.
BUFFER = 200
POLL_SECONDS = 1.0
# Streams are closed and left to reconnect rather than held open forever.
# An immortal connection keeps proxies unhappy and, in development, stops
# the reloader from ever shutting the old process down.
MAX_SECONDS = 300

_counter = itertools.count(1)
_events: deque[tuple[int, str, str]] = deque(maxlen=BUFFER)


def publish(topic: str, kind: str, **data) -> None:
    """Record something worth telling a watcher about."""
    payload = json.dumps(
        {
            "kind": kind,
            "at": datetime.now(timezone.utc).isoformat(),
            **data,
        }
    )
    _events.append((next(_counter), topic, payload))


def latest_id() -> int:
    return _events[-1][0] if _events else 0


async def stream(topics: set[str], after: int = 0) -> AsyncIterator[str]:
    """Yield SSE frames for these topics, newest first after `after`.

    A comment line goes out every few seconds whether or not anything
    happened, which keeps proxies from closing an idle connection.
    """
    cursor = after or latest_id()
    idle = 0
    lived = 0.0

    # Tell the client where it is starting from.
    yield f": connected at {cursor}\n\n"

    while True:
        pending = [
            (seq, payload)
            for seq, topic, payload in list(_events)
            if seq > cursor and topic in topics
        ]

        for seq, payload in pending:
            cursor = seq
            yield f"id: {seq}\nevent: change\ndata: {payload}\n\n"

        if pending:
            idle = 0
        else:
            cursor = max(cursor, latest_id())
            idle += POLL_SECONDS
            # Also how quickly a dropped client is noticed: nothing is written
            # to a closed socket until the next frame, and an idle stream that
            # never writes holds a reload open.
            if idle >= 10:
                idle = 0
                yield ": keep-alive\n\n"

        lived += POLL_SECONDS
        if lived >= MAX_SECONDS:
            # The client resumes from `cursor`, so nothing is missed.
            yield f": reconnect from {cursor}\n\n"
            return

        await asyncio.sleep(POLL_SECONDS)
