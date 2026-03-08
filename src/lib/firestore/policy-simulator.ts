import { FIRESTORE_COLLECTIONS } from "@/lib/firestore/schema";

type Actor = "owner" | "anonymous" | "authenticatedNonOwner";
type Operation = "get" | "list" | "create" | "update" | "delete";
type Resource =
  | "conversation"
  | "message"
  | "status"
  | "draft"
  | "settings";

type PolicyContext = {
  actor: Actor;
  operation: Operation;
  resource: Resource;
  ownerIsBootstrapped?: boolean;
  conversationIsActive?: boolean;
  statusIsLive?: boolean;
  messageSender?: "client" | "owner" | "ai";
};

export type PolicyScenarioResult = {
  id: string;
  label: string;
  expected: boolean;
  actual: boolean;
  passed: boolean;
};

function isOwner(actor: Actor): boolean {
  return actor === "owner";
}

function canAccess(context: PolicyContext): boolean {
  if (isOwner(context.actor)) {
    return context.resource === "status"
      ? context.operation === "get" || context.operation === "list"
        ? Boolean(context.statusIsLive)
        : false
      : false;
  }

  if (context.actor === "authenticatedNonOwner") {
    if (context.resource === "status") {
      return context.operation === "get" || context.operation === "list"
        ? Boolean(context.statusIsLive)
        : false;
    }

    return false;
  }

  switch (context.resource) {
    case "status":
      return (
        (context.operation === "get" || context.operation === "list") &&
        context.statusIsLive === true
      );
    case "draft":
    case "settings":
      return false;
    default:
      return false;
  }
}

export function getPolicyScenarioResults(): PolicyScenarioResult[] {
  const scenarios: Array<{
    id: string;
    label: string;
    expected: boolean;
    context: PolicyContext;
  }> = [
    {
      id: "owner-manages-drafts",
      label: "Le proprietaire ne passe plus par des rules Firestore directes pour ses brouillons.",
      expected: false,
      context: {
        actor: "owner",
        operation: "update",
        resource: "draft",
      },
    },
    {
      id: "anonymous-cannot-read-conversations",
      label: "Un client anonyme ne peut jamais lire une conversation.",
      expected: false,
      context: {
        actor: "anonymous",
        operation: "get",
        resource: "conversation",
      },
    },
    {
      id: "anonymous-cannot-create-conversation-directly",
      label: "Un client anonyme ne peut pas ouvrir une conversation directement via Firestore.",
      expected: false,
      context: {
        actor: "anonymous",
        operation: "create",
        resource: "conversation",
        ownerIsBootstrapped: true,
      },
    },
    {
      id: "anonymous-cannot-create-conversation-without-backend",
      label: "Un client anonyme ne peut pas creer une conversation sans backend, meme si l owner existe.",
      expected: false,
      context: {
        actor: "anonymous",
        operation: "create",
        resource: "conversation",
        ownerIsBootstrapped: false,
      },
    },
    {
      id: "anonymous-cannot-post-client-message-directly",
      label: "Un client anonyme ne peut pas poster un message directement via Firestore.",
      expected: false,
      context: {
        actor: "anonymous",
        operation: "create",
        resource: "message",
        conversationIsActive: true,
        messageSender: "client",
      },
    },
    {
      id: "anonymous-cannot-post-owner-message",
      label: "Un client anonyme ne peut pas usurper un message owner ou AI.",
      expected: false,
      context: {
        actor: "anonymous",
        operation: "create",
        resource: "message",
        conversationIsActive: true,
        messageSender: "owner",
      },
    },
    {
      id: "anonymous-cannot-post-on-archived-conversation",
      label: "Un client anonyme ne peut pas ecrire dans une conversation archivee.",
      expected: false,
      context: {
        actor: "anonymous",
        operation: "create",
        resource: "message",
        conversationIsActive: false,
        messageSender: "client",
      },
    },
    {
      id: "public-can-read-live-status",
      label: "Le public peut lire un statut encore actif.",
      expected: true,
      context: {
        actor: "anonymous",
        operation: "get",
        resource: "status",
        statusIsLive: true,
      },
    },
    {
      id: "public-cannot-read-expired-status",
      label: "Le public ne peut pas lire un statut expire.",
      expected: false,
      context: {
        actor: "anonymous",
        operation: "get",
        resource: "status",
        statusIsLive: false,
      },
    },
    {
      id: "non-owner-cannot-read-settings",
      label: "Un utilisateur authentifie non owner ne peut pas lire les settings.",
      expected: false,
      context: {
        actor: "authenticatedNonOwner",
        operation: "get",
        resource: "settings",
      },
    },
  ];

  return scenarios.map((scenario) => {
    const actual = canAccess(scenario.context);

    return {
      id: scenario.id,
      label: scenario.label,
      expected: scenario.expected,
      actual,
      passed: scenario.expected === actual,
    };
  });
}

export function getPolicySummary() {
  const scenarios = getPolicyScenarioResults();

    return {
      rulesTargetCollections: [
        FIRESTORE_COLLECTIONS.conversations,
        `${FIRESTORE_COLLECTIONS.conversations}/{conversationId}/${FIRESTORE_COLLECTIONS.messages}`,
        FIRESTORE_COLLECTIONS.statuses,
        FIRESTORE_COLLECTIONS.drafts,
        FIRESTORE_COLLECTIONS.settings,
        FIRESTORE_COLLECTIONS.ownerSecurity,
        FIRESTORE_COLLECTIONS.clientAccessSessions,
        FIRESTORE_COLLECTIONS.chatAssets,
        FIRESTORE_COLLECTIONS.securityBuckets,
      ],
    scenarios,
    allPassed: scenarios.every((scenario) => scenario.passed),
  };
}
