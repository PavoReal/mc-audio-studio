import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { APP_NOTICE } from "../constants";
import { BrandMark } from "./BrandMark";

export function MobileGate() {
  useEffect(() => {
    document.documentElement.classList.add("mobile-gated");
    return () => document.documentElement.classList.remove("mobile-gated");
  }, []);
  return (
    <main className="landing sky-scene scene-day mobile-gate">
      <div className="ambient-lines" />
      <section className="landing-shell mobile-gate-shell">
        <header className="landing-nav">
          <BrandMark />
          <span className="privacy-pill"><ShieldCheck size={14} /> Local only</span>
        </header>
        <div className="mobile-gate-panel glass-panel">
          <h1>Come back on <em>desktop</em></h1>
          <p>This sound studio does not operate on mobile devices. Open this page on a computer with Chrome or Edge.</p>
        </div>
        <footer className="landing-footer"><span>{APP_NOTICE}</span><span>Chrome &amp; Edge desktop</span></footer>
      </section>
    </main>
  );
}
