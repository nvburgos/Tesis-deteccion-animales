export type Language = 'es' | 'en'

type SpeciesTranslation = {
  es: string
  en: string
}

const speciesTranslations: Record<string, SpeciesTranslation> = {
  agouti: { es: 'Guatusa', en: 'Agouti' },
  armadillo: { es: 'Armadillo', en: 'Armadillo' },
  bird: { es: 'Ave', en: 'Bird' },
  coati: { es: 'Coati', en: 'Coati' },
  deer: { es: 'Venado', en: 'Deer' },
  dog: { es: 'Perro', en: 'Dog' },
  jaguar: { es: 'Jaguar', en: 'Jaguar' },
  leopard: { es: 'Leopardo', en: 'Leopard' },
  margay: { es: 'Tigrillo', en: 'Margay' },
  ocelot: { es: 'Ocelote', en: 'Ocelot' },
  paca: { es: 'Guanta', en: 'Paca' },
  peccary: { es: 'Pecari', en: 'Peccary' },
  puma: { es: 'Puma', en: 'Puma' },
  'spectacled bear': { es: 'Oso de anteojos', en: 'Spectacled bear' },
  tapir: { es: 'Tapir', en: 'Tapir' },
  tayra: { es: 'Cabeza de mate', en: 'Tayra' },
  'cuniculus paca': { es: 'Guanta', en: 'Lowland paca' },
  'dasyprocta fuliginosa': { es: 'Guatusa negra', en: 'Black agouti' },
  'dasyprocta punctata': { es: 'Guatusa', en: 'Central American agouti' },
  'didelphis marsupialis': { es: 'Zarigueya comun', en: 'Common opossum' },
  'eira barbara': { es: 'Cabeza de mate', en: 'Tayra' },
  'leopardus pardalis': { es: 'Ocelote', en: 'Ocelot' },
  'leopardus wiedii': { es: 'Tigrillo', en: 'Margay' },
  'mazama americana': { es: 'Venado colorado', en: 'Red brocket' },
  'nasua nasua': { es: 'Coati sudamericano', en: 'South American coati' },
  'panthera onca': { es: 'Jaguar', en: 'Jaguar' },
  'pecari tajacu': { es: 'Pecari de collar', en: 'Collared peccary' },
  'puma concolor': { es: 'Puma', en: 'Puma' },
  'tamandua tetradactyla': { es: 'Tamandua del sur', en: 'Southern tamandua' },
  'tapirus pinchaque': { es: 'Tapir andino', en: 'Mountain tapir' },
  'tapirus terrestris': { es: 'Tapir amazonico', en: 'Lowland tapir' },
  'tayassu pecari': { es: 'Pecari de labio blanco', en: 'White-lipped peccary' },
  'tremarctos ornatus': { es: 'Oso de anteojos', en: 'Spectacled bear' },
  'no detection': { es: 'Sin deteccion', en: 'No detection' },
  'sin deteccion': { es: 'Sin deteccion', en: 'No detection' },
  unknown: { es: 'Desconocido', en: 'Unknown' }
}

