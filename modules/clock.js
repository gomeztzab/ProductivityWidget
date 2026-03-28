/* =====================
   CLOCK
   ===================== */

function updateClock() {
    const now = new Date()
    let h = now.getHours()
    const period = h >= 12 ? "PM" : "AM"
    h = h % 12 || 12
    const m = String(now.getMinutes()).padStart(2, "0")
    const s = String(now.getSeconds()).padStart(2, "0")

    if (clockValue) clockValue.textContent = `${String(h).padStart(2,"0")}:${m}:${s}`
    if (clockPeriod) clockPeriod.textContent = period
    document.getElementById("date").textContent = now.toLocaleDateString(i18n.t('clock.locale'), {
        weekday: "long", month: "long", day: "numeric"
    })

    fitBarClockTime()
}

setInterval(updateClock, 1000)
updateClock()


