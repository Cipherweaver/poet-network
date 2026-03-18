export type RelationType = 'gift' | 'mention'

export type CanvasPoint = {
  x: number
  y: number
}

export type CanvasSize = {
  width: number
  height: number
}

export type PoetNode = {
  depth: number
  dynasty: string
  fame: number
  id: string
  name: string
  notableWork: string
  position: CanvasPoint
  spotlight: string
  tags: string[]
}

export type PoetRelation = {
  excerpt: string
  fullText?: string
  id: string
  intensity: number
  note: string
  poemTitle: string
  source: string
  target: string
  type: RelationType
  typeLabel: string
}

export type PoetPoemEntry = {
  counterpartId: string
  counterpartName: string
  direction: 'incoming' | 'outgoing'
  excerpt: string
  fullText?: string
  intensity: number
  note: string
  poemTitle: string
  relationId: string
  type: RelationType
  typeLabel: string
}

export type PoetGraph = {
  poets: PoetNode[]
  relations: PoetRelation[]
}

export type ViewportState = {
  pan: CanvasPoint
}

export type ProjectedPoet = {
  opacity: number
  poet: PoetNode
  radius: number
  x: number
  y: number
}

export type BackgroundStar = {
  depth: number
  phase: number
  radius: number
  x: number
  y: number
}
