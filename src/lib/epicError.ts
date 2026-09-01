import { EpicApiError, EpicRateLimitError } from "fnapi-js";

const IDENTIFIER = /\b[0-9a-f]{32}\b/gi;
const APOLOGY = /^sorry,?\s+/i;

const REASONS: Record<string, string> = {
  "errors.com.epicgames.friends.cannot_friend_due_to_target_settings":
    "They are not accepting friend requests",
  "errors.com.epicgames.friends.duplicate_friendship": "You are already friends",
  "errors.com.epicgames.friends.friend_request_already_sent":
    "A request is already pending",
  "errors.com.epicgames.friends.inviter_friendships_limit_exceeded":
    "Your friends list is full",
  "errors.com.epicgames.friends.invitee_friendships_limit_exceeded":
    "Their friends list is full",
  "errors.com.epicgames.friends.incoming_friendships_limit_exceeded":
    "Their pending requests are full",
  "errors.com.epicgames.friends.outgoing_friendships_limit_exceeded":
    "You have too many requests pending",
  "errors.com.epicgames.friends.friendship_not_found":
    "That friendship no longer exists",
  "errors.com.epicgames.friends.request_already_accepted":
    "That request was already accepted",
  "errors.com.epicgames.friends.self_friend": "You cannot add your own account",
  "errors.com.epicgames.friends.account_not_found":
    "That account no longer exists",
  "errors.com.epicgames.account.account_not_found":
    "That account no longer exists",
  "errors.com.epicgames.common.throttled": "Too many requests, wait a moment",
  "errors.com.epicgames.common.authentication.token_verification_failed":
    "Your session expired, sign in again",
  "errors.com.epicgames.common.oauth.invalid_token":
    "Your session expired, sign in again"
};

const tidy = (text: string) => {
  const clean = text
    .replace(IDENTIFIER, "that account")
    .replace(APOLOGY, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");

  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
};

export function reasonOf(error: unknown, fallback: string): string {
  if (error instanceof EpicRateLimitError) {
    const wait = error.retryAfterSeconds;

    return wait
      ? `Too many requests, try again in ${Math.ceil(wait)}s`
      : "Too many requests, wait a moment";
  }

  if (error instanceof EpicApiError) {
    const mapped = error.errorCode ? REASONS[error.errorCode] : undefined;
    if (mapped) return mapped;

    const body = error.body as { errorMessage?: unknown } | null;

    if (typeof body?.errorMessage === "string") {
      const spoken = tidy(body.errorMessage);
      if (spoken) return spoken;
    }

    if (error.description) {
      const spoken = tidy(error.description);
      if (spoken) return spoken;
    }
  }

  if (error instanceof Error && error.message) {
    const spoken = tidy(error.message);
    if (spoken) return spoken;
  }

  return fallback;
}
