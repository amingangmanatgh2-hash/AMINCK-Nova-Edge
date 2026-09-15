// ═══════════════════════════════════════════════════════════════════
//  Nova Edge — core/Json.java
//  دستیارهای دسترسی امن به آبجکت‌های spec/ctx (Map<String,Object>)
//  تا پورت جاوا دقیقاً همان سمانتیک `??` و Number() جاوااسکریپت را داشته باشد.
// ═══════════════════════════════════════════════════════════════════
package ir.novaedge.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class Json {

    private Json() {
    }

    public static double num(Object o, double dflt) {
        if (o == null) {
            return dflt;
        }
        if (o instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(o));
        } catch (NumberFormatException e) {
            return dflt;
        }
    }

    public static double num(Map<String, Object> m, String key, double dflt) {
        return m == null ? dflt : num(m.get(key), dflt);
    }

    /** معادل Number(x) || dflt در JS (صفر/false/null → dflt) */
    public static double numOr(Map<String, Object> m, String key, double dflt) {
        double v = num(m, key, 0);
        return v != 0 ? v : dflt;
    }

    public static String str(Object o, String dflt) {
        if (o == null) {
            return dflt;
        }
        return String.valueOf(o);
    }

    public static String str(Map<String, Object> m, String key, String dflt) {
        return m == null ? dflt : str(m.get(key), dflt);
    }

    public static boolean bool(Map<String, Object> m, String key, boolean dflt) {
        if (m == null) {
            return dflt;
        }
        Object v = m.get(key);
        if (v == null) {
            return dflt;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        if (v instanceof Number n) {
            return n.doubleValue() != 0;
        }
        String s = String.valueOf(v);
        return !s.isEmpty() && !s.equals("0") && !s.equals("false");
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> map(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : null;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> map(Map<String, Object> m, String key) {
        return m == null ? null : map(m.get(key));
    }

    @SuppressWarnings("unchecked")
    public static List<Object> list(Object o) {
        return o instanceof List ? (List<Object>) o : null;
    }

    public static List<Object> list(Map<String, Object> m, String key) {
        return m == null ? null : list(m.get(key));
    }

    public static List<Map<String, Object>> mapList(Object o) {
        List<Object> l = list(o);
        List<Map<String, Object>> out = new ArrayList<>();
        if (l != null) {
            for (Object e : l) {
                Map<String, Object> mm = map(e);
                if (mm != null) {
                    out.add(mm);
                }
            }
        }
        return out;
    }

    public static Map<String, Object> obj() {
        return new LinkedHashMap<>();
    }

    public static Map<String, Object> put(Map<String, Object> m, String k, Object v) {
        m.put(k, v);
        return m;
    }

    /** معادل `a ?? b` */
    public static Object coalesce(Object a, Object b) {
        return a != null ? a : b;
    }

    /** true وقتی مقدار "truthy" است مثل JS */
    public static boolean truthy(Object o) {
        if (o == null) {
            return false;
        }
        if (o instanceof Boolean b) {
            return b;
        }
        if (o instanceof Number n) {
            return n.doubleValue() != 0;
        }
        if (o instanceof List<?> l) {
            return !l.isEmpty();
        }
        if (o instanceof Map<?, ?> m) {
            return !m.isEmpty();
        }
        String s = String.valueOf(o);
        return !s.isEmpty();
    }
}
