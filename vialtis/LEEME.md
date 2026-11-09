# Plataforma Vialtis

Pantallas de salidas para terminales de autobuses, con voceo automático por texto a voz, panel de taquilla y varias empresas separadas en una misma plataforma.

## Qué hace
- **Cualquier empresa crea su cuenta** (con correo verificado) y queda con su propio espacio: sus rutas, salidas, voces, pantallas y equipo. Nadie ve ni toca los datos de otra empresa.
- **Panel** con cinco pestañas: Salidas (lista que se edita en la misma fila), Rutas, Voz, Pantalla y Ajustes.
- **Roles:** *administrador* (configura todo) y *taquillero* (solo opera las salidas y los avisos). Se agregan con un **código de invitación**.
- **TV:** tabla de salidas con escalas destacadas, tamaño ajustable, deslizamiento suave, voceos en voz alta, música de fondo y pantalla de espera. También **TV de andén** y **TV nueva** (se vincula con un código de 6 números).
- **Dueño de la plataforma:** ve todas las empresas, cambia su plan o las suspende.

## Primeros pasos
1. Lee `docs/INSTALAR.md` (unos 25 minutos, todo desde el navegador).
2. Prueba sin instalar nada: abre `index.html?demo=1` (modo demostración con datos de ejemplo; aplica las mismas reglas de seguridad).

## Archivos
| Archivo | Para qué sirve |
|---|---|
| `index.html`, `styles.css` | Pantallas |
| `config.js` | **Lo único que editas:** datos de tu Firebase y tu correo de dueño |
| `core.js`, `auth.js`, `panel.js`, `tv.js`, `voz.js` | Funcionamiento |
| `reglas-firebase.json` | Reglas de seguridad (se pegan en Firebase) |
| `demo.js`, `rules-eval.js` | Modo demostración y simulador de reglas |
| `musica/` | Música de fondo (3 canciones incluidas) |
| `sw.js`, `manifest.json`, iconos | Instalación como app y arranque sin internet |
| `pruebas/`, `package.json`, `firebase.json` | Pruebas de las reglas de seguridad (simulador y emulador oficial) |
| `qrcode.js` | Genera el código QR de la TV nueva sin servicios externos (licencia MIT) |
| `docs/` | Guías |

## Guías
`docs/INSTALAR.md` · `docs/USO.md` · `docs/VOCES.md` · `docs/SEGURIDAD.md` · `docs/PENDIENTES.md`
