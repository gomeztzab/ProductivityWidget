# Focus Pro - contexto y especificacion base

## Objetivo
Definir de forma clara y consistente el modelo comercial, el alcance de Free vs Pro, la politica de licencias y la arquitectura recomendada para integrar activacion de Focus Pro en la app.

## Producto
- Nombre del plan: Focus Pro
- Precio: $5.99 USD
- Tipo de compra: pago unico
- Duracion: acceso de por vida
- Canal principal de venta: Gumroad
- Tipo de licencia recomendado: Gumroad license key validada por backend

## Mensajes comerciales
### Mensaje de compra
🚀 Desbloquea tu maximo enfoque
Accede a todas las funciones PRO y elimina distracciones

Pago unico - acceso de por vida

### Mensaje de activacion exitosa
✅ PRO activado correctamente
Disfruta todas las funciones sin limites 🚀

### Mensaje de licencia invalida
❌ Codigo invalido
Verifica tu licencia o comprala para desbloquear PRO

## Modelo Free vs Pro

## Plan Free
Incluye unicamente estas funciones:
- Modo completo
- Modo compacto
- Modo mini
- Pomodoro basico
- To-do
- Stats
- Clima
- Musica
- Idioma
- Ajuste de tiempos Pomodoro
- Recordatorios por notificacion
- Modo estricto basico: bloqueo de salida

## Plan Pro
Incluye estas funciones premium:
- Modos de ventana avanzados
- Modo barra
- Modo colapsado
- Recordatorios por sonido
- Control de intensidad del sonido
- Personalizacion completa de UI
- Acceso completo a colores de acento
- Acceso completo a colores de texto
- Acceso completo a temas del dashboard
- Acceso al dashboard con tema personalizado
- Acceso completo a tipografias
- Modo estricto avanzado
- Pantalla tipo lock
- Bloqueo de interaccion del sistema
- Bloqueo de sitios web

## Normalizacion de decisiones
Para mantener consistencia, se toma como definicion final:
- Full, compact y mini son Free
- Bar y collapsed son Pro
- Ajuste de tiempos Pomodoro es Free
- Notificaciones de Pomodoro son Free
- Sonido e intensidad del sonido son Pro
- En strict mode, solo exit lock es Free
- Screen lock, interaction lock y website lock son Pro
- Las opciones Pro deben mostrarse en la UI como opciones visibles bloqueadas

## Muestras disponibles en Free
El plan Free debe ofrecer muestras visibles para que el usuario pruebe el producto antes de comprar.

### Colores de acento - 4 muestras Free
- Azul
- Verde
- Negro
- Blanco

### Colores de texto - 4 muestras Free
- Blanco
- Azul claro
- Negro
- Plata

### Temas Free sugeridos
- Glass
- Light

### Tipografias Free sugeridas
- Inter
- Nunito

## UI y experiencia de producto

## Reglas de presentacion de opciones Pro
- Las opciones Pro no se ocultan
- Las opciones Pro se muestran bloqueadas
- Cada opcion Pro debe tener badge o etiqueta PRO
- Al intentar usar una opcion Pro, la app debe mostrar CTA de compra o activacion
- El panel de Settings debe incluir una seccion especifica llamada Licencia o Focus Pro

## Contenido recomendado del panel Licencia
- Estado actual: Free o Pro activado
- Input para pegar licencia
- Boton Activar
- Boton Comprar Pro
- Mensaje de estado de activacion
- Resumen de beneficios Pro
- Texto de ayuda para soporte manual

## Politica de licencias
- Maximo de dispositivos por codigo: 2
- La licencia se considera por maquina, no por usuario ni por instalacion temporal
- Si se supera el limite de 2 dispositivos, la activacion extra se bloquea
- No se permitira liberar dispositivos desde la app en la V1
- Soporte manual permitido para casos de recuperacion
- Reembolso: revocacion automatica en backend

