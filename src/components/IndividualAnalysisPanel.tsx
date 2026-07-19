'use client'

import DetectionResult from './DetectionResult'
import UploadImage from './UploadImage'
import type { DetectionResultData, Language } from './dashboardTypes'
import type { UiText } from '@/lib/i18n'

export default function IndividualAnalysisPanel({
  analysisProgress,
  fileName,
  imagePreview,
  isAnalyzing,
  onAnalyze,
  onFileSelected,
  result,
  text,
  language
}: {
  analysisProgress: number
  fileName: string
  imagePreview: string
  isAnalyzing: boolean
  language: Language
  onAnalyze: () => void
  onFileSelected: (file: File) => void
  result: DetectionResultData | null
  text: UiText
}) {
  return (
    <section className="individualAnalysisPanel inlineIndividualAnalysis" aria-label="Analizar imagen individual">
      <div className="panelHeader individualAnalysisHeader">
        <div>
          <h2>Analizar imagen individual</h2>
          <p>Carga una imagen JPG o PNG para ejecutar un analisis individual.</p>
        </div>
      </div>

      <div className="individualAnalysisGrid">
        <UploadImage
          analysisProgress={analysisProgress}
          fileName={fileName}
          imagePreview={imagePreview}
          isAnalyzing={isAnalyzing}
          text={text}
          onAnalyze={onAnalyze}
          onFileSelected={onFileSelected}
        />
        <DetectionResult language={language} result={result} text={text} />
      </div>
    </section>
  )
}
