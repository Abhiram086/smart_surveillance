import { motion } from "framer-motion"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

export default function ViewerLogin() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const nav = useNavigate()

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    // Simulate login logic
    setTimeout(() => {
      if (username && password) {
        console.log("Viewer login:", { username, password })
        // Here you would typically make an API call
        setLoading(false)
        // nav to viewer dashboard after successful login
      } else {
        setError("Please enter username and password")
        setLoading(false)
      }
    }, 1000)
  }

  return (
    <div style={styles.wrapper}>
      {/* Full screen background video */}
      <motion.video
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        style={styles.video}
        autoPlay
        muted
        loop
        playsInline
      >
        <source src="/videos/16-9.mp4" type="video/mp4" />
      </motion.video>

      {/* Full screen glass overlay with centered form */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={styles.formSide}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={styles.formContainer}
        >
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            style={styles.title}
          >
            Viewer
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            style={styles.subtitle}
          >
            Access live surveillance feeds
          </motion.p>

          <motion.form
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            onSubmit={handleLogin}
            style={styles.form}
          >
            <motion.div
              style={styles.formGroup}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <label style={styles.label}>Username or Email</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.input}
                placeholder="Enter your credentials"
                required
              />
            </motion.div>

            <motion.div
              style={styles.formGroup}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
            >
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                placeholder="Enter your password"
                required
              />
            </motion.div>

            {error && (
              <motion.div
                style={styles.error}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02, boxShadow: "0 6px 25px rgba(37, 99, 235, 0.5)" }}
              whileTap={{ scale: 0.98 }}
              style={styles.submitBtn}
              transition={{ duration: 0.2 }}
            >
              {loading ? (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  ⏳
                </motion.span>
              ) : (
                "Sign In"
              )}
            </motion.button>
          </motion.form>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            style={styles.backLink}
          >
            <a onClick={() => nav("/")} style={styles.link}>
              Back to Home
            </a>
          </motion.p>
        </motion.div>
      </motion.div>
    </div>
  )
}

const styles: any = {
  wrapper: {
    height: "100vh",
    overflow: "hidden",
    position: "relative",
    color: "white",
    fontFamily: "Inter, system-ui",
    background: "#020617",
    margin: 0,
    padding: 0
  },

  video: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    zIndex: 0
  },

  formSide: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(10, 15, 30, 0.45)",
    backdropFilter: "blur(25px)",
    WebkitBackdropFilter: "blur(25px)",
    padding: 0,
    zIndex: 5,
    position: "fixed",
    top: 0,
    left: 0,
    margin: 0
  },

  formContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: "420px",
    padding: "0 20px"
  },

  title: {
    fontSize: "2.8rem",
    fontWeight: 800,
    letterSpacing: "-0.5px",
    marginBottom: 12,
    fontFamily: "Inter, system-ui",
    background: "linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text"
  },

  subtitle: {
    fontSize: "0.95rem",
    fontWeight: 400,
    color: "#a0aec0",
    marginBottom: 35,
    letterSpacing: "0.3px"
  },

  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: "100%",
    padding: "40px 35px",
    borderRadius: "16px",
    background: "rgba(15, 23, 42, 0.4)",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)"
  },

  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    textAlign: "left"
  },

  label: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#e2e8f0",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },

  input: {
    padding: "14px 18px",
    borderRadius: "10px",
    border: "1.5px solid rgba(255, 255, 255, 0.15)",
    background: "rgba(30, 41, 59, 0.6)",
    color: "white",
    fontSize: "1rem",
    fontWeight: 400,
    transition: "all 0.3s ease",
    outline: "none",
    boxSizing: "border-box" as const,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)"
  },

  error: {
    color: "#ffb3ba",
    fontSize: "0.85rem",
    padding: "12px 14px",
    background: "rgba(255, 107, 107, 0.12)",
    borderRadius: "8px",
    border: "1px solid rgba(255, 107, 107, 0.35)",
    fontWeight: 500,
    marginTop: 8
  },

  submitBtn: {
    padding: "14px 32px",
    marginTop: 8,
    borderRadius: "10px",
    border: "none",
    background: "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)",
    color: "white",
    fontSize: "1rem",
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.3s ease",
    boxShadow: "0 4px 15px rgba(37, 99, 235, 0.4)",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },

  backLink: {
    marginTop: 28,
    fontSize: "0.9rem",
    color: "#cbd5e1",
    fontWeight: 500
  },

  link: {
    color: "#60a5fa",
    textDecoration: "none",
    cursor: "pointer",
    transition: "color 0.3s ease",
    fontWeight: 600
  }
}
