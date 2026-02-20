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

      {/* Division line */}
      <motion.div
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        style={styles.divisionLine}
      />

      {/* Right side - Login Form with liquid glass */}
      <motion.div
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={styles.formSide}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9 }}
          style={styles.formContainer}
        >
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={styles.title}
          >
            Viewer Login
          </motion.h1>

          <motion.form
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            onSubmit={handleLogin}
            style={styles.form}
          >
            <div style={styles.formGroup}>
              <label style={styles.label}>Username or Email</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.input}
                placeholder="Enter your username or email"
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
                placeholder="Enter your password"
                required
              />
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={styles.submitBtn}
            >
              {loading ? "Logging in..." : "Login as Viewer"}
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
    display: "flex",
    overflow: "hidden",
    position: "relative",
    color: "white",
    fontFamily: "Inter, system-ui",
    background: "#020617"
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

  divisionLine: {
    width: "3px",
    height: "100vh",
    background: "linear-gradient(to bottom, rgba(37,99,235,0.15), rgba(37,99,235,0.2), rgba(37,99,235,0.15))",
    backdropFilter: "blur(10px)",
    position: "absolute",
    left: "50%",
    top: 0,
    zIndex: 10,
    transform: "translateX(-50%)",
    transformOrigin: "top",
    boxShadow: "0 0 20px rgba(37,99,235,0.1)"
  },

  formSide: {
    width: "50%",
    height: "100vh",
    marginLeft: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(15, 23, 42, 0.2)",
    backdropFilter: "blur(15px)",
    padding: "20px",
    zIndex: 5,
    border: "1px solid rgba(255, 255, 255, 0.15)"
  },

  formContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: "450px"
  },

  title: {
    fontSize: "2.5rem",
    fontWeight: 700,
    letterSpacing: "-1px",
    marginBottom: 40,
    fontFamily: "Google Sans Medium, sans-serif"
  },

  form: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    width: "100%",
    padding: "30px",
    borderRadius: "14px",
    background: "rgba(15, 23, 42, 0.5)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255, 255, 255, 0.1)"
  },

  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    textAlign: "left"
  },

  label: {
    fontSize: "0.95rem",
    fontWeight: 500,
    color: "#e2e8f0"
  },

  input: {
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    background: "rgba(30, 41, 59, 0.8)",
    color: "white",
    fontSize: "1rem",
    transition: "all 0.3s ease",
    outline: "none",
    boxSizing: "border-box" as const
  },

  error: {
    color: "#ff6b6b",
    fontSize: "0.9rem",
    padding: "10px",
    background: "rgba(255, 107, 107, 0.1)",
    borderRadius: "6px",
    border: "1px solid rgba(255, 107, 107, 0.3)"
  },

  submitBtn: {
    padding: "14px 28px",
    marginTop: 10,
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)",
    color: "white",
    fontSize: "1.1rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.3s ease"
  },

  backLink: {
    marginTop: 20,
    fontSize: "0.95rem",
    color: "#cbd5e1"
  },

  link: {
    color: "#2563eb",
    textDecoration: "none",
    cursor: "pointer",
    transition: "color 0.3s ease"
  }
}
