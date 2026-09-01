import type { EpicAuthSession } from "fnapi-js";

let active: EpicAuthSession | null = null;

export const holdSession = (session: EpicAuthSession | null) => {
  active = session;
};

export const heldSession = () => active;
