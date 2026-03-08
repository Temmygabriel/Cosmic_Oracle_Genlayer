"use client"

import { useState, useEffect, useRef } from "react"
import { createClient, createAccount } from "genlayer-js"
import { studionet } from "genlayer-js/chains"

// ── CONFIG ─────────────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = "0x0181692b49E7D33b73C4613518Ad38C19970BD06" as `0x${string}`

const account = createAccount()
const client = createClient({ chain: studionet, account })

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const SIGNS = [
  { name: "Aries",       symbol: "♈", dates: "Mar 21 – Apr 19",  color: "#ff6b6b" },
  { name: "Taurus",      symbol: "♉", dates: "Apr 20 – May 20",  color: "#a8e063" },
  { name: "Gemini",      symbol: "♊", dates: "May 21 – Jun 20",  color: "#f7d794" },
  { name: "Cancer",      symbol: "♋", dates: "Jun 21 – Jul 22",  color: "#b8c6db" },
  { name: "Leo",         symbol: "♌", dates: "Jul 23 – Aug 22",  color: "#f9ca24" },
  { name: "Virgo",       symbol: "♍", dates: "Aug 23 – Sep 22",  color: "#6ab04c" },
  { name: "Libra",       symbol: "♎", dates: "Sep 23 – Oct 22",  color: "#e056fd" },
  { name: "Scorpio",     symbol: "♏", dates: "Oct 23 – Nov 21",  color: "#eb4d4b" },
  { name: "Sagittarius", symbol: "♐", dates: "Nov 22 – Dec 21",  color: "#f0932b" },
  { name: "Capricorn",   symbol: "♑", dates: "Dec 22 – Jan 19",  color: "#6c5ce7" },
  { name: "Aquarius",    symbol: "♒", dates: "Jan 20 – Feb 18",  color: "#00cec9" },
  { name: "Pisces",      symbol: "♓", dates: "Feb 19 – Mar 20",  color: "#a29bfe" },
]

const STARS = Array.from({ length: 80 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 2 + 0.5,
  opacity: Math.random() * 0.7 + 0.1,
  delay: Math.random() * 4,
}))

// ── TYPES ──────────────────────────────────────────────────────────────────
interface Fortune {
  id: number
  name: string
  sign: string
  question: string
  fortune: string
}

type Phase = "idle" | "submitting" | "waiting" | "revealed"

