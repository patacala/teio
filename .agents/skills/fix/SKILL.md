---
description: |
  Investigates and fixes a bug or error. Uses the knowledge graph to
  understand the context before touching code. Applies when the user
  reports an error, a bug, or unexpected behavior.
allowed-tools: Read Grep Glob Bash(graphify *) Bash(pnpm *) Bash(curl *) Edit
---

# Investigate and Fix a Bug

## Investigation protocol

### 1. Understand the problem
- Read the error/logs the user provides
- Identify: backend, frontend, or both?

### 2. Query the graph FIRST
```bash
graphify query "<module or concept related to the error>"
graphify path "<file A>" "<file B>"   # if you suspect a relationship
graphify explain "<concept>"          # if you need broader context
```

### 3. Read the relevant code
- Only the files the graph identifies
- Follow the full flow: controller → service → entity (backend) or page → hook → service (frontend)

### 4. Identify the root cause
- Don't guess. Understand WHY it fails
- Check: is it a bad import? A missing tenant scope? A wrong type? A badly declared route?

### 5. Apply the minimal fix
- Change only what is necessary
- Don't refactor code that isn't broken
- Don't add features along the way

### 6. Verify
- `pnpm --filter @crm/api build` if you touched the backend
- `pnpm --filter @crm/web typecheck` and `pnpm --filter @crm/web lint` if you touched the frontend
- `graphify update .` to update the graph

### 7. Explain
- What caused the error (root cause)
- What was changed (fix applied)
- Why it works now

$ARGUMENTS
