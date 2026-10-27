/* =====================================================================
   CONFIGURACIÓN POR CLIENTE
   Para instalar el sistema en otro cliente se cambia SOLO este archivo
   (y se graban sus audios en Audio/central/ y Audio/of2/).
   Importante: los identificadores de sucursal "central" y "of2" no se
   renombran; lo que se cambia son sus nombres, rutas, horarios y textos.
   ===================================================================== */
window.FIDS_VERSION = '29';   /* súbelo junto con sw.js cada vez que publiques cambios */

window.FIDS_CONFIG = {
  cliente: {
    nombre: 'Vialtis',                         /* marca del sistema */
    nombreSaludo: 'Transpais',                 /* cómo se nombra la empresa en los saludos de temporada */
    tituloPagina: 'Vialtis · Control inteligente de terminales',
    marca: 'VIALTIS',                          /* texto del logo en el encabezado y en la pantalla de acceso */
    logo: 'logo.svg',                          /* opcional: ruta de una imagen (ej. 'logo.png') para mostrar en la pantalla de acceso */
    mensajeSinSalidas: 'No hay salidas programadas por ahora.'
  },
  idioma: {
    bilingue: true        /* true = en TV y pasajero los estados alternan español / inglés */
  },
  /* ===== AVISOS AL CELULAR CON LA APP CERRADA (Web Push) =====
     vapidPublic: clave pública (la privada vive solo en el servidor, ver docs/PUSH_AVISOS.md). */
  push: { activa: true, vapidPublic: 'BLO_mth-wztXbFwgT9CXgNLe_Ob4GpcxECLgE2Sv6tgP7-_BGGW1COcmjXIVktc6x1fSrywNJJ_69h1CQFPaLIo', margenCasaMin: 20 },

  /* ===== Plano de andenes en la TV (aviso grande de abordaje) ===== */
  andenes: { activo: true, desde: 15, hasta: 22 },

  /* ===== Llegada estimada en la app de pasajeros (minutos de viaje por destino). SON ESTIMADOS: ajústalos a tus rutas.
     Se busca el nombre dentro del destino de la corrida. Pon llegadaEstimada:false para ocultarla. ===== */
  llegadaEstimada: true,
  duraciones: { 'San Luis Potosí': 660, 'Tampico': 480, 'Madero': 480, 'Ciudad Valles': 540 },

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
    { nombre: 'Día de las Madres', desde: '05-09', hasta: '05-10', icono: '💐', saludo: '{nombre} felicita a todas las mamás en su día',                       vars: { '--accent': '#be185d' } },
    { nombre: 'Fiestas Patrias',   desde: '09-10', hasta: '09-17', icono: '🇲🇽', saludo: '¡Viva México! {nombre} les desea felices Fiestas Patrias',            vars: { '--accent': '#006847' } },
    { nombre: 'Día de Muertos',    desde: '10-28', hasta: '11-03', icono: '🌼', saludo: '{nombre} se une a la tradición del Día de Muertos',                    vars: { '--accent': '#c2410c' } },
    { nombre: 'Fiestas decembrinas', desde: '12-15', hasta: '01-06', icono: '🎄', saludo: '{nombre} les desea felices fiestas y un próspero año nuevo',         vars: { '--accent': '#b71c1c' } }
  ],

  /* ===== FRANJA DE LA TV: ruta animada. Aparece "segundos" segundos cuando una salida entra a etiquetado o abordaje,
     y se repite cada "repetirCadaSeg" segundos mientras siga en ese estado. Solo si las salidas caben sin scroll. ===== */
  franja: { activa: true, segundos: 15, repetirCadaSeg: 60, mapa: true },   /* mapa: true = si hay espacio, se muestra el mapa animado de la ruta */
  /* Comunicados y saludos: corren en la barra de abajo junto al aviso de equipaje (en español). */
  /* Coordenadas [latitud, longitud] para dibujar el mapa animado de la ruta. Los lugares que no estén aquí se
     ubican solos entre sus vecinos de la ruta; agrégalos para que queden en su lugar exacto. */
  lugares: {
    'Matamoros': [25.87, -97.50], 'San Fernando': [24.85, -98.16], 'Jiménez': [24.21, -98.48], 'Padilla': [24.05, -98.91],
    'Ciudad Victoria': [23.74, -99.15], 'Victoria': [23.74, -99.15], 'Jaumave': [23.41, -99.37], 'Tula': [23.00, -99.72],
    'San Luis Potosí': [22.15, -100.98], 'Soto la Marina': [23.77, -98.21], 'Aldama': [22.92, -98.07], 'Altamira': [22.39, -97.93],
    'Tampico': [22.23, -97.86], 'Tampico - Madero': [22.25, -97.85], 'Ciudad Mante': [22.74, -98.97], 'Mante': [22.74, -98.97],
    'Antiguo Morelos': [22.55, -99.09], 'Ciudad Valles': [21.99, -99.01]
  },

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

  audioBase: 'Audio/',    /* carpeta de las voces; null = sin voz, solo tono de aviso */
  marcaInicial: 'transpais',   /* marca con la que arranca si no se eligió otra (ver más abajo, 'marcas') */

  voz: {
    unidad: true,         /* true = después de la ruta dice la unidad con 0.mp3 a 9.mp3; false = solo la ruta */
    urgenteHablado: true, /* la TV lee en voz alta cada aviso urgente nuevo (voz automática del navegador) */
    ingles: true          /* después de la última llamada, la TV lo repite en inglés (voz automática del navegador) */
  },

  /* Usuarios de taquilla: "usuario" es lo que se escribe en el login, "correo" es el de Firebase Authentication */
  accesos: [
    /* marca = identidad fija de la empresa dueña de ese usuario (id de 'marcas').
       elegirMarca: true solo si quieres que ese usuario pueda cambiarla desde Admin; por defecto NO. */
    { usuario: 'ofcentral',   correo: 'ofcentral@transpais.com',   sucursal: 'central', marca: 'transpais', elegirMarca: false },
    { usuario: 'terminalof2', correo: 'terminalof2@transpais.com', sucursal: 'of2',     marca: 'transpais', elegirMarca: false },
    /* Vialtis: un único usuario, el administrador. Se crea en Firebase Authentication con este correo y su contraseña
       (las contraseñas no se guardan en estos archivos). Debe coincidir con reglas-firebase.json. */
    { usuario: 'admin',       correo: 'admin@vialtis.mx',        sucursal: 'vialtis', marca: 'vialtis',   elegirMarca: false },
    /* Dueño: solo ve el panel del dueño (?vista=dueno). No puede editar nada. Crea este usuario en Firebase Authentication. */
    { usuario: 'dueno',       correo: 'dueno@vialtis.mx',        sucursal: 'vialtis', marca: 'vialtis',   elegirMarca: false, dueno: true }
  ],

  /* ===== VISTAS NUEVAS (las de Transpais siguen siendo las de siempre: tvcentral, tvof2, pasajerocentral, pasajeroof2) =====
     tipo: 'tv' o 'pasajero'. suc: sucursal que muestran. app: true = app instalable de pasajeros.
     general: true = vista general, junta las salidas de las sucursales de "sucs" (cada una con el nombre de su empresa). */
  vistas: {
    tvvialtis:       { tipo: 'tv',       suc: 'vialtis', nombre: 'TV Vialtis' },
    pasajerovialtis: { tipo: 'pasajero', suc: 'vialtis', nombre: 'Pasajero Vialtis', app: true, manifest: 'manifest-pasajero.json' },
    tv2026:          { tipo: 'tv', general: true, sucs: ['vialtis'],      /* para sumar otras empresas, agrégalas aquí cuando haya convenio: 'central', 'of2' */
                        nombre: 'TV general', titulo: 'SALIDAS · CENTRAL DE AUTOBUSES MATAMOROS' },
    /* TV pequeña de andén: agrega &n=18 a la dirección (número de andén). Muestra solo la salida que aborda ahí. */
    andenvialtis:    { tipo: 'tv', suc: 'vialtis', anden: true, nombre: 'TV de andén' },
    /* TV nueva: muestra un código de 6 números; se vincula desde el panel (Sistema → Vincular una TV nueva). */
    tvnueva:         { tipo: 'tv', pairing: true, nombre: 'TV sin vincular' },
    /* Panel del dueño: todas las empresas en una pantalla (entra solo la cuenta del dueño). */
    dueno:           { tipo: 'dueno', dueno: true, sucs: ['vialtis', 'central', 'of2'], nombre: 'Panel del dueño' }
  },

  sucursales: {
    central: {
      titulo: 'CENTRAL DE AUTOBUSES',
      subtitulo: 'MATAMOROS – TERMINAL CENTRAL',
      subtituloPasajero: 'PASAJERO – CENTRAL',
      rotuloAviso: 'CENTRAL DE AUTOBUSES',
      empresa: 'Transpais',
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
      empresa: 'Transpais · Pedro Cárdenas',
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
    },
    /* ===== VIALTIS: una sola oficina, Central Matamoros. Datos separados de Transpais (nodo "vialtis" en Firebase).
       Por ahora usa las mismas rutas (se copian más abajo) y los mismos audios (carpeta Audio/central/). ===== */
    vialtis: {
      titulo: 'CENTRAL MATAMOROS',
      subtitulo: 'CENTRAL DE AUTOBUSES · MATAMOROS',
      subtituloPasajero: 'PASAJERO – VIALTIS',
      rotuloAviso: 'VIALTIS · CENTRAL MATAMOROS',
      empresa: 'Vialtis',
      origen: 'Matamoros',
      puntoAbordaje: 'Andén 18',
      puntoAbordajePasajero: 'Andén 18 (Central)',
      audioDir: 'central',          /* carpeta de audios dentro de Audio/ (por ahora los mismos que Transpais Central) */
      estados: { ultima: 3, abordaje: 15, etiquetado: 30 },
      avisos: [
        { id: 'etiq30',  modo: 'etiq',   desde: 30, hasta: 15 },
        { id: 'abord15', modo: 'abord',  desde: 15, hasta: 10 },
        { id: 'abord10', modo: 'abord',  desde: 10, hasta: 3 },
        { id: 'ultima3', modo: 'ultima', desde: 3,  hasta: 0 }
      ]
      /* rutas: se copian de Transpais Central justo después de este bloque; edítalas cuando Vialtis tenga las suyas */
    }
  }
};
window.FIDS_CONFIG.sucursales.vialtis.rutas = JSON.parse(JSON.stringify(window.FIDS_CONFIG.sucursales.central.rutas));

