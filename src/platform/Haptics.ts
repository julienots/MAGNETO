import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/** Three-level haptic language: light = interaction, medium = impact, heavy = explosion/boss. */
class HapticsService {
  enabled = true;
  private last = 0;
  private native = Capacitor.isNativePlatform();

  private gate(minGap: number) {
    const now = performance.now();
    if (!this.enabled || now - this.last < minGap) return false;
    this.last = now;
    return true;
  }
  light() {
    if (!this.gate(40)) return;
    if (this.native) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    else navigator.vibrate?.(8);
  }
  medium() {
    if (!this.gate(60)) return;
    if (this.native) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    else navigator.vibrate?.(22);
  }
  heavy() {
    if (!this.gate(90)) return;
    if (this.native) Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    else navigator.vibrate?.([40, 30, 60]);
  }
  success() {
    if (!this.gate(100)) return;
    if (this.native) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    else navigator.vibrate?.([20, 40, 20]);
  }
}
export const haptics = new HapticsService();
