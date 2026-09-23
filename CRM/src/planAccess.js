  // Standalone CRM — subscription/plan gating removed.
  export const FEATURES = {
    CRM: "CRM",
    USER_MANAGEMENT: "USER_MANAGEMENT",
    DASHBOARD: "DASHBOARD",
  };

  export function hasFeature() {
    return true;
  }

  export function getPlanLabel() {
    return "Pro"; // no plan system in standalone CRM, hide upgrade prompts
  }
