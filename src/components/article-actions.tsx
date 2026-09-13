"use client";

import { useState, useTransition } from "react";
import { toggleSave } from "@/app/saved/actions";
import { setInterest, toggleLike } from "@/app/article/actions";
import { t, type Lang, type UiStringKey } from "@/config/ui-strings";
import type { Interest } from "@/lib/reactions";

interface ActionState {
  liked: boolean;
  interest: Interest | null;
  saved: boolean;
}

/** 20px stroke icons, sized to the text they sit beside. */
const ICONS: Record<string, React.ReactNode> = {
  like: <path d="M12 20.5 4.8 13.3a4.5 4.5 0 0 1 6.4-6.3l.8.8.8-.8a4.5 4.5 0 1 1 6.4 6.3z" />,
  interested: <path d="M7 21V10m0 0 4-7a2 2 0 0 1 3 2l-1 5h5a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 16.6 21z" />,
  notInterested: <path d="M17 3v11m0 0-4 7a2 2 0 0 1-3-2l1-5H6a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 7.4 3z" />,
  save: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" />,
};

function ActionButton({
  icon,
  label,
  active,
  filled,
  pending,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  filled?: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs transition-all duration-200 disabled:opacity-50 ${
        active
          ? "text-accent bg-accent-soft"
          : "text-muted hover:text-foreground hover:bg-surface-hover"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-[18px] h-[18px] transition-transform duration-200 group-active:scale-90"
        fill={active && filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icon}
      </svg>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * One row, four actions, shared by the feed card and the reader page.
 *
 * Everyone can use them — there are no accounts, so there is no signed-out
 * state to gate. State flips locally on click and the server action revalidates
 * behind it, so the row never sits wrong during the round trip.
 */
export function ArticleActions({
  articleId,
  lang,
  initial,
}: {
  articleId: string;
  lang: Lang;
  initial: ActionState;
}) {
  const [state, setState] = useState<ActionState>(initial);
  const [pending, startTransition] = useTransition();

  function act(update: Partial<ActionState>, run: () => Promise<void>) {
    setState((prev) => ({ ...prev, ...update }));
    startTransition(() => run());
  }

  const label = (key: UiStringKey) => t(key, lang);

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      <ActionButton
        icon={ICONS.like}
        label={label(state.liked ? "action.liked" : "action.like")}
        active={state.liked}
        filled
        pending={pending}
        onClick={() => act({ liked: !state.liked }, () => toggleLike(articleId))}
      />
      <ActionButton
        icon={ICONS.interested}
        label={label("action.interested")}
        active={state.interest === "interested"}
        pending={pending}
        onClick={() =>
          act(
            { interest: state.interest === "interested" ? null : "interested" },
            () => setInterest(articleId, "interested")
          )
        }
      />
      <ActionButton
        icon={ICONS.notInterested}
        label={label("action.notInterested")}
        active={state.interest === "not-interested"}
        pending={pending}
        onClick={() =>
          act(
            { interest: state.interest === "not-interested" ? null : "not-interested" },
            () => setInterest(articleId, "not-interested")
          )
        }
      />
      <ActionButton
        icon={ICONS.save}
        label={label(state.saved ? "action.saved" : "action.save")}
        active={state.saved}
        filled
        pending={pending}
        onClick={() => act({ saved: !state.saved }, () => toggleSave(articleId))}
      />
    </div>
  );
}
