'use client'

import { FileArchive, Image } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'

export type UploadTab = 'zip' | 'image'

type UploadTabsProps = {
  activeTab: UploadTab
  imageContent: ReactNode
  onTabChange: (tab: UploadTab) => void
  zipContent: ReactNode
}

const tabs: Array<{ description: string; icon: typeof FileArchive; id: UploadTab; title: string }> = [
  { description: 'Procesamiento de lotes', icon: FileArchive, id: 'zip', title: 'Carga por ZIP' },
  { description: 'Analisis individual', icon: Image, id: 'image', title: 'Carga de imagen' }
]

export default function UploadTabs({ activeTab, imageContent, onTabChange, zipContent }: UploadTabsProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: UploadTab) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onTabChange(tab)
    }
  }

  return (
    <section className="uploadTabsModule" aria-label="Modulo de carga de archivos">
      <div className="uploadTabsList" role="tablist" aria-label="Opciones de carga">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              aria-controls={`upload-panel-${tab.id}`}
              aria-selected={isActive}
              className={isActive ? 'uploadTab active' : 'uploadTab'}
              id={`upload-tab-${tab.id}`}
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, tab.id)}
              role="tab"
              type="button"
            >
              <Icon size={19} />
              <span>
                <strong>{tab.title}</strong>
                <small>{tab.description}</small>
              </span>
            </button>
          )
        })}
      </div>

      <div className="uploadTabsContent">
        <div
          aria-labelledby="upload-tab-zip"
          className={activeTab === 'zip' ? 'uploadTabPanel active' : 'uploadTabPanel'}
          hidden={activeTab !== 'zip'}
          id="upload-panel-zip"
          role="tabpanel"
        >
          {zipContent}
        </div>
        <div
          aria-labelledby="upload-tab-image"
          className={activeTab === 'image' ? 'uploadTabPanel active' : 'uploadTabPanel'}
          hidden={activeTab !== 'image'}
          id="upload-panel-image"
          role="tabpanel"
        >
          {imageContent}
        </div>
      </div>
    </section>
  )
}
