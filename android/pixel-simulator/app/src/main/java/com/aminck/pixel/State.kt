package com.aminck.pixel

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color

enum class Glyph {
    GEMINI, STUDIO, CAMERA, RECORDER, WEATHER, PHONE, MESSAGES, PHOTOS,
    MUSIC, NOTES, CALC, CLOCK, SETTINGS
}

enum class AppId(val label: String, val glyph: Glyph, val tint: Color) {
    GEMINI("Gemini Live", Glyph.GEMINI, PixelPurple),
    STUDIO("Pixel Studio", Glyph.STUDIO, PixelBlue),
    CAMERA("Camera", Glyph.CAMERA, Color(0xFF3C4043)),
    RECORDER("Recorder", Glyph.RECORDER, Color(0xFF4A2C2A)),
    WEATHER("Weather", Glyph.WEATHER, PixelTeal),
    PHONE("Phone", Glyph.PHONE, PixelGreen),
    MESSAGES("Messages", Glyph.MESSAGES, PixelBlue),
    PHOTOS("Photos", Glyph.PHOTOS, Color(0xFF3B2E50)),
    MUSIC("Music", Glyph.MUSIC, PixelOrange),
    NOTES("Notes", Glyph.NOTES, PixelYellow),
    CALC("Calculator", Glyph.CALC, Color(0xFF2E3A46)),
    CLOCK("Clock", Glyph.CLOCK, PixelTeal),
    SETTINGS("Settings", Glyph.SETTINGS, Color(0xFF3A3D40))
}

enum class Face { FRONT, BACK }
enum class ScreenState { LOCKED, UNLOCKED, OFF }
enum class Shade { CLOSED, QS }

data class GalleryPhoto(val title: String, val colors: List<Color>)
data class Alarm(val time: String, val label: String, enabled: Boolean)

class PixelState {
    var face by mutableStateOf(Face.FRONT)
    var screen by mutableStateOf(ScreenState.LOCKED)
    var activeApp by mutableStateOf<AppId?>(null)
    var shade by mutableStateOf(Shade.CLOSED)
    var showRecents by mutableStateOf(false)
    var brightness by mutableStateOf(0.62f)

    var wifi by mutableStateOf(true)
    var bluetooth by mutableStateOf(true)
    var dnd by mutableStateOf(false)
    var flashlight by mutableStateOf(false)
    var airplane by mutableStateOf(false)
    var darkTheme by mutableStateOf(true)
    var batterySaver by mutableStateOf(false)
    var location by mutableStateOf(true)
    var battery by mutableStateOf(87)
    var youColor by mutableStateOf(PixelBlue)

    val recents = mutableStateListOf<AppId>()
    var notes by mutableStateOf("Shopping list\n- Pixel 10 Pro Max case\n- Titanium polish cloth\n- USB-C cable")
    var alarms = mutableStateListOf(
        Alarm("07:00", "Wake up", true),
        Alarm("08:30", "Morning run", false)
    )
    var unread by mutableStateOf(2)

    val gallery = listOf(
        GalleryPhoto("Night skyline", listOf(Color(0xFF0B1026), Color(0xFF1E3A8A), Color(0xFF8AB4F8))),
        GalleryPhoto("Sunset trail", listOf(Color(0xFF7C2D12), Color(0xFFF8A96C), Color(0xFFFDD663))),
        GalleryPhoto("Forest mist", listOf(Color(0xFF0F2A1D), Color(0xFF81C995), Color(0xFFD3E4FF))),
        GalleryPhoto("Ocean waves", listOf(Color(0xFF06283D), Color(0xFF78D0EC), Color(0xFFDFF6FF))),
        GalleryPhoto("Neon city", listOf(Color(0xFF2A0A3E), Color(0xFFC58AF9), Color(0xFFF28B82))),
        GalleryPhoto("Desert dunes", listOf(Color(0xFF78350F), Color(0xFFFBBF24), Color(0xFFFDE68A)))
    )

    fun open(app: AppId) {
        shade = Shade.CLOSED
        showRecents = false
        if (app == AppId.MESSAGES) unread = 0
        activeApp = app
        screen = ScreenState.UNLOCKED
        if (recents.lastOrNull() != app) {
            recents.remove(app)
            recents.add(app)
            if (recents.size > 6) recents.removeAt(0)
        }
    }

    fun unlock() {
        screen = ScreenState.UNLOCKED
        shade = Shade.CLOSED
        showRecents = false
        activeApp = null
    }

    fun lock() {
        screen = ScreenState.LOCKED
        shade = Shade.CLOSED
        showRecents = false
        activeApp = null
    }

    fun home() {
        shade = Shade.CLOSED
        showRecents = false
        activeApp = null
        screen = ScreenState.UNLOCKED
    }

    fun recents() {
        shade = Shade.CLOSED
        showRecents = !showRecents
    }

    fun flipToBack() {
        face = Face.BACK
    }

    fun back() {
        when {
            showRecents -> showRecents = false
            shade != Shade.CLOSED -> shade = Shade.CLOSED
            activeApp != null -> activeApp = null
        }
    }
}
