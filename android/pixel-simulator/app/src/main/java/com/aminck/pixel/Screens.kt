package com.aminck.pixel

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/* ----------------------------- LOCK SCREEN ----------------------------- */

@Composable
fun LockScreen(state: PixelState) {
    val time = rememberTime()
    val date = LocalDate.now().format(DateTimeFormatter.ofPattern("EEE, d MMM", Locale.ENGLISH))
    val pulse = rememberInfiniteTransition(label = "fp")
    val fpAlpha by pulse.animateFloat(
        0.35f, 0.9f,
        infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "fpa"
    )

    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(listOf(Color(0xFF0E1626), Color(0xFF1A1C1E), Color(0xFF111315)))
            )
    ) {
        Canvas(Modifier.fillMaxSize()) {
            for (i in 0 until 12) {
                drawCircle(
                    listOf(PixelBlue, PixelPurple, PixelTeal)[i % 3].copy(alpha = 0.06f),
                    radius = 40f + i * 38f,
                    center = Offset(size.width * 0.8f, size.height * 0.2f),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(2f)
                )
            }
        }

        Column(
            Modifier
                .fillMaxSize()
                .padding(top = 90.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(time.hhmm(), fontSize = 74.sp, fontWeight = FontWeight.Thin, color = TextHi)
            Text(date, fontSize = 15.sp, color = TextMed, fontWeight = FontWeight.Medium)

            Spacer(Modifier.height(34.dp))

            // Smart notification card
            Row(
                Modifier
                    .fillMaxWidth(0.86f)
                    .clip(RoundedCornerShape(20.dp))
                    .background(Container.copy(alpha = 0.9f))
                    .border(1.dp, Border, RoundedCornerShape(20.dp))
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(Modifier.size(34.dp).clip(CircleShape).background(PixelPurple), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.AutoAwesome, null, tint = Color.White, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.width(10.dp))
                Column {
                    Text("Gemini Live", color = TextHi, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Text("Your day looks clear — 21° at 3pm.", color = TextMed, fontSize = 11.sp)
                }
            }
        }

        // Fingerprint scanner
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 70.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                Modifier
                    .size(58.dp)
                    .clip(CircleShape)
                    .background(PixelBlue.copy(alpha = fpAlpha * 0.25f))
                    .border(2.dp, PixelBlue.copy(alpha = fpAlpha), CircleShape)
                    .clickableNoRipple { state.unlock() },
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Filled.Fingerprint, "Fingerprint unlock", tint = PixelBlue.copy(alpha = fpAlpha + 0.1f), modifier = Modifier.size(32.dp))
            }
            Spacer(Modifier.height(10.dp))
            Text("Touch & hold to unlock", color = TextMed, fontSize = 12.sp)
            Spacer(Modifier.height(6.dp))
            Row(
                Modifier.clickableNoRipple { state.unlock() },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.KeyboardArrowUp, null, tint = TextLow, modifier = Modifier.size(18.dp))
                Text("or swipe up", color = TextLow, fontSize = 11.sp)
            }
        }
    }
}

/* ------------------------------ HOME SCREEN ----------------------------- */

@Composable
fun HomeScreen(state: PixelState) {
    val date = LocalDate.now().format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.ENGLISH))
    Column(
        Modifier
            .fillMaxSize()
            .background(Bg)
            .padding(horizontal = 16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Spacer(Modifier.height(58.dp))

        // At a Glance pastel card
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(26.dp))
                .background(Pastel)
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("At a Glance", color = PastelInk, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(date, color = PastelInk, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Text("No alarms · Traffic is light", color = Color(0xFF33506E), fontSize = 11.sp)
            }
            // Weather badge
            Box(
                Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(WeatherBadge)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.WbSunny, null, tint = Color.White, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("21°", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(Modifier.height(20.dp))

        // Geometric squircle app grid
        val gridApps = AppId.values().filter {
            it !in listOf(AppId.PHONE, AppId.MESSAGES, AppId.CAMERA, AppId.GEMINI)
        }
        Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
            gridApps.chunked(3).forEach { rowApps ->
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    rowApps.forEach { app ->
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier
                                .width(86.dp)
                                .clickableNoRipple { state.open(app) }
                        ) {
                            AppIcon(app, 54.dp)
                            Spacer(Modifier.height(5.dp))
                            Text(
                                app.label,
                                color = TextHi,
                                fontSize = 10.5.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                    if (rowApps.size < 3) repeat(3 - rowApps.size) { Spacer(Modifier.width(86.dp)) }
                }
            }
        }

        Spacer(Modifier.height(24.dp))

        // Google capsule search bar
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(50))
                .background(Container)
                .border(1.dp, Border, RoundedCornerShape(50))
                .clickableNoRipple { state.open(AppId.GEMINI) }
                .padding(horizontal = 16.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("G", color = PixelBlue, fontSize = 18.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.width(10.dp))
            Text("Ask Gemini or search Pixel…", color = TextLow, fontSize = 13.sp)
            Spacer(Modifier.weight(1f))
            Icon(Icons.Filled.Mic, null, tint = TextMed, modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(10.dp))
            Icon(Icons.Filled.CameraAlt, null, tint = TextMed, modifier = Modifier.size(17.dp))
        }

        Spacer(Modifier.height(70.dp))

        // Floating dock
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(30.dp))
                .background(Color(0xFF252729).copy(alpha = 0.95f))
                .border(1.dp, Border, RoundedCornerShape(30.dp))
                .padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            listOf(AppId.PHONE, AppId.MESSAGES, AppId.CAMERA, AppId.GEMINI).forEach { app ->
                Box(Modifier.clickableNoRipple { state.open(app) }) {
                    AppIcon(app, 52.dp)
                }
            }
        }
        Spacer(Modifier.height(58.dp))
    }
}

