import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { type FormEvent, useState } from "react";
import { useGoTipeI18n } from "../i18n-context";
import { normalizeHttpUrl } from "../media/links";
import { usePhantom } from "./context";
import { ContentIcon } from "./icons";

const PROVIDERS: [RegExp, string][] = [
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)vimeo\.com$/, "vimeo"],
  [/(^|\.)(twitter\.com|x\.com)$/, "twitter"],
  [/(^|\.)codepen\.io$/, "codepen"],
  [/(^|\.)figma\.com$/, "figma"],
];

/** The kind of an embed by its address, as the schema names it; any other page is generic. */
export function embedTypeOf(url: string): string {
  const host = new URL(url).hostname.toLowerCase();
  return PROVIDERS.find(([pattern]) => pattern.test(host))?.[1] ?? "generic";
}

/** The address as a person reads it: no scheme, the path decoded where it can be. */
function readable(url: URL): string {
  let path = url.pathname === "/" ? "" : url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // a malformed escape stays as it is
  }
  return `${url.host}${path}${url.search}`;
}

/**
 * An embedded page as a card — its site, its address and a way to open it (GoTipe Atlas,
 * frame 18). The library draws no third-party frames; a host that wants a player passes its own
 * block view for `embed`. Without an address the block asks for one.
 */
export function EmbedBlock({
  block,
  editor,
  rootProps = {},
}: {
  block: BlockView;
  editor: GoTipeEditor;
  rootProps?: Record<string, unknown>;
}) {
  const i18n = useGoTipeI18n();
  const readOnly = usePhantom() || !editor.isEditable;
  const url = normalizeHttpUrl(String(block.attrs.url ?? ""));
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const className = ["gotipe-embed", rootProps.className].filter(Boolean).join(" ");

  if (url) {
    const address = new URL(url);
    const open = i18n.t("embed.open");
    return (
      <div {...rootProps} data-block-type="embed" className={className} contentEditable={false}>
        <span className="gotipe-embed-icon" aria-hidden="true">
          <ContentIcon name="link" />
        </span>
        <span className="gotipe-embed-main">
          <span className="gotipe-embed-title">{address.hostname.replace(/^www\./, "")}</span>
          <span className="gotipe-embed-meta">{readable(address)}</span>
        </span>
        <a
          className="gotipe-embed-open"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={open}
          data-gotipe-widget=""
        >
          <ContentIcon name="external" />
          <span className="gotipe-tip" aria-hidden="true">
            {open}
          </span>
        </a>
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = normalizeHttpUrl(draft);
    // a wrong address marks the field itself, no line under it
    if (!next) return setInvalid(true);
    editor
      .chain()
      .setBlockAttrs(block.id, { url: next, type: embedTypeOf(next) })
      .run();
  };
  return (
    <div {...rootProps} data-block-type="embed" className={className} contentEditable={false}>
      <span className="gotipe-embed-icon" aria-hidden="true">
        <ContentIcon name="link" />
      </span>
      <form className="gotipe-embed-form" onSubmit={submit} noValidate data-gotipe-widget="">
        <input
          className="gotipe-embed-field"
          type="url"
          inputMode="url"
          value={draft}
          placeholder={i18n.t("embed.placeholder")}
          aria-label={i18n.t("embed.address")}
          aria-invalid={invalid || undefined}
          disabled={readOnly}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
        />
        <button type="submit" className="gotipe-embed-submit" disabled={readOnly || !draft.trim()}>
          {i18n.t("embed.submit")}
        </button>
      </form>
    </div>
  );
}
