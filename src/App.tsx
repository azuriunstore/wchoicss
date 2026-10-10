import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react"
import { LiquidButton } from "@/components/ui/liquid-glass-button"
import { DEFAULT_SHADER_CONFIG, type ShaderColors, WebGLShader } from "@/components/ui/web-gl-shader"
import phraseBank from "@/data/frases_banco_completo.json"

type ShaderSettings = { colors: ShaderColors; xScale: number; yScale: number; distortion: number; speed: number }
type User = { openId: string; name: string; email: string; username: string }
type Attachment = { id: string; name: string; mime: string; size: number; url: string; key: string }
type Note = { id: string; title: string; body: string; category: string; color: string; pinned: boolean; marker?: string | null; createdAt: number; updatedAt: number; positionX?: number | null; positionY?: number | null; attachments?: Attachment[]; parentId?: string | null; isFolder?: boolean; deleted: boolean }
type Connection = { from: Note; to: Note }
type AlignmentGuide = { orientation: "vertical" | "horizontal"; coordinate: number; start: number; end: number; key: string }
type AnchorSide = "top" | "bottom" | "left" | "right"
type ConnectorKind = "straight" | "elbow" | "curved"
type MarkerKind = "none" | "arrow" | "openArrow" | "circle"
type DashKind = "solid" | "dashed" | "dotted"
type ConnectorState = { key: string; fromId: string; toId: string; fromAnchor: AnchorSide; toAnchor: AnchorSide; kind: ConnectorKind; startMarker: MarkerKind; endMarker: MarkerKind; dash: DashKind; width: number; color: string; label: string; midOffset: number }

type SyncState = "idle" | "saving" | "saved" | "offline" | "error"

const defaults: ShaderSettings = { colors: { ...DEFAULT_SHADER_CONFIG.colors }, xScale: DEFAULT_SHADER_CONFIG.xScale, yScale: DEFAULT_SHADER_CONFIG.yScale, distortion: DEFAULT_SHADER_CONFIG.distortion, speed: DEFAULT_SHADER_CONFIG.speed }
const shaderPalettes: ShaderColors[] = [
  { red: "#ff244d", green: "#69ff80", blue: "#547cff" },
  { red: "#ff7a18", green: "#ffe66d", blue: "#5b8cff" },
  { red: "#ff4d9d", green: "#8affc1", blue: "#8a7dff" },
  { red: "#ff5f6d", green: "#7cf5d2", blue: "#38bdf8" },
  { red: "#f97316", green: "#a3e635", blue: "#c084fc" },
]
const randomShaderSettings = (): ShaderSettings => {
  const palette = shaderPalettes[Math.floor(Math.random() * shaderPalettes.length)]
  return { colors: { ...palette }, xScale: Number((0.75 + Math.random() * 1.8).toFixed(2)), yScale: Number((0.28 + Math.random() * 0.7).toFixed(2)), distortion: Number((0.025 + Math.random() * 0.16).toFixed(3)), speed: Number((0.006 + Math.random() * 0.022).toFixed(3)) }
}
const noteColors = [{ name: "Amarelo", value: "#fff3b0" }, { name: "Azul", value: "#cce9ff" }, { name: "Rosa", value: "#ffd6e7" }, { name: "Verde", value: "#d8f3dc" }]
const sessionTabs = [{ label: "Geral - Todas", category: "Todas", icon: "📌" }, { label: "Tarefas", category: "Tarefas", icon: "✅" }, { label: "Ideias", category: "Ideias", icon: "💡" }, { label: "Estudos", category: "Estudos", icon: "📚" }, { label: "Trabalho", category: "Trabalho", icon: "💼" }, { label: "Planejamento", category: "Planejamento", icon: "📅" }, { label: "Diário", category: "Diário", icon: "📖" }, { label: "Lixeira", category: "Lixeira", icon: "🗑️" }]
const starterNotes: Note[] = [
  { id: "starter-1", title: "Uma ideia para guardar", body: "Use este espaço para anotar referências, frases, projetos, links e pensamentos que você não quer perder.", category: "Ideias", color: "#fff3b0", pinned: true, createdAt: Date.now() - 1000 * 60 * 28, updatedAt: Date.now() - 1000 * 60 * 28, deleted: false },
  { id: "starter-2", title: "Lembrete visual", body: "A melhor coleção pessoal mistura coisas úteis com coisas que simplesmente despertam curiosidade.", category: "Referências", color: "#cce9ff", pinned: false, createdAt: Date.now() - 1000 * 60 * 90, updatedAt: Date.now() - 1000 * 60 * 90, deleted: false },
  { id: "starter-3", title: "Próximo experimento", body: "Adicionar uma imagem ou um link interessante e escrever em uma frase por que isso chamou atenção.", category: "Projetos", color: "#d8f3dc", pinned: false, createdAt: Date.now() - 1000 * 60 * 180, updatedAt: Date.now() - 1000 * 60 * 180, deleted: false },
]

const formatDate = (timestamp: number) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(timestamp)
type Phrase = { frase: string; autor: string }
const pickRandomPhrase = (): Phrase => {
  const available = (phraseBank as Phrase[]).filter((item) => item.frase && item.autor)
  return available[Math.floor(Math.random() * available.length)] || { frase: "Wchoicss coleciona o que merece ficar.", autor: "Wchoicss Notes" }
}

