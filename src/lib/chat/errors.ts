export const CHAT_STORAGE_UNAVAILABLE_MESSAGE =
  "Firebase Admin est requis pour conserver les discussions, messages et IDs de recuperation.";

export class ChatStorageUnavailableError extends Error {
  constructor(message = CHAT_STORAGE_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "ChatStorageUnavailableError";
  }
}

export function isChatStorageUnavailableError(
  error: unknown,
): error is ChatStorageUnavailableError {
  return (
    error instanceof ChatStorageUnavailableError ||
    (error instanceof Error && error.name === "ChatStorageUnavailableError")
  );
}
