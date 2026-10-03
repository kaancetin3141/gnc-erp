// Widget API yanıt tipi — /api/widgets

export interface WeatherDailyItem {
  date: string // YYYY-MM-DD
  icon: string
  min: number
  max: number
}

export interface WeatherData {
  city: string
  temp: number
  condition: string
  icon: string
  humidity: number
  wind: number
  date: string
  high: number
  low: number
  // gerçek API eklentileri
  source: 'open-meteo' | 'offline'
  daily: WeatherDailyItem[] // sonraki 3 gün
}

export interface RecentMessageItem {
  id: string
  customerId: string | null
  customerName: string
  type: string // 'whatsapp' | 'email'
  subject: string
  detail: string | null
  time: string
  userName: string
}

export interface NewsItem {
  id: string
  title: string
  source: string
  time: string
  category: string
  link?: string // RSS'te var, mock'ta yok
}

export interface NewsData {
  items: NewsItem[]
  source: 'rss' | 'mock'
  label: string // 'TRT Haber' | 'Anadolu Ajansı' | 'Özet'
}

export interface CurrencyRate {
  code: 'USD' | 'EUR' | 'GBP'
  rate: number
  prev: number
  change: number
  changePct: number
  up: boolean
}

export interface CurrencyData {
  items: CurrencyRate[]
  source: 'er-api' | 'frankfurter' | 'offline'
  updatedAt: string // er-api: RFC saat · frankfurter: YYYY-MM-DD · offline: ''
}

export interface StreakData {
  days: number
  todayCount: number
  activeDaysCount: number
  total30d: number
}

export interface WidgetsData {
  weather: WeatherData
  recentMessages: RecentMessageItem[]
  news: NewsData
  currency: CurrencyData
  streak: StreakData
}
