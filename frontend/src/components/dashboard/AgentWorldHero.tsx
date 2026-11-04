/** A compact "agent world" strip for the top of a dashboard page: Sage plus a few other agents
 * idling at their desks, with a greeting speech bubble — the same `AgentDesk` building block the
 * Landing hero and AI Assistant workroom use, just smaller and quieter, so every page keeps an
 * "agent presence" per the brief rather than only the 3 pages built so far. */
import { useEffect, useState } from "react";

import { useAuthStore } from "../../store/authStore";
import AgentDesk from "../../three/AgentDesk";
import Scene from "../../three/Scene";
import Panel from "../ui/Panel";

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function AgentWorldHero({ subtitle }: { subtitle?: string }) {
  const user = useAuthStore((s) => s.user);
  const [bubble, setBubble] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setBubble(false), 4000);
    return () => clearTimeout(timeout);
  }, []);

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const greeting = `${timeOfDayGreeting()}, ${firstName}${subtitle ? ` — ${subtitle}` : " — ready when you are."}`;

  return (
    <Panel style={{ padding: 0, overflow: "hidden", marginBottom: "var(--space-5)" }}>
      <div style={{ height: 190 }}>
        <Scene cameraPosition={[0, 0.3, 9]} fov={40}>
          <AgentDesk agentKey="supervisor" position={[0, 0.9, 1]} scale={0.6} isCore state="idle" bubble={bubble ? greeting : null} />
          <AgentDesk agentKey="it_support" position={[-2.7, 0.1, -2]} scale={0.46} state="working" />
          <AgentDesk agentKey="hr_policy" position={[2.7, 0.1, -2]} scale={0.46} state="idle" />
          <AgentDesk agentKey="action" position={[-1.4, -0.7, -4]} scale={0.4} state="idle" />
          <AgentDesk agentKey="ticketing" position={[1.4, -0.7, -4]} scale={0.4} state="idle" />
        </Scene>
      </div>
    </Panel>
  );
}
