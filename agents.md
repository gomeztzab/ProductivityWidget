# 🧠 Project AI Instructions (agents.md)

---

## 🎯 Objetivo del proyecto
Desarrollar widgets de escritorio modernos, personalizables y visualmente atractivos (inspirados en Rainmeter), enfocados en:
- Simplicidad
- Rendimiento
- Estética profesional
- Facilidad de uso

El producto final debe ser vendible como recurso digital (ej: Gumroad).

---

## 🧱 Stack actual (base obligatoria)
- HTML5
- CSS3
- JavaScript (Vanilla)

⚠️ Regla: Priorizar Vanilla JS antes de usar frameworks.

---

## 🚀 Uso de frameworks (cuándo SÍ / cuándo NO)

### ❌ NO usar frameworks si:
- El widget es simple (reloj, clima, contador, etc.)
- No hay manejo complejo de estados
- El rendimiento y peso son prioridad

### ✅ SÍ considerar frameworks si:
- Hay múltiples widgets interactuando
- Necesitas estado global
- Vas a escalar a app completa

### Recomendación:
- Usar Web Components antes que React
- Evaluar Electron solo si conviertes a app de escritorio

---

## 🧠 Arquitectura del proyecto

Cada widget debe ser modular:

```
/widget
 ├── index.html
 ├── styles.css
 ├── script.js
```

### Principios:
- Separación de responsabilidades
- Código reutilizable
- Bajo acoplamiento

---
## Prompts
- Si te doy el prompt en ingles mantener comentarios e intrucciones en español
- Tarea: tarea especifica a realizar

## 🎨 Sistema de diseño

### Estilo visual
- Minimalista
- Modo oscuro por defecto
- UI moderna tipo dashboard

### Colores base
- Fondo: #1e293b
- Colores seran utilizandos usando Hexadecimal en CSS
- Texto: blanco / gris claro
- Acentos: dinámicos

### UI
- Bordes redondeados (10px–20px)
- Sombras suaves
- Espaciado consistente

---
## 🎨 Estándares de escritura CSS (FORMATO OBLIGATORIO)

### 📏 Indentación
- Usar indentación consistente de 4 espacios o 1 tab
- Cada propiedad debe ir en una nueva línea
- No escribir propiedades en una sola línea

### Ejemplo correcto:
```css
body {
    font-family: Arial, sans-serif;
    background-color: #1e293b;
    color: #ffffff;
}

## 🎯 Metodología CSS (OBLIGATORIO: BEM)

### Formato:
```
.block {}
.block__element {}
.block--modifier {}
```

### Ejemplo:
```
.widget {}
.widget__header {}
.widget__title {}
.widget__content {}
.widget--large {}
```

### Reglas:
- No usar IDs para estilos
- Evitar estilos inline

- Clases descriptivas
- Mantener jerarquía clara

---

## ⚙️ Reglas de JavaScript

### Estructura:
- Funciones pequeñas
- Evitar lógica mezclada con DOM
- Usar módulos si es necesario

### Buenas prácticas:
- Nombres claros
- Evitar código duplicado
- Manejo de eventos limpio

### Ejemplo:
```
function updateClock() {}
function formatTime() {}
```

---

## 🧩 Componentes estándar

Todo widget debe tener:
- Contenedor principal (.widget)
- Header
- Contenido dinámico
- Opcional: configuración

---

## 🎛️ Personalización (clave del producto)

El usuario debe poder:
- Cambiar colores
- Ajustar tamaño
- Mover widget
- Guardar configuración (localStorage)

---

## 💾 Persistencia

Usar:
- localStorage para configuraciones

Evitar:
- Bases de datos complejas

---

## ⚡ Rendimiento

- Evitar librerías pesadas
- Minimizar DOM updates
- Usar requestAnimationFrame si es necesario

---

## 🧪 Testing básico

- Verificar en diferentes resoluciones
- Probar rendimiento
- Revisar errores en consola

---

## 🚫 Evitar

- Código duplicado
- Funciones gigantes
- Dependencias innecesarias
- UI sobrecargada

---

## 🧠 Reglas para AI (Copilot / asistentes)

- Seguir estrictamente BEM en CSS
- Priorizar claridad sobre complejidad
- Mantener consistencia visual
- Sugerir mejoras UX cuando sea posible
- Optimizar código existente antes de crear nuevo

---

## 🔮 Escalabilidad futura

Posibles mejoras:
- Convertir a app con Electron
- Sistema de plugins
- Marketplace de widgets

---

## 🐍 Uso de Python (evaluación)

### ❌ No necesario actualmente

Este proyecto es frontend.

### ✅ Usar Python solo si:
- Creas backend (API de clima, usuario, etc.)
- Automatización (build tools, scripts)

### Alternativa preferida:
- Node.js si necesitas backend ligero

---

## 🏁 Filosofía del proyecto

- Menos es más
- Diseño vende
- Rendimiento importa
- Modularidad es clave

---

## 📦 Objetivo comercial

El código debe:
- Ser limpio
- Ser fácil de modificar
- Verse profesional

Porque será vendido como producto digital.

---

---

## 🎵 Integración de Control Multimedia Global (Windows)

La aplicación debe ser capaz de mostrar y controlar la reproducción multimedia del sistema (por ejemplo: Spotify, navegador, YouTube) utilizando APIs nativas de Windows.

### 🎯 Objetivo

Implementar un widget multimedia que permita:

- Mostrar título de la canción actual
- Mostrar nombre del artista
- Mostrar progreso de reproducción
- Controles:
  - Play / Pause
  - Siguiente
  - Anterior

---

### ⚙️ Enfoque técnico

- Usar Node.js junto con integración a APIs de Windows (SMTC / Windows Media Session API)
- Implementar desde Electron (proceso principal)

### Reglas importantes:

- ❌ No usar scraping de navegador
- ❌ No inspeccionar procesos del sistema manualmente
- ❌ No depender únicamente de APIs externas (ej: Spotify)

- ✅ Priorizar integración nativa del sistema operativo
- ✅ Usar librerías Node compatibles con Windows Media APIs (WinRT / SMTC)

---

### 🧱 Arquitectura

- **Main process (Electron):**
  - Maneja la conexión con el sistema multimedia de Windows
  - Escucha cambios en reproducción

- **Renderer process:**
  - Recibe datos mediante IPC
  - Actualiza la UI del widget multimedia

---

### 🔌 Comunicación IPC

Eventos:

- main → renderer:
  - `media:update` → { title, artist, duration, position, isPlaying }

- renderer → main:
  - `media:play-pause`
  - `media:next`
  - `media:previous`

---

### 🎨 UX del widget

El widget multimedia debe ser:

- Compacto
- Minimalista
- Visualmente consistente con el resto del sistema

Debe incluir:

- Título
- Artista
- Barra de progreso
- Botones de control

---

### ⚡ Comportamiento

- Actualización en tiempo casi real
- Detectar cambios automáticamente:
  - Nueva canción
  - Pausa / reproducción
  - Avance del tiempo

---

### ⭐ Mejoras futuras

- Mostrar portada del álbum
- Animaciones suaves en la barra de progreso
- Fallback a Spotify API si no hay media del sistema

