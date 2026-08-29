package com.aminck.pixel

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import java.time.LocalTime
import java.time.format.DateTimeFormatter

@Composable
fun tickEvery(ms: Long = 1000L): Long {
    var t by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            t = System.currentTimeMillis()
            delay(ms)
        }
    }
    return t
}

@Composable
fun rememberTime(): LocalTime {
    tickEvery(1000L)
    return LocalTime.now()
}

fun LocalTime.hhmm(): String = DateTimeFormatter.ofPattern("HH:mm").format(this)
fun LocalTime.hhmmss(): String = DateTimeFormatter.ofPattern("HH:mm:ss").format(this)
