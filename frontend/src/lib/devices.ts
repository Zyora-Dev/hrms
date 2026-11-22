import { API_URL, getToken } from "./auth";
import { ApiError } from "./company";

export type Device = {
  id: number;
  name: string;
  host: string;
  port: number;
  password: number;
  timeout_seconds: number;
  force_udp: boolean;
  omit_ping: boolean;
  location: string | null;
  clear_after_fetch: boolean;
  is_active: boolean;
  serial_number: string | null;
  model: string | null;
  last_sync_at: string | null;
  last_punch_at: string | null;
  last_error: string | null;
};

export type DevicePayload = Omit<
  Device,
  | "id"
  | "serial_number"
  | "model"
  | "last_sync_at"
  | "last_punch_at"
  | "last_error"
>;

export type DeviceTest = {
  reachable: boolean;
  serial_number: string | null;
  model: string | null;
  firmware: string | null;
  platform: string | null;
  device_time: string | null;
  users: number;
  records: number;
  clock_drift_minutes: number | null;
  message: string | null;
};

export type DeviceFetch = {
  received: number;
  stored: number;
  duplicates: number;
  unmatched: string[];
  recomputed_days: number;
  first_punch_at: string | null;
  last_punch_at: string | null;
};

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (res.ok) return data as T;

  const detail = data?.detail;
  if (Array.isArray(detail)) {
    throw new ApiError(
      String(detail[0]?.msg ?? "Invalid value").replace(/^Value error,\s*/, ""),
      res.status,
      {},
    );
  }
  throw new ApiError(
    typeof detail === "string" ? detail : "Something went wrong",
    res.status,
  );
}

const json = (method: string, body?: unknown) => ({
  method,
  headers: { ...authHeaders(), "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const listDevices = () =>
  fetch(`${API_URL}/devices`, { headers: authHeaders() }).then(handle<Device[]>);

export const createDevice = (body: DevicePayload) =>
  fetch(`${API_URL}/devices`, json("POST", body)).then(handle<Device>);

export const updateDevice = (id: number, body: DevicePayload) =>
  fetch(`${API_URL}/devices/${id}`, json("PUT", body)).then(handle<Device>);

export const deleteDevice = (id: number) =>
  fetch(`${API_URL}/devices/${id}`, json("DELETE")).then(handle<void>);

export const testDevice = (id: number) =>
  fetch(`${API_URL}/devices/${id}/test`, json("POST")).then(handle<DeviceTest>);

export const fetchDevice = (id: number, full = false) =>
  fetch(`${API_URL}/devices/${id}/fetch?full=${full}`, json("POST")).then(
    handle<DeviceFetch>,
  );

export const fetchAllDevices = () =>
  fetch(`${API_URL}/devices/fetch-all`, json("POST")).then(
    handle<DeviceFetch[]>,
  );

export function emptyDevice(): DevicePayload {
  return {
    name: "",
    host: "",
    port: 4370,
    password: 0,
    timeout_seconds: 10,
    force_udp: false,
    omit_ping: true,
    location: null,
    clear_after_fetch: false,
    is_active: true,
  };
}

export { ApiError };
