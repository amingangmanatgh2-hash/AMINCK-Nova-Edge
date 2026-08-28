package com.aminck.novamind

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Bundle
import android.provider.MediaStore
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

private enum class Tab(val label: String, val icon: ImageVector) {
    Chat("Chat", Icons.Filled.Chat),
    Vision("Vision", Icons.Filled.Image),
    Voice("Voice", Icons.Filled.Mic),
    Tools("Tools", Icons.Filled.Build)
}

@Composable
fun NovaApp() {
    var tab by remember { mutableStateOf(Tab.Chat) }
    Box(Modifier.fillMaxSize().background(NvBg)) {
        Column(Modifier.fillMaxSize()) {
            Header()
            Box(Modifier.weight(1f)) {
                when (tab) {
                    Tab.Chat -> ChatTab()
                    Tab.Vision -> VisionTab()
                    Tab.Voice -> VoiceTab()
                    Tab.Tools -> ToolsTab()
                }
            }
            BottomNav(tab) { tab = it }
        }
    }
}

@Composable
private fun Header() {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 18.dp).padding(top = 44.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            Modifier.size(38.dp).clip(CircleShape)
                .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(NvMint, NvCyan))),
            contentAlignment = Alignment.Center
        ) { Icon(Icons.Filled.Psychology, null, tint = NvBg, modifier = Modifier.size(22.dp)) }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text("NovaMind", color = NvText, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text("Local AI", color = NvTextDim, fontSize = 11.sp)
        }
        Box(
            Modifier.clip(RoundedCornerShape(50)).background(NvMint.copy(alpha = 0.12f))
                .border(1.dp, NvMint.copy(alpha = 0.5f), RoundedCornerShape(50))
                .padding(horizontal = 10.dp, vertical = 6.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Shield, null, tint = NvMint, modifier = Modifier.size(13.dp))
                Spacer(Modifier.width(5.dp))
                Text("100% OFFLINE", color = NvMint, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun BottomNav(current: Tab, onSelect: (Tab) -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(NvSurface).padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceEvenly
    ) {
        Tab.values().forEach { t ->
            val active = t == current
            Column(
                Modifier.clip(RoundedCornerShape(16.dp)).clickable { onSelect(t) }
                    .padding(horizontal = 20.dp, vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(t.icon, null, tint = if (active) NvMint else NvTextDim, modifier = Modifier.size(22.dp))
                Text(t.label, color = if (active) NvMint else NvTextDim, fontSize = 10.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Normal)
            }
        }
    }
}

/* --------------------------------- CHAT --------------------------------- */

data class NvMsg(val ai: Boolean, val text: String)

@Composable
private fun ChatTab() {
    val context = LocalContext.current
    val tts = remember {
        TextToSpeech(context) { }.apply { language = Locale.getDefault() }
    }
    var msgs by remember {
        mutableStateOf(listOf(NvMsg(true, "LocalMind ready. I run on-device with zero network access. Try math, definitions, jokes, passwords or text tools.")))
    }
    var input by remember { mutableStateOf("") }

    fun send(q: String) {
        val text = q.trim()
        if (text.isEmpty()) return
        val r = LocalMind.reply(text)
        msgs = msgs + NvMsg(false, text) + NvMsg(true, r.text)
        input = ""
    }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(14.dp)) {
            msgs.forEach { m ->
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = if (m.ai) Arrangement.Start else Arrangement.End) {
                    Row(
                        Modifier
                            .widthIn(max = 320.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .background(if (m.ai) NvSurface else NvMint.copy(alpha = 0.15f))
                            .border(1.dp, if (m.ai) NvBorder else NvMint.copy(alpha = 0.4f), RoundedCornerShape(18.dp))
                            .padding(14.dp)
                    ) {
                        Text(
                            m.text,
                            color = if (m.ai) NvText else NvMint,
                            fontSize = 13.sp, lineHeight = 19.sp,
                            modifier = Modifier.weight(1f, fill = false)
                        )
                        if (m.ai) {
                            Spacer(Modifier.width(8.dp))
                            Icon(
                                Icons.Filled.VolumeUp, "Speak", tint = NvTextDim,
                                modifier = Modifier.size(16.dp).clickable {
                                    tts.speak(m.text, TextToSpeech.QUEUE_FLUSH, null, "nv")
                                }
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            listOf("What is Kotlin?", "128 * 47", "Tell me a joke", "Generate a password", "How private are you?").forEach { s ->
                Box(
                    Modifier.padding(vertical = 3.dp).clip(RoundedCornerShape(50))
                        .background(NvSurface2).border(1.dp, NvBorder, RoundedCornerShape(50))
                        .clickable { send(s) }.padding(horizontal = 14.dp, vertical = 8.dp)
                ) { Text(s, color = NvCyan, fontSize = 12.sp) }
            }
        }
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.weight(1f).clip(RoundedCornerShape(50)).background(NvSurface)
                    .border(1.dp, NvBorder, RoundedCornerShape(50)).padding(horizontal = 16.dp, vertical = 13.dp)
            ) {
                BasicTextField(
                    input, { input = it },
                    textStyle = TextStyle(color = NvText, fontSize = 13.sp), singleLine = true,
                    decorationBox = { inner ->
                        if (input.isEmpty()) Text("Ask LocalMind — fully offline…", color = NvTextDim, fontSize = 13.sp)
                        inner()
                    }
                )
            }
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.size(48.dp).clip(CircleShape)
                    .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(NvMint, NvCyan)))
                    .clickable { send(input) },
                contentAlignment = Alignment.Center
            ) { Icon(Icons.Filled.Send, null, tint = NvBg, modifier = Modifier.size(20.dp)) }
        }
    }
}

