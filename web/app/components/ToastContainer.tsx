"use client";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import type { Toast } from "@/lib/hooks/use-toast";

const ICONS = {
    success: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
    error: <XCircle className="w-4 h-4 text-red-400 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
    info: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
};

const BORDER = {
    success: "border-emerald-500/30 bg-emerald-500/5",
    error: "border-red-500/30 bg-red-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    info: "border-blue-500/30 bg-blue-500/5",
};

export function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
    if (!toasts.length) return null;
    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
            {toasts.map(t => (
                <div
                    key={t.id}
                    className={`
            pointer-events-auto flex items-center gap-3
            px-4 py-3 rounded-xl border backdrop-blur-md
            shadow-2xl shadow-black/40
            text-sm font-semibold text-white
            animate-in slide-in-from-bottom-4 fade-in duration-200
            ${BORDER[t.type]}
          `}
                    style={{ minWidth: 280, maxWidth: 420 }}
                >
                    {ICONS[t.type]}
                    <span className="flex-1">{t.message}</span>
                    <button
                        onClick={() => dismiss(t.id)}
                        className="ml-2 text-white/30 hover:text-white/80 transition-colors shrink-0"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
}
