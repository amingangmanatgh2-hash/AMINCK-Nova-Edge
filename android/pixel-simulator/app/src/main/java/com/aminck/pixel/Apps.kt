package com.aminck.pixel

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlin.math.roundToInt
import kotlin.random.Random

/* ------------------------------- ROUTER -------------------------------- */

@Composable
fun AppScreen(app: AppId, state: PixelState) {
    Box(Modifier.fillMaxSize().background(Bg)) {
        when (app) {
            AppId.GEMINI -> GeminiApp(state)
            AppId.STUDIO -> StudioApp(state)
            AppId.CAMERA -> CameraApp(state)
            AppId.RECORDER -> RecorderApp(state)
            AppId.WEATHER -> WeatherApp(state)
            AppId.PHONE -> PhoneApp(state)
            AppId.MESSAGES -> MessagesApp(state)
            AppId.PHOTOS -> PhotosApp(state)
            AppId.MUSIC -> MusicApp(state)
            AppId.NOTES -> NotesApp(state)
            AppId.CALC -> CalcApp(state)
            AppId.CLOCK -> ClockApp(state)
            AppId.SETTINGS -> SettingsApp(state)
        }
    }
}

@Composable
fun AppScaffold(
    state: PixelState,
    title: String,
    tint: Color,
    glyph: Glyph,
    onShade: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        // handle / status pull zone
        Box(
            Modifier
                .fillMaxWidth()
                .height(38.dp)
                .clickableNoRipple {
                    if (onShade != null) onShade() else state.shade = Shade.QS
                },
            contentAlignment = Alignment.Center
        ) {
            Box(Modifier.width(36.dp).height(4.dp).clip(RoundedCornerShape(50)).background(Border))
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(13.dp)).background(tint),
                contentAlignment = Alignment.Center
            ) { GlyphArt(glyph, 22.dp) }
            Spacer(Modifier.width(10.dp))
            Text(title, color = TextHi, fontSize = 19.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Box(
                Modifier.size(32.dp).clip(CircleShape).background(Container).clickableNoRipple { state.home() },
                contentAlignment = Alignment.Center
            ) { Icon(Icons.Filled.Home, null, tint = TextMed, modifier = Modifier.size(16.dp)) }
        }
        Spacer(Modifier.height(6.dp))
        content()
        Spacer(Modifier.height(64.dp))
    }
}

/* ------------------------------ GEMINI LIVE ---------------------------- */

data class ChatMsg(val fromAi: Boolean, val text: String)

private fun geminiReply(state: PixelState, q: String): String {
    val s = q.lowercase()
    return when {
        "weather" in s || "آب" in s -> "It’s 21° and sunny in Frankfurt — perfect light for the 42MP Tensor Vision camera."
        "tensor" in s || "g5" in s -> "Tensor G5 is built on 3nm Titan architecture with on-device Gemini Nano — everything runs privately on your Pixel."
        "photo" in s || "camera" in s -> "Try Night Sight for low light, Portrait for that titanium bokeh, or 5x Super Res Zoom. Want me to open Camera?"
        "battery" in s -> "Your 5,800 mAh battery is at ${state.battery}% — Battery Saver can extend it. Check Settings for details."
        "hello" in s || "hi" in s || "salam" in s -> "Hey! I’m Gemini Live — ask me to summarize, translate, plan, or just chat. I run fully on-device."
        "music" in s -> "You’re 42 seconds into “Midnight Drive”. Say the word and I’ll queue something upbeat."
        else -> "On-device Gemini Nano processed that in 0.4s. Your Pixel 10 Pro Max pairs titanium hardware with Pixel Experience intelligence — explore Camera, Studio, or Settings?"
    }
}