export const uiText = {
  es: {
    analyzedImages: 'Imagenes analizadas',
    analyzing: 'Procesando...',
    analyzeImage: 'Analizar imagen',
    averageConfidence: 'Confianza promedio',
    cameraLocation: 'Camara o ubicacion',
    confidence: 'Confianza',
    confidenceAvg: 'confianza prom.',
    countDistinctSpecies: 'Conteo de especies distintas',
    dashboard: 'Panel de Control',
    detections: 'detecciones',
    detectedSpecies: 'Especies detectadas',
    detectionResult: 'Resultado de deteccion',
    emptyDetections: 'Aun no hay detecciones. Carga una imagen de camara trampa para iniciar el analisis.',
    emptyResult: 'Selecciona una imagen y presiona Analizar imagen para ver la deteccion.',
    emptySpecies: 'Aun no hay especies identificadas. Analiza imagenes hasta que SpeciesNet clasifique una especie.',
    export: 'Exportar',
    filter: 'Filtrar',
    gallery: 'Galeria',
    history: 'Ver todas las detecciones historicas',
    image: 'Imagen',
    language: 'Idioma',
    lastRecord: 'Ultimo registro',
    mainMetrics: 'Metricas principales',
    noAnalyzedImage: 'Aun no hay una imagen analizada.',
    noImageSelected: 'Ninguna imagen seleccionada',
    noAnimalDetected: 'No se detecto ningun animal en la imagen.',
    photos: 'fotos',
    predictedImage: 'Prediccion generada para la imagen cargada.',
    priority: 'Prioridad',
    recentDetections: 'Detecciones recientes',
    reports: 'Reportes',
    reviews: 'Revisiones',
    researcher: 'Investigador WildlifeAI',
    resultTitle: 'Resultado del analisis',
    reviewPhotos: 'Selecciona una especie para revisar todas sus fotografias registradas.',
    selectedFileAlt: 'Vista previa de camara trampa',
    species: 'Especies',
    speciesDetected: 'Especie detectada',
    totalProcessedSession: 'Total procesado en esta sesion',
    uploadHint: 'Sube una fotografia para que el modelo estime la especie y prioridad.',
    uploadImage: 'Cargar imagen de camara trampa',
    uploadPanel: 'Carga de imagen de camara trampa',
    uploadPrompt: 'Arrastra una imagen aqui',
    uploadSubprompt: 'o haz clic para seleccionar un archivo JPG o PNG',
    wildlifeMonitoring: 'Monitoreo con IA',
    workspaceSubtitle: 'Panel personal de monitoreo WildlifeAI'
  },
  en: {
    analyzedImages: 'Analyzed images',
    analyzing: 'Processing...',
    analyzeImage: 'Analyze image',
    averageConfidence: 'Average confidence',
    cameraLocation: 'Camera or location',
    confidence: 'Confidence',
    confidenceAvg: 'avg. confidence',
    countDistinctSpecies: 'Count of distinct species',
    dashboard: 'Dashboard',
    detections: 'detections',
    detectedSpecies: 'Detected species',
    detectionResult: 'Detection result',
    emptyDetections: 'No detections yet. Upload a camera-trap image to start the analysis.',
    emptyResult: 'Select an image and press Analyze image to see the detection.',
    emptySpecies: 'No identified species yet. Analyze images until SpeciesNet classifies a species.',
    export: 'Export',
    filter: 'Filter',
    gallery: 'Gallery',
    history: 'View all historical detections',
    image: 'Image',
    language: 'Language',
    lastRecord: 'Last record',
    mainMetrics: 'Main metrics',
    noAnalyzedImage: 'No image has been analyzed yet.',
    noImageSelected: 'No image selected',
    noAnimalDetected: 'No animal was detected in the image.',
    photos: 'photos',
    predictedImage: 'Prediction generated for the uploaded image.',
    priority: 'Priority',
    recentDetections: 'Recent detections',
    reports: 'Reports',
    reviews: 'Reviews',
    researcher: 'WildlifeAI Researcher',
    resultTitle: 'Analysis result',
    reviewPhotos: 'Select a species to review all registered photographs.',
    selectedFileAlt: 'Camera-trap preview',
    species: 'Species',
    speciesDetected: 'Detected species',
    totalProcessedSession: 'Total processed in this session',
    uploadHint: 'Upload a photograph so the model can estimate species and priority.',
    uploadImage: 'Upload camera-trap image',
    uploadPanel: 'Camera-trap image upload',
    uploadPrompt: 'Drag an image here',
    uploadSubprompt: 'or click to select a JPG or PNG file',
    wildlifeMonitoring: 'AI monitoring',
    workspaceSubtitle: 'Personal WildlifeAI monitoring panel'
  }
} as const

export type UiText = (typeof uiText)[Language]

function normalizeSpeciesName(species: string) {
  return species
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .trim()
}

export function getSpeciesLabel(species: string | null | undefined, language: Language) {
  if (!species) {
    return speciesTranslations['sin deteccion'][language]
  }

  const normalized = normalizeSpeciesName(species)
  return speciesTranslations[normalized]?.[language] ?? species
}
