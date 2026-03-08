export async function copyText(value: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error("Texte vide.");
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Copie indisponible.");
  }

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalizedValue);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = normalizedValue;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, normalizedValue.length);

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copie impossible.");
  }
}
