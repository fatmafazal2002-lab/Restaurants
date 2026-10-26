"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, AlertCircle, X, Sparkles } from "lucide-react";
import { translateText as tx } from "@/lib/translation";
type Toast = {
  id: number;
  message: string;
  kind: "success" | "error" | "info";
};
const Context = createContext({
  notify: (_message: string, _kind: Toast["kind"] = "success") => {},
});
export const useNotifications = () => useContext(Context);
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const reduced = useReducedMotion();
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const notify = (message: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((items) => [...items.slice(-2), { id, message, kind }]);
    const timer = setTimeout(
      () => {
        timers.current.delete(timer);
        setItems((items) => items.filter((t) => t.id !== id));
      },
      kind === "error" ? 8000 : 4500,
    );
    timers.current.add(timer);
  };
  return (
    <Context.Provider value={{ notify }}>
      {children}
      <div className="notification-stack" aria-label={tx("Notifications")}>
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              role={item.kind === "error" ? "alert" : "status"}
              className={`notification notification-${item.kind}`}
              initial={reduced ? false : { opacity: 0, x: 48, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: reduced ? 0 : 48 }}
              layout={!reduced}
            >
              <span className="notification-icon">
                {item.kind === "error" ? (
                  <AlertCircle />
                ) : item.kind === "info" ? (
                  <Sparkles />
                ) : (
                  <CheckCircle2 />
                )}
              </span>
              <div>
                <strong>
                  {tx(
                    item.kind === "error"
                      ? "Action needed"
                      : item.kind === "info"
                        ? "Ready for your next step"
                        : "Step complete",
                  )}
                </strong>
                <p>{item.message}</p>
              </div>
              <button
                aria-label={tx("Dismiss notification")}
                onClick={() =>
                  setItems((all) => all.filter((t) => t.id !== item.id))
                }
              >
                <X size={16} />
              </button>
              {item.kind === "success" && (
                <span className="notification-sparks" aria-hidden="true">
                  ✦
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Context.Provider>
  );
}
export function ToastBridge({
  message,
  kind = "success",
}: {
  message: string;
  kind?: Toast["kind"];
}) {
  const { notify } = useNotifications();
  const sent = useRef("");
  useEffect(() => {
    if (message && message !== sent.current) notify(message, kind);
    sent.current = message;
  }, [message, kind, notify]);
  return null;
}
