import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Admin from "./pages/Admin";
import Viewer from "./pages/Viewer";

export default function App() {
  return (
    <BrowserRouter>
    <Routes>

    {/* Landing + Login */}
    <Route path="/" element={<Home />} />

    {/* Dashboards */}
    <Route path="/admin" element={<Admin />} />
    <Route path="/viewer" element={<Viewer />} />

    {/* Optional legacy paths */}
    <Route path="/admin-dashboard" element={<Admin />} />
    <Route path="/viewer-dashboard" element={<Viewer />} />

    </Routes>
    </BrowserRouter>
  );
}
