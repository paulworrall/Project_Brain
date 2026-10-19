import { notFound } from "next/navigation";
import { PhaseComingSoon } from "@/components/features/PhaseComingSoon";
import { getPhase, isPhaseId } from "@/lib/projectPhases";

/**
 * One phase's content (the left column). Discover is rendered by the project
 * layout so it can stay mounted across tab switches, so it renders nothing
 * here. For the other phases, once one is built: set `available: true` in
 * projectPhases.ts and add its component to the lookup below.
 */
export default async function ProjectPhasePage({ params }: { params: Promise<{ phase: string }> }) {
  const { phase } = await params;
  if (!isPhaseId(phase)) {
    notFound();
  }
  if (phase === "discover") {
    return null;
  }
  // Future: const Content = PHASE_CONTENT[phase]; if (Content) return <Content />;
  return <PhaseComingSoon phase={getPhase(phase)} />;
}
