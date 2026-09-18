export const dictionaries = {
  es: {
    header: {
      ticker: [
        "TRANSMISIONES EN VIVO",
        "SEÑALES HD SIN CORTES",
        "FÚTBOL LIBRE Y DIRECTO",
        "AGENDA ACTUALIZADA AL INSTANTE",
        "TODOS LOS PARTIDOS EN UN SOLO LUGAR",
      ],
    },
    footer: {
      description: "Tu portal de fútbol en vivo. Gratuito, sin registro y sin vueltas.",
      featuresTitle: "Características",
      features: [
        "— Streaming 100% Gratuito",
        "— No requiere tarjeta ni registro",
        "— Ligas de todo el continente",
        "— Canales en alta definición",
      ],
      legalTitle: "Aviso Legal",
      legalText: "GolTV Libre no aloja ningún contenido en sus servidores. Todo el material es enlazado desde sitios de terceros ajenos a nosotros.",
    },
    home: {
      todayMatches: "PARTIDOS DE HOY",
      noMatches: "NO HAY PARTIDOS PROGRAMADOS PARA HOY.",
      live: "EN VIVO",
      seeAll: "VER TODOS",
      onlyLive: "SOLO EN VIVO",
    },
    match: {
      today: "HOY",
      watchLiveFree: "VER EN VIVO GRATIS",
      watchPreviewFree: "VER PREVIA GRATIS",
      watchMatch: "VER PARTIDO",
    },
    watch: {
      selectChannel: "SELECCIONAR CANAL",
      loadingPlayer: "Cargando reproductor...",
      selectChannelPrompt: "Selecciona un canal para ver el partido",
      notFound: "Partido no encontrado",
      notFoundDesc: "El partido que buscás no existe o ya no está disponible.",
      backHome: "Volver al inicio",
      backMatches: "Volver a partidos",
      previewAvailable: "Previa disponible",
      chooseChannelPreview: "Elegí un canal para ver la previa del partido",
      streamAvailableSoon: "El stream estará disponible cuando empiece el partido",
      noStreams: "No hay streams disponibles",
    },
    player: {
      availableChannels: "CANALES DISPONIBLES",
      noChannels: "No hay canales disponibles para este partido.",
      loadingStream: "Cargando stream...",
      errorLoading: "Error al cargar el stream",
      tryAnotherChannel: "Probá con otro canal o intentá más tarde",
      live: "EN VIVO",
    },
  },
  en: {
    header: {
      ticker: [
        "LIVE BROADCASTS",
        "HD SIGNALS NO BUFFERING",
        "FREE & DIRECT FOOTBALL",
        "INSTANTLY UPDATED SCHEDULE",
        "ALL MATCHES IN ONE PLACE",
      ],
    },
    footer: {
      description: "Your live football portal. Free, no registration, no hassle.",
      featuresTitle: "Features",
      features: [
        "— 100% Free Streaming",
        "— No credit card or registration required",
        "— Leagues from across the continent",
        "— High definition channels",
      ],
      legalTitle: "Legal Disclaimer",
      legalText: "GolTV Libre does not host any content on its servers. All material is linked from third-party sites independent of us.",
    },
    home: {
      todayMatches: "TODAY'S MATCHES",
      noMatches: "NO MATCHES SCHEDULED FOR TODAY.",
      live: "LIVE",
      seeAll: "SEE ALL",
      onlyLive: "ONLY LIVE",
    },
    match: {
      today: "TODAY",
      watchLiveFree: "WATCH LIVE FREE",
      watchPreviewFree: "WATCH PREVIEW FREE",
      watchMatch: "WATCH MATCH",
    },
    watch: {
      selectChannel: "SELECT CHANNEL",
      loadingPlayer: "Loading player...",
      selectChannelPrompt: "Select a channel to watch the match",
      notFound: "Match not found",
      notFoundDesc: "The match you are looking for does not exist or is no longer available.",
      backHome: "Back to home",
      backMatches: "Back to matches",
      previewAvailable: "Preview available",
      chooseChannelPreview: "Choose a channel to watch the match preview",
      streamAvailableSoon: "Stream will be available when the match starts",
      noStreams: "No streams available",
    },
    player: {
      availableChannels: "AVAILABLE CHANNELS",
      noChannels: "No channels available for this match.",
      loadingStream: "Loading stream...",
      errorLoading: "Error loading stream",
      tryAnotherChannel: "Try another channel or try again later",
      live: "LIVE",
    },
  }
};

export type Language = 'es' | 'en';
export type Dictionary = typeof dictionaries['es'];



