// ==========================================
// CONFIGURACIÓN Y CONTROL DE VOCEOS DE AUDIO
// ==========================================

// Estado local de switches para Oficina 2 (valores por defecto)
let configAudiosOficina2 = {
  desactivarEtiquetado: false,
  desactivarAbordaje: true,      // Desactivado por defecto (Autobús no ha arribado)
  desactivarUltimaLlamada: false
};

// Escuchar cambios de configuración en tiempo real desde Firebase RTDB
const dbRefConfig = firebase.database().ref('configuracion_audios/oficina2');

dbRefConfig.on('value', (snapshot) => {
  const data = snapshot.val();
  if (data) {
    configAudiosOficina2 = { ...configAudiosOficina2, ...data };
    actualizarUIControlsAudio();
  }
});

/**
 * Función principal para gestionar la emisión de audios/voceos según la oficina y el tipo de evento.
 * @param {string} tipoAudio - 'ETIQUETADO', 'ABORDAJE' o 'ULTIMA_LLAMADA'
 * @param {string} oficina - Nombre de la oficina/terminal actual (ej. 'Oficina 2')
 * @param {object} datosCorrida - Información del autobús / corrida
 */
function procesarVoceoAudio(tipoAudio, oficina, datosCorrida) {
  const esOficina2 = (oficina && oficina.toLowerCase().includes('oficina 2')) || 
                     (oficina && oficina.toLowerCase().includes('soriana'));

  if (esOficina2) {
    // Verificación de switches de activación/desactivación para Oficina 2
    if (tipoAudio === 'ETIQUETADO' && configAudiosOficina2.desactivarEtiquetado) {
      console.log("[AUDIO OF2] Voceo de Etiquetado omitido por configuración.");
      return;
    }
    
    if (tipoAudio === 'ABORDAJE' && configAudiosOficina2.desactivarAbordaje) {
      console.log("[AUDIO OF2] Voceo de Abordaje omitido (El autobús aún no ha arribado a Oficina 2).");
      return;
    }
    
    if (tipoAudio === 'ULTIMA_LLAMADA' && configAudiosOficina2.desactivarUltimaLlamada) {
      console.log("[AUDIO OF2] Voceo de Última Llamada omitido por configuración.");
      return;
    }
  }

  // Si no está bloqueado por el switch, se procede a reproducir el audio TTS
  reproducirAudioTTS(tipoAudio, datosCorrida);
}

/**
 * Guardar estado de los switches de audio en Firebase RTDB
 */
function cambiarEstadoAudioOficina2(llave, valorBool) {
  firebase.database().ref('configuracion_audios/oficina2').update({
    [llave]: valorBool
  }).then(() => {
    console.log(`[CONFIG] ${llave} actualizado a: ${valorBool}`);
  }).catch((err) => {
    console.error("[CONFIG ERROR] No se pudo guardar la configuración:", err);
  });
}

/**
 * Sincronizar UI de los switches en el panel de control
 */
function actualizarUIControlsAudio() {
  const chkEtiquetado = document.getElementById('switch-etiquetado-of2');
  const chkAbordaje = document.getElementById('switch-abordaje-of2');
  const chkUltima = document.getElementById('switch-ultima-of2');

  if (chkEtiquetado) chkEtiquetado.checked = !configAudiosOficina2.desactivarEtiquetado;
  if (chkAbordaje) chkAbordaje.checked = !configAudiosOficina2.desactivarAbordaje;
  if (chkUltima) chkUltima.checked = !configAudiosOficina2.desactivarUltimaLlamada;
}
