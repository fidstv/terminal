# Instalar la plataforma (todo desde el navegador)

La plataforma vive en la carpeta `vialtis/` de tu repositorio de GitHub y usa **su propio proyecto de Firebase**, separado de cualquier otro sistema.

## 1. Crear el proyecto de Firebase (nuevo)
1. Entra a https://console.firebase.google.com y toca **Agregar proyecto**. Ponle un nombre (por ejemplo `vialtis-plataforma`). Puedes desactivar Google Analytics.
2. **Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar → Guardar.**
3. **Authentication → Configuración → Dominios autorizados → Agregar dominio:** `tu-usuario.github.io` (el de tu GitHub Pages).
4. **Realtime Database → Crear base de datos →** elige la región y **Modo bloqueado**.
5. **Realtime Database → Reglas:** borra lo que hay, pega todo `reglas-firebase.json` y toca **Publicar**.
6. **Configuración del proyecto (engrane) → General → Tus apps → `</>` (Web)** → registra la app. Te muestra un bloque con `apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`.

## 2. Poner tus datos en `config.js`
Abre `config.js` en GitHub (lápiz de editar) y reemplaza los valores `REEMPLAZAR` de `firebase` con los tuyos. Revisa también `plataforma.dueno`: es **tu correo de dueño** (hoy `vialtis@gmail.com`) y debe ser el mismo que aparece en `reglas-firebase.json`. Si lo cambias, cámbialo en los dos lugares (busca ese correo en las reglas) y vuelve a publicar las reglas.
> La `apiKey` de Firebase no es un secreto; la seguridad está en las reglas. Aun así, en Google Cloud puedes restringirla a tu dominio.

## 3. Subir y publicar
1. Sube la carpeta `vialtis/` completa a tu repositorio (no cambia nada de lo que ya tengas en otras carpetas).
2. En el repositorio: **Settings → Pages →** *Deploy from a branch* → rama `main` → carpeta `/ (root)`.
3. La plataforma queda en `https://tu-usuario.github.io/tu-repositorio/vialtis/`.

## 4. Tu cuenta de dueño
1. Abre la dirección y toca **Crear cuenta** con **tu correo de dueño** (`vialtis@gmail.com`). Usa una contraseña larga que no contenga tu correo.
2. Abre el correo de verificación de Firebase (revisa spam) y vuelve a tocar **Ya verifiqué mi correo**.
3. En **Ajustes → Plataforma** verás a todas las empresas, y podrás cambiar su plan o suspenderlas. Para entrar solo escribe `vialtis` en el campo de usuario.

## 5. Prueba rápida (10 minutos)
- Crea una empresa de prueba con otro correo y revisa que no ve la información de la tuya.
- En **Rutas** toca *Cargar ejemplo*; en **Salidas** aparecen las del día.
- Abre `…/vialtis/?vista=nueva` en otra pantalla, escribe el código en **Ajustes → Pantallas** y elige *TV de salidas*.
- En la TV toca **Activar sonido**, cambia un minuto en **Voz** y comprueba que el voceo suena.

## 6. TV
- La TV abre su dirección una sola vez: `…/vialtis/?vista=nueva`. Después se configura sola y recuerda su empresa.
- **El sonido necesita un toque (o OK en el control) la primera vez**; es una regla de los navegadores.
- En Android TV mejora mucho la voz si instalas **Español (México)** en *Ajustes → Salida de texto a voz*.
- La TV se recarga sola cada 6 horas y sigue mostrando el último horario si se cae el internet.

## Volver a una versión anterior
En GitHub: **Commits →** elige el último que funcionaba → **⋯ → Revert** (o descarga esa versión y vuelve a subirla). Para probar antes de publicar, copia la carpeta como `vialtis-prueba/` y úsala con tu propia TV de prueba.
