"use client";

import type { ChangeEvent } from "react";
import { Bell, LoaderCircle, MoreVertical, ShieldCheck } from "lucide-react";

import OwnerLogoutButton from "@/components/owner/owner-logout-button";
import type { ChatConversationRecord, ChatMessageRecord } from "@/lib/chat";

type ConversationReportData = {
  startDateKey: string;
  endDateKey: string;
  messages: ChatConversationRecord["messages"];
  stats: {
    total: number;
    client: number;
    owner: number;
    ai: number;
  };
  highlights: {
    firstClientMessage: string;
    lastClientMessage: string;
    lastOwnerMessage: string;
  };
  aiAnalysis: string;
  aiSource: "openai" | "fallback";
  aiModel: string;
};

type ConversationSettingsEditor = {
  tone: string;
  personalContext: string;
  maxLength: string;
  blacklistWords: string;
  adminAccessEnabled: boolean;
  scheduleEnabled: boolean;
  scheduleStart: string;
  scheduleEnd: string;
  scheduleTimezone: string;
};

type OwnerProfileDraft = {
  displayName: string;
  jobTitle: string;
  avatarUrl: string;
  aiBusinessContext: string;
  aiAttentionKeywords: string;
};

type ReportMessageGroup = {
  label: string;
  items: ChatMessageRecord[];
};

type OwnerDashboardModalsProps = {
  showGeneralSettings: boolean;
  showConversationSettings: boolean;
  showReportRangeModal: boolean;
  showReportResultModal: boolean;
  ownerDisplayName: string;
  ownerJobTitle: string;
  profileDraft: OwnerProfileDraft;
  profileErrorMessage: string;
  profileStatusMessage: string;
  isSavingProfile: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  inboxStats: {
    threadCount: number;
    unreadMessages: number;
  };
  onCloseGeneralSettings: () => void;
  onOpenDrafts: () => void;
  onOpenStatuses: () => void;
  onEnableNotifications: () => void;
  onProfileFieldChange: (
    field: keyof OwnerProfileDraft,
    value: string,
  ) => void;
  onProfileImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSaveOwnerProfile: () => void;
  selectedConversation: ChatConversationRecord | null;
  settingsEditor: ConversationSettingsEditor | null;
  settingsErrorMessage: string;
  settingsStatusMessage: string;
  onCloseConversationSettings: () => void;
  onAiModeChange: (mode: ChatConversationRecord["aiMode"]) => void;
  onSettingsFieldChange: (
    field: keyof ConversationSettingsEditor,
    value: string | boolean,
  ) => void;
  onOpenReportPicker: () => void;
  onSaveConversationSettings: () => void;
  availableReportDateOptions: Array<{
    value: string;
    label: string;
  }>;
  reportStartDateKey: string;
  reportEndDateKey: string;
  reportErrorMessage: string;
  isGeneratingReport: boolean;
  onCloseReportRangeModal: () => void;
  onReportStartDateChange: (nextValue: string) => void;
  onReportEndDateChange: (nextValue: string) => void;
  onGenerateConversationReport: () => void;
  reportData: ConversationReportData | null;
  reportStartDateLabel: string;
  reportEndDateLabel: string;
  reportMessageGroups: ReportMessageGroup[];
  onCloseReportResultModal: () => void;
};

function formatBubbleTime(timestamp: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "TV";
  }

  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function getReadableMessageContent(message: ChatMessageRecord) {
  if (message.kind === "voice") {
    return message.transcript.trim() || "Message vocal";
  }

  if (message.kind === "image") {
    return message.content.trim() || "Photo envoyee";
  }

  if (message.kind === "video") {
    return message.content.trim() || "Video envoyee";
  }

  if (message.kind === "file") {
    return message.content.trim() || message.fileName || "Fichier joint";
  }

  return message.content.trim();
}