function noteKey(title: string) { return title.trim().toLocaleLowerCase("pt-BR") }
function linkedTitles(body: string) {
  const titles: string[] = []
  const seen = new Set<string>()
  for (const match of body.matchAll(/\[\[([^\]\n]{1,120})\]\]/g)) {
    const title = match[1].trim()
    const key = noteKey(title)
    if (title && !seen.has(key)) { seen.add(key); titles.push(title) }
  }
  return titles
}
function resolveTargets(note: Note, notes: Note[]) {
  const byTitle = new Map(notes.filter((item) => !item.deleted).map((item) => [noteKey(item.title), item]))
  const seen = new Set<string>()
  return linkedTitles(note.body).map((title) => byTitle.get(noteKey(title))).filter((target): target is Note => Boolean(target && target.id !== note.id && !seen.has(target.id) && seen.add(target.id)))
}
function makeConnections(notes: Note[]): Connection[] {
  const active = notes.filter((note) => !note.deleted)
  return active.flatMap((from) => resolveTargets(from, active).map((to) => ({ from, to })))
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(url, { credentials: "include", signal: controller.signal, ...options, headers: { "content-type": "application/json", ...(options?.headers || {}) } })
    if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`)
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  } finally { window.clearTimeout(timeout) }
}

function cacheKey(openId: string) { return `wchoicss-notes-cache:${openId}` }
function readCache(openId: string): Note[] | null {
  try { const raw = localStorage.getItem(cacheKey(openId)); return raw ? JSON.parse(raw) as Note[] : null } catch { return null }
}
function writeCache(openId: string, notes: Note[]) { localStorage.setItem(cacheKey(openId), JSON.stringify(notes)) }
function keepOnlyGeneralFolder(notes: Note[]) {
  const generalIds = new Set(notes.filter((note) => note.isFolder && note.title.trim().toLocaleLowerCase("pt-BR") === "geral" && !note.parentId).map((note) => note.id))
  return notes.filter((note) => {
    if (note.isFolder) return generalIds.has(note.id)
    return !note.parentId || generalIds.has(note.parentId)
  }).map((note) => note.category.trim().toLocaleLowerCase("pt-BR") === "teste" ? { ...note, category: "Ideias" } : note)
}

function RangeControl({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="grid gap-2"><span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">{label}<output className="font-mono tracking-normal text-white/90">{value.toFixed(step < 0.01 ? 3 : 2)}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-1 w-full cursor-pointer" /></label>
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">{label}<span className="flex items-center gap-2 font-mono tracking-normal text-white/80">{value.toUpperCase()}<input aria-label={`Cor ${label}`} type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-5 w-5 cursor-pointer rounded-full" /></span></label>
}

function NoteBody({ body, notes, onOpen }: { body: string; notes: Note[]; onOpen: (note: Note) => void }) {
  const parts = body.split(/(\[\[[^\]\n]{1,120}\]\]|\*\*[^*\n]+\*\*)/g)
  const activeByTitle = new Map(notes.filter((note) => !note.deleted).map((note) => [noteKey(note.title), note]))
  return <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800/80">{parts.map((part, index) => {
    const linkMatch = part.match(/^\[\[([^\]\n]{1,120})\]\]$/)
    if (linkMatch) {
      const title = linkMatch[1].trim()
      const target = activeByTitle.get(noteKey(title))
      return target
        ? <button key={`${part}-${index}`} type="button" onClick={() => onOpen(target)} className="rounded bg-zinc-900/10 px-1 font-bold text-zinc-900 underline decoration-zinc-900/35 underline-offset-2 transition hover:bg-zinc-900/20 hover:decoration-zinc-900">↗ {title}</button>
        : <span key={`${part}-${index}`} title="Esta nota ainda não existe" className="rounded bg-zinc-900/5 px-1 text-zinc-700/65 underline decoration-dashed underline-offset-2">[[{title}]]</span>
    }
    const boldMatch = part.match(/^\*\*([^*\n]+)\*\*$/)
    return boldMatch ? <strong key={`${part}-${index}`} className="font-bold text-zinc-900">{boldMatch[1]}</strong> : <span key={`${part}-${index}`}>{part}</span>
  })}</p>
}
function NoteCard({ note, trash, notes, connectionCount, onEdit, onDelete, onRestore, onTogglePin, onOpenFolder, onMakeFolder, quickEdit, onQuickSave, onUpdateMarker, draggableNote, onNoteDragStart, onNoteDragEnd }: { note: Note; trash: boolean; notes: Note[]; connectionCount: number; onEdit: (note: Note) => void; onDelete: (id: string) => void; onRestore: (id: string) => void; onTogglePin: (id: string) => void; onOpenFolder?: (note: Note) => void; onMakeFolder?: (note: Note) => void; quickEdit?: boolean; onQuickSave?: (id: string, body: string) => void; onUpdateMarker?: (id: string, marker: string) => void; draggableNote?: boolean; onNoteDragStart?: (note: Note) => void; onNoteDragEnd?: () => void }) {
  const stopCardInteraction = (event: React.SyntheticEvent) => event.stopPropagation()
  const triggerDelete = (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.stopPropagation(); onDelete(note.id) }
  const [quickText, setQuickText] = useState(note.body)
  const [markerText, setMarkerText] = useState(note.marker || "")
  useEffect(() => { if (quickEdit) setQuickText(note.body) }, [quickEdit, note.body])
  useEffect(() => { setMarkerText(note.marker || "") }, [note.marker])
  const finishQuickEdit = () => { if (quickEdit) onQuickSave?.(note.id, quickText) }
  const saveMarker = () => { onUpdateMarker?.(note.id, markerText) }
  return <article draggable={draggableNote || undefined} onDragStart={(event) => { event.dataTransfer.setData("text/note", note.id); event.dataTransfer.effectAllowed = "move"; onNoteDragStart?.(note) }} onDragEnd={onNoteDragEnd} className="note-block-no-scroll group relative mb-5 flex min-h-[210px break-inside-avoid flex-col justify-between overflow-hidden rounded-[3px] p-5 text-zinc-900 shadow-[5px_7px_0_rgba(0,0,0,0.14)] transition duration-300 hover:-translate-y-1 hover:shadow-[7px_12px_0_rgba(0,0,0,0.18)]" style={{ backgroundColor: note.color, opacity: trash ? 0.68 : 1 }}><span className="absolute right-4 top-0 h-5 w-11 rounded-b-full bg-black/10" /><input value={markerText} onChange={(event) => setMarkerText(event.target.value)} onBlur={saveMarker} onPointerDown={stopCardInteraction} onClick={stopCardInteraction} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur() } }} maxLength={80} aria-label="Número ou texto no canto da nota" placeholder="Nº / texto" className="absolute left-3 top-2 z-10 w-40 border-b border-zinc-900/25 bg-transparent px-1.5 py-1 text-base font-black uppercase tracking-[0.08em] text-zinc-900 outline-none placeholder:text-zinc-700/35 focus:border-zinc-900/60" /><div className="pt-5"><div className="mb-5 flex items-center justify-end gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700/65"><span>{formatDate(note.createdAt)}</span></div><h3 className="pr-6 text-xl font-black leading-tight tracking-[-0.04em]">{note.title}</h3>{quickEdit ? <textarea autoFocus value={quickText} onChange={(event) => setQuickText(event.target.value)} onBlur={finishQuickEdit} onPointerDown={stopCardInteraction} onClick={stopCardInteraction} onKeyDown={(event) => { if (event.key === "Escape") { setQuickText(note.body); finishQuickEdit() } }} placeholder="Escreva aqui..." className="note-block-no-scroll mt-3 min-h-[130px] w-full resize-none overflow-hidden bg-transparent text-sm leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-800/45" /> : <NoteBody body={note.body} notes={notes} onOpen={onEdit} />}{note.attachments?.length ? <div className="mt-4 grid gap-2">{note.attachments.map((attachment) => <Fragment key={attachment.id}><a href={attachment.url} target="_blank" rel="noreferrer" download={attachment.name} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-900/15 bg-white/20 px-3 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-white/40"><span className="min-w-0 truncate">{attachment.mime.startsWith("image/") ? "🖼️" : "📎"} {attachment.name}</span><span className="shrink-0 text-[10px] text-zinc-700/60">{Math.ceil(attachment.size / 1024)} KB</span></a>{attachment.mime.startsWith("image/") ? <img src={attachment.url} alt={`Prévia de ${attachment.name}`} loading="lazy" className="mt-2 max-h-64 w-full rounded-lg object-contain" /> : null}</Fragment>)}</div> : null}</div><div className="mt-6 flex items-center justify-between border-t border-zinc-900/10 pt-3 text-xs"><span className="font-medium text-zinc-700/60">{trash ? "Na lixeira" : note.isFolder ? "" : connectionCount > 0 ? `${connectionCount} ${connectionCount === 1 ? "conexão" : "conexões"}` : ""}</span><div className="flex gap-3 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100" onPointerDown={stopCardInteraction} onPointerUp={stopCardInteraction} onClick={stopCardInteraction}>{trash ? <button type="button" onClick={() => onRestore(note.id)} className="font-bold text-zinc-800 hover:underline">Restaurar</button> : <>{note.isFolder && onOpenFolder ? <button type="button" onClick={() => onOpenFolder(note)} className="font-bold text-zinc-800 hover:underline">Abrir pasta</button> : null}{onMakeFolder ? <button type="button" onClick={() => onMakeFolder(note)} className="font-bold text-zinc-800 hover:underline">Criar subpasta</button> : null}<button type="button" onClick={() => onEdit(note)} className="font-bold text-zinc-800 hover:underline">Editar</button><button type="button" onPointerDown={triggerDelete} onClick={(event) => { event.stopPropagation() }} aria-label={note.isFolder ? "Apagar subpasta" : "Apagar nota"} className="font-bold text-red-900/75 hover:underline">{note.isFolder ? "Apagar subpasta" : "Apagar"}</button></>}</div></div></article>
}

function MuralBoard({ notes, connectionCounts, onEdit, onDelete, onTogglePin, onMove, onOpenFolder, onMakeFolder, focusFolderId, quickEditId, onQuickSave, onUpdateMarker, onMoveNotesToGroup, onDeleteSelected, onSelectionChange }: { notes: Note[]; connectionCounts: Map<string, number>; onEdit: (note: Note) => void; onDelete: (id: string) => void; onTogglePin: (id: string) => void; onMove: (id: string, x: number, y: number) => void; onOpenFolder: (note: Note) => void; onMakeFolder: (note: Note) => void; focusFolderId?: string | null; quickEditId?: string | null; onQuickSave?: (id: string, body: string) => void; onUpdateMarker?: (id: string, marker: string) => void; onMoveNotesToGroup?: (ids: string[], group: string) => void; onDeleteSelected: (ids: string[]) => void; onSelectionChange: (ids: string[]) => void }) {
  const cardWidth = 300
  const boardWidth = 1800
  const boardHeight = 1200
  const initialPositions = Object.fromEntries(notes.map((note, index) => [note.id, { x: note.positionX ?? 30 + (index % 3) * 390, y: note.positionY ?? 30 + Math.floor(index / 3) * 280 }])) as Record<string, { x: number; y: number }>
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(initialPositions)
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => { setSelectedNoteIds((current) => current.filter((id) => notes.some((note) => note.id === id))) }, [notes])
  useEffect(() => { onSelectionChange(selectedNoteIds) }, [selectedNoteIds, onSelectionChange])
  const viewportRef = useRef<HTMLDivElement>(null)
  const noteDragRef = useRef<{ id: string; offsetX: number; offsetY: number; moved: boolean; latestPosition: { x: number; y: number }; groupIds: string[]; groupStartPositions: Record<string, { x: number; y: number }>; latestPositions: Record<string, { x: number; y: number }> } | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const pendingPointerRef = useRef<{ clientX: number; clientY: number; altKey: boolean } | null>(null)
  const marqueeRef = useRef<{ start: { x: number; y: number }; additive: boolean; moved: boolean; pointerId: number } | null>(null)

  useEffect(() => {
    setPositions((current) => {
      const next = { ...current }
      notes.forEach((note, index) => {
        if (!next[note.id]) next[note.id] = { x: note.positionX ?? 30 + (index % 3) * 390, y: note.positionY ?? 30 + Math.floor(index / 3) * 280 }
      })
      return Object.fromEntries(Object.entries(next).filter(([id]) => notes.some((note) => note.id === id)))
    })
  }, [notes])

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === viewportRef.current)
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  const worldFromClient = (clientX: number, clientY: number) => {
    const bounds = viewportRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    return { x: (clientX - bounds.left) / bounds.width * boardWidth - boardWidth / 2, y: (clientY - bounds.top) / bounds.height * boardHeight - boardHeight / 2 }
  }
  const updateMarquee = (point: { x: number; y: number }) => {
    const marquee = marqueeRef.current
    if (!marquee) return
    const box = { x: Math.min(marquee.start.x, point.x), y: Math.min(marquee.start.y, point.y), width: Math.abs(point.x - marquee.start.x), height: Math.abs(point.y - marquee.start.y) }
    marquee.moved = box.width > 3 || box.height > 3
    setMarqueeBox({ x: boardWidth / 2 + box.x, y: boardHeight / 2 + box.y, width: box.width, height: box.height })
    const hits = notes.filter((note) => {
      const position = positions[note.id] || { x: 0, y: 0 }
      return position.x <= box.x + box.width && position.x + cardWidth >= box.x && position.y <= box.y + box.height && position.y + 210 >= box.y
    }).map((note) => note.id)
    setSelectedNoteIds((current) => marquee.additive ? Array.from(new Set([...current, ...hits])) : hits)
  }
  const beginMarquee = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return
    const point = worldFromClient(event.clientX, event.clientY)
    marqueeRef.current = { start: point, additive: event.ctrlKey || event.metaKey, moved: false, pointerId: event.pointerId }
    setMarqueeBox({ x: boardWidth / 2 + point.x, y: boardHeight / 2 + point.y, width: 0, height: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const finishMarquee = (event: React.PointerEvent<HTMLDivElement>) => {
    const marquee = marqueeRef.current
    if (!marquee) return
    updateMarquee(worldFromClient(event.clientX, event.clientY))
    if (!marquee.moved && !marquee.additive) setSelectedNoteIds([])
    marqueeRef.current = null
    setMarqueeBox(null)
    if (event.currentTarget.hasPointerCapture(marquee.pointerId)) event.currentTarget.releasePointerCapture(marquee.pointerId)
  }
  useEffect(() => {
    const clearSelection = (event: KeyboardEvent) => { if (event.key === "Escape") { marqueeRef.current = null; setMarqueeBox(null); setSelectedNoteIds([]) } }
    window.addEventListener("keydown", clearSelection)
    return () => window.removeEventListener("keydown", clearSelection)
  }, [])
  const toggleFullscreen = async () => {
    if (!viewportRef.current) return
    if (document.fullscreenElement === viewportRef.current) await document.exitFullscreen()
    else await viewportRef.current.requestFullscreen()
  }
  const beginDrag = (event: React.PointerEvent, note: Note) => {
    event.stopPropagation()
    const target = event.target as HTMLElement
    if (target.closest("button, a, input, textarea, select") || event.button !== 0) return
    event.preventDefault()
    const point = worldFromClient(event.clientX, event.clientY)
    const position = positions[note.id] || { x: 0, y: 0 }
    const groupIds = selectedNoteIds.includes(note.id) && selectedNoteIds.length > 1 ? selectedNoteIds : [note.id]
    if (!selectedNoteIds.includes(note.id)) setSelectedNoteIds([note.id])
    const groupStartPositions = Object.fromEntries(groupIds.map((id) => [id, positions[id] || { x: 0, y: 0 }])) as Record<string, { x: number; y: number }>
    noteDragRef.current = { id: note.id, offsetX: point.x - position.x, offsetY: point.y - position.y, moved: false, latestPosition: position, groupIds, groupStartPositions, latestPositions: groupStartPositions }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const calculateAlignment = (draggedId: string, rawPosition: { x: number; y: number }, snapEnabled: boolean) => {
    const width = cardWidth
    const height = 210
    const draggedX = [rawPosition.x, rawPosition.x + width / 2, rawPosition.x + width]
    const draggedY = [rawPosition.y, rawPosition.y + height / 2, rawPosition.y + height]
    const xCandidates: Array<{ proposed: number; coordinate: number; start: number; end: number; key: string; distance: number }> = []
    const yCandidates: Array<{ proposed: number; coordinate: number; start: number; end: number; key: string; distance: number }> = []
    notes.filter((note) => note.id !== draggedId).forEach((other) => {
      const position = positions[other.id]
      if (!position) return
      const otherX = [position.x, position.x + width / 2, position.x + width]
      const otherY = [position.y, position.y + height / 2, position.y + height]
      draggedX.forEach((value, draggedIndex) => otherX.forEach((coordinate, otherIndex) => {
        const proposed = rawPosition.x + (coordinate - value)
        const distance = Math.abs(proposed - rawPosition.x)
        if (distance <= 6) xCandidates.push({ proposed, coordinate, start: Math.min(rawPosition.y, position.y) - 18, end: Math.max(rawPosition.y + height, position.y + height) + 18, key: `${other.id}-x-${draggedIndex}-${otherIndex}`, distance })
      }))
      draggedY.forEach((value, draggedIndex) => otherY.forEach((coordinate, otherIndex) => {
        const proposed = rawPosition.y + (coordinate - value)
        const distance = Math.abs(proposed - rawPosition.y)
        if (distance <= 6) yCandidates.push({ proposed, coordinate, start: Math.min(rawPosition.x, position.x) - 18, end: Math.max(rawPosition.x + width, position.x + width) + 18, key: `${other.id}-y-${draggedIndex}-${otherIndex}`, distance })
      }))
    })
    const bestX = xCandidates.length ? xCandidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best) : null
    const bestY = yCandidates.length ? yCandidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best) : null
    const nextPosition = { x: snapEnabled && bestX ? bestX.proposed : rawPosition.x, y: snapEnabled && bestY ? bestY.proposed : rawPosition.y }
    const guides: AlignmentGuide[] = [
      ...xCandidates.filter((candidate) => Math.abs(candidate.proposed - nextPosition.x) <= 6).map((candidate) => ({ orientation: "vertical" as const, coordinate: candidate.coordinate, start: candidate.start, end: candidate.end, key: candidate.key })),
      ...yCandidates.filter((candidate) => Math.abs(candidate.proposed - nextPosition.y) <= 6).map((candidate) => ({ orientation: "horizontal" as const, coordinate: candidate.coordinate, start: candidate.start, end: candidate.end, key: candidate.key })),
    ]
    return { nextPosition, guides }
  }
  const applyDragFrame = () => {
    dragFrameRef.current = null
    const drag = noteDragRef.current
    const pending = pendingPointerRef.current
    if (!drag || !pending) return
    const point = worldFromClient(pending.clientX, pending.clientY)
    const rawPosition = { x: Math.round(point.x - drag.offsetX), y: Math.round(point.y - drag.offsetY) }
    const isGroupDrag = drag.groupIds.length > 1
    const result = isGroupDrag ? { nextPosition: rawPosition, guides: [] as AlignmentGuide[] } : calculateAlignment(drag.id, rawPosition, !pending.altKey)
    if (Math.abs(result.nextPosition.x - (positions[drag.id]?.x || 0)) > 2 || Math.abs(result.nextPosition.y - (positions[drag.id]?.y || 0)) > 2) drag.moved = true
    const delta = { x: result.nextPosition.x - drag.groupStartPositions[drag.id].x, y: result.nextPosition.y - drag.groupStartPositions[drag.id].y }
    const nextPositions = Object.fromEntries(drag.groupIds.map((id) => [id, { x: drag.groupStartPositions[id].x + delta.x, y: drag.groupStartPositions[id].y + delta.y }])) as Record<string, { x: number; y: number }>
    drag.latestPosition = nextPositions[drag.id]
    drag.latestPositions = nextPositions
    setAlignmentGuides(result.guides)
    setPositions((current) => ({ ...current, ...nextPositions }))
  }
  const moveDrag = (event: React.PointerEvent) => {
    if (!noteDragRef.current) return
    pendingPointerRef.current = { clientX: event.clientX, clientY: event.clientY, altKey: event.altKey }
    if (dragFrameRef.current === null) dragFrameRef.current = requestAnimationFrame(applyDragFrame)
  }
  const endDrag = (event: React.PointerEvent, note: Note) => {
    const drag = noteDragRef.current
    if (!drag || drag.id !== note.id) return
    if (dragFrameRef.current !== null) { cancelAnimationFrame(dragFrameRef.current); dragFrameRef.current = null; applyDragFrame() }
    const position = drag.latestPosition
    if (drag.moved && position) {
      const draggedCenter = { x: position.x + cardWidth / 2, y: position.y + 105 }
      const swapTarget = drag.groupIds.length === 1 ? notes.find((other) => {
        if (other.id === drag.id || other.deleted || drag.groupIds.includes(other.id)) return false
        const otherPosition = drag.latestPositions[other.id] || positions[other.id]
        if (!otherPosition) return false
        return draggedCenter.x >= otherPosition.x && draggedCenter.x <= otherPosition.x + cardWidth && draggedCenter.y >= otherPosition.y && draggedCenter.y <= otherPosition.y + 210
      }) : undefined
      if (swapTarget) {
        const targetPosition = drag.latestPositions[swapTarget.id] || positions[swapTarget.id] || { x: 0, y: 0 }
        const originalPosition = drag.groupStartPositions[drag.id]
        setPositions((current) => ({ ...current, [drag.id]: targetPosition, [swapTarget.id]: originalPosition }))
        onMove(drag.id, targetPosition.x, targetPosition.y)
        onMove(swapTarget.id, originalPosition.x, originalPosition.y)
      } else {
        Object.entries(drag.latestPositions).forEach(([id, next]) => onMove(id, next.x, next.y))
      }
    }
    noteDragRef.current = null
    pendingPointerRef.current = null
    setAlignmentGuides([])
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const folderLinks = notes.filter((note) => note.isFolder && note.parentId && notes.some((parent) => parent.id === note.parentId && parent.isFolder))
  const focusIds = new Set<string>()
  if (focusFolderId) {
    focusIds.add(focusFolderId)
    let changed = true
    while (changed) {
      changed = false
      notes.forEach((note) => {
        if (note.parentId && focusIds.has(note.parentId) && !focusIds.has(note.id)) { focusIds.add(note.id); changed = true }
      })
    }
  }

  return <section className="relative -mx-5 sm:-mx-8">
    <div ref={viewportRef} className="relative h-[calc(100vh-10rem)] min-h-[680px] w-full select-none overflow-visible bg-transparent [&:fullscreen]:h-screen [&:fullscreen]:min-h-0" style={{ touchAction: "none" }}>
      <div className="absolute inset-0" onPointerDown={beginMarquee} onPointerMove={(event) => { if (marqueeRef.current) updateMarquee(worldFromClient(event.clientX, event.clientY)) }} onPointerUp={finishMarquee} onPointerCancel={() => { marqueeRef.current = null; setMarqueeBox(null) }}>
      <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible" viewBox={`0 0 ${boardWidth} ${boardHeight}`} preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id="folder-link-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M 0 0 L 12 6 L 0 12 z" fill="rgba(255,255,255,0.72)" /></marker></defs>
        {folderLinks.map((child) => { const parent = notes.find((note) => note.id === child.parentId); const parentPosition = parent ? positions[parent.id] : null; const childPosition = positions[child.id]; if (!parentPosition || !childPosition) return null; const parentCenter = { x: boardWidth / 2 + parentPosition.x + cardWidth / 2, y: boardHeight / 2 + parentPosition.y + 105 }; const childCenter = { x: boardWidth / 2 + childPosition.x + cardWidth / 2, y: boardHeight / 2 + childPosition.y + 105 }; const dx = childCenter.x - parentCenter.x; const dy = childCenter.y - parentCenter.y; const scale = Math.max(Math.abs(dx) / (cardWidth / 2), Math.abs(dy) / 105, 1); const start = { x: parentCenter.x + dx / scale, y: parentCenter.y + dy / scale }; const end = { x: childCenter.x - dx / scale, y: childCenter.y - dy / scale }; return <line key={`folder-link-${parent?.id}-${child.id}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="rgba(255,255,255,0.65)" strokeWidth="4" strokeDasharray="14 12" strokeLinecap="round" markerEnd="url(#folder-link-arrow)" /> })}
      </svg>
      {alignmentGuides.length > 0 && <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible" viewBox={`0 0 ${boardWidth} ${boardHeight}`} preserveAspectRatio="none" aria-hidden="true">{alignmentGuides.map((guide) => guide.orientation === "vertical" ? <line key={guide.key} x1={boardWidth / 2 + guide.coordinate} y1={boardHeight / 2 + guide.start} x2={boardWidth / 2 + guide.coordinate} y2={boardHeight / 2 + guide.end} stroke="#FFFFFF" strokeWidth="1" style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.6))" }} /> : <line key={guide.key} x1={boardWidth / 2 + guide.start} y1={boardHeight / 2 + guide.coordinate} x2={boardWidth / 2 + guide.end} y2={boardHeight / 2 + guide.coordinate} stroke="#FFFFFF" strokeWidth="1" style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.6))" }} />)}</svg>}
      {marqueeBox && <svg className="pointer-events-none absolute inset-0 z-[6] h-full w-full overflow-visible" viewBox={`0 0 ${boardWidth} ${boardHeight}`} preserveAspectRatio="none" aria-hidden="true"><rect x={marqueeBox.x} y={marqueeBox.y} width={marqueeBox.width} height={marqueeBox.height} fill="rgba(59,130,246,0.18)" stroke="#3b82f6" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>}
      {notes.map((note) => {
        const position = positions[note.id] || { x: 0, y: 0 }
        const isSelected = selectedNoteIds.includes(note.id)
        return <div key={note.id} data-note onPointerDown={(event) => beginDrag(event, note)} onClick={(event) => { if (event.ctrlKey || event.metaKey || event.shiftKey) setSelectedNoteIds((current) => current.includes(note.id) ? current.filter((id) => id !== note.id) : [...current, note.id]); else if (!selectedNoteIds.includes(note.id) || selectedNoteIds.length === 1) setSelectedNoteIds([note.id]) }} className={`absolute z-10 rounded-xl transition-transform duration-700 ease-out ${isSelected ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-[#10110f]" : ""}`} style={{ left: `${(boardWidth / 2 + position.x) / boardWidth * 100}%`, top: `${(boardHeight / 2 + position.y) / boardHeight * 100}%`, width: cardWidth, touchAction: "none", transform: focusIds.has(note.id) ? "scale(1.12)" : "scale(1)", transformOrigin: "center center" }} onPointerMove={moveDrag} onPointerUp={(event) => endDrag(event, note)}>
          <NoteCard note={note} notes={notes} connectionCount={connectionCounts.get(note.id) || 0} trash={false} onEdit={onEdit} onDelete={onDelete} onRestore={() => undefined} onTogglePin={onTogglePin} onOpenFolder={onOpenFolder} onMakeFolder={onMakeFolder} quickEdit={quickEditId === note.id} onQuickSave={onQuickSave} onUpdateMarker={onUpdateMarker} draggableNote onNoteDragStart={(dragged) => { /* A barra principal lê o dataTransfer */ }} />
        </div>
      })}
      </div>
      <div className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-xl border border-white/15 bg-black/65 p-1.5 text-white shadow-xl backdrop-blur-md">
        <button type="button" onClick={() => void toggleFullscreen()} className="grid h-8 w-8 place-items-center rounded-lg text-base hover:bg-white/10" aria-label={isFullscreen ? "Sair da tela cheia" : "Entrar em tela cheia"} title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}>{isFullscreen ? "×" : "⛶"}</button>
      </div>
    </div>
  </section>
}



