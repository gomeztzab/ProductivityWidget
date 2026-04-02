const { ipcRenderer, shell } = require('electron')

const GUMROAD_PRODUCT_URL = process.env.FOCUS_PRO_GUMROAD_URL || process.env.GUMROAD_PRODUCT_URL || "https://josegomez45.gumroad.com/l/xspqpp"
const SUPPORT_URL = process.env.FOCUS_PRO_SUPPORT_URL || process.env.SUPPORT_URL || "mailto:focusprosupport@gmail.com"
const FREE_ACCENT_COLORS = new Set(["#3b82f6", "#10b981", "#111111"])
const FREE_TEXT_COLORS = new Set(["#ffffff", "#e0f2fe", "#e5e7eb", "#111111"])
const FREE_THEMES = new Set(["glass", "light"])
const FREE_FONTS = new Set(["Inter", "Nunito"])

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
const reminderSoundRow = reminderSoundToggle ? reminderSoundToggle.closest(".settings__toggle-row") : null
const reminderSoundLevelGroup = reminderSoundLevelSel ? reminderSoundLevelSel.closest(".settings__group") : null
const licensePanel = document.querySelector(".settings__panel--license")
const licenseKeyInput = document.getElementById("licenseKeyInput")
const activateLicenseBtn = document.getElementById("activateLicenseBtn")
const licenseBadge = document.getElementById("licenseBadge")
const licensePlanName = document.getElementById("licensePlanName")
const licenseStateText = document.getElementById("licenseStateText")
const licenseKeyMasked = document.getElementById("licenseKeyMasked")
const licenseActivationMeta = document.getElementById("licenseActivationMeta")
const licenseMessage = document.getElementById("licenseMessage")
const buyFocusProBtn = document.getElementById("buyFocusProBtn")
const licenseHelpBtn = document.getElementById("licenseHelpBtn")
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
let currentLicenseState = createEmptyLicenseState()
let licenseFeedback = { tone: "", text: "" }
let licenseActivationPending = false

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
renderLicensePanel()
setupExternalLicenseActions()
setupLockedSettingsInteractions()
setupPremiumBadges()
void syncLaunchAtStartupState()
void syncLicenseState()

/* ---- Preview bars en tiempo real ---- */
focusSel.addEventListener("change", updateBars)
breakSel.addEventListener("change", updateBars)

function parseDurationValue(value, defaultMinutes) {
    return { seconds: (parseInt(value, 10) || defaultMinutes) * 60, unit: "minutes" }
}

function formatDurationLabel(duration) {
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
        if (isAccentColorLocked(btn.dataset.color)) {
            showPremiumAccessMessage()
            return
        }
        selectedColor = btn.dataset.color
        document.documentElement.style.setProperty("--accent-color", selectedColor)
        updateActiveSwatch(selectedColor)
        updateColorPreview(selectedColor)
    })
})

themeCards.forEach(card => {
    card.addEventListener("click", () => {
        if (isThemeLocked(card.dataset.theme)) {
            showPremiumAccessMessage()
            return
        }
        selectedTheme = card.dataset.theme
        document.documentElement.setAttribute("data-theme", selectedTheme)
        updateActiveThemeCard(selectedTheme)
    })
})

fontCards.forEach(card => {
    card.addEventListener("click", () => {
        if (isFontLocked(card.dataset.font)) {
            showPremiumAccessMessage()
            return
        }
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
        renderLicensePanel()
    })
})

if (licenseKeyInput) {
    licenseKeyInput.addEventListener("input", () => {
        if (licenseFeedback.tone === "error") {
            licenseFeedback = { tone: "", text: "" }
            renderLicensePanel()
        }
    })

    licenseKeyInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault()
            void handleLicenseActivation()
        }
    })
}

if (activateLicenseBtn) {
    activateLicenseBtn.addEventListener("click", () => {
        void handleLicenseActivation()
    })
}

ipcRenderer.on("license-state-updated", (_event, payload) => {
    currentLicenseState = normalizeLicenseState(payload)
    enforceLicenseSelections()
    applyFeatureGating()
    if (currentLicenseState.isPro) {
        licenseFeedback = {
            tone: "success",
            text: i18n.t("settings.license.message.success")
        }
    }
    renderLicensePanel()
})

