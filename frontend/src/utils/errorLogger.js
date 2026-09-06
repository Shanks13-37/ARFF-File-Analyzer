const clientErrors = [];

/** Retain concise client diagnostics without exposing details to users. */
export function logClientError({ stage, code, message, context = {} }) {
  const entry = {
    timestamp: new Date().toISOString(),
    stage,
    code,
    message: String(message || "Unknown client error"),
    context
  };
  clientErrors.push(entry);
  if (clientErrors.length > 100) clientErrors.shift();
  console.error(`[${stage}/${code}] ${entry.message}`, context);
  return entry;
}

export function getClientErrors() {
  return clientErrors.map((entry) => ({ ...entry, context: { ...entry.context } }));
}