// ── COMPONENT ─────────────────────────────────────────────────────────────
export default function Home() {
  const [name, setName] = useState("")
  const [sign, setSign] = useState("")
  const [question, setQuestion] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  const [fortune, setFortune] = useState<Fortune | null>(null)
  const [totalReadings, setTotalReadings] = useState<number | null>(null)
  const [recentReadings, setRecentReadings] = useState<Fortune[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  const selectedSign = SIGNS.find((s) => s.name === sign)

  useEffect(() => {
    loadStats()
  }, [])

  useEffect(() => {
    if (phase === "waiting") {
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      setElapsed(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [phase])

  async function loadStats() {
    try {
      const total = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_total",
        args: [],
      })
      setTotalReadings(Number(total))

      if (Number(total) > 0) {
        const raw = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: "get_recent",
          args: [5],
        })
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
        setRecentReadings(Array.isArray(parsed) ? parsed : [])
      }
    } catch (_) {}
  }

  async function askOracle() {
    if (!name.trim() || !sign || !question.trim()) return
    setError(null)
    setFortune(null)
    setTxHash(null)
    setPhase("submitting")

    try {
      // leaderOnly=true: only the leader node runs the AI — much faster
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS,
        functionName: "ask_oracle",
        args: [name.trim(), sign, question.trim()],
        value: BigInt(0),
        leaderOnly: true,
      })
      setTxHash(String(hash))
      setPhase("waiting")

      // Wait for ACCEPTED (not FINALIZED) — hits in ~10-20s with leaderOnly
      // retries=60 x interval=3000ms = 3 minutes max
      const receipt = await (client as any).waitForTransactionReceipt({
        hash: hash,
        status: "ACCEPTED",
        retries: 60,
        interval: 3000,
      })

      // Try reading fortune directly from the receipt leader data (fastest path)
      let parsed: Fortune | null = null
      try {
        const leaderReceipt = (receipt as any)?.consensus_data?.leader_receipt
        const returnVal = leaderReceipt?.eq_outputs?.leader?.["0"]
        if (returnVal) {
          parsed = typeof returnVal === "string" ? JSON.parse(returnVal) : returnVal
        }
      } catch (_) {}

      // Fallback: read from contract storage if receipt didn't contain it
      if (!parsed) {
        const newTotal = Number(
          await client.readContract({
            address: CONTRACT_ADDRESS,
            functionName: "get_total",
            args: [],
          })
        )
        const raw = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: "get_fortune",
          args: [newTotal],
        })
        parsed = typeof raw === "string" ? JSON.parse(raw) : (raw as Fortune)
        setTotalReadings(newTotal)
      }

      if (parsed) {
        setFortune(parsed)
        setTotalReadings((t) => (t ?? 0) + 1)
        setPhase("revealed")
        loadStats()
      } else {
        throw new Error("Could not read fortune from the cosmos.")
      }

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase("idle")
    }
  }

  function reset() {
    setPhase("idle")
    setFortune(null)
    setError(null)
    setTxHash(null)
    setName("")
    setQuestion("")
    setSign("")
  }

  const canSubmit = name.trim() && sign && question.trim() && phase === "idle"

  return (
    <div style={css.root}>
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; } 50% { opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes reveal {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        input::placeholder { color: #5a4a7a; }
        textarea::placeholder { color: #5a4a7a; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #3a2060; border-radius: 2px; }
      `}</style>

      {/* ── STARFIELD ── */}
      <div style={css.starfield}>
        {STARS.map((star) => (
          <div
            key={star.id}
            style={{
              position: "absolute",
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              borderRadius: "50%",
              background: "#fff",
              opacity: star.opacity,
              animation: `twinkle ${2 + star.delay}s ease-in-out infinite`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
      </div>

      <div style={css.content}>

        {/* ── HEADER ── */}
        <header style={css.header}>
          <div style={{ animation: "float 6s ease-in-out infinite" }}>
            <div style={css.orbContainer}>
              <div style={css.orb} />
              <div style={css.orbGlow} />
              <span style={css.orbSymbol}>✦</span>
            </div>
          </div>
          <h1 style={css.title}>COSMIC ORACLE</h1>
          <p style={css.subtitle}>Ask the stars. Powered by GenLayer AI.</p>
          {totalReadings !== null && totalReadings > 0 && (
            <div style={css.counter}>
              <span style={css.counterDot} />
              {totalReadings} cosmic reading{totalReadings !== 1 ? "s" : ""} delivered on-chain
            </div>
          )}
        </header>

        {/* ── MAIN CARD ── */}
        <div style={css.card}>

          {/* ── IDLE / FORM ── */}
          {phase === "idle" && (
            <div style={{ animation: "reveal 0.5s ease forwards" }}>
              <div style={css.sectionLabel}>YOUR NAME</div>
              <input
                style={css.input}
                placeholder="Enter your name…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
              />

              <div style={{ ...css.sectionLabel, marginTop: 20 }}>YOUR STAR SIGN</div>
              <div style={css.signGrid}>
                {SIGNS.map((s) => (
                  <button
                    key={s.name}
                    style={{
                      ...css.signBtn,
                      ...(sign === s.name
                        ? { borderColor: s.color, background: `${s.color}18`, color: s.color }
                        : {}),
                    }}
                    onClick={() => setSign(s.name)}
                  >
                    <span style={{ fontSize: 20 }}>{s.symbol}</span>
                    <span style={{ fontSize: 10, marginTop: 2 }}>{s.name}</span>
                  </button>
                ))}
              </div>
              {sign && (
                <div style={{ ...css.signInfo, color: selectedSign?.color }}>
                  {selectedSign?.symbol} {selectedSign?.name} · {selectedSign?.dates}
                </div>
              )}

              <div style={{ ...css.sectionLabel, marginTop: 20 }}>YOUR QUESTION</div>
              <textarea
                style={css.textarea}
                placeholder="What does the cosmos hold for you?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={200}
                rows={3}
              />

              {error && <div style={css.error}>⚠️ {error}</div>}

              <button
                style={{ ...css.submitBtn, ...(!canSubmit ? css.submitBtnDim : {}) }}
                onClick={askOracle}
                disabled={!canSubmit}
              >
                ✦ Consult the Oracle ✦
              </button>
            </div>
          )}

          {/* ── SUBMITTING ── */}
          {phase === "submitting" && (
            <div style={css.waitContainer}>
              <div style={css.spinRing} />
              <div style={css.waitTitle}>Sending your question to the cosmos…</div>
              <div style={css.waitSub}>Submitting transaction to GenLayer</div>
            </div>
          )}

          {/* ── WAITING FOR CONSENSUS ── */}
          {phase === "waiting" && (
            <div style={css.waitContainer}>
              <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto 24px" }}>
                <div style={{ ...css.pulseRing, animationDelay: "0s" }} />
                <div style={{ ...css.pulseRing, animationDelay: "0.8s" }} />
                <div style={css.orbSmall}>✦</div>
              </div>
              <div style={css.waitTitle}>The Oracle is reading your fate…</div>
              <div style={css.waitSub}>AI validators are reaching cosmic consensus</div>
              <div style={css.timer}>{elapsed}s</div>
              {txHash && (
                <div style={css.txPill}>
                  TX: {txHash.slice(0, 10)}…{txHash.slice(-6)}
                </div>
              )}
              <div style={css.waitHint}>
                This usually takes 10–30 seconds. Hang tight ✨
              </div>
            </div>
          )}

          {/* ── REVEALED ── */}
          {phase === "revealed" && fortune && (
            <div style={{ animation: "reveal 0.8s ease forwards" }}>
              <div style={css.revealHeader}>
                <span style={{ fontSize: 40 }}>
                  {SIGNS.find((s) => s.name === fortune.sign)?.symbol ?? "✦"}
                </span>
                <div>
                  <div style={css.revealName}>{fortune.name}</div>
                  <div style={{ ...css.revealSign, color: selectedSign?.color ?? "#c084fc" }}>
                    {fortune.sign}
                  </div>
                </div>
              </div>

              <div style={css.questionBox}>"{fortune.question}"</div>

              <div style={css.fortuneText}>{fortune.fortune}</div>

              <div style={css.idBadge}>Reading #{fortune.id} · Sealed on GenLayer</div>

              <button style={css.againBtn} onClick={reset}>
                ✦ Ask Again ✦
              </button>
            </div>
          )}
        </div>

        {/* ── RECENT READINGS ── */}
        {recentReadings.length > 0 && phase === "idle" && (
          <div style={css.recentSection}>
            <div style={css.recentTitle}>✦ Recent Cosmic Readings ✦</div>
            <div style={css.recentList}>
              {recentReadings.map((r) => (
                <div key={r.id} style={css.recentCard}>
                  <div style={css.recentCardHeader}>
                    <span style={{ fontSize: 18 }}>
                      {SIGNS.find((s) => s.name === r.sign)?.symbol ?? "✦"}
                    </span>
                    <span style={css.recentName}>{r.name}</span>
                    <span style={css.recentSign}>{r.sign}</span>
                    <span style={css.recentId}>#{r.id}</span>
                  </div>
                  <div style={css.recentQ}>"{r.question}"</div>
                  <div style={css.recentFortune}>{r.fortune}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <footer style={css.footer}>
          Powered by GenLayer Intelligent Contracts · Studionet
        </footer>
      </div>
    </div>
  )
}

// ── STYLES ─────────────────────────────────────────────────────────────────
const TITLE_FONT = "'Cinzel', 'Georgia', serif"
const BODY_FONT  = "'Raleway', 'Georgia', sans-serif"

const css: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse at 50% 0%, #1a0a2e 0%, #0d0818 50%, #050510 100%)",
    color: "#e0d4f7",
    fontFamily: BODY_FONT,
    position: "relative",
    overflowX: "hidden",
  },
  starfield: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
  },
  content: {
    position: "relative",
    zIndex: 1,
    maxWidth: 680,
    margin: "0 auto",
    padding: "40px 20px 60px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  header: {
    textAlign: "center",
    paddingBottom: 8,
  },
  orbContainer: {
    position: "relative",
    width: 80,
    height: 80,
    margin: "0 auto 16px",
  },
  orb: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    background: "radial-gradient(circle at 35% 35%, #c084fc, #7c3aed 50%, #2e1065)",
    boxShadow: "0 0 40px #7c3aed88, 0 0 80px #4c1d9533",
  },
  orbGlow: {
    position: "absolute",
    inset: -10,
    borderRadius: "50%",
    border: "1px solid #7c3aed44",
    animation: "spin-slow 8s linear infinite",
  },
  orbSymbol: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: 28,
    color: "#f0e6ff",
    textShadow: "0 0 20px #fff",
  },
  title: {
    fontFamily: TITLE_FONT,
    fontSize: "clamp(28px, 6vw, 42px)",
    fontWeight: 700,
    margin: "0 0 8px",
    background: "linear-gradient(135deg, #e9d5ff, #c084fc, #a855f7)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    letterSpacing: "0.12em",
  },
  subtitle: {
    fontFamily: BODY_FONT,
    fontWeight: 300,
    fontSize: 14,
    color: "#9d78c4",
    margin: "0 0 12px",
    letterSpacing: "0.06em",
  },
  counter: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#7c5ab8",
    background: "#1a0a3a",
    border: "1px solid #3a1a6a",
    borderRadius: 20,
    padding: "4px 14px",
    letterSpacing: "0.04em",
  },
  counterDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#a855f7",
    boxShadow: "0 0 8px #a855f7",
  },
  card: {
    background: "linear-gradient(160deg, #1a0a3a 0%, #0f0726 100%)",
    border: "1px solid #3a1a6a",
    borderRadius: 20,
    padding: "32px 28px",
    boxShadow: "0 20px 60px #0a051888, inset 0 1px 0 #4a2a7a33",
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: "0.2em",
    color: "#6a4a9a",
    marginBottom: 8,
    fontFamily: TITLE_FONT,
  },
  input: {
    width: "100%",
    background: "#0d0520",
    border: "1px solid #3a1a6a",
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 15,
    color: "#e0d4f7",
    fontFamily: BODY_FONT,
    outline: "none",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    background: "#0d0520",
    border: "1px solid #3a1a6a",
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 15,
    color: "#e0d4f7",
    fontFamily: BODY_FONT,
    outline: "none",
    resize: "none",
    boxSizing: "border-box",
    lineHeight: 1.6,
  },
  signGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 8,
  },
  signBtn: {
    background: "#0d0520",
    border: "1px solid #2a1050",
    borderRadius: 10,
    padding: "10px 4px",
    cursor: "pointer",
    color: "#9d78c4",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: BODY_FONT,
    transition: "all 0.15s",
  },
  signInfo: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 10,
    letterSpacing: "0.06em",
    fontFamily: TITLE_FONT,
  },
  error: {
    background: "#1a0808",
    border: "1px solid #4a1515",
    borderRadius: 8,
    padding: "10px 14px",
    color: "#f87171",
    fontSize: 13,
    marginTop: 16,
    lineHeight: 1.5,
  },
  submitBtn: {
    width: "100%",
    marginTop: 24,
    padding: "16px",
    background: "linear-gradient(135deg, #7c3aed, #a855f7)",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: 15,
    fontFamily: TITLE_FONT,
    fontWeight: 600,
    letterSpacing: "0.1em",
    cursor: "pointer",
    boxShadow: "0 4px 24px #7c3aed55",
  },
  submitBtnDim: {
    opacity: 0.4,
    cursor: "not-allowed",
    boxShadow: "none",
  },
  waitContainer: {
    textAlign: "center",
    padding: "20px 0",
  },
  spinRing: {
    width: 80,
    height: 80,
    margin: "0 auto 24px",
    border: "2px solid #2a1050",
    borderTop: "2px solid #a855f7",
    borderRadius: "50%",
    animation: "spin-slow 1s linear infinite",
  },
  pulseRing: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    border: "2px solid #a855f7",
    animation: "pulse-ring 2s ease-out infinite",
  },
  orbSmall: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 32,
    color: "#c084fc",
    textShadow: "0 0 20px #a855f7",
  },
  waitTitle: {
    fontFamily: TITLE_FONT,
    fontSize: 18,
    color: "#c084fc",
    marginBottom: 8,
    letterSpacing: "0.06em",
  },
  waitSub: {
    fontSize: 13,
    color: "#6a4a9a",
    marginBottom: 16,
  },
  timer: {
    fontFamily: TITLE_FONT,
    fontSize: 36,
    color: "#a855f7",
    textShadow: "0 0 20px #a855f788",
    marginBottom: 12,
  },
  txPill: {
    display: "inline-block",
    background: "#0d0520",
    border: "1px solid #2a1050",
    borderRadius: 20,
    padding: "4px 14px",
    fontSize: 11,
    color: "#6a4a9a",
    marginBottom: 16,
    fontFamily: "monospace",
  },
  waitHint: {
    fontSize: 13,
    color: "#4a3070",
    fontStyle: "italic",
  },
  revealHeader: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
    paddingBottom: 20,
    borderBottom: "1px solid #2a1050",
  },
  revealName: {
    fontFamily: TITLE_FONT,
    fontSize: 22,
    color: "#e0d4f7",
    letterSpacing: "0.08em",
  },
  revealSign: {
    fontSize: 13,
    letterSpacing: "0.1em",
    fontFamily: TITLE_FONT,
    marginTop: 2,
  },
  questionBox: {
    fontSize: 14,
    color: "#7c5ab8",
    fontStyle: "italic",
    marginBottom: 20,
    lineHeight: 1.6,
    padding: "12px 16px",
    background: "#0d0520",
    borderRadius: 8,
    borderLeft: "3px solid #4a1a8a",
  },
  fortuneText: {
    fontSize: 16,
    lineHeight: 1.9,
    color: "#d4c4f0",
    fontWeight: 300,
    marginBottom: 20,
    letterSpacing: "0.02em",
    animation: "reveal 1s ease forwards",
  },
  idBadge: {
    display: "inline-block",
    fontSize: 11,
    color: "#4a3070",
    background: "#0d0520",
    border: "1px solid #2a1050",
    borderRadius: 20,
    padding: "4px 12px",
    marginBottom: 24,
    fontFamily: "monospace",
  },
  againBtn: {
    width: "100%",
    padding: "14px",
    background: "transparent",
    border: "1px solid #7c3aed",
    borderRadius: 12,
    color: "#a855f7",
    fontSize: 14,
    fontFamily: TITLE_FONT,
    letterSpacing: "0.1em",
    cursor: "pointer",
  },
  recentSection: {
    marginTop: 8,
  },
  recentTitle: {
    textAlign: "center",
    fontFamily: TITLE_FONT,
    fontSize: 13,
    color: "#4a3070",
    letterSpacing: "0.15em",
    marginBottom: 14,
  },
  recentList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  recentCard: {
    background: "#0f0722",
    border: "1px solid #1e1040",
    borderRadius: 12,
    padding: "14px 16px",
  },
  recentCardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  recentName: {
    fontFamily: TITLE_FONT,
    fontSize: 13,
    color: "#c084fc",
    flex: 1,
  },
  recentSign: {
    fontSize: 11,
    color: "#6a4a9a",
    letterSpacing: "0.06em",
  },
  recentId: {
    fontSize: 10,
    color: "#3a2060",
    fontFamily: "monospace",
  },
  recentQ: {
    fontSize: 12,
    color: "#5a3a80",
    fontStyle: "italic",
    marginBottom: 6,
    lineHeight: 1.5,
  },
  recentFortune: {
    fontSize: 13,
    color: "#8a6ab0",
    lineHeight: 1.7,
    fontWeight: 300,
  },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: "#2a1a40",
    letterSpacing: "0.08em",
    paddingTop: 8,
  },
}
