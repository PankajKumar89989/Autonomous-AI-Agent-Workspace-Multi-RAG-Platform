import Link from "next/link";

import AgentForm from "@/components/AgentForm";

export default function NewAgentPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/agents" className="text-sm text-stone-600 hover:underline dark:text-stone-400">Agents</Link>
        <h1 className="mt-1 text-2xl font-bold">New agent</h1>
      </div>
      <AgentForm />
    </div>
  );
}