/* =====================================================================
   MARCAS E IDENTIDADES
   Cada marca cambia nombre, logo, textos de las sucursales y paleta de colores.
   Se elige desde el panel de taquilla (🏷️ Marca e identidad) o, solo para una sesión,
   agregando  ?marca=generico  a la dirección. Con  ?demo=1  arranca en la marca genérica.
   Las marcas genéricas NO usan el nombre, el logo ni las voces de Transpais:
   úsalas para mostrar el sistema a otras empresas.
   ===================================================================== */
(function(){
  var C=window.FIDS_CONFIG;
  var GEN={
    cliente:{ nombre:'FIDS Terminal', nombreSaludo:'La terminal', marca:'TERMINAL FIDS', logo:'',
              tituloPagina:'FIDS Terminal - Sistema de Información a Pasajeros' },
    sucursales:{
      central:{ titulo:'TERMINAL CENTRAL', subtitulo:'SALIDAS DE AUTOBUSES', subtituloPasajero:'PASAJERO – TERMINAL CENTRAL',
                rotuloAviso:'TERMINAL CENTRAL', puntoAbordaje:'Andén 18', puntoAbordajePasajero:'Andén 18' },
      of2:    { titulo:'OFICINA DE PASO', subtitulo:'SALIDAS DE AUTOBUSES', subtituloPasajero:'PASAJERO – OFICINA DE PASO',
                rotuloAviso:'OFICINA DE PASO', puntoAbordaje:'Abordaje en oficina', puntoAbordajePasajero:'Abordaje en oficina' },
      vialtis:{ titulo:'TERMINAL CENTRAL', subtitulo:'SALIDAS DE AUTOBUSES', subtituloPasajero:'PASAJERO – TERMINAL CENTRAL',
                rotuloAviso:'TERMINAL CENTRAL', puntoAbordaje:'Andén 18', puntoAbordajePasajero:'Andén 18' }
    },
    audioBase:null,                 /* sin voces grabadas de otra empresa: solo suena el tono de aviso */
    manifest:'manifest-generico.json'
  };
  function gen(nombre,paleta){ var m=JSON.parse(JSON.stringify(GEN)); m.nombre=nombre; m.paleta=paleta; return m; }
  C.marcas={
    transpais:  { nombre:'Vialtis (marca del sistema)' },
    vialtis:    { nombre:'Vialtis', cliente:{ nombreSaludo:'Vialtis' }, audioBase:'Audio/' },   /* audioBase: los audios suenan siempre en Vialtis */
    generico:   gen('Genérico · Azul',     {'--bg':'#020f1f','--navy':'#0a3d73','--accent':'#2563eb','--muted':'#93c5fd'}),
    esmeralda:  gen('Genérico · Esmeralda',{'--bg':'#02150f','--navy':'#0b4a3a','--accent':'#10b981','--muted':'#86efac'}),
    carbon:     gen('Genérico · Carbón',   {'--bg':'#0b0d10','--navy':'#2b3138','--accent':'#94a3b8','--muted':'#cbd5e1'}),
    amatista:   gen('Genérico · Amatista', {'--bg':'#0e0817','--navy':'#3b1f6b','--accent':'#8b5cf6','--muted':'#c4b5fd'}),
    naranja:    gen('Genérico · Naranja',  {'--bg':'#140c03','--navy':'#6b3a07','--accent':'#f97316','--muted':'#fdba74'})
  };
})();
