export class NotFoundError extends Error {}

export class DuplicateProjectPathError extends Error {}

export class InvalidProjectPathError extends Error {}

export class InvalidProjectConfigFileError extends Error {}

export class InvalidDirectoryPathError extends Error {}

export class ForbiddenDirectoryPathError extends Error {}

export class InvalidBranchNameError extends Error {}

export class DefaultBranchNotFoundError extends Error {}

export class BranchAlreadyExistsError extends Error {}

export class WorktreeHasUncommittedChangesError extends Error {}

export class NoFreePortAvailableError extends Error {}

export class GitWorktreeOperationError extends Error {}
