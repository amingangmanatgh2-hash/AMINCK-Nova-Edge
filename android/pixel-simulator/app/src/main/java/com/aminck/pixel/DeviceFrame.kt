package com.aminck.pixel

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.SignalCellularAlt
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun DeviceFrame(state: PixelState) {
    val rotation by animateFloatAsState(
        targetValue = if (state.face == Face.FRONT) 0f else 180f,
        animationSpec = tween(900, easing = FastOutSlowInEasing),
        label = "flip"
    )

    Box(
        Modifier
            .graphicsLayer {
                rotationY = rotation
                cameraDistance = 16f * density
            }
    ) {
        Box(
            Modifier
                .width(336.dp)
                .height(700.dp)
                .graphicsLayer { alpha = if (rotation <= 90f) 1f else 0f }
        ) { FrontFace(state) }
        Box(
            Modifier
                .width(336.dp)
                .height(700.dp)
                .graphicsLayer {
                    rotationY = 180f
                    alpha = if (rotation > 90f) 1f else 0f
                }
        ) { BackFace(state) }
    }
}

@Composable
private fun TitaniumFrame(content: @Composable BoxScope.() -> Unit) {
    Box(
        Modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(54.dp))
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFFC9CDD1), Color(0xFF8E9398), Color(0xFFB9BDC1), Color(0xFF74797E))
                )
            )
            .padding(7.dp)
            .clip(RoundedCornerShape(48.dp))
            .background(Color(0xFF0B0C0D))
    ) {
        content()
    }
}

@Composable
private fun FrontFace(state: PixelState) {
    TitaniumFrame {
        Box(
            Modifier
                .fillMaxSize()
                .padding(4.dp)
                .clip(RoundedCornerShape(44.dp))
                .background(Bg)
        ) {
            // Screen content
            Box(Modifier.fillMaxSize()) {
                when (state.screen) {
                    ScreenState.OFF, ScreenState.LOCKED -> LockScreen(state)
                    ScreenState.UNLOCKED -> if (state.activeApp != null) {
                        AppScreen(state.activeApp!!, state)
                    } else {
                        HomeScreen(state)
                    }
                }
                if (state.shade == Shade.QS && state.screen == ScreenState.UNLOCKED) {
                    QuickSettingsShade(state)
                }
                if (state.showRecents) {
                    RecentsSwitcher(state)
                }
            }

            // Status bar
            if (state.screen != ScreenState.OFF) {
                StatusBar(state, Modifier.align(Alignment.TopCenter))
            }

            // Top camera island pill — w-24 h-6 (42MP Tensor Vision + Face Unlock)
            Box(
                Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 12.dp)
                    .width(96.dp)
                    .height(24.dp)
                    .graphicsLayer { }
            ) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .clip(RoundedCornerShape(50))
                        .background(Color(0xFF050607))
                        .border(1.dp, Color(0xFF202225), RoundedCornerShape(50))
                )
                // 42MP Tensor Vision lens
                Canvas(Modifier.align(Alignment.CenterStart).padding(start = 12.dp).size(11.dp)) {
                    drawCircle(Color(0xFF101418))
                    drawCircle(Color(0xFF1B3A5C), radius = size.minDimension / 2.6f)
                    drawCircle(Color(0xFF8AB4F8).copy(alpha = 0.8f), radius = size.minDimension / 6f,
                        center = center - Offset(2f, 2f))
                }
                // Face unlock sensor
                Box(
                    Modifier
                        .align(Alignment.CenterEnd)
                        .padding(end = 14.dp)
                        .size(7.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF2A2D31))
                )
            }

            // Gesture navigation bar
            if (state.screen == ScreenState.UNLOCKED && state.shade == Shade.CLOSED && !state.showRecents) {
                GestureBar(state, Modifier.align(Alignment.BottomCenter))
            }
        }
    }
}

@Composable
fun StatusBar(state: PixelState, modifier: Modifier = Modifier) {
    val time = rememberTime()
    Row(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 22.dp, vertical = 15.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(time.hhmm(), color = TextHi, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            if (state.airplane) {
                Icon(Icons.Filled.Wifi, null, tint = TextLow, modifier = Modifier.size(0.dp))
                Text("✈", color = PixelYellow, fontSize = 11.sp)
            } else {
                Icon(Icons.Filled.SignalCellularAlt, null, tint = TextHi, modifier = Modifier.size(13.dp))
                Icon(
                    Icons.Filled.Wifi, null,
                    tint = if (state.wifi) TextHi else TextLow,
                    modifier = Modifier.size(14.dp)
                )
            }
            Icon(
                Icons.Filled.BatteryFull, null,
                tint = if (state.batterySaver) PixelYellow else if (state.battery < 20) PixelRed else PixelGreen,
                modifier = Modifier.size(17.dp)
            )
            Text("${state.battery}%", color = TextMed, fontSize = 11.sp)
        }
    }
}

