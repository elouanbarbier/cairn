/** The thing asked for does not exist (404). */
export class NotFoundError extends Error {}
/** The request is well formed but refused by a rule (400). */
export class ValidationError extends Error {}
/** The request clashes with existing data: a key already used, a workspace already set up (409). */
export class ConflictError extends Error {}
