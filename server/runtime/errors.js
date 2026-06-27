const { RuntimeErrorCode } = require("./contracts");

class RuntimeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
    if (details) this.details = details;
  }
}

function isRuntimeError(err) {
  return err instanceof RuntimeError || typeof err?.code === "string";
}

function normalizeRuntimeError(err, { code = RuntimeErrorCode.PROVIDER_ERROR, message = "runtime provider error" } = {}) {
  if (err instanceof RuntimeError) return err;
  if (isRuntimeError(err) && Object.values(RuntimeErrorCode).includes(err.code)) {
    return new RuntimeError(err.code, err.message || message, err.details);
  }
  return new RuntimeError(code, message, { cause: err?.code || err?.name || "Error" });
}

module.exports = {
  RuntimeError,
  RuntimeErrorCode,
  normalizeRuntimeError,
};
