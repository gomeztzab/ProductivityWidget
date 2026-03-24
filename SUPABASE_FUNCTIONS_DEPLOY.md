# Supabase Edge Functions - despliegue y variables de entorno

## Objetivo
Dejar documentado el despliegue de estas 3 funciones de Supabase para Focus Pro:
- activate-license
- revoke-license
- gumroad-webhook

Este documento asume que ya existe:
- la migracion SQL aplicada
- el proyecto Supabase vinculado
- las funciones creadas en [supabase/functions/activate-license/index.ts](m:/Igniter/Documents/Proyectos%20Personales/Widgets/ProductivityWidget/supabase/functions/activate-license/index.ts), [supabase/functions/revoke-license/index.ts](m:/Igniter/Documents/Proyectos%20Personales/Widgets/ProductivityWidget/supabase/functions/revoke-license/index.ts) y [supabase/functions/gumroad-webhook/index.ts](m:/Igniter/Documents/Proyectos%20Personales/Widgets/ProductivityWidget/supabase/functions/gumroad-webhook/index.ts)

## Requisitos previos
Necesitas tener instalado:
- Supabase CLI
- acceso al proyecto Supabase
- acceso al proyecto Gumroad

## Proyecto Supabase
Project ref actual segun la configuracion MCP:
- kcysjrjllelgcrwuwwuy

## Variables de entorno necesarias

## Variables base de Supabase
Estas normalmente las usa Supabase internamente en las funciones, pero deben estar disponibles en el entorno de Edge Functions:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

## Variables propias recomendadas

### INTERNAL_REVOKE_TOKEN
Token privado usado por:
- revoke-license para aceptar revocaciones internas
- gumroad-webhook para poder invocar revoke-license de forma segura

Ejemplo:
```text
INTERNAL_REVOKE_TOKEN=pon-aqui-un-token-largo-y-aleatorio
```

### REVOKE_LICENSE_URL
URL publica de la funcion `revoke-license`.

Formato esperado:
```text
https://kcysjrjllelgcrwuwwuy.functions.supabase.co/revoke-license
```

### GUMROAD_WEBHOOK_SECRET
Recomendado para una siguiente mejora de seguridad si luego validas firma o autenticidad del webhook.

Ejemplo:
```text
GUMROAD_WEBHOOK_SECRET=tu-secreto-de-gumroad
```

## Resumen minimo de variables a configurar ahora
Estas 2 son las importantes para que el flujo actual funcione bien entre webhook y revocacion:
- INTERNAL_REVOKE_TOKEN
- REVOKE_LICENSE_URL

## Comandos de vinculacion del proyecto
Ejecuta desde la raiz del proyecto [ProductivityWidget](m:/Igniter/Documents/Proyectos%20Personales/Widgets/ProductivityWidget)

```powershell
supabase login
supabase link --project-ref kcysjrjllelgcrwuwwuy
```

## Como configurar secrets en Supabase
Configura primero el token interno:

```powershell
supabase secrets set INTERNAL_REVOKE_TOKEN="tu-token-interno-seguro"
```

Luego configura la URL de revocacion:

```powershell
supabase secrets set REVOKE_LICENSE_URL="https://kcysjrjllelgcrwuwwuy.functions.supabase.co/revoke-license"
```

Si despues agregas validacion del webhook de Gumroad:

```powershell
supabase secrets set GUMROAD_WEBHOOK_SECRET="tu-secreto-webhook"
```

## Orden correcto de despliegue
Despliega en este orden:

1. activate-license
2. revoke-license
3. gumroad-webhook

La razon es simple:
- gumroad-webhook depende de revoke-license

## Comandos de despliegue

### 1. Deploy activate-license
```powershell
supabase functions deploy activate-license
```

### 2. Deploy revoke-license
```powershell
supabase functions deploy revoke-license
```

### 3. Deploy gumroad-webhook
```powershell
supabase functions deploy gumroad-webhook
```

## URLs esperadas de las funciones
Con tu project ref actual, las URLs deberian quedar asi:

### activate-license
```text
https://kcysjrjllelgcrwuwwuy.functions.supabase.co/activate-license
```

### revoke-license
```text
https://kcysjrjllelgcrwuwwuy.functions.supabase.co/revoke-license
```

