/* Plataforma Vialtis · configuración.
   1) Crea un proyecto NUEVO en Firebase (ver docs/INSTALAR.md) y pega aquí sus datos en "firebase".
   2) Pon tu correo de dueño de la plataforma en "plataforma.dueno" (debe ser el mismo de reglas-firebase.json). */
window.VIALTIS_VERSION = '2';
window.CFG = {
  firebase: {
    apiKey: 'REEMPLAZAR',
    authDomain: 'REEMPLAZAR.firebaseapp.com',
    databaseURL: 'https://REEMPLAZAR-default-rtdb.firebaseio.com',
    projectId: 'REEMPLAZAR',
    appId: 'REEMPLAZAR'
  },
  plataforma: {
    nombre: 'VIALTIS',
    dueno: 'vialtis@gmail.com',                 /* correo del dueño de la plataforma (ve todas las empresas) */
    alias: { vialtis: 'vialtis@gmail.com' },     /* usuario corto → correo, para escribir "vialtis" al entrar */
    tz: 'America/Matamoros'                      /* zona horaria de las empresas (cambiar si hace falta) */
  },
  planes: {
    gratis: { nombre: 'Gratis', tvs: 2, rutas: 30 },
    pro:    { nombre: 'Pro',    tvs: 10, rutas: 300 }
  },
  /* Valores iniciales de cada empresa nueva (cada empresa los cambia desde su panel) */
  defaults: {
    voceo: { etiq: { on: true, min: 30 }, abord: { on: true, min: 15 }, ultima: { on: true, min: 3 }, retraso: { on: true } },
    textos: {
      etiq:   '{empresa} informa. Pasajeros con destino a {destino}, favor de pasar a documentar y etiquetar su equipaje con el equipajero.',
      abord:  '{empresa} informa. Abordaje de la unidad {unidad} con destino a {destino}, por {anden}.',
      ultima: 'Última llamada. Pasajeros con destino a {destino}, la unidad {unidad} está por salir. Favor de abordar de inmediato por {anden}.',
      retraso:'{empresa} informa. La salida de las {hora} con destino a {destino} se retrasa {minutos} minutos. Gracias por su paciencia.'
    },
    voz: { nombre: '', velocidad: 0.95, volumen: 1 },
    pantalla: { zoom: 'normal', escalas: 'grande', ciudades: '', mensajeVacio: 'No hay salidas programadas por ahora.', ticker: '', velocidad: 40, pausa: 5, anden: 'Andén 1' },
    musica: { on: false, vol: 0.25, desde: '06:00', hasta: '22:00' },
    marca: { nombre: '', color: '#00A859', logo: '' }
  }
};
