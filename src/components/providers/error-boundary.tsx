'use client'

import { Component, ReactNode, ErrorInfo } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RotateCw, Bug } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

// Global error boundary — yakalanmamış render hatalarını gösterir
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('💥 Render hatası:', error, errorInfo)
    this.setState({ errorInfo })
    // TODO: Sentry/LogRocket entegrasyonu için burayı kullan
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    // Sayfa yenileme yerine state temizle
    if (typeof window !== 'undefined') {
      window.location.href = '/'
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-emerald-50 dark:from-slate-950 dark:to-emerald-950 p-6">
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-border overflow-hidden">
            <div className="bg-gradient-to-r from-red-500 to-rose-600 h-1.5" />
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Bir şeyler ters gitti
              </h1>
              <p className="text-sm text-muted-foreground mb-6">
                Beklenmedik bir hata oluştu. Uygulamayı yeniden başlatmayı deneyin veya destek ekibiyle iletişime geçin.
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="text-left bg-slate-50 dark:bg-slate-800 rounded-lg p-3 mb-4 text-xs">
                  <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Bug className="w-3.5 h-3.5" />
                    Hata detayı (geliştirme)
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all text-red-600 dark:text-red-400">
                    {this.state.error.toString()}
                    {this.state.error.stack?.split('\n').slice(0, 5).join('\n')}
                  </pre>
                </details>
              )}

              <div className="flex gap-2">
                <Button onClick={this.handleReset} className="flex-1">
                  <RotateCw className="w-4 h-4 mr-1.5" />
                  Yeniden Başlat
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