export default function OwnerDashboardModals({
  showGeneralSettings,
  showConversationSettings,
  showReportRangeModal,
  showReportResultModal,
  ownerDisplayName,
  ownerJobTitle,
  profileDraft,
  profileErrorMessage,
  profileStatusMessage,
  isSavingProfile,
  notificationPermission,
  inboxStats,
  onCloseGeneralSettings,
  onOpenDrafts,
  onOpenStatuses,
  onEnableNotifications,
  onProfileFieldChange,
  onProfileImageUpload,
  onSaveOwnerProfile,
  selectedConversation,
  settingsEditor,
  settingsErrorMessage,
  settingsStatusMessage,
  onCloseConversationSettings,
  onAiModeChange,
  onSettingsFieldChange,
  onOpenReportPicker,
  onSaveConversationSettings,
  availableReportDateOptions,
  reportStartDateKey,
  reportEndDateKey,
  reportErrorMessage,
  isGeneratingReport,
  onCloseReportRangeModal,
  onReportStartDateChange,
  onReportEndDateChange,
  onGenerateConversationReport,
  reportData,
  reportStartDateLabel,
  reportEndDateLabel,
  reportMessageGroups,
  onCloseReportResultModal,
}: OwnerDashboardModalsProps) {
  return (
    <>
      {showGeneralSettings ? (
        <div className="absolute inset-0 z-20 flex items-start justify-end bg-black/55 px-3 py-3 backdrop-blur-sm">
          <div className="hide-scrollbar max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[1.3rem] border border-white/10 bg-[#111b21]/96 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Parametres generaux
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-100">
                  {ownerDisplayName}
                </p>
                <p className="mt-1 text-xs text-slate-400">{ownerJobTitle}</p>
              </div>
              <button
                type="button"
                onClick={onCloseGeneralSettings}
                className="inline-flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Fermer"
              >
                <MoreVertical className="size-4.5 rotate-90" />
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={onEnableNotifications}
                disabled={notificationPermission === "unsupported"}
                className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  <Bell className="size-4 text-slate-300" />
                  {notificationPermission === "granted"
                    ? "Notifications actives"
                    : notificationPermission === "unsupported"
                      ? "Notifications indisponibles"
                      : "Activer les notifications"}
                </span>
              </button>
              <button
                type="button"
                onClick={onOpenDrafts}
                className="rounded-xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.07]"
              >
                Brouillons prives
              </button>
              <button
                type="button"
                onClick={onOpenStatuses}
                className="rounded-xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.07]"
              >
                Statues
              </button>
              <a
                href="/api/owner/system/hardening-report"
                className="inline-flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.07]"
              >
                Rapport de securite
                <ShieldCheck className="size-4 text-emerald-200" />
              </a>
            </div>

            <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.04] px-4 py-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                Profil public
              </p>

              <div className="mt-4 flex items-center gap-3">
                {profileDraft.avatarUrl ? (
                  <img
                    src={profileDraft.avatarUrl}
                    alt={profileDraft.displayName || ownerDisplayName}
                    className="size-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="inline-flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-700 text-sm font-semibold text-white">
                    {getInitials(profileDraft.displayName || ownerDisplayName)}
                  </div>
                )}

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {profileDraft.displayName || ownerDisplayName}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {profileDraft.jobTitle || ownerJobTitle}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Nom
                  </span>
                  <input
                    type="text"
                    value={profileDraft.displayName}
                    onChange={(event) =>
                      onProfileFieldChange("displayName", event.target.value)
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                    placeholder="Ton nom public"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Metier
                  </span>
                  <input
                    type="text"
                    value={profileDraft.jobTitle}
                    onChange={(event) =>
                      onProfileFieldChange("jobTitle", event.target.value)
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                    placeholder="Ex: Consultant, Entrepreneur"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Upload image profil
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onProfileImageUpload}
                    className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Image profil (URL)
                  </span>
                  <input
                    type="url"
                    value={profileDraft.avatarUrl}
                    onChange={(event) =>
                      onProfileFieldChange("avatarUrl", event.target.value)
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                    placeholder="https://..."
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Contexte global IA
                  </span>
                  <textarea
                    value={profileDraft.aiBusinessContext}
                    onChange={(event) =>
                      onProfileFieldChange("aiBusinessContext", event.target.value)
                    }
                    className="min-h-28 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                    placeholder="Explique ici qui tu es, ce que tu fais, tes services, ton style de travail, ce que l IA doit savoir pour repondre globalement."
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Mots cles sensibles IA
                  </span>
                  <input
                    type="text"
                    value={profileDraft.aiAttentionKeywords}
                    onChange={(event) =>
                      onProfileFieldChange("aiAttentionKeywords", event.target.value)
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                    placeholder="prix, devis, tarif, paiement"
                  />
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Si un client utilise un de ces mots cles, l IA s arrete et attend ton contexte manuel avant de repondre.
                  </p>
                </label>
              </div>

              {profileErrorMessage ? (
                <p className="mt-3 rounded-xl bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
                  {profileErrorMessage}
                </p>
              ) : null}

              {profileStatusMessage ? (
                <p className="mt-3 rounded-xl bg-emerald-500/12 px-4 py-3 text-sm text-emerald-100">
                  {profileStatusMessage}
                </p>
              ) : null}

              <button
                type="button"
                onClick={onSaveOwnerProfile}
                disabled={isSavingProfile}
                className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#005c4b] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0a6d59] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingProfile ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                Enregistrer le profil
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                Resume
              </p>
              <p className="mt-2 text-sm text-slate-300">
                {inboxStats.threadCount} conversations • {inboxStats.unreadMessages} messages non lus
              </p>
            </div>

            <div className="mt-5">
              <OwnerLogoutButton />
            </div>
          </div>
        </div>
      ) : null}

      {showConversationSettings && selectedConversation && settingsEditor ? (
        <div className="absolute inset-0 z-30 flex items-start justify-end bg-black/55 px-3 py-3 backdrop-blur-sm">
          <div className="hide-scrollbar h-full w-full max-w-xl overflow-y-auto rounded-[1.3rem] border border-white/10 bg-[#111b21]/96 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Parametres contact
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-100">
                  {selectedConversation.clientName}
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseConversationSettings}
                className="inline-flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Fermer"
              >
                <MoreVertical className="size-4.5 rotate-90" />
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {(["off", "suggestion", "auto"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onAiModeChange(mode)}
                  className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                    selectedConversation.aiMode === mode
                      ? "bg-emerald-500/18 text-emerald-200"
                      : "bg-white/[0.05] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200"
                  }`}
                >
                  IA {mode}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Ton IA
                </span>
                <input
                  type="text"
                  value={settingsEditor.tone}
                  onChange={(event) => onSettingsFieldChange("tone", event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Contexte discussion
                </span>
                <textarea
                  value={settingsEditor.personalContext}
                  onChange={(event) =>
                    onSettingsFieldChange("personalContext", event.target.value)
                  }
                  className="min-h-28 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                  placeholder="Informations specifiques a ce client: projet en cours, budget, historique, contraintes, ton a adopter..."
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Longueur max
                  </span>
                  <input
                    type="number"
                    min={80}
                    max={600}
                    value={settingsEditor.maxLength}
                    onChange={(event) =>
                      onSettingsFieldChange("maxLength", event.target.value)
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/35"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Fuseau
                  </span>
                  <input
                    type="text"
                    value={settingsEditor.scheduleTimezone}
                    onChange={(event) =>
                      onSettingsFieldChange("scheduleTimezone", event.target.value)
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Blacklist mots
                </span>
                <input
                  type="text"
                  value={settingsEditor.blacklistWords}
                  onChange={(event) =>
                    onSettingsFieldChange("blacklistWords", event.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/35"
                />
              </label>

              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <label className="flex items-center gap-3 text-sm font-medium text-slate-200">
                  <input
                    type="checkbox"
                    checked={settingsEditor.adminAccessEnabled}
                    onChange={(event) =>
                      onSettingsFieldChange("adminAccessEnabled", event.target.checked)
                    }
                    className="size-4 rounded border-white/10 bg-transparent"
                  />
                  Autoriser cet utilisateur a acceder a la page owner
                </label>
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <label className="flex items-center gap-3 text-sm font-medium text-slate-200">
                  <input
                    type="checkbox"
                    checked={settingsEditor.scheduleEnabled}
                    onChange={(event) =>
                      onSettingsFieldChange("scheduleEnabled", event.target.checked)
                    }
                    className="size-4 rounded border-white/10 bg-transparent"
                  />
                  Activer les horaires du mode auto
                </label>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Debut
                    </span>
                    <input
                      type="time"
                      value={settingsEditor.scheduleStart}
                      disabled={!settingsEditor.scheduleEnabled}
                      onChange={(event) =>
                        onSettingsFieldChange("scheduleStart", event.target.value)
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none disabled:opacity-50"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Fin
                    </span>
                    <input
                      type="time"
                      value={settingsEditor.scheduleEnd}
                      disabled={!settingsEditor.scheduleEnabled}
                      onChange={(event) =>
                        onSettingsFieldChange("scheduleEnd", event.target.value)
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none disabled:opacity-50"
                    />
                  </label>
                </div>
              </div>

              {settingsErrorMessage ? (
                <p className="rounded-xl bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
                  {settingsErrorMessage}
                </p>
              ) : null}

              {settingsStatusMessage ? (
                <p className="rounded-xl bg-emerald-500/12 px-4 py-3 text-sm text-emerald-100">
                  {settingsStatusMessage}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onOpenReportPicker}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.08]"
                >
                  Rapport
                </button>

                <button
                  type="button"
                  onClick={onSaveConversationSettings}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[#005c4b] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0a6d59]"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showReportRangeModal && selectedConversation ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[1.3rem] border border-white/10 bg-[#111b21]/96 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Rapport discussion
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-100">
                  {selectedConversation.clientName}
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseReportRangeModal}
                className="inline-flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Fermer"
              >
                <MoreVertical className="size-4.5 rotate-90" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Du
                </span>
                <select
                  value={reportStartDateKey}
                  onChange={(event) => onReportStartDateChange(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/35"
                >
                  {availableReportDateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Au
                </span>
                <select
                  value={reportEndDateKey}
                  onChange={(event) => onReportEndDateChange(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/35"
                >
                  {availableReportDateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Selectionne uniquement des dates qui existent deja dans cette discussion.
            </p>

            {reportErrorMessage ? (
              <p className="mt-4 rounded-xl bg-rose-500/12 px-4 py-3 text-sm text-rose-100">
                {reportErrorMessage}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onCloseReportRangeModal}
                className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/[0.08]"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={onGenerateConversationReport}
                disabled={isGeneratingReport}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#005c4b] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0a6d59] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGeneratingReport ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {isGeneratingReport ? "Analyse..." : "Valider"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showReportResultModal && selectedConversation && reportData ? (
        <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/60 px-4 py-4 backdrop-blur-sm">
          <div className="hide-scrollbar max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded-[1.3rem] border border-white/10 bg-[#111b21]/96 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Rapport complet
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-100">
                  {selectedConversation.clientName}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Du {reportStartDateLabel} au {reportEndDateLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseReportResultModal}
                className="inline-flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Fermer"
              >
                <MoreVertical className="size-4.5 rotate-90" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-4 rounded-xl border border-emerald-400/12 bg-emerald-500/8 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
                    Analyse IA
                  </p>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                    {reportData.aiSource} • {reportData.aiModel || "analyse locale"}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                  {reportData.aiAnalysis || "Aucune analyse disponible."}
                </p>
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Total
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-100">
                  {reportData.stats.total}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Client
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-100">
                  {reportData.stats.client}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Toi
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-100">
                  {reportData.stats.owner}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  IA
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-100">
                  {reportData.stats.ai}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Premier message client
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                  {reportData.highlights.firstClientMessage || "Aucun message client."}
                </p>
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Dernier message client
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                  {reportData.highlights.lastClientMessage || "Aucun message client."}
                </p>
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Derniere reponse envoyee
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                  {reportData.highlights.lastOwnerMessage || "Aucune reponse envoyee."}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Chronologie complete
              </p>

              <div className="mt-4 space-y-5">
                {reportMessageGroups.map((group) => (
                  <div key={group.label}>
                    <div className="mb-4 flex justify-center">
                      <span className="rounded-full bg-black/20 px-3 py-1 text-[11px] font-semibold text-slate-300 backdrop-blur-sm">
                        {group.label}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {group.items.map((message) => {
                        const isOwnerMessage =
                          message.sender === "owner" || message.sender === "ai";

                        return (
                          <div
                            key={message.id}
                            className={`flex ${isOwnerMessage ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[min(82%,44rem)] rounded-2xl px-4 py-3 shadow-[0_16px_36px_rgba(0,0,0,0.18)] ${
                                isOwnerMessage
                                  ? "bg-[#005c4b] text-white"
                                  : "border border-white/8 bg-[#202c33]/94 text-slate-100"
                              }`}
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                                {message.sender === "client"
                                  ? selectedConversation.clientName
                                  : ownerDisplayName}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                                {getReadableMessageContent(message)}
                              </p>
                              <p className="mt-2 text-[11px] text-white/65">
                                {formatBubbleTime(message.timestamp)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
