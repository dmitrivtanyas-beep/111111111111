import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen, StickyNote, RotateCcw, Search, Users, Plus, SplitSquareHorizontal,
  PanelLeftClose, PanelRightClose, LogOut, ChevronDown, ChevronUp, Trash2,
  Pencil, X, Check, Copy, Eye, EyeOff, Sparkles, CalendarDays, BookMarked,
  Settings2, Menu, ArrowRight, LockKeyhole, Globe2
} from 'lucide-react'
import { isConfigured, supabase, Word, Note } from './lib'

type Page = 'dictionary' | 'notes' | 'review'
type SessionUser = { id: string; email?: string }

const today = () => new Date().toISOString()
const formatDate = (v: string) => new Date(v).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })

function App() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authName, setAuthName] = useState('')
  const [authError, setAuthError] = useState('')
  const [page, setPage] = useState<Page>('dictionary')
  const [words, setWords] = useState<Word[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [workspaceName, setWorkspaceName] = useState('Наш простір')
  const [members, setMembers] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingWord, setEditingWord] = useState<string | null>(null)
  const [wordForm, setWordForm] = useState({ english: '', ukrainian: '', example: '', pronunciation: '', part_of_speech: '', tags: '' })
  const [noteId, setNoteId] = useState<string | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [noteVisibility, setNoteVisibility] = useState<'private' | 'shared'>('private')
  const [noteFolder, setNoteFolder] = useState('')
  const [split, setSplit] = useState(false)
  const [leftVisible, setLeftVisible] = useState(true)
  const [rightVisible, setRightVisible] = useState(true)
  const [showAnswer, setShowAnswer] = useState(false)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [toast, setToast] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'dictionary' | 'notes'>('dictionary')
  const englishRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2400)
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u ? { id: u.id, email: u.email } : null)
      if (!u) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null)
      if (!session) { setWords([]); setNotes([]); setWorkspaceId('') }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user && supabase) loadWorkspace()
  }, [user?.id])

  async function loadWorkspace() {
    if (!supabase || !user) return
    setLoading(true)
    const { data: membership, error } = await supabase
      .from('workspace_members').select('workspace_id, workspaces(name)').eq('user_id', user.id).maybeSingle()
    if (error) notify(error.message)
    if (membership?.workspace_id) {
      setWorkspaceId(membership.workspace_id)
      setWorkspaceName((membership as any).workspaces?.name || 'Наш простір')
      await Promise.all([loadWords(membership.workspace_id), loadNotes(membership.workspace_id), loadMembers(membership.workspace_id)])
    } else {
      setWorkspaceId('')
    }
    setLoading(false)
  }

  async function loadWords(id = workspaceId) {
    if (!supabase || !id) return
    const { data, error } = await supabase.from('words')
      .select('*, profiles:created_by(display_name)').eq('workspace_id', id).order('created_at', { ascending: false })
    if (error) notify(error.message); else setWords((data || []) as Word[])
  }
  async function loadNotes(id = workspaceId) {
    if (!supabase || !id || !user) return
    const { data, error } = await supabase.from('notes')
      .select('*').eq('workspace_id', id).order('updated_at', { ascending: false })
    if (error) notify(error.message); else setNotes((data || []) as Note[])
  }
  async function loadMembers(id = workspaceId) {
    if (!supabase || !id) return
    const { data } = await supabase.from('workspace_members')
      .select('user_id, profiles:user_id(display_name)').eq('workspace_id', id)
    setMembers(data || [])
  }

  useEffect(() => {
    if (!supabase || !workspaceId) return
    const channel = supabase.channel(`workspace-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'words', filter: `workspace_id=eq.${workspaceId}` }, () => loadWords())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `workspace_id=eq.${workspaceId}` }, () => loadNotes())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, user?.id])

  useEffect(() => {
    if (page === 'dictionary' && !split) englishRef.current?.focus()
  }, [page, split])

  const filteredWords = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    if (!q) return words
    return words.filter(w => [w.english, w.ukrainian, w.example || '', ...(w.tags || [])].join(' ').toLocaleLowerCase().includes(q))
  }, [words, query])

  const dueWords = useMemo(() => words.filter(w => new Date(w.due_at || w.created_at) <= new Date()), [words])
  const reviewWord = dueWords[reviewIndex % Math.max(dueWords.length, 1)]
  const learnedCount = words.filter(w => (w.repetitions || 0) >= 4).length

  async function authenticate(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setAuthError('')
    const result = authMode === 'signup'
      ? await supabase.auth.signUp({ email: authEmail, password: authPassword, options: { data: { display_name: authName } } })
      : await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
    if (result.error) setAuthError(result.error.message)
    else if (authMode === 'signup' && !result.data.session) setAuthError('Перевір пошту та підтвердь реєстрацію. Потім увійди.')
  }

  async function createWorkspace() {
    if (!supabase || !user) return
    const name = workspaceName.trim() || 'Наш простір'
    const { data, error } = await supabase.rpc('create_workspace', { workspace_name: name })
    if (error) notify(error.message)
    else { setWorkspaceId(data); await loadWorkspace(); notify('Простір створено') }
  }

  async function joinWorkspace() {
    if (!supabase || !user || !inviteCode.trim()) return
    const { data, error } = await supabase.rpc('join_workspace', { invite_code: inviteCode.trim().toUpperCase() })
    if (error) notify(error.message)
    else { setWorkspaceId(data); setInviteCode(''); await loadWorkspace(); notify('Ти приєдналася до простору') }
  }

  async function makeInvite() {
    if (!supabase || !workspaceId) return
    const { data, error } = await supabase.rpc('refresh_invite_code', { target_workspace: workspaceId })
    if (error) notify(error.message)
    else { setInviteCode(data); await navigator.clipboard.writeText(data); notify('Код запрошення скопійовано') }
  }

  async function saveWord(e?: FormEvent) {
    e?.preventDefault()
    if (!supabase || !workspaceId || !user) return
    const english = wordForm.english.trim()
    const ukrainian = wordForm.ukrainian.trim()
    if (!english || !ukrainian) { notify('Додай слово й переклад'); return }
    const duplicate = words.find(w => w.english.toLocaleLowerCase() === english.toLocaleLowerCase() && w.id !== editingWord)
    if (duplicate) { notify('Таке слово вже є у словнику'); return }
    const payload = {
      workspace_id: workspaceId, english, ukrainian,
      example: wordForm.example.trim() || null,
      pronunciation: wordForm.pronunciation.trim() || null,
      part_of_speech: wordForm.part_of_speech.trim() || null,
      tags: wordForm.tags.split(',').map(s => s.trim()).filter(Boolean)
    }
    const result = editingWord
      ? await supabase.from('words').update(payload).eq('id', editingWord)
      : await supabase.from('words').insert({ ...payload, created_by: user.id, due_at: today() })
    if (result.error) notify(result.error.message)
    else {
      setWordForm({ english: '', ukrainian: '', example: '', pronunciation: '', part_of_speech: '', tags: '' })
      setEditingWord(null); await loadWords(); notify(editingWord ? 'Зміни збережено' : 'Слово додано')
      englishRef.current?.focus()
    }
  }

  function beginEditWord(w: Word) {
    setEditingWord(w.id)
    setWordForm({ english: w.english, ukrainian: w.ukrainian, example: w.example || '', pronunciation: w.pronunciation || '', part_of_speech: w.part_of_speech || '', tags: (w.tags || []).join(', ') })
    setPage('dictionary')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteWord(id: string) {
    if (!supabase || !window.confirm('Видалити це слово зі спільного словника?')) return
    const { error } = await supabase.from('words').delete().eq('id', id)
    if (error) notify(error.message); else { await loadWords(); notify('Слово видалено') }
  }

  async function rateWord(rating: 'forgot' | 'hard' | 'good' | 'easy') {
    if (!supabase || !reviewWord) return
    const intervals: Record<string, number> = { forgot: 0.02, hard: 1, good: 3, easy: 7 }
    const current = reviewWord.interval_days || 0
    const interval = rating === 'forgot' ? 0.02 : rating === 'hard' ? Math.max(1, current * 1.2) : rating === 'good' ? Math.max(3, current * 2) : Math.max(7, current * 2.8)
    const due = new Date(Date.now() + interval * 86400000).toISOString()
    const reps = rating === 'forgot' ? 0 : (reviewWord.repetitions || 0) + 1
    const { error } = await supabase.from('words').update({ due_at: due, interval_days: interval, repetitions: reps, last_rating: rating }).eq('id', reviewWord.id)
    if (error) notify(error.message)
    else { setShowAnswer(false); setReviewIndex(i => i + 1); await loadWords() }
  }

  async function saveNote() {
    if (!supabase || !workspaceId || !user) return
    const title = noteTitle.trim() || 'Нотатка без назви'
    const payload = { workspace_id: workspaceId, owner_id: user.id, title, content: noteContent, visibility: noteVisibility, folder: noteFolder.trim() || null, updated_at: today() }
    const result = noteId
      ? await supabase.from('notes').update(payload).eq('id', noteId)
      : await supabase.from('notes').insert(payload).select().single()
    if (result.error) notify(result.error.message)
    else {
      if (!noteId && result.data) setNoteId(result.data.id)
      await loadNotes()
      notify('Нотатку збережено')
    }
  }

  useEffect(() => {
    if (!workspaceId || !user || (!noteTitle && !noteContent)) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void saveNote() }, 900)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [noteTitle, noteContent, noteVisibility, noteFolder, noteId, workspaceId, user?.id])

  function openNote(n: Note) {
    setNoteId(n.id); setNoteTitle(n.title); setNoteContent(n.content); setNoteVisibility(n.visibility); setNoteFolder(n.folder || '')
  }
  function newNote() {
    setNoteId(null); setNoteTitle(''); setNoteContent(''); setNoteVisibility('private'); setNoteFolder('')
  }
  async function deleteNote(id: string) {
    if (!supabase || !window.confirm('Видалити нотатку?')) return
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) notify(error.message); else { await loadNotes(); if (noteId === id) newNote(); notify('Нотатку видалено') }
  }

  async function signOut() { await supabase?.auth.signOut(); setUser(null) }

  if (!isConfigured) return <SetupScreen />
  if (loading) return <div className="loading-screen"><div className="brand-mark">сл.</div><p>Готуємо твій простір…</p></div>
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} name={authName} setName={setAuthName} error={authError} submit={authenticate} />

  if (!workspaceId) return <WorkspaceSetup name={workspaceName} setName={setWorkspaceName} create={createWorkspace} code={inviteCode} setCode={setInviteCode} join={joinWorkspace} signOut={signOut} />

  const dictionaryPanel = <section className="panel dictionary-panel">
    <div className="panel-heading"><div><span className="eyebrow">ТВІЙ ОСОБИСТИЙ СЛОВНИК</span><h1>Нове слово<span className="period">.</span></h1><p>Занотовуй, поки не забулося.</p></div><div className="mini-stat"><BookMarked size={16}/><span>{words.length} слів</span></div></div>
    <form className="word-form" onSubmit={saveWord}>
      <label className="field-label">Англійською</label>
      <input ref={englishRef} className="word-input" autoComplete="off" placeholder="Наприклад, serendipity" value={wordForm.english} onChange={e => setWordForm({ ...wordForm, english: e.target.value })} />
      <label className="field-label">Переклад</label>
      <input className="word-input" placeholder="Українською" value={wordForm.ukrainian} onChange={e => setWordForm({ ...wordForm, ukrainian: e.target.value })} />
      <details className="optional-fields"><summary>Додати деталі <ChevronDown size={14}/></summary>
        <div className="optional-grid">
          <input placeholder="Приклад речення" value={wordForm.example} onChange={e => setWordForm({ ...wordForm, example: e.target.value })}/>
          <input placeholder="Вимова (необов'язково)" value={wordForm.pronunciation} onChange={e => setWordForm({ ...wordForm, pronunciation: e.target.value })}/>
          <input placeholder="Частина мови" value={wordForm.part_of_speech} onChange={e => setWordForm({ ...wordForm, part_of_speech: e.target.value })}/>
          <input placeholder="Теги через кому" value={wordForm.tags} onChange={e => setWordForm({ ...wordForm, tags: e.target.value })}/>
        </div>
      </details>
      <div className="form-footer"><span className="hint">Enter — зберегти слово</span><button className="primary-btn" type="submit"><Plus size={16}/>{editingWord ? 'Зберегти зміни' : 'Зберегти слово'}</button></div>
      {editingWord && <button type="button" className="text-btn" onClick={() => { setEditingWord(null); setWordForm({ english:'', ukrainian:'', example:'', pronunciation:'', part_of_speech:'', tags:'' }) }}>Скасувати редагування</button>}
    </form>
    <div className="list-heading"><div><h2>Словник</h2><span>{filteredWords.length} {filteredWords.length === 1 ? 'запис' : 'записів'}</span></div><div className="searchbox"><Search size={16}/><input placeholder="Пошук двома мовами…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button onClick={() => setQuery('')}><X size={14}/></button>}</div></div>
    <div className="word-list">
      {filteredWords.length === 0 ? <div className="empty-state"><div className="empty-icon"><BookOpen size={22}/></div><strong>{query ? 'Нічого не знайдено' : 'Тут поки тихо'}</strong><p>{query ? 'Спробуй інше слово або переклад.' : 'Перше слово — початок вашої маленької колекції.'}</p></div> :
      filteredWords.map(w => <article className="word-row" key={w.id}>
        <button className="word-main" onClick={() => setExpanded(expanded === w.id ? null : w.id)}><div><strong>{w.english}</strong><span>{w.ukrainian}</span></div><div className="word-meta"><span>{w.profiles?.display_name || 'Учасник'}</span><small>{formatDate(w.created_at)}</small>{expanded === w.id ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</div></button>
        {expanded === w.id && <div className="word-details">{w.example && <p className="example">“{w.example}”</p>}<div className="detail-tags">{w.pronunciation && <span>/{w.pronunciation}/</span>}{w.part_of_speech && <span>{w.part_of_speech}</span>}{(w.tags || []).map(t => <span key={t}>#{t}</span>)}</div><div className="word-actions"><button onClick={() => beginEditWord(w)}><Pencil size={14}/> Редагувати</button><button className="danger-link" onClick={() => deleteWord(w.id)}><Trash2 size={14}/> Видалити</button></div></div>}
      </article>)}
    </div>
  </section>

  const notesPanel = <section className="panel notes-panel">
    <div className="notes-top"><div><span className="eyebrow">ТВОЇ ДУМКИ Й МАТЕРІАЛИ</span><h1>Нотатки<span className="period">.</span></h1></div><button className="icon-btn" onClick={newNote} title="Нова нотатка"><Plus size={18}/></button></div>
    <div className="notes-layout">
      <aside className="note-list">{notes.map(n => <button key={n.id} className={`note-item ${noteId === n.id ? 'active' : ''}`} onClick={() => openNote(n)}><span className="note-visibility">{n.visibility === 'shared' ? <Globe2 size={12}/> : <LockKeyhole size={12}/>}</span><strong>{n.title || 'Без назви'}</strong><small>{formatDate(n.updated_at)}</small></button>)}<button className="new-note-btn" onClick={newNote}><Plus size={14}/> Нова нотатка</button></aside>
      <div className="note-editor">
        <div className="note-editor-tools"><select value={noteVisibility} onChange={e => setNoteVisibility(e.target.value as any)}><option value="private">Особиста</option><option value="shared">Спільна</option></select><input className="folder-input" placeholder="Папка / категорія" value={noteFolder} onChange={e => setNoteFolder(e.target.value)}/>{noteId && <button className="icon-btn subtle-danger" onClick={() => deleteNote(noteId)}><Trash2 size={15}/></button>}</div>
        <input className="note-title" placeholder="Назва нотатки" value={noteTitle} onChange={e => setNoteTitle(e.target.value)}/>
        <textarea className="note-content" placeholder="Почни записувати думки, правила, корисні фрази…" value={noteContent} onChange={e => setNoteContent(e.target.value)}/>
        <div className="note-save-row"><span>Зміни зберігаються автоматично</span><button className="small-save" onClick={saveNote}>Зберегти зараз</button></div>
      </div>
    </div>
  </section>

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => { setPage('dictionary'); setSplit(false) }}><span className="brand-mark">сл.</span><span>словничок<small>ENGLISH, TOGETHER</small></span></button>
      <nav className="main-nav">
        <button className={page === 'dictionary' ? 'active' : ''} onClick={() => { setPage('dictionary'); setSplit(false) }}><BookOpen size={16}/>Словник</button>
        <button className={page === 'notes' ? 'active' : ''} onClick={() => { setPage('notes'); setSplit(false) }}><StickyNote size={16}/>Нотатки</button>
        <button className={page === 'review' ? 'active' : ''} onClick={() => setPage('review')}><RotateCcw size={16}/>Повторення{dueWords.length > 0 && <i>{dueWords.length}</i>}</button>
      </nav>
      <div className="top-actions"><button className={`split-toggle ${split ? 'selected' : ''}`} onClick={() => { setSplit(!split); setPage('dictionary') }}><SplitSquareHorizontal size={16}/><span>Розділити екран</span></button><button className="user-pill" onClick={() => setShowSettings(!showSettings)}><span className="avatar">{(user.email || 'U')[0].toUpperCase()}</span><ChevronDown size={14}/></button></div>
      {showSettings && <div className="settings-popover"><strong>{user.email}</strong><span>{workspaceName}</span><button onClick={makeInvite}><Copy size={14}/> Створити код запрошення</button>{inviteCode && <code>{inviteCode}</code>}<button onClick={signOut}><LogOut size={14}/> Вийти</button></div>}
    </header>

    {page === 'review' ? <main className="review-page">
      <div className="review-heading"><span className="eyebrow">ТРОХИ ПРАКТИКИ ЩОДНЯ</span><h1>Час пригадати<span className="period">.</span></h1><p>Кілька хвилин зараз — і слова залишаться з тобою надовше.</p></div>
      <div className="review-stats"><div><span>До повторення</span><strong>{dueWords.length}</strong></div><div><span>Уже вивчено</span><strong>{learnedCount}</strong></div><div><span>Усього слів</span><strong>{words.length}</strong></div></div>
      {reviewWord ? <div className="flashcard"><span className="card-counter">КАРТКА {Math.min(reviewIndex + 1, dueWords.length)} / {dueWords.length}</span><strong>{reviewWord.english}</strong>{showAnswer ? <div className="answer-reveal"><span>{reviewWord.ukrainian}</span>{reviewWord.example && <small>{reviewWord.example}</small>}</div> : <button className="reveal-btn" onClick={() => setShowAnswer(true)}><Eye size={16}/> Показати переклад</button>}{showAnswer && <div className="rating-buttons"><button onClick={() => rateWord('forgot')}>Не пам'ятаю</button><button onClick={() => rateWord('hard')}>Важко</button><button onClick={() => rateWord('good')}>Добре</button><button onClick={() => rateWord('easy')}>Легко</button></div>}</div> : <div className="review-done"><div className="empty-icon"><Sparkles size={24}/></div><h2>На сьогодні все!</h2><p>Нових слів для повторення поки немає. Можна видихнути ☺</p><button className="primary-btn" onClick={() => setPage('dictionary')}>Додати нове слово</button></div>}
    </main> : split && page === 'dictionary' ? <main className={`split-workspace ${!leftVisible ? 'only-right' : ''} ${!rightVisible ? 'only-left' : ''}`}>
      {leftVisible && <div className="split-left">{dictionaryPanel}</div>}
      {rightVisible && <div className="split-right">{notesPanel}</div>}
      <div className="split-controls"><button onClick={() => setLeftVisible(!leftVisible)} title="Показати / сховати словник"><PanelLeftClose size={16}/></button><button onClick={() => setRightVisible(!rightVisible)} title="Показати / сховати нотатки"><PanelRightClose size={16}/></button></div>
    </main> : <main className="single-workspace">{page === 'dictionary' ? dictionaryPanel : notesPanel}</main>}
    <footer className="app-footer"><span>Маленькі кроки — великий словниковий запас.</span><span><span className="online-dot"/> {members.length || 1} учасник(и) у просторі</span></footer>
    {toast && <div className="toast"><Check size={15}/>{toast}</div>}
  </div>
}

function AuthScreen(props: any) {
  return <div className="auth-screen"><div className="auth-card"><div className="brand-mark large">сл.</div><span className="eyebrow">ENGLISH, TOGETHER</span><h1>{props.mode === 'login' ? 'Раді знову бачити.' : 'Створімо ваш простір.'}</h1><p>Невеликий словник для великих відкриттів.</p><form onSubmit={props.submit}>{props.mode === 'signup' && <input placeholder="Як тебе звати?" value={props.name} onChange={e => props.setName(e.target.value)} required/>}<input type="email" placeholder="Електронна пошта" value={props.email} onChange={e => props.setEmail(e.target.value)} required/><input type="password" placeholder="Пароль (від 6 символів)" minLength={6} value={props.password} onChange={e => props.setPassword(e.target.value)} required/>{props.error && <div className="auth-error">{props.error}</div>}<button className="primary-btn wide" type="submit">{props.mode === 'login' ? 'Увійти' : 'Зареєструватися'} <ArrowRight size={16}/></button></form><button className="text-btn" onClick={() => { props.setMode(props.mode === 'login' ? 'signup' : 'login'); }}>{props.mode === 'login' ? 'Ще немає акаунта? Створити' : 'Вже маєш акаунт? Увійти'}</button></div></div>
}
function WorkspaceSetup(props: any) {
  return <div className="auth-screen"><div className="auth-card workspace-card"><div className="brand-mark large">сл.</div><span className="eyebrow">ВАШ МАЛЕНЬКИЙ СПІЛЬНИЙ ПРОСТІР</span><h1>З чого почнемо?</h1><p>Створи простір для двох або приєднайся до вже створеного.</p><div className="workspace-option"><h3>Створити новий</h3><input value={props.name} onChange={e => props.setName(e.target.value)} placeholder="Назва простору"/><button className="primary-btn wide" onClick={props.create}>Створити простір <ArrowRight size={16}/></button></div><div className="or-divider"><span>або</span></div><div className="workspace-option"><h3>Приєднатися</h3><input value={props.code} onChange={e => props.setCode(e.target.value)} placeholder="Код запрошення"/><button className="secondary-btn wide" onClick={props.join}>Приєднатися до простору</button></div><button className="text-btn" onClick={props.signOut}>Вийти з акаунта</button></div></div>
}
function SetupScreen() {
  return <div className="auth-screen"><div className="auth-card"><div className="brand-mark large">сл.</div><span className="eyebrow">ПОТРІБНЕ ОДНЕ НАЛАШТУВАННЯ</span><h1>Під'єднаймо базу даних.</h1><p>Застосунок готовий до підключення Supabase. Створи проєкт, виконай SQL із папки <b>supabase</b> та додай URL і anon key у файл <b>.env</b>.</p><ol className="setup-steps"><li>Створи безкоштовний проєкт у Supabase.</li><li>Відкрий SQL Editor і виконай <code>schema.sql</code>.</li><li>Скопіюй ключі в <code>.env</code> за прикладом <code>.env.example</code>.</li><li>Запусти <code>npm install</code>, потім <code>npm run dev</code>.</li></ol><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="primary-btn wide">Відкрити Supabase <ArrowRight size={16}/></a></div></div>
}
export default App
