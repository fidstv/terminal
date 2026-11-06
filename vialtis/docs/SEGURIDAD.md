# Seguridad: qué protegen las reglas y qué no

## Qué se comprueba (53 pruebas automáticas en `pruebas/reglas_test.js`)
- Para crear una cuenta, el correo debe estar **verificado**.
- Cada persona solo lee su propio perfil. Nadie lista usuarios ni empresas, salvo el dueño de la plataforma.
- **Una empresa no puede leer ni escribir en otra.** Escribir salidas lo hace cualquier miembro de la empresa; **rutas, voces, pantalla y ajustes**, solo los administradores.
- Las **invitaciones** solo las crean administradores, valen 7 días y solo sirven para la empresa y el rol para los que se hicieron.
- Una empresa nueva siempre empieza en plan **gratis**; solo el dueño sube o baja el plan y suspende.
- Quitar a una persona del equipo le quita el acceso al instante.
- Una TV (sin sesión) solo puede **leer** las salidas y enviar su señal de vida. Solo un miembro de la empresa puede vincular una TV a su empresa.

## Qué NO protegen (importante)
- **Las salidas, los textos y los ajustes de pantalla de cada empresa son públicos** porque las TVs no inician sesión. Es información de salidas de autobuses; no pongas datos privados en ellas.
- **No hay límite de empresas nuevas por persona más allá de una cuenta = una empresa**, ni límite de velocidad. Para evitar abusos, Firebase ofrece *App Check*; conviene activarlo si abres el registro al público.
- El límite de TVs y rutas del plan se muestra en el panel, pero **no se hace cumplir en las reglas**.
- Los correos de verificación y de cambio de contraseña los envía Firebase.

## Cómo se probó
Las reglas se probaron con un **simulador** (`rules-eval.js`), no con el emulador oficial de Firebase, que aquí no estaba disponible. Si al pegar las reglas en Firebase una línea sale marcada en rojo, esa manda: corrige o pide ayuda. Conviene repetir la prueba rápida de `INSTALAR.md` (punto 5) con dos empresas reales.