if (reminderSoundToggle) {
    reminderSoundToggle.addEventListener("change", () => {
        if (!hasLicenseFeature("pomodoroSound")) {
            reminderSoundEnabled = false
            reminderSoundToggle.checked = false
            showPremiumAccessMessage()
            return
        }
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
        if (!hasLicenseFeature("pomodoroSoundIntensity")) {
            reminderSoundLevel = "soft"
            reminderSoundLevelSel.value = reminderSoundLevel
            showPremiumAccessMessage()
            return
        }
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

function createEmptyLicenseState() {
    return {
        planCode: "free",
        planName: "Free",
        status: "inactive",
        isPro: false,
        licenseKeyMasked: "",
        deviceFingerprint: "",
        activatedAt: null,
        features: {}
    }
}

function normalizeLicenseState(payload) {
    return {
        ...createEmptyLicenseState(),
        ...(payload || {}),
        features: {
            ...((payload && payload.features) || {})
        }
    }
}

async function syncLicenseState() {
    try {
        const payload = await ipcRenderer.invoke("get-license-state")
        currentLicenseState = normalizeLicenseState(payload)
        enforceLicenseSelections()
        applyFeatureGating()
        renderLicensePanel()
    } catch (_) {
        licenseFeedback = {
            tone: "error",
            text: i18n.t("settings.license.message.generic")
        }
        renderLicensePanel()
    }
}

function hasLicenseFeature(featureKey) {
    return Boolean(currentLicenseState?.isPro && currentLicenseState?.features?.[featureKey])
}

function isAccentColorLocked(color) {
    return !hasLicenseFeature("customAccentColors") && !FREE_ACCENT_COLORS.has(color)
}

function isTextColorLocked(color) {
    return !hasLicenseFeature("customTextColors") && !FREE_TEXT_COLORS.has(color)
}

function isThemeLocked(theme) {
    return !hasLicenseFeature("customThemes") && !FREE_THEMES.has(theme)
}

function isFontLocked(font) {
    return !hasLicenseFeature("customFonts") && !FREE_FONTS.has(font)
}

function ensureAllowedAccentColor(color) {
    return isAccentColorLocked(color) ? "#3b82f6" : color
}

function ensureAllowedTextColor(color) {
    return isTextColorLocked(color) ? "#ffffff" : color
}

function ensureAllowedTheme(theme) {
    return isThemeLocked(theme) ? "glass" : theme
}

function ensureAllowedFont(font) {
    return isFontLocked(font) ? "Inter" : font
}

function showPremiumAccessMessage() {
    licenseFeedback = {
        tone: "info",
        text: i18n.t("premium.unlock")
    }
    renderLicensePanel()
    if (licensePanel) {
        licensePanel.scrollIntoView({ behavior: "smooth", block: "center" })
    }
}

function setupPremiumBadges() {
    ensurePremiumPill(reminderSoundRow)
    ensurePremiumPill(reminderSoundLevelGroup)
}

function ensurePremiumPill(target) {
    if (!target) return null
    const groupInfo = target.querySelector(".settings__group-info")
    if (!groupInfo) return null
    groupInfo.classList.add("settings__group-info--with-pill")

    let pill = groupInfo.querySelector(".settings__pro-pill")
    if (!pill) {
        pill = document.createElement("span")
        pill.className = "settings__pro-pill"
        groupInfo.appendChild(pill)
    }

    pill.textContent = i18n.t("premium.badge")
    return pill
}

function setLockedState(target, locked, lockedClass) {
    if (!target) return
    target.classList.toggle(lockedClass, locked)
    target.dataset.lockLabel = locked ? i18n.t("premium.badge") : ""
    target.setAttribute("aria-disabled", locked ? "true" : "false")
    target.title = locked ? i18n.t("premium.availableInPro") : ""
}

function applyFeatureGating() {
    swatches.forEach(button => {
        setLockedState(button, isAccentColorLocked(button.dataset.color), "settings__swatch--locked")
    })

    textSwatches.forEach(button => {
        setLockedState(button, isTextColorLocked(button.dataset.color), "settings__swatch--locked")
    })

    themeCards.forEach(card => {
        setLockedState(card, isThemeLocked(card.dataset.theme), "settings__theme-card--locked")
    })

    fontCards.forEach(card => {
        setLockedState(card, isFontLocked(card.dataset.font), "settings__font-card--locked")
    })

    if (reminderSoundRow) {
        reminderSoundRow.classList.toggle("settings__toggle-row--locked", !hasLicenseFeature("pomodoroSound"))
    }

    if (reminderSoundLevelGroup) {
        reminderSoundLevelGroup.classList.toggle("settings__group--locked", !hasLicenseFeature("pomodoroSoundIntensity"))
        reminderSoundLevelSel.disabled = !hasLicenseFeature("pomodoroSoundIntensity")
    }

    const customBgSection = document.querySelector(".settings__custom-bg")
    if (customBgSection) {
        const locked = !hasLicenseFeature("customBackground")
        customBgSection.classList.toggle("settings__custom-bg--locked", locked)
        customBgSection.dataset.lockLabel = locked ? i18n.t("premium.badge") : ""
    }
}

function setupLockedSettingsInteractions() {
    if (reminderSoundRow) {
        reminderSoundRow.addEventListener("click", (event) => {
            if (!hasLicenseFeature("pomodoroSound")) {
                event.preventDefault()
                showPremiumAccessMessage()
            }
        })
    }

    if (reminderSoundLevelGroup) {
        reminderSoundLevelGroup.addEventListener("click", (event) => {
            if (!hasLicenseFeature("pomodoroSoundIntensity")) {
                event.preventDefault()
                showPremiumAccessMessage()
            }
        })
    }
}

function enforceLicenseSelections() {
    selectedColor = ensureAllowedAccentColor(selectedColor)
    selectedTextColor = ensureAllowedTextColor(selectedTextColor)
    selectedTheme = ensureAllowedTheme(selectedTheme)
    selectedFont = ensureAllowedFont(selectedFont)

    if (!hasLicenseFeature("pomodoroSound")) {
        reminderSoundEnabled = false
    }

    if (!hasLicenseFeature("pomodoroSoundIntensity")) {
        reminderSoundLevel = "soft"
    }

    document.documentElement.style.setProperty("--accent-color", selectedColor)
    document.documentElement.setAttribute("data-theme", selectedTheme)
    document.documentElement.style.setProperty("--font-family", `'${selectedFont}', sans-serif`)

    if (reminderSoundToggle) reminderSoundToggle.checked = reminderSoundEnabled
    if (reminderSoundLevelSel) reminderSoundLevelSel.value = reminderSoundLevel

    updateActiveSwatch(selectedColor)
    updateColorPreview(selectedColor)
    updateActiveTextSwatch(selectedTextColor)
    updateTextColorPreview(selectedTextColor)
    updateActiveThemeCard(selectedTheme)
    updateActiveFontCard(selectedFont)
}

function translateLicenseError(code) {
    switch (code) {
        case "MISSING_LICENSE_KEY":
        case "MISSING_FIELDS":
            return i18n.t("settings.license.message.required")
        case "LICENSE_NOT_FOUND":
            return i18n.t("settings.license.message.invalid")
        case "LICENSE_NOT_ACTIVE":
            return i18n.t("settings.license.message.inactive")
        case "DEVICE_LIMIT_REACHED":
            return i18n.t("settings.license.message.limit")
        case "NETWORK_ERROR":
            return i18n.t("settings.license.message.network")
        default:
            return i18n.t("settings.license.message.generic")
    }
}

async function handleLicenseActivation() {
    if (!licenseKeyInput || !activateLicenseBtn) return

    const licenseKey = licenseKeyInput.value.trim()
    if (!licenseKey) {
        licenseFeedback = {
            tone: "error",
            text: i18n.t("settings.license.message.required")
        }
        renderLicensePanel()
        return
    }

    licenseActivationPending = true
    licenseFeedback = { tone: "info", text: i18n.t("settings.license.status.loading") }
    renderLicensePanel()

    try {
        const result = await ipcRenderer.invoke("activate-license", { licenseKey })

        if (result?.ok) {
            currentLicenseState = normalizeLicenseState(result.license)
            licenseFeedback = {
                tone: "success",
                text: i18n.t("settings.license.message.success")
            }
            licenseKeyInput.value = ""
        } else {
            licenseFeedback = {
                tone: "error",
                text: translateLicenseError(result?.code)
            }
        }
    } catch (_) {
        licenseFeedback = {
            tone: "error",
            text: i18n.t("settings.license.message.network")
        }
    } finally {
        licenseActivationPending = false
        renderLicensePanel()
    }
}

function setupExternalLicenseActions() {
    if (buyFocusProBtn) {
        buyFocusProBtn.disabled = !GUMROAD_PRODUCT_URL
        if (GUMROAD_PRODUCT_URL) {
            buyFocusProBtn.addEventListener("click", () => {
                void shell.openExternal(GUMROAD_PRODUCT_URL)
            })
        }
    }

    if (licenseHelpBtn) {
        licenseHelpBtn.disabled = !SUPPORT_URL
        if (SUPPORT_URL) {
            licenseHelpBtn.addEventListener("click", () => {
                void shell.openExternal(SUPPORT_URL)
            })
        }
    }
}

function getLicenseBadgeKey(tone) {
    if (tone === "pro") return "settings.license.badge.pro"
    if (tone === "error") return "settings.license.badge.error"
    if (tone === "loading") return "settings.license.badge.loading"
    return "settings.license.badge.free"
}

function getLicenseStatusKey(tone) {
    if (tone === "pro") return "settings.license.status.pro"
    if (tone === "error") return "settings.license.status.error"
    if (tone === "loading") return "settings.license.status.loading"
    return "settings.license.status.free"
}

function renderLicensePanel() {
    if (!licenseBadge || !licensePlanName || !licenseStateText || !licenseKeyMasked || !licenseActivationMeta || !licenseMessage || !licenseKeyInput || !activateLicenseBtn) {
        return
    }

    const isPro = Boolean(currentLicenseState?.isPro)
    const tone = licenseActivationPending ? "loading" : licenseFeedback.tone === "error" ? "error" : isPro ? "pro" : "free"

    licenseBadge.className = `settings__license-badge settings__license-badge--${tone}`
    licenseBadge.textContent = i18n.t(getLicenseBadgeKey(tone))
    licensePlanName.textContent = isPro
        ? (currentLicenseState.planName || i18n.t("settings.license.plan.pro"))
        : i18n.t("settings.license.plan.free")
    licenseStateText.textContent = i18n.t(getLicenseStatusKey(tone))

    licenseKeyMasked.textContent = currentLicenseState?.licenseKeyMasked
        ? i18n.t("settings.license.key.active", { key: currentLicenseState.licenseKeyMasked })
        : i18n.t("settings.license.key.none")

    licenseActivationMeta.textContent = currentLicenseState?.activatedAt
        ? i18n.t("settings.license.activatedAt", { date: formatLicenseDate(currentLicenseState.activatedAt) })
        : i18n.t("settings.license.machine")

    licenseMessage.className = "settings__license-message"
    if (licenseFeedback.text) {
        licenseMessage.textContent = licenseFeedback.text
        licenseMessage.classList.add(`settings__license-message--${licenseFeedback.tone || "info"}`)
    } else {
        licenseMessage.textContent = ""
    }

    licenseKeyInput.disabled = licenseActivationPending || isPro
    activateLicenseBtn.disabled = licenseActivationPending || isPro
    activateLicenseBtn.textContent = licenseActivationPending
        ? i18n.t("settings.license.activating")
        : isPro
            ? i18n.t("settings.license.badge.pro")
            : i18n.t("settings.license.activate")

    if (buyFocusProBtn) {
        buyFocusProBtn.hidden = isPro
    }
}

function formatLicenseDate(value) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    return new Intl.DateTimeFormat(selectedLanguage === "en" ? "en-US" : "es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date)
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

/* ---- Fondo personalizado ---- */
const customBgPickBtn   = document.getElementById("customBgPickBtn")
const customBgRemoveBtn = document.getElementById("customBgRemoveBtn")
const customBgImg        = document.getElementById("customBgImg")
const customBgPlaceholder = document.getElementById("customBgPlaceholder")
let customBgPath = localStorage.getItem("customBgPath") || ""

function refreshCustomBgPreview() {
    if (customBgPath) {
        const fileUrl = "file:///" + customBgPath.replace(/\\/g, "/")
        customBgImg.src = fileUrl
        customBgImg.style.display = "block"
        customBgPlaceholder.style.display = "none"
        customBgRemoveBtn.style.display = ""
    } else {
        customBgImg.src = ""
        customBgImg.style.display = "none"
        customBgPlaceholder.style.display = ""
        customBgRemoveBtn.style.display = "none"
    }
}
refreshCustomBgPreview()

if (customBgPickBtn) {
    customBgPickBtn.addEventListener("click", async () => {
        if (!hasLicenseFeature("customBackground")) {
            showPremiumAccessMessage()
            return
        }
        const result = await ipcRenderer.invoke("select-custom-bg")
        if (result && !result.canceled && result.filePath) {
            customBgPath = result.filePath
            refreshCustomBgPreview()
        }
    })
}

if (customBgRemoveBtn) {
    customBgRemoveBtn.addEventListener("click", async () => {
        if (!hasLicenseFeature("customBackground")) {
            showPremiumAccessMessage()
            return
        }
        await ipcRenderer.invoke("remove-custom-bg")
        customBgPath = ""
        refreshCustomBgPreview()
    })
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
        if (isTextColorLocked(btn.dataset.color)) {
            showPremiumAccessMessage()
            return
        }
        selectedTextColor = btn.dataset.color
        document.documentElement.style.setProperty("--text-color", selectedTextColor)
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
    enforceLicenseSelections()

    localStorage.setItem("focusDuration",  focusSel.value)
    localStorage.setItem("breakDuration",  breakSel.value)
    localStorage.setItem("accentColor",    selectedColor)
    localStorage.setItem("textColor",      selectedTextColor)
    localStorage.setItem("dashTheme",      selectedTheme)
    localStorage.setItem("fontFamily",     selectedFont)
    localStorage.setItem("customBgPath",   customBgPath)
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
        customBgPath,
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
