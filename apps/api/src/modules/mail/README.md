# Mail API Module

Este módulo proporciona un endpoint público para enviar correos electrónicos con autenticación por API key.

## Endpoint

```
POST /api/v1/mail/send
```

## Autenticación

Requiere API key en el header:

```
x-api-key: crm_live_xxxxxxxxxxxx
```

Para crear un API key, ir a la interfaz web en `/admin/api-keys`.

## Uso

### Opción 1: Enviar con HTML

Envía un email con contenido HTML personalizado.

```json
{
  "to": "usuario@ejemplo.com",
  "subject": "Asunto del correo",
  "html": "<h1>Hola</h1><p>Este es un correo de prueba</p>",
  "from": "remitente@tudominio.com",
  "attachments": [
    {
      "filename": "archivo.pdf",
      "content": "base64-encoded-content",
      "contentType": "application/pdf"
    }
  ]
}
```

**Campos:**
- `to` (requerido): Email del destinatario
- `subject` (requerido): Asunto del correo
- `html` (requerido): Contenido HTML del correo
- `from` (opcional): Email del remitente (si no se provee, usa el configurado por defecto)
- `attachments` (opcional): Array de archivos adjuntos en base64

### Opción 2: Enviar con Template

Envía un email usando un template ID (de Resend, SendGrid, etc).

```json
{
  "to": "usuario@ejemplo.com",
  "templateId": "template_abc123",
  "variables": {
    "nombre": "Juan",
    "empresa": "Mi Empresa",
    "fecha": "2026-06-18"
  },
  "from": "remitente@tudominio.com",
  "attachments": [
    {
      "filename": "documento.pdf",
      "content": "base64-encoded-content",
      "contentType": "application/pdf"
    }
  ]
}
```

**Campos:**
- `to` (requerido): Email del destinatario
- `templateId` (requerido): ID del template en tu proveedor de email (Resend, SendGrid, etc)
- `variables` (opcional): Variables para reemplazar en el template
- `from` (opcional): Email del remitente
- `attachments` (opcional): Array de archivos adjuntos en base64

## Respuesta Exitosa (202 Accepted)

```json
{
  "success": true,
  "message": "Email queued for delivery",
  "organizationId": "org_123"
}
```

## Errores

### 400 Bad Request

```json
{
  "statusCode": 400,
  "message": "Failed to send email: Invalid recipient email",
  "error": "Bad Request"
}
```

### 401 Unauthorized

```json
{
  "statusCode": 401,
  "message": "Authentication required",
  "error": "Unauthorized"
}
```

## Ejemplos de uso

### cURL con HTML

```bash
curl -X POST https://tu-dominio.com/api/v1/mail/send \
  -H "Content-Type: application/json" \
  -H "x-api-key: crm_live_xxxxxxxxxxxx" \
  -d '{
    "to": "cliente@ejemplo.com",
    "subject": "Bienvenido a nuestro servicio",
    "html": "<h1>¡Bienvenido!</h1><p>Gracias por registrarte.</p>"
  }'
```

### cURL con Template

```bash
curl -X POST https://tu-dominio.com/api/v1/mail/send \
  -H "Content-Type: application/json" \
  -H "x-api-key: crm_live_xxxxxxxxxxxx" \
  -d '{
    "to": "cliente@ejemplo.com",
    "templateId": "welcome_template",
    "variables": {
      "nombre": "María",
      "empresa": "Acme Corp"
    }
  }'
```

### JavaScript/TypeScript

```typescript
const sendEmail = async () => {
  const response = await fetch('https://tu-dominio.com/api/v1/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'crm_live_xxxxxxxxxxxx'
    },
    body: JSON.stringify({
      to: 'cliente@ejemplo.com',
      subject: 'Notificación importante',
      html: '<p>Tu pedido ha sido procesado.</p>'
    })
  });

  const result = await response.json();
  console.log(result);
};
```

### Python

```python
import requests

response = requests.post(
    'https://tu-dominio.com/api/v1/mail/send',
    headers={
        'Content-Type': 'application/json',
        'x-api-key': 'crm_live_xxxxxxxxxxxx'
    },
    json={
        'to': 'cliente@ejemplo.com',
        'templateId': 'order_confirmation',
        'variables': {
            'order_id': '12345',
            'total': '$99.99'
        }
    }
)

print(response.json())
```

## Configuración de Proveedores

El sistema soporta tres proveedores de email. Configura las variables de entorno:

### AWS SES
```env
MAIL_PROVIDER=ses
AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
MAIL_FROM=noreply@tudominio.com
```

### Resend
```env
MAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxx
MAIL_FROM=noreply@tudominio.com
```

### SendGrid
```env
MAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxx
MAIL_FROM=noreply@tudominio.com
```

## Notas

- Los emails se envían de forma asíncrona
- El endpoint responde con 202 (Accepted) inmediatamente
- Los errores de envío se registran en los logs del servidor
- Los archivos adjuntos deben estar codificados en base64
- El límite de tamaño depende del proveedor de email configurado
