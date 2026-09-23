import { useState } from "react";
import { useTheme, themes } from "../pages/ThemeContext";

export default function ThemeSwitcher() {
  const { themeKey, setThemeKey } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Button — sits inside TopHeader */}
      <button
        onClick={() => setOpen(true)}
        title="Change Theme"
        style={{
          display: "flex", alignItems: "center", gap: "5px",
          background: "rgba(255,255,255,0.14)",
          border: "1px solid rgba(255,255,255,0.22)",
          borderRadius: "8px", padding: "5px 12px",
          color: "#fff", fontSize: "12.5px", fontWeight: 700,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.26)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.14)"}
      >
        🎨 Theme
      </button>

      {/* Modal */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.50)",
            zIndex: 4000,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: "20px",
              padding: "28px", width: "520px", maxWidth: "95vw",
              boxShadow: "0 25px 60px rgba(0,0,0,0.30)",
              animation: "tmFadeUp 0.2s ease",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <p style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#111827" }}>🎨 Choose Your Theme</p>
                <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#6b7280" }}>Click any theme — the whole app updates instantly</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "#f3f4f6", border: "none", borderRadius: "8px", width: "32px", height: "32px", cursor: "pointer", fontSize: "18px", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}
              >×</button>
            </div>

            {/* Theme Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
              {Object.entries(themes).map(([key, t]) => {
                const active = key === themeKey;
                return (
                  <button
                    key={key}
                    onClick={() => { setThemeKey(key); setOpen(false); }}
                    style={{
                      border: `2.5px solid ${active ? t.accent : "transparent"}`,
                      borderRadius: "14px", padding: 0, cursor: "pointer",
                      background: "none", overflow: "hidden",
                      boxShadow: active
                        ? `0 0 0 3px ${t.accent}40`
                        : "0 2px 8px rgba(0,0,0,0.09)",
                      transition: "all 0.18s ease",
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                  >
                    {/* Mini ERP preview */}
                    <div style={{ display: "flex", height: "68px" }}>
                      {/* Sidebar strip */}
                      <div style={{ width: "30%", background: t.sidebar, padding: "7px 6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: "3px", height: "5px", width: "65%" }} />
                        <div style={{ background: t["--sb-active-bg"], borderRadius: "3px", height: "14px", width: "100%" }} />
                        <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: "3px", height: "4px", width: "80%" }} />
                        <div style={{ background: "rgba(255,255,255,0.10)", borderRadius: "3px", height: "4px", width: "70%" }} />
                      </div>
                      {/* Main area */}
                      <div style={{ flex: 1, background: t.pageBg, padding: "5px" }}>
                        <div style={{
                          background: t.topbarGradient,
                          borderRadius: "4px", height: "11px", marginBottom: "5px"
                        }} />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px" }}>
                          {[0,1,2,3].map(i => (
                            <div key={i} style={{
                              background: "#fff", borderRadius: "4px", height: "16px",
                              borderTop: `2px solid ${t.accent}`,
                              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                            }} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Label */}
                    <div style={{
                      padding: "7px 10px", display: "flex", alignItems: "center", gap: "6px",
                      background: active ? `${t.accent}15` : "#f9fafb",
                      borderTop: "1px solid #f0f0f0",
                    }}>
                      <span style={{ fontSize: "14px" }}>{t.emoji}</span>
                      <span style={{ fontSize: "11.5px", fontWeight: 700, color: active ? t.accent : "#374151" }}>
                        {t.name}
                      </span>
                      {active && (
                        <span style={{
                          marginLeft: "auto", background: t.accent, color: "#fff",
                          borderRadius: "10px", fontSize: "9px", padding: "1px 7px", fontWeight: 800,
                        }}>Active</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <p style={{ margin: "16px 0 0", textAlign: "center", fontSize: "11.5px", color: "#9ca3af" }}>
              Preference saved automatically
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes tmFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}