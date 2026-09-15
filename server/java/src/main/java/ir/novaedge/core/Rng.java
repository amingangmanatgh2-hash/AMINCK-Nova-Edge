// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — core/Rng.java (پورت دقیق shared/engine/rng.js)
//  جاوا int سی‌ودو بیتی signed است — دقیقاً همان سمانتیک |0 در JS.
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.core;

public final class Rng {

    private Rng() {
    }

    public static int u32(long x) {
        return (int) (x & 0xFFFFFFFFL);
    }

    /** معادل Math.round جاوااسکریپت (نصف به +∞) برای double */
    public static long jsRound(double x) {
        return (long) Math.floor(x + 0.5);
    }

    public static double roundTo(double n, int digits) {
        double f = Math.pow(10, digits);
        return jsRound(n * f) / f;
    }

    public static double clamp(double n, double min, double max) {
        double v = Double.isFinite(n) ? n : 0;
        return Math.max(min, Math.min(max, v));
    }

    /** mulberry32 — دنبالهٔ یکسان با JS/PHP */
    public static java.util.function.DoubleSupplier mulberry32(int seed) {
        final int[] a = {seed};
        return () -> {
            a[0] = a[0] + 0x6D2B79F5;
            int t = a[0];
            int a1 = t ^ (t >>> 15);
            int b1 = t | 1;
            t = a1 * b1; // ضرب int جاوا = Math.imul (wrap mod 2^32)
            int a2 = t ^ (t >>> 7);
            int b2 = t | 61;
            t ^= t + a2 * b2;
            return Integer.toUnsignedLong(t ^ (t >>> 14)) / 4294967296.0;
        };
    }

    /** هش FNV-1a مثل hashSeed در rng.js */
    public static int hashSeed(String s) {
        int h = 2166136261;
        for (int i = 0; i < s.length(); i++) {
            h ^= s.charAt(i);
            h *= 16777619;
        }
        return h == 0 ? 1 : h;
    }

    /** کلاس Rng با متدهای float/int/chance/pick/weighted/gauss/normal/shuffle */
    public static class Generator {
        private final java.util.function.DoubleSupplier next;

        public Generator(int seed) {
            this.next = mulberry32(seed == 0 ? 1 : seed);
        }

        public double float_() {
            return next.getAsDouble();
        }

        public int int_(double min, double max) {
            int lo = (int) Math.ceil(min);
            int hi = (int) Math.floor(max);
            if (hi <= lo) {
                return lo;
            }
            return lo + (int) Math.floor(next.getAsDouble() * (hi - lo + 1));
        }

        public boolean chance(double p) {
            return next.getAsDouble() < p;
        }

        public <T> T pick(java.util.List<T> arr) {
            if (arr == null || arr.isEmpty()) {
                return null;
            }
            return arr.get((int) Math.floor(next.getAsDouble() * arr.size()) % arr.size());
        }

        public double gauss() {
            double u = 0;
            double v = 0;
            while (u == 0) {
                u = next.getAsDouble();
            }
            while (v == 0) {
                v = next.getAsDouble();
            }
            return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        }

        public double normal(double mean, double sd) {
            return mean + gauss() * sd;
        }

        public <T> java.util.List<T> shuffle(java.util.List<T> arr) {
            java.util.List<T> a = new java.util.ArrayList<>(arr);
            for (int i = a.size() - 1; i > 0; i--) {
                int j = (int) Math.floor(next.getAsDouble() * (i + 1));
                T t = a.get(i);
                a.set(i, a.get(j));
                a.set(j, t);
            }
            return a;
        }
    }
}
