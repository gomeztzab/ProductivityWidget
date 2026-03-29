# Focus Pro — Politica de Privacidad

**Ultima actualizacion:** Marzo 2026

## Resumen

Focus Pro recopila la minima cantidad de datos necesaria para validar tu licencia. No recopilamos datos personales identificables, no rastreamos tu actividad y no vendemos informacion a terceros.

## Datos que se recopilan

### Durante la activacion de licencia
Cuando activas tu licencia, la app envia los siguientes datos al servidor de activacion:

| Dato | Proposito | Detalle |
|---|---|---|
| Codigo de licencia | Validar la compra | El codigo de Gumroad que pegaste |
| Fingerprint del dispositivo | Identificar la maquina | Hash SHA-256 del MachineGuid de Windows. No es reversible y no identifica al usuario |
| Nombre del dispositivo | Registro tecnico | Nombre del equipo en la red local |
| Sistema operativo | Registro tecnico | Nombre y version de Windows |
| Version de la app | Registro tecnico | Version de Focus Pro instalada |

### Que NO se recopila
- Nombre, correo, direccion ni datos personales del usuario
- Historial de navegacion o actividad en el escritorio
- Contenido de tareas, metas o sesiones de Pomodoro
- Capturas de pantalla o grabaciones
- Datos de otras aplicaciones

## Donde se almacenan los datos

### Datos locales
Todas tus configuraciones, estadisticas, tareas e historial se guardan **unicamente en tu maquina**, en la carpeta:
```
%APPDATA%\Focus Pro\
```
Estos datos nunca se envian a ningun servidor.

### Datos en el servidor
Los datos de activacion (fingerprint, estado de licencia, fecha de activacion) se almacenan en **Supabase**, un servicio de base de datos alojado en infraestructura de Amazon Web Services (AWS).

Estos datos se usan exclusivamente para:
- Validar que la licencia es legitima
- Controlar el limite de dispositivos por licencia
- Procesar revocaciones por reembolso

## Modificacion del archivo hosts

La funcion Website Blocker modifica el archivo `C:\Windows\System32\drivers\etc\hosts` de Windows para bloquear sitios web durante sesiones de concentracion. Este archivo solo se modifica localmente en tu maquina. Los dominios bloqueados no se envian a ningun servidor.

La app crea un respaldo del archivo hosts antes de modificarlo y lo restaura automaticamente al terminar la sesion o al cerrar la app.

## Terceros

| Servicio | Uso | Politica |
|---|---|---|
| Supabase | Almacena datos de activacion de licencia | [supabase.com/privacy](https://supabase.com/privacy) |
| Gumroad | Procesa el pago y entrega la licencia | [gumroad.com/privacy](https://gumroad.com/privacy) |

Focus Pro no integra analiticas, telemetria, rastreadores ni SDKs de terceros.

## Retencion de datos

- Los datos de activacion se conservan mientras la licencia este activa.
- Si se procesa un reembolso, la activacion se revoca y el registro se marca como revocado.
- No existe un proceso automatico de eliminacion. Si deseas que se eliminen tus datos del servidor, contacta soporte.

## Tus derechos

Puedes solicitar:
- **Acceso** a los datos almacenados sobre tu licencia
- **Eliminacion** de tus datos del servidor
- **Correccion** de datos incorrectos

Para cualquier solicitud, contacta soporte por correo electronico.

## Contacto

Para consultas sobre privacidad, escribe a soporte. Consulta [SUPPORT.md](SUPPORT.md) para los datos de contacto.

## Cambios en esta politica

Cualquier cambio en esta politica se publicara en este documento con la fecha actualizada. Si los cambios son significativos, se notificara dentro de la app.
