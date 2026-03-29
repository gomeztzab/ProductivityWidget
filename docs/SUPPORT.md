# Focus Pro — Soporte y Reembolsos

## Contacto de soporte

Para cualquier problema con Focus Pro, tu licencia, o solicitudes de privacidad:

**Correo:** *focusprosupport@gmail.com*

Tiempo de respuesta estimado: 24-48 horas habiles.

## Problemas comunes

### "Codigo invalido" al activar
- Verifica que copiaste el codigo completo desde Gumroad (sin espacios al inicio o final).
- Asegurate de tener conexion a internet.
- Si compraste hace poco, espera unos minutos y reintenta.

### "Esta licencia ya alcanzo el limite de 1 dispositivo"
Tu licencia ya esta activada en otra maquina. Si cambiaste de equipo o reinstalaste Windows, contacta soporte para liberar la activacion anterior.

### Los sitios web siguen bloqueados despues de cerrar la app
Esto puede pasar si Focus Pro se cerro de forma inesperada durante una sesion con Website Blocker activo.

**Solucion rapida:** Abre Focus Pro de nuevo. La app detecta bloqueos pendientes y los limpia al iniciar.

**Solucion manual:**
1. Abre el **Bloc de notas como administrador**.
2. Abre el archivo `C:\Windows\System32\drivers\etc\hosts`.
3. Elimina las lineas que contienen los dominios bloqueados (apuntan a `127.0.0.1`).
4. Guarda el archivo.

**Restaurar desde respaldo:**
La app guarda un respaldo del archivo hosts original en:
```
%APPDATA%\Focus Pro\hosts.strict-mode.backup
```
Copia ese archivo sobre `C:\Windows\System32\drivers\etc\hosts` para restaurar el estado original.

### El antivirus bloquea Focus Pro
Algunos antivirus detectan la modificacion del archivo hosts como actividad sospechosa. Esto es un falso positivo. Si ocurre:
1. Agrega Focus Pro a la lista de excepciones de tu antivirus.
2. Permite el acceso al archivo hosts para la app.

### La app no abre o se cierra inmediatamente
1. Verifica que tienes Windows 10 o superior (64 bits).
2. Intenta ejecutar como administrador.
3. Revisa si hay una instancia previa corriendo en el Administrador de tareas.
4. Si el problema persiste, elimina la carpeta de datos y reinstala:
```
%APPDATA%\Focus Pro\
```

### Interaction Lock: no puedo interactuar con nada
Si la app se congelo durante un Interaction Lock:
1. Usa **Ctrl + Alt + Delete** para abrir el Administrador de tareas.
2. Busca "Focus Pro" en la lista de procesos.
3. Finaliza el proceso.

## Politica de reembolsos

### Plazo
Puedes solicitar un reembolso dentro de los **14 dias** posteriores a la compra.

### Como solicitar
1. Envia un correo a soporte indicando tu codigo de licencia (o los ultimos 4 caracteres) y el motivo.
2. El reembolso se procesa a traves de Gumroad.

### Que pasa con la licencia
- Al procesarse el reembolso, la licencia se revoca automaticamente en el servidor.
- La app volvera al plan Free la proxima vez que se conecte a internet.
- Si la app se usa offline, la revocacion se aplicara en la siguiente validacion online.

### Excepciones
No se procesaran reembolsos si:
- Han pasado mas de 14 dias desde la compra.
- Se detecta uso fraudulento o abuso del sistema de licencias.

## Cambio de dispositivo

Si necesitas mover tu licencia a otra maquina:
1. Contacta soporte con tu codigo de licencia.
2. Se liberara la activacion del dispositivo anterior.
3. Podras activar en tu nueva maquina.

Este proceso es manual en la version actual. No es posible liberar dispositivos desde la app.

## Reportar un problema

Al contactar soporte, incluye la siguiente informacion para agilizar la resolucion:

- Version de Focus Pro (visible en Settings)
- Version de Windows
- Descripcion del problema
- Captura de pantalla si aplica
- Ultimos 4 caracteres de tu codigo de licencia