@Composable
fun AppIcon(app: AppId, size: androidx.compose.ui.unit.Dp = 52.dp) {
    val shape = when (app.glyph) {
        Glyph.WEATHER, Glyph.MUSIC, Glyph.CLOCK -> RoundedCornerShape(percent = 50) // circle
        Glyph.PHOTOS, Glyph.NOTES, Glyph.STUDIO -> RoundedCornerShape(14.dp)         // diamond-ish
        Glyph.RECORDER, Glyph.MESSAGES -> RoundedCornerShape(50)                      // capsule
        else -> RoundedCornerShape(18.dp)                                             // squircle
    }
    Box(
        Modifier
            .size(size)
            .clip(shape)
            .background(app.tint)
            .border(1.dp, Color.White.copy(alpha = 0.12f), shape),
        contentAlignment = Alignment.Center
    ) {
        GlyphArt(app.glyph, size * 0.5f)
    }
}

@Composable
internal fun GlyphArt(glyph: Glyph, tint: androidx.compose.ui.unit.Dp) {
    when (glyph) {
        Glyph.GEMINI -> Spark(tint)
        Glyph.STUDIO -> Icon(Icons.Filled.AutoFixHigh, null, tint = Color.White, modifier = Modifier.size(tint))
        Glyph.CAMERA -> Icon(Icons.Filled.PhotoCamera, null, tint = Color.White, modifier = Modifier.size(tint))
        Glyph.RECORDER -> Icon(Icons.Filled.Mic, null, tint = Color.White, modifier = Modifier.size(tint))
        Glyph.WEATHER -> Icon(Icons.Filled.Cloud, null, tint = Color.White, modifier = Modifier.size(tint))
        Glyph.PHONE -> Icon(Icons.Filled.Phone, null, tint = Color.White, modifier = Modifier.size(tint))
        Glyph.MESSAGES -> Icon(Icons.Filled.ChatBubble, null, tint = Color.White, modifier = Modifier.size(tint))
        Glyph.PHOTOS -> Icon(Icons.Filled.PhotoLibrary, null, tint = Color.White, modifier = Modifier.size(tint))
        Glyph.MUSIC -> Icon(Icons.Filled.MusicNote, null, tint = Color(0xFF4A2C00), modifier = Modifier.size(tint))
        Glyph.NOTES -> Icon(Icons.Filled.StickyNote2, null, tint = Color(0xFF4A3B00), modifier = Modifier.size(tint))
        Glyph.CALC -> Icon(Icons.Filled.Calculate, null, tint = Color.White, modifier = Modifier.size(tint))
        Glyph.CLOCK -> Icon(Icons.Filled.Schedule, null, tint = Color.White, modifier = Modifier.size(tint))
        Glyph.SETTINGS -> Icon(Icons.Filled.Settings, null, tint = Color.White, modifier = Modifier.size(tint))
    }
}

@Composable
private fun Spark(size: androidx.compose.ui.unit.Dp) {
    Canvas(Modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val cx = w / 2; val cy = h / 2
        val path = androidx.compose.ui.graphics.Path().apply {
            moveTo(cx, 0f);
            quadraticBezierTo(cx + w * 0.12f, cy - h * 0.12f, w, cy)
            quadraticBezierTo(cx + w * 0.12f, cy + h * 0.12f, cx, h)
            quadraticBezierTo(cx - w * 0.12f, cy + h * 0.12f, 0f, cy)
            quadraticBezierTo(cx - w * 0.12f, cy - h * 0.12f, cx, 0f)
        }
        drawPath(path, Color.White)
    }
}

/* -------------------------- QUICK SETTINGS SHADE ------------------------- */

data class QSToggle(val label: String, val icon: ImageVector, val get: (PixelState) -> Boolean, val set: (PixelState, Boolean) -> Unit)

