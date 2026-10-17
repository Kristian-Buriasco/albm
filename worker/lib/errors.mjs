// AuthError: the server rejected the token, stop at once. FatalError: a configuration/engine problem that
// would fail every photo the same way, so the run stops instead of burning each photo's attempts.
export class UsageError extends Error {}
export class AuthError extends Error {}
export class FatalError extends Error {}
