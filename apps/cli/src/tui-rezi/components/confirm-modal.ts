import { ui, type VNode } from "@rezi-ui/core";
import { t } from "../../i18n/index.js";
import type { ConfirmView } from "../types.js";
import { col } from "../colors.js";

export function renderConfirmModal(
  confirm: ConfirmView,
  onChoice: (choice: "accept" | "background" | "cancel") => void,
): VNode {
  const model = confirm.kind === "model-download";
  const actions: VNode[] = [
    ui.button({
      id: "confirm-yes",
      label: model ? `⇩  ${confirm.confirmLabel}  [Enter]` : `${confirm.confirmLabel}  [Enter]`,
      accessibleLabel: `${confirm.confirmLabel}, Enter`,
      dsVariant: "solid",
      dsTone: model ? "primary" : "default",
      onPress: () => onChoice("accept"),
    }),
  ];
  if (confirm.backgroundLabel) {
    actions.push(ui.button({
      id: "confirm-bg",
      label: `☁  ${confirm.backgroundLabel}  [B]`,
      accessibleLabel: `${confirm.backgroundLabel}, B`,
      dsVariant: "soft",
      onPress: () => onChoice("background"),
    }));
  }
  actions.push(ui.button({
    id: "confirm-no",
    label: `⊗  ${confirm.cancelLabel}  [Esc]`,
    accessibleLabel: `${confirm.cancelLabel}, Escape`,
    dsVariant: "ghost",
    onPress: () => onChoice("cancel"),
  }));

  const content = ui.column({ gap: 1, align: "center" }, [
    model
      ? ui.text(`⇩  ${t("rezi.confirm.modelMissing")}`, {
          style: { fg: col.warning, bold: true },
        })
      : ui.text(""),
    ui.text(confirm.body, {
      style: { fg: col.secondary },
      wrap: true,
    }),
    model
      ? ui.text(t("rezi.confirm.modelOptional"), {
          style: { fg: col.muted },
          wrap: true,
        })
      : ui.text(""),
  ]);

  return ui.modal({
    id: `confirm-modal-${confirm.id}`,
    title: confirm.title,
    content,
    actions,
    width: "full",
    maxWidth: 72,
    minWidth: 34,
    backdrop: { variant: "dim", pattern: "░" },
    closeOnBackdrop: false,
    closeOnEscape: true,
    onClose: () => onChoice("cancel"),
    initialFocus: "confirm-yes",
    frameStyle: {
      background: col.elevatedBg,
      foreground: col.primary,
      border: model ? col.warning : col.accent,
    },
  });
}
