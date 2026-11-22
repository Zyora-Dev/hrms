"""Talking to eSSL / ZKTeco attendance terminals.

Both makes speak the same protocol on TCP 4370 — an eSSL MB20ID answers the
same calls a ZKTeco reader does — so one client covers them.

Two ways exist to get punches off a terminal:

  * pull  — the server opens a connection and reads the log. Needs nothing on
            the device beyond an IP, which is why it is what this module does.
  * push  — the device posts to a server URL (ADMS). Depends on firmware and,
            on eSSL units, on the feature being licensed.

Reading the log never deletes it: the same punch arriving twice is dropped by
the unique constraint on (employee, time, external id), so a fetch can be run
as often as you like.
"""

from dataclasses import dataclass, field
from datetime import date, datetime

from zk import ZK

from app.models import BiometricDevice


@dataclass
class DeviceInfo:
    serial_number: str | None = None
    model: str | None = None
    firmware: str | None = None
    platform: str | None = None
    device_time: datetime | None = None
    users: int = 0
    records: int = 0


@dataclass
class DeviceLog:
    user_id: str
    punched_at: datetime
    status: int = 0
    punch_type: int = 0


@dataclass
class FetchResult:
    logs: list[DeviceLog] = field(default_factory=list)
    info: DeviceInfo = field(default_factory=DeviceInfo)


class DeviceError(RuntimeError):
    """The terminal could not be reached or refused the conversation."""


def _client(device: BiometricDevice) -> ZK:
    return ZK(
        device.host,
        port=device.port,
        timeout=device.timeout_seconds,
        password=device.password,
        force_udp=device.force_udp,
        ommit_ping=device.omit_ping,
    )


def _connect(device: BiometricDevice):
    try:
        return _client(device).connect()
    except Exception as exc:  # pyzk raises bare exceptions for everything
        raise DeviceError(
            f"Could not reach {device.host}:{device.port} — {exc}"
        ) from exc


def _info(conn) -> DeviceInfo:
    def safe(call, default=None):
        try:
            return call()
        except Exception:
            return default

    return DeviceInfo(
        serial_number=safe(conn.get_serialnumber),
        model=safe(conn.get_device_name),
        firmware=safe(conn.get_firmware_version),
        platform=safe(conn.get_platform),
        device_time=safe(conn.get_time),
        users=len(safe(conn.get_users, []) or []),
        records=safe(lambda: conn.records, 0) or 0,
    )


def test(device: BiometricDevice) -> DeviceInfo:
    """Open a connection, read the nameplate, hang up."""
    conn = _connect(device)
    try:
        return _info(conn)
    finally:
        try:
            conn.disconnect()
        except Exception:
            pass


def fetch(device: BiometricDevice, since: datetime | date | None = None) -> FetchResult:
    """Read the attendance log, optionally only what is newer than `since`.

    The device is put into a disabled state while reading, which is what the
    vendor's own software does: it stops a punch landing mid-transfer and
    being missed.
    """
    conn = _connect(device)
    result = FetchResult()

    try:
        result.info = _info(conn)

        try:
            conn.disable_device()
        except Exception:
            # Some firmware refuses; reading still works, just less safely.
            pass

        try:
            raw = conn.get_attendance() or []
        except Exception as exc:
            raise DeviceError(f"Could not read the log — {exc}") from exc

        cutoff = since
        if isinstance(cutoff, datetime):
            cutoff = cutoff.replace(tzinfo=None)

        for entry in raw:
            punched_at = entry.timestamp
            if cutoff is not None:
                if isinstance(cutoff, datetime):
                    if punched_at <= cutoff:
                        continue
                elif punched_at.date() < cutoff:
                    continue

            result.logs.append(
                DeviceLog(
                    user_id=str(entry.user_id).strip(),
                    punched_at=punched_at,
                    status=getattr(entry, "status", 0) or 0,
                    punch_type=getattr(entry, "punch", 0) or 0,
                )
            )

        if device.clear_after_fetch and result.logs:
            try:
                conn.clear_attendance()
            except Exception as exc:
                raise DeviceError(
                    f"Read {len(result.logs)} punches but could not clear the "
                    f"device — {exc}"
                ) from exc

        return result
    finally:
        try:
            conn.enable_device()
        except Exception:
            pass
        try:
            conn.disconnect()
        except Exception:
            pass


# eSSL terminals report the key pressed before the finger: 0 is a plain
# check-in, 1 a check-out. Anything else is left for the engine to work out
# from the order of the scans.
DIRECTIONS = {0: "in", 1: "out"}


def direction_of(log: DeviceLog) -> str:
    return DIRECTIONS.get(log.punch_type, "auto")
