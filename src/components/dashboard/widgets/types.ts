// Widget API yanıt tipi — /api/widgets

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
}

export interface CurrencyRate {
  code: 'USD' | 'EUR' | 'GBP'
  rate: number
  prev: number
  change: number
  changePct: number
  up: boolean
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
  news: NewsItem[]
  currency: CurrencyRate[]
  streak: StreakData
}
