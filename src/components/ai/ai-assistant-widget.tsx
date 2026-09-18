'use client'

import { useEffect } from 'react'

export function AiAssistantWidget() {
  useEffect(() => {
    console.log('[AI Widget Simple] mounted')
  }, [])
  console.log('[AI Widget Simple] rendering')
  return (
    <div
      id="ai-widget-marker"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #10b981, #0d9488)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        fontWeight: 'bold',
        cursor: 'pointer',
        boxShadow: '0 10px 25px rgba(16, 185, 129, 0.4)',
      }}
    >
      AI
    </div>
  )
}
