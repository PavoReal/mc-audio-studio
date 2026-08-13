import { RefreshCw, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function UpdatePrompt({ beforeUpdate }: { beforeUpdate: () => Promise<void> }) {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update-toast" role="status">
      <RefreshCw size={17} />
      <span><strong>Studio update ready</strong><small>Your project will be saved before reload.</small></span>
      <button onClick={() => void beforeUpdate().then(() => updateServiceWorker(true))}>Update</button>
      <button className="icon-button" onClick={() => setNeedRefresh(false)} aria-label="Dismiss update"><X size={15} /></button>
    </div>
  );
}
