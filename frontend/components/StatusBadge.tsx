import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";

import type { DocumentStatus } from "@/lib/documents";

const STYLES: Record<DocumentStatus, { label: string; className: string; icon: React.ReactNode }> = {
  uploaded: {
    label: "Queued",
    className: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
    icon: <Clock size={14} />,
  },
  processing: {
    label: "Processing",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    icon: <Loader2 size={14} className="animate-spin" />,
  },
  completed: {
    label: "Indexed",
    className: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
    icon: <CheckCircle2 size={14} />,
  },
  failed: {
    label: "Failed",
    className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    icon: <AlertCircle size={14} />,
  },
};

export default function StatusBadge({ status }: { status: DocumentStatus }) {
  const { label, className, icon } = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {icon}
      {label}
    </span>
  );
}
