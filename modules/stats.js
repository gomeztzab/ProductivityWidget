/* =====================
   STATS
   Persistencia diaria + historial 30 días + 3 páginas navegables.
   Módulo IIFE — sin dependencias externas.
   ===================== */
const Stats = (() => {
    const PAGE_TITLES = ['stats.timer', 'stats.tasks', 'stats.history']

    /* ---- Estado diario (clave = fecha del día) ---- */
    function _todayKey() { return `stats_${new Date().toDateString()}` }

    const _defaults = { pomodoros: 0, focusedSecs: 0, breaks: 0, attempted: 0, interrupted: 0 }
    let _daily = Object.assign({}, _defaults, JSON.parse(localStorage.getItem(_todayKey()) || '{}'))
    let _focusSaveTick = 0   /* contador para persistir focusedSecs cada 60s sin escribir cada tick */

    function _saveDaily() {
        localStorage.setItem(_todayKey(), JSON.stringify(_daily))
        _updateHistory()
    }

    /* ---- Historial (últimos 30 días) ---- */
    function _getHistory() {
        return JSON.parse(localStorage.getItem('stats_history') || '[]')
    }

    function _updateHistory() {
        let hist  = _getHistory()
        const key = new Date().toDateString()
        const idx = hist.findIndex(e => e.date === key)
        const entry = { date: key, pomodoros: _daily.pomodoros, focusedSecs: _daily.focusedSecs, breaks: _daily.breaks, attempted: _daily.attempted, interrupted: _daily.interrupted }
        if (idx >= 0) hist[idx] = entry; else hist.push(entry)
        if (hist.length > 30) hist = hist.slice(-30)
        localStorage.setItem('stats_history', JSON.stringify(hist))
    }

    /* ---- Cálculos de historial ---- */
    function _streak() {
        const todayTs = new Date().setHours(0, 0, 0, 0)
        const sorted  = _getHistory()
            .filter(e => e.pomodoros > 0)
            .map(e => new Date(e.date).setHours(0, 0, 0, 0))
            .sort((a, b) => b - a)
        if (!sorted.length) return 0
        let streak = 0, cursor = todayTs
        for (const d of sorted) {
            const diff = (cursor - d) / 86400000
            if (diff === 0 || diff === 1) { streak++; cursor = d }
            else break
        }
        return streak
    }

    function _best() {
        return Math.max(0, ..._getHistory().map(e => e.pomodoros))
    }

    function _totalHours() {
        const secs = _getHistory().reduce((s, e) => s + (e.focusedSecs || 0), 0)
        const h    = secs / 3600
        return h >= 10 ? h.toFixed(0) : h.toFixed(1)
    }

    /* ---- Navegación de páginas ---- */
    let _page     = 0
    let _pagesEls = []
    let _dotsEls  = []
    let _titleEl  = null

    function _setPage(n) {
        _page = n
        _pagesEls.forEach((el, i) => el.classList.toggle('stats__page--active', i === n))
        _dotsEls.forEach((d, i)  => d.classList.toggle('stats__dot--active',   i === n))
        if (_titleEl) _titleEl.textContent = i18n.t(PAGE_TITLES[n])
        _renderCurrent()
    }

    /* ---- Renders por página ---- */
    function _renderPage0() {
        const h = Math.floor(_daily.focusedSecs / 3600)
        const m = Math.floor((_daily.focusedSecs % 3600) / 60)
        document.getElementById('statPomodoros').textContent = _daily.pomodoros
        document.getElementById('statFocused').textContent  = h > 0 ? `${h}h ${m}m` : `${m}m`
        document.getElementById('statBreaks').textContent   = _daily.breaks

        /* Adherence bar */
        const attempted   = _daily.attempted  || 0
        const interrupted = _daily.interrupted || 0
        const completed   = _daily.pomodoros  || 0
        const wrap = document.getElementById('statAdherenceWrap')
        if (wrap) {
            if (attempted > 0) {
                const pct = Math.round((completed / attempted) * 100)
                wrap.style.display = ''
                document.getElementById('statAdherencePct').textContent  = pct + '%'
                document.getElementById('statAdherenceFill').style.width = pct + '%'
                const labelEl = document.getElementById('statAdherenceLabel')
                if (labelEl) {
                    labelEl.textContent = interrupted > 0
                        ? i18n.t('stats.adherenceInterrupted', { n: interrupted })
                        : i18n.t('stats.adherence')
                }
            } else {
                wrap.style.display = 'none'
            }
        }
    }

    function _renderPage1() {
        const { all, done, pending, rate } = getTaskStats()
        document.getElementById('statTasksDone').textContent    = done
        document.getElementById('statTasksPending').textContent = pending
        document.getElementById('statTasksRate').textContent    = rate + '%'
    }

    function _renderPage2() {
        document.getElementById('statStreak').textContent = _streak() + 'd'
        document.getElementById('statBest').textContent   = _best()
        document.getElementById('statTotal').textContent  = _totalHours() + 'h'

        /* Feature J — wire export button once */
        const exportBtn = document.getElementById('statsExportBtn')
        if (exportBtn && !exportBtn._wired) {
            exportBtn._wired = true
            exportBtn.addEventListener('click', () => {
                const hist = _getHistory()
                const tasks = JSON.parse(localStorage.getItem('todoStateV2') || '{"tasks":[]}').tasks || []
                const accentColor = localStorage.getItem('accentColor') || '#3b82f6'
                ipcRenderer.send('export-stats', { history: hist, daily: _daily, tasks, accentColor })
            })
        }
    }

    function _renderCurrent() {
        if (_page === 0) _renderPage0()
        else if (_page === 1) _renderPage1()
        else _renderPage2()
    }

    /* Backup periódico cada 60s (no guardar en cada tick de foco) */
    setInterval(_saveDaily, 60000)
    window.addEventListener('beforeunload', _saveDaily)

    /* ---- API pública ---- */
    return {
        addPomodoro()     { _daily.pomodoros++;   _saveDaily(); if (_page === 0) _renderPage0() },
        addFocusedTime(s) { _daily.focusedSecs += s; if (++_focusSaveTick >= 60) { _focusSaveTick = 0; _saveDaily() } if (_page === 0) _renderPage0() },
        addBreak()        { _daily.breaks++;      _saveDaily(); if (_page === 0) _renderPage0() },
        addAttempt()      { _daily.attempted++;   _saveDaily(); if (_page === 0) _renderPage0() },
        addInterrupted()  { _daily.interrupted++; _saveDaily(); if (_page === 0) _renderPage0() },
        refreshTasks()    { if (_page === 1) _renderPage1() },
        getPomodoros()    { return _daily.pomodoros },
        getAttempted()    { return _daily.attempted },
        getFocusedSecs()  { return _daily.focusedSecs },
        getStreak()       { return _streak() },
        init() {
            _titleEl  = document.querySelector('.stats__title')
            _pagesEls = Array.from(document.querySelectorAll('.stats__page'))
            _dotsEls  = Array.from(document.querySelectorAll('.stats__dot'))
            _dotsEls.forEach((d, i) => d.addEventListener('click', () => _setPage(i)))
            _setPage(0)
        }
    }
})()


