import type { ValidationMode } from '@skol-arena/shared/types/index'

/**
 * Slices of the season form state each shared section edits. The parent view owns
 * one reactive object holding all of them and passes it to every section through
 * `v-model:state`; the fields' `name`s resolve against the parent's UForm schema.
 */
export interface GeneralInfoState {
  name?: string
  description?: string
  disciplineId?: string
  rulesId?: string | null
  organizationId?: string | null
  minTeamSize?: number
  maxTeamSize?: number
  startDate?: Date
  endDate?: Date
  allowDraw?: boolean
}

export interface ScoreConstraintsState {
  scoreEnabled?: boolean
  minScore?: number | null
  maxScore?: number | null
}

export interface ValidationModeState {
  validationMode?: ValidationMode
  validationTimerHours?: number | null
}