@Composable
fun GeminiApp(state: PixelState) {
    var msgs by remember { mutableStateOf(listOf(
        ChatMsg(true, "Hi, I’m Gemini Live — your on-device AI. Ask me anything, or tap a suggestion.")
    )) }
    var input by remember { mutableStateOf("") }
    var listening by remember { mutableStateOf(false) }
    AppScaffold(state, "Gemini Live", PixelPurple, Glyph.GEMINI) {
        msgs.forEach { m ->
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 4.dp),
                horizontalArrangement = if (m.fromAi) Arrangement.Start else Arrangement.End
            ) {
                Box(
                    Modifier
                        .widthIn(max = 250.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(if (m.fromAi) Container else PixelPurple)
                        .padding(horizontal = 14.dp, vertical = 10.dp)
                ) {
                    Text(
                        m.text,
                        color = if (m.fromAi) TextHi else Color.White,
                        fontSize = 13.sp,
                        lineHeight = 18.sp
                    )
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf("What’s the weather?", "Tell me about Tensor G5", "Take a great photo", "Battery tips").forEach {
                Box(
                    Modifier
                        .clip(RoundedCornerShape(50))
                        .background(Container)
                        .border(1.dp, Border, RoundedCornerShape(50))
                        .clickableNoRipple {
                            msgs = msgs + ChatMsg(false, it) + ChatMsg(true, geminiReply(state, it))
                        }
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                ) { Text(it, color = TextMed, fontSize = 11.sp) }
            }
        }

        Spacer(Modifier.height(12.dp))
        Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(50))
                    .background(Container)
                    .border(1.dp, Border, RoundedCornerShape(50))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                BasicTextField(
                    value = input,
                    onValueChange = { input = it },
                    textStyle = TextStyle(color = TextHi, fontSize = 13.sp),
                    singleLine = true,
                    decorationBox = { inner ->
                        if (input.isEmpty()) Text("Message Gemini…", color = TextLow, fontSize = 13.sp)
                        inner()
                    }
                )
            }
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.size(46.dp).clip(CircleShape)
                    .background(if (listening) PixelRed else PixelPurple)
                    .clickableNoRipple {
                        if (input.isNotBlank()) {
                            val q = input
                            msgs = msgs + ChatMsg(false, q) + ChatMsg(true, geminiReply(state, q))
                            input = ""
                        } else {
                            listening = !listening
                            if (listening) {
                                msgs = msgs + ChatMsg(true, "🎙 Listening… (voice runs on Tensor G5, fully offline)")
                            }
                        }
                    },
                contentAlignment = Alignment.Center
            ) { Icon(if (input.isNotBlank()) Icons.Filled.Send else Icons.Filled.Mic, null, tint = Color.White, modifier = Modifier.size(20.dp)) }
        }
        if (listening) {
            LiveWave(PixelPurple)
        }
    }
}

@Composable
fun LiveWave(color: Color) {
    val inf = rememberInfiniteTransition(label = "w")
    val phase by inf.animateFloat(0f, 100f, infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Restart), label = "wp")
    Row(
        Modifier.fillMaxWidth().padding(16.dp).height(34.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val n = 40
            val gap = size.width / n
            for (i in 0 until n) {
                val h = (8f + 22f * (0.5f + 0.5f * Math.sin((i + phase / 4).toDouble()))).toFloat()
                drawRect(
                    color = color,
                    topLeft = Offset(i * gap + gap / 4, size.height / 2 - h / 2),
                    size = androidx.compose.ui.geometry.Size(gap / 2, h)
                )
            }
        }
    }
}

/* ----------------------------- PIXEL STUDIO ---------------------------- */

