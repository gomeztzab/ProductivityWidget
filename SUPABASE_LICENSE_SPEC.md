# Focus Pro - Supabase y Licencias

## Objetivo
Traducir el contexto de producto definido en [FOCUS_PRO_CONTEXT.md](m:/Igniter/Documents/Proyectos%20Personales/Widgets/ProductivityWidget/FOCUS_PRO_CONTEXT.md) a una especificacion tecnica lista para implementar con Supabase.

## Stack recomendado
- Base de datos: Supabase Postgres
- Backend: Supabase Edge Functions
- Venta principal: Gumroad
- Webhooks: Gumroad -> Supabase Edge Function
- App: Electron
- Persistencia local en app: electron-store

## Principios de arquitectura
- Supabase es la autoridad final de licencias y activaciones
- La app solo guarda el estado local de activacion para uso offline
- La validacion inicial requiere internet
- No se permite liberar dispositivos desde la app en la V1
- Las licencias se asignan por maquina
- El limite maximo es 1 maquina por licencia
- Los reembolsos revocan la licencia automaticamente
- El gating de funciones se controla por modulo, no solo con un booleano global

## Modelo de datos

## Tabla: plans
Define los planes comercialmente disponibles.

Campos:
- id: uuid primary key
- code: text unique not null
- name: text not null
- price_usd: numeric(10,2) not null
- billing_type: text not null
- max_devices: integer not null
- is_active: boolean not null default true
- created_at: timestamptz not null default now()
- updated_at: timestamptz not null default now()

Valores iniciales recomendados:
- code: focus_pro
- name: Focus Pro
- price_usd: 6.99
- billing_type: lifetime
- max_devices: 1

## Tabla: license_statuses
Catalogo de estados de licencia para evitar valores libres.

Campos:
- code: text primary key
- description: text not null

Valores iniciales:
- active
- refunded
- revoked
- disabled

## Tabla: licenses
Representa una licencia vendida y validable.

Campos:
- id: uuid primary key default gen_random_uuid()
- plan_id: uuid not null references plans(id)
- gumroad_sale_id: text unique
- gumroad_product_id: text
- gumroad_license_key: text unique not null
- buyer_email: text
- buyer_name: text
- source: text not null default 'gumroad'
- status: text not null references license_statuses(code)
- max_devices: integer not null
- metadata: jsonb not null default '{}'::jsonb
- created_at: timestamptz not null default now()
- updated_at: timestamptz not null default now()

Notas:
- `gumroad_license_key` es el codigo que pega el usuario en la app
- `max_devices` se copia del plan para congelar la politica al momento de la venta
- `status` controla si puede activarse o no

## Tabla: devices
Registro de maquinas conocidas por el sistema.

Campos:
- id: uuid primary key default gen_random_uuid()
- device_fingerprint: text unique not null
- device_name: text
- os_name: text
- os_version: text
- app_version: text
- first_seen_at: timestamptz not null default now()
- last_seen_at: timestamptz not null default now()
- metadata: jsonb not null default '{}'::jsonb

Notas:
- `device_fingerprint` debe generarse en la app y ser estable por maquina
- No debe depender solo de un valor editable por el renderer

## Tabla: license_activations
Relacion entre licencia y maquina.

Campos:
- id: uuid primary key default gen_random_uuid()
- license_id: uuid not null references licenses(id) on delete cascade
- device_id: uuid not null references devices(id) on delete cascade
- activation_status: text not null default 'active'
- activated_at: timestamptz not null default now()
- last_validated_at: timestamptz not null default now()
- revoked_at: timestamptz
- revoke_reason: text
- metadata: jsonb not null default '{}'::jsonb

Restricciones recomendadas:
- unique(license_id, device_id)

Notas:
- Una licencia no debe crear multiples activaciones activas para la misma maquina
- Como en la V1 no habra liberacion manual desde la app, las revocaciones vienen desde backend o soporte

## Tabla: feature_sets
Define el conjunto de features disponible por plan.

Campos:
- id: uuid primary key default gen_random_uuid()
- plan_id: uuid not null references plans(id) on delete cascade
- feature_key: text not null
- enabled: boolean not null default true

Restricciones recomendadas:
- unique(plan_id, feature_key)

Feature keys recomendadas:
- windowModeBar
- windowModeCollapsed
- pomodoroSound
- pomodoroSoundIntensity
- customAccentColors
- customTextColors
- customThemes
- customFonts
- strictScreenLock
- strictInteractionLock
- strictWebsiteBlock