private val qsToggles = listOf(
    QSToggle("Wi-Fi", Icons.Filled.Wifi, { it.wifi }, { s, v -> s.wifi = v }),
    QSToggle("Bluetooth", Icons.Filled.Bluetooth, { it.bluetooth }, { s, v -> s.bluetooth = v }),
    QSToggle("Do Not Disturb", Icons.Filled.DoNotDisturbOn, { it.dnd }, { s, v -> s.dnd = v }),
    QSToggle("Flashlight", Icons.Filled.FlashlightOn, { it.flashlight }, { s, v -> s.flashlight = v }),
    QSToggle("Airplane", Icons.Filled.Flight, { it.airplane }, { s, v -> s.airplane = v }),
    QSToggle("Dark Theme", Icons.Filled.DarkMode, { it.darkTheme }, { s, v -> s.darkTheme = v }),
    QSToggle("Battery Saver", Icons.Filled.BatterySaver, { it.batterySaver }, { s, v -> s.batterySaver = v }),
    QSToggle("Location", Icons.Filled.LocationOn, { it.location }, { s, v -> s.location = v })
)

@Composable
fun QuickSettingsShade(state: PixelState) {
    val time = rememberTime()
    val date = LocalDate.now().format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.ENGLISH))
    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF101214).copy(alpha = 0.7f))
            .clickableNoRipple { state.shade = Shade.CLOSED }
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .clickableNoRipple { /* consume */ }
                .clip(RoundedCornerShape(bottomStart = 30.dp, bottomEnd = 30.dp))
                .background(Container)
                .padding(18.dp)
        ) {
            Spacer(Modifier.height(36.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(time.hhmm(), color = TextHi, fontSize = 26.sp, fontWeight = FontWeight.Light)
                    Text(date, color = TextMed, fontSize = 12.sp)
                }
                Box(Modifier.size(38.dp).clip(CircleShape).background(PixelBlue), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Person, null, tint = Color(0xFF0B1522), modifier = Modifier.size(20.dp))
                }
            }
            Spacer(Modifier.height(14.dp))

            // Brightness slider
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(50))
                    .background(Container2)
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.BrightnessLow, null, tint = TextMed, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                androidx.compose.material3.Slider(
                    value = state.brightness,
                    onValueChange = { state.brightness = it },
                    modifier = Modifier.weight(1f)
                )
                Spacer(Modifier.width(8.dp))
                Icon(Icons.Filled.BrightnessHigh, null, tint = TextHi, modifier = Modifier.size(20.dp))
            }

            Spacer(Modifier.height(16.dp))

            qsToggles.chunked(2).forEach { pair ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 5.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    pair.forEach { t ->
                        QSChip(t, state, Modifier.weight(1f))
                    }
                }
            }

            Spacer(Modifier.height(14.dp))
            Text("NOTIFICATIONS", color = TextLow, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            NotifRow(Icons.Filled.MusicNote, "Music", "Nova — Midnight Drive • playing", PixelOrange)
            NotifRow(Icons.Filled.Cloud, "Weather", "Clear skies · 21° · AQI good", PixelTeal)
            Spacer(Modifier.height(10.dp))
            // drag handle / close
            Box(
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .width(120.dp)
                    .height(5.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Border)
                    .clickableNoRipple { state.shade = Shade.CLOSED }
            )
        }
    }
}

@Composable
private fun QSChip(t: QSToggle, state: PixelState, modifier: Modifier) {
    val on = t.get(state)
    Row(
        modifier
            .clip(RoundedCornerShape(20.dp))
            .background(if (on) PixelBlue.copy(alpha = 0.22f) else Container2)
            .border(1.dp, if (on) PixelBlue.copy(alpha = 0.6f) else Border, RoundedCornerShape(20.dp))
            .clickableNoRipple { t.set(state, !on) }
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(t.icon, null, tint = if (on) PixelBlue else TextMed, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(t.label, color = if (on) TextHi else TextMed, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun NotifRow(icon: ImageVector, title: String, body: String, tint: Color) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Container2)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(30.dp).clip(CircleShape).background(tint.copy(alpha = 0.25f)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column {
            Text(title, color = TextHi, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text(body, color = TextMed, fontSize = 11.sp)
        }
    }
}

/* --------------------------- RECENTS SWITCHER --------------------------- */

@Composable
fun RecentsSwitcher(state: PixelState) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF0D0E10).copy(alpha = 0.92f))
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(60.dp))
            Text("Recent apps", color = TextMed, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(16.dp))
            if (state.recents.isEmpty()) {
                Text("No recent apps", color = TextLow, fontSize = 12.sp)
            }
            state.recents.reversed().forEach { app ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(vertical = 7.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(Container)
                        .border(1.dp, Border, RoundedCornerShape(24.dp))
                        .clickableNoRipple { state.open(app) }
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    AppIcon(app, 46.dp)
                    Spacer(Modifier.width(14.dp))
                    Text(app.label, color = TextHi, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.weight(1f))
                    Icon(
                        Icons.Filled.Close, null, tint = TextLow,
                        modifier = Modifier.size(18.dp).clickableNoRipple { state.recents.remove(app) }
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(
                Modifier
                    .clip(RoundedCornerShape(50))
                    .background(Container2)
                    .clickableNoRipple { state.home() }
                    .padding(horizontal = 20.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.Home, null, tint = TextHi, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text("Home", color = TextHi, fontSize = 13.sp)
            }
            Spacer(Modifier.height(60.dp))
        }
    }
}
