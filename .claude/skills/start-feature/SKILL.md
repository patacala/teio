# Start Feature Skill

## When to use
When the user asks to implement a feature, a fix, or any new change.

## Process

### 1. Check the available skills
```bash
find .claude/skills -name "SKILL.md" -not -path "*/start-feature/*"
```

### 2. Identify the right skill
Based on the type of work:
- **new-page** → New page/route in the frontend
- **new-endpoint** → New endpoint in the API
- **new-module** → New module/service in the backend
- **frontend** → Frontend-only changes (components, UI, etc.)
- **backend** → Backend-only changes (services, entities, etc.)
- **fullstack** → Changes that touch both frontend and backend
- **fix** → Fix a bug or error
- **review** → Review code for quality/security
- **migrate** → Data or schema migration
- **deploy-check** → Verify a deployment

### 3. Read and apply the skill
If a skill applies, READ IT with the Read tool BEFORE you start coding.

### 4. If no skill applies
Continue without a skill, but use graphify for orientation.

## Important
- DO NOT tell the user that you are checking skills
- Only read a skill if it applies directly
- Skills contain the project's conventions and patterns
