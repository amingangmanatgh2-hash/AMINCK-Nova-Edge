package com.aminck.pixel

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

fun Modifier.clickableNoRipple(onClick: () -> Unit): Modifier = composed {
    val src = remember { MutableInteractionSource() }
    this.clickable(interactionSource = src, indication = null, onClick = onClick)
}

fun squircle(radius: Dp = 22.dp) = RoundedCornerShape(radius)
