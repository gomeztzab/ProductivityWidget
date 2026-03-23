const { ipcRenderer } = require('electron')

/* ---- IDs ---- */
const closeBtn  = document.getElementById("closeSettingsBtn")
const cancelBtn = document.getElementById("cancelSettingsBtn")
const saveBtn   = document.getElementById("saveSettingsBtn")
const focusSel  = document.getElementById("focusDuration")
const breakSel  = document.getElementById("breakDuration")
const swatches      = document.querySelectorAll("#swatchGroup .settings__swatch")
const textSwatches  = document.querySelectorAll("#textSwatchGroup .settings__swatch--text")
const themeCards    = document.querySelectorAll(".settings__theme-card")

const colorNames = {
    "#3b82f6": "Azul",
    "#8b5cf6": "Violeta",
    "#06b6d4": "Cian",
    "#10b981": "Verde",
    "#f59e0b": "Ambar",
    "#ef4444": "Rojo",
    "#ec4899": "Rosa",
    "#f97316": "Naranja"
}

const textColorNames = {
    "#ffffff": "Blanco",
    "#e0f2fe": "Azul claro",
    "#f3e8ff": "Lavanda",
    "#d1fae5": "Menta",
    "#fef3c7": "Crema",
    "#fce7f3": "Rosa claro"
}

let selectedColor     = localStorage.getItem("accentColor") || "#3b82f6"
let selectedTextColor = localStorage.getItem("textColor")   || "#ffffff"
let selectedTheme     = localStorage.getItem("dashTheme")   || "glass"

/* ---- Aplicar colores/tema al propio settings al abrir ---- */
document.documentElement.style.setProperty("--accent-color", selectedColor)
document.documentElement.setAttribute("data-theme", selectedTheme)

/* ---- Restaurar valores al abrir ---- */
const savedFocus = localStorage.getItem("focusDuration")
const savedBreak = localStorage.getItem("breakDuration")
if(savedFocus) focusSel.value = savedFocus
if(savedBreak) breakSel.value = savedBreak
updateColorPreview(selectedColor)
updateActiveSwatch(selectedColor)
updateTextColorPreview(selectedTextColor)
updateActiveTextSwatch(selectedTextColor)
updateActiveThemeCard(selectedTheme)
updateBars()

/* ---- Preview bars en tiempo real ---- */
focusSel.addEventListener("change", updateBars)
breakSel.addEventListener("change", updateBars)

function updateBars() {
    const focusVal = parseInt(focusSel.value)
    const breakVal = parseInt(breakSel.value)
    const maxFocus = 60

    document.getElementById("focusBar").style.width = (focusVal / maxFocus * 100) + "%"
    document.getElementById("breakBar").style.width = (breakVal / maxFocus * 100) + "%"
    document.getElementById("focusPreview").textContent = focusVal + " min"
    document.getElementById("breakPreview").textContent = breakVal + " min"
}

/* ---- Swatches ---- */
swatches.forEach(btn => {
    btn.addEventListener("click", () => {
        selectedColor = btn.dataset.color
        document.documentElement.style.setProperty("--accent-color", selectedColor)
        updateActiveSwatch(selectedColor)
        updateColorPreview(selectedColor)
    })
})

themeCards.forEach(card => {
    card.addEventListener("click", () => {
        selectedTheme = card.dataset.theme
        document.documentElement.setAttribute("data-theme", selectedTheme)
        updateActiveThemeCard(selectedTheme)
    })
})

function updateActiveThemeCard(theme) {
    themeCards.forEach(c => c.classList.remove("settings__theme-card--active"))
    const active = document.querySelector(`.settings__theme-card[data-theme='${theme}']`)
    if(active) active.classList.add("settings__theme-card--active")
}

function updateActiveSwatch(color) {
    swatches.forEach(b => b.classList.remove("settings__swatch--active"))
    const active = document.querySelector(`.settings__swatch[data-color='${color}']`)
    if(active) {
        active.classList.add("settings__swatch--active")
        active.style.boxShadow = `0 0 0 2px ${color}`
    }
}

textSwatches.forEach(btn => {
    btn.addEventListener("click", () => {
        selectedTextColor = btn.dataset.color
        updateActiveTextSwatch(selectedTextColor)
        updateTextColorPreview(selectedTextColor)
    })
})

function updateActiveTextSwatch(color) {
    textSwatches.forEach(b => b.classList.remove("settings__swatch--active"))
    const active = document.querySelector(`#textSwatchGroup .settings__swatch--text[data-color='${color}']`)
    if(active) {
        active.classList.add("settings__swatch--active")
        active.style.boxShadow = `0 0 0 2px ${color}`
    }
}

function updateTextColorPreview(color) {
    const circle = document.getElementById("textColorPreviewCircle")
    if(circle) {
        circle.style.background = color
        circle.style.boxShadow  = `0 0 12px ${color}80`
        circle.style.border     = `1px solid ${color}33`
    }
    const nameEl = document.getElementById("textColorPreviewName")
    const hexEl  = document.getElementById("textColorPreviewHex")
    if(nameEl) nameEl.textContent = textColorNames[color] || color
    if(hexEl)  hexEl.textContent  = color
}

function updateColorPreview(color) {
    const circle = document.getElementById("colorPreviewCircle")
    if(circle) {
        circle.style.background = color
        circle.style.boxShadow = `0 0 12px ${color}80`
    }
    const nameEl = document.getElementById("colorPreviewName")
    const hexEl  = document.getElementById("colorPreviewHex")
    if(nameEl) nameEl.textContent = colorNames[color] || color
    if(hexEl)  hexEl.textContent  = color
}

/* ---- Guardar ---- */
saveBtn.addEventListener("click", () => {
    localStorage.setItem("focusDuration",  focusSel.value)
    localStorage.setItem("breakDuration",  breakSel.value)
    localStorage.setItem("accentColor",    selectedColor)
    localStorage.setItem("textColor",      selectedTextColor)
    localStorage.setItem("dashTheme",      selectedTheme)
    ipcRenderer.send("save-settings", {
        accentColor: selectedColor,
        textColor:   selectedTextColor,
        theme:       selectedTheme
    })
})

/* ---- Cancelar / Cerrar ---- */
closeBtn.addEventListener("click",  () => ipcRenderer.send("close-settings"))
cancelBtn.addEventListener("click", () => ipcRenderer.send("close-settings"))
