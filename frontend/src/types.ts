export type Sex = 'M' | 'F'
export type Status = 'normal' | 'caution' | 'danger'
export type Timing = 'morning' | 'lunch' | 'evening'

export interface Lifestyle {
  smoking: boolean
  drinkingPerWeek: number
  exercisePerWeek: number
  lowOutdoor: boolean
}

export interface UserProfile {
  name: string
  birthYear: number
  sex: Sex
  region: string
  lastCheckupYear: number | null
  medications: string[]
  currentSupplements: string[]
  lifestyle: Lifestyle
}

export interface CheckupItem {
  code: string
  name: string
  value: number
  unit: string
}

export interface Checkup {
  id: string
  date: string
  source: 'ocr' | 'pdf' | 'sample' | 'followup'
  label: string
  items: CheckupItem[]
}

export interface InterpretedItem extends CheckupItem {
  status: Status
  rangeText: string
  plain: string
  group: string
}

export interface Recommendation {
  id: string
  name: string
  ingredient: string
  dose: string
  timing: Timing
  reasonCodes: string[]
  reason: string
  claim: string
  skipped?: string
}

export interface Warning {
  level: 'info' | 'caution' | 'danger'
  title: string
  detail: string
}

export interface Supplement {
  id: string
  name: string
  ingredient: string
  dose: string
  timing: Timing
  paused: boolean
  startDate: string
}

// 날짜(YYYY-MM-DD) → 영양제 id → 복용 여부
export type IntakeLog = Record<string, Record<string, boolean>>

export interface CheckupCenter {
  id: string
  name: string
  address: string
  distanceKm: number
  slots: string[]
  tags: string[]
  bookingUrl?: string
}

export interface CheckupTarget {
  year: number
  isTarget: boolean
  done: boolean
  deadline: string
  daysLeft: number
  extras: string[]
}
