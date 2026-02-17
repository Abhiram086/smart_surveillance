import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"

export default function Landing() {
  const nav = useNavigate()

  return (
    <div style={styles.wrapper}>
    {/* Background glow */}
    <div style={styles.bg} />

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
    style={styles.btnPrimary}
    onClick={() => nav("/admin")}
    >
    Admin Panel
    </motion.button>

    <motion.button
    variants={pop}
    style={styles.btnSecondary}
    onClick={() => nav("/user")}
    >
    Viewer Mode
    </motion.button>
    </motion.div>
    </motion.div>
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
    background: "radial-gradient(circle at 20% 20%, #0f172a, #020617)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
    color: "white",
    fontFamily: "Inter, system-ui"
  },

  bg: {
    position: "absolute",
    width: "1200px",
    height: "1200px",
    background:
    "radial-gradient(circle, rgba(37,99,235,0.25), transparent 60%)",
    filter: "blur(120px)",
    animation: "float 12s ease-in-out infinite"
  },

  center: {
    textAlign: "center",
    zIndex: 2
  },

  title: {
    fontSize: "4rem",
    fontWeight: 700,
    letterSpacing: "-1px",
    marginBottom: 10
  },

  subtitle: {
    marginBottom: 40,
    fontSize: "1.2rem"
  },

  buttons: {
    display: "flex",
    gap: 20,
    justifyContent: "center"
  },

  btnPrimary: {
    padding: "14px 28px",
    borderRadius: 14,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontSize: "1rem",
    cursor: "pointer"
  },

  btnSecondary: {
    padding: "14px 28px",
    borderRadius: 14,
    border: "1px solid #334155",
    background: "transparent",
    color: "white",
    fontSize: "1rem",
    cursor: "pointer"
  }
}
