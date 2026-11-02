---
description: |
  Investiga y corrige un bug o error. Usa el grafo de conocimiento para
  entender el contexto antes de tocar codigo. Aplica cuando el usuario
  reporta un error, bug, o comportamiento inesperado.
allowed-tools: Read Grep Glob Bash(graphify *) Bash(pnpm *) Bash(curl *) Edit
---

# Investigar y Corregir Bug

## Protocolo de investigacion

### 1. Entender el problema
- Lee el error/logs que el usuario proporciona
- Identifica: backend, frontend, o ambos?

### 2. Consultar el grafo PRIMERO
```bash
graphify query "<modulo o concepto relacionado al error>"
graphify path "<archivo A>" "<archivo B>"   # si sospechas relacion
graphify explain "<concepto>"               # si necesitas contexto amplio
```

### 3. Leer codigo relevante
- Solo los archivos que el grafo identifica
- Busca el flujo completo: controller → service → entity (backend) o page → hook → service (frontend)

### 4. Identificar causa raiz
- No adivinar. Entender POR QUE falla
- Verificar: es un import mal hecho? tenant scope faltante? tipo incorrecto? ruta mal declarada?

### 5. Aplicar fix minimo
- Cambia solo lo necesario
- No refactorizar codigo que no esta roto
- No agregar features de paso

### 6. Verificar
- `pnpm --filter @crm/api build` si tocaste backend
- `pnpm --filter @crm/web typecheck` si tocaste frontend
- `graphify update .` para actualizar el grafo

### 7. Explicar
- Que causaba el error (causa raiz)
- Que se cambio (fix aplicado)
- Por que funciona ahora

$ARGUMENTS