@Composable
fun StudioApp(state: PixelState) {
    var seed by remember { mutableStateOf(42) }
    var style by remember { mutableStateOf("Geometric") }
    var erased by remember { mutableStateOf(false) }
    val styles = listOf("Geometric", "Pastel", "Neon", "Mono")
    AppScaffold(state, "Pixel Studio", PixelBlue, Glyph.STUDIO) {
        Box(
            Modifier
                .padding(horizontal = 14.dp)
                .fillMaxWidth()
                .height(260.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0xFF101214))
                .border(1.dp, Border, RoundedCornerShape(24.dp))
        ) {
            Canvas(Modifier.fillMaxSize()) {
                val rnd = Random(seed.toLong() + styles.indexOf(style) * 1000)
                val palette = when (style) {
                    "Pastel" -> listOf(Color(0xFFD3E4FF), Color(0xFFFFD6E7), Color(0xFFD9F2D0), Color(0xFFFFE9C7))
                    "Neon" -> listOf(Color(0xFF00E5FF), Color(0xFFFF00C8), Color(0xFFB6FF00), Color(0xFF8A6BFF))
                    "Mono" -> listOf(Color(0xFFE9EAEC), Color(0xFF9A9D9F), Color(0xFF5A5D5F), Color(0xFF2D2E30))
                    else -> listOf(PixelBlue, PixelPurple, PixelTeal, PixelYellow)
                }
                // geometric composition: circles, diamonds, rings, capsules
                repeat(14) { i ->
                    val c = palette[i % palette.size]
                    val x = rnd.nextFloat() * size.width
                    val y = rnd.nextFloat() * size.height
                    val r = 18f + rnd.nextFloat() * 60f
                    when (i % 4) {
                        0 -> drawCircle(c, r, Offset(x, y), alpha = 0.85f)
                        1 -> {
                            drawCircle(c.copy(alpha = 0.15f), r, Offset(x, y))
                            drawCircle(c, r, Offset(x, y), style = androidx.compose.ui.graphics.drawscope.Stroke(6f))
                        }
                        2 -> {
                            val p = Path().apply {
                                moveTo(x, y - r); lineTo(x + r, y); lineTo(x, y + r); lineTo(x - r, y); close()
                            }
                            drawPath(p, c.copy(alpha = 0.8f))
                        }
                        else -> drawRoundRect(
                            c,
                            topLeft = Offset(x - r, y - r / 3),
                            size = androidx.compose.ui.geometry.Size(r * 2, r / 1.6f),
                            cornerRadius = androidx.compose.ui.geometry.CornerRadius(40f, 40f),
                            alpha = 0.8f
                        )
                    }
                }
                if (erased) {
                    drawCircle(Color(0xFF101214), 70f, Offset(size.width * 0.7f, size.height * 0.3f))
                }
            }
            Box(
                Modifier.align(Alignment.TopStart).padding(10.dp)
                    .clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.55f))
                    .padding(horizontal = 10.dp, vertical = 5.dp)
            ) { Text("AI Canvas · seed #$seed · $style", color = Color.White, fontSize = 10.sp) }
        }

        Spacer(Modifier.height(12.dp))
        Row(Modifier.padding(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            styles.forEach { s ->
                Box(
                    Modifier
                        .clip(RoundedCornerShape(50))
                        .background(if (s == style) PixelBlue else Container)
                        .clickableNoRipple { style = s; erased = false }
                        .padding(horizontal = 14.dp, vertical = 8.dp)
                ) { Text(s, color = if (s == style) Color(0xFF0B1522) else TextMed, fontSize = 12.sp, fontWeight = FontWeight.Medium) }
            }
        }
        Spacer(Modifier.height(14.dp))
        Row(Modifier.padding(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StudioButton(Icons.Filled.AutoFixHigh, "Generate") { seed = Random.nextInt(1, 9999); erased = false }
            StudioButton(Icons.Filled.AutoFixNormal, "Magic Eraser") { erased = !erased }
            StudioButton(Icons.Filled.SaveAlt, "Save") { }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            if (erased) "Magic Eraser removed the highlighted object — on-device diffusion fills the gap."
            else "Tap Generate for new art, or Magic Eraser to remove an object intelligently.",
            color = TextLow, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 16.dp)
        )
    }
}

@Composable
private fun StudioButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier
            .weight(1f)
            .clip(RoundedCornerShape(16.dp))
            .background(Container)
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .clickableNoRipple(onClick)
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, tint = PixelBlue, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = TextHi, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

/* -------------------------------- CAMERA ------------------------------- */

