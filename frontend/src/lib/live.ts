"use client";

import { useEffect, useRef } from "react";

import { API_URL, getToken } from "./auth";
import { getEmployeeToken } from "./employee-auth";

export type LiveEvent = {
  kind: string;
  at: string;
  message?: string;
  request_id?: number;
  claim_id?: number;
  status?: string;
  employee?: string;
};

type Side = "admin" | "employee";

async function ticket(side: Side): Promise<string | null> {
  const token = side === "admin" ? getToken() : getEmployeeToken();
  if (!token) return null;

  const path = side === "admin" ? "/events/ticket" : "/events/employee-ticket";
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return ((await res.json()) as { ticket: string }).ticket;
  } catch {
    return null;
  }
}

/**
 * Watch the server for changes and call `onEvent` as they land.
 *
 * `EventSource` cannot carry an Authorization header, so a short-lived ticket
 * is fetched first and passed in the query string; it is worth nothing after
 * a minute. The connection is rebuilt on failure with a widening delay, and
 * resumes from the last event it saw rather than replaying everything.
 */
export function useLiveEvents(
  side: Side,
  onEvent: (event: LiveEvent) => void,
  enabled = true,
) {
  const handler = useRef(onEvent);

  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!enabled) return;

    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let lastId = 0;
    let stopped = false;

    async function connect() {
      if (stopped) return;

      const value = await ticket(side);
      if (!value || stopped) return;

      const path = side === "admin" ? "/events/admin" : "/events/employee";
      source = new EventSource(
        `${API_URL}${path}?ticket=${encodeURIComponent(value)}&after=${lastId}`,
      );

      source.addEventListener("change", (e) => {
        const message = e as MessageEvent<string>;
        lastId = Number(message.lastEventId) || lastId;
        attempt = 0;
        try {
          handler.current(JSON.parse(message.data) as LiveEvent);
        } catch {
          // A frame we cannot read is not worth tearing the stream down for.
        }
      });

      source.onerror = () => {
        source?.close();
        source = null;
        if (stopped) return;
        // The ticket may simply have expired; back off, then ask for another.
        attempt += 1;
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt, 30_000));
      };
    }

    connect();

    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [side, enabled]);
}