function ConnectionsMap({ notes, connections, onOpen, onConnect, onReconnect, storageKey }: { notes: Note[]; connections: Connection[]; onOpen: (note: Note) => void; onConnect: (from: Note, to: Note) => void; onReconnect: (connection: Connection, endpoint: "from" | "to", target: Note) => void; storageKey: string }) {
  const activeNotes = notes.filter((note) => !note.deleted)
  const canvasWidth = 1180
  const nodeWidth = 244
  const nodeHeight = 132
  const canvasHeight = Math.max(610, Math.ceil(Math.max(activeNotes.length, 1) / 3) * 220)
  const initialPositions = Object.fromEntries(activeNotes.map((note, index) => [note.id, { x: 34 + (index % 3) * 382, y: 36 + Math.floor(index / 3) * 220 }])) as Record<string, { x: number; y: number }>
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(initialPositions)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [styles, setStyles] = useState<Record<string, ConnectorState>>(() => {
    try { return JSON.parse(localStorage.getItem(`wchoicss-connectors:${storageKey}`) || "{}") as Record<string, ConnectorState> } catch { return {} }
  })
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ kind: "move" | "create" | "reconnect" | "mid"; id?: string; key?: string; endpoint?: "from" | "to"; anchor?: AnchorSide; offsetX: number; offsetY: number } | null>(null)
  const selectionRef = useRef<{ start: { x: number; y: number }; additive: boolean; moved: boolean; pointerId: number } | null>(null)

  const noteById = new Map(activeNotes.map((note) => [note.id, note]))
  const keyFor = (fromId: string, toId: string) => `${fromId}-${toId}`
  const defaultAnchor = (from: Note, to: Note): AnchorSide => {
    const a = positions[from.id] || { x: 0, y: 0 }
    const b = positions[to.id] || { x: 0, y: 0 }
    const dx = b.x - a.x
    const dy = b.y - a.y
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left"
    return dy >= 0 ? "bottom" : "top"
  }
  const defaultState = (connection: Connection): ConnectorState => ({ key: keyFor(connection.from.id, connection.to.id), fromId: connection.from.id, toId: connection.to.id, fromAnchor: defaultAnchor(connection.from, connection.to), toAnchor: defaultAnchor(connection.to, connection.from), kind: "curved", startMarker: "none", endMarker: "arrow", dash: "solid", width: 3, color: "#86efac", label: "", midOffset: 0 })

  useEffect(() => {
    setPositions((current) => {
      const next = { ...current }
      activeNotes.forEach((note, index) => { if (!next[note.id]) next[note.id] = { x: 34 + (index % 3) * 382, y: 36 + Math.floor(index / 3) * 220 } })
      return Object.fromEntries(Object.entries(next).filter(([id]) => activeNotes.some((note) => note.id === id)))
    })
  }, [notes])
  useEffect(() => {
    setStyles((current) => {
      const next = { ...current }
      connections.forEach((connection) => { const key = keyFor(connection.from.id, connection.to.id); if (!next[key]) next[key] = defaultState(connection) })
      const keys = new Set(connections.map((connection) => keyFor(connection.from.id, connection.to.id)))
      return Object.fromEntries(Object.entries(next).filter(([key]) => keys.has(key)))
    })
  }, [connections, positions])
  useEffect(() => { try { localStorage.setItem(`wchoicss-connectors:${storageKey}`, JSON.stringify(styles)) } catch { /* armazenamento local indisponível */ } }, [styles, storageKey])

  const pointFromEvent = (event: React.PointerEvent) => {
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    return { x: (event.clientX - bounds.left) * canvasWidth / bounds.width, y: (event.clientY - bounds.top) * canvasHeight / bounds.height }
  }
  const boxFromPoints = (start: { x: number; y: number }, end: { x: number; y: number }) => ({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) })
  const nodesIntersecting = (box: { x: number; y: number; width: number; height: number }) => {
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!bounds) return []
    return activeNotes.filter((note) => {
      const element = canvasRef.current?.querySelector<HTMLElement>(`[data-node-id="${note.id}"]`)
      const rect = element?.getBoundingClientRect()
      if (!rect) return false
      const node = { x: (rect.left - bounds.left) * canvasWidth / bounds.width, y: (rect.top - bounds.top) * canvasHeight / bounds.height, width: rect.width * canvasWidth / bounds.width, height: rect.height * canvasHeight / bounds.height }
      return node.x <= box.x + box.width && node.x + node.width >= box.x && node.y <= box.y + box.height && node.y + node.height >= box.y
    }).map((note) => note.id)
  }
  const updateSelection = (point: { x: number; y: number }) => {
    const selection = selectionRef.current
    if (!selection) return
    const box = boxFromPoints(selection.start, point)
    selection.moved = box.width > 3 || box.height > 3
    setSelectionBox(box)
    const hits = new Set(nodesIntersecting(box))
    setSelectedNodeIds((current) => selection.additive ? Array.from(new Set([...current, ...hits])) : Array.from(hits))
  }
  const beginSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, input, select")) return
    const point = pointFromEvent(event)
    selectionRef.current = { start: point, additive: event.ctrlKey || event.metaKey, moved: false, pointerId: event.pointerId }
    setSelectionBox({ x: point.x, y: point.y, width: 0, height: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const finishSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    const selection = selectionRef.current
    if (!selection) { cancelPointer(); return }
    const point = pointFromEvent(event)
    updateSelection(point)
    if (!selection.moved && !selection.additive) setSelectedNodeIds([])
    selectionRef.current = null
    setSelectionBox(null)
    if (event.currentTarget.hasPointerCapture(selection.pointerId)) event.currentTarget.releasePointerCapture(selection.pointerId)
  }
  useEffect(() => {
    const clearSelection = (event: KeyboardEvent) => { if (event.key === "Escape") { selectionRef.current = null; setSelectionBox(null); setSelectedNodeIds([]) } }
    window.addEventListener("keydown", clearSelection)
    return () => window.removeEventListener("keydown", clearSelection)
  }, [])
  const anchorPoint = (position: { x: number; y: number }, anchor: AnchorSide) => ({ x: position.x + (anchor === "left" ? 0 : anchor === "right" ? nodeWidth : nodeWidth / 2), y: position.y + (anchor === "top" ? 0 : anchor === "bottom" ? nodeHeight : nodeHeight / 2) })
  const anchorVector = (anchor: AnchorSide) => anchor === "left" ? { x: -1, y: 0 } : anchor === "right" ? { x: 1, y: 0 } : anchor === "top" ? { x: 0, y: -1 } : { x: 0, y: 1 }
  const beginMove = (event: React.PointerEvent, note: Note) => {
    if ((event.target as HTMLElement).closest("button, a, input, select")) return
    event.stopPropagation()
    const point = pointFromEvent(event)
    const position = positions[note.id] || { x: 0, y: 0 }
    dragRef.current = { kind: "move", id: note.id, offsetX: point.x - position.x, offsetY: point.y - position.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const beginCreate = (event: React.PointerEvent, note: Note, anchor: AnchorSide) => {
    event.stopPropagation()
    dragRef.current = { kind: "create", id: note.id, anchor, offsetX: 0, offsetY: 0 }
    setCursor(pointFromEvent(event))
  }
  const beginReconnect = (event: React.PointerEvent, key: string, endpoint: "from" | "to") => {
    event.stopPropagation()
    dragRef.current = { kind: "reconnect", key, endpoint, offsetX: 0, offsetY: 0 }
    setCursor(pointFromEvent(event))
  }
  const beginMid = (event: React.PointerEvent, key: string) => {
    event.stopPropagation()
    dragRef.current = { kind: "mid", key, offsetX: 0, offsetY: 0 }
  }
  const updateStyle = (key: string, patch: Partial<ConnectorState>) => setStyles((current) => ({ ...current, [key]: { ...(current[key] || {} as ConnectorState), ...patch } }))
  const movePointer = (event: React.PointerEvent) => {
    const point = pointFromEvent(event)
    if (selectionRef.current) { updateSelection(point); return }
    const drag = dragRef.current
    if (!drag) return
    if (drag.kind === "move" && drag.id) {
      setPositions((current) => ({ ...current, [drag.id as string]: { x: Math.max(12, Math.min(canvasWidth - nodeWidth - 12, point.x - drag.offsetX)), y: Math.max(12, Math.min(canvasHeight - nodeHeight - 12, point.y - drag.offsetY)) } }))
    } else if (drag.kind === "mid" && drag.key) {
      const connector = connectorStates.find((item) => item.key === drag.key)
      if (connector) {
        const from = positions[connector.fromId]; const to = positions[connector.toId]
        const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
        updateStyle(drag.key, { midOffset: Math.round(horizontal ? point.x - (from.x + to.x) / 2 : point.y - (from.y + to.y) / 2) })
      }
    } else {
      setCursor(point)
    }
  }
  const completeDrop = (target: Note, targetAnchor: AnchorSide) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.kind === "create" && drag.id && drag.id !== target.id) {
      const source = noteById.get(drag.id)
      if (source) {
        const key = keyFor(source.id, target.id)
        setStyles((current) => ({ ...current, [key]: { ...(current[key] || defaultState({ from: source, to: target })), key, fromId: source.id, toId: target.id, fromAnchor: drag.anchor || "right", toAnchor: targetAnchor } }))
        onConnect(source, target)
      }
    } else if (drag.kind === "reconnect" && drag.key) {
      const connector = connectorStates.find((item) => item.key === drag.key)
      if (connector) {
        const connection = { from: noteById.get(connector.fromId)!, to: noteById.get(connector.toId)! }
        onReconnect(connection, drag.endpoint || "to", target)
      }
    }
    dragRef.current = null; setCursor(null)
  }
  const cancelPointer = () => { dragRef.current = null; selectionRef.current = null; setSelectionBox(null); setCursor(null) }

  const connectorStates = connections.map((connection) => styles[keyFor(connection.from.id, connection.to.id)] || defaultState(connection))
  const selected = connectorStates.find((connector) => connector.key === selectedKey)
  const selectedConnection = selected ? { from: noteById.get(selected.fromId)!, to: noteById.get(selected.toId)! } : null
  const updateSelected = (patch: Partial<ConnectorState>) => { if (selected) updateStyle(selected.key, patch) }

  const pathData = (connector: ConnectorState) => {
    const start = anchorPoint(positions[connector.fromId], connector.fromAnchor)
    const end = anchorPoint(positions[connector.toId], connector.toAnchor)
    const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.max(1, Math.hypot(dx, dy))
    if (connector.kind === "straight") return { d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`, label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } }
    if (connector.kind === "curved") {
      const nx = -dy / length; const ny = dx / length
      const c1 = { x: start.x + dx * 0.35 + nx * connector.midOffset, y: start.y + dy * 0.35 + ny * connector.midOffset }
      const c2 = { x: end.x - dx * 0.35 + nx * connector.midOffset, y: end.y - dy * 0.35 + ny * connector.midOffset }
      return { d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`, label: { x: 0.125 * start.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * end.x, y: 0.125 * start.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * end.y }, midpoint: { x: 0.125 * start.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * end.x, y: 0.125 * start.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * end.y } }
    }
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const mid = horizontal ? { x: (start.x + end.x) / 2 + connector.midOffset, y: 0 } : { x: 0, y: (start.y + end.y) / 2 + connector.midOffset }
    const points = horizontal ? [start, { x: mid.x, y: start.y }, { x: mid.x, y: end.y }, end] : [start, { x: start.x, y: mid.y }, { x: end.x, y: mid.y }, end]
    const radius = 12
    let d = `M ${points[0].x} ${points[0].y}`
    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = points[index - 1]; const current = points[index]; const next = points[index + 1]
      const firstLength = Math.hypot(current.x - previous.x, current.y - previous.y); const secondLength = Math.hypot(next.x - current.x, next.y - current.y); const r = Math.min(radius, firstLength / 2, secondLength / 2)
      const before = { x: current.x - ((current.x - previous.x) / firstLength) * r, y: current.y - ((current.y - previous.y) / firstLength) * r }
      const after = { x: current.x + ((next.x - current.x) / secondLength) * r, y: current.y + ((next.y - current.y) / secondLength) * r }
      d += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`
    }
    d += ` L ${end.x} ${end.y}`
    return { d, label: horizontal ? { x: mid.x, y: (start.y + end.y) / 2 } : { x: (start.x + end.x) / 2, y: mid.y }, midpoint: horizontal ? { x: mid.x, y: (start.y + end.y) / 2 } : { x: (start.x + end.x) / 2, y: mid.y } }
  }
  const marker = (kind: MarkerKind, id: string, color: string, start: boolean) => {
    if (kind === "none") return null
    if (kind === "circle") return <marker id={id} markerWidth="12" markerHeight="12" refX={start ? 4 : 8} refY="6" orient="auto-start-reverse" markerUnits="strokeWidth"><circle cx="6" cy="6" r="4" fill={color} stroke={color} strokeWidth="1.5" /></marker>
    return <marker id={id} markerWidth="12" markerHeight="12" refX={start ? 4 : 8} refY="6" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 2 1 L 10 6 L 2 11 Z" fill={kind === "arrow" ? color : "none"} stroke={color} strokeWidth="1.8" /></marker>
  }
  const dashArray = (dash: DashKind) => dash === "dashed" ? "12 8" : dash === "dotted" ? "2 8" : undefined
  const safeId = (value: string) => value.replace(/[^a-z0-9]/gi, "")

  if (activeNotes.length === 0) return <section className="rounded-2xl border border-dashed border-green-300/25 bg-black/25 px-6 py-10 text-center backdrop-blur-xl"><p className="text-lg font-semibold text-white">Ainda não há formas para conectar.</p><p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-white/50">Crie notas no mural e use as âncoras para desenhar conectores.</p></section>
  return <section className="overflow-hidden rounded-2xl border border-white/15 bg-black/35 p-4 backdrop-blur-xl sm:p-6"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-green-300">Editor SVG de conectores</p><h2 className="mt-2 text-xl font-black tracking-[-0.04em]">Conecte formas como no Miro</h2><p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/45">Passe o mouse sobre uma forma para revelar as quatro âncoras. Arraste uma âncora até outra forma; mova os cartões e as linhas serão recalculadas em tempo real.</p></div><div className="flex items-center gap-4 text-xs text-white/45">{selectedNodeIds.length > 0 && <span className="rounded-full border border-blue-300/35 bg-blue-400/10 px-2.5 py-1 text-blue-100">{selectedNodeIds.length} selecionado{selectedNodeIds.length === 1 ? "" : "s"}</span>}<span>{connectorStates.length} {connectorStates.length === 1 ? "conector" : "conectores"}</span></div></div>{selected && <div className="mb-4 grid gap-3 rounded-xl border border-green-300/25 bg-green-300/[0.06] p-3 text-xs text-white/75 md:grid-cols-2 lg:grid-cols-4"><label className="grid gap-1">Forma<select value={selected.kind} onChange={(event) => updateSelected({ kind: event.target.value as ConnectorKind })} className="rounded-lg border border-white/15 bg-zinc-950 px-2 py-2 text-white"><option value="straight">Reta</option><option value="elbow">Cotovelo</option><option value="curved">Curva Bézier</option></select></label><label className="grid gap-1">Ponta inicial<select value={selected.startMarker} onChange={(event) => updateSelected({ startMarker: event.target.value as MarkerKind })} className="rounded-lg border border-white/15 bg-zinc-950 px-2 py-2 text-white"><option value="none">Nenhuma</option><option value="arrow">Seta</option><option value="openArrow">Seta vazada</option><option value="circle">Círculo</option></select></label><label className="grid gap-1">Ponta final<select value={selected.endMarker} onChange={(event) => updateSelected({ endMarker: event.target.value as MarkerKind })} className="rounded-lg border border-white/15 bg-zinc-950 px-2 py-2 text-white"><option value="none">Nenhuma</option><option value="arrow">Seta</option><option value="openArrow">Seta vazada</option><option value="circle">Círculo</option></select></label><label className="grid gap-1">Traço<select value={selected.dash} onChange={(event) => updateSelected({ dash: event.target.value as DashKind })} className="rounded-lg border border-white/15 bg-zinc-950 px-2 py-2 text-white"><option value="solid">Contínuo</option><option value="dashed">Tracejado</option><option value="dotted">Pontilhado</option></select></label><label className="grid gap-1">Espessura<input type="range" min="1" max="10" value={selected.width} onChange={(event) => updateSelected({ width: Number(event.target.value) })} /></label><label className="grid gap-1">Cor<input type="color" value={selected.color} onChange={(event) => updateSelected({ color: event.target.value })} className="h-9 w-full rounded bg-transparent" /></label><label className="grid gap-1 md:col-span-2">Rótulo editável<input value={selected.label} onChange={(event) => updateSelected({ label: event.target.value })} placeholder="Digite um rótulo para a linha..." className="rounded-lg border border-white/15 bg-zinc-950 px-2 py-2 text-white placeholder:text-white/35" /></label></div>}<div className="overflow-auto rounded-xl border border-white/10 bg-[#10110f]/80"><div ref={canvasRef} className="relative select-none [background-image:linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:28px_28px]" style={{ width: canvasWidth, height: canvasHeight, touchAction: "none", ["--selection-border" as string]: "#3b82f6", ["--selection-fill" as string]: "rgba(59,130,246,0.18)" }} onPointerDown={beginSelection} onPointerMove={movePointer} onPointerUp={finishSelection} onPointerLeave={() => { if (!selectionRef.current) cancelPointer() }} onPointerCancel={cancelPointer}><svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} aria-hidden="true"><defs>{connectorStates.map((connector) => <>{marker(connector.startMarker, `start-${safeId(connector.key)}`, connector.color, true)}{marker(connector.endMarker, `end-${safeId(connector.key)}`, connector.color, false)}</>)}</defs>{connectorStates.map((connector) => { const path = pathData(connector); const selectedLine = selectedKey === connector.key; return <g key={connector.key}><path d={path.d} fill="none" stroke="transparent" strokeWidth={Math.max(16, connector.width + 12)} className="pointer-events-auto cursor-pointer" onPointerDown={(event) => event.stopPropagation()} onClick={() => setSelectedKey(connector.key)} /><path d={path.d} fill="none" stroke={connector.color} strokeWidth={selectedLine ? connector.width + 1 : connector.width} strokeDasharray={dashArray(connector.dash)} markerStart={connector.startMarker === "none" ? undefined : `url(#start-${safeId(connector.key)})`} markerEnd={connector.endMarker === "none" ? undefined : `url(#end-${safeId(connector.key)})`} className="pointer-events-none" />{connector.label && <text x={path.label.x} y={path.label.y - 8} textAnchor="middle" fill="white" fontSize="13" paintOrder="stroke" stroke="#11100d" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">{connector.label}</text>}{selectedLine && <><circle cx={anchorPoint(positions[connector.fromId], connector.fromAnchor).x} cy={anchorPoint(positions[connector.fromId], connector.fromAnchor).y} r="8" fill="#11100d" stroke="#fef08a" strokeWidth="3" onPointerDown={(event) => beginReconnect(event, connector.key, "from")} className="pointer-events-auto cursor-crosshair" /><circle cx={anchorPoint(positions[connector.toId], connector.toAnchor).x} cy={anchorPoint(positions[connector.toId], connector.toAnchor).y} r="8" fill="#11100d" stroke="#fef08a" strokeWidth="3" onPointerDown={(event) => beginReconnect(event, connector.key, "to")} className="pointer-events-auto cursor-crosshair" /><circle cx={path.midpoint.x} cy={path.midpoint.y} r="7" fill="#11100d" stroke="#fef08a" strokeWidth="3" onPointerDown={(event) => beginMid(event, connector.key)} className="pointer-events-auto cursor-move" /></>}</g> })}{dragRef.current?.kind !== "move" && cursor && dragRef.current && (() => { const drag = dragRef.current; const source = drag.kind === "create" ? positions[drag.id || ""] && anchorPoint(positions[drag.id || ""], drag.anchor || "right") : drag.kind === "reconnect" && drag.key ? (() => { const active = connectorStates.find((item) => item.key === drag.key); if (!active) return null; const side = drag.endpoint === "from" ? active.fromAnchor : active.toAnchor; const id = drag.endpoint === "from" ? active.fromId : active.toId; return anchorPoint(positions[id], side) })() : null; return source ? <line x1={source.x} y1={source.y} x2={cursor.x} y2={cursor.y} stroke="#fef08a" strokeWidth="3" strokeDasharray="7 7" /> : null })()}{selectionBox && <rect x={selectionBox.x} y={selectionBox.y} width={selectionBox.width} height={selectionBox.height} fill="var(--selection-fill)" stroke="var(--selection-border)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}</svg>{activeNotes.map((note) => { const position = positions[note.id] || { x: 10, y: 10 }; const anchors: AnchorSide[] = ["top", "bottom", "left", "right"]; const isSelected = selectedNodeIds.includes(note.id); return <div key={note.id} data-node-id={note.id} onPointerDown={(event) => beginMove(event, note)} onClick={(event) => { if (event.ctrlKey || event.metaKey) setSelectedNodeIds((current) => current.includes(note.id) ? current.filter((id) => id !== note.id) : [...current, note.id]); else setSelectedNodeIds([note.id]) }} onDoubleClick={() => onOpen(note)} className={`group absolute z-10 rounded-xl ${isSelected ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-[#10110f]" : ""}`} style={{ left: position.x, top: position.y, width: nodeWidth, touchAction: "none" }}><div className="relative"><div className={`rounded-xl border ${isSelected ? "border-blue-300 bg-blue-950/45" : "border-white/30 bg-black/65"} p-4 text-white shadow-xl backdrop-blur-md transition group-hover:border-green-200/80`}><strong className="mt-2 block line-clamp-2 text-sm leading-tight">{note.title}</strong><p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-white/55">{note.body}</p><span className="mt-3 block text-[10px] text-white/35">Duplo clique para abrir</span></div>{anchors.map((anchor) => { const style = anchor === "top" ? { left: "50%", top: -7, transform: "translateX(-50%)" } : anchor === "bottom" ? { left: "50%", bottom: -7, transform: "translateX(-50%)" } : anchor === "left" ? { left: -7, top: "50%", transform: "translateY(-50%)" } : { right: -7, top: "50%", transform: "translateY(-50%)" }; return <button key={anchor} type="button" data-anchor onPointerDown={(event) => beginCreate(event, note, anchor)} onPointerUp={() => completeDrop(note, anchor)} className="absolute grid h-4 w-4 place-items-center rounded-full border-2 border-green-200 bg-zinc-950 opacity-0 shadow-[0_0_12px_rgba(134,239,172,0.8)] transition group-hover:opacity-100 hover:scale-125" style={style} title={`Âncora ${anchor}`}><span className="sr-only">Âncora {anchor}</span></button> })}</div></div> })}</div></div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-white/35"><span>Âncoras: topo · base · esquerda · direita</span><span>Alça central: ajusta cotovelos/curvas</span><span>Clique na linha para editar</span><span>Arraste em uma área vazia para selecionar vários blocos · Ctrl/Cmd adiciona ou remove · Esc limpa</span></div></section>
}



function GroupsBoard({ groups, activeGroup, notes, selectedNoteIds, onSelectNote, onMoveNotes, onReorderGroups, onOpenGroup, onBack, onNewNote, onEdit, onDelete, onRestore, onTogglePin, onUpdateMarker, onQuickSave, onDeleteSelected, onDeleteGroup }: { groups: string[]; activeGroup: string | null; notes: Note[]; selectedNoteIds: string[]; onSelectNote: (id: string) => void; onMoveNotes: (ids: string[], group: string) => void; onReorderGroups: (groups: string[]) => void; onOpenGroup: (group: string) => void; onBack: () => void; onNewNote: () => void; onEdit: (note: Note) => void; onDelete: (id: string) => void; onRestore: (id: string) => void; onTogglePin: (id: string) => void; onUpdateMarker: (id: string, marker: string) => void; onQuickSave: (id: string, body: string) => void; onDeleteSelected: (ids: string[]) => void; onDeleteGroup: (group: string) => void }) {
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null)
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null)
  const [draggedNote, setDraggedNote] = useState<string | null>(null)
  const [noteOrder, setNoteOrder] = useState<string[]>([])
  const groupNotes = activeGroup ? notes.filter((note) => !note.deleted && note.category === activeGroup) : []
  useEffect(() => {
    const key = `wchoicss-note-order:${activeGroup}`
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]") as unknown
      const previous = Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : []
      setNoteOrder([...previous.filter((id) => groupNotes.some((note) => note.id === id)), ...groupNotes.map((note) => note.id).filter((id) => !previous.includes(id))])
    } catch { setNoteOrder(groupNotes.map((note) => note.id)) }
  }, [activeGroup, groupNotes.map((note) => note.id).join("\u0000")])
  const orderedGroupNotes = noteOrder.length ? noteOrder.map((id) => groupNotes.find((note) => note.id === id)).filter((note): note is Note => Boolean(note)) : groupNotes
  const selectedInGroup = selectedNoteIds.filter((id) => groupNotes.some((note) => note.id === id))
  const handleGroupDrop = (event: React.DragEvent<HTMLElement>, target: string) => {
    event.preventDefault()
    const movingGroup = event.dataTransfer.getData("text/group")
    const movingNote = event.dataTransfer.getData("text/note") || draggedNote
    if (movingGroup && movingGroup !== target) {
      const next = groups.filter((group) => group !== movingGroup)
      const index = Math.max(0, next.indexOf(target))
      next.splice(index, 0, movingGroup)
      onReorderGroups(next)
    } else if (movingNote) {
      const ids = selectedNoteIds.includes(movingNote) ? selectedNoteIds : [movingNote]
      onMoveNotes(ids, target)
    }
    setDraggedGroup(null); setDraggedNote(null); setDragOverGroup(null)
  }
  const handleNoteDrop = (event: React.DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault(); event.stopPropagation()
    const sourceId = event.dataTransfer.getData("text/note") || draggedNote
    if (!sourceId || sourceId === targetId) return
    const next = orderedGroupNotes.map((note) => note.id)
    const sourceIndex = next.indexOf(sourceId)
    const targetIndex = next.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    ;[next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]]
    setNoteOrder(next); localStorage.setItem(`wchoicss-note-order:${activeGroup}`, JSON.stringify(next)); setDraggedNote(null)
  }
  return <section className="mt-1 rounded-2xl border border-white/15 bg-black/25 p-3 backdrop-blur-xl transition-all duration-300 sm:p-5">
    {activeGroup ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4"><div className="flex items-center gap-3"><button type="button" onClick={onBack} className="rounded-full border border-white/20 px-3 py-2 text-xs font-bold text-white/75 transition hover:border-white/60 hover:text-white">← Voltar</button><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-300">Grupo</p><h2 className="text-2xl font-black tracking-[-0.04em] text-white">{activeGroup}</h2></div><span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-bold text-white/55">{groupNotes.length} {groupNotes.length === 1 ? "nota" : "notas"}</span></div><div className="flex items-center gap-2"><label htmlFor="wchoicss-file-upload" className="cursor-pointer rounded-full border border-green-300/45 bg-green-300/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-green-100 transition hover:bg-green-300/20">↑ Enviar arquivo</label><button type="button" onClick={onNewNote} className="rounded-full border border-green-300/45 bg-green-300/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-green-100 transition hover:bg-green-300/20">+ Adicionar nota</button><button type="button" onClick={() => onDeleteGroup(activeGroup)} className="rounded-full border border-red-300/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-red-100 transition hover:bg-red-300/10">Excluir grupo</button>{selectedInGroup.length > 0 ? <button type="button" onClick={() => onDeleteSelected(selectedInGroup)} className="rounded-full border border-red-300/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-red-100">Excluir ({selectedInGroup.length})</button> : null}</div></div> : <div className="mb-5 border-b border-white/10 pb-4"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-300">Organização</p><h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">Escolha um grupo</h2><p className="mt-1 text-sm text-white/45">Arraste os cards para reordenar. Clique em um grupo para abrir suas notas.</p></div>}
    <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {groups.map((group) => <button key={group} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData("text/group", group); event.dataTransfer.effectAllowed = "move"; setDraggedGroup(group) }} onDragEnd={() => setDraggedGroup(null)} onDragEnter={() => setDragOverGroup(group)} onDragOver={(event) => { event.preventDefault(); setDragOverGroup(group) }} onDrop={(event) => handleGroupDrop(event, group)} onClick={() => onOpenGroup(group)} className={`min-h-20 rounded-xl border p-4 text-left transition-all duration-200 ${activeGroup === group ? "border-white bg-white text-zinc-900" : "border-white/15 bg-black/25 text-white/75 hover:border-white/40 hover:bg-white/10"} ${draggedGroup === group ? "scale-95 opacity-40" : ""} ${dragOverGroup === group && draggedGroup !== group ? "ring-2 ring-green-300/70 ring-offset-2 ring-offset-transparent" : ""}`}><span className="block text-[10px] font-bold uppercase tracking-[0.14em] opacity-55">Grupo</span><span className="mt-1 block truncate text-base font-black">{group}</span><span className="mt-2 block text-[10px] font-semibold opacity-55">{notes.filter((note) => !note.deleted && note.category === group).length} notas · arraste para ordenar</span></button>)}
    </div>
    {groupNotes.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{orderedGroupNotes.map((note) => <div key={note.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleNoteDrop(event, note.id)} className={`relative transition-all duration-300 ${draggedNote && draggedNote !== note.id ? "ring-2 ring-green-300/50 ring-offset-2 ring-offset-transparent" : ""} ${selectedNoteIds.includes(note.id) ? "-translate-y-1 ring-2 ring-green-300/70 ring-offset-2 ring-offset-transparent" : ""}`}><label className="absolute right-2 top-2 z-20 flex cursor-pointer items-center gap-1 rounded-full bg-black/20 px-2 py-1 text-[9px] font-bold text-zinc-900 backdrop-blur-sm"><input type="checkbox" checked={selectedNoteIds.includes(note.id)} onChange={() => onSelectNote(note.id)} className="accent-green-600" /> selecionar</label><NoteCard note={note} notes={notes} connectionCount={0} trash={false} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} onTogglePin={onTogglePin} quickEdit={false} onQuickSave={onQuickSave} onUpdateMarker={onUpdateMarker} draggableNote onNoteDragStart={(dragged) => { setDraggedNote(dragged.id) }} onNoteDragEnd={() => setDraggedNote(null)} /></div>)}</div> : <div className="rounded-xl border border-dashed border-white/20 px-6 py-16 text-center"><p className="text-lg font-semibold text-white/80">Este grupo está vazio.</p><p className="mt-2 text-sm text-white/45">Adicione uma nota ou arraste uma nota de outro grupo para cá.</p></div>}
  </section>
}

