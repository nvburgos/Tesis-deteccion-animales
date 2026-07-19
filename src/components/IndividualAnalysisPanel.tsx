'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
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
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="individualAnalysisPanel">
      <button className="individualToggle" onClick={() => setIsOpen((current) => !current)} type="button">
        <span>Analizar imagen individual</span>
        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {isOpen ? (
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
      ) : null}
    </section>
  )
}