## Tabla: webhook_events
Registro bruto de eventos de Gumroad para trazabilidad.

Campos:
- id: uuid primary key default gen_random_uuid()
- provider: text not null default 'gumroad'
- event_type: text not null
- external_event_id: text
- payload: jsonb not null
- processed: boolean not null default false
- processed_at: timestamptz
- created_at: timestamptz not null default now()

## Tabla: audit_logs
Bitacora tecnica de activaciones, bloqueos y revocaciones.

Campos:
- id: uuid primary key default gen_random_uuid()
- license_id: uuid references licenses(id) on delete set null
- device_id: uuid references devices(id) on delete set null
- event_type: text not null
- message: text
- payload: jsonb not null default '{}'::jsonb
- created_at: timestamptz not null default now()

Eventos sugeridos:
- activation_requested
- activation_success
- activation_denied
- activation_limit_reached
- refund_revoked
- license_status_checked
- webhook_processed

## SQL base recomendado
```sql
create extension if not exists pgcrypto;

create table if not exists plans (
    id uuid primary key default gen_random_uuid(),
    code text unique not null,
    name text not null,
    price_usd numeric(10,2) not null,
    billing_type text not null,
    max_devices integer not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists license_statuses (
    code text primary key,
    description text not null
);

create table if not exists licenses (
    id uuid primary key default gen_random_uuid(),
    plan_id uuid not null references plans(id),
    gumroad_sale_id text unique,
    gumroad_product_id text,
    gumroad_license_key text unique not null,
    buyer_email text,
    buyer_name text,
    source text not null default 'gumroad',
    status text not null references license_statuses(code),
    max_devices integer not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists devices (
    id uuid primary key default gen_random_uuid(),
    device_fingerprint text unique not null,
    device_name text,
    os_name text,
    os_version text,
    app_version text,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb
);

create table if not exists license_activations (
    id uuid primary key default gen_random_uuid(),
    license_id uuid not null references licenses(id) on delete cascade,
    device_id uuid not null references devices(id) on delete cascade,
    activation_status text not null default 'active',
    activated_at timestamptz not null default now(),
    last_validated_at timestamptz not null default now(),
    revoked_at timestamptz,
    revoke_reason text,
    metadata jsonb not null default '{}'::jsonb,
    unique (license_id, device_id)
);

create table if not exists feature_sets (
    id uuid primary key default gen_random_uuid(),
    plan_id uuid not null references plans(id) on delete cascade,
    feature_key text not null,
    enabled boolean not null default true,
    unique (plan_id, feature_key)
);

create table if not exists webhook_events (
    id uuid primary key default gen_random_uuid(),
    provider text not null default 'gumroad',
    event_type text not null,
    external_event_id text,
    payload jsonb not null,
    processed boolean not null default false,
    processed_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists audit_logs (
    id uuid primary key default gen_random_uuid(),
    license_id uuid references licenses(id) on delete set null,
    device_id uuid references devices(id) on delete set null,
    event_type text not null,
    message text,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
```

## Seeds recomendados
```sql
insert into license_statuses (code, description) values
('active', 'License can be activated'),
('refunded', 'License refunded and revoked'),
('revoked', 'License manually revoked'),
('disabled', 'License disabled by admin')
on conflict (code) do nothing;

insert into plans (code, name, price_usd, billing_type, max_devices)
values ('focus_pro', 'Focus Pro', 6.99, 'lifetime', 2)
on conflict (code) do nothing;
```

## Seguridad recomendada
- No exponer escritura directa desde el cliente Electron a tablas de licencias
- Usar Edge Functions con service role key para operaciones sensibles
- Mantener anon key solo para operaciones publicas no sensibles si algun dia hacen falta
- Las tablas `licenses`, `license_activations`, `devices`, `audit_logs` y `webhook_events` no deben ser escritas directamente por el cliente
- El cliente Electron no debe conocer secrets de Gumroad ni service role key

## RLS recomendado
Para la V1:
- Activar RLS en tablas sensibles
- No crear politicas de escritura para el cliente
- Ejecutar operaciones de activacion y revocacion solo desde Edge Functions con service role

## Endpoints recomendados

## 1. POST /activate-license
Activa una licencia en una maquina si cumple las reglas.

Body esperado:
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

