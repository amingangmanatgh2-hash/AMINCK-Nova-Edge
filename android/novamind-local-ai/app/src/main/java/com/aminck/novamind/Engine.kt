package com.aminck.novamind

import kotlin.math.sqrt
import kotlin.random.Random

/**
 * LocalMind — a tiny fully-offline inference engine.
 * Runs entirely on-device: no network, no APIs. It combines a rule-based
 * intent model, keyword scoring, a curated knowledge base, a small
 * arithmetic evaluator and a Vigenère cipher toy — everything computed
 * locally on the CPU.
 */
object LocalMind {

    data class Reply(val text: String, val confident: Boolean = true)

    private val stopwords = setOf(
        "the", "a", "an", "is", "are", "can", "you", "please", "tell", "me",
        "what", "how", "do", "to", "of", "in", "on", "and", "or", "my", "i",
        "about", "with", "for", "it", "this", "that", "be", "will", "from"
    )

    fun keywords(q: String): List<String> =
        q.lowercase().split(Regex("[^a-z0-9\\u0600-\\u06FF]+"))
            .filter { it.isNotBlank() && it !in stopwords }

    fun reply(input: String): Reply {
        val q = input.trim()
        if (q.isEmpty()) return Reply("Tap the mic or type — I run completely offline.", false)

        // Math?
        if (Regex("^[\\d\\s+\\-*/().%]+$").matches(q)) {
            val v = evalArithmetic(q)
            return Reply("Calculated locally: $q = $v")
        }

        val kws = keywords(q)
        val joined = kws.joinToString(" ")

        // Intents — order matters
        intent(joined, listOf("hello", "hi", "hey", "salam", "سلام"))?.let {
            return Reply("Hi! I'm LocalMind — your private on-device assistant. Nothing leaves this phone. Ask me math, definitions, word stats, or a local task.")
        }
        intent(joined, listOf("who", "you", "name"))?.let {
            return Reply("I'm LocalMind, a compact on-device inference engine. I do intent matching, knowledge lookup, math and text analysis — 100% offline on your CPU.")
        }
        intent(joined, listOf("offline", "private", "privacy", "internet", "online", "network"))?.let {
            return Reply("Privacy check: this app requests NO internet permission. Every response is computed on your device — chat, speech, and image filters never upload data.")
        }
        intent(joined, listOf("joke", "funny"))?.let { return Reply(joke()) }
        intent(joined, listOf("inspire", "motivate", "quote"))?.let { return Reply(quote()) }
        intent(joined, listOf("flip", "coin"))?.let {
            return Reply("Coin flip: " + if (Random.nextBoolean()) "Heads" else "Tails")
        }
        intent(joined, listOf("roll", "dice"))?.let {
            return Reply("Dice roll: 🎲 ${Random.nextInt(1, 7)}")
        }
        intent(joined, listOf("password"))?.let {
            return Reply("Local secure-style password (generated in-memory): ${genPassword(14)}")
        }
        intent(joined, listOf("cipher", "encrypt", "code"))?.let {
            val plain = q.substringAfter("cipher").substringAfter("encrypt").ifBlank { "novamind" }.trim()
            return Reply("Vigenère cipher with key NOVA (toy crypto, runs locally):\n${vigenere(plain.ifBlank { "novamind" }, "NOVA")}")
        }
        intent(joined, listOf("words", "count", "wordcount", "length"))?.let {
            val words = q.split(Regex("\\s+")).filter { it.isNotBlank() }.size
            val chars = q.length
            return Reply("Text analysis (local): $words words, $chars characters, ${kws.size} meaningful keywords.")
        }
        intent(joined, listOf("reverse"))?.let {
            return Reply("Reversed locally: ${q.reversed()}")
        }
        intent(joined, listOf("uppercase", "upper"))?.let {
            return Reply("UPPERCASE: ${q.uppercase()}")
        }

        // Knowledge base — best keyword overlap
        val best = knowledge.maxByOrNull { (_, terms) -> terms.count { it in joined } }
        if (best != null && best.second.count { it in joined } > 0) {
            return Reply(best.first)
        }

        // Fallback: echo + analysis
        return Reply(
            buildString {
                append("(Low-confidence local match) I parsed ${kws.size} keyword(s): ")
                append(kws.take(6).joinToString(", "))
                append(". I work best offline with math, definitions (try \"what is kotlin\"), word tools, jokes, passwords, coin flips and ciphers.")
            },
            false
        )
    }

    private fun intent(joined: String, words: List<String>): Unit? =
        if (words.any { it in joined }) Unit else null

