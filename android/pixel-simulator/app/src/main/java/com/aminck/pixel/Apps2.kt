package com.aminck.pixel

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/* ------------------------------- WEATHER ------------------------------- */

@Composable
fun WeatherApp(state: PixelState) {
    AppScaffold(state, "Weather", PixelTeal, Glyph.WEATHER) {
        Box(
            Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(26.dp))
                .background(Brush.verticalGradient(listOf(Color(0xFF0B3C5D), Color(0xFF1E6FA8))))
                .padding(18.dp)
        ) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Frankfurt am Main", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                Text("21°", color = Color.White, fontSize = 64.sp, fontWeight = FontWeight.Thin)
                Icon(Icons.Filled.WbSunny, null, tint = Color(0xFFFFE082), modifier = Modifier.size(40.dp))
                Text("Sunny · Clear skies", color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    WeatherMini("H:24°", "L:13°")
                    WeatherMini("6 km/h", "Wind")
                    WeatherMini("42%", "Humidity")
                    WeatherMini("AQI 28", "Good")
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Text("  HOURLY", color = TextLow, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        Row(Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Container).padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween) {
            listOf("Now" to "21°", "14" to "22°", "15" to "23°", "16" to "22°", "17" to "20°", "18" to "18°").forEach { (h, t) ->
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(h, color = TextMed, fontSize = 11.sp)
                    Icon(Icons.Filled.WbSunny, null, tint = PixelYellow, modifier = Modifier.size(18.dp))
                    Text(t, color = TextHi, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Text("  7-DAY FORECAST", color = TextLow, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        listOf(
            "Fri" to Icons.Filled.WbSunny to "24° / 14°",
            "Sat" to Icons.Filled.Cloud to "21° / 12°",
            "Sun" to Icons.Filled.Grain to "17° / 10°",
            "Mon" to Icons.Filled.WbCloudy to "19° / 11°",
            "Tue" to Icons.Filled.WbSunny to "23° / 13°"
        ).forEach { (dayIcon, temps) ->
            val (day, icon) = dayIcon
            Row(
                Modifier.padding(horizontal = 14.dp, vertical = 3.dp).fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp)).background(Container).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(day, color = TextHi, fontSize = 13.sp, modifier = Modifier.width(46.dp))
                Icon(icon, null, tint = PixelTeal, modifier = Modifier.size(20.dp))
                Spacer(Modifier.weight(1f))
                Text(temps, color = TextMed, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun WeatherMini(v: String, k: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(v, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        Text(k, color = Color.White.copy(alpha = 0.7f), fontSize = 9.sp)
    }
}

/* -------------------------------- PHONE -------------------------------- */

@Composable
fun PhoneApp(state: PixelState) {
    var number by remember { mutableStateOf("") }
    var calling by remember { mutableStateOf(false) }
    var callSecs by remember { mutableStateOf(0) }
    LaunchedEffect(calling) {
        while (calling) { delay(1000); callSecs++ }
    }
    AppScaffold(state, "Phone", PixelGreen, Glyph.PHONE) {
        if (!calling) {
            Text(
                number.ifEmpty { "Dial a number" },
                color = if (number.isEmpty()) TextLow else TextHi,
                fontSize = 34.sp, fontWeight = FontWeight.Light,
                modifier = Modifier.fillMaxWidth().padding(vertical = 18.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
            val keys = listOf("1","2","3","4","5","6","7","8","9","*","0","#")
            Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(horizontal = 34.dp)) {
                keys.chunked(3).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        row.forEach { k ->
                            Box(
                                Modifier.size(66.dp).clip(CircleShape).background(Container)
                                    .border(1.dp, Border, CircleShape)
                                    .clickableNoRipple { number += k },
                                contentAlignment = Alignment.Center
                            ) { Text(k, color = TextHi, fontSize = 24.sp, fontWeight = FontWeight.Medium) }
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth().padding(horizontal = 40.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.size(56.dp))
                Box(
                    Modifier.size(62.dp).clip(CircleShape).background(PixelGreen).clickableNoRipple {
                        if (number.isNotEmpty()) { calling = true; callSecs = 0 }
                    },
                    contentAlignment = Alignment.Center
                ) { Icon(Icons.Filled.Phone, null, tint = Color.White, modifier = Modifier.size(26.dp)) }
                Box(
                    Modifier.size(56.dp).clip(CircleShape).background(Container2).clickableNoRipple {
                        number = number.dropLast(1)
                    },
                    contentAlignment = Alignment.Center
                ) { Icon(Icons.Filled.Backspace, null, tint = TextMed, modifier = Modifier.size(22.dp)) }
            }
        } else {
            Column(Modifier.fillMaxWidth().padding(30.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(20.dp))
                Box(Modifier.size(90.dp).clip(CircleShape).background(PixelGreen.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Person, null, tint = PixelGreen, modifier = Modifier.size(44.dp))
                }
                Spacer(Modifier.height(14.dp))
                Text(number, color = TextHi, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
                Text("%02d:%02d · Tensor Voice HD".format(callSecs / 60, callSecs % 60), color = TextMed, fontSize = 13.sp)
                Spacer(Modifier.height(40.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                    listOf(Icons.Filled.Mic to "Mute", Icons.Filled.VolumeUp to "Speaker", Icons.Filled.Dialpad to "Keypad").forEach { (ic, l) ->
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(Modifier.size(54.dp).clip(CircleShape).background(Container), contentAlignment = Alignment.Center) {
                                Icon(ic, l, tint = TextHi, modifier = Modifier.size(22.dp))
                            }
                            Text(l, color = TextLow, fontSize = 10.sp)
                        }
                    }
                }
                Spacer(Modifier.height(30.dp))
                Box(
                    Modifier.size(66.dp).clip(CircleShape).background(PixelRed).clickableNoRipple { calling = false; number = "" },
                    contentAlignment = Alignment.Center
                ) { Icon(Icons.Filled.CallEnd, null, tint = Color.White, modifier = Modifier.size(28.dp)) }
            }
        }
    }
}

/* ------------------------------ MESSAGES ------------------------------- */

data class Msg(val out: Boolean, val text: String)

@Composable
fun MessagesApp(state: PixelState) {
    val contacts = listOf("Mom" to PixelRed, "Alex" to PixelTeal, "Gemini" to PixelPurple, "Work" to PixelYellow)
    var openChat by remember { mutableStateOf<String?>(null) }
    val threads = remember {
        mutableStateMapOf(
            "Mom" to mutableStateListOf(Msg(false, "Call me when you unbox the new Pixel!"), Msg(true, "Will do — titanium frame looks amazing")),
            "Alex" to mutableStateListOf(Msg(false, "Night Sight shots later?")),
            "Gemini" to mutableStateListOf(Msg(false, "Your summary is ready.")),
            "Work" to mutableStateListOf(Msg(false, "Standup moved to 9:30."))
        )
    }
    var draft by remember { mutableStateOf("") }
    AppScaffold(state, "Messages", PixelBlue, Glyph.MESSAGES) {
        if (openChat == null) {
            contacts.forEach { (name, color) ->
                Row(
                    Modifier.padding(horizontal = 14.dp, vertical = 4.dp).fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp)).background(Container)
                        .clickableNoRipple { openChat = name }.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(Modifier.size(42.dp).clip(CircleShape).background(color.copy(alpha = 0.25f)), contentAlignment = Alignment.Center) {
                        Text(name.first().toString(), color = color, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(name, color = TextHi, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        Text(threads[name]!!.last().text, color = TextMed, fontSize = 12.sp)
                    }
                }
            }
        } else {
            val name = openChat!!
            Row(Modifier.padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(36.dp).clip(CircleShape).background(Container2).clickableNoRipple { openChat = null }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.ArrowBack, null, tint = TextHi, modifier = Modifier.size(18.dp))
                }
                Spacer(Modifier.width(10.dp))
                Text(name, color = TextHi, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(8.dp))
            threads[name]!!.forEach { m ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 3.dp),
                    horizontalArrangement = if (m.out) Arrangement.End else Arrangement.Start) {
                    Box(
                        Modifier.widthIn(max = 240.dp).clip(RoundedCornerShape(16.dp))
                            .background(if (m.out) PixelBlue else Container)
                            .padding(horizontal = 13.dp, vertical = 9.dp)
                    ) { Text(m.text, color = if (m.out) Color(0xFF0B1522) else TextHi, fontSize = 13.sp) }
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f).clip(RoundedCornerShape(50)).background(Container).border(1.dp, Border, RoundedCornerShape(50)).padding(horizontal = 16.dp, vertical = 12.dp)) {
                    BasicTextField(draft, { draft = it }, textStyle = TextStyle(color = TextHi, fontSize = 13.sp), singleLine = true,
                        decorationBox = { inner -> if (draft.isEmpty()) Text("Text message…", color = TextLow, fontSize = 13.sp); inner() })
                }
                Spacer(Modifier.width(8.dp))
                Box(Modifier.size(44.dp).clip(CircleShape).background(PixelBlue).clickableNoRipple {
                    if (draft.isNotBlank()) {
                        threads[name]!!.add(Msg(true, draft))
                        val sent = draft; draft = ""
                        if (name == "Gemini") threads[name]!!.add(Msg(false, geminiReply(state, sent)))
                    }
                }, contentAlignment = Alignment.Center) { Icon(Icons.Filled.Send, null, tint = Color(0xFF0B1522), modifier = Modifier.size(18.dp)) }
            }
        }
    }
}

/* -------------------------------- PHOTOS ------------------------------- */

@Composable
fun PhotosApp(state: PixelState) {
    var selected by remember { mutableStateOf<GalleryPhoto?>(null) }
    AppScaffold(state, "Photos", Color(0xFF3B2E50), Glyph.PHOTOS) {
        if (selected == null) {
            state.gallery.chunked(2).forEach { pair ->
                Row(Modifier.padding(horizontal = 12.dp, vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    pair.forEach { p ->
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).clickableNoRipple { selected = p }) {
                            Box(
                                Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(18.dp))
                                    .background(Brush.verticalGradient(p.colors))
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(p.title, color = TextMed, fontSize = 11.sp)
                        }
                    }
                    if (pair.size < 2) Spacer(Modifier.weight(1f))
                }
            }
            Spacer(Modifier.height(8.dp))
            Text("  Best Take · Magic Editor · Photo Unblur run on Tensor G5", color = TextLow, fontSize = 10.sp)
        } else {
            val p = selected!!
            Box(
                Modifier.padding(horizontal = 14.dp).fillMaxWidth().height(320.dp).clip(RoundedCornerShape(24.dp))
                    .background(Brush.verticalGradient(p.colors))
            )
            Spacer(Modifier.height(12.dp))
            Text("  ${p.title}", color = TextHi, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf(Icons.Filled.AutoFixHigh to "Magic Edit", Icons.Filled.Share to "Share", Icons.Filled.FavoriteBorder to "Favorite").forEach { (ic, l) ->
                    Box(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(Container).border(1.dp, Border, RoundedCornerShape(16.dp)).padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(ic, null, tint = PixelPurple, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(l, color = TextHi, fontSize = 11.sp)
                        }
                    }
                }
            }
            Box(Modifier.padding(horizontal = 14.dp).clip(RoundedCornerShape(50)).background(Container2).clickableNoRipple { selected = null }
                .padding(horizontal = 18.dp, vertical = 10.dp)) { Text("Back to library", color = TextMed, fontSize = 12.sp) }
        }
    }
}

/* -------------------------------- MUSIC -------------------------------- */

@Composable
fun MusicApp(state: PixelState) {
    var playing by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf(0.32f) }
    LaunchedEffect(playing) {
        while (playing) { delay(800); progress = (progress + 0.01f).coerceAtMost(1f) }
    }
    AppScaffold(state, "Music", PixelOrange, Glyph.MUSIC) {
        Box(
            Modifier.padding(horizontal = 24.dp).fillMaxWidth().height(200.dp).clip(RoundedCornerShape(28.dp))
                .background(Brush.sweepGradient(listOf(PixelOrange, PixelPurple, PixelTeal, PixelOrange)))
        ) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.MusicNote, null, tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(72.dp))
            }
        }
        Spacer(Modifier.height(18.dp))
        Text("Midnight Drive", color = TextHi, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 24.dp))
        Text("Nova · Titanium Nights", color = TextMed, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 24.dp))
        Spacer(Modifier.height(14.dp))
        Slider(
            value = progress, onValueChange = { progress = it },
            modifier = Modifier.padding(horizontal = 16.dp)
        )
        Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${(progress * 212).toInt() / 60}:${"%02d".format((progress * 212).toInt() % 60)}", color = TextLow, fontSize = 11.sp)
            Text("3:32", color = TextLow, fontSize = 11.sp)
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.SkipPrevious, null, tint = TextHi, modifier = Modifier.size(34.dp).clickableNoRipple { progress = 0f })
            Spacer(Modifier.width(28.dp))
            Box(Modifier.size(68.dp).clip(CircleShape).background(PixelOrange).clickableNoRipple { playing = !playing }, contentAlignment = Alignment.Center) {
                Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, null, tint = Color(0xFF2A1500), modifier = Modifier.size(34.dp))
            }
            Spacer(Modifier.width(28.dp))
            Icon(Icons.Filled.SkipNext, null, tint = TextHi, modifier = Modifier.size(34.dp))
        }
    }
}

