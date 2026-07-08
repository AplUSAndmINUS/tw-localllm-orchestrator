import agentProfilesJson from './agentProfiles.json';

export interface AgentProfile {
  agentName: string;
  description: string;
  runtime: string;
  model: string;
  endpoint?: string;
  capabilities: string[];
  costModel: string;
  healthCheck?: string;
  requiresManualLoad?: boolean;
  toolsRequired?: string[];
  fallbacks?: Record<string, string>;
  routes?: Record<string, { provider: string; model: string }>;
}

const PROFILES: Record<string, AgentProfile> = (agentProfilesJson as { agents: Record<string, AgentProfile> }).agents;

function getAgentProfile(agentName: string): AgentProfile {
  const profile = PROFILES[agentName];
  if (!profile) {
    throw new Error(`No agent profile found for "${agentName}" in agentProfiles.json`);
  }
  return profile;
}

export { getAgentProfile };
