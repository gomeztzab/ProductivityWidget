const { ipcRenderer } = require('electron')

/* ---- IDs ---- */
const closeBtn  = document.getElementById("closeSettingsBtn")
const cancelBtn = document.getElementById("cancelSettingsBtn")
const saveBtn   = document.getElementById("saveSettingsBtn")
const focusSel  = document.getElementById("focusDuration")
const breakSel  = document.getElementById("breakDuration")
const reminderSoundToggle = document.getElementById("reminderSoundEnabled")
const reminderNotificationsToggle = document.getElementById("reminderNotificationsEnabled")
const reminderSoundLevelSel = document.getElementById("reminderSoundLevel")
const launchAtStartupToggle = document.getElementById("launchAtStartupToggle")
const launchAtStartupHint = document.getElementById("launchAtStartupHint")
const swatches      = document.querySelectorAll("#swatchGroup .settings__swatch")
const textSwatches  = document.querySelectorAll("#textSwatchGroup .settings__swatch--text")
const themeCards    = document.querySelectorAll(".settings__theme-card")
const fontCards     = document.querySelectorAll(".settings__font-card")
const langCards     = document.querySelectorAll(".settings__lang-card")

const colorNames = {
    "#3b82f6": "color.blue",
    "#8b5cf6": "color.violet",
    "#06b6d4": "color.cyan",
    "#10b981": "color.green",
    "#f59e0b": "color.amber",
    "#ef4444": "color.red",
    "#ec4899": "color.pink",
    "#f97316": "color.orange",
    "#14b8a6": "color.turquoise",
    "#84cc16": "color.lime",
    "#e11d48": "color.crimson",
    "#6366f1": "color.indigo",
    "#111111": "color.black"
}

const textColorNames = {
    "#ffffff": "color.white",
    "#e0f2fe": "color.lightBlue",
    "#f3e8ff": "color.lavender",
    "#d1fae5": "color.mint",
    "#fef3c7": "color.cream",
    "#fce7f3": "color.lightPink",
    "#e5e7eb": "color.silver",
    "#fde68a": "color.softGold",
    "#cffafe": "color.ice",
    "#ddd6fe": "color.lilac",
    "#111111": "color.black"
}

let selectedColor     = localStorage.getItem("accentColor") || "#3b82f6"
let selectedTextColor = localStorage.getItem("textColor")   || "#ffffff"
let selectedTheme     = localStorage.getItem("dashTheme")   || "glass"
let selectedFont      = localStorage.getItem("fontFamily")  || "Inter"
let reminderSoundEnabled = localStorage.getItem("reminderSoundEnabled") !== "false"
let reminderNotificationsEnabled = localStorage.getItem("reminderNotificationsEnabled") !== "false"
let reminderSoundLevel = localStorage.getItem("reminderSoundLevel") || "soft"
let launchAtStartupEnabled = localStorage.getItem("launchAtStartupEnabled") === "true"
let selectedLanguage  = localStorage.getItem("appLanguage") || "es"

/* ---- Aplicar colores/tema/fuente al propio settings al abrir ---- */
document.documentElement.style.setProperty("--accent-color", selectedColor)
document.documentElement.setAttribute("data-theme", selectedTheme)
document.documentElement.style.setProperty("--font-family", `'${selectedFont}', sans-serif`)

/* ---- Restaurar valores al abrir ---- */
const savedFocus = localStorage.getItem("focusDuration")
const savedBreak = localStorage.getItem("breakDuration")
if(savedFocus) focusSel.value = savedFocus
if(savedBreak) breakSel.value = savedBreak
if(reminderSoundToggle) reminderSoundToggle.checked = reminderSoundEnabled
if(reminderNotificationsToggle) reminderNotificationsToggle.checked = reminderNotificationsEnabled
if(reminderSoundLevelSel) reminderSoundLevelSel.value = reminderSoundLevel
if(launchAtStartupToggle) launchAtStartupToggle.checked = launchAtStartupEnabled
updateColorPreview(selectedColor)
updateActiveSwatch(selectedColor)
updateTextColorPreview(selectedTextColor)
updateActiveTextSwatch(selectedTextColor)
updateActiveThemeCard(selectedTheme)
updateActiveFontCard(selectedFont)
updateActiveLangCard(selectedLanguage)
updateBars()
i18n.applyPage()
void syncLaunchAtStartupState()

/* ---- Preview bars en tiempo real ---- */
focusSel.addEventListener("change", updateBars)
breakSel.addEventListener("change", updateBars)

function parseDurationValue(value, defaultMinutes) {
    if (typeof value === "string" && value.endsWith("s")) {
        return { seconds: parseInt(value, 10) || defaultMinutes * 60, unit: "seconds" }
    }
    return { seconds: (parseInt(value, 10) || defaultMinutes) * 60, unit: "minutes" }
}

function formatDurationLabel(duration) {
    if (duration.unit === "seconds" || duration.seconds < 60) {
        return `${duration.seconds} s`
    }
    return `${Math.round(duration.seconds / 60)} min`
}