export default function App() {
  const [settings, setSettings] = useState<ShaderSettings>(() => randomShaderSettings())
  const [panelOpen, setPanelOpen] = useState(false)
  const [headline] = useState<Phrase>(() => pickRandomPhrase())
  const [authState, setAuthState] = useState<"loading" | "logged-out" | "authenticated">("loading")
  const [user, setUser] = useState<User | null>(null)
  const [loginUsername, setLoginUsername] = useState("wchoicss")
  const [loginPassword, setLoginPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [notes, setNotes] = useState<Note[]>([])
  const notesRef = useRef<Note[]>([])
  const notesLoadedRef = useRef(false)
  const loadRequestRef = useRef(0)
  const syncTimerRef = useRef<number | null>(null)
  const pendingSyncRef = useRef<Note[] | null>(null)
  const syncedNotesRef = useRef(new Map<string, string>())
  const syncInFlightRef = useRef(false)
  const [offline, setOffline] = useState(false)
  const [syncState, setSyncState] = useState<SyncState>("idle")
  const [activeCategory, setActiveCategory] = useState("Todas")
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
  const [focusFolderId, setFocusFolderId] = useState<string | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [showConnections, setShowConnections] = useState(false)
  const [groupViewOpen, setGroupViewOpen] = useState(false)
  const [groupOrder, setGroupOrder] = useState<string[]>([])
  const [userGroups, setUserGroups] = useState<string[]>([])
  const [hiddenGroups, setHiddenGroups] = useState<string[]>([])
  const [groupCreateOpen, setGroupCreateOpen] = useState(false)
  const [groupNameDraft, setGroupNameDraft] = useState("")
  const [groupCreateError, setGroupCreateError] = useState("")
  const [draggedGroupName, setDraggedGroupName] = useState<string | null>(null)
  const [dragOverGroupName, setDragOverGroupName] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [quickEditId, setQuickEditId] = useState<string | null>(null)
  const [noteFormOpen, setNoteFormOpen] = useState(false)
  const [uploadMessage, setUploadMessage] = useState("")
  const [backupMessage, setBackupMessage] = useState("")
  const [newCategoryName, setNewCategoryName] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState({ title: "", body: "", category: "Ideias", color: noteColors[0].value, marker: "" })
  const customCategories = useMemo(() => Array.from(new Set(notes.filter((note) => !note.deleted).map((note) => note.category.trim()).filter((category) => category && !sessionTabs.some((tab) => tab.category === category)))).sort((a, b) => a.localeCompare(b, "pt-BR")), [notes])
  const displayTabs = [...sessionTabs.slice(0, -1), ...Array.from(new Set([...customCategories, ...userGroups])).map((category) => ({ label: category, category, icon: "📁" })), sessionTabs[sessionTabs.length - 1]]
  const groupNames = useMemo(() => Array.from(new Set([...sessionTabs.slice(1, -1).map((tab) => tab.category), ...customCategories, ...userGroups, ...notes.filter((note) => !note.deleted && note.category.trim()).map((note) => note.category.trim())])).filter((group) => !hiddenGroups.includes(group)), [customCategories, hiddenGroups, notes, userGroups])
  const groupNamesKey = groupNames.join("\u0000")
  useEffect(() => {
    const key = user ? `wchoicss-groups:${user.openId}` : "wchoicss-groups:local"
    try {
      const stored = JSON.parse(localStorage.getItem(`${key}:names`) || "[]") as unknown
      const hidden = JSON.parse(localStorage.getItem(`${key}:hidden`) || "[]") as unknown
      setUserGroups(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : [])
      setHiddenGroups(Array.isArray(hidden) ? hidden.filter((item): item is string => typeof item === "string") : [])
    } catch { setUserGroups([]) }
  }, [user?.openId])
  useEffect(() => {
    const key = user ? `wchoicss-groups:${user.openId}` : "wchoicss-groups:local"
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]") as unknown
      const previous = Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : []
      setGroupOrder([...previous.filter((group) => groupNames.includes(group)), ...groupNames.filter((group) => !previous.includes(group))])
    } catch { setGroupOrder(groupNames) }
  }, [user?.openId, groupNamesKey])
  const orderedGroups = groupOrder.length ? groupOrder.filter((group) => groupNames.includes(group)) : groupNames
  const navTabs = [sessionTabs[0], ...orderedGroups.map((category) => ({ label: category, category, icon: "📁" })), ...sessionTabs.slice(1, -1)]

  useEffect(() => {
    const discover = async () => {
      try {
        const result = await api<{ user: User }>("/api/auth/me")
        setUser(result.user)
        localStorage.setItem("wchoicss-last-user", JSON.stringify(result.user))
        setAuthState("authenticated")
      } catch {
        try {
          const cached = localStorage.getItem("wchoicss-last-user")
          if (cached && readCache((JSON.parse(cached) as User).openId) !== null) setOffline(true)
        } catch { /* logged out */ }
        setAuthState("logged-out")
      }
    }
    void discover()
  }, [])

  const syncNotes = async (nextNotes: Note[], activeUser = user, forceAll = false) => {
    if (syncInFlightRef.current) { pendingSyncRef.current = nextNotes; return }
    if (!activeUser || !navigator.onLine) { setSyncState("offline"); return }
    syncInFlightRef.current = true
    setSyncState("saving")
    let failed = false
    try {
      const notesToSync = forceAll ? nextNotes : nextNotes.filter((note) => syncedNotesRef.current.get(note.id) !== JSON.stringify(note))
      if (!notesToSync.length) { setSyncState("saved"); return }
      const batchSize = 8
      for (let index = 0; index < notesToSync.length; index += batchSize) {
        const batch = notesToSync.slice(index, index + batchSize)
        await Promise.all(batch.map((note) => note.deleted
          ? api(`/api/notes/${note.id}`, { method: "DELETE" })
          : api(`/api/notes/${note.id}`, { method: "PUT", body: JSON.stringify(note) })))
      }
      notesToSync.forEach((note) => syncedNotesRef.current.set(note.id, JSON.stringify(note)))
      setOffline(false)
      setSyncState("saved")
    } catch {
      failed = true
      setOffline(true)
      setSyncState("offline")
    } finally {
      syncInFlightRef.current = false
      const pending = pendingSyncRef.current
      pendingSyncRef.current = null
      if (pending && !failed && navigator.onLine) window.setTimeout(() => void syncNotes(pending), 0)
    }
  }

  const cacheAndSync = (nextNotes: Note[]) => {
    if (!user) return
    notesRef.current = nextNotes
    writeCache(user.openId, nextNotes)
    pendingSyncRef.current = nextNotes
    setSyncState("saving")
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current)
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null
      const pending = pendingSyncRef.current
      pendingSyncRef.current = null
      if (pending) void syncNotes(pending)
    }, 350)
  }

  const loadNotes = async () => {
    if (!user) return
    const loadRequest = ++loadRequestRef.current
    const cached = readCache(user.openId)
    const sanitizedCached = cached ? keepOnlyGeneralFolder(cached) : null
    if (sanitizedCached) { notesRef.current = sanitizedCached; setNotes(sanitizedCached); writeCache(user.openId, sanitizedCached) }
    try {
      const result = await api<{ notes: Note[] }>("/api/notes?includeDeleted=true")
      if (loadRequest !== loadRequestRef.current) return
      notesLoadedRef.current = true
      if (result.notes.length > 0) {
        const remoteNotes = keepOnlyGeneralFolder(result.notes)
        const remoteById = new Map(remoteNotes.map((note) => [note.id, note]))
        const mergedById = new Map(remoteNotes.map((note) => [note.id, note]))
        const locallyNewer: Note[] = []
        sanitizedCached?.forEach((localNote) => {
          const remoteNote = remoteById.get(localNote.id)
          if (!remoteNote || localNote.updatedAt > remoteNote.updatedAt) { mergedById.set(localNote.id, localNote); locallyNewer.push(localNote) }
        })
        const sanitizedNotes = keepOnlyGeneralFolder(Array.from(mergedById.values()))
        notesRef.current = sanitizedNotes
        setNotes(sanitizedNotes)
        remoteNotes.forEach((note) => syncedNotesRef.current.set(note.id, JSON.stringify(note)))
        writeCache(user.openId, sanitizedNotes)
        if (locallyNewer.length) void syncNotes(sanitizedNotes)
      } else if (sanitizedCached && sanitizedCached.length > 0) {
        // A vazio remoto nunca apaga nem substitui o cache local.
        void syncNotes(sanitizedCached, user, true)
      } else {
        // Não semear nem sincronizar notas iniciais automaticamente: uma resposta vazia
        // pode ser transitória durante uma publicação ou indisponibilidade do banco.
        notesRef.current = []
        setNotes([])
      }
    } catch {
      setOffline(true)
      if (sanitizedCached) { notesLoadedRef.current = true; notesRef.current = sanitizedCached; setNotes(sanitizedCached) }
      // Sem cache, manter o estado atual; nunca trocar dados do usuário por starterNotes.
    }
  }

  useEffect(() => {
    if (user && authState === "authenticated") void loadNotes()
  }, [authState, user])

  useEffect(() => {
    const goOnline = () => { setOffline(false); if (notesLoadedRef.current) void cacheAndSync(notesRef.current) }
    window.addEventListener("online", goOnline)
    return () => window.removeEventListener("online", goOnline)
  }, [user])

  const shaderProps = useMemo(() => settings, [settings])
  const headlineFontSize = headline.frase.length <= 70 ? "clamp(2.8rem, 7vw, 5rem)" : headline.frase.length <= 140 ? "clamp(2.4rem, 6vw, 4.5rem)" : headline.frase.length <= 220 ? "clamp(2rem, 5vw, 3.8rem)" : "clamp(1.7rem, 4.2vw, 3rem)"
  const update = (patch: Partial<ShaderSettings>) => setSettings((current) => ({ ...current, ...patch }))
  const updateColor = (key: keyof ShaderColors, value: string) => setSettings((current) => ({ ...current, colors: { ...current.colors, [key]: value } }))
  const isGeneralSession = !showTrash && activeCategory === "Todas"
  const visibleNotes = notes.filter((note) => note.deleted === showTrash).filter((note) => (note.parentId || null) === activeFolderId).filter((note) => isGeneralSession || note.category === activeCategory || (activeFolderId === null && note.category.startsWith(`${activeCategory}/`))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
  const uploadedFiles = visibleNotes.filter((note) => !note.isFolder && Boolean(note.attachments?.length))
  const workspaceNotes = useMemo(() => {
    const muralNotes = visibleNotes.filter((note) => !note.attachments?.length)
    if (activeFolderId) return muralNotes
    const shownFolderIds = new Set(muralNotes.filter((note) => note.isFolder).map((note) => note.id))
    let changed = true
    while (changed) {
      changed = false
      notes.filter((note) => note.isFolder && note.parentId && !shownFolderIds.has(note.id)).forEach((note) => {
        if (shownFolderIds.has(note.parentId as string)) { shownFolderIds.add(note.id); changed = true }
      })
    }
    return [...muralNotes, ...notes.filter((note) => note.isFolder && shownFolderIds.has(note.id) && !muralNotes.some((visible) => visible.id === note.id))]
  }, [activeFolderId, notes, visibleNotes])
  const activeNotes = useMemo(() => notes.filter((note) => !note.deleted), [notes])
  const connections = useMemo(() => makeConnections(notes), [notes])
  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const connection of connections) {
      counts.set(connection.from.id, (counts.get(connection.from.id) || 0) + 1)
      counts.set(connection.to.id, (counts.get(connection.to.id) || 0) + 1)
    }
    return counts
  }, [connections])

  const reorderGroups = (nextGroups: string[]) => {
    setGroupOrder(nextGroups)
    const key = user ? `wchoicss-groups:${user.openId}` : "wchoicss-groups:local"
    localStorage.setItem(key, JSON.stringify(nextGroups))
  }
  const openGroup = (group: string) => { setActiveCategory(group); setActiveFolderId(null); setShowTrash(false); setShowConnections(false); setGroupViewOpen(false) }
  const createGroup = () => { setGroupNameDraft(""); setGroupCreateError(""); setGroupCreateOpen(true) }
  const saveNewGroup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = groupNameDraft.trim().replace(/\s+/g, " ")
    if (!name) { setGroupCreateError("Digite um nome para o grupo."); return }
    if (name.length > 60) { setGroupCreateError("Use no máximo 60 caracteres."); return }
    if (name === "Todas" || name === "Lixeira" || groupNames.includes(name)) { setGroupCreateError("Esse nome já está em uso."); return }
    const nextGroups = [...userGroups, name]
    const key = user ? `wchoicss-groups:${user.openId}` : "wchoicss-groups:local"
    setUserGroups(nextGroups); localStorage.setItem(`${key}:names`, JSON.stringify(nextGroups))
    setGroupOrder((current) => { const next = [...current, name]; localStorage.setItem(key, JSON.stringify(next)); return next })
    setGroupCreateOpen(false); openGroup(name)
  }
  const moveNotesToGroup = (ids: string[], group: string) => {
    if (!ids.length) return
    const selected = new Set(ids)
    const next = notesRef.current.map((note) => selected.has(note.id) ? { ...note, category: group, parentId: null, updatedAt: Date.now() } : note)
    setNotes(next); notesRef.current = next; setActiveCategory(group); void cacheAndSync(next)
  }
  const toggleGroupNoteSelection = (id: string) => setSelectedNoteIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const openNewNoteForm = () => {
    const category = activeCategory === "Todas" || activeCategory === "Lixeira" ? orderedGroups[0] || "Ideias" : activeCategory
    setEditingNote(null); setNewCategoryName(""); setDraft({ title: "", body: "", category, color: noteColors[notesRef.current.length % noteColors.length].value, marker: "" }); setNoteFormOpen(true)
  }
  const openFolder = (note: Note) => {
    if (!note.isFolder) return
    setFocusFolderId(note.id)
    window.setTimeout(() => { setActiveFolderId(note.id); setFocusFolderId(null) }, 700)
  }
  const makeFolder = (note: Note) => {
    const now = Date.now()
    const index = notes.findIndex((item) => item.id === note.id)
    const parentX = note.positionX ?? 30 + (index % 3) * 390
    const parentY = note.positionY ?? 30 + Math.floor(index / 3) * 280
    const clone: Note = { ...note, id: crypto.randomUUID(), parentId: note.id, isFolder: true, positionX: parentX + 380, positionY: parentY, createdAt: now, updatedAt: now, deleted: false }
    const next = notes.map((item) => item.id === note.id ? { ...item, isFolder: true, updatedAt: now } : item)
    next.unshift(clone)
    setNotes(next); notesRef.current = next; void cacheAndSync(next)
  }

  const updateNoteMarker = (id: string, marker: string) => { void updateNote(id, { marker: marker.trim().slice(0, 80) || null }) }
  const updateNote = async (id: string, patch: Partial<Note>) => {
    const next = notesRef.current.map((note) => note.id === id ? { ...note, ...patch, updatedAt: Date.now() } : note)
    setNotes(next); notesRef.current = next; void cacheAndSync(next)
  }
  const deleteNote = async (id: string) => {
    const current = notesRef.current
    const target = current.find((note) => note.id === id)
    if (!target) return
    const now = Date.now()
    const next = current.map((note) => {
      if (note.id === id) return { ...note, deleted: true, updatedAt: now }
      if (target.isFolder && note.parentId === id) return { ...note, parentId: target.parentId ?? null, updatedAt: now }
      return note
    })
    if (activeFolderId === id) setActiveFolderId(target.parentId ?? null)
    setNotes(next); notesRef.current = next; void cacheAndSync(next)
  }
  const deleteSelectedNotes = (ids: string[]) => {
    if (!ids.length) return
    const selected = new Set(ids); const now = Date.now()
    const next = notesRef.current.map((note) => selected.has(note.id) ? { ...note, deleted: true, updatedAt: now } : note)
    setNotes(next); notesRef.current = next; void cacheAndSync(next)
  }
  const deleteCategory = (category: string) => {
    if (!groupNames.includes(category)) return
    if (!window.confirm(`Apagar a categoria "${category}" e todas as notas vinculadas? Elas irão para a lixeira.`)) return
    const now = Date.now()
    const next = notesRef.current.map((note) => note.category === category ? { ...note, deleted: true, updatedAt: now } : note)
    const isDefault = sessionTabs.some((tab) => tab.category === category)
    const key = user ? `wchoicss-groups:${user.openId}` : "wchoicss-groups:local"
    if (isDefault) {
      const nextHidden = [...hiddenGroups, category]
      setHiddenGroups(nextHidden); localStorage.setItem(`${key}:hidden`, JSON.stringify(nextHidden))
    } else {
      const nextUserGroups = userGroups.filter((group) => group !== category)
      setUserGroups(nextUserGroups); localStorage.setItem(`${key}:names`, JSON.stringify(nextUserGroups))
    }
    setGroupOrder((current) => { const nextOrder = current.filter((group) => group !== category); localStorage.setItem(key, JSON.stringify(nextOrder)); return nextOrder })
    if (activeCategory === category) setActiveCategory("Todas")
    setNotes(next); notesRef.current = next; void cacheAndSync(next)
  }
  const connectNotes = (from: Note, to: Note) => {
    if (from.id === to.id || linkedTitles(from.body).some((title) => noteKey(title) === noteKey(to.title))) return
    const next = notes.map((note) => note.id === from.id ? { ...note, body: `${note.body.trimEnd()}${note.body.trim() ? "\n\n" : ""}[[${to.title}]]`, updatedAt: Date.now() } : note)
    setNotes(next); notesRef.current = next; void cacheAndSync(next)
  }
  const disconnectNotes = (from: Note, to: Note) => {
    const escapedTitle = to.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const marker = new RegExp(`\\[\\[${escapedTitle}\\]\\]`, "gi")
    const next = notes.map((note) => note.id === from.id ? { ...note, body: note.body.replace(marker, "").replace(/\n{3,}/g, "\n\n").trim(), updatedAt: Date.now() } : note)
    setNotes(next); notesRef.current = next; void cacheAndSync(next)
  }
  const reconnectNotes = (connection: Connection, endpoint: "from" | "to", target: Note) => {
    if (target.id === connection.from.id || target.id === connection.to.id) return
    const escapeTitle = (title: string) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const oldMarker = new RegExp(`\\[\\[${escapeTitle(connection.to.title)}\\]\\]`, "gi")
    const next = notes.map((note) => {
      if (endpoint === "to" && note.id === connection.from.id) return { ...note, body: `${note.body.replace(oldMarker, "").replace(/\n{3,}/g, "\n\n").trim()}${note.body.trim() ? "\n\n" : ""}[[${target.title}]]`, updatedAt: Date.now() }
      if (endpoint === "from" && note.id === connection.from.id) return { ...note, body: note.body.replace(oldMarker, "").replace(/\n{3,}/g, "\n\n").trim(), updatedAt: Date.now() }
      if (endpoint === "from" && note.id === target.id) return { ...note, body: `${note.body.trimEnd()}${note.body.trim() ? "\n\n" : ""}[[${connection.to.title}]]`, updatedAt: Date.now() }
      return note
    })
    setNotes(next); notesRef.current = next; void cacheAndSync(next)
  }
  const openNewNote = () => {
    const now = Date.now()
    const category = activeCategory === "Todas" || activeCategory === "Lixeira" ? "Ideias" : activeCategory
    const index = notesRef.current.length
    const note: Note = { id: crypto.randomUUID(), title: "Nova nota", body: "", category, color: noteColors[index % noteColors.length].value, pinned: false, createdAt: now, updatedAt: now, parentId: activeFolderId, isFolder: false, positionX: 30 + (index % 3) * 390, positionY: 30 + Math.floor(index / 3) * 280, deleted: false }
    const next = [note, ...notesRef.current]
    setNotes(next); notesRef.current = next; setQuickEditId(note.id); void cacheAndSync(next)
  }
  const saveQuickNote = (id: string, body: string) => {
    const next = notesRef.current.map((note) => note.id === id ? { ...note, body, updatedAt: Date.now() } : note)
    setNotes(next); notesRef.current = next; setQuickEditId(null); void cacheAndSync(next)
  }
  const openEditNote = (note: Note) => { setEditingNote(note); setNewCategoryName(""); setDraft({ title: note.title, body: note.body, category: note.category, color: note.color, marker: note.marker || "" }); setNoteFormOpen(true) }
  const createCategory = () => { const category = newCategoryName.trim().replace(/\s+/g, " "); if (!category || category.length > 60 || category === "Todas" || category === "Lixeira") return; setDraft((current) => ({ ...current, category })); setNewCategoryName("") }

  const saveNote = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.title.trim() || !draft.body.trim()) return
    const now = Date.now()
    const parent = activeFolderId ? notes.find((note) => note.id === activeFolderId) : null
    const next = editingNote ? notes.map((note) => note.id === editingNote.id ? { ...note, ...draft, title: draft.title.trim(), body: draft.body.trim(), updatedAt: now } : note) : [{ ...draft, id: crypto.randomUUID(), title: draft.title.trim(), body: draft.body.trim(), parentId: activeFolderId, isFolder: false, positionX: parent?.positionX == null ? undefined : parent.positionX + 380, positionY: parent?.positionY ?? undefined, pinned: false, createdAt: now, updatedAt: now, deleted: false }, ...notes]
    setNotes(next); notesRef.current = next; void cacheAndSync(next); setNoteFormOpen(false)
  }
  const exportBackup = () => { if (!user) return; const notesToExport = readCache(user.openId) || notesRef.current; const blob = new Blob([JSON.stringify({ version: 1, app: "Wchoicss Notes", exportedAt: new Date().toISOString(), notes: notesToExport }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "wchoicss-notes-backup.json"; link.click(); URL.revokeObjectURL(url) }
  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setUploadMessage(`Enviando ${files.length} arquivo${files.length === 1 ? "" : "s"}...`)
    const defaultCategory = activeCategory === "Todas" || showTrash ? "Ideias" : activeCategory
    const imported: Note[] = []
    const failures: string[] = []
    for (const file of files) {
      try {
        const isNoteJson = file.type === "application/json" || file.name.toLowerCase().endsWith(".json")
        if (isNoteJson) {
          const payload = JSON.parse(await file.text()) as { notes?: Array<Record<string, unknown>> } | Record<string, unknown>
          const candidates = Array.isArray((payload as { notes?: unknown }).notes) ? (payload as { notes: Array<Record<string, unknown>> }).notes : [payload as Record<string, unknown>]
          if (!candidates.length) throw new Error("o JSON não contém notas")
          candidates.forEach((candidate, index) => {
            const title = typeof candidate.title === "string" ? candidate.title.trim() : ""
            const body = typeof candidate.body === "string" ? candidate.body.trim() : ""
            if (!title || !body) throw new Error(`a nota ${index + 1} precisa de title e body`)
            const color = typeof candidate.color === "string" && /^#[0-9a-f]{6}$/i.test(candidate.color) ? candidate.color : noteColors[(imported.length + index) % noteColors.length].value
            const marker = typeof candidate.marker === "string" ? candidate.marker.trim().slice(0, 80) : undefined
            imported.push({ id: crypto.randomUUID(), title, body, category: activeCategory !== "Todas" && !showTrash ? defaultCategory : (typeof candidate.category === "string" && candidate.category.trim() ? candidate.category.trim() : defaultCategory), color, marker, pinned: candidate.pinned === true, createdAt: Date.now() + imported.length, updatedAt: Date.now() + imported.length, parentId: activeFolderId, isFolder: false, deleted: false })
          })
          continue
        }
        const uploaded = await api<{ attachment: Attachment }>("/api/files", { method: "POST", headers: { "content-type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name) }, body: file })
        const now = Date.now() + imported.length
        imported.push({ id: crypto.randomUUID(), title: file.name, body: `Arquivo anexado: ${file.name}\n\nO formato original foi preservado. Abra o anexo para visualizar ou baixar o arquivo.`, category: defaultCategory, color: noteColors[imported.length % noteColors.length].value, pinned: false, createdAt: now, updatedAt: now, attachments: [uploaded.attachment], deleted: false })
      } catch (error) { failures.push(`${file.name}: ${error instanceof Error ? error.message : "falha no upload"}`) }
    }
    if (imported.length) {
      const next = [...imported, ...notes]
      setNotes(next); notesRef.current = next; writeCache(user?.openId || "local", next)
      if (syncTimerRef.current !== null) { window.clearTimeout(syncTimerRef.current); syncTimerRef.current = null }
      pendingSyncRef.current = null
      await syncNotes(next)
    }
    setUploadMessage(imported.length && !failures.length ? `${imported.length} arquivo${imported.length === 1 ? "" : "s"} enviado${imported.length === 1 ? "" : "s"} e salvo${imported.length === 1 ? "" : "s"}.` : failures.length ? `Não foi possível enviar: ${failures.join("; ")}` : "Nenhum arquivo foi enviado.")
    event.target.value = ""
  }
  const downloadBackup = () => {
    const storagePrefix = user ? `wchoicss-groups:${user.openId}` : "wchoicss-groups:local"
    const noteOrders = Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith("wchoicss-note-order:")).map((key) => [key, localStorage.getItem(key)]))
    const connectorsKey = `wchoicss-connectors:${user?.openId || "local"}`
    const backup = {
      format: "wchoicss-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      notes,
      settings,
      activeCategory,
      groups: {
        names: localStorage.getItem(`${storagePrefix}:names`),
        hidden: localStorage.getItem(`${storagePrefix}:hidden`),
        order: localStorage.getItem(storagePrefix),
        noteOrders,
        connectors: localStorage.getItem(connectorsKey),
      },
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url; anchor.download = `wchoicss-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url)
    setBackupMessage("Backup baixado.")
  }
  const restoreBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setBackupMessage("")
    setUploadMessage("")
    if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json" && file.type !== "text/json") { setBackupMessage("Selecione um arquivo .json para restaurar o backup."); return }
    try {
      const payload = JSON.parse(await file.text()) as { format?: string; version?: number; notes?: unknown; settings?: Partial<ShaderSettings>; activeCategory?: string; groups?: { names?: string | null; hidden?: string | null; order?: string | null; noteOrders?: Record<string, string | null>; connectors?: string | null } }
      const isFullBackup = payload.format === "wchoicss-backup" && payload.version === 1
      const isTemplateNotes = payload.format === "wchoicss-note" && payload.version === 1
      if ((!isFullBackup && !isTemplateNotes) || !Array.isArray(payload.notes)) throw new Error("use o formato do template: format wchoicss-note, version 1 e notes")
      if (!window.confirm("Restaurar este backup substituirá as notas e a organização atuais. Continuar?")) return
      const restoredNotes = payload.notes.map((item, index): Note => {
        if (!item || typeof item !== "object") throw new Error(`a nota ${index + 1} é inválida`)
        const note = item as Partial<Note>
        if (typeof note.title !== "string" || typeof note.body !== "string" || typeof note.category !== "string") throw new Error(`a nota ${index + 1} é inválida`)
        const originalId = typeof note.id === "string" && /^[0-9a-f-]{20,80}$/i.test(note.id) ? note.id : crypto.randomUUID()
        return { ...note, id: originalId, title: note.title, body: note.body, category: note.category, color: typeof note.color === "string" && /^#[0-9a-f]{6}$/i.test(note.color) ? note.color : noteColors[index % noteColors.length].value, pinned: note.pinned === true, createdAt: typeof note.createdAt === "number" && Number.isSafeInteger(note.createdAt) ? note.createdAt : Date.now() + index, updatedAt: typeof note.updatedAt === "number" && Number.isSafeInteger(note.updatedAt) ? note.updatedAt : Date.now() + index, deleted: note.deleted === true }
      })
      const storagePrefix = user ? `wchoicss-groups:${user.openId}` : "wchoicss-groups:local"
      const groups = payload.groups || {}
      if (isFullBackup) {
        if (groups.names !== undefined && groups.names !== null) localStorage.setItem(`${storagePrefix}:names`, groups.names)
        if (groups.hidden !== undefined && groups.hidden !== null) localStorage.setItem(`${storagePrefix}:hidden`, groups.hidden)
        if (groups.order !== undefined && groups.order !== null) localStorage.setItem(storagePrefix, groups.order)
        Object.entries(groups.noteOrders || {}).forEach(([key, value]) => { if (typeof value === "string") localStorage.setItem(key, value) })
        if (groups.connectors !== undefined && groups.connectors !== null) localStorage.setItem(`wchoicss-connectors:${user?.openId || "local"}`, groups.connectors)
        if (payload.settings && payload.settings.colors && Number.isFinite(payload.settings.xScale) && Number.isFinite(payload.settings.yScale) && Number.isFinite(payload.settings.distortion) && Number.isFinite(payload.settings.speed)) setSettings(payload.settings as ShaderSettings)
        if (groups.names) setUserGroups(JSON.parse(groups.names))
        if (groups.hidden) setHiddenGroups(JSON.parse(groups.hidden))
        if (groups.order) setGroupOrder(JSON.parse(groups.order))
        if (typeof payload.activeCategory === "string") setActiveCategory(payload.activeCategory)
      }
      setNotes(restoredNotes); notesRef.current = restoredNotes; writeCache(user?.openId || "local", restoredNotes); syncedNotesRef.current.clear()
      await syncNotes(restoredNotes, user, true)
      setBackupMessage(isFullBackup ? "Backup completo restaurado e salvo." : "Notas do template restauradas e salvas.")
    } catch (error) { setBackupMessage(error instanceof Error ? `Não foi possível restaurar: ${error.message}` : "Não foi possível restaurar o backup.") }
  }
  const lockNotes = () => { setNotes([]); notesRef.current = []; setShowTrash(false); setShowConnections(false); setAuthState("logged-out") }
  const login = async (event: FormEvent) => {
    event.preventDefault()
    setLoginError("")
    try {
      const result = await api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username: loginUsername, password: loginPassword }) })
      setUser(result.user)
      localStorage.setItem("wchoicss-last-user", JSON.stringify(result.user))
      setLoginPassword("")
      setAuthState("authenticated")
    } catch {
      try {
        const cachedUser = JSON.parse(localStorage.getItem("wchoicss-last-user") || "null") as User | null
        if (cachedUser && cachedUser.username === loginUsername.trim().toLowerCase() && readCache(cachedUser.openId)) {
          setUser(cachedUser)
          setLoginPassword("")
          setOffline(true)
          setAuthState("authenticated")
          return
        }
      } catch { /* credenciais offline indisponíveis */ }
      setLoginError("Usuário ou senha inválidos.")
    }
  }
  const signOut = async () => { try { await api("/api/auth/logout", { method: "POST" }) } finally { lockNotes(); setUser(null); setAuthState("logged-out") } }

  const shell = (children: ReactNode) => <div className="relative isolate min-h-screen overflow-x-visible bg-[#11100d] text-white"><WebGLShader {...shaderProps} /><div className="pointer-events-none fixed inset-0 bg-[linear-gradient(115deg,rgba(0,0,0,0.88),rgba(0,0,0,0.62)_48%,rgba(0,0,0,0.84))]" /><div className="pointer-events-none fixed inset-0 opacity-[0.12] [background-image:radial-gradient(rgba(255,255,255,0.7)_0.7px,transparent_0.7px)] [background-size:7px_7px]" />{children}</div>

  if (authState === "loading") return shell(<div className="relative z-10 flex min-h-screen items-center justify-center text-sm text-white/60">Abrindo seu espaço seguro...</div>)
  if (authState === "logged-out") return shell(<><header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7"><div className="text-[11px] font-bold tracking-[0.24em] text-white/90">Wchoicss Notes</div><span className="text-[10px] uppercase tracking-[0.18em] text-white/45">Notas pessoais</span></header><main className="relative z-10 mx-auto flex min-h-[calc(100vh-100px)] max-w-3xl items-center justify-center px-5 pb-20"><section className="w-full border border-white/15 bg-black/35 p-2 backdrop-blur-xl"><form onSubmit={login} className="border border-white/15 px-6 py-12 text-center sm:px-12"><h1 className="text-5xl font-black leading-[0.9] tracking-[-0.075em] sm:text-7xl">Wchoicss<br /><span className="text-white/45">Notes.</span></h1><p className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-white/60">Entre com seu usuário e senha para acessar suas notas e manter tudo sincronizado com segurança.</p><div className="mx-auto mt-8 grid max-w-sm gap-3"><input required autoComplete="username" value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} placeholder="Usuário" className="w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-green-300" /><input required autoComplete="current-password" type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Senha" className="w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-green-300" />{loginError && <p className="text-left text-xs text-red-300">{loginError}</p>}<LiquidButton size="xl" type="submit">Entrar</LiquidButton></div><p className="mx-auto mt-6 max-w-md text-xs leading-relaxed text-white/35">Sua senha não é salva no navegador. Ela apenas abre suas notas localmente, enquanto o servidor mantém somente um hash de login.</p></form></section></main></>)

  return shell(<><header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7"><div><div className="text-[11px] font-bold tracking-[0.24em] text-white/90">Wchoicss Notes</div></div><div className="flex items-center gap-3"><span className={`hidden text-[10px] font-medium tracking-[0.12em] sm:block ${syncState === "saving" ? "text-amber-300" : "text-green-300"}`}>{syncState === "saving" ? "SALVANDO..." : "SALVO"}</span><button type="button" onClick={lockNotes} className="rounded-full border border-white/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65 hover:border-white/50 hover:text-white">Bloquear</button><button type="button" onClick={signOut} className="hidden text-xs text-white/45 hover:text-white sm:block">Sair</button></div></header><main className="relative z-10 mx-auto max-w-7xl px-5 pb-20 sm:px-8"><section className="mb-8 flex flex-col gap-6 border-b border-white/15 pb-8"><div><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-green-300">CADERNO DE WCHOICSS</p><div className="max-h-56 max-w-3xl overflow-hidden sm:max-h-64"><h1 className="font-black leading-[0.9] tracking-[-0.075em] text-white" style={{ fontSize: headlineFontSize }}>{headline.frase}<br /><span className="text-white/45">— {headline.autor}</span></h1></div></div><div className="flex w-full flex-wrap items-center justify-between gap-3"><LiquidButton size="xl" onClick={openNewNote}>+ Nova nota do Wchoicss</LiquidButton><label htmlFor="wchoicss-file-upload" aria-label="Enviar arquivo" title="Enviar arquivo" className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-full border border-green-300/50 bg-green-300/10 px-4 text-xs font-bold uppercase tracking-[0.12em] text-green-100 transition hover:border-green-200 hover:bg-green-300/20"><span className="text-lg leading-none">↑</span> Enviar arquivo</label><a href="/prompt-template-ia-wchoicss.txt" download="prompt-template-ia-wchoicss.txt" className="inline-flex h-12 items-center rounded-full border border-white/15 px-4 text-[10px] font-bold uppercase tracking-[0.1em] text-white/60 transition hover:border-white/40 hover:text-white">Template IA</a><button type="button" onClick={downloadBackup} className="inline-flex h-12 items-center rounded-full border border-blue-300/45 bg-blue-300/10 px-4 text-xs font-bold uppercase tracking-[0.1em] text-blue-100 transition hover:bg-blue-300/20">↓ Baixar backup</button><label htmlFor="wchoicss-backup-upload" className="inline-flex h-12 cursor-pointer items-center rounded-full border border-purple-300/45 bg-purple-300/10 px-4 text-xs font-bold uppercase tracking-[0.1em] text-purple-100 transition hover:bg-purple-300/20">↑ Restaurar backup</label><input id="wchoicss-backup-upload" ref={backupInputRef} type="file" accept=".json,application/json,text/json" className="sr-only" onChange={restoreBackup} /><input id="wchoicss-file-upload" ref={fileInputRef} type="file" accept=".json,application/json,image/*,.html,.htm,text/html,*/*" multiple className="sr-only" onChange={importFiles} /></div>{(uploadMessage || backupMessage) && <p role="status" className={`mt-3 text-xs ${(uploadMessage || backupMessage).startsWith("Não foi") ? "text-red-200" : "text-green-200"}`}>{backupMessage || uploadMessage}</p>}</section><section className="flex flex-col gap-4 rounded-2xl border border-white/15 bg-black/30 p-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between"><nav aria-label="Sessões de notas" className="note-block-no-scroll flex max-w-full gap-1 overflow-x-auto pb-1 sm:pb-0">{navTabs.map((tab) => { const selected = tab.category === "Lixeira" ? showTrash : !showTrash && activeCategory === tab.category; return <span key={tab.label} draggable={tab.category !== "Todas" && tab.category !== "Lixeira"} onDragStart={(event) => { if (tab.category === "Todas" || tab.category === "Lixeira") return; event.dataTransfer.setData("text/group", tab.category); event.dataTransfer.effectAllowed = "move"; setDraggedGroupName(tab.category) }} onDragEnd={() => { setDraggedGroupName(null); setDragOverGroupName(null) }} onDragOver={(event) => { if (tab.category !== "Todas" && tab.category !== "Lixeira") { event.preventDefault(); setDragOverGroupName(tab.category) } }} onDrop={(event) => { event.preventDefault(); const moving = event.dataTransfer.getData("text/group"); const movingNote = event.dataTransfer.getData("text/note"); if (movingNote && tab.category !== "Todas" && tab.category !== "Lixeira") { moveNotesToGroup(selectedNoteIds.includes(movingNote) ? selectedNoteIds : [movingNote], tab.category) } else if (moving && moving !== tab.category && tab.category !== "Todas" && tab.category !== "Lixeira") { const next = orderedGroups.filter((group) => group !== moving); next.splice(Math.max(0, next.indexOf(tab.category)), 0, moving); reorderGroups(next) } setDraggedGroupName(null); setDragOverGroupName(null) }} className={`inline-flex shrink-0 items-center rounded-full transition-all ${draggedGroupName === tab.category ? "scale-95 opacity-40" : ""} ${dragOverGroupName === tab.category && draggedGroupName !== tab.category ? "ring-2 ring-green-300/70 ring-offset-2 ring-offset-transparent" : ""}`}><button type="button" onClick={() => { setActiveCategory(tab.category === "Lixeira" ? "Todas" : tab.category); setActiveFolderId(null); setShowTrash(tab.category === "Lixeira"); setShowConnections(false); setGroupViewOpen(false) }} className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] transition ${selected ? "bg-white text-zinc-900" : "text-white/50 hover:bg-white/10 hover:text-white"}`}><span aria-hidden="true" className="text-sm leading-none">{tab.icon}</span>{tab.label}</button></span> })}</nav><button type="button" onClick={createGroup} className="shrink-0 rounded-full border border-green-300/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-green-200 transition hover:bg-green-300/10">＋ Novo grupo</button>{visibleNotes.length > 0 ? <button type="button" onClick={() => setSelectedNoteIds((current) => visibleNotes.every((note) => current.includes(note.id)) ? current.filter((id) => !visibleNotes.some((note) => note.id === id)) : Array.from(new Set([...current, ...visibleNotes.map((note) => note.id)])))} className="shrink-0 rounded-full border border-blue-300/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-blue-100 transition hover:bg-blue-300/10">{visibleNotes.every((note) => selectedNoteIds.includes(note.id)) ? "Desmarcar todas" : "Selecionar todas"}</button> : null}{selectedNoteIds.length > 0 ? <button type="button" onClick={() => deleteSelectedNotes(selectedNoteIds)} className="shrink-0 rounded-lg border border-red-300/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-red-100 transition hover:bg-red-400/20">Excluir selecionada{selectedNoteIds.length === 1 ? "" : "s"} ({selectedNoteIds.length})</button> : null}</section>{showConnections ? <ConnectionsMap notes={notes} connections={connections} onOpen={openEditNote} onConnect={connectNotes} onReconnect={reconnectNotes} storageKey={user?.openId || "local"} /> : !showTrash ? <GroupsBoard groups={orderedGroups} activeGroup={activeCategory === "Todas" ? null : activeCategory} notes={notes} selectedNoteIds={selectedNoteIds} onSelectNote={toggleGroupNoteSelection} onMoveNotes={moveNotesToGroup} onReorderGroups={reorderGroups} onOpenGroup={openGroup} onBack={() => setActiveCategory("Todas")} onNewNote={openNewNoteForm} onEdit={openEditNote} onDelete={(id) => void deleteNote(id)} onRestore={(id) => void updateNote(id, { deleted: false })} onTogglePin={(id) => void updateNote(id, { pinned: !notes.find((item) => item.id === id)?.pinned })} onUpdateMarker={updateNoteMarker} onQuickSave={saveQuickNote} onDeleteSelected={deleteSelectedNotes} onDeleteGroup={deleteCategory} /> : (workspaceNotes.length > 0 || activeFolderId || uploadedFiles.length) ? <>{showTrash ? <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visibleNotes.map((note) => <NoteCard key={note.id} note={note} notes={notes} connectionCount={connectionCounts.get(note.id) || 0} trash onEdit={openEditNote} onDelete={(id) => void deleteNote(id)} onRestore={(id) => void updateNote(id, { deleted: false })} onTogglePin={(id) => void updateNote(id, { pinned: !note.pinned })} />)}</section> : workspaceNotes.length > 0 || activeFolderId ? <MuralBoard notes={workspaceNotes} connectionCounts={connectionCounts} onEdit={openEditNote} onDelete={(id) => void deleteNote(id)} onTogglePin={(id) => void updateNote(id, { pinned: !notes.find((item) => item.id === id)?.pinned })} onMove={(id, x, y) => void updateNote(id, { positionX: x, positionY: y })} onOpenFolder={openFolder} onMakeFolder={makeFolder} focusFolderId={focusFolderId} quickEditId={quickEditId} onQuickSave={saveQuickNote} onUpdateMarker={updateNoteMarker} onMoveNotesToGroup={moveNotesToGroup} onDeleteSelected={deleteSelectedNotes} onSelectionChange={setSelectedNoteIds} /> : null}</> : <section className="rounded-2xl border border-dashed border-white/20 px-6 py-20 text-center"><p className="text-lg font-semibold">{showTrash ? "A lixeira está vazia." : "Nenhuma nota encontrada."}</p><p className="mt-2 text-sm text-white/50">{showTrash ? "Notas apagadas ficam aqui para você restaurar." : "Crie uma nova nota ou tente outra busca."}</p></section>}</main>{panelOpen && <aside className="fixed bottom-16 left-5 z-20 w-[min(22rem,calc(100vw-2.5rem))] border border-white/20 bg-zinc-950/85 p-4 shadow-2xl backdrop-blur-xl sm:bottom-20"><div className="mb-4 flex items-start justify-between border-b border-white/10 pb-3"><div><h2 className="text-sm font-semibold">Atmosfera do caderno</h2><p className="mt-1 text-xs text-white/45">O shader fica atrás das suas notas.</p></div><button type="button" onClick={() => setSettings(defaults)} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55 hover:text-white">Resetar</button></div><div className="grid gap-3 border-b border-white/10 pb-4"><ColorControl label="Red" value={settings.colors.red} onChange={(value) => updateColor("red", value)} /><ColorControl label="Green" value={settings.colors.green} onChange={(value) => updateColor("green", value)} /><ColorControl label="Blue" value={settings.colors.blue} onChange={(value) => updateColor("blue", value)} /></div><div className="mt-4 grid gap-4"><RangeControl label="Escala X" value={settings.xScale} min={0.2} max={4} step={0.05} onChange={(xScale) => update({ xScale })} /><RangeControl label="Escala Y" value={settings.yScale} min={0.05} max={1.5} step={0.025} onChange={(yScale) => update({ yScale })} /><RangeControl label="Distorção" value={settings.distortion} min={0} max={0.3} step={0.005} onChange={(distortion) => update({ distortion })} /><RangeControl label="Velocidade" value={settings.speed} min={0.001} max={0.05} step={0.001} onChange={(speed) => update({ speed })} /></div></aside>}{groupCreateOpen ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"><form onSubmit={saveNewGroup} className="w-full max-w-md rounded-2xl border border-white/20 bg-[#171613] p-6 shadow-2xl shadow-black/50"><div className="mb-6 flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-green-300">Novo grupo</p><h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Organize suas notas</h2><p className="mt-2 text-sm text-white/45">Dê um nome para o novo espaço.</p></div><button type="button" onClick={() => setGroupCreateOpen(false)} className="text-2xl leading-none text-white/40 transition hover:text-white" aria-label="Fechar">×</button></div><label className="grid gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Nome do grupo</span><input autoFocus value={groupNameDraft} onChange={(event) => { setGroupNameDraft(event.target.value); setGroupCreateError("") }} maxLength={60} placeholder="Ex.: Referências" className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-base text-white outline-none transition placeholder:text-white/25 focus:border-green-300/70 focus:bg-white/[0.07]" />{groupCreateError ? <span className="text-xs text-red-200">{groupCreateError}</span> : null}</label><div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setGroupCreateOpen(false)} className="rounded-full px-4 py-3 text-xs font-bold text-white/55 transition hover:text-white">Cancelar</button><button type="submit" className="rounded-full border border-green-200/60 bg-green-300 px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-zinc-900 transition hover:bg-green-200">Criar grupo</button></div></form></div> : null}{noteFormOpen && <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"><form onSubmit={saveNote} className="w-full max-w-lg rounded-2xl border border-white/20 bg-[#171613] p-5 shadow-2xl sm:p-7"><div className="mb-6 flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-green-300">{editingNote ? "Editar nota" : "Nova nota"}</p><h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">O que você quer guardar?</h2></div><button type="button" onClick={() => setNoteFormOpen(false)} className="text-2xl leading-none text-white/45 hover:text-white" aria-label="Fechar">×</button></div><div className="grid gap-4"><input value={draft.marker} onChange={(event) => setDraft({ ...draft, marker: event.target.value })} maxLength={80} placeholder="Número ou texto no canto (opcional)" className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white outline-none placeholder:text-white/35 focus:border-green-300" /><input autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Título da nota" className="border-b border-white/20 bg-transparent py-3 text-xl font-bold text-white outline-none placeholder:text-white/30 focus:border-green-300" /><textarea required value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="Escreva uma ideia, referência ou lembrete..." rows={5} className="resize-none rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-relaxed text-white outline-none placeholder:text-white/30 focus:border-white/35" /><div className="grid min-w-0 gap-4"><label className="grid min-w-0 gap-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/45">Categoria da sessão<select required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-3 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-white/35">{displayTabs.filter((tab) => tab.category !== "Todas" && tab.category !== "Lixeira").map((tab) => <option key={tab.category} value={tab.category}>{tab.icon} {tab.label}</option>)}{draft.category && !displayTabs.some((tab) => tab.category === draft.category) && <option value={draft.category}>{draft.category} (atual)</option>}</select>{customCategories.includes(draft.category) ? <button type="button" onClick={() => deleteCategory(draft.category)} className="mt-2 w-full rounded-lg border border-red-300/35 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-red-200 hover:bg-red-300/10">Excluir categoria “{draft.category}” e notas vinculadas</button> : null}<div className="mt-2 flex min-w-0 flex-wrap gap-2"><input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Nome da nova categoria" maxLength={60} className="min-w-[8rem] flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-normal normal-case tracking-normal text-white outline-none placeholder:text-white/30 focus:border-green-300" /><button type="button" onClick={createCategory} className="shrink-0 rounded-lg border border-green-300/40 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-green-200 hover:bg-green-300/10">Adicionar</button></div></label><fieldset className="grid min-w-0 gap-2"><legend className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/45">Cor do papel</legend><div className="flex flex-wrap items-center gap-2 pt-2">{noteColors.map((color) => <button key={color.value} type="button" aria-label={color.name} onClick={() => setDraft({ ...draft, color: color.value })} className={`h-8 w-8 rounded-full border-2 transition ${draft.color === color.value ? "scale-110 border-white" : "border-transparent"}`} style={{ backgroundColor: color.value }} />)}<label className="relative grid h-8 w-8 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-dashed border-white/50 bg-white/10 text-sm text-white transition hover:border-white hover:bg-white/20" title="Escolher qualquer cor"><span aria-hidden="true">＋</span><input aria-label="Escolher qualquer cor para a nota" type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label></div></fieldset></div></div><div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setNoteFormOpen(false)} className="rounded-full px-4 py-3 text-xs font-bold text-white/55 hover:text-white">Cancelar</button><LiquidButton size="xl" type="submit">Guardar nota</LiquidButton></div></form></div>}</>)
}
