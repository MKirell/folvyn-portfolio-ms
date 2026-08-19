export const HONORS = ['pass', 'satisfactory', 'good', 'very-good', 'excellent'] as const

export const LANGUAGE_LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'] as const

export type Honors = (typeof HONORS)[number]

export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number]