Flujo:
1. Buscar licencia por `gumroad_license_key`
2. Verificar que exista
3. Verificar que `status = active`
4. Buscar o crear `device`
5. Revisar si ya existe activacion para esa licencia y esa maquina
6. Si ya existe, devolver activacion exitosa idempotente
7. Contar activaciones activas para esa licencia
8. Si el conteo es mayor o igual a `max_devices` y la maquina no estaba activada, rechazar
9. Crear activacion
10. Devolver payload de licencia y features

Respuesta exitosa sugerida:
```json
{
    "ok": true,
    "plan": {
        "code": "focus_pro",
        "name": "Focus Pro"
    },
    "license": {
        "status": "active",
        "maxDevices": 1
    },
    "activation": {
        "deviceFingerprint": "machine-stable-id",
        "activatedAt": "2026-03-23T18:00:00.000Z"
    },
    "features": {
        "windowModeBar": true,
        "windowModeCollapsed": true,
        "pomodoroSound": true,
        "pomodoroSoundIntensity": true,
        "customAccentColors": true,
        "customTextColors": true,
        "customThemes": true,
        "customFonts": true,
        "strictScreenLock": true,
        "strictInteractionLock": true,
        "strictWebsiteBlock": true
    },
    "message": "PRO activado correctamente"
}
```

Errores esperados:
- licencia inexistente
- licencia reembolsada
- licencia revocada
- limite de dispositivos alcanzado
- request mal formado

Respuesta de limite alcanzado:
```json
{
    "ok": false,
    "code": "DEVICE_LIMIT_REACHED",
    "message": "Esta licencia ya alcanzo el maximo de 1 dispositivo activado."
}
```

## 2. POST /revoke-license
Revoca una licencia completa, pensado para reembolsos, fraude o soporte manual.

Uso recomendado:
- webhook de Gumroad por refund
- accion manual administrativa

Body esperado:
```json
{
    "licenseKey": "ABCD-1234-EFGH-5678",
    "reason": "refund"
}
```

Flujo:
1. Buscar licencia
2. Marcar `status = refunded` o `revoked`
3. Marcar activaciones activas como revocadas
4. Registrar audit log
5. Responder exito

Respuesta exitosa sugerida:
```json
{
    "ok": true,
    "message": "Licencia revocada correctamente"
}
```

## 3. POST /gumroad-webhook
Recibe eventos de Gumroad.

Responsabilidades:
- guardar payload crudo en `webhook_events`
- detectar ventas validas
- crear o actualizar `licenses`
- detectar reembolsos
- llamar la misma logica de revocacion
- dejar audit trail

Eventos de interes:
- sale
- refund
- chargeback o equivalente si Gumroad lo expone

## 4. GET /license-status
Endpoint opcional recomendado para soporte y futura expansion.

Uso:
- ver si una licencia existe
- ver estado actual
- ver cuantas activaciones tiene

En la V1 no es obligatorio para la app si solo validas al activar, pero si es muy util para soporte y panel interno.

## Lógica recomendada en Edge Functions

## activate-license
Responsabilidades internas:
- validar input
- usar service role
- upsert en `devices`
- crear o recuperar activacion idempotente
- obtener feature set del plan
- devolver payload listo para persistir localmente en Electron

## revoke-license
Responsabilidades internas:
- actualizar `licenses.status`
- actualizar `license_activations.activation_status`
- guardar `revoked_at` y `revoke_reason`
- registrar auditoria

## gumroad-webhook
Responsabilidades internas:
- validar firma o autenticidad del webhook segun Gumroad
- guardar evento bruto
- aplicar reglas de negocio

## Diseño del panel Licencia / Focus Pro

## Ubicación
Debe integrarse dentro de [settings.html](m:/Igniter/Documents/Proyectos%20Personales/Widgets/ProductivityWidget/settings.html) como un panel propio, al mismo nivel visual que Idioma, Sistema, Tema o Tipografia.

## Objetivo del panel
- Mostrar el estado actual Free o Pro
- Permitir activacion por codigo
- Comunicar claramente que incluye Focus Pro
- Servir como punto de entrada a compra y soporte

## Estructura visual recomendada

### Panel principal
Bloque visual tipo card con:
- titulo: `Licencia / Focus Pro`
- descripcion corta: `Activa tu licencia para desbloquear funciones avanzadas y eliminar limites de personalizacion y bloqueo.`

### Estado de cuenta
Subbloque superior con:
- badge de estado
- `Free` o `Focus Pro Activo`
- texto auxiliar

