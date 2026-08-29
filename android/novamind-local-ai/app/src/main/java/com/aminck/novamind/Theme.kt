package com.aminck.novamind

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val NvBg = Color(0xFF0D1117)
val NvSurface = Color(0xFF161B22)
val NvSurface2 = Color(0xFF1F2630)
val NvBorder = Color(0xFF2D343E)
val NvText = Color(0xFFE6EDF3)
val NvTextDim = Color(0xFF9AA5B1)
val NvMint = Color(0xFF43E97B)
val NvCyan = Color(0xFF38F9D7)
val NvBlue = Color(0xFF64B5F6)
val NvViolet = Color(0xFFB388FF)
val NvAmber = Color(0xFFFFC857)
val NvRed = Color(0xFFFF6B6B)

@Composable
fun NovaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = NvMint,
            secondary = NvCyan,
            background = NvBg,
            surface = NvSurface,
            surfaceVariant = NvSurface2,
            onBackground = NvText,
            onSurface = NvText,
            outline = NvBorder,
            error = NvRed
        ),
        content = content
    )
}