@Composable
fun CameraApp(state: PixelState) {
    val modes = listOf("Night Sight", "Portrait", "Photo", "Video", "5x Zoom", "Pro")
    var mode by remember { mutableStateOf("Photo") }
    var zoom by remember { mutableStateOf(1f) }
    var shots by remember { mutableStateOf(0) }
    val inf = rememberInfiniteTransition(label = "cam")
    val glow by inf.animateFloat(0f, 1f, infiniteRepeatable(tween(2400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "g")

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        // viewfinder
        Canvas(Modifier.fillMaxSize()) {
            drawRect(Brush.verticalGradient(listOf(Color(0xFF13203A), Color(0xFF0A0E16), Color(0xFF1A1226))))
            // grid
            for (i in 1..2) {
                drawLine(Color.White.copy(alpha = 0.12f), Offset(size.width * i / 3, 0f), Offset(size.width * i / 3, size.height), 1f)
                drawLine(Color.White.copy(alpha = 0.12f), Offset(0f, size.height * i / 3), Offset(size.width, size.height * i / 3), 1f)
            }
            // focus bracket
            val fx = size.width * (0.3f + 0.4f * glow)
            val fy = size.height * 0.42f
            val s = 34f
            val col = if (mode == "Night Sight") PixelYellow else PixelTeal
            drawRect(col, Offset(fx - s, fy - s), androidx.compose.ui.geometry.Size(18f, 3f))
            drawRect(col, Offset(fx - s, fy - s), androidx.compose.ui.geometry.Size(3f, 18f))
            drawRect(col, Offset(fx + s - 18f, fy - s), androidx.compose.ui.geometry.Size(18f, 3f))
            drawRect(col, Offset(fx + s - 3f, fy - s), androidx.compose.ui.geometry.Size(3f, 18f))
            drawRect(col, Offset(fx - s, fy + s - 3f), androidx.compose.ui.geometry.Size(18f, 3f))
            drawRect(col, Offset(fx - s, fy + s - 18f), androidx.compose.ui.geometry.Size(3f, 18f))
            drawRect(col, Offset(fx + s - 18f, fy + s - 3f), androidx.compose.ui.geometry.Size(18f, 3f))
            drawRect(col, Offset(fx + s - 3f, fy + s - 18f), androidx.compose.ui.geometry.Size(3f, 18f))
        }

        // top bar
        Row(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(top = 50.dp, start = 16.dp, end = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            CamDot(Icons.Filled.FlashAuto)
            Text(mode, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            CamDot(Icons.Filled.Tune)
        }

        // zoom selector
        Row(
            Modifier.align(Alignment.Center).padding(top = 60.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.Center
        ) {
            listOf(0.6f, 1f, 2f, 5f).forEach { z ->
                Box(
                    Modifier.padding(6.dp).size(40.dp).clip(CircleShape)
                        .background(if (zoom == z) PixelYellow else Color.White.copy(alpha = 0.18f))
                        .clickableNoRipple { zoom = z; if (z == 5f) mode = "5x Zoom" }
                        .wrapContentSize(Alignment.Center)
                ) { Text(if (z == 0.6f) ".6" else "${z.roundToInt()}×", color = if (zoom == z) Color.Black else Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold) }
            }
        }

        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(bottom = 30.dp)) {
            // mode selector
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                modes.forEach { m ->
                    Text(
                        m,
                        color = if (m == mode) PixelYellow else Color.White.copy(alpha = 0.6f),
                        fontSize = 11.sp,
                        fontWeight = if (m == mode) FontWeight.Bold else FontWeight.Normal,
                        modifier = Modifier.clickableNoRipple { mode = m }
                    )
                }
            }
            Spacer(Modifier.height(18.dp))
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 30.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(Container2), contentAlignment = Alignment.Center) {
                    Text(if (shots > 0) "📸" else "🖼", color = Color.White, fontSize = 18.sp)
                }
                // shutter
                Box(
                    Modifier.size(72.dp).clip(CircleShape)
                        .border(4.dp, Color.White, CircleShape)
                        .padding(6.dp)
                        .clip(CircleShape)
                        .background(if (mode == "Video") PixelRed else Color.White)
                        .clickableNoRipple { shots++ },
                    contentAlignment = Alignment.Center
                ) { Text(if (mode == "Video") "●" else "", color = Color.White, fontSize = 24.sp) }
                Box(
                    Modifier.size(44.dp).clip(CircleShape).background(Container2).clickableNoRipple { state.flipToBack() },
                    contentAlignment = Alignment.Center
                ) { Icon(Icons.Filled.Cameraswitch, null, tint = Color.White, modifier = Modifier.size(20.dp)) }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                "50MP wide · ${if (zoom > 1) "${zoom.roundToInt()}× Super Res Zoom" else "ƒ/1.68"}" +
                    if (shots > 0) " · $shots captured" else "",
                color = Color.White.copy(alpha = 0.6f), fontSize = 10.sp,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )
        }
    }
}