/* -------------------------------- NOTES -------------------------------- */

@Composable
fun NotesApp(state: PixelState) {
    AppScaffold(state, "Notes", PixelYellow, Glyph.NOTES) {
        Box(
            Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp))
                .background(Container).border(1.dp, Border, RoundedCornerShape(20.dp)).padding(16.dp)
        ) {
            BasicTextField(
                state.notes,
                { state.notes = it },
                textStyle = TextStyle(color = TextHi, fontSize = 14.sp, lineHeight = 22.sp),
                modifier = Modifier.fillMaxWidth().height(280.dp)
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.padding(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf(Icons.Filled.CheckCircle to "Auto-saved on-device", Icons.Filled.Lock to "Encrypted").forEach { (ic, l) ->
                Box(Modifier.clip(RoundedCornerShape(50)).background(Container2).padding(horizontal = 12.dp, vertical = 8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(ic, null, tint = PixelGreen, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(l, color = TextMed, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

/* ------------------------------ CALCULATOR ----------------------------- */

class CalcEngine {
    var expr by mutableStateOf("")
    var result by mutableStateOf("0")
    fun press(k: String) {
        when (k) {
            "C" -> { expr = ""; result = "0" }
            "⌫" -> expr = expr.dropLast(1)
            "=" -> result = eval(expr)
            "+", "−", "×", "÷" -> {
                if (expr.isNotEmpty() && expr.last() in "+-×÷*.") expr = expr.dropLast(1)
                expr += if (k == "×") "*" else if (k == "÷") "/" else if (k == "−") "-" else k
            }
            "." -> if (!expr.substringAfterLast(Regex("[/+*\\-]")).contains(".")) expr += "."
            else -> expr += k
        }
        if (k != "=" && expr.isNotEmpty()) result = eval(expr)
    }
    private fun eval(e: String): String {
        if (e.isBlank()) return "0"
        if (e.last() in "+-*/.") return format(safeEval(e.dropLast(1)))
        return format(safeEval(e))
    }
    private fun safeEval(e: String): Double {
        return try {
            val tokens = Regex("\\d+\\.?\\d*|[+\\-*/()]").findAll(e).map { it.value }.toList()
            if (tokens.isEmpty()) return 0.0
            // shunting-yard
            val out = mutableListOf<String>()
            val ops = ArrayDeque<String>()
            val prec = mapOf("+" to 1, "-" to 1, "*" to 2, "/" to 2)
            for (t in tokens) {
                when (t) {
                    in prec -> {
                        while (ops.isNotEmpty() && ops.last() in prec && prec[ops.last()]!! >= prec[t]!!) out.add(ops.removeLast())
                        ops.add(t)
                    }
                    else -> out.add(t)
                }
            }
            while (ops.isNotEmpty()) out.add(ops.removeLast())
            val st = ArrayDeque<Double>()
            for (t in out) {
                when (t) {
                    "+" -> st.add(st.removeLast() + st.removeLast())
                    "-" -> { val b = st.removeLast(); st.add(st.removeLast() - b) }
                    "*" -> st.add(st.removeLast() * st.removeLast())
                    "/" -> { val b = st.removeLast(); st.add(if (b == 0.0) 0.0 else st.removeLast() / b) }
                    else -> st.add(t.toDoubleOrNull() ?: 0.0)
                }
            }
            st.lastOrNull() ?: 0.0
        } catch (_: Exception) { 0.0 }
    }
    private fun format(d: Double): String {
        if (d.isInfinite() || d.isNaN()) return "Error"
        val r = if (d % 1.0 == 0.0) d.toLong().toString() else String.format("%.6f", d).trimEnd('0').trimEnd('.')
        return r
    }
}

@Composable
fun CalcApp(state: PixelState) {
    val eng = remember { CalcEngine() }
    AppScaffold(state, "Calculator", Color(0xFF2E3A46), Glyph.CALC) {
        Column(Modifier.padding(horizontal = 18.dp)) {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Container).padding(18.dp)) {
                Column(horizontalAlignment = Alignment.End, modifier = Modifier.fillMaxWidth()) {
                    Text(eng.expr.ifEmpty { " " }, color = TextMed, fontSize = 18.sp)
                    Text(eng.result, color = TextHi, fontSize = 42.sp, fontWeight = FontWeight.Light)
                }
            }
            Spacer(Modifier.height(14.dp))
            val keys = listOf(
                listOf("C", "⌫", "÷", "×"),
                listOf("7", "8", "9", "−"),
                listOf("4", "5", "6", "+"),
                listOf("1", "2", "3", "="),
                listOf("0", ".", "00", "")
            )
            keys.forEach { row ->
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { k ->
                        if (k.isEmpty()) { Spacer(Modifier.weight(1f)); return@forEach }
                        val isOp = k in listOf("+", "−", "×", "÷", "=")
                        val isTop = k in listOf("C", "⌫")
                        Box(
                            Modifier.weight(1f).height(56.dp).clip(RoundedCornerShape(16.dp))
                                .background(when { isOp -> PixelBlue; isTop -> Container2; else -> Container })
                                .clickableNoRipple { eng.press(k) },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(k, color = when { isOp -> Color(0xFF0B1522); isTop -> PixelRed; else -> TextHi },
                                fontSize = 22.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }
    }
}

/* -------------------------------- CLOCK -------------------------------- */

@Composable
fun ClockApp(state: PixelState) {
    val time = rememberTime()
    AppScaffold(state, "Clock", PixelTeal, Glyph.CLOCK) {
        Box(
            Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Container)
                .border(1.dp, Border, RoundedCornerShape(24.dp)).padding(20.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(time.hhmmss(), color = TextHi, fontSize = 44.sp, fontWeight = FontWeight.Thin)
                Text("Frankfurt · Asia/Tehran sync demo", color = TextLow, fontSize = 11.sp)
            }
        }
        Spacer(Modifier.height(14.dp))
        Text("  ALARMS", color = TextLow, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        state.alarms.forEachIndexed { i, a ->
            Row(
                Modifier.padding(horizontal = 14.dp, vertical = 4.dp).fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp)).background(Container).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(a.time, color = if (a.enabled) TextHi else TextLow, fontSize = 24.sp, fontWeight = FontWeight.Light)
                    Text(a.label, color = TextMed, fontSize = 11.sp)
                }
                Spacer(Modifier.weight(1f))
                Switch(
                    checked = a.enabled,
                    onCheckedChange = { state.alarms[i] = a.copy(enabled = it) },
                    colors = SwitchDefaults.colors(checkedThumbColor = Color(0xFF0B1522), checkedTrackColor = PixelTeal)
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Text("  World clock · Timer · Stopwatch", color = TextLow, fontSize = 10.sp)
    }
}

/* ------------------------------- SETTINGS ------------------------------ */

@Composable
fun SettingsApp(state: PixelState) {
    val youColors = listOf(PixelBlue to "Ocean", PixelPurple to "Amethyst", PixelGreen to "Forest", PixelYellow to "Sun", PixelRed to "Coral", PixelTeal to "Aqua")
    AppScaffold(state, "Settings", Color(0xFF3A3D40), Glyph.SETTINGS) {
        // Material You color
        Text("  MATERIAL YOU COLOR", color = TextLow, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            youColors.forEach { (c, name) ->
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(c)
                        .border(if (state.youColor == c) 3.dp else 0.dp, Color.White, CircleShape)
                        .clickableNoRipple { state.youColor = c },
                    contentAlignment = Alignment.Center
                ) { if (state.youColor == c) Icon(Icons.Filled.Check, null, tint = Color(0xFF0B1522), modifier = Modifier.size(18.dp)) }
            }
        }
        SettingToggle(Icons.Filled.DarkMode, "Dark theme", "Geometric Balance palette", state.darkTheme) { state.darkTheme = it }
        SettingToggle(Icons.Filled.BatterySaver, "Battery Saver", "Extend ${state.battery}% charge", state.batterySaver) { state.batterySaver = it; state.battery = if (it) (state.battery + 5).coerceAtMost(100) else state.battery }
        SettingToggle(Icons.Filled.Wifi, "Wi-Fi", state.ifSsid(), state.wifi) { state.wifi = it }
        SettingToggle(Icons.Filled.Bluetooth, "Bluetooth", "Pixel Buds Pro nearby", state.bluetooth) { state.bluetooth = it }
        SettingToggle(Icons.Filled.LocationOn, "Location", "Titan M2 protected", state.location) { state.location = it }

        Spacer(Modifier.height(6.dp))
        // Battery
        Box(Modifier.padding(horizontal = 14.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Container).padding(16.dp)) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.BatteryFull, null, tint = PixelGreen, modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Battery", color = TextHi, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.weight(1f))
                    Text("${state.battery}%", color = PixelGreen, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(10.dp))
                Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(50)).background(Container2)) {
                    Box(Modifier.fillMaxWidth(state.battery / 100f).height(8.dp).clip(RoundedCornerShape(50)).background(PixelGreen))
                }
                Text("~14h left · Adaptive charging on", color = TextLow, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
            }
        }

        Spacer(Modifier.height(12.dp))
        Text("  SECURITY", color = TextLow, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        SettingRow(Icons.Filled.Fingerprint, "Fingerprint & Face Unlock", "42MP Tensor Vision enrolled")
        SettingRow(Icons.Filled.Security, "Titan M2 security chip", "Hardware-backed keystore")

        Spacer(Modifier.height(12.dp))
        Text("  ABOUT PHONE", color = TextLow, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        SettingRow(Icons.Filled.Memory, "Processor", "Google Tensor G5 · 3nm Titan")
        SettingRow(Icons.Filled.Smartphone, "Device", "Pixel 10 Pro Max · Titanium")
        SettingRow(Icons.Filled.Android, "Software", "Pixel Experience 15 (Kotlin · Compose)")
        SettingRow(Icons.Filled.Storage, "Storage", "128 GB free of 512 GB")
    }
}

private fun PixelState.ifSsid() = if (wifi) "Connected to Nova-5G" else "Off"

@Composable
private fun SettingToggle(icon: ImageVector, title: String, sub: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.padding(horizontal = 14.dp, vertical = 4.dp).fillMaxWidth()
            .clip(RoundedCornerShape(16.dp)).background(Container).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, tint = stateAccent(), modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = TextHi, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            Text(sub, color = TextLow, fontSize = 11.sp)
        }
        Switch(checked, onChange, colors = SwitchDefaults.colors(checkedThumbColor = Color(0xFF0B1522), checkedTrackColor = stateAccent()))
    }
}

@Composable
private fun SettingRow(icon: ImageVector, title: String, sub: String) {
    Row(
        Modifier.padding(horizontal = 14.dp, vertical = 4.dp).fillMaxWidth()
            .clip(RoundedCornerShape(16.dp)).background(Container).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, null, tint = stateAccent(), modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Column {
            Text(title, color = TextHi, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            Text(sub, color = TextLow, fontSize = 11.sp)
        }
    }
}

@Composable
private fun stateAccent(): Color = PixelBlue
