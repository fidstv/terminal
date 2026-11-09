# Pendientes y siguientes pasos

**Hecho en esta versión:** cuentas libres con verificación y roles, empresas separadas, panel nuevo, voz por texto con minutos y textos editables, música, TV de andén, TV nueva con código, panel del dueño, planes (guardados) y suspensión.

**Hecho en la versión 2:** cierre de huecos en las reglas (TVs, vinculación, invitaciones de un solo uso, empresas suspendidas, protección del fundador, validación de datos), limpieza diaria de salidas viejas, y corrección de salidas de ayer que aparecían como próximas entre las 00:00 y las 06:00.

**Hecho en la versión 3:** pruebas con el emulador oficial de Firebase y en GitHub Actions, Firebase actualizado a la versión 10, QR generado dentro de la app, zona horaria por empresa, botón para olvidar TVs viejas, limpieza de códigos de TV desde el panel del dueño.

**Todavía no está:**
1. **Voz de IA de alta calidad** (voz neuronal). Hoy se usa la voz del navegador.
2. **Cobro:** los planes existen y se guardan, pero no hay pasarela de pagos. Se agrega cuando haya clientes que paguen (necesita un servicio de pagos y un servidor).
3. **Límites del plan hechos cumplir** (TVs y rutas) en las reglas.
4. **App Check / anti-abuso** del registro libre.
5. **Subir música y logos desde el panel con más de 150 KB:** hoy el logo cabe en la base de datos; la música va por archivos en `musica/`.
6. **Itinerarios por fecha** (festivos o temporada): hoy son por día de la semana.
7. **Probar contra Firebase real** y con varias TVs durante unos días. Ya se probó con los emuladores oficiales de Firebase, pero falta el proyecto real.
8. **Canal de prueba automático:** se resuelve a mano copiando la carpeta como `vialtis-prueba/`.