@Composable
fun GestureBar(state: PixelState, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(34.dp)
            .padding(bottom = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Box(
            Modifier
                .width(132.dp)
                .height(5.dp)
                .clip(RoundedCornerShape(50))
                .background(Color.White.copy(alpha = 0.85f))
                .clickableNoRipple {
                    if (state.activeApp != null || state.showRecents) state.home()
                }
        )
        // invisible zones: left = back, right = recents
        Row(Modifier.fillMaxSize()) {
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clickableNoRipple { state.back() })
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clickableNoRipple { state.home() })
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clickableNoRipple { state.recents() })
        }
    }
}

@Composable
private fun BackFace(state: PixelState) {
    TitaniumFrame {
        Box(
            Modifier
                .fillMaxSize()
                .padding(4.dp)
                .clip(RoundedCornerShape(44.dp))
                .background(
                    Brush.verticalGradient(
                        listOf(Color(0xFF17191C), Color(0xFF222428), Color(0xFF141619))
                    )
                )
        ) {
            Column(Modifier.fillMaxSize().padding(20.dp)) {
                Text(
                    "HARDWARE BACK INSPECTOR",
                    color = TextLow, fontSize = 10.sp, fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(14.dp))

                // Pixel Camera Visor
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(150.dp)
                        .clip(RoundedCornerShape(34.dp))
                        .background(
                            Brush.horizontalGradient(
                                listOf(Color(0xFF3A3E43), Color(0xFF232629), Color(0xFF44484D))
                            )
                        )
                        .border(1.dp, Color(0xFF55595E), RoundedCornerShape(34.dp))
                        .padding(14.dp)
                ) {
                    Row(
                        Modifier.fillMaxSize(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        VisorLens("50MP", "Wide ƒ/1.68")
                        VisorLens("48MP", "Tele 5x")
                        VisorLens("50MP", "Ultra-wide")
                    }
                    // visor sensor + flash
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp)
                            .size(16.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFFDD663))
                    )
                }

                Spacer(Modifier.height(10.dp))
                Text("Pixel Camera Visor · 3-lens array", color = TextMed, fontSize = 11.sp)

                Spacer(Modifier.height(22.dp))

                SpecChip("Chipset", "Google Tensor G5 — 3nm Titan")
                SpecChip("Front camera", "42MP Tensor Vision · Face Unlock")
                SpecChip("Body", "Grade-5 titanium frame")
                SpecChip("Display", "6.9\" Actua LTPO · 1–120Hz")
                SpecChip("Battery", "5,800 mAh · 100W wired")
                SpecChip("Security", "Titan M2 · under-display FP")
                SpecChip("Memory", "16GB RAM · 512GB UFS 4.2")

                Spacer(Modifier.weight(1f))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("G", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Black)
                    Spacer(Modifier.width(8.dp))
                    Column {
                        Text("Pixel 10 Pro Max", color = TextHi, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        Text("Pixel Experience", color = TextLow, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun VisorLens(mp: String, sub: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(72.dp)
                .clip(CircleShape)
                .background(Color(0xFF0D0F11))
                .border(2.dp, Color(0xFF6A6F75), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Canvas(Modifier.fillMaxSize().padding(10.dp)) {
                drawCircle(Color(0xFF1A2230))
                drawCircle(Color(0xFF274C77), radius = size.minDimension / 2.4f)
                drawCircle(Color(0xFF8AB4F8).copy(alpha = 0.9f), radius = size.minDimension / 7f,
                    center = center - Offset(4f, 4f))
            }
        }
        Spacer(Modifier.height(5.dp))
        Text(mp, color = TextHi, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        Text(sub, color = TextLow, fontSize = 8.sp)
    }
}

@Composable
private fun SpecChip(k: String, v: String) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Container)
            .border(1.dp, Border.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(k, color = TextLow, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            Text(v, color = TextHi, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        }
    }
}