    private val knowledge: List<Pair<String, List<String>>> = listOf(
        "Kotlin is a modern, statically typed language from JetBrains — it's the official language for Android and powers Jetpack Compose UIs." to listOf("kotlin"),
        "Jetpack Compose is Android's declarative UI toolkit: you build screens with composable functions, and the framework updates them as state changes." to listOf("compose", "jetpack"),
        "A tensor is a multi-dimensional array of numbers — the fundamental data structure used in neural networks and chips like Google Tensor G5." to listOf("tensor", "g5", "chip", "processor", "cpu"),
        "Neural networks are layers of weighted math operations that learn patterns from data; on-device inference runs those math operations on your phone." to listOf("neural", "network", "model", "ai", "inference"),
        "RAM (Random Access Memory) is fast temporary storage for running apps; your device keeps active models and apps in RAM for instant access." to listOf("ram", "memory"),
        "A battery stores energy chemically; lithium-ion cells like the 5,800 mAh in flagship phones trade capacity, weight and charging speed." to listOf("battery", "charge", "mah"),
        "Titanium is a strong, light metal used in premium phone frames — it resists bending better than aluminium at lower weight." to listOf("titanium", "frame", "metal"),
        "Edge AI means running artificial intelligence directly on the device instead of cloud servers — lower latency, better privacy, works offline." to listOf("edge", "local", "on-device", "ondevice"),
        "Speech recognition converts audio to text; on-device recognizers stream audio through local acoustic and language models." to listOf("speech", "voice", "transcribe", "recognition"),
        "A bitmap filter is per-pixel math: grayscale averages channels, sepia applies a warm matrix, invert flips brightness, and blur averages neighbours." to listOf("filter", "image", "bitmap", "photo", "pixel"),
        "Frankfurt am Main is a financial hub in Germany, home to the European Central Bank and a major transport crossroads." to listOf("frankfurt", "germany"),
        "An algorithm is a finite sequence of steps that solves a problem — from sorting a list to generating a password." to listOf("algorithm"),
        "Encryption transforms text so only authorized parties can read it; the Vigenère cipher uses a repeating keyword to shift letters." to listOf("encryption", "vigenere", "crypto"),
        "Material You is Google's dynamic design system — color palettes are extracted and applied across the whole interface." to listOf("material", "design", "you")
    )

    private fun joke(): String = listOf(
        "Why do programmers prefer dark mode? Because light attracts bugs.",
        "I told my computer I needed a break — it said 'No problem, I'll go to sleep.'",
        "Why did the AI stay on-device? It couldn't handle the social network.",
        "There are 10 kinds of people: those who understand binary and those who don't."
    ).random()

    private fun quote(): String = listOf(
        "“The best way to predict the future is to invent it.” — Alan Kay",
        "“Simplicity is the soul of efficiency.” — Austin Freeman",
        "“Privacy is not something that I'm merely entitled to, it's a prerequisite.” — Marlon Brando",
        "“Talk is cheap. Show me the code.” — Linus Torvalds"
    ).random()

    private fun genPassword(n: Int): String {
        val chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%&*"
        return (1..n).map { chars[Random.nextInt(chars.length)] }.joinToString("")
    }

    private fun vigenere(text: String, key: String): String {
        val sb = StringBuilder()
        var ki = 0
        for (c in text) {
            if (c.isLetter()) {
                val base = if (c.isUpperCase()) 'A' else 'a'
                val shift = key[ki % key.length].uppercaseChar().code - 'A'.code
                sb.append((((c.code - base.code + shift) % 26) + base.code).toChar())
                ki++
            } else sb.append(c)
        }
        return sb.toString()
    }

    private fun evalArithmetic(expr: String): String {
        return try {
            val tokens = Regex("\\d+\\.?\\d*|[+\\-*/()]").findAll(expr).map { it.value }.toList()
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
            for (t in out) when (t) {
                "+" -> st.add(st.removeLast() + st.removeLast())
                "-" -> { val b = st.removeLast(); st.add(st.removeLast() - b) }
                "*" -> st.add(st.removeLast() * st.removeLast())
                "/" -> { val b = st.removeLast(); st.add(if (b == 0.0) Double.NaN else st.removeLast() / b) }
                else -> st.add(t.toDouble())
            }
            val r = st.last()
            if (r.isNaN() || r.isInfinite()) "undefined"
            else if (r % 1.0 == 0.0) r.toLong().toString()
            else String.format("%.6f", r).trimEnd('0').trimEnd('.')
        } catch (e: Exception) { "couldn't parse that" }
    }
}
