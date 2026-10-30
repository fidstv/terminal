# Vialtis v32 - Actualización de Voceos para Oficina 2 (Soriana)

Esta versión incluye la reestructuración completa del sistema de voceos para la **Oficina 2 (Soriana)**.

## Cambios y Mejoras Aplicadas:
1. **Reglas de Firebase (`reglas-firebase.json`):**
   - Se añadió el nodo `configuracion_audios/oficina2` para almacenar en tiempo real la activación/desactivación de audios por tipo.

2. **Lógica de Audios (`app.js`):**
   - Función `procesarVoceoAudio()` integrada.
   - El audio de **Abordar Unidad** queda desactivado por defecto para la Oficina 2 (debido a que la unidad aún no ha llegado a la terminal).
   - Se conservan activos por defecto el audio de **Etiquetado** y **Última Llamada**.

3. **Panel de Switches (`index.html`):**
   - Interfaz con 3 conmutadores independientes (*switches*) para Activar/Desactivar voluntariamente:
     - Voceo de Etiquetado de Equipaje.
     - Voceo de Abordaje.
     - Voceo de Última Llamada.
