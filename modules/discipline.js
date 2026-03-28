/* =====================
   DISCIPLINE
   Propuesta 1: Intención de sesión
   Propuesta 4: Revisión de cierre diario
   ===================== */
const Discipline = (() => {
    const SESSION_KEY = () => `disciplineSession_${new Date().toDateString()}`
    const REVIEW_KEY  = () => `disciplineReview_${new Date().toDateString()}`

    let _session    = null    /* { intention, skipped } */
    let _reviewMet  = null    /* true | false | null */
    let _pendingAction = null /* callback to run after modal resolves */

    /* ---- Helpers ---- */
    function _loadSession() {
        try { _session = JSON.parse(localStorage.getItem(SESSION_KEY()) || 'null') } catch { _session = null }
    }

    function _saveSession(data) {
        _session = data
        localStorage.setItem(SESSION_KEY(), JSON.stringify(data))
    }

    function _hasIntention() {
        return _session && (_session.intention || _session.skipped)
    }

    /* ---- Intention anchor ---- */
    function _updateIntentionAnchor() {
        const el = document.getElementById('pomodoroIntention')
        if (!el) return
        if (_session && _session.intention) {
            el.textContent = _session.intention
            el.classList.remove('pomodoro__intention--hidden')
            el.setAttribute('tabindex', '0')
            el.setAttribute('aria-hidden', 'false')
        } else {
            el.textContent = ''
            el.classList.add('pomodoro__intention--hidden')
            el.setAttribute('tabindex', '-1')
            el.setAttribute('aria-hidden', 'true')
        }
    }

    /* ---- Intention modal ---- */
    function _showIntentionModal(onDone) {
        const overlay = document.getElementById('disciplineIntentionOverlay')
        const input   = document.getElementById('disciplineIntentionInput')
        const confirm = document.getElementById('disciplineIntentionConfirm')
        const skip    = document.getElementById('disciplineIntentionSkip')
        if (!overlay) { onDone(); return }

        input.value = ''
        overlay.classList.remove('discipline-overlay--hidden')
        setTimeout(() => input.focus(), 60)

        /* Focus trap: Tab queda dentro del modal */
        const _focusableI = [input, confirm, skip]
        function _trapFocusI(e) {
            if (e.key !== 'Tab') return
            const first = _focusableI[0]
            const last  = _focusableI[_focusableI.length - 1]
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus() }
            } else {
                if (document.activeElement === last)  { e.preventDefault(); first.focus() }
            }
        }
        overlay.addEventListener('keydown', _trapFocusI)

        function _close() {
            overlay.classList.add('discipline-overlay--hidden')
            overlay.removeEventListener('keydown', _trapFocusI)
            confirm.removeEventListener('click', _onConfirm)
            skip.removeEventListener('click', _onSkip)
        }

        function _onConfirm() {
            const val = input.value.trim()
            _saveSession({ intention: val || null, skipped: !val })
            _updateIntentionAnchor()
            _close()
            onDone()
        }

        function _onSkip() {
            _saveSession({ intention: null, skipped: true })
            _updateIntentionAnchor()
            _close()
            onDone()
        }

        confirm.addEventListener('click', _onConfirm)
        skip.addEventListener('click', _onSkip)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _onConfirm() }
        }, { once: true })
    }

    /* ---- Review modal ---- */
    function _showReviewModal(onClose) {
        const overlay  = document.getElementById('disciplineReviewOverlay')
        const recap    = document.getElementById('disciplineReviewIntentionText')
        const yesBtn   = document.getElementById('disciplineReviewYes')
        const noBtn    = document.getElementById('disciplineReviewNo')
        const notes    = document.getElementById('disciplineReviewNotes')
        const confirm  = document.getElementById('disciplineReviewConfirm')
        const closeBtn = document.getElementById('disciplineReviewClose')
        if (!overlay) { onClose(); return }

        _reviewMet = null
        notes.value = ''
        recap.textContent = (_session && _session.intention)
            ? `"${_session.intention}"`
            : i18n.t('discipline.review.noIntention')

        yesBtn.classList.remove('discipline-modal__met-btn--selected')
        noBtn.classList.remove('discipline-modal__met-btn--selected')

        overlay.classList.remove('discipline-overlay--hidden')

        /* Focus trap: Tab queda dentro del modal de revisión */
        const _focusableR = [yesBtn, noBtn, notes, confirm, closeBtn]
        setTimeout(() => _focusableR[0].focus(), 60)
        function _trapFocusR(e) {
            if (e.key !== 'Tab') return
            const first = _focusableR[0]
            const last  = _focusableR[_focusableR.length - 1]
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus() }
            } else {
                if (document.activeElement === last)  { e.preventDefault(); first.focus() }
            }
        }
        overlay.addEventListener('keydown', _trapFocusR)

        function _close() {
            overlay.classList.add('discipline-overlay--hidden')
            overlay.removeEventListener('keydown', _trapFocusR)
            yesBtn.removeEventListener('click', _onYes)
            noBtn.removeEventListener('click', _onNo)
            confirm.removeEventListener('click', _onConfirm)
            closeBtn.removeEventListener('click', _onSkip)
        }

        function _onYes() { _reviewMet = true;  yesBtn.classList.add('discipline-modal__met-btn--selected'); noBtn.classList.remove('discipline-modal__met-btn--selected') }
        function _onNo()  { _reviewMet = false; noBtn.classList.add('discipline-modal__met-btn--selected');  yesBtn.classList.remove('discipline-modal__met-btn--selected') }

        function _onConfirm() {
            localStorage.setItem(REVIEW_KEY(), JSON.stringify({
                intention: _session ? _session.intention : null,
                met: _reviewMet,
                notes: notes.value.trim()
            }))
            _close()
            onClose()
        }

        function _onSkip() { _close(); onClose() }

        yesBtn.addEventListener('click', _onYes)
        noBtn.addEventListener('click', _onNo)
        confirm.addEventListener('click', _onConfirm)
        closeBtn.addEventListener('click', _onSkip)
    }

    /* ---- Public API ---- */
    return {
        onStartTimerClick() {
            if (_hasIntention()) {
                startTimer()
                return
            }
            _showIntentionModal(() => startTimer())
        },

        onCloseBtnClick() {
            const hasPomodoros = Stats.getPomodoros() > 0
            if (!hasPomodoros) {
                ipcRenderer.send('close-app')
                return
            }
            _showReviewModal(() => ipcRenderer.send('close-app'))
        },

        /* Feature I — revisar al minimizar si es fin del día */
        onMinimizeBtnClick() {
            const hour           = new Date().getHours()
            const isEndOfDay     = hour >= 20
            const hasPomodoros   = Stats.getPomodoros() > 0
            const alreadyReviewed = !!localStorage.getItem(REVIEW_KEY())
            if (isEndOfDay && hasPomodoros && !alreadyReviewed) {
                _showReviewModal(() => ipcRenderer.send('minimize-app'))
                return
            }
            ipcRenderer.send('minimize-app')
        },

        init() {
            _loadSession()
            _updateIntentionAnchor()
            const anchor = document.getElementById('pomodoroIntention')
            if (anchor) {
                anchor.addEventListener('click', (e) => {
                    e.preventDefault()
                    /* clicking intention text re-opens modal if not running */
                    if (!interval) {
                        _session = null
                        _showIntentionModal(() => {})
                    }
                })
            }
        }
    }
})()
