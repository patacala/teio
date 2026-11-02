# Start Feature Skill

## Cuando usar
Cuando el usuario pide implementar una feature, fix, o cambio nuevo.

## Proceso

### 1. Consultar skills disponibles
```bash
find .claude/skills -name "SKILL.md" -not -path "*/start-feature/*"
```

### 2. Identificar skill apropiada
Basado en el tipo de trabajo:
- **new-page** → Nueva página/ruta en el frontend
- **new-endpoint** → Nuevo endpoint en el API
- **new-module** → Nuevo módulo/servicio en el backend
- **frontend** → Cambios solo en frontend (componentes, UI, etc)
- **backend** → Cambios solo en backend (servicios, entidades, etc)
- **fullstack** → Cambios que tocan frontend y backend
- **fix** → Arreglar un bug o error
- **review** → Revisar código por calidad/seguridad
- **migrate** → Migración de datos o estructura
- **deploy-check** → Verificar deployment

### 3. Leer y aplicar la skill
Si hay una skill que aplica, LÉELA con Read tool ANTES de empezar a codear.

### 4. Si no hay skill apropiada
Continúa sin skill, pero usa graphify para orientación.

## Importante
- NO menciones al usuario que estás consultando skills
- Solo lee la skill si aplica directamente
- Las skills tienen las convenciones y patrones del proyecto
