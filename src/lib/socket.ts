import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ConnectWebSocketFactory, WebSocketLike } from "fnapi-js";

type Listener = (event: never) => void;

interface Packet {
  id: number;
  data: string;
}

interface Ending {
  id: number;
  reason: string;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

class Bridge {
  private id = 0;
  private pending: string[] = [];
  private readonly ready: Promise<number>;
  private readonly drop: Array<() => void> = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  readyState = CONNECTING;

  constructor(url: string, headers: Record<string, string>) {
    this.ready = invoke<number>("stream_open", { url, headers })
      .then((id) => {
        this.id = id;
        return id;
      })
      .catch((reason: unknown) => {
        this.fire("error", reason);
        this.shut(1006, String(reason));
        return 0;
      });

    void listen<number>("stream:opened", (event) => {
      void this.ready.then(() => {
        if (event.payload !== this.id || this.readyState !== CONNECTING) return;

        this.readyState = OPEN;

        for (const frame of this.pending) {
          void invoke("stream_send", { id: this.id, data: frame });
        }

        this.pending = [];
        this.fire("open", undefined);
      });
    }).then((off) => this.drop.push(off));

    void listen<Packet>("stream:message", (event) => {
      void this.ready.then(() => {
        if (event.payload.id !== this.id) return;

        this.fire("message", { data: event.payload.data });
      });
    }).then((off) => this.drop.push(off));

    void listen<Ending>("stream:closed", (event) => {
      void this.ready.then(() => {
        if (event.payload.id !== this.id) return;

        this.shut(1006, event.payload.reason);
      });
    }).then((off) => this.drop.push(off));
  }

  private shut(code: number, reason: string) {
    if (this.readyState === CLOSED) return;

    this.readyState = CLOSED;
    this.fire("close", { code, reason });

    for (const off of this.drop) off();
    this.drop.length = 0;
  }

  private fire(type: string, payload: unknown) {
    const handlers = this.listeners.get(type);
    if (!handlers) return;

    for (const handler of handlers) {
      (handler as (event: unknown) => void)(payload);
    }
  }

  send(data: string) {
    if (this.readyState === OPEN && this.id) {
      void invoke("stream_send", { id: this.id, data });
      return;
    }

    this.pending.push(data);
  }

  close(code?: number, reason?: string) {
    void this.ready.then((id) => {
      if (id) void invoke("stream_close", { id });
    });

    this.shut(code ?? 1000, reason ?? "");
  }

  addEventListener(type: string, listener: Listener) {
    const handlers = this.listeners.get(type) ?? new Set<Listener>();

    handlers.add(listener);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }
}

const DEVICE = "epic-connect-device-id";

export const tauriSocket: ConnectWebSocketFactory = (url, _protocols, options) => {
  const headers: Record<string, string> = {};

  for (const [name, value] of Object.entries(options?.headers ?? {})) {
    headers[name] = name.toLowerCase() === DEVICE && !value.trim() ? "artemis" : value;
  }

  return new Bridge(url, headers) as unknown as WebSocketLike;
};