function updateBars() {
    const focusVal = parseDurationValue(focusSel.value, 25)
    const breakVal = parseDurationValue(breakSel.value, 5)
    const maxFocus = 60
    const maxBreak = 40

    document.getElementById("focusBar").style.width = (focusVal.seconds / (maxFocus * 60) * 100) + "%"
    document.getElementById("breakBar").style.width = (breakVal.seconds / (maxBreak * 60) * 100) + "%"
    document.getElementById("focusPreview").textContent = formatDurationLabel(focusVal)
    document.getElementById("breakPreview").textContent = formatDurationLabel(breakVal)
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

fontCards.forEach(card => {
    card.addEventListener("click", () => {
        selectedFont = card.dataset.font
        document.documentElement.style.setProperty("--font-family", `'${selectedFont}', sans-serif`)
        updateActiveFontCard(selectedFont)
    })
})

langCards.forEach(card => {
    card.addEventListener("click", () => {
        selectedLanguage = card.dataset.lang
        updateActiveLangCard(selectedLanguage)
        i18n.setLang(selectedLanguage)
        i18n.applyPage()
        updateColorPreview(selectedColor)
        updateTextColorPreview(selectedTextColor)
    })
})

if (reminderSoundToggle) {
    reminderSoundToggle.addEventListener("change", () => {
        reminderSoundEnabled = reminderSoundToggle.checked
    })
}

if (reminderNotificationsToggle) {
    reminderNotificationsToggle.addEventListener("change", () => {
        reminderNotificationsEnabled = reminderNotificationsToggle.checked
    })
}

if (reminderSoundLevelSel) {
    reminderSoundLevelSel.addEventListener("change", () => {
        reminderSoundLevel = reminderSoundLevelSel.value
    })
}

if (launchAtStartupToggle) {
    launchAtStartupToggle.addEventListener("change", () => {
        launchAtStartupEnabled = launchAtStartupToggle.checked
    })
}

async function syncLaunchAtStartupState() {
    if (!launchAtStartupToggle) return

    try {
        const startupState = await ipcRenderer.invoke("get-launch-at-startup")
        const isSupported = startupState?.supported !== false
        launchAtStartupEnabled = Boolean(startupState?.enabled)
        launchAtStartupToggle.checked = launchAtStartupEnabled
        launchAtStartupToggle.disabled = !isSupported

        if (launchAtStartupHint) {
            launchAtStartupHint.textContent = isSupported
                ? i18n.t("settings.launchAtStartup.hint")
                : i18n.t("settings.launchAtStartup.unsupported")
        }
    } catch (_) {
        launchAtStartupToggle.checked = launchAtStartupEnabled
    }
}

function updateActiveLangCard(lang) {
    langCards.forEach(c => c.classList.remove("settings__lang-card--active"))
    const active = document.querySelector(`.settings__lang-card[data-lang='${lang}']`)
    if(active) active.classList.add("settings__lang-card--active")
}

function updateActiveFontCard(font) {
    fontCards.forEach(c => c.classList.remove("settings__font-card--active"))
    const active = document.querySelector(`.settings__font-card[data-font='${font}']`)
    if(active) active.classList.add("settings__font-card--active")
}

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
    if(nameEl) nameEl.textContent = i18n.t(textColorNames[color]) || color
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
    if(nameEl) nameEl.textContent = i18n.t(colorNames[color]) || color
    if(hexEl)  hexEl.textContent  = color
}

/* ---- Guardar ---- */
saveBtn.addEventListener("click", async () => {
    localStorage.setItem("focusDuration",  focusSel.value)
    localStorage.setItem("breakDuration",  breakSel.value)
    localStorage.setItem("accentColor",    selectedColor)
    localStorage.setItem("textColor",      selectedTextColor)
    localStorage.setItem("dashTheme",      selectedTheme)
    localStorage.setItem("fontFamily",     selectedFont)
    localStorage.setItem("reminderSoundEnabled", String(reminderSoundEnabled))
    localStorage.setItem("reminderNotificationsEnabled", String(reminderNotificationsEnabled))
    localStorage.setItem("reminderSoundLevel", reminderSoundLevel)
    localStorage.setItem("launchAtStartupEnabled", String(launchAtStartupEnabled))

    const startupResult = await ipcRenderer.invoke("set-launch-at-startup", launchAtStartupEnabled)
    if (startupResult?.error) {
        window.alert(startupResult.error)
        return
    }

    localStorage.setItem("appLanguage", selectedLanguage)

    ipcRenderer.send("save-settings", {
        accentColor: selectedColor,
        textColor:   selectedTextColor,
        theme:       selectedTheme,
        font:        selectedFont,
        focusDuration: focusSel.value,
        breakDuration: breakSel.value,
        reminderSoundEnabled,
        reminderNotificationsEnabled,
        reminderSoundLevel,
        language: selectedLanguage
    })
})

/* ---- Cancelar / Cerrar ---- */
closeBtn.addEventListener("click",  () => ipcRenderer.send("close-settings"))
cancelBtn.addEventListener("click", () => ipcRenderer.send("close-settings"))
