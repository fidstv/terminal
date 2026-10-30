// ============================================================
// VIALTIS V32 - SISTEMA PRINCIPAL Y CONTROL DE VOCEOS DE AUDIOS
// ============================================================

// Configuración por defecto para Oficina 2 (Soriana)
let configAudiosOficina2 = {
  desactivarEtiquetado: false,
  desactivarAbordaje: true, // Desactivado por defecto (la unidad aún no llega)
  desactivarUltimaLlamada: false
};

// Escuchar cambios en Firebase Realtime Database
if (typeof firebase !== 'undefined' && firebase.database) {
  try {
    const dbRefConfigOf2 = firebase.database().ref('configuracion_audios/oficina2');
    dbRefConfigOf2.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        configAudiosOficina2 = { ...configAudiosOficina2, ...data };
        actualizarUIControlsAudio();
      }
    });
  } catch (e) {
    console.warn('[AUDIO CONFIG] Error al conectar con Firebase RTDB:', e);
  }
}

/**
 * Validar si un voceo debe ser emitido según la oficina y configuración activa
 */
function validarVoceoAudio(tipoAudio, oficina) {
  const esOficina2 = (oficina && (oficina.toLowerCase().includes('oficina 2') || oficina.toLowerCase().includes('soriana')));
  
  if (esOficina2) {
    if (tipoAudio === 'ETIQUETADO' && configAudiosOficina2.desactivarEtiquetado) {
      console.log("[AUDIO OF2] Voceo de Etiquetado desactivado.");
      return false;
    }
    if (tipoAudio === 'ABORDAJE' && configAudiosOficina2.desactivarAbordaje) {
      console.log("[AUDIO OF2] Voceo de Abordar Unidad desactivado (Esperando arribo real).");
      return false;
    }
    if (tipoAudio === 'ULTIMA_LLAMADA' && configAudiosOficina2.desactivarUltimaLlamada) {
      console.log("[AUDIO OF2] Voceo de Última Llamada desactivado.");
      return false;
    }
  }
  return true;
}

/**
 * Función global para procesar y reproducir audios
 */
function ejecutarVoceo(tipoAudio, oficina, datosCorrida) {
  if (!validarVoceoAudio(tipoAudio, oficina)) {
    return;
  }
  console.log(`[REPRODUCIENDO VOCEO]: ${tipoAudio} | Destino: ${datosCorrida ? datosCorrida.destino : 'General'}`);
}

/**
 * Actualizar switches en Firebase
 */
function cambiarEstadoAudioOficina2(llave, valorBool) {
  if (typeof firebase !== 'undefined' && firebase.database) {
    firebase.database().ref('configuracion_audios/oficina2').update({
      [llave]: valorBool
    }).then(() => {
      console.log(`[CONFIG OF2] ${llave} -> ${valorBool}`);
    }).catch((err) => {
      console.error("[CONFIG ERROR]", err);
    });
  }
}

/**
 * Refrescar elementos visuales en la interfaz
 */
function actualizarUIControlsAudio() {
  const chkEtiquetado = document.getElementById('switch-etiquetado-of2');
  const chkAbordaje = document.getElementById('switch-abordaje-of2');
  const chkUltima = document.getElementById('switch-ultima-of2');

  if (chkEtiquetado) chkEtiquetado.checked = !configAudiosOficina2.desactivarEtiquetado;
  if (chkAbordaje) chkAbordaje.checked = !configAudiosOficina2.desactivarAbordaje;
  if (chkUltima) chkUltima.checked = !configAudiosOficina2.desactivarUltimaLlamada;
}
