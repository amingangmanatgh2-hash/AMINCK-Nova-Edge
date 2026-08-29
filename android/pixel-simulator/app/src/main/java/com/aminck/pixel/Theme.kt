package com.aminck.pixel

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Geometric Balance Design System
val Bg = Color(0xFF1A1C1E)
val Container = Color(0xFF2D2E30)
val Container2 = Color(0xFF353638)
val Border = Color(0xFF4A4C4E)
val TextHi = Color(0xFFE9EAEC)
val TextMed = Color(0xFFB9BCBE)
val TextLow = Color(0xFF7F8285)

val Pastel = Color(0xFFD3E4FF)
val PastelInk = Color(0xFF001C3B)
val WeatherBadge = Color(0xFF004A77)

val PixelBlue = Color(0xFF8AB4F8)
val PixelGreen = Color(0xFF81C995)
val PixelYellow = Color(0xFFFDD663)
val PixelRed = Color(0xFFF28B82)
val PixelPurple = Color(0xFFC58AF9)
val PixelTeal = Color(0xFF78D0EC)
val PixelOrange = Color(0xFFF8A96C)
val Accent = PixelBlue

@Composable
fun PixelTheme(content: @Composable () -> Unit) {
    val scheme = darkColorScheme(
        primary = Accent,
        onPrimary = Color(0xFF0B1522),
        secondary = PixelTeal,
        background = Bg,
        onBackground = TextHi,
        surface = Container,
        onSurface = TextHi,
        surfaceVariant = Container2,
        onSurfaceVariant = TextMed,
        outline = Border,
        error = PixelRed,
    )
    MaterialTheme(colorScheme = scheme, content = content)
}