## Nota operativa importante
Si no existe revalidacion periodica desde la app, una revocacion por reembolso solo se reflejara de inmediato en backend, pero en la app se aplicara en la siguiente validacion online que ocurra. Esto debe asumirse como limitacion de la V1.

## Politica de conectividad
- La activacion inicial requiere internet obligatoriamente
- Despues de activada, la app puede usarse offline
- La validacion fuerte ocurre al activar
- No se hara revalidacion periodica continua en la V1

## Recomendacion tecnica para que el modelo siga siendo confiable
Aunque la validacion principal sea solo al activar, el backend debe seguir siendo la autoridad final del estado de la licencia. La app solo almacena el resultado local de activacion, no la verdad del sistema.

## Decision de backend
La arquitectura recomendada para esta app es:
- Supabase como backend principal
- Supabase Postgres para base de datos
- Supabase Edge Functions para endpoints de activacion
- Gumroad como origen comercial principal
- Gumroad webhooks para reflejar compras y reembolsos en backend

## Por que esta es la opcion mas conveniente
- Mantiene la arquitectura simple
- Evita levantar un servidor Node separado en la V1
- Centraliza licencias, activaciones y revocaciones
- Escala bien si luego agregas mas planes o mas canales de venta
- Encaja bien con una app Electron que necesita validar licencias externamente

## Flujo recomendado de activacion
1. El usuario compra Focus Pro en Gumroad
2. Gumroad entrega una license key
3. El usuario abre la app y va a la seccion Licencia
4. El usuario pega la key
5. La app envia la key y el device id al backend
6. El backend valida la licencia
7. El backend verifica si aun hay cupo dentro del limite de 2 maquinas
8. Si es valida, el backend registra la activacion
9. La app guarda el estado local Pro y los features habilitados
10. Si no es valida o supera el limite, se bloquea la activacion

## Decision sobre el tipo de codigo
Se recomienda usar Gumroad license key como codigo visible al usuario, pero validarla siempre contra el backend. Esto da una experiencia simple para el comprador y mantiene confianza en la capa servidor.

## Features por modulo
La app no debe depender de un unico booleano isPro. Debe guardar tambien un mapa de features por modulo.

## Estructura recomendada de features
- features.windowModeBar
- features.windowModeCollapsed
- features.pomodoroSound
- features.pomodoroSoundIntensity
- features.customAccentColors
- features.customTextColors
- features.customThemes
- features.customFonts
- features.customBackground
- features.strictScreenLock
- features.strictInteractionLock
- features.strictWebsiteBlock

## Beneficios de este enfoque
- Permite crecer sin romper la arquitectura
- Facilita futuras promociones o bundles
- Hace mas claro el gating en UI y logica
- Evita acoplar toda la monetizacion a un unico flag global

## Politica de soporte
- Debe existir soporte manual por email
- Debe poder revisarse una licencia manualmente en backend
- Debe poder resolverse manualmente un caso de cambio de maquina si el usuario legitimo agota sus 2 activaciones

## Integracion con la app actual
La implementacion debe vivir principalmente en:
- main.js para la logica segura de licencia y persistencia principal
- settings.html para la UI del panel Licencia / Focus Pro
- settings.js para la interaccion de activacion
- renderer.js para bloquear o habilitar funciones por modulo

## Criterios de arquitectura
- La logica de validacion no debe vivir solo en renderer
- La app no debe confiar en localStorage como autoridad final
- La licencia debe persistirse de forma segura en el proceso principal
- El backend debe ser la autoridad de compra, activacion y revocacion
- Las funciones premium deben controlarse por features, no solo por un estado global

## Decision final consolidada
Focus Pro sera un plan de pago unico de por vida, vendido principalmente en Gumroad, con activacion por machine-based license, limite de 2 dispositivos por codigo, validacion inicial online, uso posterior offline, backend en Supabase con Edge Functions y funciones premium visibles como opciones bloqueadas dentro de la UI.
