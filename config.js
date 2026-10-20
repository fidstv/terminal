/* =====================================================================
   CONFIGURACIÓN POR CLIENTE
   Para instalar el sistema en otro cliente se cambia SOLO este archivo
   (y se graban sus audios en Audio/central/ y Audio/of2/).
   Importante: los identificadores de sucursal "central" y "of2" no se
   renombran; lo que se cambia son sus nombres, rutas, horarios y textos.
   ===================================================================== */
window.FIDS_VERSION = '12';   /* súbelo junto con sw.js cada vez que publiques cambios */

window.FIDS_CONFIG = {
  cliente: {
    nombre: 'Transpais',
    tituloPagina: 'Transpais FIDS - Sistema de Información a Pasajeros',
    marca: 'TRANSPAIS®',                       /* texto del logo en el encabezado */
    mensajeSinSalidas: 'No hay salidas programadas por ahora.'
  },
  idioma: {
    bilingue: true        /* true = en TV y pasajero los estados alternan español / inglés */
  },
  urgenteMin: 30,         /* minutos que dura un aviso urgente en pantalla */

  /* ===== TEMAS ===== modos: auto (noche + temporadas), clasico, noche, contraste. Se cambian desde el panel de taquilla. */
  tema: { modoInicial: 'auto', inicioNoche: 22, finNoche: 6 },
  temas: {
    clasico:   {},
    noche:     { '--bg': '#00060f', '--accent': '#047a45', '--ok': '#12b866', '--gold': '#d99a00', '--muted': '#6f9ed6', '--text': '#d7e3f4' },
    contraste: { '--bg': '#000000', '--accent': '#00c853', '--ok': '#00ff88', '--gold': '#ffd600', '--muted': '#ffffff', '--navy': '#001a40', '--text': '#ffffff' }
  },
  /* Temporadas (solo en modo auto). Cambian el color de marca y muestran un saludo en la TV. desde/hasta = MM-DD */
  temporadas: [
    { nombre: 'Día de las Madres', desde: '05-09', hasta: '05-10', icono: '💐', saludo: 'Transpais felicita a todas las mamás en su día',                       vars: { '--accent': '#be185d' } },
    { nombre: 'Fiestas Patrias',   desde: '09-10', hasta: '09-17', icono: '🇲🇽', saludo: '¡Viva México! Transpais les desea felices Fiestas Patrias',            vars: { '--accent': '#006847' } },
    { nombre: 'Día de Muertos',    desde: '10-28', hasta: '11-03', icono: '🌼', saludo: 'Transpais se une a la tradición del Día de Muertos',                    vars: { '--accent': '#c2410c' } },
    { nombre: 'Fiestas decembrinas', desde: '12-15', hasta: '01-06', icono: '🎄', saludo: 'Transpais les desea felices fiestas y un próspero año nuevo',         vars: { '--accent': '#b71c1c' } }
  ],

  /* ===== FRANJA DE LA TV: ruta animada, consejos y saludos de temporada ===== */
  franja: { activa: true, segundos: 12 },
  consejos: [
    { icono: '🧳', es: 'Mantenga su equipaje siempre a la vista.',              en: 'Keep your luggage in sight at all times.' },
    { icono: '🪪', es: 'Tenga a la mano su boleto e identificación.',            en: 'Have your ticket and ID ready.' },
    { icono: '⏰', es: 'Llegue con anticipación al abordaje.',                    en: 'Arrive early for boarding.' },
    { icono: '🔊', es: 'Esté atento al llamado de su autobús.',                   en: 'Listen for your bus announcement.' },
    { icono: '💬', es: 'Pregunte en taquilla por cualquier duda de su viaje.',   en: 'Ask at the ticket counter if you have any questions.' },
    { icono: '🗑️', es: 'Ayúdenos a mantener limpia la terminal.',                 en: 'Help us keep the terminal clean.' }
  ],

  /* Datos del proyecto Firebase del cliente (Configuración del proyecto > Tus apps) */
  firebase: {
    "apiKey": "AIzaSyBCu8E1b_xoHeqpRuchnanao9vfTy84OIQ",
    "databaseURL": "https://transpais-fids-default-rtdb.firebaseio.com",
    "projectId": "transpais-fids",
    "messagingSenderId": "562920108882",
    "appId": "1:562920108882:web:4b61a6cd076c407eb8408b"
  },

  zonaHoraria: 'America/Matamoros',
  inactividadMin: 15,     /* minutos sin usar la taquilla para cerrar sesión */
  reinicioTvMin: 180,     /* las TVs se recargan solas a esa hora del día (180 = 03:00) */

  voz: {
    unidad: true          /* true = después de la ruta dice la unidad con 0.mp3 a 9.mp3; false = solo la ruta */
  },

  /* Usuarios de taquilla: "usuario" es lo que se escribe en el login, "correo" es el de Firebase Authentication */
  accesos: [
    { usuario: 'ofcentral',   correo: 'ofcentral@transpais.com',   sucursal: 'central' },
    { usuario: 'terminalof2', correo: 'terminalof2@transpais.com', sucursal: 'of2' }
  ],

  sucursales: {
    central: {
      titulo: 'CENTRAL DE AUTOBUSES',
      subtitulo: 'MATAMOROS – TERMINAL CENTRAL',
      subtituloPasajero: 'PASAJERO – CENTRAL',
      rotuloAviso: 'CENTRAL DE AUTOBUSES',
      origen: 'Matamoros',
      puntoAbordaje: 'Andén 18',
      puntoAbordajePasajero: 'Andén 18 (Central)',
      /* minutos antes de la salida en que cambia el estado en pantalla */
      estados: { ultima: 3, abordaje: 15, etiquetado: 30 },
      /* avisos de voz automáticos: suenan cuando faltan entre "desde" y "hasta" minutos. modo = nombre del archivo (_etiq, _abord, _ultima) */
      avisos: [
        { id: 'etiq30',  modo: 'etiq',   desde: 30, hasta: 15 },
        { id: 'abord15', modo: 'abord',  desde: 15, hasta: 10 },
        { id: 'abord10', modo: 'abord',  desde: 10, hasta: 3 },
        { id: 'ultima3', modo: 'ultima', desde: 3,  hasta: 0 }
      ],
      /* clave: [hora, destino, escalas] */
      rutas: {
        p01: ["05:00", "San Luis Potosí", "San Fernando, Jiménez, Padilla, Ciudad Victoria, Jaumave, Tula, El Huizache"],
        p02: ["07:20", "Tampico - Madero", "San Fernando, Soto la Marina, Aldama, Manuel Libramiento, Cuauhtémoc, Altamira"],
        p03: ["07:45", "Ciudad Valles", "Ciudad Victoria, Ciudad Mante, Antiguo Morelos"],
        p04: ["09:00", "Ciudad Valles", "San Fernando, Jiménez, Padilla, Ciudad Victoria, Ciudad Mante, Antiguo Morelos"],
        p05: ["09:45", "Tampico - Madero", "San Fernando, Soto la Marina, Aldama, Manuel Libramiento, Altamira"],
        p06: ["10:30", "San Luis Potosí", "San Fernando, Jiménez, Padilla, Ciudad Victoria, Jaumave, Tula"],
        p07: ["11:30", "Ciudad Valles", "San Fernando, Ciudad Victoria, Ciudad Mante, Antiguo Morelos"],
        p08: ["13:15", "San Luis Potosí", "San Fernando, Jiménez, Padilla, Ciudad Victoria, Jaumave, Tula"],
        p09: ["13:30", "Tampico - Madero", "San Fernando, Soto la Marina, Aldama, Manuel Libramiento, Altamira"],
        p13: ["15:00", "Ciudad Valles", "San Fernando, Jiménez, Padilla, Victoria, Mante, Antiguo Morelos"],
        p10: ["18:30", "Tampico", "San Fernando, Jiménez, Padilla, Ciudad Victoria, Estación Manuel, Tampico"],
        p11: ["22:45", "Ciudad Valles", "Ciudad Victoria, Ciudad Mante"],
        p12: ["23:15", "Tampico - Madero", "Estación Manuel, Puente Altamira Las Piñas"]
      }
    },
    of2: {
      titulo: 'TERMINAL PEDRO CÁRDENAS',
      subtitulo: 'MATAMOROS – OFICINA DE PASO',
      subtituloPasajero: 'PASAJERO – PEDRO CÁRDENAS',
      rotuloAviso: 'OFICINA PEDRO CÁRDENAS',
      origen: 'Matamoros',
      puntoAbordaje: 'Oficina Pedro Cárdenas',
      puntoAbordajePasajero: 'Oficina Pedro Cárdenas',
      estados: { ultima: 3, abordaje: 5, etiquetado: 15 },
      avisos: [
        { id: 'etiq15',  modo: 'etiq',   desde: 15, hasta: 10 },
        { id: 'abord5',  modo: 'abord',  desde: 5,  hasta: 3 },
        { id: 'ultima3', modo: 'ultima', desde: 3,  hasta: 0 }
      ],
      rutas: {
        p01: ["05:15", "San Luis Potosí", "San Fernando, Jiménez, Padilla, Ciudad Victoria, Jaumave, Tula, El Huizache"],
        p02: ["07:35", "Tampico - Madero", "San Fernando, Soto la Marina, Aldama, Manuel Libramiento, Cuauhtémoc, Altamira"],
        p03: ["08:00", "Ciudad Valles", "Ciudad Victoria, Ciudad Mante, Antiguo Morelos"],
        p04: ["09:15", "Ciudad Valles", "San Fernando, Jiménez, Padilla, Ciudad Victoria, Ciudad Mante, Antiguo Morelos"],
        p05: ["10:00", "Tampico - Madero", "San Fernando, Soto la Marina, Aldama, Manuel Libramiento, Altamira"],
        p06: ["10:45", "San Luis Potosí", "San Fernando, Jiménez, Padilla, Ciudad Victoria, Jaumave, Tula"],
        p07: ["11:45", "Ciudad Valles", "San Fernando, Ciudad Victoria, Ciudad Mante, Antiguo Morelos"],
        p08: ["13:30", "San Luis Potosí", "San Fernando, Jiménez, Padilla, Ciudad Victoria, Jaumave, Tula"],
        p09: ["13:45", "Tampico - Madero", "San Fernando, Soto la Marina, Aldama, Manuel Libramiento, Altamira"],
        p13: ["15:15", "Ciudad Valles", "San Fernando, Jiménez, Padilla, Victoria, Mante, Antiguo Morelos"],
        p10: ["18:45", "Tampico", "San Fernando, Jiménez, Padilla, Ciudad Victoria, Estación Manuel, Tampico"],
        p11: ["22:45", "Ciudad Valles", "Ciudad Victoria, Ciudad Mante"],
        p12: ["23:15", "Tampico - Madero", "Estación Manuel, Puente Altamira Las Piñas"]
      }
    }
  }
};