Estados sugeridos:
- Free: `Estas usando la version Free.`
- Pro: `Tu licencia Focus Pro esta activa en esta maquina.`
- Error: `No se pudo validar el codigo.`

### Input de activacion
Elementos:
- label: `Codigo de licencia`
- input de texto
- placeholder: `Pega aqui tu codigo de Gumroad`
- boton primario: `Activar Pro`

### Acciones secundarias
Botones o links:
- `Comprar Focus Pro`
- `Necesito ayuda`

Destino recomendado:
- Comprar: URL de Gumroad
- Ayuda: email o pagina de soporte

### Beneficios Pro
Lista visible dentro del panel:
- Modo barra
- Modo colapsado
- Sonidos de Pomodoro
- Intensidad del sonido
- Temas, colores y tipografias premium
- Screen lock
- Interaction lock
- Website blocker

### Estado tecnico opcional
Texto discreto:
- `Licencia valida para 1 dispositivo`
- `Activacion por maquina`
- `Requiere internet solo para la activacion inicial`

## Comportamiento UI recomendado

## Estado Free
- input visible
- boton Activar visible
- boton Comprar visible
- beneficios Pro visibles
- opciones Pro del resto del Settings se ven bloqueadas con badge PRO

## Estado Pro activo
- input puede quedar oculto o deshabilitado
- mostrar badge `PRO activo`
- boton Comprar puede ocultarse
- mostrar resumen de licencia activa

## Estado de error
- mantener input editable
- mostrar mensaje claro debajo del input
- no bloquear el boton Reintentar

## Microcopy recomendado para el panel
- titulo: `Licencia / Focus Pro`
- subtitulo: `Desbloquea todas las funciones avanzadas con un pago unico.`
- helper: `Tu codigo se valida online una sola vez y queda activo en esta maquina.`
- limite: `Cada licencia permite 1 dispositivo.`

## Integración con la app actual

## settings.html
Agregar un panel nuevo con:
- titulo
- descripcion
- badge de estado
- input de licencia
- botones de accion
- lista de beneficios Pro

## settings.js
Agregar:
- lectura del estado de licencia
- handler del boton activar
- llamada IPC al proceso principal
- actualizacion visual del panel
- enlace a Gumroad
- enlace a soporte

## main.js
Agregar IPC seguro:
- activate-license
- get-license-state

Responsabilidad del main:
- construir request hacia Edge Function
- persistir licencia activa en electron-store
- exponer al renderer solo el resultado necesario

## renderer.js
Usar mapa de features para:
- bloquear acciones premium
- mostrar badges PRO
- impedir activar funciones premium desde UI sin licencia

## Persistencia local recomendada en Electron
Guardar con electron-store:
- license.planCode
- license.planName
- license.status
- license.licenseKeyMasked
- license.deviceFingerprint
- license.activatedAt
- license.features

Ejemplo:
```json
{
    "license": {
        "planCode": "focus_pro",
        "planName": "Focus Pro",
        "status": "active",
        "licenseKeyMasked": "ABCD-****-****-5678",
        "deviceFingerprint": "machine-stable-id",
        "activatedAt": "2026-03-23T18:00:00.000Z",
        "features": {
            "windowModeBar": true,
            "windowModeCollapsed": true,
            "pomodoroSound": true,
            "pomodoroSoundIntensity": true,
            "customAccentColors": true,
            "customTextColors": true,
            "customThemes": true,
            "customFonts": true,
            "strictScreenLock": true,
            "strictInteractionLock": true,
            "strictWebsiteBlock": true
        }
    }
}
```

## Reglas finales de negocio
- Free solo incluye exit lock dentro de strict mode
- Las demas opciones de strict mode deben verse como Pro
- Full, compact y mini siguen siendo gratis
- Bar y collapsed son Pro
- Notificaciones son Free
- Sonido e intensidad son Pro
- Personalizacion completa es Pro con muestras Free visibles
- Al intentar activar en una segunda maquina distinta, la activacion debe bloquearse
- No hay liberacion de dispositivos desde la app en la V1
- Los reembolsos deben revocar la licencia en backend

## Orden de implementación recomendado
1. Crear tablas en Supabase
2. Cargar seed de plan y estados
3. Implementar `activate-license` como Edge Function
4. Implementar `revoke-license` como Edge Function
5. Implementar `gumroad-webhook`
6. Agregar IPC en Electron main
7. Agregar panel Licencia / Focus Pro en Settings
8. Integrar gating por feature en renderer
9. Añadir soporte visual de opciones Pro bloqueadas
