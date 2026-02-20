import { motion } from "framer-motion"
import { useState } from "react"

export default function Home() {
  const [loginMode, setLoginMode] = useState<"landing" | "admin" | "viewer" | null>(null)
  const [adminUsername, setAdminUsername] = useState("")
  const [adminPassword, setAdminPassword] = useState("")
  const [viewerUsername, setViewerUsername] = useState("")
  const [viewerPassword, setViewerPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleAdminClick = () => {
    setLoginMode("admin")
    setError("")
  }

  const handleViewerClick = () => {
    setLoginMode("viewer")
    setError("")
  }

  const handleBack = () => {
    setLoginMode(null)
    setAdminUsername("")
    setAdminPassword("")
    setViewerUsername("")
    setViewerPassword("")
    setError("")
  }

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    setTimeout(() => {
      if (adminUsername && adminPassword) {
        console.log("Admin login:", { adminUsername, adminPassword })
        setLoading(false)
      } else {
        setError("Please enter username and password")
        setLoading(false)
      }
    }, 1000)
  }

  const handleViewerLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    setTimeout(() => {
      if (viewerUsername && viewerPassword) {
        console.log("Viewer login:", { viewerUsername, viewerPassword })
        setLoading(false)
      } else {
        setError("Please enter username and password")
        setLoading(false)
      }
    }, 1000)
  }

  return (
    <div style={styles.wrapper}>
      {/* Full screen background video */}
      <video
        style={styles.video}
        autoPlay
        muted
        loop
        playsInline
      >
        <source src="/videos/16-9.mp4" type="video/mp4" />
      </video>

      {/* Landing Content - moves to left when login is selected */}
      <motion.div
        initial={{ opacity: 1, x: 0 }}
        animate={{
          opacity: loginMode ? 0 : 1,
          x: loginMode ? -400 : 0
        }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{
          ...styles.landingContent,
          pointerEvents: loginMode ? "none" : "auto"
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9 }}
          style={styles.center}
        >
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={styles.title}
          >
            Smart Surveillance
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ delay: 0.6 }}
            style={styles.subtitle}
          >
            AI Powered Real-Time Monitoring System
          </motion.p>

          <motion.div
            style={styles.buttons}
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.18 } }
            }}
          >
            <motion.button
              variants={pop}
              style={{
                ...styles.btnPrimary
              }}
              onClick={handleAdminClick}
            >
              Login as Admin
            </motion.button>

            <motion.button
              variants={pop}
              style={{
                ...styles.btnSecondary
              }}
              onClick={handleViewerClick}
            >
              Login as Viewer
            </motion.button>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Division line */}
      <motion.div
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{
          scaleY: loginMode ? 1 : 0,
          opacity: loginMode ? 1 : 0
        }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{
          ...styles.divisionLine,
          background: loginMode === "admin"
            ? "linear-gradient(to bottom, rgba(199,0,0,0.15), rgba(199,0,0,0.2), rgba(199,0,0,0.15))"
            : "linear-gradient(to bottom, rgba(37,99,235,0.15), rgba(37,99,235,0.2), rgba(37,99,235,0.15))"
        }}
      />

      {/* Admin Login Form */}
      {(loginMode === "admin" || loginMode === "viewer" || loginMode) && (
        <motion.div
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={styles.formSide}
        >
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            style={styles.formContainer}
          >
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={styles.formTitle}
            >
              {loginMode === "admin" ? "Admin Login" : "Viewer Login"}
            </motion.h1>

            <motion.form
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              onSubmit={loginMode === "admin" ? handleAdminLogin : handleViewerLogin}
              style={styles.form}
            >
              <div style={styles.formGroup}>
                <label style={styles.label}>Username or Email</label>
                <input
                  type="text"
                  value={loginMode === "admin" ? adminUsername : viewerUsername}
                  onChange={(e) => {
                    if (loginMode === "admin") setAdminUsername(e.target.value)
                    else setViewerUsername(e.target.value)
                  }}
                  style={styles.input}
                  placeholder="Enter your username or email"
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Password</label>
                <input
                  type="password"
                  value={loginMode === "admin" ? adminPassword : viewerPassword}
                  onChange={(e) => {
                    if (loginMode === "admin") setAdminPassword(e.target.value)
                    else setViewerPassword(e.target.value)
                  }}
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
                style={{
                  ...styles.submitBtn,
                  background: loginMode === "admin"
                    ? "linear-gradient(135deg, #c20000 0%, #ff1744 100%)"
                    : "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)"
                }}
              >
                {loading ? "Logging in..." : loginMode === "admin" ? "Login as Admin" : "Login as Viewer"}
              </motion.button>
            </motion.form>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              style={styles.backLink}
            >
              <a onClick={handleBack} style={styles.link}>
                Back to Home
              </a>
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

const pop = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 120 }
  }
}

const styles: any = {
  wrapper: {
    height: "100vh",
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

  landingContent: {
    width: "100%",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 2
  },

  center: {
    textAlign: "center",
    zIndex: 2,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  },

  title: {
    fontSize: "9rem",
    fontWeight: 700,
    letterSpacing: "-5px",
    marginBottom: 10,
    fontFamily: "Rinter, sans-serif"
  },

  subtitle: {
    marginBottom: 40,
    fontSize: "1.2rem"
  },

  buttons: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    justifyContent: "center",
    alignItems: "center",
    marginTop: "40px"
  },

  btnPrimary: {
    padding: "24px 56px",
    borderRadius: 14,
    border: "none",
    background: "linear-gradient(135deg, #c20000 0%, #ff1744 100%)",
    color: "white",
    fontSize: "1.3rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)"
  },

  btnSecondary: {
    padding: "24px 56px",
    borderRadius: 14,
    border: "none",
    background: "linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)",
    color: "white",
    fontSize: "1.3rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)"
  },

  divisionLine: {
    width: "3px",
    height: "100vh",
    backdropFilter: "blur(10px)",
    position: "absolute",
    left: "50%",
    top: 0,
    zIndex: 10,
    transformOrigin: "top",
    transform: "translateX(-50%)",
    boxShadow: "0 0 20px rgba(199,0,0,0.1)"
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
    position: "absolute",
    right: 0,
    top: 0,
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

  formTitle: {
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
    transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
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
    color: "white",
    fontSize: "1.1rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
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
    transition: "color 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
  }
}
