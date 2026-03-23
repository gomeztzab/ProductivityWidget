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

