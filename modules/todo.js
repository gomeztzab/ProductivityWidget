/* =====================
   TODO LIST
   ===================== */

let TodoList = null

function getTaskStats() {
    if (!TodoList || typeof TodoList.getStats !== 'function') {
        return { all: 0, done: 0, pending: 0, rate: 0, activeTask: null }
    }
    return TodoList.getStats()
}

/* Feature K — meta diária de pomodoros */
function getPomodoroGoal() {
    return parseInt(localStorage.getItem('pomodoroGoal') || '0', 10) || 0
}

TodoList = (() => {
    const taskList = document.getElementById('taskList')
    const taskInput = document.getElementById('taskInput')
    const addTaskBtn = document.getElementById('addTaskBtn')
    const taskPrioritySelect = document.getElementById('taskPrioritySelect')
    const taskSortSelect = document.getElementById('taskSortSelect')
    const taskFilters = Array.from(document.querySelectorAll('.todo__filter'))
    const todoCard = document.querySelector('.todo')
    const todoCompactToggleBtn = document.getElementById('todoCompactToggleBtn')
    const todoCompactSummaryBtn = document.getElementById('todoCompactSummaryBtn')
    const todoSummaryText = document.getElementById('todoSummaryText')
    const todoProgressFill = document.getElementById('todoProgressFill')
    const todoProgressText = document.getElementById('todoProgressText')
    const todoCompactCount = document.getElementById('todoCompactCount')
    const todoCompactActive = document.getElementById('todoCompactActive')
    const todoActiveTask = document.getElementById('todoActiveTask')
    const todoEmptyState = document.getElementById('todoEmptyState')

    const TODO_STORAGE_KEY = 'todoStateV2'
    const LEGACY_TASKS_STORAGE_KEY = 'tasks'
    const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
    const PRIORITY_LABELS = { high: 'todo.priorityHigh', medium: 'todo.priorityMedium', low: 'todo.priorityLow' }
    const PRIORITY_SEQUENCE = ['high', 'medium', 'low']
    const VALID_FILTERS = new Set(['all', 'pending', 'completed'])
    const VALID_SORTS = new Set(['manual', 'priority'])
    let todoAudioCtx = null
    let recentlyCompletedTaskId = null

    let state = {
        ...readState(),
        compact: true
    }

    function createTaskId() {
        return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    function readState() {
        let parsed = null
        let legacy = []

        try {
            parsed = JSON.parse(localStorage.getItem(TODO_STORAGE_KEY) || 'null')
        } catch {
            parsed = null
        }

        try {
            legacy = JSON.parse(localStorage.getItem(LEGACY_TASKS_STORAGE_KEY) || '[]')
        } catch {
            legacy = []
        }

        if (parsed && typeof parsed === 'object') {
            return normalizeState(parsed)
        }

        return normalizeState({ tasks: Array.isArray(legacy) ? legacy : [] })
    }

    function normalizeState(raw = {}) {
        const tasks = Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTask).filter(Boolean) : []
        let activeAssigned = false

        const normalizedTasks = tasks.map(task => {
            const normalizedTask = { ...task }

            if (normalizedTask.done) {
                normalizedTask.active = false
                return normalizedTask
            }

            if (normalizedTask.active && !activeAssigned) {
                activeAssigned = true
                return normalizedTask
            }

            normalizedTask.active = false
            return normalizedTask
        })

        return {
            tasks: normalizedTasks,
            filter: VALID_FILTERS.has(raw.filter) ? raw.filter : 'all',
            sort: VALID_SORTS.has(raw.sort) ? raw.sort : 'manual',
            compact: Boolean(raw.compact)
        }
    }

    function normalizeTask(task) {
        if (typeof task === 'string') {
            const text = task.trim()
            return text ? { id: createTaskId(), text, done: false, priority: 'medium', active: false } : null
        }

        if (!task || typeof task !== 'object') return null

        const text = String(task.text || '').trim()
        if (!text) return null

        return {
            id: typeof task.id === 'string' && task.id ? task.id : createTaskId(),
            text,
            done: Boolean(task.done),
            priority: PRIORITY_LABELS[task.priority] ? task.priority : 'medium',
            active: !task.done && Boolean(task.active)
        }
    }

    function saveState() {
        localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(state))
    }

    function getTodoAudioCtx() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (!AudioCtx) return null
        if (!todoAudioCtx) todoAudioCtx = new AudioCtx()
        if (todoAudioCtx.state === 'suspended') todoAudioCtx.resume().catch(() => {})
        return todoAudioCtx
    }

    function playTaskToggleSound(isCompleted) {
        const ctx = getTodoAudioCtx()
        if (!ctx) return

        const start = ctx.currentTime + 0.01
        const master = ctx.createGain()
        master.gain.setValueAtTime(0.0001, start)
        master.gain.exponentialRampToValueAtTime(isCompleted ? 0.14 : 0.1, start + 0.016)
        master.gain.exponentialRampToValueAtTime(0.0001, start + 0.16)
        master.connect(ctx.destination)

        const oscA = ctx.createOscillator()
        const oscB = ctx.createOscillator()
        const gainB = ctx.createGain()

        oscA.type = isCompleted ? 'triangle' : 'sine'
        oscB.type = 'sine'
        oscA.frequency.setValueAtTime(isCompleted ? 720 : 420, start)
        oscA.frequency.exponentialRampToValueAtTime(isCompleted ? 980 : 320, start + 0.1)
        oscB.frequency.setValueAtTime(isCompleted ? 1080 : 540, start)
        oscB.frequency.exponentialRampToValueAtTime(isCompleted ? 1280 : 420, start + 0.08)
        gainB.gain.setValueAtTime(isCompleted ? 0.55 : 0.35, start)
        gainB.gain.exponentialRampToValueAtTime(0.0001, start + 0.12)

        oscA.connect(master)
        oscB.connect(gainB)
        gainB.connect(master)

        oscA.start(start)
        oscB.start(start)
        oscA.stop(start + 0.18)
        oscB.stop(start + 0.14)
    }

    function getStats() {
        const all = state.tasks.length
        const done = state.tasks.filter(task => task.done).length
        const pending = all - done
        const rate = all > 0 ? Math.round(done / all * 100) : 0
        const activeTask = state.tasks.find(task => task.active && !task.done) || null

        return { all, done, pending, rate, activeTask }
    }

    function getVisibleTasks() {
        const filteredTasks = state.tasks
            .map((task, index) => ({ task, sourceIndex: index }))
            .filter(({ task }) => {
                if (state.filter === 'pending') return !task.done
                if (state.filter === 'completed') return task.done
                return true
            })

        if (state.sort === 'priority') {
            filteredTasks.sort((left, right) => {
                if (left.task.done !== right.task.done) {
                    return Number(left.task.done) - Number(right.task.done)
                }

                const priorityDiff = PRIORITY_ORDER[left.task.priority] - PRIORITY_ORDER[right.task.priority]
                if (priorityDiff !== 0) return priorityDiff
                return left.sourceIndex - right.sourceIndex
            })
        }

        return filteredTasks
    }

    function render() {
        if (!taskList) return

        const visibleTasks = getVisibleTasks()
        const { all, pending, done, activeTask } = getStats()
        const emptyMessage = all === 0
            ? i18n.t('todo.emptyAdd')
            : i18n.t('todo.emptyFilter')

        if (todoCard) {
            todoCard.classList.toggle('todo--compact', state.compact)
        }

        if (todoCompactToggleBtn) {
            todoCompactToggleBtn.textContent = state.compact ? i18n.t('todo.expand') : i18n.t('todo.compact')
            todoCompactToggleBtn.setAttribute('aria-pressed', state.compact ? 'true' : 'false')
        }

        if (taskSortSelect) {
            taskSortSelect.value = state.sort
        }

        taskFilters.forEach(button => {
            const selected = button.dataset.filter === state.filter
            button.classList.toggle('todo__filter--active', selected)
            button.setAttribute('aria-pressed', selected ? 'true' : 'false')
        })

        if (todoSummaryText) {
            todoSummaryText.textContent = i18n.t('todo.summary', { pending, done })
        }

        if (todoProgressFill) {
            todoProgressFill.style.width = `${all > 0 ? Math.round(done / all * 100) : 0}%`
        }

        if (todoProgressText) {
            todoProgressText.textContent = i18n.t('todo.progress', { done, all })
        }

        if (todoCompactCount) {
            todoCompactCount.textContent = all === 0 ? i18n.t('todo.noTasks') : i18n.t('todo.pendingOf', { pending, all })
        }

        if (todoCompactActive) {
            todoCompactActive.textContent = activeTask ? i18n.t('todo.inFocus', { task: activeTask.text }) : i18n.t('todo.noFocus')
        }

        if (todoActiveTask) {
            todoActiveTask.innerHTML = activeTask
                ? `
                    <span class="todo__active-task-kicker">${i18n.t('todo.activeTask.kicker')}</span>
                    <strong class="todo__active-task-title">${escapeHtml(activeTask.text)}</strong>
                    <span class="todo__active-task-meta">${i18n.t('todo.activeTask.meta', { priority: i18n.t(PRIORITY_LABELS[activeTask.priority]).toLowerCase() })}</span>
                `
                : `
                    <span class="todo__active-task-kicker">${i18n.t('todo.activeTask.kicker')}</span>
                    <strong class="todo__active-task-title">${i18n.t('todo.activeTask.noActive')}</strong>
                    <span class="todo__active-task-meta">${i18n.t('todo.activeTask.select')}</span>
                `
            todoActiveTask.classList.toggle('todo__active-task--idle', !activeTask)
        }

        taskList.innerHTML = visibleTasks
            .map(({ task, sourceIndex }) => renderTask(task, sourceIndex))
            .join('')

        if (todoEmptyState) {
            todoEmptyState.textContent = emptyMessage
            todoEmptyState.hidden = visibleTasks.length > 0
        }

        Stats.refreshTasks()
        scheduleWindowWidthSync()
    }

    function renderTask(task, sourceIndex) {
        const isCompleted = task.done
        const isActive = task.active && !task.done
        const isManualSort = state.sort === 'manual'
        const moveUpDisabled = !isManualSort || sourceIndex === 0
        const moveDownDisabled = !isManualSort || sourceIndex === state.tasks.length - 1

        return `
            <li class="todo__item${isCompleted ? ' todo__item--completed' : ''}${isActive ? ' todo__item--active' : ''}${recentlyCompletedTaskId === task.id ? ' todo__item--just-completed' : ''}" data-task-id="${task.id}" data-source-index="${sourceIndex}">
                <button class="todo__checkbox${isCompleted ? ' todo__checkbox--checked' : ''}" data-action="toggle" type="button" aria-label="${isCompleted ? i18n.t('todo.markPending') : i18n.t('todo.markCompleted')}">${isCompleted ? CHECK_SVG : ''}</button>
                <div class="todo__content">
                    <div class="todo__meta-row">
                        <button class="todo__priority todo__priority--${task.priority}" data-action="priority" type="button">${i18n.t(PRIORITY_LABELS[task.priority])}</button>
                        ${isActive ? `<span class="todo__focus-badge">${i18n.t('todo.focusBadge')}</span>` : ''}
                    </div>
                    <span class="todo__text">${escapeHtml(task.text)}</span>
                </div>
                <div class="todo__actions">
                    <button class="todo__action${isActive ? ' todo__action--focus-active' : ' todo__action--focus'}" data-action="focus" type="button" ${isCompleted ? 'disabled' : ''}>${isActive ? i18n.t('todo.removeFocus') : i18n.t('todo.setFocus')}</button>
                    <button class="todo__action" data-action="move-up" type="button" ${moveUpDisabled ? 'disabled' : ''}>↑</button>
                    <button class="todo__action" data-action="move-down" type="button" ${moveDownDisabled ? 'disabled' : ''}>↓</button>
                    <button class="todo__remove" data-action="remove" type="button" title="${i18n.t('todo.remove')}">&times;</button>
                </div>
            </li>
        `
    }

    function commit(nextState, options = {}) {
        state = normalizeState(nextState)
        saveState()
        render()
        if (typeof syncPomodoroActiveTask === 'function') syncPomodoroActiveTask()

        if (options.focusInput && taskInput) {
            taskInput.focus()
        }
    }

    function addTask() {
        if (!taskInput) return

        const text = taskInput.value.trim()
        if (!text) return

        const hasActivePendingTask = state.tasks.some(task => task.active && !task.done)
        const nextTask = {
            id: createTaskId(),
            text,
            done: false,
            priority: PRIORITY_LABELS[taskPrioritySelect?.value] ? taskPrioritySelect.value : 'medium',
            active: !hasActivePendingTask
        }

        commit({
            ...state,
            tasks: [nextTask, ...state.tasks],
            compact: false
        }, { focusInput: true })

        taskInput.value = ''
        if (taskPrioritySelect) taskPrioritySelect.value = 'medium'
    }

    function cyclePriority(taskId) {
        commit({
            ...state,
            tasks: state.tasks.map(task => {
                if (task.id !== taskId) return task
                const currentIndex = PRIORITY_SEQUENCE.indexOf(task.priority)
                const nextPriority = PRIORITY_SEQUENCE[(currentIndex + 1) % PRIORITY_SEQUENCE.length]
                return { ...task, priority: nextPriority }
            })
        })
    }

    function toggleTask(taskId) {
        let completedState = false
        const nextTasks = state.tasks.map(task => {
            if (task.id !== taskId) return task
            const done = !task.done
            completedState = done
            return { ...task, done, active: done ? false : task.active, completedAt: done ? Date.now() : undefined }
        })

        recentlyCompletedTaskId = completedState ? taskId : null

        commit({
            ...state,
            tasks: nextTasks
        })

        playTaskToggleSound(completedState)

        if (completedState) {
            setTimeout(() => {
                if (recentlyCompletedTaskId === taskId) {
                    recentlyCompletedTaskId = null
                }
            }, 360)
        }
    }

    function toggleActiveTask(taskId) {
        commit({
            ...state,
            tasks: state.tasks.map(task => {
                if (task.done) return { ...task, active: false }
                if (task.id === taskId) return { ...task, active: !task.active }
                return { ...task, active: false }
            })
        })
    }

    function removeTask(taskId) {
        commit({
            ...state,
            tasks: state.tasks.filter(task => task.id !== taskId)
        })
    }

    function moveTask(taskId, direction, sourceIndex) {
        if (state.sort !== 'manual') return

        const currentIndex = Number.isInteger(sourceIndex)
            ? sourceIndex
            : state.tasks.findIndex(task => task.id === taskId)

        if (currentIndex === -1) return

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
        if (targetIndex < 0 || targetIndex >= state.tasks.length) return

        const nextTasks = [...state.tasks]
        ;[nextTasks[currentIndex], nextTasks[targetIndex]] = [nextTasks[targetIndex], nextTasks[currentIndex]]
        commit({ ...state, tasks: nextTasks })
    }

    function setFilter(filter) {
        if (!VALID_FILTERS.has(filter)) return
        commit({ ...state, filter })
    }

    function setSort(sort) {
        if (!VALID_SORTS.has(sort)) return
        commit({ ...state, sort })
    }

    function toggleCompact() {
        commit({ ...state, compact: !state.compact })
    }

    function expandFromCompact() {
        if (selectedViewMode === 'compact') {
            commit({ ...state, compact: false })
            renderViewModeSelection('full')
            requestAnimationFrame(() => taskInput?.focus())
            return
        }

        commit({ ...state, compact: false }, { focusInput: true })
    }

    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', addTask)
    }

    if (taskInput) {
        taskInput.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            addTask()
        })
    }

    if (taskSortSelect) {
        taskSortSelect.addEventListener('change', event => setSort(event.target.value))
    }

    taskFilters.forEach(button => {
        button.addEventListener('click', () => setFilter(button.dataset.filter))
    })

    if (todoCompactToggleBtn) {
        todoCompactToggleBtn.addEventListener('click', toggleCompact)
    }

    if (todoCompactSummaryBtn) {
        todoCompactSummaryBtn.addEventListener('click', expandFromCompact)
    }

    if (taskList) {
        taskList.addEventListener('click', event => {
            const trigger = event.target.closest('[data-action]')
            if (!trigger) return

            const item = trigger.closest('.todo__item')
            if (!item) return

            const taskId = item.dataset.taskId
            const action = trigger.dataset.action
            const sourceIndex = Number.parseInt(item.dataset.sourceIndex || '-1', 10)

            if (action === 'toggle') toggleTask(taskId)
            else if (action === 'priority') cyclePriority(taskId)
            else if (action === 'focus') toggleActiveTask(taskId)
            else if (action === 'move-up') moveTask(taskId, 'up', sourceIndex)
            else if (action === 'move-down') moveTask(taskId, 'down', sourceIndex)
            else if (action === 'remove') removeTask(taskId)
        })
    }

    render()

    return {
        getStats,
        render,
        completeActiveTask() {
            const { activeTask } = getStats()
            if (activeTask) toggleTask(activeTask.id)
        }
    }
})()