/* -------------------------------- VISION -------------------------------- */

@Composable
private fun VisionTab() {
    val context = LocalContext.current
    var original by remember { mutableStateOf<Bitmap?>(null) }
    var displayed by remember { mutableStateOf<Bitmap?>(null) }
    var filterName by remember { mutableStateOf("Original") }
    var busy by remember { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            busy = true
            val bmp = runCatching {
                MediaStore.Images.Media.getBitmap(context.contentResolver, uri)
            }.getOrNull()
            if (bmp != null) {
                val maxDim = 640
                val scale = maxDim.toFloat() / max(bmp.width, bmp.height)
                val scaled = if (scale < 1f)
                    Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true)
                else bmp
                original = scaled
                displayed = scaled
                filterName = "Original"
            }
            busy = false
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp)) {
        Text("ON-DEVICE VISION LAB", color = NvTextDim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text("Filters are pixel math executed locally — your photos never leave the phone.", color = NvTextDim, fontSize = 12.sp, lineHeight = 17.sp)
        Spacer(Modifier.height(12.dp))

        Box(
            Modifier.fillMaxWidth().height(280.dp).clip(RoundedCornerShape(22.dp))
                .background(NvSurface).border(1.dp, NvBorder, RoundedCornerShape(22.dp))
                .clickable { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            contentAlignment = Alignment.Center
        ) {
            val bmp: ImageBitmap? = displayed?.asImageBitmap()
            if (bmp != null) {
                Image(bmp, "Filtered photo", modifier = Modifier.fillMaxSize())
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.AddPhotoAlternate, null, tint = NvCyan, modifier = Modifier.size(40.dp))
                    Spacer(Modifier.height(8.dp))
                    Text(if (busy) "Processing on CPU…" else "Tap to pick a photo", color = NvTextDim, fontSize = 13.sp)
                }
            }
        }

        if (original != null) {
            Spacer(Modifier.height(6.dp))
            Text("Filter: $filterName", color = NvMint, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(10.dp))
            listOf(
                "Original" to Icons.Filled.Image,
                "Grayscale" to Icons.Filled.MonochromePhotos,
                "Sepia" to Icons.Filled.PhotoCamera,
                "Invert" to Icons.Filled.Contrast,
                "Bright" to Icons.Filled.Brightness7,
                "Blur" to Icons.Filled.BlurOn
            ).forEach { (name, icon) ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(14.dp))
                        .background(if (filterName == name) NvMint.copy(alpha = 0.12f) else NvSurface)
                        .border(1.dp, if (filterName == name) NvMint else NvBorder, RoundedCornerShape(14.dp))
                        .clickable {
                            busy = true
                            displayed = applyFilter(original!!, name)
                            filterName = name
                            busy = false
                        }
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(icon, null, tint = if (filterName == name) NvMint else NvTextDim, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(12.dp))
                    Text(name, color = NvText, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

private fun applyFilter(src: Bitmap, name: String): Bitmap {
    if (name == "Original") return src.copy(Bitmap.Config.ARGB_8888, false)
    val w = src.width; val h = src.height
    val out = src.copy(Bitmap.Config.ARGB_8888, true)
    val px = IntArray(w * h)
    out.getPixels(px, 0, w, 0, 0, w, h)

    fun clamp(v: Int) = min(255, max(0, v))

    for (i in px.indices) {
        val p = px[i]
        var r = (p shr 16) and 0xFF
        var g = (p shr 8) and 0xFF
        var b = p and 0xFF
        when (name) {
            "Grayscale" -> {
                val y = (0.299 * r + 0.587 * g + 0.114 * b).toInt()
                r = y; g = y; b = y
            }
            "Sepia" -> {
                val nr = clamp((0.393 * r + 0.769 * g + 0.189 * b).toInt())
                val ng = clamp((0.349 * r + 0.686 * g + 0.168 * b).toInt())
                val nb = clamp((0.272 * r + 0.534 * g + 0.131 * b).toInt())
                r = nr; g = ng; b = nb
            }
            "Invert" -> { r = 255 - r; g = 255 - g; b = 255 - b }
            "Bright" -> { r = clamp(r + 45); g = clamp(g + 45); b = clamp(b + 45) }
        }
        px[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    }

    if (name == "Blur") {
        val tmp = px.copyOf()
        val rad = 2
        for (y in rad until h - rad) {
            for (x in rad until w - rad) {
                var sr = 0; var sg = 0; var sb = 0; var n = 0
                for (dy in -rad..rad) for (dx in -rad..rad) {
                    val q = tmp[(y + dy) * w + (x + dx)]
                    sr += (q shr 16) and 0xFF; sg += (q shr 8) and 0xFF; sb += q and 0xFF; n++
                }
                val i = y * w + x
                px[i] = (0xFF shl 24) or ((sr / n) shl 16) or ((sg / n) shl 8) or (sb / n)
            }
        }
    }

    out.setPixels(px, 0, w, 0, 0, w, h)
    return out
}

/* -------------------------------- VOICE --------------------------------- */

@Composable
private fun VoiceTab() {
    val context = LocalContext.current
    var hasMic by remember { mutableStateOf(false) }
    var listening by remember { mutableStateOf(false) }
    var partial by remember { mutableStateOf("") }
    var transcript by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf("") }
    var speechAvailable by remember { mutableStateOf(SpeechRecognizer.isRecognitionAvailable(context)) }

    val tts = remember { TextToSpeech(context) { }.apply { language = Locale.getDefault() } }
    val recognizer = remember {
        if (SpeechRecognizer.isRecognitionAvailable(context))
            SpeechRecognizer.createSpeechRecognizer(context)
        else null
    }

    DisposableEffect(Unit) {
        val listener = object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { listening = true; partial = "" }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() { listening = false }
            override fun onError(error: Int) {
                listening = false
                partial = ""
                transcript = if (error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_RUNTIME)
                    "Offline language pack not found — install your system's offline speech model (Settings → Languages)."
                else "Couldn't hear that (error $error). Try again."
            }
            override fun onResults(results: Bundle?) {
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                listening = false
                if (text.isNotBlank()) {
                    transcript = text
                    val reply = LocalMind.reply(text).text
                    answer = reply
                    tts.speak(reply, TextToSpeech.QUEUE_FLUSH, null, "nvv")
                }
            }
            override fun onPartialResults(partialResults: Bundle?) {
                partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        }
        recognizer?.setRecognitionListener(listener)
        onDispose { recognizer?.destroy() }
    }

    val perm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasMic = granted
        if (granted) startListening(recognizer)
    }

    Column(Modifier.fillMaxSize().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(20.dp))
        Text("VOICE BRAIN", color = NvTextDim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(
            if (speechAvailable) "Speech → LocalMind → spoken answer. Recognition uses the device's offline engine."
            else "This device has no speech recognizer. The chat tab still works fully offline.",
            color = NvTextDim, fontSize = 12.sp, lineHeight = 17.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Spacer(Modifier.height(40.dp))

        Box(
            Modifier.size(110.dp).clip(CircleShape)
                .background(if (listening) NvRed.copy(alpha = 0.15f) else NvMint.copy(alpha = 0.12f))
                .border(3.dp, if (listening) NvRed else NvMint, CircleShape)
                .clickable(enabled = speechAvailable) {
                    if (listening) {
                        recognizer?.stopListening(); listening = false
                    } else if (!hasMic) {
                        perm.launch(android.Manifest.permission.RECORD_AUDIO)
                    } else {
                        startListening(recognizer)
                    }
                },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                if (listening) Icons.Filled.Stop else Icons.Filled.Mic, null,
                tint = if (listening) NvRed else NvMint, modifier = Modifier.size(48.dp)
            )
        }
        Spacer(Modifier.height(14.dp))
        Text(
            when {
                !speechAvailable -> "No recognizer on device"
                listening -> "Listening… (offline)"
                hasMic -> "Tap to speak"
                else -> "Tap & allow microphone"
            },
            color = if (listening) NvRed else NvText, fontSize = 14.sp, fontWeight = FontWeight.Medium
        )

        Spacer(Modifier.height(26.dp))
        if (partial.isNotBlank()) SpeechCard("Heard", partial, NvCyan)
        if (transcript.isNotBlank()) SpeechCard("You said", transcript, NvMint)
        if (answer.isNotBlank()) SpeechCard("LocalMind", answer, NvViolet)
    }
}

private fun startListening(recognizer: SpeechRecognizer?) {
    if (recognizer == null) return
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
    }
    recognizer.startListening(intent)
}

@Composable
private fun SpeechCard(label: String, body: String, tint: androidx.compose.ui.graphics.Color) {
    Box(
        Modifier.fillMaxWidth().padding(vertical = 5.dp).clip(RoundedCornerShape(16.dp))
            .background(NvSurface).border(1.dp, NvBorder, RoundedCornerShape(16.dp)).padding(14.dp)
    ) {
        Column {
            Text(label.uppercase(), color = tint, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(4.dp))
            Text(body, color = NvText, fontSize = 13.sp, lineHeight = 19.sp)
        }
    }
}

/* -------------------------------- TOOLS --------------------------------- */

@Composable
private fun ToolsTab() {
    var result by remember { mutableStateOf("Run a local tool — everything executes on this device.") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp)) {
        Text("LOCAL UTILITIES", color = NvTextDim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(10.dp))

        val tools = listOf(
            Tool(Icons.Filled.Casino, "Roll dice") { "🎲 Dice: ${(1..6).random()} and ${(1..6).random()}" },
            Tool(Icons.Filled.MonetizationOn, "Flip coin") { "Coin: " + if (kotlin.random.Random.nextBoolean()) "Heads" else "Tails" },
            Tool(Icons.Filled.Key, "Generate password") { "Password: ${LocalMind.run { (1..16).map { "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%&*".random() }.joinToString("") }}" },
            Tool(Icons.Filled.Lock, "Cipher demo (Vigenère, key NOVA)") { "Encrypting 'novamind': " + LocalMind.reply("cipher novamind").text.substringAfter(":") },
            Tool(Icons.Filled.Tag, "Analyze sentence") { LocalMind.reply("word count the quick brown fox jumps over the lazy dog").text },
            Tool(Icons.Filled.Calculate, "Math engine test") { LocalMind.reply("(256 * 17) / 4").text }
        )
        tools.forEach { t ->
            Row(
                Modifier.fillMaxWidth().padding(vertical = 5.dp).clip(RoundedCornerShape(16.dp))
                    .background(NvSurface).border(1.dp, NvBorder, RoundedCornerShape(16.dp))
                    .clickable { result = t.action() }.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(t.icon, null, tint = NvCyan, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(14.dp))
                Text(t.label, color = NvText, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.weight(1f))
                Icon(Icons.Filled.ChevronRight, null, tint = NvTextDim, modifier = Modifier.size(18.dp))
            }
        }
        Spacer(Modifier.height(14.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                .background(NvMint.copy(alpha = 0.08f)).border(1.dp, NvMint.copy(alpha = 0.4f), RoundedCornerShape(16.dp)).padding(16.dp)
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Terminal, null, tint = NvMint, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("OUTPUT", color = NvMint, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(6.dp))
                Text(result, color = NvText, fontSize = 13.sp, lineHeight = 19.sp)
            }
        }
        Spacer(Modifier.height(14.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(NvSurface)
                .border(1.dp, NvBorder, RoundedCornerShape(16.dp)).padding(16.dp)
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CloudOff, null, tint = NvMint, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("ENGINE INFO", color = NvTextDim, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "LocalMind v1.0 — rule-based intent model + knowledge base + arithmetic parser + Vigenère cipher, all in pure Kotlin on the CPU. Vision filters run as per-pixel math. Voice uses Android's on-device SpeechRecognizer (offline mode) and TextToSpeech. The app declares no INTERNET permission.",
                    color = NvTextDim, fontSize = 12.sp, lineHeight = 17.sp
                )
            }
        }
    }
}

private data class Tool(val icon: ImageVector, val label: String, val action: () -> String)
