import { CheckCircle2 } from "lucide-react"

export default function StatusIndicator() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg w-fit">
      <CheckCircle2 className="w-5 h-5 text-emerald-600" strokeWidth={2.5} />
      <span className="text-sm font-semibold text-emerald-700">Service Active</span>
    </div>
  )
}
