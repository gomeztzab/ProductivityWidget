# Focus Pro — Guia de uso

## Que es Focus Pro

Focus Pro es un widget de escritorio para Windows que combina temporizador Pomodoro, lista de tareas, estadisticas de productividad y herramientas de concentracion como bloqueo de sitios web en una sola interfaz compacta.

## Requisitos del sistema

- Windows 10 o superior (64 bits)
- Conexion a internet para la activacion inicial de la licencia
- Permisos de administrador para la funcion de bloqueo de sitios web

## Instalacion

1. Descarga el instalador desde Gumroad despues de tu compra.
2. Ejecuta el archivo `.exe` y sigue las instrucciones del instalador.
3. Al finalizar, Focus Pro aparecera en tu escritorio.

## Activacion de licencia

1. Abre Focus Pro y ve a **Settings** (icono de engranaje).
2. Baja hasta la seccion **Licencia / Focus Pro**.
3. Pega tu codigo de licencia de Gumroad en el campo de texto.
4. Presiona **Activar Pro**.
5. Si el codigo es valido, veras el mensaje "PRO activado correctamente" y todas las funciones premium se desbloquean.

La activacion requiere internet. Despues de activar, puedes usar la app sin conexion.

Cada licencia permite **1 dispositivo**. Si cambias de maquina, contacta soporte para liberar tu activacion anterior.

## Modos de ventana

| Modo | Plan | Descripcion |
|---|---|---|
| Completo | Free | Dashboard con todas las secciones visibles |
| Compacto | Free | Vista reducida con Pomodoro y tareas |
| Mini | Free | Solo el temporizador Pomodoro |
| Barra | Pro | Barra delgada siempre visible en pantalla |
| Colapsado | Pro | Icono minimo siempre visible |

## Funciones de concentracion (Strict Mode)

### Exit Lock (Free)
Impide cerrar la ventana mientras el Pomodoro esta activo. Puedes cancelar el bloqueo deteniendo el temporizador.

### Screen Lock (Pro)
Muestra una pantalla completa que cubre el escritorio para evitar distracciones visuales. Se desactiva al terminar el bloque de trabajo o descanso.

### Interaction Lock (Pro)
Crea una capa sobre todos los monitores que bloquea la interaccion con otras aplicaciones. Solo el widget queda accesible. Se desactiva al terminar el bloque actual.

### Website Blocker (Pro)
Bloquea sitios web a nivel del sistema operativo modificando el archivo `hosts` de Windows.

**Importante sobre el Website Blocker:**

- Requiere que Focus Pro se ejecute con **permisos de administrador** para poder modificar el archivo hosts.
- Los sitios bloqueados se restauran automaticamente cuando termina la sesion de Pomodoro o cuando cierras la app.
- La app crea un respaldo del archivo hosts antes de modificarlo.
- Si la app se cierra inesperadamente, los sitios podrian quedarse bloqueados. Consulta la seccion de recuperacion mas abajo.

## Recuperacion manual del archivo hosts

Si Focus Pro se cerro de forma inesperada y los sitios web siguen bloqueados:

### Opcion 1 — Reabrir Focus Pro
Simplemente abre Focus Pro de nuevo. Al iniciar, la app detecta si hay bloqueos activos y los limpia automaticamente.

### Opcion 2 — Editar el archivo hosts manualmente
1. Abre el **Bloc de notas** como administrador (clic derecho > "Ejecutar como administrador").
2. Abre el archivo `C:\Windows\System32\drivers\etc\hosts`.
3. Busca lineas que contengan los dominios que bloqueaste (por ejemplo `127.0.0.1 youtube.com`).
4. Elimina esas lineas.
5. Guarda el archivo.

### Opcion 3 — Restaurar desde el respaldo
Focus Pro guarda un respaldo del hosts original en la carpeta de datos de la app:
```
%APPDATA%\Focus Pro\hosts.strict-mode.backup
```
Puedes copiar ese archivo sobre `C:\Windows\System32\drivers\etc\hosts` para restaurar el estado original.

## Combinaciones de teclas

- **Ctrl + Shift + S** — Abrir Settings
- **Ctrl + Shift + M** — Cambiar modo de ventana

## Datos almacenados localmente

Focus Pro guarda tus configuraciones y estadisticas en:
```
%APPDATA%\Focus Pro\
```

Esto incluye: configuracion del temporizador, historial de sesiones, tareas, preferencias de tema y estado de licencia.

## Soporte

Si tienes problemas con la app, tu licencia o necesitas un reembolso, consulta el documento [SUPPORT.md](SUPPORT.md) o contacta por correo.
