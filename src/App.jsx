import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

const AREAS = ['매장일', '주식', '탐험', '일러스트', '탐구', '생활관리', '중국소싱']

const TIME_SLOTS = [
  '5:00', '5:30', '6:00', '6:30', '7:00', '7:30', '8:00', '8:30',
  '9:00', '9:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00', '22:30', '23:00', '23:30', '0:00', '0:30', '1:00'
]

const AREA_COLORS = {
  '매장일': '#a8c5a0',
  '주식': '#a0b8c5',
  '탐험': '#c5a0a8',
  '일러스트': '#c5c0a0',
  '탐구': '#b0a0c5',
  '생활관리': '#a0c5bf',
  '중국소싱': '#c5b0a0',
}

const TABS = ['dump', 'routine', 'timeblock']

export default function App() {
  const [tab, setTab] = useState('dump')
  const [dumpTab, setDumpTab] = useState('todo')
  const [tasks, setTasks] = useState([])
  const [routines, setRoutines] = useState([])
  const [timeblocks, setTimeblocks] = useState([])
  const [showSheet, setShowSheet] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newArea, setNewArea] = useState(AREAS[0])
  const [showSlotModal, setShowSlotModal] = useState(null)
  const [dateOffset, setDateOffset] = useState(0)
  const [editTask, setEditTask] = useState(null)
  const [editRoutine, setEditRoutine] = useState(null)
  const [collapsedAreas, setCollapsedAreas] = useState({})
  const [dragOver, setDragOver] = useState(null)
  const longPressTimer = useState(null)
  const taskLongPressTimer = useState(null)
  const routineLongPressTimer = useState(null)
  const dragItem = useRef(null)
  const dragArea = useRef(null)

  const getDate = (offset) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const getDateLabel = (offset) => {
    if (offset === 0) return '오늘'
    if (offset === -1) return '어제'
    if (offset === 1) return '내일'
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const today = getDate(dateOffset)
  const tabIndex = TABS.indexOf(tab)

  useEffect(() => {
    fetchTasks()
    fetchRoutines()
    fetchTimeblocks()
  }, [dateOffset])

  async function fetchTasks() {
    const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
    if (data) setTasks(data)
  }

  async function fetchRoutines() {
    const { data } = await supabase.from('routines').select('*').order('sort_order', { ascending: true })
    if (data) setRoutines(data)
  }

  async function fetchTimeblocks() {
    const { data } = await supabase.from('timeblocks').select('*, tasks(title, area)').eq('date', today)
    if (data) setTimeblocks(data)
  }

  async function addTask() {
    if (!newTitle.trim()) return
    if (tab === 'routine') {
      const areaRoutines = routines.filter(r => r.area === newArea)
      const maxOrder = areaRoutines.length > 0 ? Math.max(...areaRoutines.map(r => r.sort_order || 0)) : 0
      await supabase.from('routines').insert({ title: newTitle, area: newArea, sort_order: maxOrder + 1 })
      fetchRoutines()
    } else {
      await supabase.from('tasks').insert({ title: newTitle, area: newArea, is_done: false })
      fetchTasks()
    }
    setNewTitle('')
    setNewArea(AREAS[0])
    setShowSheet(false)
  }

  async function toggleTask(task) {
    await supabase.from('tasks').update({ is_done: !task.is_done }).eq('id', task.id)
    fetchTasks()
  }

  async function deleteTask(id) {
    await supabase.from('timeblocks').delete().eq('task_id', id)
    await supabase.from('tasks').delete().eq('id', id)
    setEditTask(null)
    fetchTasks()
  }

  async function updateTaskArea(id, area) {
    await supabase.from('tasks').update({ area }).eq('id', id)
    setEditTask(null)
    fetchTasks()
  }

  async function deleteRoutine(id) {
    await supabase.from('routines').delete().eq('id', id)
    setEditRoutine(null)
    fetchRoutines()
  }

  async function updateRoutineArea(id, area) {
    await supabase.from('routines').update({ area }).eq('id', id)
    setEditRoutine(null)
    fetchRoutines()
  }

  async function assignTimeblock(slot, type, taskId, isRoutine) {
    const existing = timeblocks.find(b => b.time_slot === slot && b.type === type)
    const payload = isRoutine
      ? { date: today, time_slot: slot, type, routine_id: taskId, task_id: null }
      : { date: today, time_slot: slot, type, task_id: taskId, routine_id: null }
    if (existing) {
      await supabase.from('timeblocks').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('timeblocks').insert(payload)
    }
    setShowSlotModal(null)
    fetchTimeblocks()
  }

  async function deleteTimeblock(id) {
    await supabase.from('timeblocks').delete().eq('id', id)
    fetchTimeblocks()
  }

  function getBlock(slot, type) {
    return timeblocks.find(b => b.time_slot === slot && b.type === type)
  }

  function toggleArea(area) {
    setCollapsedAreas(prev => ({ ...prev, [area]: !prev[area] }))
  }

  // 드래그 핸들러
  function handleDragStart(routine, area) {
    dragItem.current = routine
    dragArea.current = area
  }

  async function handleDrop(targetRoutine) {
    if (!dragItem.current || dragItem.current.id === targetRoutine.id) return
    if (dragArea.current !== targetRoutine.area) return

    const area = dragArea.current
    const areaRoutines = routines.filter(r => r.area === area)
    const fromIdx = areaRoutines.findIndex(r => r.id === dragItem.current.id)
    const toIdx = areaRoutines.findIndex(r => r.id === targetRoutine.id)

    const reordered = [...areaRoutines]
    reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, dragItem.current)

    // DB 업데이트
    await Promise.all(reordered.map((r, i) =>
      supabase.from('routines').update({ sort_order: i }).eq('id', r.id)
    ))

    setDragOver(null)
    dragItem.current = null
    dragArea.current = null
    fetchRoutines()
  }

  const filteredTasks = tasks.filter(t => dumpTab === 'todo' ? !t.is_done : t.is_done)

  // 영역별 그룹핑
  const groupedRoutines = AREAS.reduce((acc, area) => {
    const list = routines.filter(r => r.area === area)
    if (list.length > 0) acc[area] = list
    return acc
  }, {})

  return (
    <div style={{ fontFamily: 'Noto Sans KR, sans-serif', background: '#f5f0e8', minHeight: '100vh', width: '100%', position: 'relative' }}>

      {/* 탭 헤더 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', background: '#fff', position: 'relative' }}>
        {TABS.map(t => (
          <button key={t} className="tab-button" onClick={() => setTab(t)} style={{
            flex: 1, padding: '14px 0', border: 'none', background: 'none',
            fontWeight: tab === t ? 700 : 400,
            fontSize: 14, cursor: 'pointer', color: '#222'
          }}>
            {t === 'dump' ? '덤프' : t === 'routine' ? '루틴' : '타임블록'}
          </button>
        ))}
        <div className="tab-underline" style={{ left: `${(tabIndex * 100) / TABS.length}%`, width: `${100 / TABS.length}%` }} />
      </div>

      {/* 덤프 탭 */}
      {tab === 'dump' && (
        <div style={{ padding: '16px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['todo', 'done'].map(d => (
              <button key={d} onClick={() => setDumpTab(d)} style={{
                padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: dumpTab === d ? '#222' : '#e0dbd0',
                color: dumpTab === d ? '#fff' : '#666', fontSize: 13
              }}>
                {d === 'todo' ? '미완료' : '완료'}
              </button>
            ))}
          </div>
          {filteredTasks.length === 0 && (
            <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', marginTop: 40 }}>
              {dumpTab === 'todo' ? '할 일이 없어요 🎉' : '완료된 항목이 없어요'}
            </div>
          )}
          {filteredTasks.map(task => (
            <div
              key={task.id}
              className="task-item"
              onClick={() => toggleTask(task)}
              onContextMenu={e => { e.preventDefault(); setEditTask(task) }}
              onTouchStart={() => taskLongPressTimer[1](setTimeout(() => setEditTask(task), 600))}
              onTouchEnd={() => { clearTimeout(taskLongPressTimer[0]); taskLongPressTimer[1](null) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 4px', borderBottom: '1px solid #e8e3d8', cursor: 'pointer'
              }}>
              <span style={{ fontSize: 15, color: task.is_done ? '#aaa' : '#222', textDecoration: task.is_done ? 'line-through' : 'none' }}>
                {task.title}
              </span>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: AREA_COLORS[task.area] || '#ddd', color: '#fff' }}>
                {task.area}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 루틴 탭 */}
      {tab === 'routine' && (
        <div style={{ padding: '16px' }}>
          {Object.keys(groupedRoutines).length === 0 && (
            <div style={{ color: '#aaa', fontSize: 14, textAlign: 'center', marginTop: 40 }}>
              루틴이 없어요 — 추가해봐요!
            </div>
          )}
          {Object.entries(groupedRoutines).map(([area, list]) => (
            <div key={area} style={{ marginBottom: 8 }}>
              {/* 영역 헤더 */}
              <div onClick={() => toggleArea(area)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                background: AREA_COLORS[area] || '#ddd', marginBottom: 2
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{area}</span>
                <span style={{ fontSize: 12, color: '#fff', transition: 'transform 0.2s', display: 'inline-block', transform: collapsedAreas[area] ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
              </div>

              {/* 루틴 리스트 */}
              {!collapsedAreas[area] && list.map(routine => (
                <div
                  key={routine.id}
                  className="task-item"
                  draggable
                  onDragStart={() => handleDragStart(routine, area)}
                  onDragOver={e => { e.preventDefault(); setDragOver(routine.id) }}
                  onDrop={() => handleDrop(routine)}
                  onDragEnd={() => { setDragOver(null); dragItem.current = null }}
                  onContextMenu={e => { e.preventDefault(); setEditRoutine(routine) }}
                  onTouchStart={() => routineLongPressTimer[1](setTimeout(() => setEditRoutine(routine), 600))}
                  onTouchEnd={() => { clearTimeout(routineLongPressTimer[0]); routineLongPressTimer[1](null) }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 8px', borderBottom: '1px solid #e8e3d8', cursor: 'grab',
                    background: dragOver === routine.id ? '#e0dbd0' : 'transparent',
                    transition: 'background 0.15s'
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#bbb', fontSize: 14 }}>⠿</span>
                    <span style={{ fontSize: 15, color: '#222' }}>{routine.title}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 타임블록 탭 */}
      {tab === 'timeblock' && (
        <div style={{ padding: '16px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 12 }}>
            <button onClick={() => setDateOffset(d => d - 1)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}>‹</button>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{getDateLabel(dateOffset)} · {today}</span>
            <button onClick={() => setDateOffset(d => d + 1)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 1fr', marginBottom: 4 }}>
            <div />
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#444' }}>PLAN</div>
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#444' }}>DONE</div>
          </div>
          {TIME_SLOTS.map(slot => (
            <div key={slot} style={{ display: 'grid', gridTemplateColumns: '50px 1fr 1fr', marginBottom: 2 }}>
              <div style={{ fontSize: 11, color: '#888', paddingTop: 6, textAlign: 'right', paddingRight: 8 }}>{slot}</div>
              {['plan', 'done'].map(type => {
                const block = getBlock(slot, type)
                const label = block?.tasks?.title || (block?.routine_id ? routines.find(r => r.id === block.routine_id)?.title : null)
                const area = block?.tasks?.area || (block?.routine_id ? routines.find(r => r.id === block.routine_id)?.area : null)
                return (
                  <div
                    key={type}
                    className="slot"
                    onClick={() => !block && setShowSlotModal({ slot, type })}
                    onContextMenu={e => { e.preventDefault(); if (block) deleteTimeblock(block.id) }}
                    onTouchStart={() => { if (block) { longPressTimer[1](setTimeout(() => deleteTimeblock(block.id), 600)) } }}
                    onTouchEnd={() => { clearTimeout(longPressTimer[0]); longPressTimer[1](null) }}
                    style={{
                      minHeight: 32, margin: '0 2px', borderRadius: 4, cursor: 'pointer',
                      background: block ? (AREA_COLORS[area] || '#ccc') : '#e8e3d8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '4px 6px'
                    }}>
                    {label && <span style={{ fontSize: 11, color: '#fff', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* 바텀시트 - 태스크/루틴 추가 */}
      {showSheet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10 }}>
          <div className="sheet-backdrop" onClick={() => setShowSheet(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
          <div className="sheet-content" style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: '#fff', borderRadius: '16px 16px 0 0', padding: '24px 20px 40px', maxHeight: '60vh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 20px' }} />
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addTask() } }}
              placeholder={tab === 'routine' ? '루틴 입력...' : '할 일 입력...'}
              style={{ width: '100%', border: 'none', borderBottom: '1px solid #ddd', padding: '8px 0', fontSize: 16, outline: 'none', background: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {AREAS.map(area => (
                <button key={area} onClick={() => setNewArea(area)} style={{
                  padding: '6px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: newArea === area ? '#222' : '#e0dbd0',
                  color: newArea === area ? '#fff' : '#666'
                }}>
                  {area}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 슬롯 선택 모달 */}
      {showSlotModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10 }}>
          <div className="sheet-backdrop" onClick={() => setShowSlotModal(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
          <div className="sheet-content" style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: '#fff', borderRadius: '16px 16px 0 0', padding: '24px 20px 40px' }}>
            <div style={{ width: 40, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>{showSlotModal.slot} · {showSlotModal.type === 'plan' ? 'PLAN' : 'DONE'}</div>
            {routines.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>루틴</div>
                {routines.map(routine => (
                  <div key={routine.id} className="task-item" onClick={() => assignTimeblock(showSlotModal.slot, showSlotModal.type, routine.id, true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', borderBottom: '1px solid #eee', cursor: 'pointer' }}>
                    <span style={{ fontSize: 15 }}>{routine.title}</span>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: AREA_COLORS[routine.area] || '#ddd', color: '#fff' }}>{routine.area}</span>
                  </div>
                ))}
              </>
            )}
            {tasks.filter(t => !t.is_done).length > 0 && (
              <>
                <div style={{ fontSize: 11, color: '#aaa', margin: '12px 0 8px' }}>덤프</div>
                {tasks.filter(t => !t.is_done).map(task => (
                  <div key={task.id} className="task-item" onClick={() => assignTimeblock(showSlotModal.slot, showSlotModal.type, task.id, false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', borderBottom: '1px solid #eee', cursor: 'pointer' }}>
                    <span style={{ fontSize: 15 }}>{task.title}</span>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: AREA_COLORS[task.area] || '#ddd', color: '#fff' }}>{task.area}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* 태스크 편집 모달 */}
      {editTask && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20 }}>
          <div className="sheet-backdrop" onClick={() => setEditTask(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
          <div className="sheet-content" style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: '#fff', borderRadius: '16px 16px 0 0', padding: '24px 20px 40px' }}>
            <div style={{ width: 40, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{editTask.title}</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>영역 변경 또는 삭제</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {AREAS.map(area => (
                <button key={area} onClick={() => updateTaskArea(editTask.id, area)} style={{ padding: '6px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, background: editTask.area === area ? '#222' : '#e0dbd0', color: editTask.area === area ? '#fff' : '#666' }}>
                  {area}
                </button>
              ))}
            </div>
            <button onClick={() => deleteTask(editTask.id)} style={{ width: '100%', padding: '12px', background: '#ff4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer' }}>
              삭제
            </button>
          </div>
        </div>
      )}

      {/* 루틴 편집 모달 */}
      {editRoutine && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20 }}>
          <div className="sheet-backdrop" onClick={() => setEditRoutine(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
          <div className="sheet-content" style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: '#fff', borderRadius: '16px 16px 0 0', padding: '24px 20px 40px' }}>
            <div style={{ width: 40, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{editRoutine.title}</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>영역 변경 또는 삭제</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {AREAS.map(area => (
                <button key={area} onClick={() => updateRoutineArea(editRoutine.id, area)} style={{ padding: '6px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, background: editRoutine.area === area ? '#222' : '#e0dbd0', color: editRoutine.area === area ? '#fff' : '#666' }}>
                  {area}
                </button>
              ))}
            </div>
            <button onClick={() => deleteRoutine(editRoutine.id)} style={{ width: '100%', padding: '12px', background: '#ff4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer' }}>
              삭제
            </button>
          </div>
        </div>
      )}

      {/* 덤프/루틴 탭일 때만 추가 버튼 */}
      {(tab === 'dump' || tab === 'routine') && (
        <button onClick={() => setShowSheet(true)} style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#222', color: '#fff', border: 'none', borderRadius: 24,
          padding: '12px 32px', fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          + 추가
        </button>
      )}
    </div>
  )
}
