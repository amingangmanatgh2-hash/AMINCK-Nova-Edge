package com.aminck.pixel

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FlipCameraAndroid
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.filled.Verified
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme

object Experience {

    @Composable
    fun Root(state: PixelState) {
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        listOf(Color(0xFF24272B), Bg),
                        radius = 1400f
                    )
                )
        ) {
            // ambient geometric rings
            val inf = rememberInfiniteTransition(label = "amb")
            val rot by inf.animateFloat(
                initialValue = 0f, targetValue = 360f,
                animationSpec = infiniteRepeatable(tween(60000, easing = LinearEasing), RepeatMode.Restart),
                label = "rot"
            )
            Canvas(
                Modifier
                    .align(Alignment.Center)
                    .size(560.dp)
                    .graphicsLayer(rotationZ = rot, alpha = 0.25f)
            ) {
                val r = size.minDimension / 2f
                for (i in 1..5) {
                    drawCircle(
                        color = listOf(PixelBlue, PixelTeal, PixelPurple, PixelGreen, PixelYellow)[i - 1],
                        radius = r * (0.25f + i * 0.15f),
                        center = Offset(size.width / 2, size.height / 2),
                        style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2f)
                    )
                }
            }

            Column(
                Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                ViewToggle(state)
                Spacer(Modifier.height(18.dp))
                DeviceFrame(state)
            }
        }
    }

    @Composable
    fun ViewToggle(state: PixelState) {
        Row(
            Modifier
                .clip(RoundedCornerShape(50))
                .background(Container)
                .border(1.dp, Border, RoundedCornerShape(50))
                .padding(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TogglePill("Front", Icons.Filled.Smartphone, state.face == Face.FRONT) { state.face = Face.FRONT }
            TogglePill("Back 3D", Icons.Filled.FlipCameraAndroid, state.face == Face.BACK) { state.face = Face.BACK }
        }
    }

    @Composable
    private fun TogglePill(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, active: Boolean, onClick: () -> Unit) {
        Row(
            Modifier
                .clip(RoundedCornerShape(50))
                .background(if (active) Accent else Color.Transparent)
                .clickableNoRipple(onClick)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(icon, null, tint = if (active) Color(0xFF0B1522) else TextMed, modifier = Modifier.size(16.dp))
            Text(
                label,
                color = if (active) Color(0xFF0B1522) else TextMed,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp
            )
        }
    }
}