### gumroad-webhook
```text
https://kcysjrjllelgcrwuwwuy.functions.supabase.co/gumroad-webhook
```

## Pruebas manuales recomendadas

## 1. Probar activate-license
Body de ejemplo:
```json
{
    "licenseKey": "ABCD-1234-EFGH-5678",
    "deviceFingerprint": "machine-stable-id",
    "deviceName": "DESKTOP-JUAN",
    "osName": "Windows",
    "osVersion": "11",
    "appVersion": "1.0.0"
}
```

Ejemplo con PowerShell:
```powershell
$body = @{
    licenseKey = "ABCD-1234-EFGH-5678"
    deviceFingerprint = "machine-stable-id"
    deviceName = "DESKTOP-JUAN"
    osName = "Windows"
    osVersion = "11"
    appVersion = "1.0.0"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "https://kcysjrjllelgcrwuwwuy.functions.supabase.co/activate-license" `
  -ContentType "application/json" `
  -Body $body
```

## 2. Probar revoke-license
Body de ejemplo:
```json
{
    "licenseKey": "ABCD-1234-EFGH-5678",
    "reason": "manual_test",
    "status": "revoked"
}
```

Ejemplo con PowerShell:
```powershell
$body = @{
    licenseKey = "ABCD-1234-EFGH-5678"
    reason = "manual_test"
    status = "revoked"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "https://kcysjrjllelgcrwuwwuy.functions.supabase.co/revoke-license" `
  -ContentType "application/json" `
  -Headers @{ "x-internal-revoke-token" = "tu-token-interno-seguro" } `
  -Body $body
```

## 3. Probar gumroad-webhook manualmente
Esto depende del formato que Gumroad envie realmente. La base actual soporta:
- json
- x-www-form-urlencoded
- multipart/form-data

Ejemplo simple de refund por JSON:
```powershell
$body = @{
    sale_id = "sale_test_001"
    license_key = "ABCD-1234-EFGH-5678"
    refunded = "true"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "https://kcysjrjllelgcrwuwwuy.functions.supabase.co/gumroad-webhook" `
  -ContentType "application/json" `
  -Body $body
```

## Como conectar Gumroad al webhook
En Gumroad debes configurar como webhook URL:

```text
https://kcysjrjllelgcrwuwwuy.functions.supabase.co/gumroad-webhook
```

## Verificaciones despues del deploy
Despues de desplegar y probar, revisa en Supabase:

### Tabla licenses
Confirma:
- licencias activas
- estado correcto despues de refund o revoke

### Tabla license_activations
Confirma:
- creacion de activaciones
- cambio a revoked cuando se ejecuta revoke-license

### Tabla webhook_events
Confirma:
- llegada de eventos de Gumroad
- campo `processed = true`

### Tabla audit_logs
Confirma eventos como:
- activation_success
- activation_limit_reached
- refund_revoked
- webhook_received
- webhook_processed

## Limitaciones actuales de esta V1
- gumroad-webhook aun no valida firma o autenticidad formal del webhook
- activate-license no usa una transaccion SQL atomica para carreras muy extremas
- la app Electron aun no esta conectada a activate-license
- no existe aun panel de Licencia / Focus Pro dentro de Settings

## Orden recomendado despues del deploy
1. Conectar Electron con activate-license desde [main.js](m:/Igniter/Documents/Proyectos%20Personales/Widgets/ProductivityWidget/main.js)
2. Crear el panel `Licencia / Focus Pro` en [settings.html](m:/Igniter/Documents/Proyectos%20Personales/Widgets/ProductivityWidget/settings.html)
3. Agregar la logica visual y de activacion en [settings.js](m:/Igniter/Documents/Proyectos%20Personales/Widgets/ProductivityWidget/settings.js)
4. Aplicar gating de features en [renderer.js](m:/Igniter/Documents/Proyectos%20Personales/Widgets/ProductivityWidget/renderer.js)

## Si quieres el siguiente paso
El siguiente bloque correcto es conectar la app Electron con activate-license desde [main.js](m:/Igniter/Documents/Proyectos%20Personales/Widgets/ProductivityWidget/main.js), porque ya tendrias:
- SQL
- funciones
- deploy documentado
- flujo de activacion definido