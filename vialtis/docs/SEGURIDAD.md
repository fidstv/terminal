# Seguridad: qué protegen las reglas y qué no

## Qué se comprueba (77 pruebas automáticas en `pruebas/reglas_test.js`)
- Para crear una cuenta, el correo debe estar **verificado**.
- Cada persona solo lee su propio perfil. Nadie lista usuarios ni empresas, salvo el dueño de la plataforma.
- **Una empresa no puede leer ni escribir en otra.** Escribir salidas lo hace cualquier miembro de la empresa; **rutas, voces, pantalla y ajustes**, solo los administradores.
- Las **invitaciones** solo las crean administradores, valen 7 días, solo sirven para la empresa y el rol para los que se hicieron, y son de **un solo uso** (se borran al usarse). Nadie puede pisar ni borrar la invitación de otra empresa.
- Un administrador invitado **no puede sacar al fundador** de la empresa.
- Una empresa **suspendida** no puede cambiar salidas, avisos, rutas ni ajustes, ni vincular TVs (antes solo se mostraba un aviso).
- Las salidas, rutas, avisos y TVs **se validan**: hora con formato correcto, textos con largo máximo y sin campos de más. El logo debe ser una imagen.
- Una empresa nueva siempre empieza en plan **gratis**; solo el dueño sube o baja el plan y suspende.
- Quitar a una persona del equipo le quita el acceso al instante.
- Una TV (sin sesión) solo puede **leer** las salidas y enviar su señal de vida, y solo en empresas que existen (no puede borrar otras TVs ni meter datos de más). Solo un **administrador** puede vincular una TV, solo con un código que esa TV creó, y **un código se asigna una sola vez**: nadie puede robarse una TV ya vinculada.

## Qué NO protegen (importante)
- **Las salidas, los textos y los ajustes de pantalla de cada empresa son públicos** porque las TVs no inician sesión. Es información de salidas de autobuses; no pongas datos privados en ellas.
- **No hay límite de empresas nuevas por persona más allá de una cuenta = una empresa**, ni límite de velocidad. Para evitar abusos, Firebase ofrece *App Check*; conviene activarlo si abres el registro al público.
- El límite de TVs y rutas del plan se muestra en el panel, pero **no se hace cumplir en las reglas**.
- El código QR de la TV nueva se genera con un servicio externo (api.qrserver.com), que ve la dirección de vinculación. Si no carga, la TV muestra solo el número.
- Los correos de verificación y de cambio de contraseña los envía Firebase.

## Cómo se probó
Las reglas se probaron con un **simulador** (`rules-eval.js`), no con el emulador oficial de Firebase, que aquí no estaba disponible. Si al pegar las reglas en Firebase una línea sale marcada en rojo, esa manda: corrige o pide ayuda. Conviene repetir la prueba rápida de `INSTALAR.md` (punto 5) con dos empresas reales.
