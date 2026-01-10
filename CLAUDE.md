# Claude Code Instructions

## Git Worktrees for Parallel Development

When working on a new feature, consider using a git worktree. This allows multiple AI agent sessions to work on different features simultaneously without conflicts.

### When to use worktrees
- Starting work on a new feature that might conflict with other ongoing work
- Multiple agent sessions need to work in parallel

### When NOT to use worktrees
- Small changes or fixes
- Working on the same feature as another session
- Quick one-off tasks

### Commands
```bash
# Create a new worktree for a feature (includes copying .env)
git worktree add ../feature-name -b feature/feature-name && cp .env ../feature-name/

# List existing worktrees
git worktree list

# Remove a worktree when done (after merging)
git worktree remove ../feature-name
```

### Important: .env file
The `.env` file contains API credentials and is not tracked by git. When creating a new worktree, always copy it:
```bash
cp /home/hendrik/playerTracking/takaro-player-map/.env ../new-worktree/
```

## Code Quality

This project uses Biome for linting and formatting. Always check code quality before committing.

### Running Code Quality Checks

Before committing changes:
```bash
npm run check        # Check for linting and formatting issues
```

Auto-fix issues:
```bash
npm run check:fix    # Automatically fix linting and formatting issues
```

### CI Enforcement

The CI pipeline runs `npm run ci:check` on all pull requests. Code that doesn't pass linting will fail the CI build.

### Best Practices

- Run `npm run check:fix` before committing to catch issues early
- If CI fails on linting, run `npm run check:fix` locally and push the fixes
- Don't commit code with linting errors - fix them first