@Composable
private fun CamDot(icon: ImageVector) {
    Box(Modifier.size(36.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.4f)), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(18.dp))
    }
}

/* ------------------------------- RECORDER ------------------------------ */

@Composable
fun RecorderApp(state: PixelState) {
    var recording by remember { mutableStateOf(false) }
    var secs by remember { mutableStateOf(0) }
    val transcript = remember { mutableStateListOf(
        "Meeting notes — Pixel Experience planning session.",
        "We will finalize the titanium frame geometry today.",
        "Gemini Live summarization runs entirely on Tensor G5."
    ) }
    LaunchedEffect(recording) {
        while (recording) {
            delay(1000); secs++
            if (secs % 4 == 0) {
                transcript.add(
                    listOf(
                        "Live transcribe: voice converted to text on-device.",
                        "The camera visor houses three lenses and a flash.",
                        "Battery at eighty-seven percent after the walk-through.",
                        "Magic Eraser fills removed regions with generated texture."
                    )[(secs / 4) % 4]
                )
            }
        }
    }
    AppScaffold(state, "Recorder", Color(0xFF4A2C2A), Glyph.RECORDER) {
        Box(
            Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp))
                .background(Container).border(1.dp, Border, RoundedCornerShape(22.dp)).padding(18.dp)
        ) {
            Column {
                Text(
                    "%02d:%02d".format(secs / 60, secs % 60),
                    color = TextHi, fontSize = 40.sp, fontWeight = FontWeight.Light
                )
                Text(if (recording) "● Recording · Live Transcribe on" else "Ready to record", color = if (recording) PixelRed else TextLow, fontSize = 12.sp)
                Spacer(Modifier.height(12.dp))
                if (recording) LiveWave(PixelRed) else Spacer(Modifier.height(4.dp))
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(
                        Modifier.size(56.dp).clip(CircleShape)
                            .background(if (recording) PixelRed else PixelRed)
                            .clickableNoRipple {
                                recording = !recording
                                if (!recording) secs = 0
                            },
                        contentAlignment = Alignment.Center
                    ) { Icon(if (recording) Icons.Filled.Stop else Icons.Filled.FiberManualRecord, null, tint = Color.White, modifier = Modifier.size(24.dp)) }
                    Box(
                        Modifier.size(56.dp).clip(CircleShape).background(Container2)
                            .clickableNoRipple { secs = 0; transcript.clear() },
                        contentAlignment = Alignment.Center
                    ) { Icon(Icons.Filled.Delete, null, tint = TextMed, modifier = Modifier.size(20.dp)) }
                    Spacer(Modifier.weight(1f))
                    Box(
                        Modifier.clip(RoundedCornerShape(50)).background(Container2).clickableNoRipple { }
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        contentAlignment = Alignment.Center
                    ) { Text("Save transcript", color = TextHi, fontSize = 12.sp) }
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Text("  LIVE TRANSCRIPT", color = TextLow, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        transcript.forEach { line ->
            Box(
                Modifier.padding(horizontal = 14.dp, vertical = 4.dp).fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp)).background(Container).padding(12.dp)
            ) { Text(line, color = TextMed, fontSize = 12.sp, lineHeight = 17.sp) }
        }
    }
}
